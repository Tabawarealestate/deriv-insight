# Phone-only deployment

## Recommended free architecture

One Render Web Service hosts the compiled React frontend and the Node.js WebSocket API. The app receives a free `onrender.com` URL, so no paid domain is required.

1. Create a GitHub account on your phone.
2. Create a new repository named `deriv-insight`.
3. Upload this project ZIP contents (not the ZIP itself).
4. Create a Render account and connect GitHub.
5. Choose **New → Web Service**.
6. Select `deriv-insight`.
7. Use:
   - Build command: `npm install && npm run build`
   - Start command: `npm start`
   - Plan: Free
8. Deploy.
9. Open the assigned `https://YOUR-SERVICE.onrender.com` address.
10. Android Chrome menu → **Add to Home screen**.

The free service may sleep after inactivity, so the first load after sleeping can take a little longer. Free Render Postgres is not suitable for permanent historical storage because its free database expires after 30 days; the included version therefore keeps the live analysis in bounded memory.

## What the phone version does

- Real-time public Deriv ticks
- Symbol discovery
- Multiple analysis windows
- Digit statistics and heatmap
- Even/Odd, Rise/Fall, Over/Under, Match/Differ
- Rolling descriptive probabilities
- Statistical deviation
- Confidence categories
- Regime detection
- Signals with sample size and deviation
- Tick stream
- PWA installation
- Automatic WebSocket reconnect

## Security

Do not put Deriv account tokens in the frontend. This project uses the public no-auth market-data channel and does not place trades.
