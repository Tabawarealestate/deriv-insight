# Deriv Insight Platform

A professional decision-support dashboard for Deriv synthetic/digit markets. It streams public Deriv tick data, calculates descriptive statistics, probability deviations, streaks, regimes, patterns and non-guaranteed analytical biases.

> This project does **not** place trades and does not claim guaranteed predictions or profits.

## Architecture

- `apps/api`: Node.js + TypeScript WebSocket/REST backend
- `apps/web`: React + TypeScript + Vite + Tailwind dashboard
- `packages/analytics`: framework-independent statistical engine
- `packages/shared`: shared types
- `tests`: Vitest unit tests
- PostgreSQL schema for optional persistent tick storage

## Requirements

- Node.js 20+
- npm 10+
- PostgreSQL 15+ (optional for the first run)
- A browser with WebSocket support

## Quick start

```bash
npm install
cp .env.example .env
npm run dev
```

Open `http://localhost:5173`.

The public Deriv market-data WebSocket does not require an account token. The backend uses it for `active_symbols`, `ticks`, and `ticks_history`. See the official documentation linked below.

## Environment

See `.env.example`.

- `DERIV_WS_URL` defaults to the current public Deriv Options WebSocket endpoint.
- `API_PORT` defaults to 8080.
- `DATABASE_URL` is optional. When present, the API persists ticks.
- `MAX_TICKS_IN_MEMORY` bounds memory usage.

## API

- `GET /api/health`
- `GET /api/symbols`
- `GET /api/history/:symbol?count=1000`
- `WS /ws?symbol=R_100`

The browser connects to the platform API, while the API owns the Deriv connection. This prevents multiple browser clients from creating unnecessary upstream streams.

## Statistics

The analytics engine separates:

1. observed frequency
2. theoretical baseline
3. estimated probability
4. deviation from baseline
5. uncertainty/confidence
6. analytical bias

It deliberately does not use the gambler's-fallacy assumption that an underrepresented outcome is "due".

## Backtesting

The API includes an in-memory backtest endpoint and the analytics package exposes a deterministic backtest function. Feed a historical tick array and a signal rule to measure historical results. Historical results are not forecasts.

## Production

1. Build with `npm run build`.
2. Serve `apps/web/dist` from a CDN/static host.
3. Run `apps/api/dist/server.js` behind HTTPS/WSS.
4. Configure `DATABASE_URL` and a production secret/session layer if authentication is added.
5. Use TLS, rate limits, structured logs, monitoring and database retention policies.

## Deriv API notes

The current Deriv API exposes public market data through WebSocket. The project intentionally uses public market data only; account credentials and trading actions are not required.

Official docs:
- https://developers.deriv.com/docs/intro/api-overview/
- https://developers.deriv.com/docs/data/ticks/
- https://developers.deriv.com/docs/data/ticks-history/
- https://developers.deriv.com/docs/data/active-symbols/


## Phone deployment
See `PHONE_DEPLOY.md`. The included `render.yaml` is designed for a single free Render Web Service, giving the project a free `onrender.com` URL and avoiding the need to buy a domain.
