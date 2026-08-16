import "dotenv/config";
import express from "express";
import cors from "cors";
import { WebSocketServer, WebSocket } from "ws";
import { analyze } from "@deriv-insight/analytics";
import type { Tick } from "@deriv-insight/shared";

const PORT=Number(process.env.PORT||process.env.API_PORT||8080);
const DERIV=process.env.DERIV_WS_URL||"wss://api.derivws.com/trading/v1/options/ws/public";
const MAX=Number(process.env.MAX_TICKS_IN_MEMORY||5000);
const app=express();
app.use(cors({origin:process.env.CORS_ORIGIN||"*"}));
app.use(express.json());
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
