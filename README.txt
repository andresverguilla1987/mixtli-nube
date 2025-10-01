Mixtli Nube — Health Patch
=============================

Este patch agrega dos rutas para evitar el 404 en Render y tener healthcheck limpio:
- GET /          → JSON 200 con info del servicio
- GET /api/health → JSON 200 con timestamp

Cómo aplicarlo (rápido):
1) Abre tu `server.js` y pega los bloques marcados en `server.diff` (o sustituye por `server.example.js` completo).
2) Asegúrate de escuchar el puerto de Render:
   `const PORT = process.env.PORT || 8080; app.listen(PORT, '0.0.0.0', ...)`
3) Deploy en Render (Build: `npm install --no-audit --no-fund`, Start: `node server.js`).

Verificación:
- https://<tu-servicio>.onrender.com/           → 200 JSON
- https://<tu-servicio>.onrender.com/api/health → 200 JSON
