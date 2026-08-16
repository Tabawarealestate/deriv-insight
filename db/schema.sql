CREATE TABLE IF NOT EXISTS ticks (
  id BIGSERIAL PRIMARY KEY,
  symbol TEXT NOT NULL,
  epoch BIGINT NOT NULL,
  quote NUMERIC(30, 12) NOT NULL,
  tick_id TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(symbol, epoch, quote)
);

CREATE INDEX IF NOT EXISTS idx_ticks_symbol_epoch ON ticks(symbol, epoch DESC);
