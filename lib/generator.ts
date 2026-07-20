import {
  Player, SkaterPlayer, GoaliePlayer, SkaterAttributes, GoalieAttributes,
  Position, SkaterPosition, SeasonStats, ForwardArchetype, DefensemanArchetype, GoalieArchetype,
  Team, League, Lines, RealStats,
} from './types';

// ---------- RNG helpers ----------
function rand(min: number, max: number) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}
function pick<T>(arr: T[]): T {
  return arr[rand(0, arr.length - 1)];
}
function clamp(n: number, lo = 30, hi = 99) {
  return Math.max(lo, Math.min(hi, Math.round(n)));
}
export function uid(prefix: string) {
  return `${prefix}_${Math.random().toString(36).slice(2, 10)}`;
}

// ============================================================
// ARCHETYPE PROFILES
// ============================================================
type SkaterAttrKey = keyof SkaterAttributes;
type GoalieAttrKey = keyof GoalieAttributes;
type Bias = Partial<Record<SkaterAttrKey, number>>;
type OverallWeights = Partial<Record<SkaterAttrKey, number>>;

const SKATER_ATTR_KEYS: SkaterAttrKey[] = [
  'deking', 'handEye', 'passing', 'puckControl',
  'discipline', 'offAwareness', 'poise',
  'slapShotAccuracy', 'slapShotPower', 'wristShotAccuracy', 'wristShotPower',
  'defAwareness', 'faceoffs', 'shotBlocking', 'stickChecking',
  'acceleration', 'agility', 'balance', 'endurance', 'speed',
  'aggressiveness', 'bodyChecking', 'durability', 'fightingSkill', 'strength',
];
const GOALIE_ATTR_KEYS: GoalieAttrKey[] = [
  'positioning', 'angles', 'fiveHole', 'gloveSave', 'blockerSave', 'quickness',
  'reboundControl', 'puckHandling', 'passing', 'poise', 'consistency', 'aggressiveness',
  'flexibility', 'endurance', 'durability',
];

interface ArchetypeDef { bias: Bias; overallWeights: OverallWeights; }

const FORWARD_ARCHETYPES: Record<ForwardArchetype, ArchetypeDef> = {
  'Sniper': {
    bias: { slapShotAccuracy: 10, slapShotPower: 8, wristShotAccuracy: 15, wristShotPower: 13, offAwareness: 8, deking: 6, defAwareness: -10, stickChecking: -8, bodyChecking: -8, fightingSkill: -14 },
    overallWeights: { wristShotAccuracy: .2, wristShotPower: .12, slapShotAccuracy: .08, offAwareness: .14, deking: .1, puckControl: .08, acceleration: .1, speed: .1, agility: .08 },
  },
  'Playmaker': {
    bias: { passing: 15, handEye: 8, offAwareness: 12, poise: 8, deking: 7, puckControl: 9, bodyChecking: -6, fightingSkill: -10 },
    overallWeights: { passing: .24, offAwareness: .16, puckControl: .12, deking: .1, poise: .08, wristShotAccuracy: .08, agility: .08, acceleration: .07, speed: .07 },
  },
  'Power Forward': {
    bias: { strength: 14, bodyChecking: 12, wristShotPower: 9, slapShotPower: 8, aggressiveness: 8, agility: -6, deking: -4 },
    overallWeights: { strength: .14, bodyChecking: .12, wristShotPower: .12, wristShotAccuracy: .1, slapShotPower: .08, offAwareness: .1, puckControl: .1, aggressiveness: .08, speed: .08, defAwareness: .08 },
  },
  'Two-Way Forward': {
    bias: { defAwareness: 11, stickChecking: 9, faceoffs: 8, offAwareness: 6, discipline: 7 },
    overallWeights: { defAwareness: .18, stickChecking: .13, offAwareness: .12, wristShotAccuracy: .09, passing: .1, faceoffs: .1, acceleration: .08, speed: .08, puckControl: .07, discipline: .05 },
  },
  'Enforcer': {
    bias: { fightingSkill: 24, aggressiveness: 18, strength: 15, bodyChecking: 13, wristShotAccuracy: -16, slapShotAccuracy: -14, deking: -12, passing: -10, offAwareness: -10 },
    overallWeights: { fightingSkill: .24, strength: .18, bodyChecking: .18, aggressiveness: .14, defAwareness: .1, stickChecking: .08, durability: .05, endurance: .03 },
  },
  'Grinder': {
    bias: { faceoffs: 10, stickChecking: 8, defAwareness: 8, endurance: 9, aggressiveness: 6, wristShotAccuracy: -6, deking: -6 },
    overallWeights: { faceoffs: .14, stickChecking: .14, defAwareness: .14, endurance: .13, bodyChecking: .1, discipline: .08, acceleration: .08, speed: .07, puckControl: .06, wristShotAccuracy: .06 },
  },
};

