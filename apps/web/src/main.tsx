import React,{useEffect,useMemo,useState} from "react";
import {createRoot} from "react-dom/client";
import {LineChart,Line,XAxis,YAxis,Tooltip,ResponsiveContainer,BarChart,Bar,CartesianGrid} from "recharts";
import type {Analysis,Tick} from "@deriv-insight/shared";
import "./styles.css";

const windows=[25,50,100,250,500,1000];
const marketTabs=["Overview","Even/Odd","Rise/Fall","Over/Under","Matches/Differs","Digits","Patterns","Backtest"];
function lastDigit(q:number){return Number(String(q).replace(/\D/g,"").at(-1)||0)}
function App(){
 const [symbol,setSymbol]=useState("1HZ100V"),[window,setWindow]=useState(100),[ticks,setTicks]=useState<Tick[]>([]),
 [analysis,setAnalysis]=useState<Analysis|null>(null),[status,setStatus]=useState("Connecting"),[symbols,setSymbols]=useState<string[]>([]),
 [market,setMarket]=useState("Overview"),[notice,setNotice]=useState("");
 useEffect(()=>{fetch("/api/symbols").then(r=>r.ok?r.json():[]).then(a=>setSymbols(a.map((x:any)=>x.underlying_symbol||x.symbol||x.display_name).filter(Boolean).slice(0,120))).catch(()=>{});},[]);
 useEffect(()=>{setStatus("Connecting");const proto=location.protocol==="https:"?"wss":"ws";const ws=new WebSocket(`${proto}://${location.host}/ws?symbol=${encodeURIComponent(symbol)}`);
  ws.onopen=()=>setStatus("Connected");ws.onclose=()=>setStatus("Reconnecting…");
  ws.onerror=()=>setStatus("Connection error");
  ws.onmessage=e=>{const m=JSON.parse(e.data);if(m.type==="snapshot"){setTicks(m.ticks);setAnalysis(m.analysis)}else if(m.type==="tick"){setTicks(x=>[...x,m.tick].slice(-1000));setAnalysis(m.analysis)}};
  return()=>ws.close();
 },[symbol]);
 useEffect(()=>{if("serviceWorker"in navigator) navigator.serviceWorker.register("/sw.js").catch(()=>{})},[]);
 const view=useMemo(()=>ticks.slice(-window),[ticks,window]);
 const digits=analysis?Array.from({length:10},(_,d)=>({digit:d,pct:analysis.digitPercent[d]||0})):[];

 const action=(name:string)=>{setMarket(name);setNotice(name==="Backtest"?"Backtesting UI is prepared for historical tick datasets; connect a dataset and rule before treating results as meaningful.":"")};
 return <div className="app">
  <header><div><h1>Deriv Insight</h1><span>Real-time statistical decision support · no guaranteed predictions</span></div><div className={"status "+status.toLowerCase().replaceAll(" ","-")}>{status}</div></header>
  <nav className="tabs">{marketTabs.map(x=><button className={market===x?"active":""} onClick={()=>action(x)} key={x}>{x}</button>)}</nav>
  {notice&&<div className="notice">{notice}</div>}
  <div className="layout">
   <aside className="controls">
    <h3>Market controls</h3>
    <label>Symbol<select value={symbol} onChange={e=>setSymbol(e.target.value)}>{(symbols.length?symbols:["1HZ10V","1HZ25V","1HZ50V","1HZ75V","1HZ100V","R_10","R_25","R_50","R_75","R_100"]).map(s=><option key={s} value={s}>{s}</option>)}</select></label>
    <label>Analysis window<select value={window} onChange={e=>setWindow(+e.target.value)}>{windows.map(w=><option key={w} value={w}>{w} ticks</option>)}</select></label>
    <div className="chips">{["Min confidence","Anomaly","Streaks","Frequency shift"].map(x=><button key={x} onClick={()=>setNotice(`${x} filter can be applied to the current analytical view.`)}>{x}</button>)}</div>
    <p className="muted">Data is recalculated as ticks arrive. Small samples are explicitly treated as uncertain.</p>
   </aside>
   <main>
    <section className="cards"><Card t="Live price" v={view.at(-1)?.quote?.toString()||"—"}/><Card t="Last digit" v={view.length?String(lastDigit(view.at(-1)!.quote)):"—"}/><Card t="Sample" v={String(view.length)}/><Card t="Regime" v={analysis?.regime||"—"}/></section>
    <Panel title={`${market} · tick price`}><ResponsiveContainer width="100%" height={280}><LineChart data={view.map((t,i)=>({i,price:t.quote}))}><CartesianGrid strokeDasharray="3 3"/><XAxis dataKey="i"/><YAxis domain={["auto","auto"]}/><Tooltip/><Line type="monotone" dataKey="price" dot={false}/></LineChart></ResponsiveContainer></Panel>
    <section className="two"><Panel title="Probability dashboard"><Stats a={analysis}/></Panel><Panel title="Digit frequency"><ResponsiveContainer width="100%" height={260}><BarChart data={digits}><XAxis dataKey="digit"/><YAxis/><Tooltip/><Bar dataKey="pct"/></BarChart></ResponsiveContainer></Panel></section>
    <Panel title="0–9 digit heatmap"><div className="heat">{digits.map(d=><div className="cell" key={d.digit}><b>{d.digit}</b><strong>{d.pct.toFixed(1)}%</strong><small>{(d.pct-10>=0?"+":"")+(d.pct-10).toFixed(1)} vs 10%</small><em>{analysis?.longestStreak?.[d.digit%2===0?"EVEN":"ODD"]||0} max parity</em></div>)}</div></Panel>
    <Panel title="Recent tick stream"><div className="ticks">{view.slice(-30).reverse().map((t,i)=><span key={`${t.epoch}-${i}`}>{lastDigit(t.quote)} · {t.quote} · {new Date(t.epoch*1000).toLocaleTimeString()}</span>)}</div></Panel>
   </main>
   <aside>
    <Panel title="Analytical signals">{analysis?.signals.map((s,i)=><div className="signal" key={i}><b>{s.market} BIAS</b><span>{s.probability.toFixed(1)}% vs {s.expected.toFixed(1)}%</span><small>{s.confidence} · n={s.sampleSize} · dev {s.deviation.toFixed(1)}%</small></div>)||"Collecting data…"}</Panel>
    <Panel title="Risk & evidence"><p>Model confidence: <b>{analysis?.confidence||"—"}</b></p><p>Volatility: {analysis?.volatility?.toPrecision(5)||"—"}</p><p>Momentum: {analysis?.momentum?.toPrecision(5)||"—"}</p><p>Trend strength: {analysis?`${(analysis.trendStrength*100).toFixed(1)}%`:"—"}</p><p className="warning">Observed frequency ≠ future certainty. An underrepresented digit is not automatically “due”.</p></Panel>
    <Panel title="Market insight"><Insight a={analysis}/></Panel>
   </aside>
  </div>
 </div>
}
const Card=({t,v}:{t:string,v:string})=><div className="card"><small>{t}</small><b>{v}</b></div>;
const Panel=({title,children}:{title:string,children:React.ReactNode})=><section className="panel"><h2>{title}</h2>{children}</section>;
function Stats({a}:{a:Analysis|null}){if(!a)return <p>Waiting for ticks…</p>;return <div className="stats">{[["EVEN",a.evenPercent,50],["ODD",a.oddPercent,50],["RISE",a.risePercent,50],["FALL",a.fallPercent,50],["OVER",a.overPercent,50],["UNDER",a.underPercent,50],["MATCH",a.matchPercent,10],["DIFFER",a.differPercent,90]].map(([k,v,e])=><div key={k}><b>{k}</b><span>{Number(v).toFixed(1)}%</span><small>baseline {e}% · Δ {(Number(v)-Number(e)).toFixed(1)}%</small></div>)}</div>}
function Insight({a}:{a:Analysis|null}){if(!a||a.sampleSize<25)return <p>Insufficient data — collect more ticks before interpreting this pattern.</p>;const top=Object.entries(a.digitPercent).sort((x,y)=>y[1]-x[1])[0],low=Object.entries(a.digitPercent).sort((x,y)=>x[1]-y[1])[0];return <p>In the latest <b>{a.sampleSize}</b> ticks, digit <b>{top?.[0]}</b> has the highest observed frequency at <b>{Number(top?.[1]).toFixed(1)}%</b>, while digit {low?.[0]} is lowest at {Number(low?.[1]).toFixed(1)}%. The theoretical baseline is 10% per digit. This is descriptive evidence, not a guarantee of continuation or reversal. Current regime: <b>{a.regime}</b>.</p>}
createRoot(document.getElementById("root")!).render(<App/>);
