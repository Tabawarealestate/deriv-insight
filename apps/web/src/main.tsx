import React,{useEffect,useMemo,useState} from "react";
import {createRoot} from "react-dom/client";
import {LineChart,Line,XAxis,YAxis,Tooltip,ResponsiveContainer,BarChart,Bar,CartesianGrid} from "recharts";
import type {Analysis,Tick} from "@deriv-insight/shared";
import "./styles.css";

const windows=[25,50,100,250,500,1000];
const markets=[
  ["1HZ10V","Volatility 10"],
  ["1HZ25V","Volatility 25"],
  ["1HZ50V","Volatility 50"],
  ["1HZ75V","Volatility 75"],
  ["1HZ100V","Volatility 100"],
  ["R_10","Volatility 10 (1s)"],
  ["R_25","Volatility 25 (1s)"],
  ["R_50","Volatility 50 (1s)"],
  ["R_75","Volatility 75 (1s)"],
  ["R_100","Volatility 100 (1s)"]
];

function lastDigit(q:number){
  return Number(String(q).replace(/\D/g,"").at(-1)||0);
}

function pct(n:number,d:number){
  return d ? n/d*100 : 0;
}

function confidence(z:number,n:number){
  if(n<25) return "Very Low";
  if(z<1) return "Low";
  if(z<1.645) return "Moderate";
  if(z<2.33) return "High";
  return "Very High";
}

function zScore(p:number,e:number,n:number){
  if(n<=0) return 0;
  const se=Math.sqrt(e*(1-e)/n);
  return se ? (p-e)/se : 0;
}

type SimpleSignal={
  name:string;
  probability:number;
  expected:number;
  deviation:number;
  confidence:string;
  z:number;
  explanation:string;
};

function signal(name:string,p:number,expected:number,n:number):SimpleSignal{
  const z=zScore(p/100,expected/100,n);
  return {
    name,
    probability:p,
    expected,
    deviation:p-expected,
    confidence:confidence(Math.abs(z),n),
    z,
    explanation:`Observed ${p.toFixed(1)}% versus ${expected.toFixed(1)}% theoretical baseline.`
  };
}

function calculateSignals(data:Tick[],barrier:number,digit:number){
  const n=data.length;
  const digits=data.map(t=>lastDigit(t.quote));

  const even=pct(digits.filter(d=>d%2===0).length,n);
  const odd=100-even;

  let rises=0;
  for(let i=1;i<n;i++) if(data[i].quote>data[i-1].quote) rises++;
  const rise=pct(
    data.slice(1).filter((t,i)=>t.quote>data[i].quote).length,
    Math.max(0,n-1)
  );
  const fall=100-rise;

  const over=pct(digits.filter(d=>d>barrier).length,n);
  const under=pct(digits.filter(d=>d<barrier).length,n);

  const match=pct(digits.filter(d=>d===digit).length,n);
  const differ=100-match;

  return [
    signal("EVEN",even,50,n),
    signal("ODD",odd,50,n),
    signal("RISE",rise,50,n),
    signal("FALL",fall,50,n),
    signal(`OVER ${barrier}`,over,((9-barrier)/10)*100,n),
    signal(`UNDER ${barrier}`,under,(barrier/10)*100,n),
    signal(`MATCH ${digit}`,match,10,n),
    signal(`DIFFER ${digit}`,differ,90,n)
  ];
}

