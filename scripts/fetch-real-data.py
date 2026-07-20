#!/usr/bin/env python3
"""
Phase 0 data-prep script
Pulls real NHL rosters (NHL public API) + per-60 stats (MoneyPuck 2024 season)
and writes data/real-league-2025-26.json used by the generator rewrite.

Usage:
  python3 scripts/fetch-real-data.py

Output:
  data/real-league-2025-26.json
"""

import csv
import io
import json
import sys
import time
import urllib.request
from pathlib import Path

# ─── Constants ─────────────────────────────────────────────────────────────────

MONEYPUCK_YEAR = 2024          # most recently completed full season
MP_BASE = "https://moneypuck.com/moneypuck/playerData/seasonSummary"
NHL_BASE = "https://api-web.nhle.com/v1"

OUT_PATH = Path(__file__).parent.parent / "data" / "real-league-2025-26.json"

# ─── 32 Real NHL Teams ──────────────────────────────────────────────────────────
# Format: (tricode, city, name, conference, division)
TEAMS = [
    # Eastern – Atlantic
    ("BOS", "Boston",        "Bruins",      "Eastern", "Atlantic"),
    ("BUF", "Buffalo",       "Sabres",      "Eastern", "Atlantic"),
    ("DET", "Detroit",       "Red Wings",   "Eastern", "Atlantic"),
    ("FLA", "Florida",       "Panthers",    "Eastern", "Atlantic"),
    ("MTL", "Montréal",      "Canadiens",   "Eastern", "Atlantic"),
    ("OTT", "Ottawa",        "Senators",    "Eastern", "Atlantic"),
    ("TBL", "Tampa Bay",     "Lightning",   "Eastern", "Atlantic"),
    ("TOR", "Toronto",       "Maple Leafs", "Eastern", "Atlantic"),
    # Eastern – Metropolitan
    ("CAR", "Carolina",      "Hurricanes",  "Eastern", "Metropolitan"),
    ("CBJ", "Columbus",      "Blue Jackets","Eastern", "Metropolitan"),
    ("NJD", "New Jersey",    "Devils",      "Eastern", "Metropolitan"),
    ("NYI", "New York",      "Islanders",   "Eastern", "Metropolitan"),
    ("NYR", "New York",      "Rangers",     "Eastern", "Metropolitan"),
    ("PHI", "Philadelphia",  "Flyers",      "Eastern", "Metropolitan"),
    ("PIT", "Pittsburgh",    "Penguins",    "Eastern", "Metropolitan"),
    ("WSH", "Washington",    "Capitals",    "Eastern", "Metropolitan"),
    # Western – Central
    ("CHI", "Chicago",       "Blackhawks",  "Western", "Central"),
    ("COL", "Colorado",      "Avalanche",   "Western", "Central"),
    ("DAL", "Dallas",        "Stars",       "Western", "Central"),
    ("MIN", "Minnesota",     "Wild",        "Western", "Central"),
    ("NSH", "Nashville",     "Predators",   "Western", "Central"),
    ("STL", "St. Louis",     "Blues",       "Western", "Central"),
    ("UTA", "Utah",          "Mammoth",     "Western", "Central"),
    ("WPG", "Winnipeg",      "Jets",        "Western", "Central"),
    # Western – Pacific
    ("ANA", "Anaheim",       "Ducks",       "Western", "Pacific"),
    ("CGY", "Calgary",       "Flames",      "Western", "Pacific"),
    ("EDM", "Edmonton",      "Oilers",      "Western", "Pacific"),
    ("LAK", "Los Angeles",   "Kings",       "Western", "Pacific"),
    ("SJS", "San Jose",      "Sharks",      "Western", "Pacific"),
    ("SEA", "Seattle",       "Kraken",      "Western", "Pacific"),
    ("VAN", "Vancouver",     "Canucks",     "Western", "Pacific"),
    ("VGK", "Vegas",         "Golden Knights","Western","Pacific"),
]

# ─── HTTP helpers ───────────────────────────────────────────────────────────────

def fetch_json(url: str) -> dict:
    req = urllib.request.Request(url, headers={"User-Agent": "hockey-franchise-sim/1.0"})
    with urllib.request.urlopen(req, timeout=20) as resp:
        return json.loads(resp.read().decode())

def fetch_text(url: str) -> str:
    req = urllib.request.Request(url, headers={"User-Agent": "hockey-franchise-sim/1.0"})
    with urllib.request.urlopen(req, timeout=30) as resp:
        return resp.read().decode("utf-8-sig")   # strip BOM if present

# ─── MoneyPuck CSVs ─────────────────────────────────────────────────────────────

