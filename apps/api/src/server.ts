import "dotenv/config";
import express from "express";
import cors from "cors";
import cookieParser from "cookie-parser";
import { pool } from "./db.js";
import { createToken, setAuthCookie, clearAuthCookie, getUserFromRequest, hashPassword, verifyPassword, passwordIsStrong, normalizeUsername, randomResetCode, hashResetCode, verifyResetCode } from "./auth.js";
import { WebSocketServer, WebSocket } from "ws";
import { analyze } from "@deriv-insight/analytics";
import type { Tick } from "@deriv-insight/shared";

const PORT=Number(process.env.PORT||process.env.API_PORT||8080);
const DERIV=process.env.DERIV_WS_URL||"wss://api.derivws.com/trading/v1/options/ws/public";
const MAX=Number(process.env.MAX_TICKS_IN_MEMORY||5000);
const app=express();
app.use(cors({origin:process.env.CORS_ORIGIN||"*"}));
app.use(express.json());
app.use(cookieParser());
const webDist = new URL("../../web/dist/", import.meta.url);
app.use(express.static(webDist.pathname));
app.use((req,res,next) => {
  if (req.path.startsWith("/api/") || req.path.startsWith("/ws") || req.method !== "GET") return next();
  res.sendFile(new URL("../../web/dist/index.html", import.meta.url).pathname);
});

const ticksBySymbol=new Map<string,Tick[]>();
let upstream:WebSocket|null=null;
let upstreamReady=false;
const clients=new Map<string,Set<WebSocket>>();

function addTick(t:Tick){
  const arr=ticksBySymbol.get(t.symbol)||[];
  if(arr.some(x=>x.epoch===t.epoch && x.quote===t.quote)) return;
  arr.push(t); arr.sort((a,b)=>a.epoch-b.epoch);
  while(arr.length>MAX) arr.shift();
  ticksBySymbol.set(t.symbol,arr);
  for(const ws of clients.get(t.symbol)||[]){
    if(ws.readyState===WebSocket.OPEN) ws.send(JSON.stringify({type:"tick",tick:t,analysis:analyze(arr.slice(-1000))}));
  }
}

function connectUpstream(){
  if(upstream && (upstream.readyState===WebSocket.OPEN||upstream.readyState===WebSocket.CONNECTING)) return;
  upstream=new WebSocket(DERIV);
  upstream.on("open",()=>{
    upstreamReady=true;
    upstream!.send(JSON.stringify({active_symbols:"brief",req_id:1}));
    for(const symbol of clients.keys()) subscribe(symbol);
  });
  upstream.on("message",(raw)=>{
    try{
      const m=JSON.parse(raw.toString());
      if(m.msg_type==="tick" && m.tick){
        const t:Tick={symbol:m.tick.symbol,epoch:Number(m.tick.epoch),quote:Number(m.tick.quote),id:m.tick.id};
        if(Number.isFinite(t.epoch)&&Number.isFinite(t.quote)) addTick(t);
      }
      if(m.msg_type==="history" && m.history){
        const s=m.echo_req?.ticks_history || m.echo_req?.ticks;
        const times=m.history.times||[];
        const prices=m.history.prices||[];
        if(s) for(let i=0;i<Math.min(times.length,prices.length);i++) addTick({symbol:s,epoch:Number(times[i]),quote:Number(prices[i])});
      }
    }catch{}
  });
  upstream.on("close",()=>{upstreamReady=false; setTimeout(connectUpstream,1500);});
  upstream.on("error",()=>{try{upstream?.close()}catch{}});
}
function send(msg:unknown){if(upstreamReady) upstream!.send(JSON.stringify(msg));}
function subscribe(symbol:string){
  send({ticks:symbol,subscribe:1,req_id:Math.floor(Math.random()*1e9)});
  if(!ticksBySymbol.has(symbol)) send({ticks_history:symbol,count:1000,end:"latest",style:"ticks",req_id:Math.floor(Math.random()*1e9)});
}


