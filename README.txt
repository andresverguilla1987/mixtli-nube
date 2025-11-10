Quiniela — Refined predictions (per-team stats + predicted winner)

What's new:
- Endpoint GET /match/{match_id}/predict returns:
  - home_stats and away_stats (recent form, avg GF/GA)
  - expected_goals for both teams (model combines ELO-like base + form + goals)
  - probabilities (home_pct, draw_pct, away_pct)
  - predicted_winner (string)

Frontend:
- Shows predicted winner inline in matches list and per-team stats summary
- Modal shows detailed per-team stats and prediction breakdown

Deploy:
- Add FOOTBALL_DATA_KEY env var in Render
- Build: pip install -r backend/requirements.txt
- Start (Procfile): web: cd backend && uvicorn app.main:app --host 0.0.0.0 --port $PORT

Notes:
- This is a prototype model (heuristic+simulation). For production, we'll replace with trained model (XGBoost/LightGBM) and caching.
- Avoid heavy polling to football-data to respect rate limits; add caching (Redis) if needed.

