Quiniela — Advanced (Match details + teams)

Two zips available:
- quiniela_github_full.zip : Full repo (backend + frontend) ready for GitHub/Render
- quiniela_netlify_frontend.zip : Frontend-only static site for Netlify (upload the contents)

Backend:
- Uses FOOTBALL_DATA_KEY environment variable (X-Auth-Token header)
- Endpoints: /leagues, /league/{id}/matches, /league/{id}/teams, /team/{id}/recent, /match/{id}, /competition/{id}/standings, /predict
- Start command (Render): pip install -r backend/requirements.txt && web: cd backend && uvicorn app.main:app --host 0.0.0.0 --port $PORT

Frontend:
- index.html + styles.css + forebet-main.js
- Modal view shows match details, recent matches per team, and basic head-to-head aggregated locally
- If backend not available, frontend falls back to local JSON files (leagues.json, matches.json, teams.json)

Security:
- Do NOT commit FOOTBALL_DATA_KEY; use Render environment vars.

Deployment notes:
- GitHub repo zip contains everything (backend + frontend). Deploy backend to Render, frontend can be served from same host or Netlify (set up proxy/_redirects to point to backend endpoints).

