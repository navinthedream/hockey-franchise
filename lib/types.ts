// ============================================================
// CORE TYPES — Hockey Franchise Sim
// ============================================================

export type Position = 'C' | 'LW' | 'RW' | 'LD' | 'RD' | 'G';
export type SkaterPosition = Exclude<Position, 'G'>;
export type Handedness = 'L' | 'R';

// ---------- Archetypes ----------
export type ForwardArchetype = 'Sniper' | 'Playmaker' | 'Power Forward' | 'Two-Way Forward' | 'Enforcer' | 'Grinder';
export type DefensemanArchetype = 'Offensive Defenseman' | 'Defensive Defenseman' | 'Two-Way Defenseman' | 'Enforcer Defenseman';
export type GoalieArchetype = 'Standup Goalie' | 'Butterfly Goalie' | 'Puck-Handling Goalie' | 'Hybrid Goalie';
export type Archetype = ForwardArchetype | DefensemanArchetype | GoalieArchetype;

// ---------- Full skater attribute card (mirrors a real player card: 6 groups, 25 attrs) ----------
export interface SkaterAttributes {
  // Puck Skills
  deking: number;
  handEye: number;
  passing: number;
  puckControl: number;
  // Senses
  discipline: number;
  offAwareness: number;
  poise: number;
  // Shooting
  slapShotAccuracy: number;
  slapShotPower: number;
  wristShotAccuracy: number;
  wristShotPower: number;
  // Defense
  defAwareness: number;
  faceoffs: number;
  shotBlocking: number;
  stickChecking: number;
  // Skating
  acceleration: number;
  agility: number;
  balance: number;
  endurance: number;
  speed: number;
  // Physical
  aggressiveness: number;
  bodyChecking: number;
  durability: number;
  fightingSkill: number;
  strength: number;
}

// ---------- Goalie card: a totally different attribute set, same idea ----------
export interface GoalieAttributes {
  // Positioning
  positioning: number;
  angles: number;
  fiveHole: number;
  // Reflexes
  gloveSave: number;
  blockerSave: number;
  quickness: number;
  // Puck Play
  reboundControl: number;
  puckHandling: number;
  passing: number;
  // Mental
  poise: number;
  consistency: number;
  aggressiveness: number;
  // Physical
  flexibility: number;
  endurance: number;
  durability: number;
}

interface PlayerBase {
  id: string;
  firstName: string;
  lastName: string;
  handedness: Handedness;
  age: number;
  overall: number;        // derived 0-99 composite, archetype-weighted
  potential: number;      // ceiling 0-99, for development over time
  teamId: string | null;
  contract: {
    salaryAAV: number;   // in millions
    yearsRemaining: number;
  };
  stats: SeasonStats;
  morale: number; // 0-100, affects performance slightly
}

export interface SkaterPlayer extends PlayerBase {
  position: SkaterPosition;
  archetype: ForwardArchetype | DefensemanArchetype;
  ratings: SkaterAttributes;
}

export interface GoaliePlayer extends PlayerBase {
  position: 'G';
  archetype: GoalieArchetype;
  ratings: GoalieAttributes;
}

export type Player = SkaterPlayer | GoaliePlayer;

export function isGoalie(p: Player): p is GoaliePlayer {
  return p.position === 'G';
}

export interface SeasonStats {
  gamesPlayed: number;
  goals: number;
  assists: number;
  points: number;
  plusMinus: number;
  pim: number;
  shots: number;
  hits: number;
  blocks: number;
  takeaways: number;
  faceoffWins: number;
  faceoffLosses: number;
  fightingMajors: number;
  // goalie-specific
  wins: number;
  losses: number;
  otLosses: number;
  shotsAgainst: number;
  saves: number;
  goalsAgainst: number;
  shutouts: number;
}

export interface Lines {
  forwardLines: [string, string, string][]; // [LW, C, RW] player ids, 4 lines
  dPairs: [string, string][];                 // [LD, RD] player ids, 3 pairs
  goalieRotation: string[];                   // starter first
}

export interface Team {
  id: string;
  city: string;
  name: string;
  abbreviation: string;
  conference: 'Eastern' | 'Western';
  division: string;
  roster: string[]; // player ids
  lines: Lines;
  capSpace: number;   // remaining cap room, millions
  capCeiling: number; // league cap, millions
  isUserControlled: boolean;
  record: {
    wins: number;
    losses: number;
    otLosses: number;
    points: number;
    goalsFor: number;
    goalsAgainst: number;
  };
}

export interface GameEvent {
  period: 1 | 2 | 3 | 4; // 4 = OT
  clock: string; // "MM:SS" counting down from 20:00
  type: 'goal' | 'shot' | 'penalty' | 'hit' | 'block' | 'fight' | 'save' | 'faceoff' | 'period-end' | 'game-end';
  team: 'home' | 'away';
  description: string;
  scoreHome: number;
  scoreAway: number;
}

export interface GameResult {
  id: string;
  date: string; // ISO date within season
  homeTeamId: string;
  awayTeamId: string;
  homeScore: number;
  awayScore: number;
  wentToOT: boolean;
  wentToShootout: boolean;
  events: GameEvent[];
  boxscore: {
    home: TeamBoxscore;
    away: TeamBoxscore;
  };
  played: boolean;
}

export interface TeamBoxscore {
  shots: number;
  pim: number;
  hits: number;
  blocks: number;
  faceoffWins: number;
  goalScorers: { playerId: string; goals: number; assists: string[] }[];
  hitters: Record<string, number>;     // playerId -> hit count
  blockers: Record<string, number>;    // playerId -> blocked-shot count
  faceoffTakers: Record<string, { wins: number; losses: number }>;
  goalieId: string;
  saves: number;
  goalsAgainst: number;
}

export interface ScheduledGame {
  id: string;
  date: string;
  homeTeamId: string;
  awayTeamId: string;
  played: boolean;
}

export interface League {
  seasonYear: number;
  teams: Team[];
  players: Record<string, Player>; // keyed by player id
  schedule: ScheduledGame[];
  results: Record<string, GameResult>; // keyed by scheduledGame id
  currentDate: string; // ISO date, "today" in the sim
  phase: 'regular-season' | 'playoffs' | 'offseason';
}
