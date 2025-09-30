
# Mixtli Relay Upload (Defensive)
- Subida vía servidor (streaming, sin CORS de bucket)
- Fix anti "ERR_HTTP_HEADERS_SENT"
- **Parseo defensivo** de `ALLOWED_ORIGINS` (acepta JSON o lista separada por comas, e ignora si alguien pegó `ALLOWED_ORIGINS=` dentro del valor)

## Deploy (Render)
Build:  `npm install --no-audit --no-fund`
Start:  `node server.js`
Health: `/salud`

## Env
S3_ENDPOINT=https://x3j7.or2.idrivee2-60.com
S3_REGION=us-east-1
S3_BUCKET=1mixtlinube3
S3_ACCESS_KEY_ID=<tu_key_e2>
S3_SECRET_ACCESS_KEY=<tu_secret_e2>
S3_FORCE_PATH_STYLE=true
ALLOWED_ORIGINS=["https://flourishing-salmiakki-c9b2e2.netlify.app","http://localhost:8888"]
# o bien:
# ALLOWED_ORIGINS=https://flourishing-salmiakki-c9b2e2.netlify.app,http://localhost:8888
