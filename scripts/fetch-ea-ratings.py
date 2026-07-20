"""
Seed script: fetch EA NHL 26 ratings + MoneyPuck per-60 stats → data/ratings/skaters.csv + goalies.csv

Run with:  python3 scripts/fetch-ea-ratings.py
"""

import json
import math
import os
import random
import bisect
import re
import sys
import urllib.request
from pathlib import Path

ROOT = Path(__file__).parent.parent
DATA_DIR = ROOT / "data"
RATINGS_DIR = DATA_DIR / "ratings"
RATINGS_DIR.mkdir(parents=True, exist_ok=True)

LAST_VERIFIED_EA = "2026-07-20"

# ─────────────────────────────────────────────────────────────────────────────
# 1. Fetch EA data
# ─────────────────────────────────────────────────────────────────────────────

EA_BASE_URL = "https://www.ea.com/games/nhl/ratings"

import time

_EA_HEADERS = {
    "User-Agent": (
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
        "AppleWebKit/537.36 (KHTML, like Gecko) "
        "Chrome/124.0.0.0 Safari/537.36"
    ),
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    "Accept-Language": "en-US,en;q=0.5",
}


def _fetch_page_html(page: int, retry: bool = True) -> str | None:
    """Fetch one EA ratings page (1-indexed). Returns raw HTML or None on failure."""
    url = EA_BASE_URL if page == 1 else f"{EA_BASE_URL}?page={page}"
    req = urllib.request.Request(url, headers=_EA_HEADERS)
    try:
        with urllib.request.urlopen(req, timeout=25) as resp:
            return resp.read().decode("utf-8", errors="replace")
    except Exception as e:
        if retry:
            print(f"[ea]  page {page}: fetch failed ({e}), retrying in 2 s…")
            time.sleep(2)
            return _fetch_page_html(page, retry=False)
        print(f"[ea]  page {page}: fetch failed twice ({e}), skipping")
        return None


def _extract_items(html: str, page: int) -> list[dict]:
    """Pull player items out of __NEXT_DATA__ on a single page's HTML."""
    m = re.search(r'<script\s+id="__NEXT_DATA__"[^>]*>(.*?)</script>', html, re.DOTALL)
    if not m:
        print(f"[ea]  page {page}: __NEXT_DATA__ not found")
        return []
    try:
        blob = json.loads(m.group(1))
    except json.JSONDecodeError as e:
        print(f"[ea]  page {page}: JSON parse error ({e})")
        return []
    try:
        return blob["props"]["pageProps"]["ratingDetails"]["items"] or []
    except (KeyError, TypeError):
        # Some pages use a different key path on page > 1 — try alternate paths
        try:
            return blob["props"]["pageProps"]["ratingDetails"]["players"] or []
        except (KeyError, TypeError):
            print(f"[ea]  page {page}: unexpected JSON structure, keys={list(blob.get('props', {}).get('pageProps', {}).keys())}")
            return []


def fetch_ea_players() -> list[dict]:
    """
    Paginate through all EA NHL 26 ratings pages (?page=1, ?page=2, …).
    Stops when a page returns zero new players (duplicate check by name).
    Returns the combined list of all player dicts.
    """
    all_items: list[dict] = []
    seen_names: set[tuple[str, str]] = set()
    printed_stat_keys = False

    for page in range(1, 50):  # hard ceiling of 50 pages as a safety valve
        html = _fetch_page_html(page)
        if html is None:
            print(f"[ea]  page {page}: skipping (fetch failed)")
            # One failed page doesn't end the run — try next
            time.sleep(0.4)
            continue

        items = _extract_items(html, page)
        if not items:
            print(f"[ea]  page {page}: 0 items — treating as end of results, stopping")
            break

        # Print stat keys once so we can verify mapping
        if not printed_stat_keys and items:
            stat_keys = list((items[0].get("stats") or {}).keys())
            print(f"[ea]  Stat keys on first player: {stat_keys}")
            printed_stat_keys = True

        # Deduplicate by name — stop if this whole page is already known
        new_this_page = 0
        for item in items:
            key = (
                (item.get("firstName") or "").lower().strip(),
                (item.get("lastName") or "").lower().strip(),
            )
            if key not in seen_names:
                seen_names.add(key)
                all_items.append(item)
                new_this_page += 1

        print(f"[ea]  page {page}: found {len(items)} players ({new_this_page} new), running total {len(all_items)}")

        if new_this_page == 0:
            print(f"[ea]  page {page}: all players already seen — end of results")
            break

        time.sleep(0.35)  # polite delay between pages

    print(f"[ea]  Done — {len(all_items)} unique players fetched across all pages")
    return all_items


# ─────────────────────────────────────────────────────────────────────────────
# 2. Load real-league JSON
# ─────────────────────────────────────────────────────────────────────────────

def load_real_league() -> dict:
    p = DATA_DIR / "real-league-2025-26.json"
    with open(p) as f:
        return json.load(f)


# ─────────────────────────────────────────────────────────────────────────────
# 3. Helpers
# ─────────────────────────────────────────────────────────────────────────────

