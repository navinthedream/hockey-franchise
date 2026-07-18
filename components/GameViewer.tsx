'use client';

import { useState } from 'react';
import { GameResult, League, Player } from '@/lib/types';
import { Scoreboard } from './Scoreboard';
import { PlayerCard } from './PlayerCard';
import { playerName } from '@/lib/utils';

const EVENT_STYLE: Record<string, string> = {
  goal: 'text-goal-red font-semibold',
  penalty: 'text-pp-gold',
  save: 'text-steel-400',
  hit: 'text-steel-300',
  block: 'text-win-teal',
  fight: 'text-pp-gold font-semibold',
  'period-end': 'text-steel-400 italic',
  'game-end': 'text-ice-100 font-semibold',
  faceoff: 'text-steel-400',
};

export function GameViewer({ league, result }: { league: League; result: GameResult }) {
  const [selectedPlayer, setSelectedPlayer] = useState<Player | null>(null);
  const home = league.teams.find(t => t.id === result.homeTeamId)!;
  const away = league.teams.find(t => t.id === result.awayTeamId)!;
  const status = result.wentToShootout ? 'Final / SO' : result.wentToOT ? 'Final / OT' : 'Final';

  return (
    <div className="space-y-6">
      <Scoreboard homeTeam={home} awayTeam={away} homeScore={result.homeScore} awayScore={result.awayScore} status={status} />

      <div className="grid sm:grid-cols-2 gap-4">
        <BoxscoreCard league={league} team={away} box={result.boxscore.away} onPlayerClick={setSelectedPlayer} />
        <BoxscoreCard league={league} team={home} box={result.boxscore.home} onPlayerClick={setSelectedPlayer} />
      </div>

      <div className="bg-ice-900 border border-ice-700 rounded-lg overflow-hidden">
        <div className="px-4 py-3 border-b border-ice-700 text-xs uppercase tracking-[0.2em] text-steel-400">
          Play by play
        </div>
        <div className="max-h-[28rem] overflow-y-auto divide-y divide-ice-800">
          {result.events.map((e, i) => (
            <div key={i} className="px-4 py-2 flex items-start gap-3 text-sm">
              <span className="font-mono-stat text-steel-400 shrink-0 w-16">
                {e.period <= 3 ? `P${e.period}` : 'OT'} {e.clock}
              </span>
              <span className={EVENT_STYLE[e.type] ?? 'text-ice-100'}>{e.description}</span>
            </div>
          ))}

        </div>
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

function BoxscoreCard({
  league,
  team,
  box,
  onPlayerClick,
}: {
  league: League;
  team: League['teams'][number];
  box: GameResult['boxscore']['home'];
  onPlayerClick: (p: Player) => void;
}) {
  function clickablePlayer(id: string) {
    const p = league.players[id];
    if (!p) return <span>{playerName(p)}</span>;
    return (
      <button
        onClick={() => onPlayerClick(p)}
        className="text-ice-100 hover:text-pp-gold transition-colors"
      >
        {playerName(p)}
      </button>
    );
  }

  return (
    <div className="bg-ice-900 border border-ice-700 rounded-lg p-4">
      <div className="font-display uppercase tracking-wide text-lg mb-2">{team.abbreviation}</div>
      <div className="grid grid-cols-4 gap-2 text-center mb-3 font-mono-stat text-sm">
        <div><div className="text-steel-400 text-xs">SOG</div>{box.shots}</div>
        <div><div className="text-steel-400 text-xs">BLK</div>{box.blocks}</div>
        <div><div className="text-steel-400 text-xs">HITS</div>{box.hits}</div>
        <div><div className="text-steel-400 text-xs">PIM</div>{box.pim}</div>
      </div>
      {box.goalScorers.length > 0 && (
        <div className="space-y-1 text-sm mb-2">
          {box.goalScorers.map((g, i) => (
            <div key={i} className="text-steel-300">
              {clickablePlayer(g.playerId)}
              {g.assists.length > 0 && (
                <span className="text-steel-400">
                  {' ('}
                  {g.assists.map((a, ai) => (
                    <span key={a}>
                      {ai > 0 && ', '}
                      {clickablePlayer(a)}
                    </span>
                  ))}
                  {')'}
                </span>
              )}
            </div>
          ))}
        </div>
      )}
      <div className="text-xs text-steel-400 border-t border-ice-800 pt-2 mt-2">
        {clickablePlayer(box.goalieId)} — {box.saves} saves, {box.goalsAgainst} GA
      </div>
    </div>
  );
}
