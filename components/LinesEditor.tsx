'use client';

import { useState, useRef } from 'react';
import { League, Player, SkaterPlayer, Lines, isGoalie } from '@/lib/types';
import {
  ratingColor,
  lineAttackRating, lineDefendRating,
  pairAttackRating, pairDefendRating,
} from '@/lib/utils';
import { updateLines } from '@/lib/api';
import { PlayerCard } from './PlayerCard';

// ── Constants ──────────────────────────────────────────────────────────────────

const FWD_SLOT_LABELS = ['LW', 'C', 'RW'] as const;
const D_SLOT_LABELS   = ['LD', 'RD'] as const;
const GOALIE_LABELS   = ['Starter', 'Backup', '3rd'] as const;
// Approximate shift-share from simEngine FWD_WEIGHTS / D_WEIGHTS
const FWD_SHARE = ['35%', '28%', '22%', '15%'];
const D_SHARE   = ['45%', '35%', '20%'];

// ── Slot reference types ───────────────────────────────────────────────────────

type SlotRef =
  | { kind: 'fwd';      lineIdx: number; slotIdx: number }
  | { kind: 'd';        pairIdx: number; slotIdx: number }
  | { kind: 'goalie';   idx: number }
  | { kind: 'pressBox'; playerId: string };

function slotKey(r: SlotRef): string {
  if (r.kind === 'fwd')      return `fwd-${r.lineIdx}-${r.slotIdx}`;
  if (r.kind === 'd')        return `d-${r.pairIdx}-${r.slotIdx}`;
  if (r.kind === 'goalie')   return `goalie-${r.idx}`;
  return `pb-${r.playerId}`;
}
function sameSlot(a: SlotRef | null, b: SlotRef | null) {
  return !!a && !!b && slotKey(a) === slotKey(b);
}

// ── Lines helpers ──────────────────────────────────────────────────────────────

function cloneLines(l: Lines): Lines {
  return {
    forwardLines: l.forwardLines.map(x => [...x] as [string, string, string]),
    dPairs:       l.dPairs.map(x => [...x] as [string, string]),
    goalieRotation: [...l.goalieRotation],
  };
}

/** Get the player ID stored at a slot ref ('' if empty, playerId if pressBox). */
function idAt(lines: Lines, r: SlotRef): string {
  if (r.kind === 'fwd')      return lines.forwardLines[r.lineIdx]?.[r.slotIdx] ?? '';
  if (r.kind === 'd')        return lines.dPairs[r.pairIdx]?.[r.slotIdx] ?? '';
  if (r.kind === 'goalie')   return lines.goalieRotation[r.idx] ?? '';
  return r.playerId; // pressBox
}

/** Mutate `next` (a cloned Lines) by writing `id` to slot `r`. */
function writeSlot(next: Lines, r: SlotRef, id: string) {
  if (r.kind === 'fwd') {
    next.forwardLines[r.lineIdx][r.slotIdx] = id;
  } else if (r.kind === 'd') {
    next.dPairs[r.pairIdx][r.slotIdx] = id;
  } else if (r.kind === 'goalie') {
    if (id) {
      if (r.idx < next.goalieRotation.length) next.goalieRotation[r.idx] = id;
      else next.goalieRotation.push(id); // append to rotation
    } else {
      next.goalieRotation.splice(r.idx, 1); // remove empty slot
    }
  }
  // pressBox: computed, never written
}

function applySwap(prev: Lines, from: SlotRef, to: SlotRef): Lines {
  const next = cloneLines(prev);
  const fromId = idAt(next, from);
  const toId   = idAt(next, to);
  writeSlot(next, to,   fromId);
  writeSlot(next, from, toId);
  return next;
}

// ── Eligibility ────────────────────────────────────────────────────────────────

function isEligible(player: Player, kind: 'fwd' | 'd' | 'goalie'): boolean {
  if (isGoalie(player))           return kind === 'goalie';
  if (player.position === 'LD' || player.position === 'RD') return kind === 'd';
  return kind === 'fwd'; // C, LW, RW
}

function pressBoxPlayers(lines: Lines, roster: string[], playerMap: Record<string, Player>): Player[] {
  const slotted = new Set([
    ...lines.forwardLines.flat(),
    ...lines.dPairs.flat(),
    ...lines.goalieRotation,
  ].filter(Boolean));
  return roster.map(id => playerMap[id]).filter((p): p is Player => !!p && !slotted.has(p.id));
}

// ── SlotCell ───────────────────────────────────────────────────────────────────