const DEFENSEMAN_ARCHETYPES: Record<DefensemanArchetype, ArchetypeDef> = {
  'Offensive Defenseman': {
    bias: { slapShotAccuracy: 11, slapShotPower: 11, passing: 11, offAwareness: 8, poise: 7, defAwareness: -9, shotBlocking: -6, bodyChecking: -4 },
    overallWeights: { slapShotPower: .12, slapShotAccuracy: .12, passing: .16, offAwareness: .14, poise: .08, acceleration: .08, agility: .08, defAwareness: .09, stickChecking: .06, shotBlocking: .07 },
  },
  'Defensive Defenseman': {
    bias: { defAwareness: 15, shotBlocking: 18, stickChecking: 13, strength: 8, discipline: 6, slapShotAccuracy: -11, wristShotAccuracy: -9, deking: -9, offAwareness: -6 },
    overallWeights: { defAwareness: .2, shotBlocking: .2, stickChecking: .16, strength: .1, bodyChecking: .1, balance: .06, discipline: .06, endurance: .06, passing: .06 },
  },
  'Two-Way Defenseman': {
    bias: { defAwareness: 6, offAwareness: 6, passing: 6, shotBlocking: 6, stickChecking: 6 },
    overallWeights: { defAwareness: .16, offAwareness: .12, passing: .12, shotBlocking: .12, stickChecking: .12, slapShotAccuracy: .08, acceleration: .08, agility: .08, poise: .06, strength: .06 },
  },
  'Enforcer Defenseman': {
    bias: { fightingSkill: 22, aggressiveness: 18, strength: 15, bodyChecking: 13, offAwareness: -11, passing: -9, slapShotAccuracy: -9, deking: -11 },
    overallWeights: { fightingSkill: .2, strength: .18, bodyChecking: .18, defAwareness: .12, shotBlocking: .1, aggressiveness: .12, durability: .06, endurance: .04 },
  },
};

const GOALIE_ARCHETYPES: Record<GoalieArchetype, { bias: Partial<Record<GoalieAttrKey, number>>; overallWeights: Partial<Record<GoalieAttrKey, number>> }> = {
  'Standup Goalie': {
    bias: { positioning: 13, angles: 13, fiveHole: -7, quickness: -5 },
    overallWeights: { positioning: .24, angles: .22, consistency: .14, reboundControl: .12, fiveHole: .06, poise: .1, durability: .06, flexibility: .06 },
  },
  'Butterfly Goalie': {
    bias: { flexibility: 13, fiveHole: 13, quickness: 9, reboundControl: -4, positioning: -4 },
    overallWeights: { flexibility: .2, fiveHole: .2, quickness: .16, gloveSave: .12, blockerSave: .12, reboundControl: .1, poise: .05, consistency: .05 },
  },
  'Puck-Handling Goalie': {
    bias: { puckHandling: 17, passing: 15, positioning: 4, reboundControl: -5 },
    overallWeights: { puckHandling: .2, passing: .18, positioning: .16, angles: .12, consistency: .1, gloveSave: .08, blockerSave: .08, poise: .08 },
  },
  'Hybrid Goalie': {
    bias: {},
    overallWeights: { positioning: .14, angles: .12, gloveSave: .12, blockerSave: .12, reboundControl: .12, flexibility: .1, quickness: .1, consistency: .09, poise: .09 },
  },
};

const POSITION_BASE: Record<SkaterPosition, Bias> = {
  C: { faceoffs: 18 },
  LW: { faceoffs: -22, defAwareness: -6, shotBlocking: -8, strength: -2 },
  RW: { faceoffs: -22, defAwareness: -6, shotBlocking: -8, strength: -2 },
  LD: { faceoffs: -30, wristShotAccuracy: -7, wristShotPower: -5, deking: -5, handEye: -3, defAwareness: 9, shotBlocking: 11, stickChecking: 7, strength: 6, acceleration: -3 },
  RD: { faceoffs: -30, wristShotAccuracy: -7, wristShotPower: -5, deking: -5, handEye: -3, defAwareness: 9, shotBlocking: 11, stickChecking: 7, strength: 6, acceleration: -3 },
};

const GOALIE_ARCHETYPE_KEYS = Object.keys(GOALIE_ARCHETYPES) as GoalieArchetype[];

function isForwardPos(pos: SkaterPosition) { return pos === 'C' || pos === 'LW' || pos === 'RW'; }

// ---------- Legacy random generation (still used as fallback) ----------
function generateSkaterAttributes(pos: SkaterPosition, skillCenter: number, archetype: ForwardArchetype | DefensemanArchetype): SkaterAttributes {
  const def = isForwardPos(pos) ? FORWARD_ARCHETYPES[archetype as ForwardArchetype] : DEFENSEMAN_ARCHETYPES[archetype as DefensemanArchetype];
  const posBase = POSITION_BASE[pos];
  const result = {} as SkaterAttributes;
  SKATER_ATTR_KEYS.forEach(k => {
    const base = posBase[k] ?? 0;
    const bias = def.bias[k] ?? 0;
    result[k] = clamp(skillCenter + base + bias + rand(-6, 6));
  });
  return result;
}

function generateGoalieAttributes(skillCenter: number, archetype: GoalieArchetype): GoalieAttributes {
  const def = GOALIE_ARCHETYPES[archetype];
  const result = {} as GoalieAttributes;
  GOALIE_ATTR_KEYS.forEach(k => {
    const bias = def.bias[k] ?? 0;
    result[k] = clamp(skillCenter + bias + rand(-6, 6));
  });
  return result;
}

function computeSkaterOverall(pos: SkaterPosition, archetype: ForwardArchetype | DefensemanArchetype, isFwd: boolean, skillCenter: number, r: SkaterAttributes): number {
  const def = isFwd ? FORWARD_ARCHETYPES[archetype as ForwardArchetype] : DEFENSEMAN_ARCHETYPES[archetype as DefensemanArchetype];
  const posBase = POSITION_BASE[pos];
  const weights = def.overallWeights;
  const totalWeight = Object.values(weights).reduce((a, b) => a + (b ?? 0), 0) || 1;
  const keys = Object.keys(weights) as SkaterAttrKey[];
  const rawAvg = keys.reduce((s, k) => s + r[k] * (weights[k] ?? 0), 0) / totalWeight;
  const expectedAvg = keys.reduce((s, k) => s + (skillCenter + (posBase[k] ?? 0) + (def.bias[k] ?? 0)) * (weights[k] ?? 0), 0) / totalWeight;
  return clamp(skillCenter + (rawAvg - expectedAvg));
}

