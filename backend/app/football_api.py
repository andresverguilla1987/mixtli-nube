import os, requests, logging
API_KEY = os.getenv("FOOTBALL_DATA_KEY")
BASE_URL = "https://api.football-data.org/v4"

headers = {}
if API_KEY:
    headers = {"X-Auth-Token": API_KEY}
else:
    logging.warning("FOOTBALL_DATA_KEY not set; endpoints will fallback to local JSON when available.")

def get_competitions():
    url = f"{BASE_URL}/competitions"
    r = requests.get(url, headers=headers, timeout=10)
    r.raise_for_status()
    return r.json()

def get_matches(competition_id):
    url = f"{BASE_URL}/competitions/{competition_id}/matches?status=SCHEDULED"
    r = requests.get(url, headers=headers, timeout=10)
    r.raise_for_status()
    return r.json()

def get_team(team_id):
    url = f"{BASE_URL}/teams/{team_id}"
    r = requests.get(url, headers=headers, timeout=10)
    r.raise_for_status()
    return r.json()
