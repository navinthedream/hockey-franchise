import { League, GameResult } from './types';

export async function fetchFranchise(): Promise<League | null> {
  const res = await fetch('/api/franchise');
  const data = await res.json();
  return data.league;
}

export async function startNewFranchise(teamId: string): Promise<League> {
  const res = await fetch('/api/franchise/new', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ teamId }),
  });
  const data = await res.json();
  return data.league;
}

export async function simAdvance(mode: 'day' | 'toNextUserGame' | 'season'): Promise<{ league: League; results: GameResult[] }> {
  const res = await fetch('/api/franchise/sim', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ mode }),
  });
  return res.json();
}

export async function resetFranchise(): Promise<void> {
  await fetch('/api/franchise', { method: 'DELETE' });
}