function computeGoalieOverall(archetype: GoalieArchetype, skillCenter: number, r: GoalieAttributes): number {
  const def = GOALIE_ARCHETYPES[archetype];
  const weights = def.overallWeights;
  const totalWeight = Object.values(weights).reduce((a, b) => a + (b ?? 0), 0) || 1;
  const keys = Object.keys(weights) as GoalieAttrKey[];
  const rawAvg = keys.reduce((s, k) => s + r[k] * (weights[k] ?? 0), 0) / totalWeight;
  const expectedAvg = keys.reduce((s, k) => s + (skillCenter + (def.bias[k] ?? 0)) * (weights[k] ?? 0), 0) / totalWeight;
  return clamp(skillCenter + (rawAvg - expectedAvg));
}

export function emptyStats(): SeasonStats {
  return {
    gamesPlayed: 0, goals: 0, assists: 0, points: 0, plusMinus: 0, pim: 0, shots: 0,
    hits: 0, blocks: 0, takeaways: 0, faceoffWins: 0, faceoffLosses: 0, fightingMajors: 0,
    wins: 0, losses: 0, otLosses: 0, shotsAgainst: 0, saves: 0, goalsAgainst: 0, shutouts: 0,
  };
}

type Tier = 'star' | 'top6' | 'middle' | 'depth' | 'prospect';
const SKILL_CENTERS: Record<Tier, number> = { star: 82, top6: 70, middle: 58, depth: 48, prospect: 45 };

const FORWARD_TIER_ARCHETYPE_WEIGHTS: Record<Tier, Partial<Record<ForwardArchetype, number>>> = {
  star: { Sniper: 3, Playmaker: 3, 'Power Forward': 2, 'Two-Way Forward': 1.5, Grinder: 0.2, Enforcer: 0.1 },
  top6: { Sniper: 2.5, Playmaker: 2.5, 'Power Forward': 2, 'Two-Way Forward': 2, Grinder: 0.6, Enforcer: 0.3 },
  middle: { Sniper: 1.3, Playmaker: 1.3, 'Power Forward': 1.5, 'Two-Way Forward': 2, Grinder: 1.5, Enforcer: 0.8 },
  depth: { Sniper: 0.3, Playmaker: 0.4, 'Power Forward': 1, 'Two-Way Forward': 1.5, Grinder: 2.6, Enforcer: 2.1 },
  prospect: { Sniper: 1.5, Playmaker: 1.5, 'Power Forward': 1.3, 'Two-Way Forward': 1.3, Grinder: 1, Enforcer: 0.6 },
};
const DEFENSEMAN_TIER_ARCHETYPE_WEIGHTS: Record<Tier, Partial<Record<DefensemanArchetype, number>>> = {
  star: { 'Offensive Defenseman': 2.5, 'Defensive Defenseman': 2.5, 'Two-Way Defenseman': 3, 'Enforcer Defenseman': 0.2 },
  top6: { 'Offensive Defenseman': 2.5, 'Defensive Defenseman': 2.5, 'Two-Way Defenseman': 3, 'Enforcer Defenseman': 0.3 },
  middle: { 'Offensive Defenseman': 1.5, 'Defensive Defenseman': 2, 'Two-Way Defenseman': 2.2, 'Enforcer Defenseman': 0.8 },
  depth: { 'Offensive Defenseman': 0.7, 'Defensive Defenseman': 2, 'Two-Way Defenseman': 1.5, 'Enforcer Defenseman': 2.2 },
  prospect: { 'Offensive Defenseman': 1.5, 'Defensive Defenseman': 1.5, 'Two-Way Defenseman': 2, 'Enforcer Defenseman': 0.5 },
};

function pickWeighted<T extends string>(weights: Partial<Record<T, number>>): T {
  const entries = Object.entries(weights) as [T, number][];
  const total = entries.reduce((s, [, w]) => s + w, 0);
  let r = Math.random() * total;
  for (const [key, w] of entries) {
    r -= w;
    if (r <= 0) return key;
  }
  return entries[entries.length - 1][0];
}

function contractFor(overall: number): { salaryAAV: number; yearsRemaining: number } {
  const capBase = 0.775 + (overall / 99) ** 3 * 11;
  return { salaryAAV: Math.round(capBase * 100) / 100, yearsRemaining: rand(1, 7) };
}

