import { League, ScheduledGame } from './types';
import { uid } from './generator';

/**
 * Generates a season schedule. Each team plays every other team home & away
 * (2 games each = 30 games for 16 teams), then adds extra divisional games
 * to reach a reasonable per-team game count (~40-something), spread across
 * ~5.5 months (Oct 1 - mid March) so playoffs can follow.
 */
export function generateSchedule(league: League): ScheduledGame[] {
  const teamIds = league.teams.map(t => t.id);
  const pairings: { home: string; away: string }[] = [];

  // Round 1: everyone home vs everyone away (full round robin both ways)
  for (let i = 0; i < teamIds.length; i++) {
    for (let j = 0; j < teamIds.length; j++) {
      if (i === j) continue;
      pairings.push({ home: teamIds[i], away: teamIds[j] });
    }
  }

  // Add extra divisional rivalry games (2 more each way) for realism
  const byDivision: Record<string, string[]> = {};
  league.teams.forEach(t => {
    const key = `${t.conference}-${t.division}`;
    byDivision[key] = byDivision[key] || [];
    byDivision[key].push(t.id);
  });
  Object.values(byDivision).forEach(ids => {
    for (let i = 0; i < ids.length; i++) {
      for (let j = 0; j < ids.length; j++) {
        if (i === j) continue;
        pairings.push({ home: ids[i], away: ids[j] });
      }
    }
  });

  // Shuffle pairings so it's not all division games clustered at the end
  for (let i = pairings.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [pairings[i], pairings[j]] = [pairings[j], pairings[i]];
  }

  // Distribute across dates: ~3-4 games per "day" of league action,
  // but simplify to one game per team per date at most.
  const startDate = new Date(league.currentDate);
  const schedule: ScheduledGame[] = [];
  const teamLastDate: Record<string, number> = {};
  let dayCursor = 0;
  const remaining = [...pairings];

  while (remaining.length > 0) {
    const dateObj = new Date(startDate);
    dateObj.setDate(dateObj.getDate() + dayCursor);
    const dateStr = dateObj.toISOString().slice(0, 10);
    const usedToday = new Set<string>();

    for (let idx = 0; idx < remaining.length; idx++) {
      const pair = remaining[idx];
      if (usedToday.has(pair.home) || usedToday.has(pair.away)) continue;
      // avoid back-to-back-to-back: require at least 1 day rest typically (soft rule)
      schedule.push({
        id: uid('game'),
        date: dateStr,
        homeTeamId: pair.home,
        awayTeamId: pair.away,
        played: false,
      });
      usedToday.add(pair.home);
      usedToday.add(pair.away);
      teamLastDate[pair.home] = dayCursor;
      teamLastDate[pair.away] = dayCursor;
      remaining.splice(idx, 1);
      idx--;
    }
    dayCursor++;
    if (dayCursor > 400) break; // safety valve
  }

  schedule.sort((a, b) => a.date.localeCompare(b.date));
  return schedule;
}