app.get("/api/auth/check-username", async (req, res) => {
  try {
    const username = normalizeUsername(String(req.query.username || ""));
    if (!/^[a-z0-9_]{3,20}$/.test(username)) {
      return res.json({ available: false, valid: false });
    }

    const result = await pool.query(
      "SELECT 1 FROM users WHERE LOWER(username) = $1 LIMIT 1",
      [username]
    );

    res.json({
      available: result.rowCount === 0,
      valid: true
    });
  } catch {
    res.status(500).json({ error: "Unable to check username" });
  }
});

app.post("/api/auth/register", async (req, res) => {
  try {
    const fullName = String(req.body.fullName || "").trim();
    const phone = String(req.body.phone || "").trim();
    const username = normalizeUsername(String(req.body.username || ""));
    const password = String(req.body.password || "");

    if (!fullName || fullName.length < 2) {
      return res.status(400).json({ error: "Enter your full name" });
    }

    if (!phone || phone.length < 7) {
      return res.status(400).json({ error: "Enter a valid phone number" });
    }

    if (!/^[a-z0-9_]{3,20}$/.test(username)) {
      return res.status(400).json({
        error: "Username must be 3–20 characters using letters, numbers or underscore"
      });
    }

    if (!passwordIsStrong(password)) {
      return res.status(400).json({
        error: "Password must contain at least 8 characters, a letter, a number and a symbol"
      });
    }

    const existing = await pool.query(
      "SELECT id FROM users WHERE LOWER(username) = $1 OR phone = $2 LIMIT 1",
      [username, phone]
    );

    if (existing.rowCount) {
      const usernameTaken = await pool.query(
        "SELECT id FROM users WHERE LOWER(username) = $1 LIMIT 1",
        [username]
      );

      return res.status(409).json({
        error: usernameTaken.rowCount
          ? "Username is already taken"
          : "Phone number is already registered"
      });
    }

    const passwordHash = await hashPassword(password);

    const result = await pool.query(
      `INSERT INTO users (full_name, phone, username, password_hash)
       VALUES ($1, $2, $3, $4)
       RETURNING id, full_name, phone, username, created_at`,
      [fullName, phone, username, passwordHash]
    );

    const user = result.rows[0];
    const token = createToken(user);
    setAuthCookie(res, token);

    res.status(201).json({ user });
  } catch (error) {
    console.error("Register error:", error);
    res.status(500).json({ error: "Registration failed" });
  }
});

app.post("/api/auth/login", async (req, res) => {
  try {
    const username = normalizeUsername(String(req.body.username || ""));
    const password = String(req.body.password || "");

    const result = await pool.query(
      `SELECT id, full_name, phone, username, password_hash, created_at
       FROM users
       WHERE LOWER(username) = $1
       LIMIT 1`,
      [username]
    );

    const user = result.rows[0];

    if (!user || !(await verifyPassword(password, user.password_hash))) {
      return res.status(401).json({
        error: "Invalid username or password"
      });
    }

    const token = createToken(user);
    setAuthCookie(res, token);

    delete user.password_hash;

    res.json({ user });
  } catch {
    res.status(500).json({ error: "Login failed" });
  }
});

app.post("/api/auth/logout", (_req, res) => {
  clearAuthCookie(res);
  res.json({ ok: true });
});

app.get("/api/auth/me", async (req, res) => {
  try {
    const user = await getUserFromRequest(req, pool);

    if (!user) {
      return res.status(401).json({ error: "Not logged in" });
    }

    res.json({ user });
  } catch {
    res.status(401).json({ error: "Not logged in" });
  }
});

