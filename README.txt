
Mixtli Backend (Render) – iDrive e2 listo (vLZ)

1) Variables en Render (Environment):
   S3_ENDPOINT=https://<tu-subdominio>.or2.idrivee2-60.com
   S3_BUCKET=1mixtlinube3
   S3_REGION=us-east-1
   S3_FORCE_PATH_STYLE=true
   S3_ACCESS_KEY_ID=****************
   S3_SECRET_ACCESS_KEY=****************
   ALLOWED_ORIGINS=["https://flourishing-salmiakki-c9b2e2.netlify.app","https://mixtli-nube.onrender.com"]

2) Build & Start:
   - Node: 18+
   - Start command:  npm start
   - Port: 8080 (Render la inyecta en $PORT; ya soportado)

3) Endpoints:
   GET  /salud | /api/health
   GET  /api/diag
   GET  /api/list?album=personal&limit=60&token=...
   POST /api/presign
   POST /api/presign-batch
   GET  /api/sign-get?key=...
   POST /api/sign-get-batch  { keys: ["personal/IMG.jpg", ...], expires: 300 }

4) iDrive e2:
   - No agregues /<bucket> al S3_ENDPOINT
   - Usa hostname (no IP)
   - S3_FORCE_PATH_STYLE=true

Listo para desplegar.
