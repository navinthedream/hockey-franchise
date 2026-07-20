import 'server-only';
import fs from 'fs';
import path from 'path';
import type { SkaterAttributes, GoalieAttributes } from '../types';
import type { ForwardArchetype, DefensemanArchetype, GoalieArchetype } from '../types';

export interface SkaterRow {
  playerId: string;
  nhlId: number;
  firstName: string;
  lastName: string;
  team: string;
  position: 'C' | 'LW' | 'RW' | 'LD' | 'RD';
  handedness: 'L' | 'R';
  age: number;
  overall: number;
  potential: number;
  archetype: ForwardArchetype | DefensemanArchetype;
  ratingSource: 'ea_official' | 'estimated';
  lastVerified: string;
  attrs: SkaterAttributes;
}

export interface GoalieRow {
  playerId: string;
  nhlId: number;
  firstName: string;
  lastName: string;
  team: string;
  position: 'G';
  handedness: 'L' | 'R';
  age: number;
  overall: number;
  potential: number;
  archetype: GoalieArchetype;
  ratingSource: 'ea_official' | 'estimated';
  lastVerified: string;
  attrs: GoalieAttributes;
}

export interface Ratings {
  skaters: SkaterRow[];
  goalies: GoalieRow[];
}

// ─────────────────────────────────────────────────────────────────────────────
// Hand-rolled CSV parser (no external deps)
// ─────────────────────────────────────────────────────────────────────────────

function parseCSV(raw: string): Record<string, string>[] {
  const lines = raw.split('\n');
  if (lines.length === 0) return [];

  const headers = parseLine(lines[0]);
  const rows: Record<string, string>[] = [];

  for (let i = 1; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;
    const values = parseLine(line);
    const row: Record<string, string> = {};
    for (let j = 0; j < headers.length; j++) {
      row[headers[j]] = values[j] ?? '';
    }
    rows.push(row);
  }
  return rows;
}

/** Parse one CSV line, respecting quoted fields. */
function parseLine(line: string): string[] {
  const fields: string[] = [];
  let i = 0;
  while (i <= line.length) {
    if (i === line.length) {
      fields.push('');
      break;
    }
    if (line[i] === '"') {
      // Quoted field
      let val = '';
      i++; // skip opening quote
      while (i < line.length) {
        if (line[i] === '"' && line[i + 1] === '"') {
          val += '"';
          i += 2;
        } else if (line[i] === '"') {
          i++; // skip closing quote
          break;
        } else {
          val += line[i++];
        }
      }
      fields.push(val);
      if (line[i] === ',') i++; // skip comma after closing quote
    } else {
      // Unquoted field
      const end = line.indexOf(',', i);
      if (end === -1) {
        fields.push(line.slice(i));
        break;
      }
      fields.push(line.slice(i, end));
      i = end + 1;
    }
  }
  return fields;
}

function int(v: string): number {
  const n = parseInt(v, 10);
  return isNaN(n) ? 0 : n;
}

// ─────────────────────────────────────────────────────────────────────────────
// Loaders
// ─────────────────────────────────────────────────────────────────────────────

function loadSkaters(): SkaterRow[] {
  const filePath = path.join(process.cwd(), 'data', 'ratings', 'skaters.csv');
  const raw = fs.readFileSync(filePath, 'utf8');
  const rows = parseCSV(raw);
  return rows.map((r): SkaterRow => ({
    playerId: r.playerId,
    nhlId: int(r.nhlId),
    firstName: r.firstName,
    lastName: r.lastName,
    team: r.team,
    position: r.position as SkaterRow['position'],
    handedness: (r.handedness === 'R' ? 'R' : 'L') as 'L' | 'R',
    age: int(r.age),
    overall: int(r.overall),
    potential: int(r.potential),
    archetype: r.archetype as ForwardArchetype | DefensemanArchetype,
    ratingSource: r.ratingSource as 'ea_official' | 'estimated',
    lastVerified: r.lastVerified,
    attrs: {
      deking:           int(r.deking),
      handEye:          int(r.handEye),
      passing:          int(r.passing),
      puckControl:      int(r.puckControl),
      discipline:       int(r.discipline),
      offAwareness:     int(r.offAwareness),
      poise:            int(r.poise),
      slapShotAccuracy: int(r.slapShotAccuracy),
      slapShotPower:    int(r.slapShotPower),
      wristShotAccuracy:int(r.wristShotAccuracy),
      wristShotPower:   int(r.wristShotPower),
      defAwareness:     int(r.defAwareness),
      faceoffs:         int(r.faceoffs),
      shotBlocking:     int(r.shotBlocking),
      stickChecking:    int(r.stickChecking),
      acceleration:     int(r.acceleration),
      agility:          int(r.agility),
      balance:          int(r.balance),
      endurance:        int(r.endurance),
      speed:            int(r.speed),
      aggressiveness:   int(r.aggressiveness),
      bodyChecking:     int(r.bodyChecking),
      durability:       int(r.durability),
      fightingSkill:    int(r.fightingSkill),
      strength:         int(r.strength),
    },
  }));
}

function loadGoalies(): GoalieRow[] {
  const filePath = path.join(process.cwd(), 'data', 'ratings', 'goalies.csv');
  const raw = fs.readFileSync(filePath, 'utf8');
  const rows = parseCSV(raw);
  return rows.map((r): GoalieRow => ({
    playerId: r.playerId,
    nhlId: int(r.nhlId),
    firstName: r.firstName,
    lastName: r.lastName,
    team: r.team,
    position: 'G',
    handedness: (r.handedness === 'R' ? 'R' : 'L') as 'L' | 'R',
    age: int(r.age),
    overall: int(r.overall),
    potential: int(r.potential),
    archetype: r.archetype as GoalieArchetype,
    ratingSource: r.ratingSource as 'ea_official' | 'estimated',
    lastVerified: r.lastVerified,
    attrs: {
      positioning:    int(r.positioning),
      angles:         int(r.angles),
      fiveHole:       int(r.fiveHole),
      gloveSave:      int(r.gloveSave),
      blockerSave:    int(r.blockerSave),
      quickness:      int(r.quickness),
      reboundControl: int(r.reboundControl),
      puckHandling:   int(r.puckHandling),
      passing:        int(r.passing),
      poise:          int(r.poise),
      consistency:    int(r.consistency),
      aggressiveness: int(r.aggressiveness),
      flexibility:    int(r.flexibility),
      endurance:      int(r.endurance),
      durability:     int(r.durability),
    },
  }));
}

export function loadRatings(): Ratings {
  return {
    skaters: loadSkaters(),
    goalies: loadGoalies(),
  };
}
