'use client';

import { useState, useMemo } from 'react';
import { ChevronLeft } from 'lucide-react';
import { League, Player } from '@/lib/types';
import { getLeaders, LeaderEntry, StatKey, formatSavePct, formatGAA } from '@/lib/utils';
import { PlayerCard } from './PlayerCard';

// ── Scope ──────────────────────────────────────────────────────────────────────

type Scope =
  | { kind: 'league' }
  | { kind: 'conference'; value: string }
  | { kind: 'division'; value: string }
  | { kind: 'team'; teamId: string };

function teamIdsForScope(scope: Scope, league: League): Set<string> | undefined {
  if (scope.kind === 'league') return undefined;
  if (scope.kind === 'conference')
    return new Set(league.teams.filter(t => t.conference === scope.value).map(t => t.id));
  if (scope.kind === 'division')
    return new Set(league.teams.filter(t => t.division === scope.value).map(t => t.id));
  if (scope.kind === 'team') return new Set([scope.teamId]);
}

// ── Card config ────────────────────────────────────────────────────────────────

interface SecondaryCol {
  label: string;
  value: (e: LeaderEntry) => string | number;
}

interface LeaderCardConfig {
  title: string;
  statKey: StatKey;
  position: 'skater' | 'goalie';
  minGames?: number;
  ascending?: boolean;
  computeSort?: (p: Player) => number;
  format?: (entry: LeaderEntry) => string;
  secondaryCols: SecondaryCol[];
}

const MIN_GP_RATE = 10;

const SKATER_CARDS: LeaderCardConfig[] = [
  {
    title: 'Points', statKey: 'points', position: 'skater', minGames: 1,
    secondaryCols: [
      { label: 'G',   value: e => e.player.stats.goals },
      { label: 'A',   value: e => e.player.stats.assists },
      { label: 'GP',  value: e => e.player.stats.gamesPlayed },
    ],
  },
  {
    title: 'Goals', statKey: 'goals', position: 'skater', minGames: 1,
    secondaryCols: [
      { label: 'A',   value: e => e.player.stats.assists },
      { label: 'PTS', value: e => e.player.stats.points },
      { label: 'GP',  value: e => e.player.stats.gamesPlayed },
    ],
  },
  {
    title: 'Assists', statKey: 'assists', position: 'skater', minGames: 1,
    secondaryCols: [
      { label: 'G',   value: e => e.player.stats.goals },
      { label: 'PTS', value: e => e.player.stats.points },
      { label: 'GP',  value: e => e.player.stats.gamesPlayed },
    ],
  },
  {
    title: '+/−', statKey: 'plusMinus', position: 'skater', minGames: 1,
    format: e => e.value >= 0 ? `+${e.value}` : String(e.value),
    secondaryCols: [
      { label: 'G',   value: e => e.player.stats.goals },
      { label: 'PTS', value: e => e.player.stats.points },
      { label: 'GP',  value: e => e.player.stats.gamesPlayed },
    ],
  },
  {
    title: 'PIM', statKey: 'pim', position: 'skater', minGames: 1,
    secondaryCols: [
      { label: 'HIT', value: e => e.player.stats.hits },
      { label: 'FGT', value: e => e.player.stats.fightingMajors },
      { label: 'GP',  value: e => e.player.stats.gamesPlayed },
    ],
  },
  {
    title: 'Hits', statKey: 'hits', position: 'skater', minGames: 1,
    secondaryCols: [
      { label: 'BLK', value: e => e.player.stats.blocks },
      { label: 'PIM', value: e => e.player.stats.pim },
      { label: 'GP',  value: e => e.player.stats.gamesPlayed },
    ],
  },
  {
    title: 'Blocks', statKey: 'blocks', position: 'skater', minGames: 1,
    secondaryCols: [
      { label: 'HIT', value: e => e.player.stats.hits },
      { label: 'GP',  value: e => e.player.stats.gamesPlayed },
    ],
  },
  {
    title: 'Takeaways', statKey: 'takeaways', position: 'skater', minGames: 1,
    secondaryCols: [
      { label: 'HIT', value: e => e.player.stats.hits },
      { label: 'GP',  value: e => e.player.stats.gamesPlayed },
    ],
  },
];

