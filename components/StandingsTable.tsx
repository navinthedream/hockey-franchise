import { League } from '@/lib/types';
import { getStandings } from '@/lib/franchiseEngine';

export function StandingsTable({ league }: { league: League }) {
  const standings = getStandings(league);
  const conferences: ('Eastern' | 'Western')[] = ['Eastern', 'Western'];

  return (
    <div className="grid sm:grid-cols-2 gap-6">
      {conferences.map(conf => (
        <div key={conf} className="bg-ice-900 border border-ice-700 rounded-lg overflow-hidden">
          <div className="px-4 py-3 border-b border-ice-700 text-xs uppercase tracking-[0.2em] text-steel-400">
            {conf} Conference
          </div>
          <table className="w-full text-sm">
            <thead>
              <tr className="text-steel-400 text-xs uppercase tracking-wide">
                <th className="text-left font-normal px-4 py-2">Team</th>
                <th className="font-normal px-2 py-2 font-mono-stat">GP</th>
                <th className="font-normal px-2 py-2 font-mono-stat">W</th>
                <th className="font-normal px-2 py-2 font-mono-stat">L</th>
                <th className="font-normal px-2 py-2 font-mono-stat">OT</th>
                <th className="font-normal px-2 py-2 font-mono-stat">PTS</th>
                <th className="font-normal px-2 py-2 font-mono-stat">DIFF</th>
              </tr>
            </thead>
            <tbody>
              {standings.filter(t => t.conference === conf).map((t, i) => {
                const gp = t.record.wins + t.record.losses + t.record.otLosses;
                const diff = t.record.goalsFor - t.record.goalsAgainst;
                return (
                  <tr
                    key={t.id}
                    className={`border-t border-ice-800 ${t.isUserControlled ? 'bg-goal-red-dim/25' : ''} ${i < 4 ? '' : 'text-steel-300'}`}
                  >
                    <td className="px-4 py-2">
                      <span className="font-display uppercase tracking-wide">{t.abbreviation}</span>
                      <span className="text-steel-400 text-xs ml-2 hidden sm:inline">{t.name}</span>
                      {t.isUserControlled && <span className="text-goal-red text-xs ml-2">YOU</span>}
                    </td>
                    <td className="text-center px-2 py-2 font-mono-stat">{gp}</td>
                    <td className="text-center px-2 py-2 font-mono-stat">{t.record.wins}</td>
                    <td className="text-center px-2 py-2 font-mono-stat">{t.record.losses}</td>
                    <td className="text-center px-2 py-2 font-mono-stat">{t.record.otLosses}</td>
                    <td className="text-center px-2 py-2 font-mono-stat font-semibold text-ice-100">{t.record.points}</td>
                    <td className={`text-center px-2 py-2 font-mono-stat ${diff > 0 ? 'text-win-teal' : diff < 0 ? 'text-goal-red' : ''}`}>
                      {diff > 0 ? `+${diff}` : diff}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ))}
    </div>
  );
}