app.post("/api/auth/forgot-password", async (req, res) => {
  try {
    const username = normalizeUsername(String(req.body.username || ""));
    const phone = String(req.body.phone || "").trim();

    const result = await pool.query(
      `SELECT id FROM users
       WHERE LOWER(username) = $1 AND phone = $2
       LIMIT 1`,
      [username, phone]
    );

    if (!result.rowCount) {
      return res.status(400).json({
        error: "Username and phone number do not match"
      });
    }

    const userId = result.rows[0].id;
    const code = randomResetCode();
    const codeHash = await hashResetCode(code);

    await pool.query(
      `INSERT INTO password_reset_codes
       (user_id, code_hash, expires_at)
       VALUES ($1, $2, NOW() + INTERVAL '10 minutes')`,
      [userId, codeHash]
    );

    /*
      SMS integration comes next.
      Never return the reset code in production.
      For development only, we return a flag so the UI
      can be tested without an SMS provider.
    */
    if (process.env.NODE_ENV !== "production") {
      return res.json({
        ok: true,
        developmentCode: code
      });
    }

    res.json({
      ok: true,
      message: "If the details match, a reset code will be sent."
    });
  } catch {
    res.status(500).json({ error: "Password recovery failed" });
  }
});

app.post("/api/auth/reset-password", async (req, res) => {
  try {
    const username = normalizeUsername(String(req.body.username || ""));
    const code = String(req.body.code || "").trim();
    const newPassword = String(req.body.newPassword || "");

    if (!passwordIsStrong(newPassword)) {
      return res.status(400).json({
        error: "Password must contain at least 8 characters, a letter, a number and a symbol"
      });
    }

    const userResult = await pool.query(
      `SELECT id FROM users
       WHERE LOWER(username) = $1
       LIMIT 1`,
      [username]
    );

    if (!userResult.rowCount) {
      return res.status(400).json({ error: "Invalid reset request" });
    }

    const userId = userResult.rows[0].id;

    const resetResult = await pool.query(
      `SELECT id, code_hash
       FROM password_reset_codes
       WHERE user_id = $1
         AND used = FALSE
         AND expires_at > NOW()
       ORDER BY created_at DESC
       LIMIT 1`,
      [userId]
    );

    const reset = resetResult.rows[0];

    if (!reset || !(await verifyResetCode(code, reset.code_hash))) {
      return res.status(400).json({ error: "Invalid or expired code" });
    }

    const passwordHash = await hashPassword(newPassword);

    await pool.query(
      "UPDATE users SET password_hash = $1, updated_at = NOW() WHERE id = $2",
      [passwordHash, userId]
    );

    await pool.query(
      "UPDATE password_reset_codes SET used = TRUE, used_at = NOW() WHERE id = $1",
      [reset.id]
    );

    res.json({ ok: true });
  } catch {
    res.status(500).json({ error: "Password reset failed" });
  }
});

app.get("/api/health",(_,res)=>res.json({ok:true,upstream:upstreamReady,time:Date.now()}));
app.get("/api/symbols",(_,res)=>{
  const reqId=Math.floor(Math.random()*1e9);
  const listener=(raw:Buffer)=>{try{const m=JSON.parse(raw.toString());if(m.msg_type==="active_symbols"&&m.req_id===reqId){res.json(m.active_symbols); upstream?.off("message",listener);}}catch{}};
  if(!upstreamReady){res.status(503).json({error:"Deriv upstream disconnected"});return;}
  upstream!.on("message",listener); send({active_symbols:"brief",req_id:reqId});
});
app.get("/api/history/:symbol",(req,res)=>res.json(ticksBySymbol.get(req.params.symbol)||[]));

const server=app.listen(PORT,()=>{connectUpstream();console.log(`API listening on ${PORT}`);});
const wss=new WebSocketServer({server,path:"/ws"});
wss.on("connection",(ws,req)=>{
  const url=new URL(req.url||"/ws","http://localhost");
  const symbol=url.searchParams.get("symbol")||"1HZ100V";
  if(!clients.has(symbol)) clients.set(symbol,new Set());
  clients.get(symbol)!.add(ws); subscribe(symbol);
  const arr=ticksBySymbol.get(symbol)||[];
  ws.send(JSON.stringify({type:"snapshot",symbol,ticks:arr.slice(-1000),analysis:analyze(arr.slice(-1000))}));
  ws.on("close",()=>{clients.get(symbol)?.delete(ws);});
});
