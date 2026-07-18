import { NextRequest, NextResponse } from 'next/server';
import { loadLeague, saveLeague } from '@/lib/store';
import { Lines } from '@/lib/types';

export async function PATCH(req: NextRequest) {
  const league = loadLeague();
  if (!league) return NextResponse.json({ error: 'No active franchise' }, { status: 404 });

  const body = await req.json() as { teamId?: string; lines?: Lines };
  const { teamId, lines } = body;
  if (!teamId || !lines) return NextResponse.json({ error: 'teamId and lines are required' }, { status: 400 });

  const team = league.teams.find(t => t.id === teamId);
  if (!team) return NextResponse.json({ error: 'Team not found' }, { status: 404 });
  if (!team.isUserControlled) return NextResponse.json({ error: 'Cannot edit AI team lines' }, { status: 403 });

  // Collect all referenced player IDs (filter out empty-string slots)
  const allSlotted = [
    ...lines.forwardLines.flat(),
    ...lines.dPairs.flat(),
    ...lines.goalieRotation,
  ].filter(Boolean);

  // No duplicate player IDs
  const seen = new Set<string>();
  for (const id of allSlotted) {
    if (seen.has(id)) return NextResponse.json({ error: `Duplicate player: ${id}` }, { status: 400 });
    seen.add(id);
  }

  // Every referenced player must be on this team's roster
  const rosterSet = new Set(team.roster);
  for (const id of allSlotted) {
    if (!rosterSet.has(id)) return NextResponse.json({ error: `Player ${id} not on roster` }, { status: 400 });
  }

  // Structure validation: 4 forward lines of 3 slots, 3 D pairs of 2 slots
  if (lines.forwardLines.length !== 4 || lines.forwardLines.some(l => l.length !== 3))
    return NextResponse.json({ error: 'forwardLines must be 4 lines of 3 slots' }, { status: 400 });
  if (lines.dPairs.length !== 3 || lines.dPairs.some(p => p.length !== 2))
    return NextResponse.json({ error: 'dPairs must be 3 pairs of 2 slots' }, { status: 400 });

  team.lines = lines;
  saveLeague(league);
  return NextResponse.json({ ok: true });
}
