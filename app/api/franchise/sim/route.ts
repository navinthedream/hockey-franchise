import { NextRequest, NextResponse } from 'next/server';
import { loadLeague, saveLeague } from '@/lib/store';
import { simulateNextGameDay, simulateUntilNextTeamGame, simulateRestOfSeason } from '@/lib/franchiseEngine';

export async function POST(req: NextRequest) {
  const league = loadLeague();
  if (!league) return NextResponse.json({ error: 'No active franchise' }, { status: 404 });

  const { mode } = await req.json();
  const userTeam = league.teams.find(t => t.isUserControlled);

  let results;
  if (mode === 'day') {
    results = simulateNextGameDay(league).results;
  } else if (mode === 'toNextUserGame' && userTeam) {
    results = simulateUntilNextTeamGame(league, userTeam.id).results;
  } else if (mode === 'season') {
    results = simulateRestOfSeason(league).results;
  } else {
    results = simulateNextGameDay(league).results;
  }

  saveLeague(league);
  return NextResponse.json({ league, results });
}
