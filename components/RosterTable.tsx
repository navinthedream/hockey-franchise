'use client';

import { useState } from 'react';
import { League, Player, Position, isGoalie } from '@/lib/types';
import { ratingColor } from '@/lib/utils';
import { PlayerCard } from './PlayerCard';

const GROUPS: { label: string; positions: Position[] }[] = [
  { label: 'Forwards', positions: ['C', 'LW', 'RW'] },
  { label: 'Defense', positions: ['LD', 'RD'] },
  { label: 'Goalies', positions: ['G'] },
];

export function RosterTable({ league, teamId }: { league: League; teamId: string }) {
  const [selectedPlayer, setSelectedPlayer] = useState<Player | null>(null);
  const team = league.teams.find(t => t.id === teamId);
  if (!team) return null;
  const roster = team.roster.map(id => league.players[id]).filter(Boolean);

  return (
    <div className="space-y-6">
      {GROUPS.map(group => {
        const players = roster
          .filter(p => group.positions.includes(p.position))
          .sort((a, b) => b.overall - a.overall);
        const isGoalieGroup = group.label === 'Goalies';

        return (
          <div key={group.label} className="bg-ice-900 border border-ice-700 rounded-lg overflow-hidden">
            <div className="px-4 py-3 border-b border-ice-700 text-xs uppercase tracking-[0.2em] text-steel-400">
              {group.label}
            </div>
            <table className="w-full text-sm">
              <thead>
                <tr className="text-steel-400 text-xs uppercase tracking-wide">
                  <th className="text-left font-normal px-4 py-2">Player</th>
                  <th className="text-left font-normal px-2 py-2 hidden md:table-cell">Archetype</th>
                  <th className="font-normal px-2 py-2 font-mono-stat">Age</th>
                  <th className="font-normal px-2 py-2 font-mono-stat">OVR</th>
                  <th className="font-normal px-2 py-2 font-mono-stat">POT</th>
                  {isGoalieGroup ? (
                    <>
                      <th className="font-normal px-2 py-2 font-mono-stat">W-L-OTL</th>
                      <th className="font-normal px-2 py-2 font-mono-stat">SV%</th>
                      <th className="font-normal px-2 py-2 font-mono-stat">GAA</th>
                      <th className="font-normal px-2 py-2 font-mono-stat hidden sm:table-cell">SO</th>
                    </>
                  ) : (
                    <>
                      <th className="font-normal px-2 py-2 font-mono-stat">G</th>
                      <th className="font-normal px-2 py-2 font-mono-stat">A</th>
                      <th className="font-normal px-2 py-2 font-mono-stat">P</th>
                      <th className="font-normal px-2 py-2 font-mono-stat hidden sm:table-cell">HIT</th>
                      <th className="font-normal px-2 py-2 font-mono-stat hidden sm:table-cell">BLK</th>
                    </>
                  )}
                  <th className="font-normal px-2 py-2 font-mono-stat hidden md:table-cell">AAV</th>
                </tr>
              </thead>
              <tbody>
                {players.map(p => {
                  const gp = p.stats.gamesPlayed;
                  const savePct = isGoalie(p) && p.stats.shotsAgainst > 0 ? (p.stats.saves / p.stats.shotsAgainst) * 100 : null;
                  const gaa = isGoalie(p) && gp > 0 ? p.stats.goalsAgainst / gp : null;
                  return (
                    <tr key={p.id} className="border-t border-ice-800">
                      <td className="px-4 py-2 truncate">
                        <button
                          onClick={() => setSelectedPlayer(p)}
                          className="hover:text-pp-gold transition-colors"
                        >
                          {p.firstName} {p.lastName}
                        </button>
                        <span className="text-steel-400 ml-1">{p.position}</span>
                      </td>
                      <td className="px-2 py-2 text-steel-300 text-xs hidden md:table-cell truncate">{p.archetype}</td>
                      <td className="text-center px-2 py-2 font-mono-stat text-steel-300">{p.age}</td>
                      <td className={`text-center px-2 py-2 font-mono-stat font-semibold ${ratingColor(p.overall)}`}>{p.overall}</td>
                      <td className="text-center px-2 py-2 font-mono-stat text-steel-300">{p.potential}</td>
                      {isGoalie(p) ? (
                        <>
                          <td className="text-center px-2 py-2 font-mono-stat">{p.stats.wins}-{p.stats.losses}-{p.stats.otLosses}</td>
                          <td className="text-center px-2 py-2 font-mono-stat font-semibold">{savePct !== null ? savePct.toFixed(1) : '—'}</td>
                          <td className="text-center px-2 py-2 font-mono-stat">{gaa !== null ? gaa.toFixed(2) : '—'}</td>
                          <td className="text-center px-2 py-2 font-mono-stat text-steel-300 hidden sm:table-cell">{p.stats.shutouts}</td>
                        </>
                      ) : (
                        <>
                          <td className="text-center px-2 py-2 font-mono-stat">{p.stats.goals}</td>
                          <td className="text-center px-2 py-2 font-mono-stat">{p.stats.assists}</td>
                          <td className="text-center px-2 py-2 font-mono-stat font-semibold">{p.stats.points}</td>
                          <td className="text-center px-2 py-2 font-mono-stat text-steel-300 hidden sm:table-cell">{p.stats.hits}</td>
                          <td className="text-center px-2 py-2 font-mono-stat text-steel-300 hidden sm:table-cell">{p.stats.blocks}</td>
                        </>
                      )}
                      <td className="text-center px-2 py-2 font-mono-stat text-steel-300 hidden md:table-cell">${p.contract.salaryAAV.toFixed(2)}M</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        );
      })}
      <div className="text-xs text-steel-400 font-mono-stat">
        Cap space: <span className={team.capSpace >= 0 ? 'text-win-teal' : 'text-goal-red'}>${team.capSpace.toFixed(2)}M</span> of ${team.capCeiling}M
      </div>

      {selectedPlayer && (
        <PlayerCard
          player={selectedPlayer}
          league={league}
          onClose={() => setSelectedPlayer(null)}
        />
      )}
    </div>
  );
}