def load_moneypuck_skaters() -> dict[int, dict]:
    """Returns {playerId: row_dict} using situation='all' rows."""
    url = f"{MP_BASE}/{MONEYPUCK_YEAR}/regular/skaters.csv"
    print(f"  Fetching MoneyPuck skaters ({MONEYPUCK_YEAR})…")
    text = fetch_text(url)
    reader = csv.DictReader(io.StringIO(text))
    result: dict[int, dict] = {}
    for row in reader:
        if row.get("situation") != "all":
            continue
        pid = int(row["playerId"])
        result[pid] = row
    print(f"    {len(result)} skater rows loaded")
    return result

def load_moneypuck_goalies() -> dict[int, dict]:
    """Returns {playerId: row_dict} using situation='all' rows."""
    url = f"{MP_BASE}/{MONEYPUCK_YEAR}/regular/goalies.csv"
    print(f"  Fetching MoneyPuck goalies ({MONEYPUCK_YEAR})…")
    text = fetch_text(url)
    reader = csv.DictReader(io.StringIO(text))
    result: dict[int, dict] = {}
    for row in reader:
        if row.get("situation") != "all":
            continue
        pid = int(row["playerId"])
        result[pid] = row
    print(f"    {len(result)} goalie rows loaded")
    return result

# ─── Stat extraction helpers ────────────────────────────────────────────────────

def _f(row: dict, key: str, default: float = 0.0) -> float:
    """Safe float from CSV row."""
    try:
        return float(row.get(key) or 0)
    except (ValueError, TypeError):
        return default

def _per60(raw: float, icetime_min: float) -> float:
    if icetime_min < 1:
        return 0.0
    return round(raw / icetime_min * 60, 3)

def skater_mp_stats(row: dict) -> dict:
    ice = _f(row, "icetime")          # seconds on ice (MoneyPuck uses seconds)
    ice_min = ice / 60.0
    fo_won  = _f(row, "faceoffsWon")
    fo_lost = _f(row, "faceoffsLost")
    xgf     = _f(row, "OnIce_F_xGoals")
    xga     = _f(row, "OnIce_A_xGoals")
    return {
        "icetime_sec": round(ice),
        "goals_per60":     _per60(_f(row, "I_F_goals"),               ice_min),
        "a1_per60":        _per60(_f(row, "I_F_primaryAssists"),       ice_min),
        "a2_per60":        _per60(_f(row, "I_F_secondaryAssists"),     ice_min),
        "xGF_per60":       _per60(xgf,                                 ice_min),
        "xGA_per60":       _per60(xga,                                 ice_min),
        "shots_per60":     _per60(_f(row, "I_F_shotsOnGoal"),          ice_min),
        "hits_per60":      _per60(_f(row, "I_F_hits"),                 ice_min),
        "blocks_per60":    _per60(_f(row, "shotsBlockedByPlayer"),     ice_min),
        "takeaways_per60": _per60(_f(row, "I_F_takeaways"),            ice_min),
        "giveaways_per60": _per60(_f(row, "I_F_giveaways"),           ice_min),
        "pim_per60":       _per60(_f(row, "I_F_penalityMinutes"),      ice_min),
        "ind_xG_per60":    _per60(_f(row, "I_F_xGoals"),               ice_min),
        "faceoff_pct":     round(fo_won / max(fo_won + fo_lost, 1) * 100, 1),
        "corsi_pct":       round(_f(row, "onIce_corsiPercentage"), 3),
        "fenwick_pct":     round(_f(row, "onIce_fenwickPercentage"), 3),
        "xG_pct":          round(_f(row, "onIce_xGoalsPercentage"), 3),
    }

def goalie_mp_stats(row: dict) -> dict:
    ice          = _f(row, "icetime")
    ice_min      = ice / 60.0
    shots        = _f(row, "ongoal")              # shots on goal against
    goals        = _f(row, "goals")               # goals against
    xgoals       = _f(row, "xGoals")              # expected goals against
    hd_shots     = _f(row, "highDangerShots")
    hd_goals     = _f(row, "highDangerGoals")
    md_shots     = _f(row, "mediumDangerShots")
    md_goals     = _f(row, "mediumDangerGoals")
    saves        = shots - goals
    return {
        "icetime_sec":        round(ice),
        "games_played":       int(_f(row, "games_played")),
        "gaa":                round(goals / max(ice_min / 60, 1), 3),
        "sv_pct":             round(saves / max(shots, 1), 4),
        "xsv_pct":            round(1 - xgoals / max(shots, 1), 4),
        "gsaa":               round(xgoals - goals, 2),   # positive = better
        "high_danger_sv_pct": round(1 - hd_goals / max(hd_shots, 1), 4),
        "med_danger_sv_pct":  round(1 - md_goals / max(md_shots, 1), 4),
    }

