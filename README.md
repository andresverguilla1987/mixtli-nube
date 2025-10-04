# Mixtli Backend Fix v2 (CORS con comodines)

Novedad: `ALLOWED_ORIGINS` admite comodines, p.ej. `https://*.netlify.app`.
Útil porque Netlify cambia subdominios entre deploys/preview.

## Ejemplos
```env
ALLOWED_ORIGINS=https://flourishing-salmiakki-c9b2e2.netlify.app,https://mixtli-nube.onrender.com
# o bien:
ALLOWED_ORIGINS=https://*.netlify.app,https://mixtli-nube.onrender.com
```

Resto igual al v1: endpoints /salud, /api/list, /api/presign, /api/presign-batch.
