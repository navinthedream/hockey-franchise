/**
 * Validates generated overall ratings against known real NHL 26 ratings.
 *
 * Run with:  npx tsx scripts/validate-ratings.ts
 */
import fs from 'fs';
import path from 'path';
import { generateLeague } from '../lib/generator';
import type { Player } from '../lib/types';
import type { Ratings, SkaterRow, GoalieRow } from '../lib/server/ratingsData';

// ── Inline CSV parser (scripts run in plain Node/tsx — no server-only imports) ──

function parseLine(line: string): string[] {
  const fields: string[] = [];
  let i = 0;
  while (i <= line.length) {
    if (i === line.length) { fields.push(''); break; }
    if (line[i] === '"') {
      let val = ''; i++;
      while (i < line.length) {
        if (line[i] === '"' && line[i + 1] === '"') { val += '"'; i += 2; }
        else if (line[i] === '"') { i++; break; }
        else { val += line[i++]; }
      }
      fields.push(val);
      if (line[i] === ',') i++;
    } else {
      const end = line.indexOf(',', i);
      if (end === -1) { fields.push(line.slice(i)); break; }
      fields.push(line.slice(i, end));
      i = end + 1;
    }
  }
  return fields;
}

function parseCSV(raw: string): Record<string, string>[] {
  const lines = raw.split('\n');
  if (!lines.length) return [];
  const headers = parseLine(lines[0]);
  const rows: Record<string, string>[] = [];
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;
    const values = parseLine(line);
    const row: Record<string, string> = {};
    headers.forEach((h, j) => { row[h] = values[j] ?? ''; });
    rows.push(row);
  }
  return rows;
}

function int(v: string): number { const n = parseInt(v, 10); return isNaN(n) ? 0 : n; }

function loadRatings(): Ratings {
  const base = path.join(process.cwd(), 'data', 'ratings');

  const skaterRaw = parseCSV(fs.readFileSync(path.join(base, 'skaters.csv'), 'utf8'));
  const goalieRaw = parseCSV(fs.readFileSync(path.join(base, 'goalies.csv'), 'utf8'));

  const skaters = skaterRaw.map((r): SkaterRow => ({
    playerId: r.playerId, nhlId: int(r.nhlId),
    firstName: r.firstName, lastName: r.lastName,
    team: r.team, position: r.position as SkaterRow['position'],
    handedness: r.handedness === 'R' ? 'R' : 'L',
    age: int(r.age), overall: int(r.overall), potential: int(r.potential),
    archetype: r.archetype as SkaterRow['archetype'],
    ratingSource: r.ratingSource as 'ea_official' | 'estimated',
    lastVerified: r.lastVerified,
    attrs: {
      deking: int(r.deking), handEye: int(r.handEye), passing: int(r.passing),
      puckControl: int(r.puckControl), discipline: int(r.discipline),
      offAwareness: int(r.offAwareness), poise: int(r.poise),
      slapShotAccuracy: int(r.slapShotAccuracy), slapShotPower: int(r.slapShotPower),
      wristShotAccuracy: int(r.wristShotAccuracy), wristShotPower: int(r.wristShotPower),
      defAwareness: int(r.defAwareness), faceoffs: int(r.faceoffs),
      shotBlocking: int(r.shotBlocking), stickChecking: int(r.stickChecking),
      acceleration: int(r.acceleration), agility: int(r.agility), balance: int(r.balance),
      endurance: int(r.endurance), speed: int(r.speed),
      aggressiveness: int(r.aggressiveness), bodyChecking: int(r.bodyChecking),
      durability: int(r.durability), fightingSkill: int(r.fightingSkill), strength: int(r.strength),
    },
  }));

  const goalies = goalieRaw.map((r): GoalieRow => ({
    playerId: r.playerId, nhlId: int(r.nhlId),
    firstName: r.firstName, lastName: r.lastName,
    team: r.team, position: 'G',
    handedness: r.handedness === 'R' ? 'R' : 'L',
    age: int(r.age), overall: int(r.overall), potential: int(r.potential),
    archetype: r.archetype as GoalieRow['archetype'],
    ratingSource: r.ratingSource as 'ea_official' | 'estimated',
    lastVerified: r.lastVerified,
    attrs: {
      positioning: int(r.positioning), angles: int(r.angles), fiveHole: int(r.fiveHole),
      gloveSave: int(r.gloveSave), blockerSave: int(r.blockerSave), quickness: int(r.quickness),
      reboundControl: int(r.reboundControl), puckHandling: int(r.puckHandling),
      passing: int(r.passing), poise: int(r.poise), consistency: int(r.consistency),
      aggressiveness: int(r.aggressiveness), flexibility: int(r.flexibility),
      endurance: int(r.endurance), durability: int(r.durability),
    },
  }));

  return { skaters, goalies };
}

