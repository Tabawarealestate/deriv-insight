export type Tick = {
  symbol: string;
  epoch: number;
  quote: number;
  id?: string;
};

export type WindowSize = 25 | 50 | 100 | 250 | 500 | 1000 | number;

export type Confidence = "Very Low" | "Low" | "Moderate" | "High" | "Very High";

export type Bias = "EVEN" | "ODD" | "RISE" | "FALL" | "OVER" | "UNDER" | "MATCH" | "DIFFER";

export type Analysis = {
  sampleSize: number;
  digit: Record<number, number>;
  digitPercent: Record<number, number>;
  digitDeviation: Record<number, number>;
  evenPercent: number;
  oddPercent: number;
  risePercent: number;
  fallPercent: number;
  overPercent: number;
  underPercent: number;
  matchPercent: number;
  differPercent: number;
  longestStreak: Record<string, number>;
  currentStreak: { label: string; length: number };
  volatility: number;
  momentum: number;
  trendStrength: number;
  regime: string;
  confidence: Confidence;
  signals: Signal[];
};

export type Signal = {
  market: Bias;
  probability: number;
  expected: number;
  deviation: number;
  sampleSize: number;
  confidence: Confidence;
  supportingFactors: string[];
  timestamp: number;
  reassessAfterTicks: number;
};
