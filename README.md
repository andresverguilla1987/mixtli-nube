
# Mixtli Relay Upload (Admin: Delete/Rename + Trash)
Endpoints:
- POST /api/delete { key } [X-Admin-Token] → Mueve a trash/ y borra original (+ thumb si hay).
- POST /api/rename { key, newName } [X-Admin-Token] → Renombra (copy+delete) y mueve thumb.
- Admin token: setear env `ADMIN_TOKEN=loquesea`. Si se omite, no se exige token.

Requiere los envs S3_* habituales y ALLOWED_ORIGINS.