const GOALIE_CARDS: LeaderCardConfig[] = [
  {
    title: 'Wins', statKey: 'wins', position: 'goalie', minGames: 1,
    secondaryCols: [
      { label: 'L',   value: e => e.player.stats.losses },
      { label: 'OTL', value: e => e.player.stats.otLosses },
      { label: 'GP',  value: e => e.player.stats.gamesPlayed },
    ],
  },
  {
    title: 'GAA', statKey: 'goalsAgainst', position: 'goalie',
    minGames: MIN_GP_RATE, ascending: true,
    computeSort: p => p.stats.gamesPlayed > 0 ? p.stats.goalsAgainst / p.stats.gamesPlayed : 999,
    format: e => formatGAA(e.player.stats.goalsAgainst, e.player.stats.gamesPlayed),
    secondaryCols: [
      { label: 'SV%', value: e => formatSavePct(e.player.stats.saves, e.player.stats.shotsAgainst) },
      { label: 'W',   value: e => e.player.stats.wins },
      { label: 'GP',  value: e => e.player.stats.gamesPlayed },
    ],
  },
  {
    title: 'SV%', statKey: 'saves', position: 'goalie',
    minGames: MIN_GP_RATE,
    computeSort: p => p.stats.shotsAgainst > 0 ? p.stats.saves / p.stats.shotsAgainst : 0,
    format: e => formatSavePct(e.player.stats.saves, e.player.stats.shotsAgainst),
    secondaryCols: [
      { label: 'GAA', value: e => formatGAA(e.player.stats.goalsAgainst, e.player.stats.gamesPlayed) },
      { label: 'W',   value: e => e.player.stats.wins },
      { label: 'GP',  value: e => e.player.stats.gamesPlayed },
    ],
  },
  {
    title: 'Shutouts', statKey: 'shutouts', position: 'goalie', minGames: 1,
    secondaryCols: [
      { label: 'W',   value: e => e.player.stats.wins },
      { label: 'GAA', value: e => formatGAA(e.player.stats.goalsAgainst, e.player.stats.gamesPlayed) },
      { label: 'GP',  value: e => e.player.stats.gamesPlayed },
    ],
  },
];

// ── Scope filter ───────────────────────────────────────────────────────────────

function ScopeFilter({
  league,
  scope,
  onChange,
}: {
  league: League;
  scope: Scope;
  onChange: (s: Scope) => void;
}) {
  const userTeam = league.teams.find(t => t.isUserControlled);
  const conferences = useMemo(
    () => [...new Set(league.teams.map(t => t.conference))].sort(),
    [league],
  );
  const divisions = useMemo(
    () => [...new Set(league.teams.map(t => t.division))].sort(),
    [league],
  );

  function pillClass(active: boolean) {
    return `px-2.5 py-1 rounded-full text-xs font-medium whitespace-nowrap transition-colors ${
      active
        ? 'bg-goal-red text-ice-100'
        : 'bg-ice-800 text-steel-300 border border-ice-700 hover:border-steel-400 hover:text-ice-100'
    }`;
  }

  const isMyTeamActive = scope.kind === 'team' && scope.teamId === userTeam?.id;
  // "team" scope that isn't My Team → the select has a value
  const selectedTeamId =
    scope.kind === 'team' && scope.teamId !== userTeam?.id ? scope.teamId : '';

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {/* My Team shortcut */}
      {userTeam && (
        <>
          <button
            onClick={() => onChange({ kind: 'team', teamId: userTeam.id })}
            className={pillClass(isMyTeamActive)}
          >
            My Team
          </button>
          <span className="text-ice-700 select-none">·</span>
        </>
      )}

      {/* League */}
      <button
        onClick={() => onChange({ kind: 'league' })}
        className={pillClass(scope.kind === 'league')}
      >
        League
      </button>

      {/* Conferences */}
      {conferences.map(conf => (
        <button
          key={conf}
          onClick={() => onChange({ kind: 'conference', value: conf })}
          className={pillClass(scope.kind === 'conference' && (scope as { kind: 'conference'; value: string }).value === conf)}
        >
          {conf}
        </button>
      ))}

      <span className="text-ice-700 select-none">·</span>

      {/* Divisions */}
      {divisions.map(div => (
        <button
          key={div}
          onClick={() => onChange({ kind: 'division', value: div })}
          className={pillClass(scope.kind === 'division' && (scope as { kind: 'division'; value: string }).value === div)}
        >
          {div}
        </button>
      ))}

      <span className="text-ice-700 select-none">·</span>

      {/* Individual team select */}
      <select
        value={selectedTeamId}
        onChange={e => {
          if (e.target.value) onChange({ kind: 'team', teamId: e.target.value });
        }}
        className={`px-2 py-1 rounded-full text-xs font-medium border transition-colors bg-ice-800 border-ice-700 hover:border-steel-400 cursor-pointer ${
          selectedTeamId ? 'text-ice-100 border-goal-red' : 'text-steel-300'
        }`}
      >
        <option value="">Team ▾</option>
        {[...league.teams]
          .sort((a, b) => a.abbreviation.localeCompare(b.abbreviation))
          .map(t => (
            <option key={t.id} value={t.id} className="bg-ice-900 text-ice-100">
              {t.abbreviation} — {t.city} {t.name}
            </option>
          ))}
      </select>
    </div>
  );
}