// Anchor players with their published NHL 26 ratings.
// Names must match the NHL API firstName/lastName fields (case-insensitive).
const ANCHORS = [
  // Forwards
  { firstName: 'Connor',    lastName: 'McDavid',     real: 97 },
  { firstName: 'Nathan',    lastName: 'MacKinnon',   real: 96 },
  { firstName: 'Leon',      lastName: 'Draisaitl',   real: 96 },
  { firstName: 'Nikita',    lastName: 'Kucherov',    real: 96 },
  { firstName: 'Aleksander',lastName: 'Barkov',      real: 95 },
  { firstName: 'Kirill',    lastName: 'Kaprizov',    real: 94 },
  { firstName: 'Jack',      lastName: 'Eichel',      real: 94 },
  { firstName: 'David',     lastName: 'Pastrnak',    real: 94 },
  // Defensemen
  { firstName: 'Cale',      lastName: 'Makar',       real: 95 },
  { firstName: 'Quinn',     lastName: 'Hughes',      real: 95 },
  { firstName: 'Shayne',    lastName: 'Werenski',    real: 92 },
  { firstName: 'Roman',     lastName: 'Josi',        real: 92 },
  { firstName: 'Victor',    lastName: 'Hedman',      real: 92 },
  { firstName: 'Rasmus',    lastName: 'Dahlin',      real: 92 },
  { firstName: 'Miro',      lastName: 'Heiskanen',   real: 91 },
  { firstName: 'Moritz',    lastName: 'Seider',      real: 91 },
  { firstName: 'Jaccob',    lastName: 'Slavin',      real: 90 },
  { firstName: 'Josh',      lastName: 'Morrissey',   real: 90 },
  { firstName: 'Adam',      lastName: 'Fox',         real: 90 },
  { firstName: 'Jake',      lastName: 'Sanderson',   real: 89 },
  { firstName: 'Gustav',    lastName: 'Forsling',    real: 89 },
  { firstName: 'Charlie',   lastName: 'McAvoy',      real: 89 },
  { firstName: 'Evan',      lastName: 'Bouchard',    real: 88 },
  { firstName: 'Colton',    lastName: 'Parayko',     real: 88 },
  { firstName: 'Dougie',    lastName: 'Hamilton',    real: 88 },
  { firstName: 'John',      lastName: 'Carlson',     real: 88 },
  { firstName: 'Drew',      lastName: 'Doughty',     real: 88 },
  // Goalies
  { firstName: 'Connor',    lastName: 'Hellebuyck',  real: 93 },
];

function findPlayer(players: Record<string, Player>, first: string, last: string): Player | undefined {
  const fl = first.toLowerCase(), ll = last.toLowerCase();
  return Object.values(players).find(
    p => p.firstName.toLowerCase() === fl && p.lastName.toLowerCase() === ll,
  );
}

function pctile(sorted: number[], p: number): number {
  const idx = Math.min(sorted.length - 1, Math.floor(p * sorted.length));
  return sorted[idx];
}

const league = generateLeague(2026, loadRatings());
const allPlayers = Object.values(league.players);
const allOveralls = allPlayers.map(p => p.overall).sort((a, b) => a - b);

// ── Anchor comparison ─────────────────────────────────────────────────────────
console.log('\n── Anchor player validation ─────────────────────────────────────────────');
console.log('  Player                     Pos   Sim   Real  Error');
console.log('  ─────────────────────────────────────────────────────');

