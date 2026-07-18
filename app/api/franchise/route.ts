import { NextResponse } from 'next/server';
import { loadLeague, deleteSave } from '@/lib/store';

export async function GET() {
  const league = loadLeague();
  return NextResponse.json({ league });
}

export async function DELETE() {
  deleteSave();
  return NextResponse.json({ ok: true });
}
