/**
 * Sanity-check: simulate a full season and verify plus-minus is non-zero and zero-sum.
 *
 * Run with:  npx tsx scripts/verify-plusminus.ts
 */
import { generateLeague } from '../lib/generator';
import { generateSchedule } from '../lib/schedule';
import { simulateRestOfSeason } from '../lib/franchiseEngine';
import { isGoalie } from '../lib/types';

const league = generateLeague(2026);
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