export function generatePlayer(position: Position, teamId: string | null, tier: Tier = 'middle'): Player {
  const skill = SKILL_CENTERS[tier] + rand(-4, 4);
  const age = tier === 'prospect' ? rand(18, 21) : rand(20, 36);
  const potentialBump = tier === 'prospect' ? rand(5, 20) : rand(-3, 5);
  const firstName = pick(['Connor', 'Jack', 'Nathan', 'Tyler', 'Auston', 'Cale', 'Quinn', 'Nikita', 'Elias', 'Kirill', 'Adam', 'Dylan', 'Brayden', 'Owen', 'Cole', 'Zach', 'Max', 'Sam', 'Alex', 'Chris', 'Filip', 'Viktor', 'Pavel', 'Andrei', 'Miro', 'Tomas', 'Dominik', 'Kevin', 'Brandon', 'Trevor', 'Josh', 'Will']);
  const lastName = pick(['Mitchell', 'Hughes', 'Cole', 'Nylander', 'Makar', 'Pastrnak', 'Kaprizov', 'Draisaitl', 'Barkov', 'Point', 'Tkachuk', 'Bedard', 'Rantanen', 'Kucherov', 'Larkin', 'Fox', 'Reinhart', 'Hischier', 'Necas', 'Novak', 'Svoboda', 'Dvorak', 'Kovac', 'Muller', 'Bergman', 'Andersson', 'Holt', 'Reilly', 'Carrick', 'Petrov', 'Volkov', 'Orlov', 'Rossi', 'Chase', 'Ford', 'Griffin']);

  if (position === 'G') {
    const archetype = pick(GOALIE_ARCHETYPE_KEYS);
    const ratings = generateGoalieAttributes(skill, archetype);
    const overall = computeGoalieOverall(archetype, skill, ratings);
    const player: GoaliePlayer = {
      id: uid('p'), firstName, lastName, position: 'G', archetype,
      handedness: Math.random() > 0.6 ? 'R' : 'L',
      age, overall, potential: clamp(overall + potentialBump), ratings, teamId,
      contract: contractFor(overall), stats: emptyStats(), morale: rand(60, 90),
    };
    return player;
  }

  const isFwd = isForwardPos(position);
  const archetype = isFwd ? pickWeighted(FORWARD_TIER_ARCHETYPE_WEIGHTS[tier]) : pickWeighted(DEFENSEMAN_TIER_ARCHETYPE_WEIGHTS[tier]);
  const ratings = generateSkaterAttributes(position, skill, archetype);
  const overall = computeSkaterOverall(position, archetype, isFwd, skill, ratings);
  const player: SkaterPlayer = {
    id: uid('p'), firstName, lastName, position, archetype,
    handedness: Math.random() > 0.6 ? 'R' : 'L',
    age, overall, potential: clamp(overall + potentialBump), ratings, teamId,
    contract: contractFor(overall), stats: emptyStats(), morale: rand(60, 90),
  };
  return player;
}

export function buildLines(roster: Player[]): Lines {
  const byPos = (p: Position) => roster.filter(pl => pl.position === p).sort((a, b) => b.overall - a.overall);
  const C = byPos('C'), LW = byPos('LW'), RW = byPos('RW'), LD = byPos('LD'), RD = byPos('RD'), G = byPos('G');
  const fwds = [...C, ...LW, ...RW].sort((a, b) => b.overall - a.overall);
  const defs = [...LD, ...RD].sort((a, b) => b.overall - a.overall);

  const used = new Set<string>();
  // Return the best available player from preferred list, falling back to the pool.
  // Allows wrapping around only as an absolute last resort to avoid empty slots.
  function next(preferred: Player[], pool: Player[]): string {
    for (const p of preferred) { if (!used.has(p.id)) { used.add(p.id); return p.id; } }
    for (const p of pool)      { if (!used.has(p.id)) { used.add(p.id); return p.id; } }
    // If all are used (tiny roster edge-case), allow a duplicate
    const fallback = preferred[0] ?? pool[0];
    return fallback?.id ?? '';
  }

  const forwardLines: [string, string, string][] = [0, 1, 2, 3].map(() => [
    next(LW, fwds), next(C, fwds), next(RW, fwds),
  ]);
  const dPairs: [string, string][] = [0, 1, 2].map(() => [
    next(LD, defs), next(RD, defs),
  ]);
  return { forwardLines, dPairs, goalieRotation: G.map(gl => gl.id) };
}

// ============================================================
// TEAM SEEDS — re-exported from client-safe lib/teamSeeds.ts
// (generator.ts itself must only be imported server-side; TeamPicker
//  imports directly from teamSeeds.ts to avoid pulling fs into the bundle)
// ============================================================
export type { TeamSeed } from './teamSeeds';
export { TEAM_SEEDS } from './teamSeeds';

// ============================================================
// REAL-DATA TYPES (private — only used inside generateLeague)
// ============================================================
interface MpSkater {
  icetime_sec: number;
  goals_per60: number; a1_per60: number; a2_per60: number;
  xGF_per60: number; xGA_per60: number; shots_per60: number;
  hits_per60: number; blocks_per60: number; takeaways_per60: number;
  giveaways_per60: number; pim_per60: number; ind_xG_per60: number;
  faceoff_pct: number; corsi_pct: number; xG_pct: number;
}
interface MpGoalie {
  icetime_sec: number; games_played: number;
  gaa: number; sv_pct: number; xsv_pct: number; gsaa: number;
  high_danger_sv_pct: number; med_danger_sv_pct: number;
}
interface RealPlayer {
  nhlId: number; firstName: string; lastName: string;
  position: string; handedness: string; age: number;
  mp: MpSkater | MpGoalie | null;
}
interface RealTeamData {
  tricode: string; city: string; name: string;
  conference: 'Eastern' | 'Western'; division: string;
  roster: RealPlayer[];
}
export interface RealLeagueJson { teams: RealTeamData[]; }

// ============================================================
// REAL-DATA PERCENTILE HELPERS
// ============================================================

/** Returns the ascending-percentile rank of val in sortedAsc [0, 1] */
function pctRank(val: number, sortedAsc: number[]): number {
  if (!sortedAsc.length) return 0.5;
  let lo = 0, hi = sortedAsc.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (sortedAsc[mid] <= val) lo = mid + 1;
    else hi = mid;
  }
  return Math.min(lo / sortedAsc.length, 1);
}

/**
 * Maps a percentile [0,1] within the NHL player population to a rating.
 * Piecewise-linear curve anchored to real NHL 26 ratings:
 *   p0.01 → 65 (fringe roster),  p0.50 → 80 (average NHL regular),
 *   p0.85 → 87,  p0.95 → 90,  p0.99 → 94,  p1.00 → 97 (elite).
 */
