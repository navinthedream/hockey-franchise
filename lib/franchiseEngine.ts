import { League, GameResult } from './types';
import { simulateGame } from './simEngine';

function applyResultToStandings(league: League, result: GameResult) {
  const home = league.teams.find(t => t.id === result.homeTeamId)!;
  const away = league.teams.find(t => t.id === result.awayTeamId)!;

  home.record.goalsFor += result.homeScore;
  home.record.goalsAgainst += result.awayScore;
  away.record.goalsFor += result.awayScore;
  away.record.goalsAgainst += result.homeScore;

  if (result.homeScore > result.awayScore) {
    home.record.wins++;
    home.record.points += 2;
    if (result.wentToOT || result.wentToShootout) { away.record.otLosses++; away.record.points += 1; }
    else { away.record.losses++; }
  } else {
    away.record.wins++;
    away.record.points += 2;
    if (result.wentToOT || result.wentToShootout) { home.record.otLosses++; home.record.points += 1; }
    else { home.record.losses++; }
  }
}

// Note: per-player stats (goals, assists, hits, blocks, takeaways, faceoffs, PIM,
// goalie W/L/saves/GA) are written directly onto the shared player objects inside
// simulateGame() itself, since the engine already holds live player references at
// the exact moment each event happens. Only team-level standings are aggregated here.

/** Simulates every game scheduled on the earliest unplayed date. Returns the results + new current date. */
export function simulateNextGameDay(league: League): { league: League; results: GameResult[]; date: string | null } {
  const nextUnplayed = league.schedule.find(g => !g.played);
  if (!nextUnplayed) return { league, results: [], date: null };
  const date = nextUnplayed.date;
  const gamesToday = league.schedule.filter(g => !g.played && g.date === date);
  const results: GameResult[] = [];

  gamesToday.forEach(sg => {
    const home = league.teams.find(t => t.id === sg.homeTeamId)!;
    const away = league.teams.find(t => t.id === sg.awayTeamId)!;
    const result = simulateGame(home, away, league.players, date);
    league.results[sg.id] = result;
    sg.played = true;
    applyResultToStandings(league, result);
    results.push(result);
  });

  league.currentDate = date;
  return { league, results, date };
}

/** Sims day by day until (and including) the next date on which the given team plays, or season ends. */
export function simulateUntilNextTeamGame(league: League, teamId: string, maxDays = 400): { league: League; results: GameResult[] } {
  const allResults: GameResult[] = [];
  for (let i = 0; i < maxDays; i++) {
    const { results, date } = simulateNextGameDay(league);
    allResults.push(...results);
    if (!date) break; // season over
    if (results.some(r => r.homeTeamId === teamId || r.awayTeamId === teamId)) break;
  }
  return { league, results: allResults };
}

/** Sims the entire remaining schedule. */
export function simulateRestOfSeason(league: League, maxDays = 400): { league: League; results: GameResult[] } {
  const allResults: GameResult[] = [];
  for (let i = 0; i < maxDays; i++) {
    const { results, date } = simulateNextGameDay(league);
    allResults.push(...results);
    if (!date) break;
  }
  if (league.schedule.every(g => g.played)) league.phase = 'offseason';
  return { league, results: allResults };
}

export function getStandings(league: League) {
  return [...league.teams].sort((a, b) => {
    if (b.record.points !== a.record.points) return b.record.points - a.record.points;
    const aDiff = a.record.goalsFor - a.record.goalsAgainst;
    const bDiff = b.record.goalsFor - b.record.goalsAgainst;
    return bDiff - aDiff;
  });
}
