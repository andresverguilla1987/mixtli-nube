
# Mixtli Relay Upload (Fixed)
Subida vía servidor (streaming, sin CORS de bucket) y enlaces firmados de lectura.
Incluye fix para `ERR_HTTP_HEADERS_SENT` (respuestas protegidas contra doble envío).

## Deploy (Render)
- Build: `npm install --no-audit --no-fund`
- Start: `node server.js`
- Health: `/salud`

## Env
S3_ENDPOINT=https://x3j7.or2.idrivee2-60.com
S3_REGION=us-east-1
S3_BUCKET=1mixtlinube3
S3_ACCESS_KEY_ID=<tu_key_e2>
S3_SECRET_ACCESS_KEY=<tu_secret_e2>
S3_FORCE_PATH_STYLE=true
ALLOWED_ORIGINS=["https://<tu-netlify>.netlify.app","http://localhost:8888"]

## Endpoints
- POST /api/upload   (form-data: file)
- POST /api/presign-get { key }
- GET  /api/diag
- GET  /api/check-bucket
- GET  /salud