const RATING_CURVE: [number, number][] = [
  [0.00,  65],   // floor: any NHL-rostered player ≥ 65
  [0.10,  69],
  [0.30,  74],
  [0.50,  80],
  [0.75,  85],
  [0.85,  88],
  [0.92,  91],
  [0.96,  93],
  [0.99,  95],
  [1.00,  97],
];

function pctToRating(pct: number): number {
  const p = Math.max(0, Math.min(1, pct));
  for (let i = 1; i < RATING_CURVE.length; i++) {
    const [p0, v0] = RATING_CURVE[i - 1];
    const [p1, v1] = RATING_CURVE[i];
    if (p <= p1) return v0 + (v1 - v0) * (p - p0) / (p1 - p0);
  }
  return RATING_CURVE[RATING_CURVE.length - 1][1];
}

/** Full-season ice-time threshold for 100% trust (≈900 min). Below this, blend toward p50. */
const FULL_ICE_S     = 54_000;
const FULL_GOALIE_GP = 55;

type StatGetters<T> = Record<string, (mp: T) => number>;

const SKATER_GETTERS: StatGetters<MpSkater> = {
  goals:     mp => mp.goals_per60,
  a1:        mp => mp.a1_per60,
  a2:        mp => mp.a2_per60,
  xGF:       mp => mp.xGF_per60,
  xGA:       mp => mp.xGA_per60,
  shots:     mp => mp.shots_per60,
  hits:      mp => mp.hits_per60,
  blocks:    mp => mp.blocks_per60,
  takeaways: mp => mp.takeaways_per60,
  giveaways: mp => mp.giveaways_per60,
  pim:       mp => mp.pim_per60,
  indxG:     mp => mp.ind_xG_per60,
  faceoff:   mp => mp.faceoff_pct,
  corsi:     mp => mp.corsi_pct,
  xGpct:     mp => mp.xG_pct,
};

const GOALIE_GETTERS: StatGetters<MpGoalie> = {
  sv:    mp => mp.sv_pct,
  gsaa:  mp => mp.gsaa,
  hdsv:  mp => mp.high_danger_sv_pct,
  mdsv:  mp => mp.med_danger_sv_pct,
  gaa:   mp => mp.gaa,
};

/** Build sorted ascending arrays of each stat for a group of players. */
function buildSortedStats<T>(
  players: RealPlayer[],
  getters: StatGetters<T>,
): Record<string, number[]> {
  const out: Record<string, number[]> = {};
  for (const [key, getter] of Object.entries(getters)) {
    const vals: number[] = [];
    for (const p of players) {
      if (p.mp !== null) {
        const v = getter(p.mp as T);
        if (isFinite(v)) vals.push(v);
      }
    }
    out[key] = vals.sort((a, b) => a - b);
  }
  return out;
}

function computeSkaterPcts(mp: MpSkater, sorted: Record<string, number[]>): Record<string, number> {
  // Shrink low-sample players toward p50 so hot 10-game call-ups don't look like 95 OVR.
  const shrink = Math.min(1, mp.icetime_sec / FULL_ICE_S);
  const r = (key: string, val: number) => {
    const raw = pctRank(val, sorted[key] ?? []);
    return raw * shrink + 0.5 * (1 - shrink);
  };
  return {
    goals:     r('goals',     mp.goals_per60),
    a1:        r('a1',        mp.a1_per60),
    a2:        r('a2',        mp.a2_per60),
    xGF:       r('xGF',       mp.xGF_per60),
    xGA:       r('xGA',       mp.xGA_per60),
    shots:     r('shots',     mp.shots_per60),
    hits:      r('hits',      mp.hits_per60),
    blocks:    r('blocks',    mp.blocks_per60),
    takeaways: r('takeaways', mp.takeaways_per60),
    giveaways: r('giveaways', mp.giveaways_per60),
    pim:       r('pim',       mp.pim_per60),
    indxG:     r('indxG',     mp.ind_xG_per60),
    faceoff:   r('faceoff',   mp.faceoff_pct),
    corsi:     r('corsi',     mp.corsi_pct),
    xGpct:     r('xGpct',     mp.xG_pct),
  };
}

function computeGoaliePcts(mp: MpGoalie, sorted: Record<string, number[]>): Record<string, number> {
  const shrink = Math.min(1, mp.games_played / FULL_GOALIE_GP);
  const r = (key: string, val: number, invert = false) => {
    const raw = invert ? 1 - pctRank(val, sorted[key] ?? []) : pctRank(val, sorted[key] ?? []);
    return raw * shrink + 0.5 * (1 - shrink);
  };
  return {
    sv:   r('sv',   mp.sv_pct),
    gsaa: r('gsaa', mp.gsaa),
    hdsv: r('hdsv', mp.high_danger_sv_pct),
    mdsv: r('mdsv', mp.med_danger_sv_pct),
    gaa:  r('gaa',  mp.gaa, true),   // inverted: lower GAA is better
  };
}

// ============================================================
// ATTRIBUTE BUILDERS FROM PERCENTILES
// ============================================================

