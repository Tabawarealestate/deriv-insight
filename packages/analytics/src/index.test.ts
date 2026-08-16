import { describe,it,expect } from "vitest";
import { analyze,lastDigit } from "./index.js";

const ticks=Array.from({length:100},(_,i)=>({symbol:"TEST",epoch:i,quote:100+i/100}));

describe("analytics",()=>{
  it("extracts last digit",()=>expect(lastDigit(123.45)).toBe(5));
  it("counts 0-9",()=>{
    const a=analyze(Array.from({length:100},(_,i)=>({symbol:"T",epoch:i,quote:100+i/10})));
    expect(Object.keys(a.digit)).toHaveLength(10);
    expect(Object.values(a.digit).reduce((x,y)=>x+y,0)).toBe(100);
  });
  it("keeps probabilities bounded",()=>{
    const a=analyze(ticks);
    expect(a.evenPercent).toBeGreaterThanOrEqual(0);
    expect(a.evenPercent).toBeLessThanOrEqual(100);
  });
  it("reports small samples as low confidence",()=>{
    const a=analyze(ticks.slice(0,10));
    expect(["Very Low","Low"]).toContain(a.confidence);
  });
});
