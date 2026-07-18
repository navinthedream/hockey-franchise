import {
  Player, SkaterPlayer, GoaliePlayer, SkaterAttributes, GoalieAttributes,
  Position, SkaterPosition, SeasonStats, ForwardArchetype, DefensemanArchetype, GoalieArchetype,
  Team, League, Lines,
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

// ---------- Name pools ----------
const FIRST_NAMES = [
  'Connor', 'Jack', 'Nathan', 'Tyler', 'Mitch', 'Auston', 'Cale', 'Quinn', 'Nikita', 'Elias',
  'Kirill', 'Adam', 'Dylan', 'Jason', 'Brayden', 'Sebastian', 'Owen', 'Cole', 'Jake', 'Ryan',
  'Mason', 'Noah', 'Wyatt', 'Hunter', 'Carter', 'Logan', 'Ethan', 'Liam', 'Aiden', 'Mikko',
  'Filip', 'Viktor', 'Pavel', 'Andrei', 'Josef', 'Anton', 'Marcus', 'Erik', 'Gustav', 'Lars',
  'Miro', 'Tomas', 'Radek', 'Petr', 'Dominik', 'Kevin', 'Brandon', 'Colton', 'Trevor', 'Shane',
  'Zach', 'Max', 'Sam', 'Ben', 'Will', 'Alex', 'Chris', 'Matt', 'Josh', 'Drew', 'Malachi',
];
const LAST_NAMES = [
  'McDavid', 'Hughes', 'Matthews', 'Marner', 'Nylander', 'Makar', 'Pastrnak', 'Kaprizov',
  'Draisaitl', 'Barkov', 'Zibanejad', 'Point', 'Tkachuk', 'Bedard', 'Rantanen', 'Kucherov',
  'Werenski', 'Larkin', 'Fox', 'Heiskanen', 'Reinhart', 'Hischier', 'Necas', 'Sorokin',
  'Novak', 'Svoboda', 'Dvorak', 'Kovac', 'Muller', 'Bergman', 'Andersson', 'Nystrom',
  'Holt', 'Reilly', 'Whitfield', 'Carrick', 'Doherty', 'Sabourin', 'Lachance', 'Beaulieu',
  'Kessler', 'Marchetti', 'Rossi', 'Bianchi', 'Petrov', 'Volkov', 'Orlov', 'Baranov',
  'Chase', 'Ford', 'Hendrix', 'Sawyer', 'Griffin', 'Prescott', 'Weller', 'Donovan', 'Flaherty',
];
function randomName() {
  return { firstName: pick(FIRST_NAMES), lastName: pick(LAST_NAMES) };
}

// ============================================================
// ARCHETYPE PROFILES
// Each archetype nudges specific attributes up/down from the tier
// baseline, and defines which attributes drive "overall" for that
// role — so a shutdown D-man's overall reflects his elite defense
// stats, not his mediocre shot.
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

// Position-level baseline shape, applied before archetype bias.
// Centers get a faceoff bump; wings/D get faceoffs suppressed hard
// since only centers realistically take draws.
const POSITION_BASE: Record<SkaterPosition, Bias> = {
  C: { faceoffs: 18 },
  LW: { faceoffs: -22, defAwareness: -6, shotBlocking: -8, strength: -2 },
  RW: { faceoffs: -22, defAwareness: -6, shotBlocking: -8, strength: -2 },
  LD: { faceoffs: -30, wristShotAccuracy: -7, wristShotPower: -5, deking: -5, handEye: -3, defAwareness: 9, shotBlocking: 11, stickChecking: 7, strength: 6, acceleration: -3 },
  RD: { faceoffs: -30, wristShotAccuracy: -7, wristShotPower: -5, deking: -5, handEye: -3, defAwareness: 9, shotBlocking: 11, stickChecking: 7, strength: 6, acceleration: -3 },
};

const GOALIE_ARCHETYPE_KEYS = Object.keys(GOALIE_ARCHETYPES) as GoalieArchetype[];

function isForwardPos(pos: SkaterPosition) { return pos === 'C' || pos === 'LW' || pos === 'RW'; }

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
  // raw weighted average of the actual (noisy) generated attributes
  const rawAvg = keys.reduce((s, k) => s + r[k] * (weights[k] ?? 0), 0) / totalWeight;
  // expected weighted average with zero noise, so we can normalize archetypes to the same baseline
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

function emptyStats(): SeasonStats {
  return {
    gamesPlayed: 0, goals: 0, assists: 0, points: 0, plusMinus: 0, pim: 0, shots: 0,
    hits: 0, blocks: 0, takeaways: 0, faceoffWins: 0, faceoffLosses: 0, fightingMajors: 0,
    wins: 0, losses: 0, otLosses: 0, shotsAgainst: 0, saves: 0, goalsAgainst: 0, shutouts: 0,
  };
}

type Tier = 'star' | 'top6' | 'middle' | 'depth' | 'prospect';
const SKILL_CENTERS: Record<Tier, number> = { star: 82, top6: 70, middle: 58, depth: 48, prospect: 45 };

// Archetype likelihood by tier — stars skew toward skill roles, depth skews toward
// grinders/enforcers, matching how real rosters are actually built.
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
  const { firstName, lastName } = randomName();

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

const ROSTER_TEMPLATE: { pos: Position; tier: Tier }[] = [
  // 13 forwards
  { pos: 'C', tier: 'star' }, { pos: 'LW', tier: 'top6' }, { pos: 'RW', tier: 'top6' },
  { pos: 'C', tier: 'top6' }, { pos: 'LW', tier: 'top6' }, { pos: 'RW', tier: 'middle' },
  { pos: 'C', tier: 'middle' }, { pos: 'LW', tier: 'middle' }, { pos: 'RW', tier: 'middle' },
  { pos: 'C', tier: 'depth' }, { pos: 'LW', tier: 'depth' }, { pos: 'RW', tier: 'depth' },
  { pos: 'C', tier: 'prospect' },
  // 7 defensemen
  { pos: 'LD', tier: 'top6' }, { pos: 'RD', tier: 'top6' },
  { pos: 'LD', tier: 'middle' }, { pos: 'RD', tier: 'middle' },
  { pos: 'LD', tier: 'depth' }, { pos: 'RD', tier: 'depth' },
  { pos: 'LD', tier: 'prospect' },
  // 3 goalies
  { pos: 'G', tier: 'top6' }, { pos: 'G', tier: 'middle' }, { pos: 'G', tier: 'prospect' },
];

function buildLines(roster: Player[]): Lines {
  const byPos = (p: Position) => roster.filter(pl => pl.position === p).sort((a, b) => b.overall - a.overall);
  const C = byPos('C'), LW = byPos('LW'), RW = byPos('RW'), LD = byPos('LD'), RD = byPos('RD'), G = byPos('G');
  const forwardLines: [string, string, string][] = [0, 1, 2, 3].map(i => [
    (LW[i] ?? LW[0]).id, (C[i] ?? C[0]).id, (RW[i] ?? RW[0]).id,
  ]);
  const dPairs: [string, string][] = [0, 1, 2].map(i => [
    (LD[i] ?? LD[0]).id, (RD[i] ?? RD[0]).id,
  ]);
  return { forwardLines, dPairs, goalieRotation: G.map(g => g.id) };
}

export interface TeamSeed { city: string; name: string; abbr: string; conference: 'Eastern' | 'Western'; division: string; }

export const TEAM_SEEDS: TeamSeed[] = [
  { city: 'Toronto', name: 'Timberwolves', abbr: 'TOR', conference: 'Eastern', division: 'North' },
  { city: 'Montreal', name: 'Voyageurs', abbr: 'MTL', conference: 'Eastern', division: 'North' },
  { city: 'Ottawa', name: 'Sentinels', abbr: 'OTT', conference: 'Eastern', division: 'North' },
  { city: 'Quebec City', name: 'Nordiques', abbr: 'QUE', conference: 'Eastern', division: 'North' },
  { city: 'Boston', name: 'Anchors', abbr: 'BOS', conference: 'Eastern', division: 'Atlantic' },
  { city: 'New York', name: 'Empires', abbr: 'NYE', conference: 'Eastern', division: 'Atlantic' },
  { city: 'Philadelphia', name: 'Ironclads', abbr: 'PHI', conference: 'Eastern', division: 'Atlantic' },
  { city: 'Washington', name: 'Sentries', abbr: 'WSH', conference: 'Eastern', division: 'Atlantic' },
  { city: 'Chicago', name: 'Wolves', abbr: 'CHI', conference: 'Western', division: 'Central' },
  { city: 'Minneapolis', name: 'Northstars', abbr: 'MIN', conference: 'Western', division: 'Central' },
  { city: 'St. Louis', name: 'Rivermen', abbr: 'STL', conference: 'Western', division: 'Central' },
  { city: 'Dallas', name: 'Mustangs', abbr: 'DAL', conference: 'Western', division: 'Central' },
  { city: 'Vancouver', name: 'Timbers', abbr: 'VAN', conference: 'Western', division: 'Pacific' },
  { city: 'Seattle', name: 'Squall', abbr: 'SEA', conference: 'Western', division: 'Pacific' },
  { city: 'Los Angeles', name: 'Comets', abbr: 'LAC', conference: 'Western', division: 'Pacific' },
  { city: 'Las Vegas', name: 'Aces', abbr: 'LVA', conference: 'Western', division: 'Pacific' },
];

export function generateLeague(seasonYear: number): League {
  const players: Record<string, Player> = {};
  const teams: Team[] = TEAM_SEEDS.map(seed => {
    const teamId = uid('team');
    const roster: Player[] = ROSTER_TEMPLATE.map(slot => generatePlayer(slot.pos, teamId, slot.tier));
    roster.forEach(p => { players[p.id] = p; });
    const lines = buildLines(roster);
    const capUsed = roster.reduce((s, p) => s + p.contract.salaryAAV, 0);
    const capCeiling = 88;
    return {
      id: teamId,
      city: seed.city,
      name: seed.name,
      abbreviation: seed.abbr,
      conference: seed.conference,
      division: seed.division,
      roster: roster.map(p => p.id),
      lines,
      capSpace: Math.round((capCeiling - capUsed) * 100) / 100,
      capCeiling,
      isUserControlled: false,
      record: { wins: 0, losses: 0, otLosses: 0, points: 0, goalsFor: 0, goalsAgainst: 0 },
    };
  });

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

