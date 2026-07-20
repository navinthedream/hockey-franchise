"""
Enriches data/ratings/skaters.csv and goalies.csv with full per-attribute data
scraped from each player's individual EA NHL 26 ratings detail page.

Workflow:
  1. Walk all listing pages (?page=1, 2, …) to collect (id, firstName, lastName, team, position).
  2. For each player, fetch /games/nhl/ratings/player-ratings/{slug}/{id} — cached to
     data/raw/ea-pages/{id}.html so re-runs never re-hit the server.
  3. Parse the full __NEXT_DATA__ attribute card from the detail page.
  4. Map EA field names → our schema, log any unmapped fields.
  5. Rewrite both CSVs: rows with a successful scrape get ratingSource="ea_official" +
     full attributes; a new `completeness` column (0-100) shows % of attrs from EA.

Run with:  python3 scripts/scrape-ea-detail-pages.py
"""

import bisect
import json
import math
import os
import re
import sys
import time
import unicodedata
import urllib.request
from pathlib import Path

ROOT        = Path(__file__).parent.parent
RATINGS_DIR = ROOT / "data" / "ratings"
CACHE_DIR   = ROOT / "data" / "raw" / "ea-pages"
CACHE_DIR.mkdir(parents=True, exist_ok=True)

EA_BASE     = "https://www.ea.com/games/nhl/ratings"
TODAY       = "2026-07-20"

_HEADERS = {
    "User-Agent": (
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
        "AppleWebKit/537.36 (KHTML, like Gecko) "
        "Chrome/124.0.0.0 Safari/537.36"
    ),
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    "Accept-Language": "en-US,en;q=0.5",
}

# ─────────────────────────────────────────────────────────────────────────────
# Attribute mapping tables
# ─────────────────────────────────────────────────────────────────────────────

OUR_SKATER_ATTRS = [
    "deking", "handEye", "passing", "puckControl",
    "discipline", "offAwareness", "poise",
    "slapShotAccuracy", "slapShotPower", "wristShotAccuracy", "wristShotPower",
    "defAwareness", "faceoffs", "shotBlocking", "stickChecking",
    "acceleration", "agility", "balance", "endurance", "speed",
    "aggressiveness", "bodyChecking", "durability", "fightingSkill", "strength",
]

OUR_GOALIE_ATTRS = [
    "positioning", "angles", "fiveHole",
    "gloveSave", "blockerSave", "quickness",
    "reboundControl", "puckHandling", "passing",
    "poise", "consistency", "aggressiveness",
    "flexibility", "endurance", "durability",
]

# EA field name → our schema key.  Multiple EA variants handled (listing vs detail page casing).
SKATER_ATTR_MAP: dict[str, str] = {
    # Skating
    "acceleration":      "acceleration",
    "agility":           "agility",
    "balance":           "balance",
    "endurance":         "endurance",
    "speed":             "speed",
    # Shooting
    "slapShotAccuracy":  "slapShotAccuracy",
    "slapshotAccuracy":  "slapShotAccuracy",
    "slapShotPower":     "slapShotPower",
    "slapshotPower":     "slapShotPower",
    "wristShotAccuracy": "wristShotAccuracy",
    "wristshotAccuracy": "wristShotAccuracy",
    "wristShotPower":    "wristShotPower",
    "wristshotPower":    "wristShotPower",
    # Puck Skills
    "deking":            "deking",
    "handEye":           "handEye",
    "handeye":           "handEye",
    "passing":           "passing",
    "puckControl":       "puckControl",
    # Senses
    "discipline":        "discipline",
    "offensiveAwareness":"offAwareness",
    "poise":             "poise",
    # Defense
    "defensiveAwareness":"defAwareness",
    "faceoffs":          "faceoffs",
    "shotBlocking":      "shotBlocking",
    "stickChecking":     "stickChecking",
    # Physical
    "aggression":        "aggressiveness",
    "aggressiveness":    "aggressiveness",
    "bodyChecking":      "bodyChecking",
    "durability":        "durability",
    "fightingSkill":     "fightingSkill",
    "strength":          "strength",
}

