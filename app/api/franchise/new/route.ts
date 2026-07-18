import { NextRequest, NextResponse } from 'next/server';
import { generateLeague } from '@/lib/generator';
import { generateSchedule } from '@/lib/schedule';
import { saveLeague } from '@/lib/store';

export async function POST(req: NextRequest) {
  const { teamId } = await req.json();
  const league = generateLeague(2026);
  const chosen = league.teams.find(t => t.id === teamId) ?? league.teams.find(t => t.abbreviation === teamId);
  if (chosen) chosen.isUserControlled = true;
  league.schedule = generateSchedule(league);
  saveLeague(league);
  return NextResponse.json({ league });
}