const errors: number[] = [];
for (const a of ANCHORS) {
  const p = findPlayer(league.players, a.firstName, a.lastName);
  if (!p) {
    console.log(`  ${(a.firstName + ' ' + a.lastName).padEnd(26)} ???   ----  ${a.real}  (not found)`);
    continue;
  }
  const err = p.overall - a.real;
  errors.push(Math.abs(err));
  const bar = err > 0 ? `+${err}` : `${err}`;
  const flag = Math.abs(err) > 4 ? ' ← !' : '';
  console.log(`  ${(a.firstName + ' ' + a.lastName).padEnd(26)} ${p.position.padEnd(5)} ${String(p.overall).padEnd(5)} ${a.real}   ${bar}${flag}`);
}

if (errors.length > 0) {
  const mae = errors.reduce((s, e) => s + e, 0) / errors.length;
  console.log(`\n  MAE across ${errors.length} anchor players: ${mae.toFixed(2)} OVR`);
  console.log(`  Max error: ${Math.max(...errors)}  |  Within ±3: ${errors.filter(e => e <= 3).length}/${errors.length}`);
}

// ── League-wide distribution ──────────────────────────────────────────────────
console.log('\n── League-wide overall distribution ─────────────────────────────────────');
console.log(`  Total players   : ${allOveralls.length}`);
console.log(`  Min             : ${allOveralls[0]}`);
console.log(`  p10             : ${pctile(allOveralls, 0.10)}`);
console.log(`  p25             : ${pctile(allOveralls, 0.25)}`);
console.log(`  p50 (median)    : ${pctile(allOveralls, 0.50)}`);
console.log(`  p75             : ${pctile(allOveralls, 0.75)}`);
console.log(`  p90             : ${pctile(allOveralls, 0.90)}`);
console.log(`  p95             : ${pctile(allOveralls, 0.95)}`);
console.log(`  Max             : ${allOveralls[allOveralls.length - 1]}`);
console.log('  (Target: floor ~65, median ~80, ceiling ~97)');

// Histogram
console.log('\n── Rating bucket distribution ───────────────────────────────────────────');
const buckets: Record<string, number> = {
  '60-64': 0, '65-69': 0, '70-74': 0, '75-79': 0,
  '80-84': 0, '85-89': 0, '90-94': 0, '95-99': 0,
};
for (const ovr of allOveralls) {
  if (ovr < 65) buckets['60-64']++;
  else if (ovr < 70) buckets['65-69']++;
  else if (ovr < 75) buckets['70-74']++;
  else if (ovr < 80) buckets['75-79']++;
  else if (ovr < 85) buckets['80-84']++;
  else if (ovr < 90) buckets['85-89']++;
  else if (ovr < 95) buckets['90-94']++;
  else               buckets['95-99']++;
}
const total = allOveralls.length;
for (const [range, count] of Object.entries(buckets)) {
  const bar = '█'.repeat(Math.round((count / total) * 40));
  console.log(`  ${range}: ${String(count).padStart(4)}  ${bar}`);
}

// ── Top 10 per position ───────────────────────────────────────────────────────
console.log('\n── Top 10 forwards by overall ────────────────────────────────────────────');
const forwards = allPlayers
  .filter(p => p.position === 'C' || p.position === 'LW' || p.position === 'RW')
  .sort((a, b) => b.overall - a.overall)
  .slice(0, 10);
for (const p of forwards) {
  const team = league.teams.find(t => t.id === p.teamId);
  console.log(`  ${(p.firstName + ' ' + p.lastName).padEnd(24)} ${p.position}  ${p.overall}  ${team?.abbreviation ?? '?'}`);
}

console.log('\n── Top 10 defensemen by overall ──────────────────────────────────────────');
const defenders = allPlayers
  .filter(p => p.position === 'LD' || p.position === 'RD')
  .sort((a, b) => b.overall - a.overall)
  .slice(0, 10);
for (const p of defenders) {
  const team = league.teams.find(t => t.id === p.teamId);
  console.log(`  ${(p.firstName + ' ' + p.lastName).padEnd(24)} ${p.position}  ${p.overall}  ${team?.abbreviation ?? '?'}`);
}

console.log('\n── Top 10 goalies by overall ─────────────────────────────────────────────');
const goalies = allPlayers
  .filter(p => p.position === 'G')
  .sort((a, b) => b.overall - a.overall)
  .slice(0, 10);
for (const p of goalies) {
  const team = league.teams.find(t => t.id === p.teamId);
  console.log(`  ${(p.firstName + ' ' + p.lastName).padEnd(24)} G    ${p.overall}  ${team?.abbreviation ?? '?'}`);
}
console.log('');
