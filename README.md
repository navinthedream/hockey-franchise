# Ice Level — Franchise Mode

A hockey GM sim built with Next.js 16, TypeScript, and Tailwind v4. Every skater has a full 25-attribute card (Puck Skills / Senses / Shooting / Defense / Skating / Physical, matching real sports-game player cards) and an archetype (Sniper, Defensive Defenseman, Enforcer, etc.) that drives generation. Goalies get their own distinct 15-attribute card. The sim engine uses these attributes at the specific mechanical moment they should matter — not averaged into one blob.

## Run it

```bash
npm install
npm run dev
```

Open http://localhost:3000. Pick a team, then sim games. Your save lives in `data/save.json` (gitignored).

## How the sim actually works

Each tick (~15-35 in-game seconds) rolls one of: a penalty, a hit, or a possession sequence.

- **Possession**: both teams' current shift (a forward line + a D pair, ice-time weighted so line 1 plays more than line 4) face off — literally: the two on-ice centers' `faceoffs` rating decides an initial edge. The matchup's attack/defense composite (built from `passing`, `offAwareness`, `puckControl`, `defAwareness`, `stickChecking`, etc.) sets the possession odds.
- **Puck battle**: the attacking group's `puckControl`/`deking`/`agility` fights the defending group's `defAwareness`/`stickChecking` to see if the attempt survives to become a shot, or gets stripped (credited as a takeaway).
- **Shot selection**: forwards mostly shoot wrist shots, D-men mostly shoot slap shots (each with their own accuracy/power attributes). The shooter is picked from the on-ice group weighted by the relevant shot skill.
- **Shot blocking**: the defending D-pair's `shotBlocking` can block it before it reaches the net — tracked as an individual stat, separate from shots-on-goal.
- **Goalie duel**: save probability uses `positioning`, `angles`, `consistency`, and the shot-type-specific reflex stat (`gloveSave` for wrist shots, `blockerSave` for slap shots).
- **Rebounds**: a save can spill to a trailer (weighted by `handEye`/`offAwareness`) for a quick putback, contested by the goalie's `reboundControl`.
- **Hits**: `bodyChecking`+`aggressiveness` vs. the puck carrier's `balance`+`strength`; a successful hit can force a turnover, and stacking high-aggressiveness collisions can escalate into a fight (`fightingSkill`+`strength`, five-minute majors both sides).
- **Fatigue**: a line's `endurance`+`durability` average shaves a small amount off their effective rating in the 3rd period.
- **Poise**: bonus applied to shot quality in OT and shootouts (clutch factor).
- **Discipline**/**aggressiveness**: drive penalty frequency and who takes them.

Archetypes bias attribute generation (a Sniper gets +wrist shot accuracy, −defense; a Defensive Defenseman gets +shot blocking, −shooting) and are correlated with roster tier, so depth players skew toward Grinder/Enforcer and stars skew toward Sniper/Playmaker — matching how real rosters are built. "Overall" is normalized so archetype choice doesn't accidentally inflate or deflate a player's ice time; it reflects the tier they were generated at, with each archetype's specialty attributes shining through in the actual card.

Tuned and verified against real NHL rates: ~6.1 goals/game, ~58-60 shots/game, ~10% individual shooting percentage, ~28-30 blocked shots/game, forwards ~66% of league points (real NHL: ~70%, still tuning), centers own faceoffs (wings/D barely take any), shutdown D-pairs block roughly 2x as many shots as offensive pairs, snipers score ~4x more than enforcers.

## What's next (not built yet)

- **Offseason loop**: draft, free agency, re-signing, expiring contracts.
- **Trades**, with cap validation.
- **Lineup editor**: the data model already supports arbitrary lines/pairs — just needs UI.
- **Playoffs**: bracket generation (currently just flips to `offseason` phase).
- **Player development/aging** and **injuries**: `durability` currently only affects in-game fatigue resistance, not missed games — a natural next step once lineup-swap logic exists.
- **Multi-season continuity**: re-upping contracts, aging curves, draft classes.

## Project structure

```
lib/types.ts             — core interfaces: 25-attr SkaterAttributes, 15-attr GoalieAttributes, archetypes
lib/generator.ts          — archetype-driven player/league generation, tier-correlated archetype selection
lib/schedule.ts            — season schedule
lib/simEngine.ts            — the play-by-play simulator (see "How the sim actually works" above)
lib/franchiseEngine.ts       — day-by-day season advancement + standings
lib/store.ts                  — JSON file save/load (server-side)
app/api/franchise/              — REST-ish API routes the client hits
components/                       — Scoreboard, StandingsTable, RosterTable, GameViewer, TeamPicker
app/page.tsx                       — main client app (tabs: dashboard/standings/roster/last game)
```
