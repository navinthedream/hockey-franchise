'use client';

import { useEffect, useState } from 'react';
import { League, GameResult } from '@/lib/types';
import { fetchFranchise, startNewFranchise, simAdvance, resetFranchise } from '@/lib/api';
import { TeamPicker } from '@/components/TeamPicker';
import { StandingsTable } from '@/components/StandingsTable';
import { RosterTable } from '@/components/RosterTable';
import { GameViewer } from '@/components/GameViewer';
import { Scoreboard } from '@/components/Scoreboard';
import { LeagueLeaders } from '@/components/LeagueLeaders';
import { LinesEditor } from '@/components/LinesEditor';
import { formatDate, nextGameForTeam, seasonGamesPlayed, seasonGamesTotal, teamById, teamLabel } from '@/lib/utils';

type Tab = 'dashboard' | 'standings' | 'roster' | 'lastGame' | 'leaders' | 'lines';

export default function Home() {
  const [league, setLeague] = useState<League | null | undefined>(undefined); // undefined = loading
  const [tab, setTab] = useState<Tab>('dashboard');
  const [simLoading, setSimLoading] = useState(false);
  const [creating, setCreating] = useState(false);
  const [lastResults, setLastResults] = useState<GameResult[]>([]);
  const [viewingResult, setViewingResult] = useState<GameResult | null>(null);

  useEffect(() => {
    fetchFranchise().then(setLeague);
  }, []);

  async function handlePick(abbr: string) {
    setCreating(true);
    const l = await startNewFranchise(abbr);
    setLeague(l);
    setCreating(false);
  }

  async function handleSim(mode: 'day' | 'toNextUserGame' | 'season') {
    setSimLoading(true);
    const { league: l, results } = await simAdvance(mode);
    setLeague(l);
    setLastResults(results);
    const userTeam = l.teams.find(t => t.isUserControlled);
    const userResult = results.find(r => userTeam && (r.homeTeamId === userTeam.id || r.awayTeamId === userTeam.id));
    setViewingResult(userResult ?? results[results.length - 1] ?? null);
    if (userResult || results.length) setTab('lastGame');
    setSimLoading(false);
  }

  async function handleReset() {
    await resetFranchise();
    setLeague(null);
    setLastResults([]);
    setViewingResult(null);
    setTab('dashboard');
  }

  if (league === undefined) {
    return <div className="flex-1 flex items-center justify-center text-steel-400">Loading franchise…</div>;
  }

  if (!league) {
    return <TeamPicker onPick={handlePick} loading={creating} />;
  }

  const userTeam = league.teams.find(t => t.isUserControlled)!;
  const nextGame = nextGameForTeam(league, userTeam.id);
  const nextOpp = nextGame ? teamById(league, nextGame.homeTeamId === userTeam.id ? nextGame.awayTeamId : nextGame.homeTeamId) : null;
  const seasonOver = seasonGamesPlayed(league) === seasonGamesTotal(league);

  return (
    <div className="flex-1 flex flex-col">
      <header className="border-b border-ice-700 bg-ice-900/60 sticky top-0 z-10 backdrop-blur">
        <div className="max-w-5xl mx-auto px-6 py-4 flex items-center justify-between gap-4">
          <div>
            <div className="font-display text-xl uppercase tracking-wide leading-none">Ice Level</div>
            <div className="text-xs text-steel-400 mt-0.5">
              {teamLabel(userTeam)} · {formatDate(league.currentDate)} · {seasonGamesPlayed(league)}/{seasonGamesTotal(league)} GP
            </div>
          </div>
          <button onClick={handleReset} className="text-xs text-steel-400 hover:text-goal-red transition-colors uppercase tracking-wide">
            Reset franchise
          </button>
        </div>
        <nav className="max-w-5xl mx-auto px-6 flex gap-1 pb-2">
          {(['dashboard', 'standings', 'roster', 'lastGame', 'leaders', 'lines'] as Tab[]).map(t => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
                tab === t ? 'bg-goal-red text-ice-100' : 'text-steel-300 hover:text-ice-100'
              }`}
            >
              {t === 'dashboard' ? 'Dashboard'
                : t === 'standings' ? 'Standings'
                : t === 'roster' ? 'My Roster'
                : t === 'lastGame' ? 'Last Game'
                : t === 'leaders' ? 'Leaders'
                : 'Lines'}
            </button>
          ))}
        </nav>
      </header>

      <main className="max-w-5xl mx-auto px-6 py-8 w-full flex-1">
        {tab === 'dashboard' && (
          <div className="space-y-6">
            {seasonOver ? (
              <div className="bg-ice-900 border border-pp-gold/40 rounded-lg p-6 text-center">
                <div className="font-display text-2xl uppercase text-pp-gold mb-1">Season complete</div>
                <p className="text-steel-300 text-sm">All {seasonGamesTotal(league)} games played. Offseason tools (draft, trades, free agency) are next up.</p>
              </div>
            ) : nextGame && nextOpp ? (
              <div>
                <div className="text-xs uppercase tracking-[0.2em] text-steel-400 mb-2">Next game · {formatDate(nextGame.date)}</div>
                <Scoreboard
                  homeTeam={teamById(league, nextGame.homeTeamId)!}
                  awayTeam={teamById(league, nextGame.awayTeamId)!}
                  homeScore={0}
                  awayScore={0}
                  status="Upcoming"
                />
              </div>
            ) : null}

            <div className="flex flex-wrap gap-3">
              <SimButton label="Sim Next Day" onClick={() => handleSim('day')} loading={simLoading} disabled={seasonOver} />
              <SimButton label="Sim to My Next Game" onClick={() => handleSim('toNextUserGame')} loading={simLoading} disabled={seasonOver} primary />
              <SimButton label="Sim Rest of Season" onClick={() => handleSim('season')} loading={simLoading} disabled={seasonOver} />
            </div>

            {lastResults.length > 0 && (
              <div>
                <div className="text-xs uppercase tracking-[0.2em] text-steel-400 mb-2">
                  Results — {formatDate(lastResults[0].date)}
                </div>
                <div className="grid sm:grid-cols-2 gap-2">
                  {lastResults.map(r => {
                    const h = teamById(league, r.homeTeamId)!;
                    const a = teamById(league, r.awayTeamId)!;
                    const involvesUser = h.id === userTeam.id || a.id === userTeam.id;
                    return (
                      <button
                        key={r.id}
                        onClick={() => { setViewingResult(r); setTab('lastGame'); }}
                        className={`text-left px-4 py-2 rounded-md border text-sm flex justify-between items-center transition-colors ${
                          involvesUser ? 'border-goal-red bg-goal-red-dim/20' : 'border-ice-700 bg-ice-900 hover:border-steel-400'
                        }`}
                      >
                        <span>{a.abbreviation} @ {h.abbreviation}</span>
                        <span className="font-mono-stat">{r.awayScore}–{r.homeScore}{r.wentToOT ? (r.wentToShootout ? ' SO' : ' OT') : ''}</span>
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            <div>
              <div className="text-xs uppercase tracking-[0.2em] text-steel-400 mb-2">Conference standings</div>
              <StandingsTable league={league} />
            </div>
          </div>
        )}

        {tab === 'standings' && <StandingsTable league={league} />}
        {tab === 'roster' && <RosterTable league={league} teamId={userTeam.id} />}
        {tab === 'lastGame' && (
          viewingResult
            ? <GameViewer league={league} result={viewingResult} />
            : <div className="text-steel-400">No game simmed yet — head to Dashboard and sim a day.</div>
        )}
        {tab === 'leaders' && <LeagueLeaders league={league} />}
        {tab === 'lines' && (
          <LinesEditor
            key={league.currentDate + userTeam.id}
            league={league}
            userTeamId={userTeam.id}
          />
        )}
      </main>
    </div>
  );
}

function SimButton({ label, onClick, loading, disabled, primary }: { label: string; onClick: () => void; loading: boolean; disabled?: boolean; primary?: boolean }) {
  return (
    <button
      onClick={onClick}
      disabled={loading || disabled}
      className={`px-4 py-2 rounded-md text-sm font-medium uppercase tracking-wide transition-colors disabled:opacity-40 disabled:cursor-not-allowed ${
        primary ? 'bg-goal-red text-ice-100 hover:bg-goal-red/90' : 'bg-ice-800 text-ice-100 border border-ice-700 hover:border-steel-400'
      }`}
    >
      {loading ? 'Simming…' : label}
    </button>
  );
}
