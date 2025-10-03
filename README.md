Mixtli Relay (fix CORS + rutas)
===============================

ENV requeridas en Render:
- E2_ENDPOINT=https://<tu-endpoint>.idrivee2-60.com
- E2_REGION=us-east-1
- E2_BUCKET=1mixtlinube3
- E2_ACCESS_KEY_ID=xxxx
- E2_SECRET_ACCESS_KEY=xxxx
- E2_PUBLIC_BASE=https://x3j7.or2.idrivee2-60.com/1mixtlinube3  (opcional)
- FORCE_PATH_STYLE=true
- ALLOWED_ORIGINS=["https://flourishing-salmiakki-c9b2e2.netlify.app","http://localhost:8888"]

Arranque:
  npm install --no-audit --no-fund
  node server.js