// ── Compact leader card (top 10 overview) ─────────────────────────────────────

function LeaderCard({
  config,
  league,
  scope,
  onPlayerClick,
  onExpand,
}: {
  config: LeaderCardConfig;
  league: League;
  scope: Scope;
  onPlayerClick: (p: Player) => void;
  onExpand: (config: LeaderCardConfig) => void;
}) {
  const userTeam = league.teams.find(t => t.isUserControlled);
  const teamIds = teamIdsForScope(scope, league);

  const entries = getLeaders(league, config.statKey, {
    position: config.position,
    minGames: config.minGames,
    ascending: config.ascending,
    computeSort: config.computeSort,
    teamIds,
    limit: 10,
  });

  return (
    <div className="bg-ice-900 border border-ice-700 rounded-lg overflow-hidden flex flex-col">
      <button
        onClick={() => onExpand(config)}
        className="px-3 py-2 border-b border-ice-700 text-left group flex items-center justify-between hover:bg-ice-850 transition-colors"
      >
        <span className="text-xs uppercase tracking-[0.2em] text-steel-400 font-display group-hover:text-ice-100 transition-colors">
          {config.title}
        </span>
        <span className="text-xs text-steel-400 group-hover:text-steel-300 transition-colors shrink-0 ml-1">
          See all ›
        </span>
      </button>

      {entries.length === 0 ? (
        <div className="px-3 py-4 text-xs text-steel-400 text-center">No qualifiers yet</div>
      ) : (
        <div className="divide-y divide-ice-800 flex-1">
          {entries.map((entry, i) => {
            const isUser = userTeam && entry.player.teamId === userTeam.id;
            const displayValue = config.format ? config.format(entry) : String(entry.value);
            return (
              <div
                key={entry.player.id}
                className={`flex items-center gap-2 px-3 py-1.5 ${isUser ? 'bg-goal-red-dim/25' : ''}`}
              >
                <span className="font-mono-stat text-xs text-steel-400 w-4 shrink-0">{i + 1}</span>
                <div className="flex-1 min-w-0">
                  <button
                    onClick={() => onPlayerClick(entry.player)}
                    className="text-sm text-ice-100 hover:text-pp-gold transition-colors truncate block text-left w-full"
                  >
                    {entry.player.firstName} {entry.player.lastName}
                  </button>
                  <span className="text-xs text-steel-400 font-mono-stat">
                    {entry.team?.abbreviation ?? '—'}
                  </span>
                </div>
                <span className="font-mono-stat text-sm font-semibold text-ice-100 shrink-0">
                  {displayValue}
                </span>
              </div>
            );
          })}
        </div>
      )}

      <button
        onClick={() => onExpand(config)}
        className="px-3 py-1.5 border-t border-ice-800 text-xs text-steel-400 hover:text-steel-300 transition-colors text-center"
      >
        View full list
      </button>
    </div>
  );
}