function SlotCell({
  player, ref: slotRef, label,
  isSelected, isTarget, readOnly,
  onClick, onDragStart, onDragOver, onDrop,
}: {
  player: Player | undefined;
  ref: SlotRef;
  label: string;
  isSelected: boolean;
  isTarget: boolean;
  readOnly: boolean;
  onClick: (r: SlotRef) => void;
  onDragStart: (r: SlotRef) => void;
  onDragOver: (e: React.DragEvent) => void;
  onDrop: (r: SlotRef) => void;
}) {
  const borderCls = isSelected
    ? 'border-goal-red bg-goal-red-dim/20 ring-1 ring-goal-red/40'
    : isTarget
      ? 'border-steel-400 bg-ice-850'
      : player
        ? 'border-ice-700 bg-ice-900 hover:border-steel-400'
        : 'border-ice-700 border-dashed bg-ice-950/40';

  return (
    <div
      className={`border rounded-md px-2 py-1.5 w-[92px] shrink-0 select-none transition-colors
        ${borderCls} ${!readOnly ? 'cursor-pointer' : ''}`}
      onClick={() => !readOnly && onClick(slotRef)}
      draggable={!readOnly && !!player}
      onDragStart={() => !readOnly && player && onDragStart(slotRef)}
      onDragOver={e => { if (!readOnly) { e.preventDefault(); onDragOver(e); } }}
      onDrop={() => !readOnly && onDrop(slotRef)}
    >
      <div className="text-xs text-steel-400 font-mono-stat leading-none mb-0.5">{label}</div>
      {player ? (
        <>
          <div className="text-sm text-ice-100 leading-tight truncate font-medium">
            {player.firstName[0]}. {player.lastName}
          </div>
          <div className="flex items-center gap-1.5 mt-0.5">
            <span className="text-xs text-steel-400">{player.position}</span>
            <span className={`font-mono-stat text-xs font-semibold ${ratingColor(player.overall)}`}>
              {player.overall}
            </span>
          </div>
        </>
      ) : (
        <div className="text-xs text-ice-700 italic mt-0.5">Empty</div>
      )}
    </div>
  );
}

// ── Quality badge ──────────────────────────────────────────────────────────────

function QualBadge({ atk, def }: { atk: number; def: number }) {
  return (
    <div className="flex flex-col items-end shrink-0 w-[52px] gap-0.5">
      <span className="text-xs font-mono-stat text-win-teal leading-none whitespace-nowrap">
        {atk.toFixed(0)} ATK
      </span>
      <span className="text-xs font-mono-stat text-pp-gold leading-none whitespace-nowrap">
        {def.toFixed(0)} DEF
      </span>
    </div>
  );
}

// ── Forward line row ───────────────────────────────────────────────────────────

function FwdLineRow({ lineIdx, lines, playerMap, selected, readOnly, handlers }: {
  lineIdx: number; lines: Lines; playerMap: Record<string, Player>;
  selected: SlotRef | null; readOnly: boolean;
  handlers: SlotHandlers;
}) {
  const ids     = lines.forwardLines[lineIdx] ?? ['', '', ''];
  const players = ids.map(id => (id ? playerMap[id] : undefined));
  const skaters = players.filter((p): p is SkaterPlayer => !!p && !isGoalie(p));
  const atk = lineAttackRating(skaters);
  const def = lineDefendRating(skaters);

  const selPlayer = resolveSelected(selected, lines, playerMap);
  const showTarget = !readOnly && selPlayer && isEligible(selPlayer, 'fwd');

  return (
    <div className="flex items-center gap-2">
      <div className="w-12 shrink-0 text-right pr-1">
        <div className="text-xs font-display uppercase tracking-wide text-steel-400 leading-none">
          Line {lineIdx + 1}
        </div>
        <div className="text-xs text-ice-700 font-mono-stat leading-none mt-0.5">{FWD_SHARE[lineIdx]}</div>
      </div>
      <div className="flex gap-1.5">
        {FWD_SLOT_LABELS.map((lbl, si) => {
          const r: SlotRef = { kind: 'fwd', lineIdx, slotIdx: si };
          return (
            <SlotCell
              key={lbl} ref={r} label={lbl}
              player={players[si]}
              isSelected={sameSlot(selected, r)}
              isTarget={!!(showTarget && !sameSlot(selected, r))}
              readOnly={readOnly}
              {...handlers}
            />
          );
        })}
      </div>
      <QualBadge atk={atk} def={def} />
    </div>
  );
}

