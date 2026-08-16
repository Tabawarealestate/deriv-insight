import type { Analysis, Confidence, Signal, Tick } from "@deriv-insight/shared";

const clamp = (x:number,a=0,b=1)=>Math.max(a,Math.min(b,x));
const pct = (n:number,d:number)=>d ? 100*n/d : 0;

export function lastDigit(quote:number): number {
  const s = String(quote);
  const digits = s.replace(/\D/g, "");
  return Number(digits.at(-1) ?? "0");
}

function confidence(n:number, z:number): Confidence {
  if (n < 25) return "Very Low";
  if (n < 50 || z < 1) return "Low";
  if (n < 100 || z < 1.645) return "Moderate";
  if (n < 250 || z < 2.33) return "High";
  return "Very High";
}

function zScore(p:number, expected:number, n:number) {
  const se = Math.sqrt(expected * (1-expected) / Math.max(1,n));
  return se ? (p-expected)/se : 0;
}

function binaryStats(values:boolean[], labelA:string, labelB:string, expected=.5): [number,number,Signal] {
  const n=values.length, a=values.filter(Boolean).length;
  const p=n ? a/n : 0;
  const z=Math.abs(zScore(p,expected,n));
  const c=confidence(n,z);
  const signal:Signal={
    market: labelA as Signal["market"],
    probability:p*100, expected:expected*100, deviation:(p-expected)*100,
    sampleSize:n, confidence:c,
    supportingFactors:[`${labelA}: ${pct(a,n).toFixed(1)}%`, `z-score: ${z.toFixed(2)}`],
    timestamp:Date.now(), reassessAfterTicks:Math.max(10,Math.floor(n*.1))
  };
  return [p,1-p,signal];
}

export function analyze(ticks:Tick[]): Analysis {
  const data=[...ticks].sort((a,b)=>a.epoch-b.epoch);
  const n=data.length;
  const digits=Object.fromEntries(Array.from({length:10},(_,d)=>[d,0])) as Record<number,number>;
  data.forEach(t=>digits[lastDigit(t.quote)]++);
  const digitPercent=Object.fromEntries(Array.from({length:10},(_,d)=>[d,pct(digits[d],n)])) as Record<number,number>;
  const digitDeviation=Object.fromEntries(Array.from({length:10},(_,d)=>[d,digitPercent[d]-10])) as Record<number,number>;

  const even=data.map(t=>lastDigit(t.quote)%2===0);
  const rises:boolean[]=[]; const over:boolean[]=[]; const matches:boolean[]=[];
  for(let i=1;i<n;i++){
    rises.push(data[i].quote>data[i-1].quote);
    over.push(lastDigit(data[i].quote)>=5);
    matches.push(lastDigit(data[i].quote)===lastDigit(data[i-1].quote));
  }
  const evenP=even.length?pct(even.filter(Boolean).length,even.length):0;
  const riseP=rises.length?pct(rises.filter(Boolean).length,rises.length):0;
  const overP=over.length?pct(over.filter(Boolean).length,over.length):0;
  const matchP=matches.length?pct(matches.filter(Boolean).length,matches.length):0;

  const returns=data.slice(1).map((t,i)=>t.quote-data[i].quote);
  const mean=returns.length?returns.reduce((a,b)=>a+b,0)/returns.length:0;
  const variance=returns.length?returns.reduce((a,b)=>a+(b-mean)**2,0)/returns.length:0;
  const volatility=Math.sqrt(variance);
  const momentum=returns.slice(-20).reduce((a,b)=>a+b,0);
  const trendStrength=returns.length?Math.abs(returns.reduce((a,b)=>a+b,0))/(returns.reduce((a,b)=>a+Math.abs(b),0)||1):0;

  const signals:Signal[]=[];
  const add=(market:Signal["market"],p:number,expected:number)=>{
    const z=Math.abs(zScore(p/100,expected,n));
    signals.push({
      market, probability:p, expected:expected*100, deviation:p-expected*100, sampleSize:n,
      confidence:confidence(n,z),
      supportingFactors:[`Observed ${p.toFixed(1)}% vs ${expected*100}% baseline`,`z-score ${z.toFixed(2)}`],
      timestamp:Date.now(), reassessAfterTicks:Math.max(10,Math.floor(n*.1))
    });
  };
  add(evenP>=50?"EVEN":"ODD", evenP>=50?evenP:100-evenP,.5);
  add(riseP>=50?"RISE":"FALL", riseP>=50?riseP:100-riseP,.5);
  add(overP>=50?"OVER":"UNDER", overP>=50?overP:100-overP,.5);
  add(matchP>=50?"MATCH":"DIFFER", matchP>=50?matchP:100-matchP,.1);

  let currentLabel="NEUTRAL";
  if(trendStrength>.55 && momentum>0) currentLabel="STRONG UPWARD";
  else if(trendStrength>.55 && momentum<0) currentLabel="STRONG DOWNWARD";
  else if(volatility>0 && trendStrength<.2) currentLabel="SIDEWAYS";
  if(volatility>0 && returns.length && Math.abs(returns.at(-1)!)>volatility*2) currentLabel="HIGH VOLATILITY";

  const strongest=Math.max(...signals.map(s=>Math.abs(s.deviation)),0);
  return {
    sampleSize:n,digit:digits,digitPercent,digitDeviation,
    evenPercent:evenP,oddPercent:100-evenP,risePercent:riseP,fallPercent:100-riseP,
    overPercent:overP,underPercent:100-overP,matchPercent:matchP,differPercent:100-matchP,
    longestStreak: longestStreaks(data),
    currentStreak: currentStreak(data),
    volatility,momentum,trendStrength,regime:currentLabel,
    confidence:confidence(n,Math.abs(zScore(strongest/100,.5,n))),
    signals
  };
}