GOALIE_ATTR_MAP: dict[str, str] = {
    "angles":               "angles",
    "fiveHole":             "fiveHole",
    "glovesideHigh":        "gloveSave",
    "gloveSave":            "gloveSave",
    "sticksideHigh":        "blockerSave",
    "blockerSave":          "blockerSave",
    "vision":               "quickness",
    "quickness":            "quickness",
    "reboundControl":       "reboundControl",
    "breakaway":            "positioning",   # EA's "breakaway" ≈ our positional skill
    "positioning":          "positioning",
    "puckplayingFrequency": "puckHandling",
    "puckHandling":         "puckHandling",
    "passing":              "passing",
    "poise":                "poise",
    "consistency":          "consistency",
    "aggressiveness":       "aggressiveness",
    "aggression":           "aggressiveness",
    "flexibility":          "flexibility",
    "endurance":            "endurance",
    "durability":           "durability",
}

# EA fields we know about but intentionally ignore (not in our schema)
_KNOWN_SKATER_IGNORE = {"jumping", "stamina", "shotRecover", "pokeCheck",
                         "glovesideHigh", "glovesideLow", "sticksideHigh", "sticksideLow",
                         "breakaway", "puckplayingFrequency", "angles", "fiveHole",
                         "vision", "reboundControl", "puckplayingFrequency",
                         "aggressiveness",  # mapped via 'aggression' key for skaters
                         "offensiveAwareness", "defensiveAwareness",  # captured via full name
                         }
_KNOWN_GOALIE_IGNORE = {"jumping", "stamina", "shotRecover", "pokeCheck",
                         "glovesideLow", "sticksideLow", "acceleration", "agility",
                         "balance", "speed", "bodyChecking", "fightingSkill", "strength",
                         "discipline", "stickChecking", "shotBlocking", "faceoffs",
                         "puckControl", "deking", "handEye", "handeye",
                         "wristshotAccuracy", "wristshotPower", "slapshotAccuracy", "slapshotPower",
                         "wristShotAccuracy", "wristShotPower", "slapShotAccuracy", "slapShotPower",
                         "offensiveAwareness", "defensiveAwareness",
                         }

# ─────────────────────────────────────────────────────────────────────────────
# HTTP helpers
# ─────────────────────────────────────────────────────────────────────────────

def _http_get(url: str, retry: bool = True) -> str | None:
    req = urllib.request.Request(url, headers=_HEADERS)
    try:
        with urllib.request.urlopen(req, timeout=25) as r:
            return r.read().decode("utf-8", errors="replace")
    except Exception as e:
        if retry:
            time.sleep(2)
            return _http_get(url, retry=False)
        print(f"  [err] fetch failed for {url}: {e}")
        return None


def _extract_next_data(html: str) -> dict | None:
    m = re.search(r'<script\s+id="__NEXT_DATA__"[^>]*>(.*?)</script>', html, re.DOTALL)
    if not m:
        return None
    try:
        return json.loads(m.group(1))
    except json.JSONDecodeError:
        return None


# ─────────────────────────────────────────────────────────────────────────────
# Step 1: walk listing pages to collect all (id, name, position, team)
# ─────────────────────────────────────────────────────────────────────────────

def collect_all_listing_players() -> list[dict]:
    """Return all player stubs from paginated listing pages."""
    all_items: list[dict] = []
    seen: set[int] = set()

    for page in range(1, 50):
        url = EA_BASE if page == 1 else f"{EA_BASE}?page={page}"
        html = _http_get(url)
        if not html:
            print(f"[listing] page {page}: fetch failed, skipping")
            time.sleep(0.4)
            continue

        blob = _extract_next_data(html)
        if not blob:
            print(f"[listing] page {page}: no __NEXT_DATA__")
            break

        items = []
        try:
            items = blob["props"]["pageProps"]["ratingDetails"]["items"] or []
        except (KeyError, TypeError):
            print(f"[listing] page {page}: unexpected JSON structure, stopping")
            break

        if not items:
            print(f"[listing] page {page}: 0 items — end of results")
            break

        new = 0
        for item in items:
            pid = item.get("id")
            if pid and pid not in seen:
                seen.add(pid)
                all_items.append(item)
                new += 1

        print(f"[listing] page {page}: {len(items)} players ({new} new), running total {len(all_items)}")
        if new == 0:
            print(f"[listing] page {page}: all duplicates — end of results")
            break

        time.sleep(0.35)

    print(f"[listing] Done — {len(all_items)} unique players collected")
    return all_items


