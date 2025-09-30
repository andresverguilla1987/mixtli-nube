
# Mixtli Relay Upload (Multer)
- Subida vía servidor con **multer** (memoryStorage) → más robusto con browsers/proxies.
- Enlaces firmados de lectura.
- Parseo defensivo de `ALLOWED_ORIGINS`.
- Loggea el Content-Type de cada request (útil para depurar).

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
# o: ALLOWED_ORIGINS=https://flourishing-salmiakki-c9b2e2.netlify.app,http://localhost:8888

## Pruebas
curl -F "file=@./ping.bin" https://<render>.onrender.com/api/upload
curl -s -H "Content-Type: application/json" -d '{"key":"uploads/..."}' https://<render>.onrender.com/api/presign-get