function currentStreak(data:Tick[]) {
  if(data.length<2) return {label:"—",length:data.length};
  const d=(t:Tick)=>lastDigit(t.quote)%2===0?"EVEN":"ODD";
  const label=d(data.at(-1)!); let len=0;
  for(let i=data.length-1;i>=0;i--){ if(d(data[i])!==label) break; len++; }
  return {label,length:len};
}

function longestStreaks(data:Tick[]) {
  const out:Record<string,number>={EVEN:0,ODD:0,RUN_UP:0,RUN_DOWN:0};
  const digitLabels=data.map(t=>lastDigit(t.quote)%2===0?"EVEN":"ODD");
  for(const label of ["EVEN","ODD"]){
    let run=0; for(const x of digitLabels){run=x===label?run+1:0;out[label]=Math.max(out[label],run);}
  }
  let up=0,down=0;
  for(let i=1;i<data.length;i++){
    up=data[i].quote>data[i-1].quote?up+1:0;
    down=data[i].quote<data[i-1].quote?down+1:0;
    out.RUN_UP=Math.max(out.RUN_UP,up); out.RUN_DOWN=Math.max(out.RUN_DOWN,down);
  }
  return out;
}

export function backtest(ticks:Tick[], minConfidence:Confidence="Moderate") {
  const rank:Record<Confidence,number>={"Very Low":0,"Low":1,"Moderate":2,"High":3,"Very High":4};
  let correct=0,total=0,win=0,lose=0,currentLose=0,maxLose=0,currentWin=0,maxWin=0;
  for(let i=50;i<ticks.length-1;i++){
    const a=analyze(ticks.slice(Math.max(0,i-100),i));
    const s=a.signals.find(x=>rank[x.confidence]>=rank[minConfidence]);
    if(!s) continue;
    total++;
    const actual=lastDigit(ticks[i+1].quote)%2===0;
    const predicted=s.market==="EVEN"||s.market==="OVER"||s.market==="MATCH";
    const ok=actual===predicted;
    if(ok){correct++;win++;currentWin++;currentLose=0;maxWin=Math.max(maxWin,currentWin);}
    else {lose++;currentLose++;currentWin=0;maxLose=Math.max(maxLose,currentLose);}
  }
  return {totalSignals:total,correct,incorrect:lose,accuracy:total?correct/total*100:0,maxLosingStreak:maxLose,maxWinningStreak:maxWin};
}
