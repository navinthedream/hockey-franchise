import { League, ScheduledGame } from './types';
import { uid } from './generator';

/**
 * Generates an 82-game NHL-style schedule for 32 teams.
 *
 * Game counts per team (totals to 84 — within 2 of the real 82):
 *   vs same division (7 teams)               : 4 games each = 28
 *   vs other division, same conference (8 teams): 3 games each = 24
 *   vs opposite conference (16 teams)         : 2 games each = 32
 *   ──────────────────────────────────────────────────────────
 *   Total per team                            : 84
 *
 * Season window: Oct 1 → Apr 17 (~198 days); avg ~6.8 games/day league-wide.
 */
export function generateSchedule(league: League): ScheduledGame[] {
  const teams = league.teams;
  const teamMap = new Map(teams.map(t => [t.id, t]));

  // ── 1. Build (home, away) pairings ────────────────────────────────────────
  const pairings: { home: string; away: string }[] = [];

  for (let i = 0; i < teams.length; i++) {
    for (let j = i + 1; j < teams.length; j++) {
      const ti = teams[i], tj = teams[j];
      const sameDivision   = ti.conference === tj.conference && ti.division === tj.division;
      const sameConference = ti.conference === tj.conference;

      if (sameDivision) {
        // 4 games: 2 home each
        pairings.push({ home: ti.id, away: tj.id });
        pairings.push({ home: ti.id, away: tj.id });
        pairings.push({ home: tj.id, away: ti.id });
        pairings.push({ home: tj.id, away: ti.id });
      } else if (sameConference) {
        // 3 games: team with lower index in the teams array gets 2 home
        pairings.push({ home: ti.id, away: tj.id });
        pairings.push({ home: ti.id, away: tj.id });
        pairings.push({ home: tj.id, away: ti.id });
      } else {
        // 2 games: 1 home each
        pairings.push({ home: ti.id, away: tj.id });
        pairings.push({ home: tj.id, away: ti.id });
      }
    }
  }

  // ── 2. Shuffle ────────────────────────────────────────────────────────────
  for (let i = pairings.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [pairings[i], pairings[j]] = [pairings[j], pairings[i]];
  }

  // ── 3. Spread across calendar dates ──────────────────────────────────────
  // One game per team per calendar day; advance day when no more games fit.
  // Real NHL: ~7–13 games per day across a ~180-day window (Oct → early Apr).
  // We target ≤12 games per active day and skip ~30 % of days (travel days / off days),
  // which naturally stretches the schedule to ~170–185 calendar days.
  const MAX_GAMES_PER_DAY = 12;

  const startDate = new Date(league.currentDate + 'T12:00:00Z');
  const schedule: ScheduledGame[] = [];
  const remaining = [...pairings];
  let dayCursor = 0;

  while (remaining.length > 0) {
    // ~30 % chance of a "travel / off" day (no games); always false for first day
    if (dayCursor > 0 && Math.random() < 0.30) {
      dayCursor++;
      continue;
    }

    const dateObj = new Date(startDate);
    dateObj.setUTCDate(dateObj.getUTCDate() + dayCursor);
    const dateStr = dateObj.toISOString().slice(0, 10);

    const usedToday = new Set<string>();
    let scheduledToday = 0;

    for (let idx = 0; idx < remaining.length; idx++) {
      if (scheduledToday >= MAX_GAMES_PER_DAY) break;
      const pair = remaining[idx];
      if (usedToday.has(pair.home) || usedToday.has(pair.away)) continue;

      schedule.push({
        id:         uid('game'),
        date:       dateStr,
        homeTeamId: pair.home,
        awayTeamId: pair.away,
        played:     false,
      });
      usedToday.add(pair.home);
      usedToday.add(pair.away);
      remaining.splice(idx, 1);
      idx--;
      scheduledToday++;
    }

    dayCursor++;
    if (dayCursor > 600) break; // safety valve
  }

  schedule.sort((a, b) => a.date.localeCompare(b.date));
  return schedule;
}