function skaterAttrsFromPcts(pcts: Record<string, number>, pos: SkaterPosition): SkaterAttributes {
  const A = (c: number) => clamp(Math.round(pctToRating(c)) + rand(-4, 4));
  const { goals, a1, a2, xGF, xGA, shots, hits, blocks, takeaways, giveaways, pim, indxG, faceoff, corsi, xGpct } = pcts;

  const off   = goals * 0.30 + xGF * 0.30 + a1 * 0.25 + indxG * 0.15;
  const shoot = goals * 0.50 + shots * 0.30 + indxG * 0.20;
  const play  = a1 * 0.55    + a2 * 0.25    + xGF * 0.20;
  const def   = takeaways * 0.40 + (1 - giveaways) * 0.30 + blocks * 0.20 + corsi * 0.10;
  const poss  = corsi * 0.50  + xGpct * 0.50;
  const phys  = hits * 0.65   + pim * 0.35;

  return {
    // Shooting
    wristShotAccuracy: A(shoot * 0.70 + off * 0.30),
    wristShotPower:    A(shoot * 0.50 + shots * 0.30 + off * 0.20),
    slapShotAccuracy:  A(shoot * 0.40 + off * 0.40 + shots * 0.20),
    slapShotPower:     A(off * 0.40 + phys * 0.30 + shots * 0.30),
    // Puck Skills
    deking:            A(off * 0.50 + play * 0.50),
    handEye:           A(play * 0.60 + shoot * 0.40),
    passing:           A(play),
    puckControl:       A(play * 0.50 + poss * 0.50),
    // Senses
    discipline:        A(1 - pim),
    offAwareness:      A(off),
    poise:             A(poss * 0.50 + play * 0.30 + (1 - giveaways) * 0.20),
    // Defense
    defAwareness:      A(def),
    faceoffs:          pos === 'C' ? A(faceoff) : clamp(30 + rand(-4, 4)),
    shotBlocking:      A(blocks * 0.80 + def * 0.20),
    stickChecking:     A(takeaways * 0.65 + (1 - giveaways) * 0.35),
    // Skating (no direct tracking data — proxy via possession/xG)
    acceleration:      A(poss * 0.60 + off * 0.40),
    agility:           A(poss * 0.60 + off * 0.40),
    balance:           A(poss * 0.60 + (1 - pim) * 0.40),
    endurance:         clamp(55 + rand(-10, 10)),
    speed:             A(poss * 0.50 + off * 0.50),
    // Physical
    aggressiveness:    A(phys),
    bodyChecking:      A(phys * 0.75 + def * 0.25),
    durability:        clamp(60 + rand(-10, 10)),
    fightingSkill:     clamp(Math.round(pctToRating(pim * 0.30 + Math.random() * 0.70)) + rand(-4, 4)),
    strength:          A(phys * 0.50 + (1 - (1 - xGA)) * 0.50),
  };
}

function goalieAttrsFromPcts(pcts: Record<string, number>): GoalieAttributes {
  const A = (c: number) => clamp(Math.round(pctToRating(c)) + rand(-4, 4));
  const { sv, gsaa, hdsv, mdsv, gaa } = pcts;
  const overall = sv * 0.35 + gsaa * 0.25 + hdsv * 0.25 + gaa * 0.15;
  return {
    positioning:    A(sv * 0.50 + overall * 0.50),
    angles:         A(sv * 0.50 + gaa * 0.50),
    fiveHole:       A(hdsv * 0.60 + overall * 0.40),
    gloveSave:      A(sv * 0.50 + hdsv * 0.50),
    blockerSave:    A(sv * 0.50 + mdsv * 0.50),
    quickness:      A(hdsv * 0.65 + gsaa * 0.35),
    reboundControl: A(overall * 0.50 + sv * 0.50),
    puckHandling:   clamp(55 + rand(-12, 12)),
    passing:        clamp(50 + rand(-12, 12)),
    poise:          A(overall * 0.60 + gsaa * 0.40),
    consistency:    A(sv * 0.70 + gsaa * 0.30),
    aggressiveness: clamp(50 + rand(-12, 12)),
    flexibility:    A(overall * 0.50 + Math.random() * 0.50),
    endurance:      clamp(60 + rand(-8, 8)),
    durability:     clamp(60 + rand(-8, 8)),
  };
}

// ============================================================
// ARCHETYPE DETECTION
// ============================================================

function detectFwdArchetype(pcts: Record<string, number>): ForwardArchetype {
  const { goals, a1, hits, pim, takeaways, giveaways } = pcts;
  const hasPoints  = goals > 0.42 || a1 > 0.42;
  const isShutdown = takeaways > 0.55 && (1 - giveaways) > 0.50;

  if (pim > 0.72 && hits > 0.70 && !hasPoints)   return 'Enforcer';
  if (hits > 0.72 && !hasPoints)                  return 'Grinder';
  if (goals > 0.62 && goals > a1 + 0.14)          return 'Sniper';
  if (a1 > 0.62 && a1 > goals + 0.14)             return 'Playmaker';
  if (hits > 0.60 && hasPoints)                   return 'Power Forward';
  if (isShutdown)                                  return 'Two-Way Forward';
  return 'Two-Way Forward';
}

function detectDArchetype(pcts: Record<string, number>): DefensemanArchetype {
  const { a1, xGpct, blocks, takeaways, hits, pim } = pcts;
  const isOffensive = a1 > 0.55 || xGpct > 0.55;
  const isShutdown  = blocks > 0.60 && takeaways > 0.50;

  if (hits > 0.70 && pim > 0.65 && !isOffensive)  return 'Enforcer Defenseman';
  if (isOffensive && !isShutdown)                  return 'Offensive Defenseman';
  if (isShutdown && !isOffensive)                  return 'Defensive Defenseman';
  return 'Two-Way Defenseman';
}

function detectGoalieArchetype(_pcts: Record<string, number>): GoalieArchetype {
  const roll = Math.random();
  if (roll < 0.45) return 'Butterfly Goalie';
  if (roll < 0.80) return 'Hybrid Goalie';
  if (roll < 0.93) return 'Standup Goalie';
  return 'Puck-Handling Goalie';
}