function App(){
 const [symbol,setSymbol]=useState("1HZ75V");
 const [window,setWindow]=useState(100);
 const [ticks,setTicks]=useState<Tick[]>([]);
 const [analysis,setAnalysis]=useState<Analysis|null>(null);
 const [status,setStatus]=useState("Connecting");
 const [symbols,setSymbols]=useState<string[]>([]);
 const [market,setMarket]=useState("Overview");
 const [barrier,setBarrier]=useState(5);
 const [digit,setDigit]=useState(7);

 useEffect(()=>{
   fetch("/api/symbols")
    .then(r=>r.ok?r.json():[])
    .then(a=>setSymbols(
      a.map((x:any)=>x.underlying_symbol||x.symbol).filter(Boolean)
    ))
    .catch(()=>{});
 },[]);

 useEffect(()=>{
   setStatus("Connecting");
   const proto=location.protocol==="https:"?"wss":"ws";
   const ws=new WebSocket(
     `${proto}://${location.host}/ws?symbol=${encodeURIComponent(symbol)}`
   );

   ws.onopen=()=>setStatus("Connected");
   ws.onclose=()=>setStatus("Reconnecting…");
   ws.onerror=()=>setStatus("Connection error");

   ws.onmessage=e=>{
     try{
       const m=JSON.parse(e.data);
       if(m.type==="snapshot"){
         setTicks(m.ticks||[]);
         setAnalysis(m.analysis||null);
       }else if(m.type==="tick"){
         setTicks(x=>[...x,m.tick].slice(-1000));
         setAnalysis(m.analysis||null);
       }
     }catch{}
   };

   return()=>ws.close();
 },[symbol]);

 useEffect(()=>{
   if("serviceWorker" in navigator){
     navigator.serviceWorker.register("/sw.js").catch(()=>{});
   }
 },[]);

 const view=useMemo(()=>ticks.slice(-window),[ticks,window]);

 const digits=useMemo(()=>{
   return Array.from({length:10},(_,d)=>{
     const count=view.filter(t=>lastDigit(t.quote)===d).length;
     return {
       digit:d,
       count,
       pct:pct(count,view.length),
       deviation:pct(count,view.length)-10
     };
   });
 },[view]);

 const signals=useMemo(
   ()=>calculateSignals(view,barrier,digit),
   [view,barrier,digit]
 );

 const strongest=useMemo(()=>{
   if(view.length<25) return null;
   return [...signals].sort((a,b)=>Math.abs(b.z)-Math.abs(a.z))[0];
 },[signals,view.length]);

 const selectedName=
   markets.find(x=>x[0]===symbol)?.[1] ||
   (symbols.includes(symbol)?symbol:"Selected market");

 return <div className="app">

  <header>
   <div>
    <h1>Deriv Insight</h1>
    <span>Statistical market decision support — no guaranteed predictions</span>
   </div>
   <div className={"status "+status.toLowerCase().replaceAll(" ","-")}>
    {status}
   </div>
  </header>

  <section className="hero">
   <div>
    <small>MARKET</small>
    <h2>{selectedName}</h2>
    <p>{symbol}</p>
   </div>
   <div>
    <small>LIVE PRICE</small>
    <strong>{view.at(-1)?.quote?.toString()||"—"}</strong>
   </div>
   <div>
    <small>LAST DIGIT</small>
    <strong>{view.length?lastDigit(view.at(-1)!.quote):"—"}</strong>
   </div>
   <div>
    <small>TICKS</small>
    <strong>{view.length}</strong>
   </div>
  </section>

  <nav className="tabs">
   {["Overview","Even/Odd","Rise/Fall","Over/Under","Matches/Differs","Digits","Patterns","Backtest"].map(x=>
    <button
      className={market===x?"active":""}
      onClick={()=>setMarket(x)}
      key={x}
    >{x}</button>
   )}
  </nav>

  <div className="layout">

   <aside className="controls">
    <h3>Market controls</h3>

    <label>
     Market
     <select value={symbol} onChange={e=>setSymbol(e.target.value)}>
      {markets.map(([s,n])=><option key={s} value={s}>{n}</option>)}
      {symbols.filter(s=>!markets.some(m=>m[0]===s)).slice(0,60).map(s=>
        <option key={s} value={s}>{s}</option>
      )}
     </select>
    </label>

    <label>
     Analysis window
     <select value={window} onChange={e=>setWindow(+e.target.value)}>
      {windows.map(w=><option key={w} value={w}>{w} ticks</option>)}
     </select>
    </label>

    <label>
     Over / Under barrier
     <select value={barrier} onChange={e=>setBarrier(+e.target.value)}>
      {Array.from({length:10},(_,d)=>
        <option key={d} value={d}>{d}</option>
      )}
     </select>
    </label>

    <label>
     Match / Differ digit
     <select value={digit} onChange={e=>setDigit(+e.target.value)}>
      {Array.from({length:10},(_,d)=>
        <option key={d} value={d}>Digit {d}</option>
      )}
     </select>
    </label>

    <div className="info">
     <b>What does this mean?</b>
     <p>Even = 0,2,4,6,8</p>
     <p>Odd = 1,3,5,7,9</p>
     <p>Over {barrier} = digit greater than {barrier}</p>
     <p>Under {barrier} = digit less than {barrier}</p>
     <p>Match {digit} = digit equals {digit}</p>
     <p>Differ {digit} = digit is not {digit}</p>
    </div>
   </aside>

   <main>

    <section className="signalHero">
     <small>🎯 CURRENT STATISTICAL SIGNAL</small>

     {strongest && view.length>=25 ? <>
       <h2>{strongest.name}</h2>
       <div className="signalNumbers">
        <b>{strongest.probability.toFixed(1)}%</b>
        <span>baseline {strongest.expected.toFixed(1)}%</span>
        <span>edge {strongest.deviation>=0?"+":""}{strongest.deviation.toFixed(1)}%</span>
       </div>
       <p>
        Evidence: <b>{strongest.confidence}</b> · sample {view.length} ticks
       </p>
       <small>{strongest.explanation}</small>
      </> : <>
       <h2>NO CLEAR SIGNAL</h2>
       <p>Collect at least 25 valid ticks before interpreting the statistics.</p>
      </>}
    </section>

    <section className="cards">
     <Card t="Live price" v={view.at(-1)?.quote?.toString()||"—"}/>
     <Card t="Last digit" v={view.length?String(lastDigit(view.at(-1)!.quote)):"—"}/>
     <Card t="Sample" v={String(view.length)}/>
     <Card t="Regime" v={analysis?.regime||"—"}/>
    </section>

    <Panel title={`${selectedName} · Tick price`}>
     <ResponsiveContainer width="100%" height={280}>
      <LineChart data={view.map((t,i)=>({i,price:t.quote}))}>
       <CartesianGrid strokeDasharray="3 3"/>
       <XAxis dataKey="i"/>
       <YAxis domain={["auto","auto"]}/>
       <Tooltip/>
       <Line type="monotone" dataKey="price" dot={false}/>
      </LineChart>
     </ResponsiveContainer>
    </Panel>

    <Panel title="All contract signals">
     <div className="signalGrid">
      {signals.map(s=>
       <div className="signalCard" key={s.name}>
        <b>{s.name}</b>
        <strong>{s.probability.toFixed(1)}%</strong>
        <span>Baseline {s.expected.toFixed(1)}%</span>
        <span>Edge {s.deviation>=0?"+":""}{s.deviation.toFixed(1)}%</span>
        <em>{s.confidence}</em>
       </div>
      )}
     </div>
    </Panel>

    <section className="two">
     <Panel title="Probability dashboard">
      <Stats signals={signals}/>
     </Panel>

     <Panel title="Digit frequency">
      <ResponsiveContainer width="100%" height={260}>
       <BarChart data={digits}>
        <XAxis dataKey="digit"/>
        <YAxis/>
        <Tooltip/>
        <Bar dataKey="pct"/>
       </BarChart>
      </ResponsiveContainer>
     </Panel>
    </section>

    <Panel title="0–9 Digit heatmap">
     <div className="heat">
      {digits.map(d=>
       <div className="cell" key={d.digit}>
        <b>{d.digit}</b>
        <strong>{d.pct.toFixed(1)}%</strong>
        <small>{d.deviation>=0?"+":""}{d.deviation.toFixed(1)} vs 10%</small>
        <em>{d.count} appearances</em>
       </div>
      )}
     </div>
    </Panel>

    <Panel title="Recent tick stream">
     <div className="ticks">
      {view.slice(-30).reverse().map((t,i)=>
       <span key={`${t.epoch}-${i}`}>
        {lastDigit(t.quote)} · {t.quote} · {new Date(t.epoch*1000).toLocaleTimeString()}
       </span>
      )}
     </div>
    </Panel>

   </main>

   <aside>

    <Panel title="Market condition">
     <p>Regime: <b>{analysis?.regime||"—"}</b></p>
     <p>Volatility: <b>{analysis?.volatility?.toPrecision(5)||"—"}</b></p>
     <p>Momentum: <b>{analysis?.momentum?.toPrecision(5)||"—"}</b></p>
     <p>Trend strength: <b>{analysis?`${(analysis.trendStrength*100).toFixed(1)}%`:"—"}</b></p>
    </Panel>

    <Panel title="Digit signals">
     <div className="digitList">
      {digits.map(d=>{
       const m=signal(`MATCH ${d.digit}`,d.pct,10,view.length);
       const diff=signal(`DIFFER ${d.digit}`,100-d.pct,90,view.length);
       return <div key={d.digit} className="digitRow">
        <b>Digit {d.digit}</b>
        <span>Match {m.probability.toFixed(1)}%</span>
        <span>Differ {diff.probability.toFixed(1)}%</span>
       </div>
      })}
     </div>
    </Panel>

    <Panel title="Risk & evidence">
     <p>Model confidence: <b>{analysis?.confidence||"—"}</b></p>
     <p>Sample size: <b>{view.length}</b></p>
     <p className="warning">
      Statistical frequency does not guarantee the next result.
      An underrepresented digit is not automatically “due”.
     </p>
    </Panel>

    <Panel title="Market insight">
     <Insight a={analysis} view={view}/>
    </Panel>

   </aside>
  </div>
 </div>
}

