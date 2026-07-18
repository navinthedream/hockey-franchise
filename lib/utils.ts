import { League, Player, SeasonStats, SkaterPlayer, Team } from './types';

export function teamById(league: League, id: string): Team | undefined {
  return league.teams.find(t => t.id === id);
}

export function teamLabel(t: Team) {
  return `${t.city} ${t.name}`;
}

export function playerName(p: Player | undefined) {
  return p ? `${p.firstName} ${p.lastName}` : 'Unknown';
}

export function formatRecord(t: Team) {
  return `${t.record.wins}-${t.record.losses}-${t.record.otLosses}`;
}

export function formatDate(iso: string) {
  const d = new Date(iso + 'T12:00:00');
  return d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
}

export function nextGameForTeam(league: League, teamId: string) {
  return league.schedule.find(g => !g.played && (g.homeTeamId === teamId || g.awayTeamId === teamId));
}

export function ratingColor(v: number) {
  if (v >= 85) return 'text-pp-gold';
  if (v >= 72) return 'text-win-teal';
  if (v >= 55) return 'text-ice-100';
  return 'text-steel-400';
}

export function seasonGamesPlayed(league: League) {
  return league.schedule.filter(g => g.played).length;
}
export function seasonGamesTotal(league: League) {
  return league.schedule.length;
}

export type StatKey = keyof SeasonStats;

export interface LeaderEntry {
  player: Player;
  team: Team | undefined;
  value: number;
}

/**
 * Returns top-N players sorted by a stat key.
 * position: 'skater' | 'goalie' | undefined (all)
 * minGames: qualifier floor (default 0)
 * ascending: for stats like GAA where lower is better
 * teamIds: restrict to players on these teams (undefined = all teams)
 * computeSort: custom sort-key function, overrides statKey sort (e.g. for rate stats like GAA/SV%)
 * limit: max results; Infinity = return all
 */
export function getLeaders(
  league: League,
  statKey: StatKey,
  options: {
    position?: 'skater' | 'goalie';
    minGames?: number;
    ascending?: boolean;
    limit?: number;
    teamIds?: Set<string>;
    computeSort?: (p: Player) => number;
  } = {},
): LeaderEntry[] {
  const { position, minGames = 0, ascending = false, limit = 10, teamIds, computeSort } = options;
  const players = Object.values(league.players).filter(p => {
    if (position === 'skater' && p.position === 'G') return false;
    if (position === 'goalie' && p.position !== 'G') return false;
    if (p.stats.gamesPlayed < minGames) return false;
    if (teamIds !== undefined && (p.teamId === null || !teamIds.has(p.teamId))) return false;
    return true;
  });

  const entries: LeaderEntry[] = players.map(p => ({
    player: p,
    team: league.teams.find(t => t.id === p.teamId),
    value: p.stats[statKey] as number,
  }));

  if (computeSort) {
    entries.sort((a, b) => {
      const av = computeSort(a.player);
      const bv = computeSort(b.player);
      return ascending ? av - bv : bv - av;
    });
  } else {
    entries.sort((a, b) => ascending ? a.value - b.value : b.value - a.value);
  }

  return entries.slice(0, limit);
}

/** Save% as a formatted string (e.g. ".924") */
export function formatSavePct(saves: number, shotsAgainst: number): string {
  if (shotsAgainst === 0) return '—';
  return (saves / shotsAgainst).toFixed(3).replace(/^0/, '');
}

/** GAA formatted to 2 decimal places */
export function formatGAA(goalsAgainst: number, gamesPlayed: number): string {
  if (gamesPlayed === 0) return '—';
  return (goalsAgainst / gamesPlayed).toFixed(2);
}

function _avg(ns: number[]) { return ns.reduce((a, b) => a + b, 0) / (ns.length || 1); }

/** Forward line offensive composite — mirrors simEngine lineAttack exactly */
export function lineAttackRating(line: SkaterPlayer[]): number {
  if (!line.length) return 50;
  return _avg(line.map(p =>
    p.ratings.passing * 0.24 + p.ratings.offAwareness * 0.22 + p.ratings.puckControl * 0.18 +
    p.ratings.deking * 0.14 + ((p.ratings.wristShotAccuracy + p.ratings.wristShotPower) / 2) * 0.22,
  ));
}
/** Forward line defensive composite — mirrors simEngine lineDefend exactly */
export function lineDefendRating(line: SkaterPlayer[]): number {
  if (!line.length) return 50;
  return _avg(line.map(p =>
    p.ratings.defAwareness * 0.4 + p.ratings.stickChecking * 0.25 + p.ratings.strength * 0.15 + p.ratings.balance * 0.2,
  ));
}
/** D pair offensive composite — mirrors simEngine pairAttack exactly */
export function pairAttackRating(pair: SkaterPlayer[]): number {
  if (!pair.length) return 45;
  return _avg(pair.map(p =>
    p.ratings.passing * 0.3 + p.ratings.offAwareness * 0.25 +
    ((p.ratings.slapShotAccuracy + p.ratings.slapShotPower) / 2) * 0.25 + p.ratings.poise * 0.2,
  ));
}
/** D pair defensive composite — mirrors simEngine pairDefend exactly */
export function pairDefendRating(pair: SkaterPlayer[]): number {
  if (!pair.length) return 55;
  return _avg(pair.map(p =>
    p.ratings.defAwareness * 0.35 + p.ratings.shotBlocking * 0.25 + p.ratings.stickChecking * 0.2 + p.ratings.strength * 0.2,
  ));
}
