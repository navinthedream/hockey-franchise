'use client';

import { useEffect } from 'react';
import { Star } from 'lucide-react';
import { Player, League, isGoalie, SkaterAttributes, GoalieAttributes } from '@/lib/types';
import { ratingColor, teamById, formatSavePct, formatGAA } from '@/lib/utils';

// ── Attribute group definitions ───────────────────────────────────────────────

type SkaterGroupDef = { label: string; keys: (keyof SkaterAttributes)[] };
type GoalieGroupDef = { label: string; keys: (keyof GoalieAttributes)[] };

const SKATER_GROUPS: SkaterGroupDef[] = [
  { label: 'Puck Skills', keys: ['deking', 'handEye', 'passing', 'puckControl'] },
  { label: 'Senses',      keys: ['discipline', 'offAwareness', 'poise'] },
  { label: 'Shooting',    keys: ['slapShotAccuracy', 'slapShotPower', 'wristShotAccuracy', 'wristShotPower'] },
  { label: 'Defense',     keys: ['defAwareness', 'faceoffs', 'shotBlocking', 'stickChecking'] },
  { label: 'Skating',     keys: ['acceleration', 'agility', 'balance', 'endurance', 'speed'] },
  { label: 'Physical',    keys: ['aggressiveness', 'bodyChecking', 'durability', 'fightingSkill', 'strength'] },
];

const GOALIE_GROUPS: GoalieGroupDef[] = [
  { label: 'Positioning', keys: ['positioning', 'angles', 'fiveHole'] },
  { label: 'Reflexes',    keys: ['gloveSave', 'blockerSave', 'quickness'] },
  { label: 'Puck Play',   keys: ['reboundControl', 'puckHandling', 'passing'] },
  { label: 'Mental',      keys: ['poise', 'consistency', 'aggressiveness'] },
  { label: 'Physical',    keys: ['flexibility', 'endurance', 'durability'] },
];

// ── Helpers ────────────────────────────────────────────────────────────────────

function attrLabel(key: string): string {
  return key
    .replace(/([A-Z])/g, ' $1')
    .replace(/^./, s => s.toUpperCase())
    .replace('Slap Shot', 'Slap Shot')
    .replace('Wrist Shot', 'Wrist Shot')
    .replace('Off Awareness', 'Off. Awareness')
    .replace('Def Awareness', 'Def. Awareness')
    .trim();
}

function groupAverage(values: number[]): number {
  if (!values.length) return 0;
  return values.reduce((s, v) => s + v, 0) / values.length;
}

/** Map 0-99 average to 1-5 stars */
function toStars(avg: number): number {
  if (avg >= 85) return 5;
  if (avg >= 72) return 4;
  if (avg >= 60) return 3;
  if (avg >= 45) return 2;
  return 1;
}

// ── Sub-components ─────────────────────────────────────────────────────────────

function StarRating({ stars }: { stars: number }) {
  return (
    <span className="flex gap-0.5 items-center">
      {Array.from({ length: 5 }).map((_, i) => (
        <Star
          key={i}
          size={11}
          className={i < stars ? 'text-pp-gold fill-pp-gold' : 'text-ice-700 fill-ice-700'}
        />
      ))}
    </span>
  );
}

function AttrRow({ label, value }: { label: string; value: number }) {
  return (
    <div className="flex items-center justify-between gap-2 py-0.5">
      <span className="text-steel-300 text-xs truncate">{label}</span>
      <span className={`font-mono-stat text-sm font-semibold tabular-nums ${ratingColor(value)}`}>{value}</span>
    </div>
  );
}

function GroupCard({ label, values, attrLabels }: { label: string; values: number[]; attrLabels: string[] }) {
  const stars = toStars(groupAverage(values));
  return (
    <div className="bg-ice-850 border border-ice-700 rounded-lg p-3">
      <div className="flex items-center justify-between mb-2">
        <span className="text-xs uppercase tracking-[0.15em] text-steel-400 font-display">{label}</span>
        <StarRating stars={stars} />
      </div>
      <div className="space-y-0.5">
        {attrLabels.map((lbl, i) => (
          <AttrRow key={lbl} label={lbl} value={values[i]} />
        ))}
      </div>
    </div>
  );
}

// ── Season stats bar ───────────────────────────────────────────────────────────