// ── D pair row ─────────────────────────────────────────────────────────────────

function DPairRow({ pairIdx, lines, playerMap, selected, readOnly, handlers }: {
  pairIdx: number; lines: Lines; playerMap: Record<string, Player>;
  selected: SlotRef | null; readOnly: boolean;
  handlers: SlotHandlers;
}) {
  const ids     = lines.dPairs[pairIdx] ?? ['', ''];
  const players = ids.map(id => (id ? playerMap[id] : undefined));
  const skaters = players.filter((p): p is SkaterPlayer => !!p && !isGoalie(p));
  const atk = pairAttackRating(skaters);
  const def = pairDefendRating(skaters);

  const selPlayer = resolveSelected(selected, lines, playerMap);
  const showTarget = !readOnly && selPlayer && isEligible(selPlayer, 'd');

  return (
    <div className="flex items-center gap-2">
      <div className="w-12 shrink-0 text-right pr-1">
        <div className="text-xs font-display uppercase tracking-wide text-steel-400 leading-none">
          Pair {pairIdx + 1}
        </div>
        <div className="text-xs text-ice-700 font-mono-stat leading-none mt-0.5">{D_SHARE[pairIdx]}</div>
      </div>
      <div className="flex gap-1.5">
        {D_SLOT_LABELS.map((lbl, si) => {
          const r: SlotRef = { kind: 'd', pairIdx, slotIdx: si };
          return (
            <SlotCell
              key={lbl} ref={r} label={lbl}
              player={players[si]}
              isSelected={sameSlot(selected, r)}
              isTarget={!!(showTarget && !sameSlot(selected, r))}
              readOnly={readOnly}
              {...handlers}
            />
          );
        })}
      </div>
      <QualBadge atk={atk} def={def} />
    </div>
  );
}

// ── Goalie rotation ────────────────────────────────────────────────────────────

function GoalieSection({ lines, playerMap, selected, readOnly, handlers }: {
  lines: Lines; playerMap: Record<string, Player>;
  selected: SlotRef | null; readOnly: boolean;
  handlers: SlotHandlers;
}) {
  const selPlayer = resolveSelected(selected, lines, playerMap);
  const showTarget = !readOnly && selPlayer && isEligible(selPlayer, 'goalie');
  // Show 3 slots always; extra press-box goalie can fill an empty 3rd slot
  const slotCount = 3;

  return (
    <div className="flex items-center gap-2 flex-wrap">
      <div className="w-12 shrink-0 text-right pr-1">
        <div className="text-xs font-display uppercase tracking-wide text-steel-400 leading-none">G</div>
      </div>
      <div className="flex gap-1.5 flex-wrap">
        {Array.from({ length: slotCount }, (_, idx) => {
          const id = lines.goalieRotation[idx] ?? '';
          const r: SlotRef = { kind: 'goalie', idx };
          return (
            <SlotCell
              key={idx} ref={r}
              label={GOALIE_LABELS[idx] ?? `G${idx + 1}`}
              player={id ? playerMap[id] : undefined}
              isSelected={sameSlot(selected, r)}
              isTarget={!!(showTarget && !sameSlot(selected, r))}
              readOnly={readOnly}
              {...handlers}
            />
          );
        })}
      </div>
    </div>
  );
}

// ── Press box ──────────────────────────────────────────────────────────────────

