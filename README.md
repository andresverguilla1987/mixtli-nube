# Mixtli CORS Setter (IDrive e2 / S3-compatible)

## Cómo usar (local, recomendado)
1. Instala Node 18+.
2. Descomprime este ZIP.
3. En la carpeta:
   ```bash
   npm install
   # Linux/macOS:
   export S3_ENDPOINT="https://x3j7.or2.idrivee2-60.com"
   export S3_REGION="us-east-1"
   export S3_BUCKET="1mixtlinube3"
   export S3_ACCESS_KEY_ID="TU_KEY"
   export S3_SECRET_ACCESS_KEY="TU_SECRET"
   export CORS_ALLOWED_ORIGINS="https://lovely-bienenstitch-6344a1.netlify.app,http://localhost:3000"
   node set-cors.js
   ```
   En Windows PowerShell:
   ```powershell
   $env:S3_ENDPOINT="https://x3j7.or2.idrivee2-60.com"
   $env:S3_REGION="us-east-1"
   $env:S3_BUCKET="1mixtlinube3"
   $env:S3_ACCESS_KEY_ID="TU_KEY"
   $env:S3_SECRET_ACCESS_KEY="TU_SECRET"
   $env:CORS_ALLOWED_ORIGINS="https://lovely-bienenstitch-6344a1.netlify.app,http://localhost:3000"
   node set-cors.js
   ```

## Alternativa: correr en Render (one-off)
- Build: `npm install --no-audit --no-fund`
- Start: `node set-cors.js`
- Variables de entorno: las mismas de arriba.
- Al terminar, elimina el servicio.

## Verificación
```bash
curl -i -X OPTIONS "https://x3j7.or2.idrivee2-60.com/1mixtlinube3/ping.bin"   -H "Origin: https://lovely-bienenstitch-6344a1.netlify.app"   -H "Access-Control-Request-Method: PUT"   -H "Access-Control-Request-Headers: content-type"
```
Debe devolver Access-Control-Allow-Origin con tu dominio.