def clamp(n: float, lo: int = 30, hi: int = 99) -> int:
    return max(lo, min(hi, round(n)))

def pct_rank(val: float, sorted_asc: list[float]) -> float:
    if not sorted_asc:
        return 0.5
    lo = bisect.bisect_right(sorted_asc, val)
    return min(lo / len(sorted_asc), 1.0)

RATING_CURVE: list[tuple[float, float]] = [
    (0.00, 65),
    (0.10, 69),
    (0.30, 74),
    (0.50, 80),
    (0.75, 85),
    (0.85, 88),
    (0.92, 91),
    (0.96, 93),
    (0.99, 95),
    (1.00, 97),
]

def pct_to_rating(pct: float) -> float:
    p = max(0.0, min(1.0, pct))
    for i in range(1, len(RATING_CURVE)):
        p0, v0 = RATING_CURVE[i - 1]
        p1, v1 = RATING_CURVE[i]
        if p <= p1:
            return v0 + (v1 - v0) * (p - p0) / (p1 - p0)
    return RATING_CURVE[-1][1]

def A(composite: float) -> int:
    return clamp(round(pct_to_rating(composite)) + random.randint(-3, 3))

FULL_ICE_S = 54_000
FULL_GOALIE_GP = 55
MIN_ICE_S = 30_000
MIN_GP_G = 15


def build_sorted(players: list[dict], keys_fn: dict) -> dict[str, list[float]]:
    """Build sorted ascending arrays for each stat key."""
    out: dict[str, list[float]] = {k: [] for k in keys_fn}
    for p in players:
        mp = p.get("mp")
        if not mp:
            continue
        for k, getter in keys_fn.items():
            v = getter(mp)
            if v is not None and math.isfinite(v):
                out[k].append(v)
    for k in out:
        out[k].sort()
    return out


SKATER_GETTERS = {
    "goals":     lambda mp: mp.get("goals_per60"),
    "a1":        lambda mp: mp.get("a1_per60"),
    "a2":        lambda mp: mp.get("a2_per60"),
    "xGF":       lambda mp: mp.get("xGF_per60"),
    "xGA":       lambda mp: mp.get("xGA_per60"),
    "shots":     lambda mp: mp.get("shots_per60"),
    "hits":      lambda mp: mp.get("hits_per60"),
    "blocks":    lambda mp: mp.get("blocks_per60"),
    "takeaways": lambda mp: mp.get("takeaways_per60"),
    "giveaways": lambda mp: mp.get("giveaways_per60"),
    "pim":       lambda mp: mp.get("pim_per60"),
    "indxG":     lambda mp: mp.get("ind_xG_per60"),
    "faceoff":   lambda mp: mp.get("faceoff_pct"),
    "corsi":     lambda mp: mp.get("corsi_pct"),
    "xGpct":     lambda mp: mp.get("xG_pct"),
}

GOALIE_GETTERS = {
    "sv":   lambda mp: mp.get("sv_pct"),
    "gsaa": lambda mp: mp.get("gsaa"),
    "hdsv": lambda mp: mp.get("high_danger_sv_pct"),
    "mdsv": lambda mp: mp.get("med_danger_sv_pct"),
    "gaa":  lambda mp: mp.get("gaa"),
}


def compute_skater_pcts(mp: dict, sorted_stats: dict) -> dict[str, float]:
    shrink = min(1.0, (mp.get("icetime_sec") or 0) / FULL_ICE_S)
    def r(key: str, val: float) -> float:
        raw = pct_rank(val, sorted_stats.get(key, []))
        return raw * shrink + 0.5 * (1 - shrink)
    return {
        "goals":     r("goals",     mp.get("goals_per60", 0) or 0),
        "a1":        r("a1",        mp.get("a1_per60", 0) or 0),
        "a2":        r("a2",        mp.get("a2_per60", 0) or 0),
        "xGF":       r("xGF",       mp.get("xGF_per60", 0) or 0),
        "xGA":       r("xGA",       mp.get("xGA_per60", 0) or 0),
        "shots":     r("shots",     mp.get("shots_per60", 0) or 0),
        "hits":      r("hits",      mp.get("hits_per60", 0) or 0),
        "blocks":    r("blocks",    mp.get("blocks_per60", 0) or 0),
        "takeaways": r("takeaways", mp.get("takeaways_per60", 0) or 0),
        "giveaways": r("giveaways", mp.get("giveaways_per60", 0) or 0),
        "pim":       r("pim",       mp.get("pim_per60", 0) or 0),
        "indxG":     r("indxG",     mp.get("ind_xG_per60", 0) or 0),
        "faceoff":   r("faceoff",   mp.get("faceoff_pct", 0) or 0),
        "corsi":     r("corsi",     mp.get("corsi_pct", 0) or 0),
        "xGpct":     r("xGpct",     mp.get("xG_pct", 0) or 0),
    }


