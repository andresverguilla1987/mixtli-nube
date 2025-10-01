
# Mixtli Relay Upload (Thumbnails Reales)
- Genera miniaturas al subir imágenes con Sharp (480x320, JPG).
- Guarda original en `albums/<album>/...` y thumb en `thumbs/<key>.jpg`.
- Lista de items incluye `thumb`.
- `/api/presign-batch` te firma en lote cualquier key (original o thumb).

**Requisitos Render**: `npm install` descarga Sharp prebuild (x64). Si falla, Render recompila.
