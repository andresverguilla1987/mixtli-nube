# Mixtli Backend Fix (2025-10-04)

Arregla:
- 404 en **/api/presign-batch** (endpoint agregado).
- 400 en **/api/presign** por `filename o key requerido` (validación clara y ejemplo).
- 500 en **/api/list** y **/api/album/list** por errores de conexión al storage (manejo de errores y mensaje `STORAGE_DOWN`).
- ECONNREFUSED a IP `207.189.102.52:443`: **No uses IP**. Usa **hostname** en `S3_ENDPOINT` y **sin sufijo de bucket**.

## Variables de entorno (Render)
```env
S3_ENDPOINT=https://<accountid>.r2.cloudflarestorage.com
S3_BUCKET=<tu-bucket>
S3_REGION=auto
S3_ACCESS_KEY_ID=<r2-access-key-id>
S3_SECRET_ACCESS_KEY=<r2-secret-access-key>
S3_FORCE_PATH_STYLE=true
ALLOWED_ORIGINS=https://<tu-netlify>,https://<tu-render>
```

## Comandos Render
- **Build**: `npm install --no-audit --no-fund`
- **Start**: `node server.js`
- **Port**: `10000`

## Probar salud
```bash
curl -s https://<tu-render>/salud
# => { ok:true, storage:'up' | 'down', bucket:'...', error? }
```

## Presign (single)
```bash
curl -sX POST https://<tu-render>/api/presign \
-H "Content-Type: application/json" \
-d '{ "filename":"foto.jpg", "contentType":"image/jpeg", "album":"personal" }'
```

## Presign batch
```bash
curl -sX POST https://<tu-render>/api/presign-batch \
-H "Content-Type: application/json" \
-d '{ "album":"personal", "files":[{"filename":"a.jpg","contentType":"image/jpeg"},{"filename":"b.png","contentType":"image/png"}] }'
```

## List
```bash
curl -s "https://<tu-render>/api/list?album=personal"
```

## Notas importantes
- **TLS/SNI**: Cloudflare R2 requiere SNI. Si usas una **IP** en `S3_ENDPOINT`, fallará con `ECONNREFUSED`/handshake TLS. Usa **hostname**.
- **Endpoint sin bucket**: No incluyas `/<bucket>` en `S3_ENDPOINT`. El bucket va en `S3_BUCKET`.
- **Path-style**: `S3_FORCE_PATH_STYLE=true` para R2.
- **CORS**: actualiza `ALLOWED_ORIGINS` cada vez que cambien tus dominios de Netlify.
- **Front**: asegúrate de enviar `filename` o `key` en `POST /api/presign`. Si no, verás `400 filename o key requerido` (ahora claro y esperado).
```
