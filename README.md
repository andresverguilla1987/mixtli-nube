# Mixtli Nube API (mínimo para Render)

## Deploy en Render
- Build command: `npm install --omit=dev`
- Start command: `npm start`
- Env:
  - `CORS_ORIGIN=https://flourishing-salmiakki-c9b2e2.netlify.app`

Endpoints:
- `GET /health` → `{ ok: true }`
- `GET /api/ping` → `{ message: "pong" }`