# ─────────────────────────────────────────────────────────────────────────────
# Step 2: slug derivation + detail page fetch/cache
# ─────────────────────────────────────────────────────────────────────────────

def _make_slug(first: str, last: str) -> str:
    """Derive URL slug: 'Brandon Hagel' → 'brandon-hagel'."""
    def normalize(s: str) -> str:
        # Strip accents
        s = unicodedata.normalize("NFKD", s).encode("ascii", "ignore").decode()
        s = s.lower().strip()
        # Replace spaces with hyphens; remove anything not alphanumeric or hyphen
        s = re.sub(r"[^a-z0-9\-]", "", s.replace(" ", "-"))
        # Collapse multiple hyphens
        s = re.sub(r"-{2,}", "-", s)
        return s
    return f"{normalize(first)}-{normalize(last)}"


def fetch_detail_html(player_id: int, first: str, last: str) -> str | None:
    """Return raw HTML for player detail page; uses disk cache."""
    cache_path = CACHE_DIR / f"{player_id}.html"
    if cache_path.exists():
        return cache_path.read_text(encoding="utf-8")

    slug = _make_slug(first, last)
    url  = f"{EA_BASE}/player-ratings/{slug}/{player_id}"
    html = _http_get(url)
    if html:
        cache_path.write_text(html, encoding="utf-8")
    time.sleep(0.35)
    return html


# ─────────────────────────────────────────────────────────────────────────────
# Step 3: parse detail page
# ─────────────────────────────────────────────────────────────────────────────

def _get_val(obj: dict, key: str) -> int | None:
    """Extract integer from EA stat value — handles both plain int and {value, diff} dicts."""
    v = obj.get(key)
    if v is None:
        return None
    if isinstance(v, dict):
        v = v.get("value")
    if v is None:
        return None
    try:
        n = int(v)
        return n if n > 0 else None  # treat 0 as missing
    except (TypeError, ValueError):
        return None


def parse_detail_player(html: str, player_id: int) -> dict | None:
    """
    Returns a dict with:
      overall, firstName, lastName, position, team, archetype,
      attrs: {our_key: int},  completeness: int (0-100),
      is_goalie: bool
    or None on failure.
    """
    blob = _extract_next_data(html)
    if not blob:
        return None

    page_props = blob.get("props", {}).get("pageProps", {})

    # Player data lives at pageProps.ratingsEntries.items[0] on detail pages
    player: dict | None = None
    try:
        items = page_props["ratingsEntries"]["items"]
        if items:
            # Prefer the item whose id matches; fall back to first item
            player = next((it for it in items if it.get("id") == player_id), items[0])
    except (KeyError, TypeError):
        pass

    if not player:
        return None

    return parse_detail_player_from_obj(player, player_id)


_UNMAPPED_EA_KEYS: set[str] = set()


def parse_listing_player(item: dict) -> dict | None:
    """
    Parse a player dict from a listing page item (same shape as detail page items).
    These items also carry a full 'stats' dict, so we can use them when detail pages 404.
    """
    if not item or not isinstance(item, dict):
        return None
    return parse_detail_player_from_obj(item, item.get("id"))


