Mixtli backend (Render) — iDrive e2
========================================

1) Variables de entorno (Render > Environment):
   - S3_ENDPOINT: https://<account>.<region>.idrivee2-60.com (SIN /bucket)
   - S3_BUCKET:   tu bucket (ej. 1mixtlinube3)
   - S3_REGION:   us-east-1
   - S3_FORCE_PATH_STYLE: true
   - S3_ACCESS_KEY_ID / S3_SECRET_ACCESS_KEY
   - ADMIN_TOKEN (opcional): si lo pones, el front puede borrar enviando X-Admin-Token
   - ALLOWED_ORIGINS: JSON o CSV (puede incluir wildcards como https://*.netlify.app)

2) Deploy (Render):
   - Start Command: npm start
   - NODE_VERSION: 20
   - Health check: GET /api/health

3) Endpoints:
   - GET  /api/health | /salud
   - GET  /api/diag
   - GET  /api/list?album=personal&limit=1000&token=...
   - POST /api/presign               { filename|key, contentType?, album? }
   - POST /api/presign-batch         { files:[{filename|key,contentType?}], album? }
   - GET  /api/sign-get?key=...&expires=300
   - POST /api/sign-get-batch        { keys:[...], expires? }
   - POST /api/delete                { key }
   - POST /api/delete-batch          { keys:[...] }   (si ADMIN_TOKEN existe, envia header X-Admin-Token)

4) Rendimiento:
   - Keep-alive con agentkeepalive + NodeHttpHandler
   - Compresión gzip/br en JSON
   - Micro-cache Cache-Control: 30s para JSON
