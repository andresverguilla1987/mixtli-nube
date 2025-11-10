import os, requests, logging
API_KEY = os.getenv("FOOTBALL_DATA_KEY")
BASE_URL = "https://api.football-data.org/v4"
HEADERS = {"X-Auth-Token": API_KEY} if API_KEY else {}
TIMEOUT = 8
def _get(path, params=None):
    url = f"{BASE_URL}{path}"
    try:
        r = requests.get(url, headers=HEADERS, params=params, timeout=TIMEOUT)
        r.raise_for_status()
        return r.json()
    except requests.exceptions.HTTPError as he:
        logging.error("HTTP error for %s: %s %s", url, getattr(r, 'status_code', ''), he)
        raise
    except Exception as e:
        logging.exception("Request failed for %s: %s", url, e)
        raise
def get_competitions():
    return _get("/competitions")
def get_matches(competition_id):
    return _get(f"/competitions/{competition_id}/matches", params={"status":"SCHEDULED"})
def get_match(match_id):
    return _get(f"/matches/{match_id}")
def get_competition_teams(competition_id):
    return _get(f"/competitions/{competition_id}/teams")
def get_team_matches(team_id, limit=10):
    return _get(f"/teams/{team_id}/matches", params={"status":"FINISHED","limit":limit})
def get_standings(competition_id):
    return _get(f"/competitions/{competition_id}/standings")