// ============================================================
// OVERALL FROM GENERATED ATTRIBUTES
// ============================================================

function overallFromSkaterAttrs(ratings: SkaterAttributes, archetype: ForwardArchetype | DefensemanArchetype, isFwd: boolean): number {
  const def = isFwd ? FORWARD_ARCHETYPES[archetype as ForwardArchetype] : DEFENSEMAN_ARCHETYPES[archetype as DefensemanArchetype];
  const weights = def.overallWeights;
  const totalWeight = Object.values(weights).reduce((a, b) => a + (b ?? 0), 0) || 1;
  const keys = Object.keys(weights) as SkaterAttrKey[];
  const weighted = keys.reduce((s, k) => s + ratings[k] * (weights[k] ?? 0), 0) / totalWeight;
  return clamp(Math.round(weighted));
}

function overallFromGoalieAttrs(ratings: GoalieAttributes, archetype: GoalieArchetype): number {
  const def = GOALIE_ARCHETYPES[archetype];
  const weights = def.overallWeights;
  const totalWeight = Object.values(weights).reduce((a, b) => a + (b ?? 0), 0) || 1;
  const keys = Object.keys(weights) as GoalieAttrKey[];
  const weighted = keys.reduce((s, k) => s + ratings[k] * (weights[k] ?? 0), 0) / totalWeight;
  return clamp(Math.round(weighted));
}

// ============================================================
// MAP NHL API POSITION → GAME POSITION
// ============================================================

function mapNhlPosition(pos: string, hand: string): Position {
  if (pos === 'G') return 'G';
  if (pos === 'D') return hand === 'R' ? 'RD' : 'LD';
  if (pos === 'RW') return 'RW';
  if (pos === 'LW') return 'LW';
  return 'C'; // default for missing
}

// Fallback tier for unmatched players (no MoneyPuck data)
function ageTier(age: number): Tier {
  if (age <= 21) return 'prospect';
  if (age <= 24) return 'depth';
  return 'middle';
}

// ============================================================
// MASTER PERCENTILE → OVERALL  (direct curve, bypasses attr average)
// ============================================================

/**
 * Computes a single "master percentile" for a skater, weighted toward the stats
 * that most strongly separate elite NHL players from league-average players.
 */
function skaterMasterPct(pcts: Record<string, number>, isFwd: boolean): number {
  const { goals, a1, indxG, xGF, corsi, takeaways, giveaways, blocks, xGpct } = pcts;
  if (isFwd) {
    // Forwards: scoring production dominates; two-way value adds margin
    return goals * 0.30 + a1 * 0.25 + indxG * 0.20 + xGF * 0.15 +
           corsi * 0.05 + takeaways * 0.03 + (1 - giveaways) * 0.02;
  }
  // Defensemen: balanced across offense, possession, and defensive metrics
  return a1 * 0.25 + corsi * 0.18 + xGpct * 0.18 + blocks * 0.12 +
         takeaways * 0.15 + (1 - giveaways) * 0.07 + xGF * 0.05;
}

function goalieMasterPct(pcts: Record<string, number>): number {
  const { gsaa, sv, hdsv, gaa } = pcts;
  // GSAA most predictive of true goalie quality; high-danger save % separates elite from good
  return gsaa * 0.40 + sv * 0.25 + hdsv * 0.25 + gaa * 0.10;
}

// ============================================================
// BUILD ONE PLAYER FROM REAL DATA
// ============================================================

interface SortedComposites {
  fwd: number[];
  def: number[];
  goalie: number[];
}

function buildPlayerFromReal(
  rp: RealPlayer,
  teamId: string,
  skaterSorted: Record<string, number[]>,
  goalieSorted: Record<string, number[]>,
  sortedComposites: SortedComposites,
): Player {
  const id  = `p_nhl_${rp.nhlId}`;
  const pos = mapNhlPosition(rp.position, rp.handedness);
  const hand = rp.handedness === 'R' ? 'R' : 'L';

  if (pos === 'G') {
    if (rp.mp !== null) {
      const mp     = rp.mp as MpGoalie;
      const pcts   = computeGoaliePcts(mp, goalieSorted);
      const arch   = detectGoalieArchetype(pcts);
      const ratings = goalieAttrsFromPcts(pcts);
      const composite = goalieMasterPct(pcts);
      const overall = clamp(Math.round(pctToRating(pctRank(composite, sortedComposites.goalie))));
      const realStats: RealStats = {
        gaa: mp.gaa, sv_pct: mp.sv_pct, gsaa: mp.gsaa,
        gamesPlayed: mp.games_played, icetimeSec: mp.icetime_sec,
      };
      const goalie: GoaliePlayer = {
        id, firstName: rp.firstName, lastName: rp.lastName, position: 'G', archetype: arch,
        handedness: hand, age: rp.age, overall,
        potential: clamp(overall + rand(-3, 8)), ratings, teamId,
        contract: contractFor(overall), stats: emptyStats(), realStats, morale: rand(60, 90),
      };
      return goalie;
    }
    const fallback = generatePlayer('G', teamId, ageTier(rp.age)) as GoaliePlayer;
    return { ...fallback, id, firstName: rp.firstName, lastName: rp.lastName, handedness: hand, age: rp.age, teamId };
  }

  const isFwd = pos === 'C' || pos === 'LW' || pos === 'RW';

  if (rp.mp !== null) {
    const mp      = rp.mp as MpSkater;
    const pcts    = computeSkaterPcts(mp, skaterSorted);
    const arch    = isFwd ? detectFwdArchetype(pcts) : detectDArchetype(pcts);
    const ratings = skaterAttrsFromPcts(pcts, pos);
    const composite = skaterMasterPct(pcts, isFwd);
    const overall = clamp(Math.round(pctToRating(pctRank(composite, isFwd ? sortedComposites.fwd : sortedComposites.def))));
    const realStats: RealStats = {
      goals_per60: mp.goals_per60, a1_per60: mp.a1_per60,
      xGF_per60: mp.xGF_per60, corsi_pct: mp.corsi_pct,
      hits_per60: mp.hits_per60, blocks_per60: mp.blocks_per60,
      icetimeSec: mp.icetime_sec,
    };
    const skater: SkaterPlayer = {
      id, firstName: rp.firstName, lastName: rp.lastName, position: pos, archetype: arch,
      handedness: hand, age: rp.age, overall,
      potential: clamp(overall + rand(-3, 10)), ratings, teamId,
      contract: contractFor(overall), stats: emptyStats(), realStats, morale: rand(60, 90),
    };
    return skater;
  }

  const fallback = generatePlayer(pos, teamId, ageTier(rp.age)) as SkaterPlayer;
  return { ...fallback, id, firstName: rp.firstName, lastName: rp.lastName, handedness: hand, age: rp.age, position: pos, teamId };
}