def parse_detail_player_from_obj(player: dict, player_id: int) -> dict | None:
    """Core parser shared between detail-page HTML and listing-page items."""
    if not player:
        return None

    overall = int(player.get("overallRating") or 0)
    first   = player.get("firstName") or ""
    last    = player.get("lastName") or ""
    pos_obj = player.get("position") or {}
    if isinstance(pos_obj, dict):
        pos_short = pos_obj.get("shortLabel") or ""
    elif isinstance(pos_obj, str):
        pos_short = pos_obj
    else:
        pos_short = ""
    team_obj      = player.get("team") or {}
    team_name     = team_obj.get("label") or "" if isinstance(team_obj, dict) else str(team_obj)
    style_obj     = player.get("playerStyle") or {}
    archetype_raw = (style_obj.get("id") or style_obj.get("label") or "") if isinstance(style_obj, dict) else str(style_obj)

    is_goalie = pos_short.upper() in ("G", "GOA", "GOAL", "GOALIE") or "GOALI" in pos_short.upper()

    raw_stats: dict[str, int | None] = {}
    all_ea_keys_seen: set[str] = set()
    stat_sources = [player]
    if "stats" in player and isinstance(player["stats"], dict):
        stat_sources.insert(0, player["stats"])

    for src in stat_sources:
        for k, v in src.items():
            if isinstance(v, (int, float, dict)):
                val = _get_val(src, k)
                if val is not None and k not in raw_stats:
                    raw_stats[k] = val
                    all_ea_keys_seen.add(k)

    attr_map   = GOALIE_ATTR_MAP if is_goalie else SKATER_ATTR_MAP
    our_attrs  = OUR_GOALIE_ATTRS if is_goalie else OUR_SKATER_ATTRS
    ignore_set = _KNOWN_GOALIE_IGNORE if is_goalie else _KNOWN_SKATER_IGNORE

    attrs_out: dict[str, int] = {}
    attrs_found: set[str] = set()
    for ea_key, val in raw_stats.items():
        our_key = attr_map.get(ea_key)
        if our_key and val is not None:
            attrs_out[our_key] = val
            attrs_found.add(our_key)

    for ea_key in all_ea_keys_seen:
        if ea_key not in attr_map and ea_key not in ignore_set:
            _UNMAPPED_EA_KEYS.add(ea_key)

    completeness = round(len(attrs_found) / len(our_attrs) * 100) if our_attrs else 0

    return {
        "overall":       overall,
        "firstName":     first,
        "lastName":      last,
        "pos_short":     pos_short,
        "team_name":     team_name,
        "archetype_raw": archetype_raw,
        "attrs":         attrs_out,
        "completeness":  completeness,
        "is_goalie":     is_goalie,
    }


# ─────────────────────────────────────────────────────────────────────────────
# Archetype mapping (EA label → our type string)
# ─────────────────────────────────────────────────────────────────────────────

FWD_ARCH_MAP = {
    "sniper": "Sniper", "playmaker": "Playmaker",
    "power forward": "Power Forward", "two-way forward": "Two-Way Forward",
    "two way forward": "Two-Way Forward", "enforcer": "Enforcer", "grinder": "Grinder",
}
D_ARCH_MAP = {
    "offensive": "Offensive Defenseman", "offensive defenseman": "Offensive Defenseman",
    "defensive": "Defensive Defenseman", "defensive defenseman": "Defensive Defenseman",
    "two-way": "Two-Way Defenseman", "two way": "Two-Way Defenseman",
    "two-way defenseman": "Two-Way Defenseman", "two way defenseman": "Two-Way Defenseman",
    "enforcer defenseman": "Enforcer Defenseman", "enforcer": "Enforcer Defenseman",
}
G_ARCH_MAP = {
    "butterfly": "Butterfly Goalie", "butterfly goalie": "Butterfly Goalie",
    "hybrid": "Hybrid Goalie", "hybrid goalie": "Hybrid Goalie",
    "standup": "Standup Goalie", "standup goalie": "Standup Goalie",
    "puck-handling": "Puck-Handling Goalie", "puck handling": "Puck-Handling Goalie",
    "puck-handling goalie": "Puck-Handling Goalie",
}

def map_archetype(raw: str, is_goalie: bool, is_d: bool) -> str | None:
    s = raw.lower().strip()
    if is_goalie: return G_ARCH_MAP.get(s)
    if is_d:      return D_ARCH_MAP.get(s)
    return FWD_ARCH_MAP.get(s)


# ─────────────────────────────────────────────────────────────────────────────
# CSV parser (same inline parser as the other scripts)
# ─────────────────────────────────────────────────────────────────────────────

def _parse_line(line: str) -> list[str]:
    fields: list[str] = []
    i = 0
    while i <= len(line):
        if i == len(line):
            fields.append("")
            break
        if line[i] == '"':
            val = ""; i += 1
            while i < len(line):
                if line[i] == '"' and i + 1 < len(line) and line[i + 1] == '"':
                    val += '"'; i += 2
                elif line[i] == '"':
                    i += 1; break
                else:
                    val += line[i]; i += 1
            fields.append(val)
            if i < len(line) and line[i] == ',': i += 1
        else:
            end = line.find(',', i)
            if end == -1:
                fields.append(line[i:])
                break
            fields.append(line[i:end])
            i = end + 1
    return fields


