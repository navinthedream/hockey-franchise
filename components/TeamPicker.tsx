'use client';

import { useState } from 'react';
import { TEAM_SEEDS } from '@/lib/generator';

export function TeamPicker({ onPick, loading }: { onPick: (abbr: string) => void; loading: boolean }) {
  const [selected, setSelected] = useState<string | null>(null);
  const divisions = Array.from(new Set(TEAM_SEEDS.map(t => `${t.conference}-${t.division}`)));

  return (
    <div className="max-w-4xl mx-auto px-6 py-16">
      <div className="mb-10">
        <div className="text-goal-red text-xs uppercase tracking-[0.25em] font-medium mb-2">New Franchise</div>
        <h1 className="font-display text-4xl sm:text-5xl uppercase tracking-tight text-ice-100">Pick your team</h1>
        <p className="text-steel-300 mt-3 max-w-xl">
          You&apos;ll take over as GM — set lines, run the season, and build toward a Cup. Sixteen clubs, one bench is yours.
        </p>
      </div>

      <div className="space-y-8">
        {divisions.map(divKey => {
          const [conf, div] = divKey.split('-');
          const teams = TEAM_SEEDS.filter(t => t.conference === conf && t.division === div);
          return (
            <div key={divKey}>
              <div className="text-xs uppercase tracking-[0.2em] text-steel-400 mb-3">{conf} · {div} Division</div>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                {teams.map(t => (
                  <button
                    key={t.abbr}
                    onClick={() => setSelected(t.abbr)}
                    className={`text-left rounded-md border px-4 py-3 transition-colors ${
                      selected === t.abbr
                        ? 'border-goal-red bg-ice-850'
                        : 'border-ice-700 bg-ice-900 hover:border-steel-400'
                    }`}
                  >
                    <div className="font-display text-lg uppercase tracking-wide">{t.abbr}</div>
                    <div className="text-xs text-steel-400 truncate">{t.city} {t.name}</div>
                  </button>
                ))}
              </div>
            </div>
          );
        })}
      </div>

      <button
        disabled={!selected || loading}
        onClick={() => selected && onPick(selected)}
        className="mt-10 w-full sm:w-auto px-8 py-3 rounded-md bg-goal-red text-ice-100 font-display uppercase tracking-wide text-lg disabled:opacity-40 disabled:cursor-not-allowed hover:bg-goal-red/90 transition-colors"
      >
        {loading ? 'Generating league…' : selected ? `Start as ${selected}` : 'Select a team'}
      </button>
    </div>
  );
}