function SkaterStats({ p }: { p: Player }) {
  const s = p.stats;
  const foPct = (s.faceoffWins + s.faceoffLosses) > 0
    ? ((s.faceoffWins / (s.faceoffWins + s.faceoffLosses)) * 100).toFixed(1)
    : null;

  const cells: { label: string; value: string }[] = [
    { label: 'GP',   value: String(s.gamesPlayed) },
    { label: 'G',    value: String(s.goals) },
    { label: 'A',    value: String(s.assists) },
    { label: 'PTS',  value: String(s.points) },
    { label: '+/−',  value: s.plusMinus >= 0 ? `+${s.plusMinus}` : String(s.plusMinus) },
    { label: 'PIM',  value: String(s.pim) },
    { label: 'HITS', value: String(s.hits) },
    { label: 'BLK',  value: String(s.blocks) },
    { label: 'TK',   value: String(s.takeaways) },
    ...(foPct !== null ? [{ label: 'FO%', value: `${foPct}%` }] : []),
  ];

  return (
    <div className="bg-ice-850 border border-ice-700 rounded-lg p-3">
      <div className="text-xs uppercase tracking-[0.15em] text-steel-400 font-display mb-2">Season Stats</div>
      <div className="grid grid-cols-5 sm:grid-cols-10 gap-1 text-center">
        {cells.map(c => (
          <div key={c.label}>
            <div className="text-xs text-steel-400">{c.label}</div>
            <div className="font-mono-stat text-sm text-ice-100">{c.value}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

function GoalieStats({ p }: { p: Player }) {
  const s = p.stats;
  const cells = [
    { label: 'GP',   value: String(s.gamesPlayed) },
    { label: 'W',    value: String(s.wins) },
    { label: 'L',    value: String(s.losses) },
    { label: 'OTL',  value: String(s.otLosses) },
    { label: 'SV%',  value: formatSavePct(s.saves, s.shotsAgainst) },
    { label: 'GAA',  value: formatGAA(s.goalsAgainst, s.gamesPlayed) },
    { label: 'SO',   value: String(s.shutouts) },
  ];
  return (
    <div className="bg-ice-850 border border-ice-700 rounded-lg p-3">
      <div className="text-xs uppercase tracking-[0.15em] text-steel-400 font-display mb-2">Season Stats</div>
      <div className="grid grid-cols-7 gap-1 text-center">
        {cells.map(c => (
          <div key={c.label}>
            <div className="text-xs text-steel-400">{c.label}</div>
            <div className="font-mono-stat text-sm text-ice-100">{c.value}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Main component ─────────────────────────────────────────────────────────────

export interface PlayerCardProps {
  player: Player;
  league: League;
  onClose: () => void;
}

export function PlayerCard({ player: p, league, onClose }: PlayerCardProps) {
  const team = p.teamId ? teamById(league, p.teamId) : undefined;

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    /* backdrop */
    <div
      className="fixed inset-0 z-50 flex items-start justify-center bg-ice-950/80 backdrop-blur-sm overflow-y-auto py-8 px-4"
      onClick={onClose}
    >
      {/* panel — stop propagation so clicks inside don't close */}
      <div
        className="relative w-full max-w-2xl bg-ice-900 border border-ice-700 rounded-xl shadow-2xl"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="px-5 pt-5 pb-4 border-b border-ice-700">
          <button
            onClick={onClose}
            className="absolute top-4 right-4 text-steel-400 hover:text-ice-100 transition-colors p-1"
            aria-label="Close"
          >
            {/* simple × */}
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
              <path d="M2 2l12 12M14 2L2 14" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
            </svg>
          </button>

          <div className="flex flex-wrap items-end gap-x-4 gap-y-1">
            <div>
              <div className="font-display text-2xl uppercase tracking-wide text-ice-100 leading-none">
                {p.firstName} {p.lastName}
              </div>
              <div className="text-sm text-steel-300 mt-0.5">{p.archetype}</div>
            </div>
            <div className="flex flex-wrap gap-3 text-xs font-mono-stat text-steel-300">
              <span><span className="text-steel-400">POS</span> {p.position}</span>
              <span><span className="text-steel-400">AGE</span> {p.age}</span>
              <span><span className="text-steel-400">HAND</span> {p.handedness}</span>
              <span className={`font-semibold ${ratingColor(p.overall)}`}>
                <span className="text-steel-400 font-normal">OVR </span>{p.overall}
              </span>
              <span className="text-steel-300">
                <span className="text-steel-400">POT </span>{p.potential}
              </span>
              {team && <span><span className="text-steel-400">TEAM</span> {team.abbreviation}</span>}
              <span>
                <span className="text-steel-400">AAV</span> ${p.contract.salaryAAV.toFixed(2)}M
                <span className="text-steel-400"> / </span>{p.contract.yearsRemaining}yr
              </span>
            </div>
          </div>
        </div>

        {/* Body */}
        <div className="p-5 space-y-4">
          {/* Season stats */}
          {isGoalie(p) ? <GoalieStats p={p} /> : <SkaterStats p={p} />}

          {/* Attribute groups */}
          <div>
            <div className="text-xs uppercase tracking-[0.15em] text-steel-400 font-display mb-2">Attributes</div>
            {isGoalie(p) ? (
              <div className="grid sm:grid-cols-2 gap-3">
                {GOALIE_GROUPS.map(g => (
                  <GroupCard
                    key={g.label}
                    label={g.label}
                    values={g.keys.map(k => (p.ratings as GoalieAttributes)[k])}
                    attrLabels={g.keys.map(attrLabel)}
                  />
                ))}
              </div>
            ) : (
              <div className="grid sm:grid-cols-2 gap-3">
                {SKATER_GROUPS.map(g => (
                  <GroupCard
                    key={g.label}
                    label={g.label}
                    values={g.keys.map(k => (p.ratings as SkaterAttributes)[k])}
                    attrLabels={g.keys.map(attrLabel)}
                  />
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