def parse_csv(raw: str) -> tuple[list[str], list[dict]]:
    lines = raw.split('\n')
    if not lines: return [], []
    headers = _parse_line(lines[0])
    rows: list[dict] = []
    for line in lines[1:]:
        line = line.strip()
        if not line: continue
        vals = _parse_line(line)
        rows.append({h: (vals[j] if j < len(vals) else "") for j, h in enumerate(headers)})
    return headers, rows


def write_csv(path: Path, cols: list[str], rows: list[dict]):
    with open(path, "w", newline="", encoding="utf-8") as f:
        f.write(",".join(cols) + "\n")
        for row in rows:
            vals = []
            for c in cols:
                s = str(row.get(c, "")) if row.get(c) is not None else ""
                if "," in s or '"' in s or "\n" in s:
                    s = '"' + s.replace('"', '""') + '"'
                vals.append(s)
            f.write(",".join(vals) + "\n")


# ─────────────────────────────────────────────────────────────────────────────
# Main
# ─────────────────────────────────────────────────────────────────────────────

def main():
    # ── Load existing CSVs ────────────────────────────────────────────────────
    skater_path = RATINGS_DIR / "skaters.csv"
    goalie_path = RATINGS_DIR / "goalies.csv"

    sk_headers, sk_rows = parse_csv(skater_path.read_text(encoding="utf-8"))
    gl_headers, gl_rows = parse_csv(goalie_path.read_text(encoding="utf-8"))

    # Add completeness column if not present
    if "completeness" not in sk_headers:
        sk_headers.append("completeness")
        for r in sk_rows: r["completeness"] = "0"
    if "completeness" not in gl_headers:
        gl_headers.append("completeness")
        for r in gl_rows: r["completeness"] = "0"

    def _ascii_key(first: str, last: str) -> tuple[str, str]:
        """Normalize to ASCII-lowercase for accent-insensitive comparison.
        'Slafkovský' → 'slafkovsky', 'Fehérváry' → 'fehervary'."""
        def strip(s: str) -> str:
            return unicodedata.normalize("NFKD", s).encode("ascii", "ignore").decode().lower()
        return (strip(first), strip(last))

    # Index by nhlId for fast lookup
    sk_by_id: dict[int, dict] = {int(r["nhlId"]): r for r in sk_rows if r.get("nhlId")}
    gl_by_id: dict[int, dict] = {int(r["nhlId"]): r for r in gl_rows if r.get("nhlId")}

    # Index by ASCII-normalised (firstName, lastName) for accent-insensitive fallback
    sk_by_name: dict[tuple, dict] = {
        _ascii_key(r["firstName"], r["lastName"]): r
        for r in sk_rows if r.get("firstName")
    }
    gl_by_name: dict[tuple, dict] = {
        _ascii_key(r["firstName"], r["lastName"]): r
        for r in gl_rows if r.get("firstName")
    }

    print(f"\nLoaded {len(sk_rows)} skater rows, {len(gl_rows)} goalie rows from existing CSVs")

    # ── Collect all player listings ───────────────────────────────────────────
    print(f"\n── Phase 1: collect player IDs from listing pages ────────────────────────")
    listing_players = collect_all_listing_players()

    # Filter to NHL men's players (exclude PWHL by checking gender field if available)
    nhl_men = []
    for item in listing_players:
        gender = item.get("gender") or {}
        gender_label = (gender.get("label") or "").lower() if isinstance(gender, dict) else ""
        # PWHL teams contain keywords; also gender label is "Women's Hockey" for PWHL
        if "women" in gender_label:
            continue
        nhl_men.append(item)

    print(f"\nFiltered to {len(nhl_men)} NHL men's players (excluded PWHL)")

    # ── Phase 2: fetch detail pages ───────────────────────────────────────────
    print(f"\n── Phase 2: fetch/cache detail pages ─────────────────────────────────────")

    already_cached = sum(1 for item in nhl_men if (CACHE_DIR / f"{item['id']}.html").exists())
    print(f"  {already_cached}/{len(nhl_men)} already cached on disk\n")

    detail_map: dict[int, dict] = {}  # player_id → parsed detail data
    n_fetched = 0; n_cached = 0; n_failed = 0; n_parsed = 0

    for i, item in enumerate(nhl_men):
        pid   = item["id"]
        first = item.get("firstName") or ""
        last  = item.get("lastName") or ""

        cache_path = CACHE_DIR / f"{pid}.html"
        was_cached = cache_path.exists()

        html = fetch_detail_html(pid, first, last)
        parsed = None
        if not html:
            # Fall back to listing-page data (already has full stats)
            parsed = parse_listing_player(item)
            if parsed:
                detail_map[pid] = parsed
                n_parsed += 1
                print(f"  [{i+1}/{len(nhl_men)}] listing fallback  {first} {last} (id={pid})")
            else:
                print(f"  [{i+1}/{len(nhl_men)}] FAIL  {first} {last} (id={pid})")
                n_failed += 1
            continue

        if was_cached:
            n_cached += 1
        else:
            n_fetched += 1
            if n_fetched % 10 == 1:
                print(f"  [{i+1}/{len(nhl_men)}] fetched {first} {last} (id={pid})")

        parsed = parse_detail_player(html, pid)
        if parsed:
            detail_map[pid] = parsed
            n_parsed += 1
        else:
            # Try with a different slug variant if first attempt failed (cached may be stale)
            if was_cached:
                cache_path.unlink(missing_ok=True)
                html2 = fetch_detail_html(pid, first, last)
                if html2:
                    parsed2 = parse_detail_player(html2, pid)
                    if parsed2:
                        detail_map[pid] = parsed2
                        n_parsed += 1
                        continue
            # Last resort: fall back to listing-page data
            parsed = parse_listing_player(item)
            if parsed:
                detail_map[pid] = parsed
                n_parsed += 1
                print(f"  [{i+1}/{len(nhl_men)}] listing fallback  {first} {last} (id={pid})")
            else:
                print(f"  [{i+1}/{len(nhl_men)}] PARSE FAIL  {first} {last} (id={pid})")
                n_failed += 1

    print(f"\n  Fetched (new): {n_fetched}  |  From cache: {n_cached}  |  Parsed OK: {n_parsed}  |  Failed: {n_failed}")

    # ── Phase 3: update CSV rows ───────────────────────────────────────────────
    print(f"\n── Phase 3: update CSV rows ──────────────────────────────────────────────")

    # EA uses full legal names; NHL API / CSV uses nicknames.
    # Map (ea_first.lower, last.lower) → (csv_first.lower, last.lower)
    NAME_ALIASES: dict[tuple[str, str], tuple[str, str]] = {
        ("john-jason", "peterka"):  ("jj", "peterka"),
        ("matthew",    "boldy"):    ("matt", "boldy"),
        ("michael",    "matheson"): ("mike", "matheson"),
        ("christopher","tanev"):    ("chris", "tanev"),
        ("gabe",       "vilardi"):  ("gabriel", "vilardi"),
        ("jacob",      "middleton"):("jake", "middleton"),
        # hyphenated first names may appear without the hyphen
        ("john jason", "peterka"):  ("jj", "peterka"),
        ("jj",         "peterka"):  ("jj", "peterka"),
    }

    n_sk_updated = 0; n_gl_updated = 0; n_not_found = 0
    completeness_total = 0; completeness_count = 0

    failed_match: list[str] = []

    for item in nhl_men:
        pid   = item["id"]
        first = item.get("firstName") or ""
        last  = item.get("lastName") or ""
        detail = detail_map.get(pid)
        if not detail:
            continue

        is_goalie   = detail["is_goalie"]
        attrs       = detail["attrs"]
        overall     = detail["overall"]
        arch_raw    = detail["archetype_raw"]
        completeness= detail["completeness"]

        # Find the CSV row: try nhlId, then ASCII-normalised name, then alias name
        norm_key  = _ascii_key(first, last)
        alias_key = NAME_ALIASES.get(norm_key, norm_key)
        row: dict | None = None
        if is_goalie:
            row = (gl_by_id.get(pid)
                   or gl_by_name.get(norm_key)
                   or gl_by_name.get(alias_key))
        else:
            row = (sk_by_id.get(pid)
                   or sk_by_name.get(norm_key)
                   or sk_by_name.get(alias_key))

        if not row:
            n_not_found += 1
            failed_match.append(f"{first} {last} (id={pid}, goalie={is_goalie})")
            continue

        # Determine archetype
        is_d_row = row.get("position", "") in ("LD", "RD")
        arch = map_archetype(arch_raw, is_goalie, is_d_row)
        if not arch:
            arch = row.get("archetype", "Two-Way Forward")  # keep existing if unmappable

        # Apply all attrs from EA detail page
        our_attrs = OUR_GOALIE_ATTRS if is_goalie else OUR_SKATER_ATTRS
        for key in our_attrs:
            if key in attrs:
                row[key] = str(attrs[key])

        # Update metadata
        row["overall"]      = str(overall) if overall else row["overall"]
        row["archetype"]    = arch
        row["ratingSource"] = "ea_official"
        row["lastVerified"] = TODAY
        row["completeness"] = str(completeness)

        completeness_total += completeness
        completeness_count += 1

        if is_goalie:
            n_gl_updated += 1
        else:
            n_sk_updated += 1

    # ── Write updated CSVs ────────────────────────────────────────────────────
    write_csv(skater_path, sk_headers, sk_rows)
    write_csv(goalie_path, gl_headers, gl_rows)

    # ── Report ────────────────────────────────────────────────────────────────
    total_ea = n_sk_updated + n_gl_updated
    avg_completeness = round(completeness_total / completeness_count) if completeness_count else 0

    print(f"\n── Summary ───────────────────────────────────────────────────────────────")
    print(f"  NHL men's players on EA page    : {len(nhl_men)}")
    print(f"  Detail pages fetched (new)      : {n_fetched}")
    print(f"  Detail pages from cache         : {n_cached}")
    print(f"  Detail pages parsed OK          : {n_parsed}")
    print(f"  Detail pages failed             : {n_failed}")
    print(f"  Skater rows updated (ea_official): {n_sk_updated}")
    print(f"  Goalie rows updated (ea_official): {n_gl_updated}")
    print(f"  Total ea_official rows now      : {total_ea}")
    print(f"  Avg attribute completeness      : {avg_completeness}%")
    print(f"  Not matched to any CSV row      : {n_not_found}")

    # Unmapped EA keys (warning — need schema update if any)
    our_all = set(OUR_SKATER_ATTRS) | set(OUR_GOALIE_ATTRS)
    unexpected = _UNMAPPED_EA_KEYS - our_all
    if unexpected:
        print(f"\n  [warn] Unmapped EA attribute keys (not in our schema): {sorted(unexpected)}")

    # Schema fields that were never sourced from EA (fully estimated everywhere)
    all_mapped_to = set(SKATER_ATTR_MAP.values()) | set(GOALIE_ATTR_MAP.values())
    never_from_ea = [a for a in OUR_SKATER_ATTRS if a not in all_mapped_to] + \
                    [a for a in OUR_GOALIE_ATTRS  if a not in all_mapped_to]
    if never_from_ea:
        print(f"  [info] Schema fields with no EA source at all: {never_from_ea}")

    if failed_match:
        print(f"\n── Failed to match to CSV row ({len(failed_match)}) ──")
        for name in sorted(failed_match):
            print(f"  {name}")

    # Final ea_official count across both CSVs
    final_ea_sk = sum(1 for r in sk_rows if r.get("ratingSource") == "ea_official")
    final_ea_gl = sum(1 for r in gl_rows if r.get("ratingSource") == "ea_official")
    print(f"\n── Final CSV state ───────────────────────────────────────────────────────")
    print(f"  skaters.csv: {len(sk_rows)} rows  ({final_ea_sk} ea_official, {len(sk_rows)-final_ea_sk} estimated)")
    print(f"  goalies.csv: {len(gl_rows)} rows  ({final_ea_gl} ea_official, {len(gl_rows)-final_ea_gl} estimated)")
    print(f"  Combined ea_official: {final_ea_sk + final_ea_gl}")


if __name__ == "__main__":
    main()
