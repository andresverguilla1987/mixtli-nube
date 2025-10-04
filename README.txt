
Mixtli Backend (Render) – iDrive e2 FAST (vLZ-fast)

Mejoras de rendimiento incluidas:
- HTTP keep-alive + pool (https.Agent) y NodeHttpHandler (menos latencia / más concurrencia)
- CORS preflight cacheado (maxAge=86400)
- Cache hints en sign-get y sign-get-batch (respuesta JSON)
- CacheControl en PUT para tipos multimedia (mejor CDN/browser cache)

ENV en Render:
  S3_ENDPOINT=https://<tu-subdominio>.or2.idrivee2-60.com
  S3_BUCKET=1mixtlinube3
  S3_REGION=us-east-1
  S3_FORCE_PATH_STYLE=true
  S3_ACCESS_KEY_ID=****************
  S3_SECRET_ACCESS_KEY=****************
  ALLOWED_ORIGINS=["https://flourishing-salmiakki-c9b2e2.netlify.app","https://mixtli-nube.onrender.com"]

Start command:
  npm start

Endpoints:
  GET  /salud | /api/health
  GET  /api/diag
  GET  /api/list?album=personal&limit=60&token=...
  POST /api/presign
  POST /api/presign-batch
  GET  /api/sign-get?key=...
  POST /api/sign-get-batch   { keys:[...], expires:300 }

Listo para desplegar en Render.
