# Mixtli Backend Fix v3 (Diagnóstico)

Añadidos:
- `/api/diag` → muestra endpoint/bucket/region y resultado de `HeadBucket` con detalles del error.
- `/api/self-test-upload` → intenta subir un `__diag_<ts>.txt` desde servidor (sin CORS) para validar credenciales y bucket.
- Respuestas de error incluyen `{name,message,code}` del SDK.

Uso rápido:
```bash
curl -s https://<render>/api/diag | jq .
curl -sX POST https://<render>/api/self-test-upload -H "Content-Type: application/json" -d '{"album":"personal"}' | jq .
```

Si `diag` marca `code: 503` o `UnknownEndpoint`, revisa:
- `S3_ENDPOINT=https://<accountid>.r2.cloudflarestorage.com` (cuenta correcta, sin `/<bucket>`)
- `S3_BUCKET=<nombre-exacto>`
- `S3_ACCESS_KEY_ID` / `S3_SECRET_ACCESS_KEY` (token R2 con permisos: List, Read, Write; y Buckets Read)
- `S3_FORCE_PATH_STYLE=true`

Para presigned PUT desde navegador, configura CORS en R2:
- Allowed Origins: tus dominios (ej. `https://*.netlify.app`, `https://mixtli-nube.onrender.com`)
- Allowed Methods: `GET, PUT, HEAD`
- Allowed Headers: `*` (o al menos `Content-Type, Authorization, x-amz-content-sha256, x-amz-date, origin`)
- Expose Headers: `ETag, x-amz-request-id, x-amz-version-id`
- Max Age: 3000