def compute_goalie_pcts(mp: dict, sorted_stats: dict) -> dict[str, float]:
    shrink = min(1.0, (mp.get("games_played") or 0) / FULL_GOALIE_GP)
    def r(key: str, val: float, invert: bool = False) -> float:
        raw = pct_rank(val, sorted_stats.get(key, []))
        if invert:
            raw = 1 - raw
        return raw * shrink + 0.5 * (1 - shrink)
    return {
        "sv":   r("sv",   mp.get("sv_pct", 0) or 0),
        "gsaa": r("gsaa", mp.get("gsaa", 0) or 0),
        "hdsv": r("hdsv", mp.get("high_danger_sv_pct", 0) or 0),
        "mdsv": r("mdsv", mp.get("med_danger_sv_pct", 0) or 0),
        "gaa":  r("gaa",  mp.get("gaa", 0) or 0, invert=True),
    }


def skater_master_pct(pcts: dict, is_fwd: bool) -> float:
    g = pcts["goals"]; a1 = pcts["a1"]; indxG = pcts["indxG"]
    xGF = pcts["xGF"]; corsi = pcts["corsi"]
    takeaways = pcts["takeaways"]; giveaways = pcts["giveaways"]
    blocks = pcts["blocks"]; xGpct = pcts["xGpct"]
    if is_fwd:
        return (g * 0.30 + a1 * 0.25 + indxG * 0.20 + xGF * 0.15 +
                corsi * 0.05 + takeaways * 0.03 + (1 - giveaways) * 0.02)
    return (a1 * 0.25 + corsi * 0.18 + xGpct * 0.18 + blocks * 0.12 +
            takeaways * 0.15 + (1 - giveaways) * 0.07 + xGF * 0.05)


def goalie_master_pct(pcts: dict) -> float:
    return pcts["gsaa"] * 0.40 + pcts["sv"] * 0.25 + pcts["hdsv"] * 0.25 + pcts["gaa"] * 0.10


# ─────────────────────────────────────────────────────────────────────────────
# Archetype detection
# ─────────────────────────────────────────────────────────────────────────────

def detect_fwd_archetype(pcts: dict) -> str:
    goals = pcts["goals"]; a1 = pcts["a1"]
    hits = pcts["hits"]; pim = pcts["pim"]
    takeaways = pcts["takeaways"]; giveaways = pcts["giveaways"]
    has_points = goals > 0.42 or a1 > 0.42
    is_shutdown = takeaways > 0.55 and (1 - giveaways) > 0.50
    if pim > 0.72 and hits > 0.70 and not has_points:
        return "Enforcer"
    if hits > 0.72 and not has_points:
        return "Grinder"
    if goals > 0.62 and goals > a1 + 0.14:
        return "Sniper"
    if a1 > 0.62 and a1 > goals + 0.14:
        return "Playmaker"
    if hits > 0.60 and has_points:
        return "Power Forward"
    return "Two-Way Forward"


def detect_d_archetype(pcts: dict) -> str:
    a1 = pcts["a1"]; xGpct = pcts["xGpct"]
    blocks = pcts["blocks"]; takeaways = pcts["takeaways"]
    hits = pcts["hits"]; pim = pcts["pim"]
    is_offensive = a1 > 0.55 or xGpct > 0.55
    is_shutdown = blocks > 0.60 and takeaways > 0.50
    if hits > 0.70 and pim > 0.65 and not is_offensive:
        return "Enforcer Defenseman"
    if is_offensive and not is_shutdown:
        return "Offensive Defenseman"
    if is_shutdown and not is_offensive:
        return "Defensive Defenseman"
    return "Two-Way Defenseman"


def detect_goalie_archetype() -> str:
    roll = random.random()
    if roll < 0.45:
        return "Butterfly Goalie"
    if roll < 0.80:
        return "Hybrid Goalie"
    if roll < 0.93:
        return "Standup Goalie"
    return "Puck-Handling Goalie"


# ─────────────────────────────────────────────────────────────────────────────
# Attribute builders
# ─────────────────────────────────────────────────────────────────────────────