function PressBox({ players, selected, readOnly, onPlayerClick, onDragStart }: {
  players: Player[]; selected: SlotRef | null; readOnly: boolean;
  onPlayerClick: (r: SlotRef) => void;
  onDragStart: (r: SlotRef) => void;
}) {
  if (!players.length) {
    return (
      <div className="text-xs text-steel-400 italic">
        All players are assigned to a line.
      </div>
    );
  }
  return (
    <div className="flex flex-wrap gap-2">
      {players.map(p => {
        const r: SlotRef = { kind: 'pressBox', playerId: p.id };
        const isSel = sameSlot(selected, r);
        return (
          <div
            key={p.id}
            draggable={!readOnly}
            onDragStart={() => !readOnly && onDragStart(r)}
            onClick={() => !readOnly && onPlayerClick(r)}
            className={`px-2.5 py-1.5 rounded-md border select-none transition-colors
              ${!readOnly ? 'cursor-pointer' : ''}
              ${isSel ? 'border-goal-red bg-goal-red-dim/20 ring-1 ring-goal-red/40' : 'border-ice-700 bg-ice-900 hover:border-steel-400'}`}
          >
            <div className="text-sm text-ice-100 leading-none font-medium">
              {p.firstName[0]}. {p.lastName}
            </div>
            <div className="flex items-center gap-1.5 mt-0.5">
              <span className="text-xs text-steel-400">{p.position}</span>
              <span className={`font-mono-stat text-xs font-semibold ${ratingColor(p.overall)}`}>{p.overall}</span>
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ── Shared helper ──────────────────────────────────────────────────────────────

function resolveSelected(selected: SlotRef | null, lines: Lines, playerMap: Record<string, Player>): Player | undefined {
  if (!selected) return undefined;
  const id = idAt(lines, selected);
  return id ? playerMap[id] : undefined;
}

interface SlotHandlers {
  onClick: (r: SlotRef) => void;
  onDragStart: (r: SlotRef) => void;
  onDragOver: (e: React.DragEvent) => void;
  onDrop: (r: SlotRef) => void;
}

// ── Main component ─────────────────────────────────────────────────────────────

export function LinesEditor({ league, userTeamId }: { league: League; userTeamId: string }) {
  const userTeam = league.teams.find(t => t.id === userTeamId)!;

  // Which team's lines are shown
  const [viewingTeamId, setViewingTeamId] = useState(userTeamId);
  const isEditable = viewingTeamId === userTeamId;

  // Optimistic local lines for the user's team
  const [localLines, setLocalLines] = useState<Lines>(() => cloneLines(userTeam.lines));

  // Interaction state
  const [selected,       setSelected]       = useState<SlotRef | null>(null);
  const [selectedPlayer, setSelectedPlayer] = useState<Player | null>(null);
  const dragRef    = useRef<SlotRef | null>(null);
  const saveTimer  = useRef<ReturnType<typeof setTimeout> | null>(null);

  const displayTeam  = league.teams.find(t => t.id === viewingTeamId)!;
  const displayLines = isEditable ? localLines : displayTeam.lines;

  // ── Save (debounced) ──────────────────────────────────────────────────────────

  function scheduleSave(lines: Lines) {
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => {
      updateLines(userTeamId, lines).catch(console.error);
    }, 1000);
  }

  // ── Swap logic ────────────────────────────────────────────────────────────────

  function canSwap(from: SlotRef, to: SlotRef): boolean {
    const fromPlayer = resolveSelected(from, localLines, league.players);
    const toPlayer   = resolveSelected(to,   localLines, league.players);
    const toKind   = to.kind   === 'pressBox' ? null : to.kind;
    const fromKind = from.kind === 'pressBox' ? null : from.kind;
    if (fromPlayer && toKind   && !isEligible(fromPlayer, toKind))   return false;
    if (toPlayer   && fromKind && !isEligible(toPlayer,   fromKind)) return false;
    return true;
  }

  function doSwap(from: SlotRef, to: SlotRef) {
    if (sameSlot(from, to)) return;
    if (!canSwap(from, to)) return;
    const next = applySwap(localLines, from, to);
    setLocalLines(next);
    scheduleSave(next);
  }

  // ── Click handler ─────────────────────────────────────────────────────────────

  function handleClick(ref: SlotRef) {
    if (!isEditable) return;

    if (!selected) {
      // First click: select if slot has a player
      const id = idAt(localLines, ref);
      if (id || ref.kind === 'pressBox') setSelected(ref);
      return;
    }

    if (sameSlot(selected, ref)) {
      // Clicked the same player again → open PlayerCard
      const id = idAt(localLines, ref);
      if (id) setSelectedPlayer(league.players[id] ?? null);
      setSelected(null);
      return;
    }

    // Different target: try to swap; if ineligible just move selection
    if (canSwap(selected, ref)) {
      doSwap(selected, ref);
      setSelected(null);
    } else {
      // Change selection to clicked player (if there is one)
      const id = idAt(localLines, ref);
      setSelected(id || ref.kind === 'pressBox' ? ref : null);
    }
  }

  // ── Drag handlers ─────────────────────────────────────────────────────────────

  function handleDragStart(r: SlotRef) { dragRef.current = r; }
  function handleDragOver(e: React.DragEvent) { e.preventDefault(); }
  function handleDrop(target: SlotRef) {
    if (dragRef.current && !sameSlot(dragRef.current, target)) {
      doSwap(dragRef.current, target);
    }
    dragRef.current = null;
    setSelected(null);
  }

  const handlers: SlotHandlers = {
    onClick:    handleClick,
    onDragStart: handleDragStart,
    onDragOver: handleDragOver,
    onDrop:     handleDrop,
  };

  // ── Press box for displayed team ──────────────────────────────────────────────

  const pb = pressBoxPlayers(displayLines, displayTeam.roster, league.players);

  // ── Render ────────────────────────────────────────────────────────────────────

  return (
    <div className="space-y-5">
      {/* Team selector */}
      <div className="flex items-center gap-2 flex-wrap">
        <button
          onClick={() => { setViewingTeamId(userTeamId); setSelected(null); }}
          className={`px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
            isEditable
              ? 'bg-goal-red text-ice-100'
              : 'bg-ice-800 text-steel-300 border border-ice-700 hover:border-steel-400'
          }`}
        >
          My Team
        </button>
        <select
          value={isEditable ? '' : viewingTeamId}
          onChange={e => {
            if (e.target.value) { setViewingTeamId(e.target.value); setSelected(null); }
          }}
          className="bg-ice-800 border border-ice-700 rounded-md text-sm text-steel-300 px-3 py-1.5 hover:border-steel-400 cursor-pointer"
        >
          <option value="">Browse another team…</option>
          {[...league.teams]
            .filter(t => t.id !== userTeamId)
            .sort((a, b) => a.abbreviation.localeCompare(b.abbreviation))
            .map(t => (
              <option key={t.id} value={t.id} className="bg-ice-900 text-ice-100">
                {t.abbreviation} — {t.city} {t.name}
              </option>
            ))}
        </select>
        {!isEditable && (
          <span className="text-xs text-steel-400 border border-ice-700 rounded px-2 py-0.5 font-mono-stat">
            Read-only
          </span>
        )}
        {isEditable && selected && (
          <button
            onClick={() => setSelected(null)}
            className="text-xs text-steel-400 hover:text-ice-100 transition-colors ml-1"
          >
            ✕ clear selection
          </button>
        )}
      </div>

      {isEditable && (
        <p className="text-xs text-steel-400">
          Click a player to select, then click any compatible slot to move them. Click the same player twice to view their card.
          Drag-and-drop also works.
        </p>
      )}

      {/* Forwards */}
      <div className="bg-ice-900 border border-ice-700 rounded-lg overflow-hidden">
        <div className="px-4 py-3 border-b border-ice-700 text-xs uppercase tracking-[0.2em] text-steel-400 font-display">
          Forwards
        </div>
        <div className="p-4 space-y-3 overflow-x-auto">
          {Array.from({ length: 4 }, (_, i) => (
            <FwdLineRow
              key={i} lineIdx={i}
              lines={displayLines} playerMap={league.players}
              selected={isEditable ? selected : null}
              readOnly={!isEditable}
              handlers={handlers}
            />
          ))}
        </div>
      </div>

      {/* Defense */}
      <div className="bg-ice-900 border border-ice-700 rounded-lg overflow-hidden">
        <div className="px-4 py-3 border-b border-ice-700 text-xs uppercase tracking-[0.2em] text-steel-400 font-display">
          Defense
        </div>
        <div className="p-4 space-y-3 overflow-x-auto">
          {Array.from({ length: 3 }, (_, i) => (
            <DPairRow
              key={i} pairIdx={i}
              lines={displayLines} playerMap={league.players}
              selected={isEditable ? selected : null}
              readOnly={!isEditable}
              handlers={handlers}
            />
          ))}
        </div>
      </div>

      {/* Goalies */}
      <div className="bg-ice-900 border border-ice-700 rounded-lg overflow-hidden">
        <div className="px-4 py-3 border-b border-ice-700 text-xs uppercase tracking-[0.2em] text-steel-400 font-display">
          Goalie Rotation
        </div>
        <div className="p-4 overflow-x-auto">
          <GoalieSection
            lines={displayLines} playerMap={league.players}
            selected={isEditable ? selected : null}
            readOnly={!isEditable}
            handlers={handlers}
          />
        </div>
      </div>

      {/* Press box */}
      <div className="bg-ice-900 border border-ice-700 rounded-lg overflow-hidden">
        <div className="px-4 py-3 border-b border-ice-700 text-xs uppercase tracking-[0.2em] text-steel-400 font-display">
          Press Box
          {pb.length > 0 && (
            <span className="ml-2 text-ice-700">· {pb.length}</span>
          )}
        </div>
        <div className="p-4">
          <PressBox
            players={pb}
            selected={isEditable ? selected : null}
            readOnly={!isEditable}
            onPlayerClick={handleClick}
            onDragStart={handleDragStart}
          />
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