# ─── NHL roster fetcher ─────────────────────────────────────────────────────────

def map_position(pos_code: str) -> str:
    mapping = {"C": "C", "L": "LW", "R": "RW", "D": "D", "G": "G"}
    return mapping.get(pos_code, pos_code)

def age_from_birthdate(birth: str) -> int:
    """birth = 'YYYY-MM-DD'. Returns age as of 2025-10-01 (start of 25-26 season)."""
    try:
        by, bm, bd = map(int, birth.split("-"))
        season_start = (2025, 10, 1)
        age = season_start[0] - by
        if (bm, bd) > season_start[1:]:
            age -= 1
        return age
    except Exception:
        return 25

def fetch_team_roster(tricode: str,
                      mp_skaters: dict[int, dict],
                      mp_goalies: dict[int, dict]) -> list[dict]:
    url = f"{NHL_BASE}/roster/{tricode}/current"
    data = fetch_json(url)

    players = []
    for group in ("forwards", "defensemen", "goalies"):
        for p in data.get(group, []):
            pid = p["id"]
            pos_raw = p.get("positionCode", "C")
            pos = map_position(pos_raw)
            birth = p.get("birthDate", "2000-01-01")
            age = age_from_birthdate(birth)

            player: dict = {
                "nhlId": pid,
                "firstName": p.get("firstName", {}).get("default", ""),
                "lastName":  p.get("lastName",  {}).get("default", ""),
                "sweaterNumber": p.get("sweaterNumber"),
                "position": pos,
                "handedness": p.get("shootsCatches", "R"),
                "age": age,
                "birthDate": birth,
                "heightCm": p.get("heightInCm"),
                "weightKg": p.get("weightInKg"),
                "birthCountry": p.get("birthCountry", ""),
            }

            if group == "goalies":
                mp = mp_goalies.get(pid)
                player["mp"] = goalie_mp_stats(mp) if mp else None
            else:
                mp = mp_skaters.get(pid)
                player["mp"] = skater_mp_stats(mp) if mp else None

            players.append(player)

    return players

# ─── Main ───────────────────────────────────────────────────────────────────────

def main():
    print("=== Phase 0: Fetch real NHL data ===\n")

    # 1. MoneyPuck (single fetch each)
    try:
        mp_skaters = load_moneypuck_skaters()
    except Exception as e:
        print(f"  WARNING: Could not fetch MoneyPuck skaters: {e}")
        mp_skaters = {}

    try:
        mp_goalies = load_moneypuck_goalies()
    except Exception as e:
        print(f"  WARNING: Could not fetch MoneyPuck goalies: {e}")
        mp_goalies = {}

    print()

    # 2. NHL API – one team at a time
    out_teams = []
    errors = []

    for (tricode, city, name, conference, division) in TEAMS:
        print(f"  [{tricode}] {city} {name}…", end=" ", flush=True)
        try:
            roster = fetch_team_roster(tricode, mp_skaters, mp_goalies)
            mp_hits = sum(1 for p in roster if p["mp"] is not None)
            print(f"{len(roster)} players, {mp_hits} with MoneyPuck stats")
            out_teams.append({
                "tricode":    tricode,
                "city":       city,
                "name":       name,
                "conference": conference,
                "division":   division,
                "roster":     roster,
            })
        except Exception as e:
            print(f"ERROR: {e}")
            errors.append((tricode, str(e)))
        time.sleep(0.15)   # be polite to the API

    print()

    # 3. Write JSON
    payload = {
        "meta": {
            "season":       "2025-26",
            "mpSeason":     MONEYPUCK_YEAR,
            "fetchedAt":    __import__("datetime").datetime.utcnow().isoformat() + "Z",
            "teams":        len(out_teams),
            "errors":       errors,
        },
        "teams": out_teams,
    }

    OUT_PATH.parent.mkdir(parents=True, exist_ok=True)
    with open(OUT_PATH, "w", encoding="utf-8") as f:
        json.dump(payload, f, indent=2, ensure_ascii=False)

    print(f"Wrote {OUT_PATH}  ({OUT_PATH.stat().st_size // 1024} KB)")

    # 4. Summary
    total_players = sum(len(t["roster"]) for t in out_teams)
    total_mp      = sum(sum(1 for p in t["roster"] if p["mp"] is not None) for t in out_teams)
    print(f"\nSummary: {len(out_teams)}/32 teams · {total_players} players · "
          f"{total_mp} with MoneyPuck stats ({total_mp*100//max(total_players,1)}%)")
    if errors:
        print(f"\nErrors ({len(errors)}):")
        for (tc, msg) in errors:
            print(f"  {tc}: {msg}")

    return 0 if not errors else 1

if __name__ == "__main__":
    sys.exit(main())