def skater_attrs_from_pcts(pcts: dict, pos: str) -> dict[str, int]:
    goals = pcts["goals"]; a1 = pcts["a1"]; a2 = pcts["a2"]
    xGF = pcts["xGF"]; shots = pcts["shots"]; hits = pcts["hits"]
    blocks = pcts["blocks"]; takeaways = pcts["takeaways"]; giveaways = pcts["giveaways"]
    pim = pcts["pim"]; indxG = pcts["indxG"]; faceoff = pcts["faceoff"]
    corsi = pcts["corsi"]; xGpct = pcts["xGpct"]; xGA = pcts["xGA"]

    off   = goals * 0.30 + xGF * 0.30 + a1 * 0.25 + indxG * 0.15
    shoot = goals * 0.50 + shots * 0.30 + indxG * 0.20
    play  = a1 * 0.55    + a2 * 0.25    + xGF * 0.20
    def_  = takeaways * 0.40 + (1 - giveaways) * 0.30 + blocks * 0.20 + corsi * 0.10
    poss  = corsi * 0.50 + xGpct * 0.50
    phys  = hits * 0.65  + pim * 0.35

    return {
        "wristShotAccuracy": A(shoot * 0.70 + off * 0.30),
        "wristShotPower":    A(shoot * 0.50 + shots * 0.30 + off * 0.20),
        "slapShotAccuracy":  A(shoot * 0.40 + off * 0.40 + shots * 0.20),
        "slapShotPower":     A(off * 0.40 + phys * 0.30 + shots * 0.30),
        "deking":            A(off * 0.50 + play * 0.50),
        "handEye":           A(play * 0.60 + shoot * 0.40),
        "passing":           A(play),
        "puckControl":       A(play * 0.50 + poss * 0.50),
        "discipline":        A(1 - pim),
        "offAwareness":      A(off),
        "poise":             A(poss * 0.50 + play * 0.30 + (1 - giveaways) * 0.20),
        "defAwareness":      A(def_),
        "faceoffs":          A(faceoff) if pos == "C" else clamp(30 + random.randint(-4, 4)),
        "shotBlocking":      A(blocks * 0.80 + def_ * 0.20),
        "stickChecking":     A(takeaways * 0.65 + (1 - giveaways) * 0.35),
        "acceleration":      A(poss * 0.60 + off * 0.40),
        "agility":           A(poss * 0.60 + off * 0.40),
        "balance":           A(poss * 0.60 + (1 - pim) * 0.40),
        "endurance":         clamp(55 + random.randint(-10, 10)),
        "speed":             A(poss * 0.50 + off * 0.50),
        "aggressiveness":    A(phys),
        "bodyChecking":      A(phys * 0.75 + def_ * 0.25),
        "durability":        clamp(60 + random.randint(-10, 10)),
        "fightingSkill":     clamp(round(pct_to_rating(pim * 0.30 + random.random() * 0.70)) + random.randint(-3, 3)),
        "strength":          A(phys * 0.50 + (1 - (1 - xGA)) * 0.50),
    }


def goalie_attrs_from_pcts(pcts: dict) -> dict[str, int]:
    sv = pcts["sv"]; gsaa = pcts["gsaa"]; hdsv = pcts["hdsv"]
    mdsv = pcts["mdsv"]; gaa = pcts["gaa"]
    overall_c = sv * 0.35 + gsaa * 0.25 + hdsv * 0.25 + gaa * 0.15
    return {
        "positioning":    A(sv * 0.50 + overall_c * 0.50),
        "angles":         A(sv * 0.50 + gaa * 0.50),
        "fiveHole":       A(hdsv * 0.60 + overall_c * 0.40),
        "gloveSave":      A(sv * 0.50 + hdsv * 0.50),
        "blockerSave":    A(sv * 0.50 + mdsv * 0.50),
        "quickness":      A(hdsv * 0.65 + gsaa * 0.35),
        "reboundControl": A(overall_c * 0.50 + sv * 0.50),
        "puckHandling":   clamp(55 + random.randint(-12, 12)),
        "passing":        clamp(50 + random.randint(-12, 12)),
        "poise":          A(overall_c * 0.60 + gsaa * 0.40),
        "consistency":    A(sv * 0.70 + gsaa * 0.30),
        "aggressiveness": clamp(50 + random.randint(-12, 12)),
        "flexibility":    A(overall_c * 0.50 + random.random() * 0.50),
        "endurance":      clamp(60 + random.randint(-8, 8)),
        "durability":     clamp(60 + random.randint(-8, 8)),
    }


# ─────────────────────────────────────────────────────────────────────────────
# EA stat key mapping
# ─────────────────────────────────────────────────────────────────────────────

def get_ea_stat(stats: dict, *keys: str) -> int:
    """Try each key in order, return int value or 0.
    EA stat values are either a plain number or {'value': N, 'diff': N} dicts.
    """
    for k in keys:
        if k in stats and stats[k] is not None:
            v = stats[k]
            if isinstance(v, dict):
                v = v.get("value", 0) or 0
            try:
                return int(v)
            except (TypeError, ValueError):
                return 0
    return 0


