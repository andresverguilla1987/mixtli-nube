from fastapi import FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from . import football_api
import os, random

app = FastAPI(title="Quiniela - Football-Data Integration")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.get("/health")
def health():
    return {"status":"ok"}

@app.get("/leagues")
def leagues():
    try:
        data = football_api.get_competitions()
        comps = data.get('competitions', data)
        simplified = [{"id":c.get("id"), "name": c.get("name"), "area": c.get("area",{}).get("name")} for c in comps]
        return simplified
    except Exception as e:
        raise HTTPException(status_code=502, detail=str(e))

@app.get("/league/{competition_id}/matches")
def league_matches(competition_id: int):
    try:
        data = football_api.get_matches(competition_id)
        matches = data.get("matches", [])
        out = []
        for m in matches:
            out.append({
                "id": m.get("id"),
                "utcDate": m.get("utcDate"),
                "date": m.get("utcDate"),
                "home_team": m.get("homeTeam",{}).get("name"),
                "away_team": m.get("awayTeam",{}).get("name"),
                "status": m.get("status"),
                "competition": m.get("competition", {}).get("name") if m.get("competition") else None
            })
        return out
    except Exception as e:
        raise HTTPException(status_code=502, detail=str(e))

@app.get("/league/{competition_id}/teams")
def league_teams(competition_id: int):
    try:
        import requests
        url = f"https://api.football-data.org/v4/competitions/{competition_id}/teams"
        headers = {}
        if os.getenv('FOOTBALL_DATA_KEY'):
            headers = {"X-Auth-Token": os.getenv('FOOTBALL_DATA_KEY')}
        r = requests.get(url, headers=headers, timeout=10)
        r.raise_for_status()
        data = r.json()
        teams = [t.get('name') for t in data.get('teams', [])]
        return teams
    except Exception as e:
        raise HTTPException(status_code=502, detail=str(e))

@app.get("/predict")
def predict(home: str = Query(...), away: str = Query(...)):
    try:
        def elo_of(name):
            return 1500 + (sum(ord(c) for c in (name or "")) % 200) - 100
        elo_home = elo_of(home)
        elo_away = elo_of(away)
        diff = elo_home - elo_away
        exp_home_goals = 1.2 + (diff / 800.0)
        exp_away_goals = 1.0 - (diff / 900.0)
        exp_home_goals = max(0.2, exp_home_goals)
        exp_away_goals = max(0.1, exp_away_goals)
        sims = 2000
        home_wins = draw = away_wins = 0
        import math, random
        for _ in range(sims):
            # simple Poisson via expovariate approximation for demo
            gh = int(random.expovariate(1.0/exp_home_goals))
            ga = int(random.expovariate(1.0/exp_away_goals))
            if gh>ga: home_wins+=1
            elif gh==ga: draw+=1
            else: away_wins+=1
        total = sims
        return {
            "home": home,
            "away": away,
            "prob_home": round(home_wins/total*100,1),
            "prob_draw": round(draw/total*100,1),
            "prob_away": round(away_wins/total*100,1),
            "exp_home_goals": round(exp_home_goals,2),
            "exp_away_goals": round(exp_away_goals,2)
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
