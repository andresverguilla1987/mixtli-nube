# Mixtli Transfer — Diagnostics Build

Endpoints útiles:
- `GET /salud`
- `GET /api/diag/env` → muestra qué variables S3/Stripe/CORS están presentes (sin revelar secretos).
- `GET /api/diag/stripe`
- `GET /api/list-check` → intenta `ListObjectsV2` (debug rápido del bucket).

Uso típico en Render:
1) Subir este ZIP.
2) Configurar envs S3_* y Stripe si aplica.
3) Abrir `/api/diag/env` y `/api/list-check` para ubicar el problema exacto.