// ── Expanded single-stat table ─────────────────────────────────────────────────

function ExpandedStatView({
  config,
  league,
  scope,
  onBack,
  onPlayerClick,
}: {
  config: LeaderCardConfig;
  league: League;
  scope: Scope;
  onBack: () => void;
  onPlayerClick: (p: Player) => void;
}) {
  const [showUnqualified, setShowUnqualified] = useState(false);
  const userTeam = league.teams.find(t => t.isUserControlled);
  const teamIds = teamIdsForScope(scope, league);
  const minGames = config.minGames ?? 0;
  const hasQualifier = minGames > 1;

  // Qualified: full sorted list respecting minGames
  const qualified = useMemo(() =>
    getLeaders(league, config.statKey, {
      position: config.position,
      minGames,
      ascending: config.ascending,
      computeSort: config.computeSort,
      teamIds,
      limit: Infinity,
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [league, config, scope],
  );

  // Unqualified: players who don't meet the floor, sorted same way
  const unqualified = useMemo(() => {
    if (!hasQualifier) return [];
    return getLeaders(league, config.statKey, {
      position: config.position,
      minGames: 0,
      ascending: config.ascending,
      computeSort: config.computeSort,
      teamIds,
      limit: Infinity,
    }).filter(e => e.player.stats.gamesPlayed < minGames);
  },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [league, config, scope],
  );

  function TableRow({
    entry,
    rank,
    dimmed = false,
  }: {
    entry: LeaderEntry;
    rank: number | string;
    dimmed?: boolean;
  }) {
    const isUser = userTeam && entry.player.teamId === userTeam.id;
    const displayValue = config.format ? config.format(entry) : String(entry.value);
    return (
      <tr
        className={`border-t border-ice-800 ${isUser ? 'bg-goal-red-dim/25' : ''} ${dimmed ? 'opacity-50' : ''}`}
      >
        <td className="px-3 py-1.5 font-mono-stat text-xs text-steel-400 w-8 text-right">{rank}</td>
        <td className="px-3 py-1.5">
          <button
            onClick={() => onPlayerClick(entry.player)}
            className="text-sm text-ice-100 hover:text-pp-gold transition-colors text-left"
          >
            {entry.player.firstName} {entry.player.lastName}
          </button>
          {isUser && <span className="text-goal-red text-xs ml-1.5">YOU</span>}
        </td>
        <td className="px-3 py-1.5 font-mono-stat text-xs text-steel-300">
          {entry.team?.abbreviation ?? '—'}
        </td>
        <td className="px-3 py-1.5 font-mono-stat text-sm font-semibold text-ice-100 text-right">
          {displayValue}
        </td>
        {config.secondaryCols.map(col => (
          <td key={col.label} className="px-3 py-1.5 font-mono-stat text-sm text-steel-300 text-right hidden sm:table-cell">
            {col.value(entry)}
          </td>
        ))}
      </tr>
    );
  }

  return (
    <div className="space-y-4">
      {/* Back + title */}
      <div className="flex items-center gap-3">
        <button
          onClick={onBack}
          className="flex items-center gap-1 text-steel-400 hover:text-ice-100 transition-colors text-sm"
        >
          <ChevronLeft size={16} />
          <span>Leaders</span>
        </button>
        <span className="text-steel-400">/</span>
        <span className="font-display uppercase tracking-wide text-ice-100">{config.title}</span>
      </div>

      {/* Meta row: qualifier note + toggle */}
      {hasQualifier && (
        <div className="flex items-center justify-between flex-wrap gap-2">
          <span className="text-xs text-steel-400 font-mono-stat">
            Qualified: min. {minGames} GP
            {unqualified.length > 0 && ` · ${unqualified.length} player${unqualified.length !== 1 ? 's' : ''} below threshold`}
          </span>
          {unqualified.length > 0 && (
            <button
              onClick={() => setShowUnqualified(v => !v)}
              className={`text-xs px-2.5 py-1 rounded-full border transition-colors ${
                showUnqualified
                  ? 'bg-ice-800 border-steel-400 text-ice-100'
                  : 'border-ice-700 text-steel-400 hover:border-steel-400 hover:text-steel-300'
              }`}
            >
              {showUnqualified ? 'Hide unqualified' : 'Show unqualified'}
            </button>
          )}
        </div>
      )}

      {/* Dense table */}
      <div className="bg-ice-900 border border-ice-700 rounded-lg overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-steel-400 text-xs uppercase tracking-wide border-b border-ice-700">
              <th className="px-3 py-2 font-normal text-right w-8">#</th>
              <th className="px-3 py-2 font-normal text-left">Player</th>
              <th className="px-3 py-2 font-normal text-left">Team</th>
              <th className="px-3 py-2 font-normal font-mono-stat text-right">{config.title}</th>
              {config.secondaryCols.map(col => (
                <th key={col.label} className="px-3 py-2 font-normal font-mono-stat text-right hidden sm:table-cell">
                  {col.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {qualified.length === 0 ? (
              <tr>
                <td colSpan={4 + config.secondaryCols.length} className="px-3 py-6 text-center text-xs text-steel-400">
                  No qualifiers yet
                </td>
              </tr>
            ) : (
              qualified.map((entry, i) => (
                <TableRow key={entry.player.id} entry={entry} rank={i + 1} />
              ))
            )}

            {/* Unqualified section */}
            {showUnqualified && unqualified.length > 0 && (
              <>
                <tr className="border-t border-ice-700 bg-ice-850">
                  <td
                    colSpan={4 + config.secondaryCols.length}
                    className="px-3 py-1.5 text-xs uppercase tracking-[0.15em] text-steel-400"
                  >
                    Below qualifier (min. {minGames} GP)
                  </td>
                </tr>
                {unqualified.map((entry) => (
                  <TableRow key={entry.player.id} entry={entry} rank="—" dimmed />
                ))}
              </>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ── Main component ─────────────────────────────────────────────────────────────

export function LeagueLeaders({ league }: { league: League }) {
  const [scope, setScope] = useState<Scope>({ kind: 'league' });
  const [expandedConfig, setExpandedConfig] = useState<LeaderCardConfig | null>(null);
  const [selectedPlayer, setSelectedPlayer] = useState<Player | null>(null);

  return (
    <div className="space-y-6">
      {/* Scope filter — always visible */}
      <div className="bg-ice-900 border border-ice-700 rounded-lg px-4 py-3">
        <div className="text-xs uppercase tracking-[0.2em] text-steel-400 mb-2">Scope</div>
        <ScopeFilter league={league} scope={scope} onChange={s => {
          // When scope changes, keep expanded view open but re-scope it
          setScope(s);
        }} />
      </div>

      {expandedConfig ? (
        <ExpandedStatView
          config={expandedConfig}
          league={league}
          scope={scope}
          onBack={() => setExpandedConfig(null)}
          onPlayerClick={setSelectedPlayer}
        />
      ) : (
        <>
          {/* Skater Leaders */}
          <div>
            <div className="text-xs uppercase tracking-[0.2em] text-steel-400 mb-3">Skater Leaders</div>
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
              {SKATER_CARDS.map(cfg => (
                <LeaderCard
                  key={cfg.title}
                  config={cfg}
                  league={league}
                  scope={scope}
                  onPlayerClick={setSelectedPlayer}
                  onExpand={setExpandedConfig}
                />
              ))}
            </div>
          </div>

          {/* Goalie Leaders */}
          <div>
            <div className="text-xs uppercase tracking-[0.2em] text-steel-400 mb-3">Goalie Leaders</div>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              {GOALIE_CARDS.map(cfg => (
                <LeaderCard
                  key={cfg.title}
                  config={cfg}
                  league={league}
                  scope={scope}
                  onPlayerClick={setSelectedPlayer}
                  onExpand={setExpandedConfig}
                />
              ))}
            </div>
          </div>
        </>
      )}

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
