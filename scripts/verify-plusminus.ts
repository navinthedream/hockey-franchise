/**
 * Sanity-check: simulate a full season and verify plus-minus is non-zero and zero-sum.
 *
 * Run with:  npx tsx scripts/verify-plusminus.ts
 */
import fs from 'fs';
import path from 'path';
import { generateLeague } from '../lib/generator';
import type { Ratings, SkaterRow, GoalieRow } from '../lib/server/ratingsData';
import { generateSchedule } from '../lib/schedule';
import { simulateRestOfSeason } from '../lib/franchiseEngine';
import { isGoalie } from '../lib/types';

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

const league = generateLeague(2026, loadRatings());
league.schedule = generateSchedule(league);

console.log(`League: ${league.teams.length} teams, ${league.schedule.length} scheduled games`);

const { league: simmed } = simulateRestOfSeason(league);

const skaters = Object.values(simmed.players).filter(p => !isGoalie(p));
const values  = skaters.map(p => p.stats.plusMinus);
const sum     = values.reduce((a, b) => a + b, 0);
const nonZero = values.filter(v => v !== 0).length;
const min     = Math.min(...values);
const max     = Math.max(...values);
const gamesPlayed = simmed.schedule.filter(g => g.played).length;

console.log(`\nGames simulated : ${gamesPlayed} / ${simmed.schedule.length}`);
console.log(`Skaters checked : ${skaters.length}`);
console.log(`Non-zero +/-    : ${nonZero} / ${skaters.length}`);
console.log(`Range           : ${min} to +${max}`);
console.log(`Sum of all +/-  : ${sum}  ← must be 0`);

// Per-team summary (top/bottom 3 players by plusMinus)
console.log('\n── Per-team top/bottom ──────────────────────────────────');
for (const team of simmed.teams) {
  const roster = team.roster.map(id => simmed.players[id]).filter(p => p && !isGoalie(p));
  roster.sort((a, b) => b.stats.plusMinus - a.stats.plusMinus);
  const best  = roster.slice(0, 3).map(p => `${p.lastName} ${p.stats.plusMinus > 0 ? '+' : ''}${p.stats.plusMinus}`).join(', ');
  const worst = roster.slice(-3).reverse().map(p => `${p.lastName} ${p.stats.plusMinus > 0 ? '+' : ''}${p.stats.plusMinus}`).join(', ');
  const teamSum = roster.reduce((s, p) => s + p.stats.plusMinus, 0);
  console.log(`  ${team.abbreviation.padEnd(4)} record ${team.record.wins}-${team.record.losses}-${team.record.otLosses}  team+/-sum: ${teamSum >= 0 ? '+' : ''}${teamSum}  best: ${best}  worst: ${worst}`);
}

// Fail the process if the zero-sum invariant is broken
if (sum !== 0) {
  console.error(`\n✗ FAIL: sum of plusMinus is ${sum}, expected 0`);
  process.exit(1);
} else {
  console.log(`\n✓ PASS: sum is exactly 0`);
}

if (nonZero === 0) {
  console.error('✗ FAIL: every player has plusMinus 0 — stat is still not being written');
  process.exit(1);
} else {
  console.log(`✓ PASS: ${nonZero} skaters have a non-zero plus-minus`);
}