def ea_skater_attrs(stats: dict, overall: int) -> dict[str, int]:
    def fill(val: int) -> int:
        if val == 0:
            return clamp(max(65, min(99, round(overall * 0.9 + random.randint(-5, 5)))))
        return val

    # EA actual key names (from __NEXT_DATA__ inspection):
    # handeye, slapshotAccuracy, slapshotPower, wristshotAccuracy, wristshotPower,
    # defensiveAwareness, offensiveAwareness, faceoffs, aggression, fightingSkill
    raw = {
        "deking":           get_ea_stat(stats, "deking", "dek"),
        "handEye":          get_ea_stat(stats, "handeye", "handEye"),
        "passing":          get_ea_stat(stats, "passing"),
        "puckControl":      get_ea_stat(stats, "puckControl"),
        "discipline":       get_ea_stat(stats, "discipline"),
        "offAwareness":     get_ea_stat(stats, "offensiveAwareness", "offAwareness"),
        "poise":            get_ea_stat(stats, "poise"),
        "slapShotAccuracy": get_ea_stat(stats, "slapshotAccuracy", "slapShotAccuracy", "slapAcc"),
        "slapShotPower":    get_ea_stat(stats, "slapshotPower", "slapShotPower", "slapPow"),
        "wristShotAccuracy":get_ea_stat(stats, "wristshotAccuracy", "wristShotAccuracy", "wristAcc"),
        "wristShotPower":   get_ea_stat(stats, "wristshotPower", "wristShotPower", "wristPow"),
        "defAwareness":     get_ea_stat(stats, "defensiveAwareness", "defAwareness"),
        "faceoffs":         get_ea_stat(stats, "faceoffs", "faceoffAbility"),
        "shotBlocking":     get_ea_stat(stats, "shotBlocking"),
        "stickChecking":    get_ea_stat(stats, "stickChecking"),
        "acceleration":     get_ea_stat(stats, "acceleration"),
        "agility":          get_ea_stat(stats, "agility"),
        "balance":          get_ea_stat(stats, "balance"),
        "endurance":        get_ea_stat(stats, "endurance"),
        "speed":            get_ea_stat(stats, "speed"),
        "aggressiveness":   get_ea_stat(stats, "aggressiveness", "aggression"),
        "bodyChecking":     get_ea_stat(stats, "bodyChecking"),
        "durability":       get_ea_stat(stats, "durability"),
        "fightingSkill":    get_ea_stat(stats, "fightingSkill", "fightingAbility"),
        "strength":         get_ea_stat(stats, "strength"),
    }
    return {k: fill(v) for k, v in raw.items()}


def ea_goalie_attrs(stats: dict, overall: int) -> dict[str, int]:
    def fill(val: int) -> int:
        if val == 0:
            return clamp(max(65, min(99, round(overall * 0.9 + random.randint(-5, 5)))))
        return val

    # EA goalie actual keys: glovesideHigh, sticksideHigh, fiveHole,
    # puckplayingFrequency, angles, reboundControl, breakaway, aggressiveness, vision
    raw = {
        "positioning":    get_ea_stat(stats, "positioning", "breakaway"),
        "angles":         get_ea_stat(stats, "angles"),
        "fiveHole":       get_ea_stat(stats, "fiveHole"),
        "gloveSave":      get_ea_stat(stats, "glovesideHigh", "gloveSave", "gloveHigh"),
        "blockerSave":    get_ea_stat(stats, "sticksideHigh", "blockerSave", "blockerHigh"),
        "quickness":      get_ea_stat(stats, "quickness", "reflexes", "vision"),
        "reboundControl": get_ea_stat(stats, "reboundControl"),
        "puckHandling":   get_ea_stat(stats, "puckplayingFrequency", "puckHandling"),
        "passing":        get_ea_stat(stats, "passing"),
        "poise":          get_ea_stat(stats, "poise"),
        "consistency":    get_ea_stat(stats, "consistency"),
        "aggressiveness": get_ea_stat(stats, "aggressiveness", "aggression"),
        "flexibility":    get_ea_stat(stats, "flexibility"),
        "endurance":      get_ea_stat(stats, "endurance"),
        "durability":     get_ea_stat(stats, "durability"),
    }
    return {k: fill(v) for k, v in raw.items()}


# ─────────────────────────────────────────────────────────────────────────────
# EA archetype mapping
# ─────────────────────────────────────────────────────────────────────────────

FWD_ARCHETYPE_MAP = {
    "sniper":         "Sniper",
    "playmaker":      "Playmaker",
    "power forward":  "Power Forward",
    "two-way forward":"Two-Way Forward",
    "two way forward":"Two-Way Forward",
    "enforcer":       "Enforcer",
    "grinder":        "Grinder",
}
D_ARCHETYPE_MAP = {
    "offensive":          "Offensive Defenseman",
    "offensive defenseman":"Offensive Defenseman",
    "defensive":          "Defensive Defenseman",
    "defensive defenseman":"Defensive Defenseman",
    "two-way":            "Two-Way Defenseman",
    "two way":            "Two-Way Defenseman",
    "enforcer defenseman":"Enforcer Defenseman",
    "enforcer":           "Enforcer Defenseman",
}
G_ARCHETYPE_MAP = {
    "butterfly":        "Butterfly Goalie",
    "butterfly goalie": "Butterfly Goalie",
    "hybrid":           "Hybrid Goalie",
    "hybrid goalie":    "Hybrid Goalie",
    "standup":          "Standup Goalie",
    "standup goalie":   "Standup Goalie",
    "puck-handling":    "Puck-Handling Goalie",
    "puck handling":    "Puck-Handling Goalie",
}

def map_ea_archetype(ea_style: str | None, is_goalie: bool, is_d: bool) -> str | None:
    if not ea_style:
        return None
    s = ea_style.lower().strip()
    if is_goalie:
        return G_ARCHETYPE_MAP.get(s)
    if is_d:
        return D_ARCHETYPE_MAP.get(s)
    return FWD_ARCHETYPE_MAP.get(s)


