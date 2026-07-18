import { Team } from '@/lib/types';

export function Scoreboard({
  homeTeam,
  awayTeam,
  homeScore,
  awayScore,
  status,
}: {
  homeTeam: Team;
  awayTeam: Team;
  homeScore: number;
  awayScore: number;
  status: string;
}) {
  return (
    <div className="rink-watermark bg-ice-900 border border-ice-700 rounded-lg px-6 py-5">
      <div className="flex items-center justify-between gap-4">
        <TeamReadout team={awayTeam} align="left" />
        <div className="flex flex-col items-center shrink-0 px-4">
          <div className="font-mono-stat text-5xl sm:text-6xl font-semibold tracking-tight text-ice-100 flex items-center gap-3">
            <span>{awayScore}</span>
            <span className="text-steel-400 text-3xl">–</span>
            <span>{homeScore}</span>
          </div>
          <div className="mt-2 text-[11px] uppercase tracking-[0.2em] text-goal-red font-medium">{status}</div>
        </div>
        <TeamReadout team={homeTeam} align="right" />
      </div>
    </div>
  );
}

function TeamReadout({ team, align }: { team: Team; align: 'left' | 'right' }) {
  return (
    <div className={`flex-1 min-w-0 ${align === 'right' ? 'text-right' : 'text-left'}`}>
      <div className="font-display text-2xl sm:text-3xl uppercase tracking-wide text-ice-100 truncate">
        {team.abbreviation}
      </div>
      <div className="text-xs text-steel-400 truncate">{team.city} {team.name}</div>
      <div className="font-mono-stat text-xs text-steel-300 mt-1">
        {team.record.wins}-{team.record.losses}-{team.record.otLosses}
      </div>
    </div>
  );
}
