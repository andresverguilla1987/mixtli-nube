from fastapi import FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from . import football_api
import os, random, math

app = FastAPI(title="Quiniela - Refined Predictions")

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
                "home_team_id": m.get("homeTeam",{}).get("id"),
                "away_team": m.get("awayTeam",{}).get("name"),
                "away_team_id": m.get("awayTeam",{}).get("id"),
                "status": m.get("status"),
                "competition": m.get("competition", {}).get("name") if m.get("competition") else None,
                "competition_id": m.get("competition", {}).get("id") if m.get("competition") else None
            })
        return out
    except Exception as e:
        raise HTTPException(status_code=502, detail=str(e))

@app.get("/match/{match_id}")
def match_detail(match_id: int):
    try:
        data = football_api.get_match(match_id)
        m = data.get("match", data)
        return m
    except Exception as e:
        raise HTTPException(status_code=502, detail=str(e))

def calc_team_stats_from_matches(matches):
    # matches: list of match objects (finished) from football-data / simplified
    played = 0
    wins = draws = losses = gf = ga = 0
    recent = []
    for m in matches:
        # m.score.fullTime may exist
        score = m.get('score', {}).get('fullTime', {})
        if score == {}:
            continue
        home = m.get('homeTeam', {}).get('name')
        away = m.get('awayTeam', {}).get('name')
        home_goals = score.get('home')
        away_goals = score.get('away')
        if home_goals is None or away_goals is None:
            continue
        played += 1
        gf += (home_goals if home == m.get('team_name') else away_goals)
        ga += (away_goals if home == m.get('team_name') else home_goals)
        # determine W/D/L for team_name stored in m['team_name']
        team_name = m.get('team_name')
        if team_name is None:
            # fallback determine based on provided 'for_team' field
            team_name = m.get('for_team')
        if team_name == home:
            tgf = home_goals; tag = away_goals
        else:
            tgf = away_goals; tag = home_goals
        if tgf > tag: wins += 1
        elif tgf == tag: draws += 1
        else: losses += 1
        recent.append({'opponent': (away if team_name==home else home), 'gf': tgf, 'ga': tag, 'date': m.get('utcDate')})
    avg_gf = round(gf/played,2) if played else 0.0
    avg_ga = round(ga/played,2) if played else 0.0
    form = {'played':played,'wins':wins,'draws':draws,'losses':losses,'avg_gf':avg_gf,'avg_ga':avg_ga,'recent':recent}
    return form

@app.get("/match/{match_id}/predict")
def match_predict(match_id: int):
    try:
        # fetch match detail
        mdata = football_api.get_match(match_id)
        match = mdata.get('match', mdata)
        # get team ids and names
        home = match.get('homeTeam',{})
        away = match.get('awayTeam',{})
        home_id = home.get('id'); away_id = away.get('id')
        home_name = home.get('name'); away_name = away.get('name')
        # fetch recent finished matches for both teams (limit 8)
        home_matches_raw = football_api.get_team_matches(home_id, limit=8).get('matches', [])
        away_matches_raw = football_api.get_team_matches(away_id, limit=8).get('matches', [])
        # annotate each match object with 'team_name' to compute stats easier
        for mm in home_matches_raw:
            mm['team_name'] = home_name
        for mm in away_matches_raw:
            mm['team_name'] = away_name
        home_stats = calc_team_stats_from_matches(home_matches_raw)
        away_stats = calc_team_stats_from_matches(away_matches_raw)
        # simple predictive model: combine ELO-like base + recent form + goals for/against
        def elo_of(name):
            return 1500 + (sum(ord(c) for c in (name or "")) % 200) - 100
        elo_h = elo_of(home_name); elo_a = elo_of(away_name)
        elo_diff = (elo_h - elo_a)/400.0
        # form score: wins-weighted
        form_h = (home_stats['wins']*3 + home_stats['draws']) / max(1, home_stats['played']*3)
        form_a = (away_stats['wins']*3 + away_stats['draws']) / max(1, away_stats['played']*3)
        form_diff = form_h - form_a
        # goals factor
        gf_diff = home_stats['avg_gf'] - away_stats['avg_ga']
        # combine into expected goals
        base_home = 1.1 + elo_diff + (form_diff * 0.6) + (gf_diff * 0.25)
        base_away = 0.9 - elo_diff + (-form_diff * 0.6) + ((away_stats['avg_gf'] - home_stats['avg_ga']) * 0.25)
        base_home = max(0.1, round(base_home,2)); base_away = max(0.05, round(base_away,2))
        # simulate outcomes using Poisson-ish sampling (expo approximation for speed)
        sims = 3000
        home_wins=draws=away_wins=0
        import random
        for _ in range(sims):
            gh = int(random.expovariate(1.0/base_home))
            ga = int(random.expovariate(1.0/base_away))
            if gh>ga: home_wins+=1
            elif gh==ga: draws+=1
            else: away_wins+=1
        ph = home_wins/sims; pd = draws/sims; pa = away_wins/sims
        # determine winner label
        probs = {'home_pct': round(ph*100,1),'draw_pct': round(pd*100,1),'away_pct': round(pa*100,1)}
        winner = home_name if ph>pd and ph>pa else (away_name if pa>ph and pa>pd else 'Empate')
        return {'match_id': match_id, 'home': home_name, 'away': away_name, 'home_stats': home_stats, 'away_stats': away_stats, 'expected_goals': {'home':base_home,'away':base_away}, 'probabilities': probs, 'predicted_winner': winner}
    except Exception as e:
        raise HTTPException(status_code=502, detail=str(e))
