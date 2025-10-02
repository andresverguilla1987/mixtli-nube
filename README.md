# Mixtli Relay — upload con multer (evita CORS del bucket)

## Qué cambia
- `/api/upload` ahora usa `multer.memoryStorage()` → el archivo queda en `req.file` siempre que el front mande `FormData` con el campo **file**.
- Mantiene `/api/presign-get`, `/api/diag`, `/api/salud`.
- Incluye parseo defensivo de `ALLOWED_ORIGINS` y logea `Content-Type` para depurar.

## Cómo aplicarlo en Render
1. Sube este ZIP al servicio (nuevo deploy o reemplaza).
2. Build: `npm install --omit=dev`
3. Start: `node server.js`
4. Env (exacto, sin repetir el nombre dentro del valor):

S3_ENDPOINT=https://x3j7.or2.idrivee2-60.com
S3_REGION=auto
S3_BUCKET=1mixtlinube3
S3_ACCESS_KEY_ID=<tu_key_e2>
S3_SECRET_ACCESS_KEY=<tu_secret_e2>
S3_FORCE_PATH_STYLE=true
ALLOWED_ORIGINS=["https://flourishing-salmiakki-c9b2e2.netlify.app","http://localhost:5173"]

## Prueba rápida

# Subir (debe devolver { ok:true, key })
curl -F "file=@./ping.bin" "https://mixtli-nube.onrender.com/api/upload?key=albums/pruebas-qa/ping.bin"

# Link privado (15 min)
curl -s -H "Content-Type: application/json"   -d '{"key":"uploads/..."}'   https://mixtli-nube.onrender.com/api/presign-get

En el front que te pasé (directo), ya manda `FormData.append("file", file)`. 
Si sigues viendo error, dime exactamente el JSON de respuesta de `/api/upload` o `/api/diag`.
