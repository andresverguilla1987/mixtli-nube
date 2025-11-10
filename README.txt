Quiniela - Football-Data.org integration (FastAPI backend + static frontend)

INCLUDES:
- backend/requirements.txt
- backend/app/main.py (FastAPI endpoints)
- backend/app/football_api.py (wrapper calls to football-data.org; reads FOOTBALL_DATA_KEY env var)
- frontend/index.html, styles.css, forebet-main.js (static UI)
- leagues.json, matches.json, teams.json (fallback data)
- Procfile (start command for Render)

SETUP (Render):
1. Create a new Web Service in Render and point to this repo or upload this project.
2. Add Environment Variable: FOOTBALL_DATA_KEY = <your api.football-data token>
3. Build command: pip install -r backend/requirements.txt
4. Start command: (Procfile used) web: cd backend && uvicorn app.main:app --host 0.0.0.0 --port $PORT
5. Deploy. Frontend assumes same origin; if hosting frontend separately, proxy endpoints or adjust CORS.

ENDPOINTS:
- GET /health
- GET /leagues
- GET /league/{id}/matches
- GET /league/{id}/teams
- GET /predict?home=TeamA&away=TeamB  (simple demo predictor)

Do NOT commit your FOOTBALL_DATA_KEY. Use environment variables.