const Card=({t,v}:{t:string,v:string})=>
 <div className="card"><small>{t}</small><b>{v}</b></div>;

const Panel=({title,children}:{title:string,children:React.ReactNode})=>
 <section className="panel"><h2>{title}</h2>{children}</section>;

function Stats({signals}:{signals:SimpleSignal[]}){
 return <div className="stats">
  {signals.map(s=>
   <div key={s.name}>
    <b>{s.name}</b>
    <span>{s.probability.toFixed(1)}%</span>
    <small>baseline {s.expected.toFixed(1)}% · Δ {s.deviation>=0?"+":""}{s.deviation.toFixed(1)}%</small>
   </div>
  )}
 </div>
}

function Insight({a,view}:{a:Analysis|null,view:Tick[]}){
 if(!a||view.length<25)
  return <p>Insufficient data — collect more ticks before interpreting this pattern.</p>;

 const top=Object.entries(a.digitPercent).sort((x,y)=>y[1]-x[1])[0];
 const low=Object.entries(a.digitPercent).sort((x,y)=>x[1]-y[1])[0];

 return <p>
  In the latest <b>{view.length}</b> ticks, digit <b>{top?.[0]}</b>
  has the highest observed frequency at <b>{Number(top?.[1]).toFixed(1)}%</b>,
  while digit <b>{low?.[0]}</b> is lowest at <b>{Number(low?.[1]).toFixed(1)}%</b>.
  The theoretical baseline is 10% per digit. This is statistical evidence,
  not a guarantee of continuation or reversal. Current regime:
  <b>{a.regime}</b>.
 </p>
}

createRoot(document.getElementById("root")!).render(<App/>);