// ============================================================
// MAIN ENTRY POINT
// ============================================================

export function generateLeague(seasonYear: number, data: RealLeagueJson): League {

  // Collect players by position group for percentile ranking (min icetime filter)
  const allPlayers  = data.teams.flatMap(t => t.roster);
  // 30 000 s ≈ 50 games × 10 min — excludes very-short-sample callups
  const MIN_ICE_S   = 30_000;
  const MIN_GP_G    = 15;

  const qualSkater  = (p: RealPlayer) => p.mp !== null && (p.mp as MpSkater).icetime_sec >= MIN_ICE_S;
  const qualGoalie  = (p: RealPlayer) => p.mp !== null && (p.mp as MpGoalie).games_played >= MIN_GP_G;

  const centerPool  = allPlayers.filter(p => p.position === 'C' && qualSkater(p));
  const wingerPool  = allPlayers.filter(p => (p.position === 'LW' || p.position === 'RW') && qualSkater(p));
  const dPool       = allPlayers.filter(p => p.position === 'D' && qualSkater(p));
  const goaliePool  = allPlayers.filter(p => p.position === 'G' && qualGoalie(p));

  const cSorted = buildSortedStats<MpSkater>(centerPool, SKATER_GETTERS);
  const wSorted = buildSortedStats<MpSkater>(wingerPool, SKATER_GETTERS);
  const dSorted = buildSortedStats<MpSkater>(dPool,      SKATER_GETTERS);
  const gSorted = buildSortedStats<MpGoalie>(goaliePool, GOALIE_GETTERS);

  // ── Pre-pass: build ranked composite distributions ────────────────────────
  // Re-ranking the master composite (rather than using its raw value directly)
  // guarantees the best player reaches pct=1.0 → 97 OVR, median → 80, etc.
  const fwdComposites: number[] = [];
  const defComposites: number[] = [];
  const goalieComposites: number[] = [];

  for (const rp of allPlayers) {
    if (rp.mp === null) continue;
    if (rp.position === 'G') {
      const pcts = computeGoaliePcts(rp.mp as MpGoalie, gSorted);
      goalieComposites.push(goalieMasterPct(pcts));
    } else {
      const ss   = rp.position === 'D' ? dSorted : (rp.position === 'C' ? cSorted : wSorted);
      const pcts = computeSkaterPcts(rp.mp as MpSkater, ss);
      const isFwdPos = rp.position !== 'D';
      if (isFwdPos) fwdComposites.push(skaterMasterPct(pcts, true));
      else          defComposites.push(skaterMasterPct(pcts, false));
    }
  }
  fwdComposites.sort((a, b) => a - b);
  defComposites.sort((a, b) => a - b);
  goalieComposites.sort((a, b) => a - b);
  const sortedComposites: SortedComposites = { fwd: fwdComposites, def: defComposites, goalie: goalieComposites };

  const players: Record<string, Player> = {};
  const teams: Team[] = [];

  for (const rt of data.teams) {
    const teamId = `team_${rt.tricode.toLowerCase()}`;
    const roster: Player[] = [];

    for (const rp of rt.roster) {
      const skaterSorted = rp.position === 'D' ? dSorted : (rp.position === 'C' ? cSorted : wSorted);
      const player = buildPlayerFromReal(rp, teamId, skaterSorted, gSorted, sortedComposites);
      players[player.id] = player;
      roster.push(player);
    }

    const lines   = buildLines(roster);
    const capUsed = roster.reduce((s, p) => s + p.contract.salaryAAV, 0);
    const capCeiling = 88;

    teams.push({
      id: teamId,
      city: rt.city,
      name: rt.name,
      abbreviation: rt.tricode,
      conference: rt.conference,
      division: rt.division,
      roster: roster.map(p => p.id),
      lines,
      capSpace: Math.round((capCeiling - capUsed) * 100) / 100,
      capCeiling,
      isUserControlled: false,
      record: { wins: 0, losses: 0, otLosses: 0, points: 0, goalsFor: 0, goalsAgainst: 0 },
    });
  }

  return {
    seasonYear,
    teams,
    players,
    schedule: [],
    results: {},
    currentDate: new Date(seasonYear, 9, 1).toISOString().slice(0, 10),
    phase: 'regular-season',
  };
}