# ─────────────────────────────────────────────────────────────────────────────
# Player ID slug
# ─────────────────────────────────────────────────────────────────────────────

def player_slug(first: str, last: str) -> str:
    return f"{last.lower().replace(' ', '-')}-{first.lower().replace(' ', '-')}"


# ─────────────────────────────────────────────────────────────────────────────
# Position mapping
# ─────────────────────────────────────────────────────────────────────────────

def map_position(nhl_pos: str, hand: str) -> str:
    if nhl_pos == "G":
        return "G"
    if nhl_pos == "D":
        return "RD" if hand == "R" else "LD"
    return nhl_pos  # C, LW, RW


# ─────────────────────────────────────────────────────────────────────────────
# Main
# ─────────────────────────────────────────────────────────────────────────────

def main():
    random.seed(42)  # reproducible but still varied

    # Load sources
    ea_items = fetch_ea_players()
    real_league = load_real_league()
    all_players = [p for t in real_league["teams"] for p in t["roster"]]

    # Name aliases: EA name (lower) → NHL API name (lower).
    # Handles common nickname/full-name mismatches between the two sources.
    EA_NAME_ALIASES: dict[tuple[str, str], tuple[str, str]] = {
        ("john-jason", "peterka"):    ("jj", "peterka"),
        ("matthew",    "boldy"):      ("matt", "boldy"),
        ("michael",    "matheson"):   ("mike", "matheson"),
        ("christopher","tanev"):      ("chris", "tanev"),
        ("gabe",       "vilardi"):    ("gabriel", "vilardi"),
        ("jacob",      "middleton"):  ("jake", "middleton"),
    }

    # Build EA lookup: (firstName.lower, lastName.lower) → ea player
    # Also register aliases so lookups using the NHL API name hit the EA row.
    ea_lookup: dict[tuple[str, str], dict] = {}
    for item in ea_items:
        key = (
            (item.get("firstName") or "").lower().strip(),
            (item.get("lastName") or "").lower().strip(),
        )
        if key[0] and key[1]:
            ea_lookup[key] = item
            # If this EA name has an alias, also register the canonical (NHL API) name
            if key in EA_NAME_ALIASES:
                ea_lookup[EA_NAME_ALIASES[key]] = item

    print(f"[ea]  Unique EA players by name: {len(ea_lookup)}")

    # Build name → handedness lookup from real-league
    name_to_hand: dict[tuple[str, str], str] = {}
    for p in all_players:
        key = (p["firstName"].lower(), p["lastName"].lower())
        name_to_hand[key] = p.get("handedness", "L") or "L"

    # ── Build position pools for percentile ranking ──────────────────────────
    def qual_skater(p: dict) -> bool:
        mp = p.get("mp")
        return bool(mp and (mp.get("icetime_sec") or 0) >= MIN_ICE_S)

    def qual_goalie(p: dict) -> bool:
        mp = p.get("mp")
        return bool(mp and (mp.get("games_played") or 0) >= MIN_GP_G)

    center_pool  = [p for p in all_players if p["position"] == "C" and qual_skater(p)]
    winger_pool  = [p for p in all_players if p["position"] in ("LW", "RW") and qual_skater(p)]
    d_pool       = [p for p in all_players if p["position"] == "D" and qual_skater(p)]
    goalie_pool  = [p for p in all_players if p["position"] == "G" and qual_goalie(p)]

    c_sorted  = build_sorted(center_pool, SKATER_GETTERS)
    w_sorted  = build_sorted(winger_pool, SKATER_GETTERS)
    d_sorted  = build_sorted(d_pool,      SKATER_GETTERS)
    g_sorted  = build_sorted(goalie_pool, GOALIE_GETTERS)

    # Pre-pass: build composite distributions for re-ranking
    fwd_composites: list[float] = []
    def_composites: list[float] = []
    goalie_composites: list[float] = []

    for p in all_players:
        mp = p.get("mp")
        if not mp:
            continue
        pos = p["position"]
        if pos == "G":
            if qual_goalie(p):
                pcts = compute_goalie_pcts(mp, g_sorted)
                goalie_composites.append(goalie_master_pct(pcts))
        else:
            if not qual_skater(p):
                continue
            ss = c_sorted if pos == "C" else (w_sorted if pos in ("LW", "RW") else d_sorted)
            pcts = compute_skater_pcts(mp, ss)
            is_fwd = pos != "D"
            if is_fwd:
                fwd_composites.append(skater_master_pct(pcts, True))
            else:
                def_composites.append(skater_master_pct(pcts, False))

    fwd_composites.sort()
    def_composites.sort()
    goalie_composites.sort()

    # ── Process each player ──────────────────────────────────────────────────
    skater_rows: list[dict] = []
    goalie_rows: list[dict] = []
    n_ea = 0
    n_est = 0

    for team in real_league["teams"]:
        for rp in team["roster"]:
            first = rp["firstName"]
            last  = rp["lastName"]
            nhl_id = rp["nhlId"]
            nhl_pos = rp["position"]
            hand = rp.get("handedness") or "L"
            age  = rp.get("age", 25)
            game_pos = map_position(nhl_pos, hand)
            is_goalie = nhl_pos == "G"
            is_d = nhl_pos == "D"
            is_fwd = nhl_pos in ("C", "LW", "RW")

            ea_key = (first.lower(), last.lower())
            ea_player = ea_lookup.get(ea_key)

            slug = player_slug(first, last)

            if ea_player:
                # ── EA official row ──────────────────────────────────────────
                n_ea += 1
                overall = int(ea_player.get("overallRating") or 75)
                ea_stats = ea_player.get("stats") or {}

                # Archetype
                style_id = None
                style = ea_player.get("playerStyle")
                if isinstance(style, dict):
                    style_id = style.get("id") or style.get("label")
                elif isinstance(style, str):
                    style_id = style
                archetype = map_ea_archetype(style_id, is_goalie, is_d)

                # Handedness: prefer real-league data
                ea_hand = hand  # already have it from real-league

                # EA position
                ea_pos_obj = ea_player.get("position")
                ea_pos_str = ""
                if isinstance(ea_pos_obj, dict):
                    ea_pos_str = ea_pos_obj.get("shortLabel") or ""
                elif isinstance(ea_pos_obj, str):
                    ea_pos_str = ea_pos_obj

                team_label = ""
                ea_team = ea_player.get("team")
                if isinstance(ea_team, dict):
                    team_label = ea_team.get("label") or team["tricode"]
                else:
                    team_label = team["tricode"]

                potential = clamp(overall + random.randint(-3, 8), 30, 99)

                if is_goalie:
                    attrs = ea_goalie_attrs(ea_stats, overall)
                    if not archetype:
                        archetype = detect_goalie_archetype()
                    goalie_rows.append({
                        "playerId": slug, "nhlId": nhl_id,
                        "firstName": first, "lastName": last,
                        "team": team["tricode"], "position": "G",
                        "handedness": ea_hand, "age": age,
                        "overall": overall, "potential": potential,
                        "archetype": archetype,
                        "ratingSource": "ea_official",
                        "lastVerified": LAST_VERIFIED_EA,
                        **attrs,
                    })
                else:
                    attrs = ea_skater_attrs(ea_stats, overall)
                    if not archetype:
                        # Fall back to MoneyPuck-based detection if we have mp
                        mp = rp.get("mp")
                        if mp:
                            ss = c_sorted if nhl_pos == "C" else (w_sorted if nhl_pos in ("LW", "RW") else d_sorted)
                            pcts = compute_skater_pcts(mp, ss)
                            archetype = detect_fwd_archetype(pcts) if is_fwd else detect_d_archetype(pcts)
                        else:
                            archetype = "Two-Way Forward" if is_fwd else "Two-Way Defenseman"
                    skater_rows.append({
                        "playerId": slug, "nhlId": nhl_id,
                        "firstName": first, "lastName": last,
                        "team": team["tricode"], "position": game_pos,
                        "handedness": ea_hand, "age": age,
                        "overall": overall, "potential": potential,
                        "archetype": archetype,
                        "ratingSource": "ea_official",
                        "lastVerified": LAST_VERIFIED_EA,
                        **attrs,
                    })

            else:
                # ── Estimated row (MoneyPuck percentile) ─────────────────────
                n_est += 1
                mp = rp.get("mp")

                if is_goalie:
                    if mp and (mp.get("games_played") or 0) >= MIN_GP_G:
                        pcts = compute_goalie_pcts(mp, g_sorted)
                        composite = goalie_master_pct(pcts)
                        re_ranked = pct_rank(composite, goalie_composites)
                        overall = clamp(round(pct_to_rating(re_ranked)))
                        attrs = goalie_attrs_from_pcts(pcts)
                        archetype = detect_goalie_archetype()
                    else:
                        # Low-sample goalie: use league average
                        overall = clamp(65 + random.randint(-3, 3))
                        attrs = goalie_attrs_from_pcts({k: 0.5 for k in ["sv", "gsaa", "hdsv", "mdsv", "gaa"]})
                        archetype = detect_goalie_archetype()

                    potential = clamp(overall + random.randint(-3, 12), 30, 99)
                    goalie_rows.append({
                        "playerId": slug, "nhlId": nhl_id,
                        "firstName": first, "lastName": last,
                        "team": team["tricode"], "position": "G",
                        "handedness": hand, "age": age,
                        "overall": overall, "potential": potential,
                        "archetype": archetype,
                        "ratingSource": "estimated",
                        "lastVerified": "",
                        **attrs,
                    })
                else:
                    ss = c_sorted if nhl_pos == "C" else (w_sorted if nhl_pos in ("LW", "RW") else d_sorted)
                    composites_pool = fwd_composites if is_fwd else def_composites

                    if mp and (mp.get("icetime_sec") or 0) >= MIN_ICE_S:
                        pcts = compute_skater_pcts(mp, ss)
                        composite = skater_master_pct(pcts, is_fwd)
                        re_ranked = pct_rank(composite, composites_pool)
                        overall = clamp(round(pct_to_rating(re_ranked)))
                        attrs = skater_attrs_from_pcts(pcts, nhl_pos)
                        archetype = detect_fwd_archetype(pcts) if is_fwd else detect_d_archetype(pcts)
                    else:
                        # Low-sample skater: percentile with no shrinkage credit
                        if mp:
                            pcts = compute_skater_pcts(mp, ss)
                        else:
                            pcts = {k: 0.5 for k in SKATER_GETTERS}
                        composite = skater_master_pct(pcts, is_fwd)
                        re_ranked = pct_rank(composite, composites_pool) if composites_pool else 0.2
                        overall = clamp(round(pct_to_rating(max(0.05, re_ranked * 0.6))))
                        attrs = skater_attrs_from_pcts(pcts, nhl_pos)
                        archetype = detect_fwd_archetype(pcts) if is_fwd else detect_d_archetype(pcts)

                    potential = clamp(overall + random.randint(-3, 12), 30, 99)
                    skater_rows.append({
                        "playerId": slug, "nhlId": nhl_id,
                        "firstName": first, "lastName": last,
                        "team": team["tricode"], "position": game_pos,
                        "handedness": hand, "age": age,
                        "overall": overall, "potential": potential,
                        "archetype": archetype,
                        "ratingSource": "estimated",
                        "lastVerified": "",
                        **attrs,
                    })

    # ── Write CSVs ───────────────────────────────────────────────────────────
    SKATER_COLS = [
        "playerId", "nhlId", "firstName", "lastName", "team", "position",
        "handedness", "age", "overall", "potential", "archetype",
        "ratingSource", "lastVerified",
        "deking", "handEye", "passing", "puckControl",
        "discipline", "offAwareness", "poise",
        "slapShotAccuracy", "slapShotPower", "wristShotAccuracy", "wristShotPower",
        "defAwareness", "faceoffs", "shotBlocking", "stickChecking",
        "acceleration", "agility", "balance", "endurance", "speed",
        "aggressiveness", "bodyChecking", "durability", "fightingSkill", "strength",
    ]
    GOALIE_COLS = [
        "playerId", "nhlId", "firstName", "lastName", "team", "position",
        "handedness", "age", "overall", "potential", "archetype",
        "ratingSource", "lastVerified",
        "positioning", "angles", "fiveHole", "gloveSave", "blockerSave",
        "quickness", "reboundControl", "puckHandling", "passing", "poise",
        "consistency", "aggressiveness", "flexibility", "endurance", "durability",
    ]

    def write_csv(path: Path, cols: list[str], rows: list[dict]):
        with open(path, "w", newline="", encoding="utf-8") as f:
            f.write(",".join(cols) + "\n")
            for row in rows:
                vals = []
                for c in cols:
                    v = row.get(c, "")
                    s = str(v) if v is not None else ""
                    # Escape commas/quotes
                    if "," in s or '"' in s or "\n" in s:
                        s = '"' + s.replace('"', '""') + '"'
                    vals.append(s)
                f.write(",".join(vals) + "\n")

    skaters_path = RATINGS_DIR / "skaters.csv"
    goalies_path = RATINGS_DIR / "goalies.csv"
    write_csv(skaters_path, SKATER_COLS, skater_rows)
    write_csv(goalies_path, GOALIE_COLS, goalie_rows)

    total = len(skater_rows) + len(goalie_rows)
    print(f"\n── Summary ─────────────────────────────────────────────────────────")
    print(f"  EA players fetched    : {len(ea_lookup)}")
    print(f"  ea_official matched   : {n_ea}")
    print(f"  estimated (no EA data): {n_est}")
    print(f"  Total rows written    : {total}  ({len(skater_rows)} skaters + {len(goalie_rows)} goalies)")
    print(f"  Wrote: {skaters_path}")
    print(f"  Wrote: {goalies_path}")

    # Report EA players that didn't match any real-league roster entry.
    # Build the set of EA names that resolved (via direct match or alias).
    roster_names = {(p["firstName"].lower(), p["lastName"].lower()) for p in all_players}
    # An EA item resolved if its name OR its aliased name is in roster_names.
    def ea_item_resolved(item: dict) -> bool:
        ea_key = (
            (item.get("firstName") or "").lower().strip(),
            (item.get("lastName") or "").lower().strip(),
        )
        if ea_key in roster_names:
            return True
        aliased = EA_NAME_ALIASES.get(ea_key)
        return aliased is not None and aliased in roster_names

    unmatched = [
        f"{item.get('firstName')} {item.get('lastName')} "
        f"({(item.get('team') or {}).get('label', '?') if isinstance(item.get('team'), dict) else '?'})"
        for item in ea_items
        if not ea_item_resolved(item)
    ]
    if unmatched:
        print(f"\n── EA players not matched to any roster entry ({len(unmatched)}) ──")
        for name in sorted(unmatched):
            print(f"  {name}")
        print("  (PWHL players and retired/unsigned NHL men are expected mismatches.)")
    else:
        print(f"\n  All EA players matched successfully.")


if __name__ == "__main__":
    main()
