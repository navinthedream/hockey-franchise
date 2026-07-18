import { Team, Player, SkaterPlayer, GoaliePlayer, GameEvent, GameResult, TeamBoxscore, isGoalie } from './types';
import { uid } from './generator';

function clamp01(n: number) {
  return Math.max(0.02, Math.min(0.98, n));
}
function avg(nums: number[]) {
  return nums.reduce((a, b) => a + b, 0) / (nums.length || 1);
}

interface RosterCtx {
  team: Team;
  skaters: SkaterPlayer[];
  forwardLines: SkaterPlayer[][];
  dPairs: SkaterPlayer[][];
  goalie: GoaliePlayer;
}

function buildCtx(team: Team, playerMap: Record<string, Player>): RosterCtx {
  const all = team.roster.map(id => playerMap[id]).filter(Boolean);
  const skaters = all.filter((p): p is SkaterPlayer => !isGoalie(p));
  const goalie = all.find((p): p is GoaliePlayer => isGoalie(p)) as GoaliePlayer;
  const forwardLines = team.lines.forwardLines.map(line => line.map(id => playerMap[id]).filter((p): p is SkaterPlayer => !!p && !isGoalie(p)));
  const dPairs = team.lines.dPairs.map(pair => pair.map(id => playerMap[id]).filter((p): p is SkaterPlayer => !!p && !isGoalie(p)));
  return { team, skaters, forwardLines, dPairs, goalie };
}

// ---------- Composite line ratings (used for possession/matchup strength) ----------
function lineAttack(line: SkaterPlayer[]) {
  if (!line.length) return 50;
  return avg(line.map(p =>
    p.ratings.passing * 0.24 + p.ratings.offAwareness * 0.22 + p.ratings.puckControl * 0.18 +
    p.ratings.deking * 0.14 + ((p.ratings.wristShotAccuracy + p.ratings.wristShotPower) / 2) * 0.22
  ));
}
function lineDefend(line: SkaterPlayer[]) {
  if (!line.length) return 50;
  return avg(line.map(p => p.ratings.defAwareness * 0.4 + p.ratings.stickChecking * 0.25 + p.ratings.strength * 0.15 + p.ratings.balance * 0.2));
}
function pairAttack(pair: SkaterPlayer[]) {
  if (!pair.length) return 45;
  return avg(pair.map(p =>
    p.ratings.passing * 0.3 + p.ratings.offAwareness * 0.25 +
    ((p.ratings.slapShotAccuracy + p.ratings.slapShotPower) / 2) * 0.25 + p.ratings.poise * 0.2
  ));
}
function pairDefend(pair: SkaterPlayer[]) {
  if (!pair.length) return 55;
  return avg(pair.map(p => p.ratings.defAwareness * 0.35 + p.ratings.shotBlocking * 0.25 + p.ratings.stickChecking * 0.2 + p.ratings.strength * 0.2));
}
function goalieDefendComposite(g: GoaliePlayer) {
  return g.ratings.positioning * 0.35 + g.ratings.angles * 0.3 + g.ratings.consistency * 0.2 + g.ratings.poise * 0.15;
}

const FWD_WEIGHTS = [0.35, 0.28, 0.22, 0.15];
const D_WEIGHTS = [0.45, 0.35, 0.2];
// D-pairs shoot far less often than forward lines (~28% of shots come from D in real hockey)
const D_SHOT_WEIGHTS = D_WEIGHTS.map(w => w * 0.42);

function pickWeightedIndex(weights: number[]): number {
  const total = weights.reduce((a, b) => a + b, 0);
  let r = Math.random() * total;
  for (let i = 0; i < weights.length; i++) {
    r -= weights[i];
    if (r <= 0) return i;
  }
  return weights.length - 1;
}
function pickWeightedPlayer(players: SkaterPlayer[], keyFn: (p: SkaterPlayer) => number): SkaterPlayer {
  const weights = players.map(p => Math.max(1, keyFn(p)));
  const total = weights.reduce((a, b) => a + b, 0);
  let r = Math.random() * total;
  for (let i = 0; i < players.length; i++) {
    r -= weights[i];
    if (r <= 0) return players[i];
  }
  return players[players.length - 1];
}
function fmtClock(secondsRemaining: number) {
  const m = Math.floor(secondsRemaining / 60);
  const s = Math.floor(secondsRemaining % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
}

const PENALTY_TYPES = [
  { name: 'Tripping', minutes: 2 }, { name: 'Hooking', minutes: 2 }, { name: 'Slashing', minutes: 2 },
  { name: 'Interference', minutes: 2 }, { name: 'High-sticking', minutes: 2 }, { name: 'Roughing', minutes: 2 },
];
const HIT_FLAVORS = [
  'lays a big hit along the boards', 'finishes the check hard into the corner',
  'delivers a thumping hit at center ice', 'flattens the puck carrier with a clean hit',
];

export function simulateGame(homeTeam: Team, awayTeam: Team, playerMap: Record<string, Player>, date: string): GameResult {
  const homeCtx = buildCtx(homeTeam, playerMap);
  const awayCtx = buildCtx(awayTeam, playerMap);

  const events: GameEvent[] = [];
  let scoreHome = 0, scoreAway = 0;
  let shotsHome = 0, shotsAway = 0;
  let pimHome = 0, pimAway = 0;
  const goalsHome: { playerId: string; assists: string[] }[] = [];
  const goalsAway: { playerId: string; assists: string[] }[] = [];
  let savesHomeGoalie = 0, savesAwayGoalie = 0;
  const hittersHome: Record<string, number> = {}, hittersAway: Record<string, number> = {};
  const blockersHome: Record<string, number> = {}, blockersAway: Record<string, number> = {};
  const faceoffHome: Record<string, { wins: number; losses: number }> = {};
  const faceoffAway: Record<string, { wins: number; losses: number }> = {};
  let hitsHome = 0, hitsAway = 0, blocksHome = 0, blocksAway = 0, foWinsHome = 0, foWinsAway = 0;

  function bumpCount(map: Record<string, number>, id: string) { map[id] = (map[id] ?? 0) + 1; }
  function bumpFO(map: Record<string, { wins: number; losses: number }>, id: string, won: boolean) {
    if (!map[id]) map[id] = { wins: 0, losses: 0 };
    if (won) map[id].wins++; else map[id].losses++;
    const p = playerMap[id] as SkaterPlayer | undefined;
    if (p && !isGoalie(p)) { if (won) p.stats.faceoffWins++; else p.stats.faceoffLosses++; }
  }

  let ppTicksFor: 'home' | 'away' | null = null;
  let ppTicksRemaining = 0;

  function pickShiftGroup(ctx: RosterCtx) {
    const fi = pickWeightedIndex(FWD_WEIGHTS);
    const di = pickWeightedIndex(D_WEIGHTS);
    return { line: ctx.forwardLines[fi] ?? ctx.forwardLines[0] ?? [], pair: ctx.dPairs[di] ?? ctx.dPairs[0] ?? [] };
  }

  function fatigueMult(line: SkaterPlayer[], pair: SkaterPlayer[], period: number) {
    if (period < 3) return 1;
    const group = [...line, ...pair];
    if (!group.length) return 1;
    const avgEnd = avg(group.map(p => p.ratings.endurance * 0.7 + p.ratings.durability * 0.3));
    return 1 + (avgEnd - 70) / 900; // small swing, ~ +-4% at extremes
  }

  function runTick(period: 1 | 2 | 3 | 4, remaining: number, isOT: boolean): 'goal-home' | 'goal-away' | null {
    const clock = fmtClock(remaining);
    if (ppTicksRemaining > 0) { ppTicksRemaining -= 1; if (ppTicksRemaining <= 0) ppTicksFor = null; }

    const roll = Math.random();

    // Penalty (~6%), offender weighted by low discipline + high aggressiveness
    if (roll < 0.06) {
      const offendingHome = Math.random() < 0.5;
      const ctx = offendingHome ? homeCtx : awayCtx;
      const offender = pickWeightedPlayer(ctx.skaters, p => (100 - p.ratings.discipline) * 0.6 + p.ratings.aggressiveness * 0.4);
      const infraction = PENALTY_TYPES[Math.floor(Math.random() * PENALTY_TYPES.length)];
      if (offendingHome) pimHome += infraction.minutes; else pimAway += infraction.minutes;
      offender.stats.pim += infraction.minutes;
      ppTicksFor = offendingHome ? 'away' : 'home';
      ppTicksRemaining = 4;
      events.push({
        period, clock, type: 'penalty', team: offendingHome ? 'home' : 'away',
        description: `${offender.firstName} ${offender.lastName} (${offendingHome ? homeTeam.abbreviation : awayTeam.abbreviation}) called for ${infraction.name}, ${infraction.minutes} min.`,
        scoreHome, scoreAway,
      });
      return null;
    }

    // Hit (~10%): hitter picked by bodyChecking+aggressiveness, target by puckControl (puck users get hit more)
    if (roll < 0.16) {
      const hittingHome = Math.random() < 0.5;
      const hitCtx = hittingHome ? homeCtx : awayCtx;
      const targetCtx = hittingHome ? awayCtx : homeCtx;
      const hitter = pickWeightedPlayer(hitCtx.skaters, p => p.ratings.bodyChecking * 0.6 + p.ratings.aggressiveness * 0.4);
      const target = pickWeightedPlayer(targetCtx.skaters, p => p.ratings.puckControl);
      const hitterPower = hitter.ratings.bodyChecking * 0.6 + hitter.ratings.strength * 0.4;
      const targetPower = target.ratings.balance * 0.6 + target.ratings.strength * 0.4;
      const landed = Math.random() < clamp01(0.5 + (hitterPower - targetPower) / 220);

      if (hittingHome) { hitsHome++; bumpCount(hittersHome, hitter.id); } else { hitsAway++; bumpCount(hittersAway, hitter.id); }
      hitter.stats.hits++;
      events.push({
        period, clock, type: 'hit', team: hittingHome ? 'home' : 'away',
        description: `${hitter.firstName} ${hitter.lastName} ${HIT_FLAVORS[Math.floor(Math.random() * HIT_FLAVORS.length)]}${landed ? ', forcing a turnover' : ''}.`,
        scoreHome, scoreAway,
      });

      // Rare fight: both need real fighting appetite
      if (landed && hitter.ratings.aggressiveness > 78 && Math.random() < 0.05) {
        const defender = pickWeightedPlayer(targetCtx.skaters, p => p.ratings.fightingSkill * 0.5 + p.ratings.aggressiveness * 0.5);
        const hitterFight = hitter.ratings.fightingSkill * 0.7 + hitter.ratings.strength * 0.3;
        const defFight = defender.ratings.fightingSkill * 0.7 + defender.ratings.strength * 0.3;
        const hitterWins = Math.random() < clamp01(0.5 + (hitterFight - defFight) / 150);
        [hitter, defender].forEach(p => { p.stats.pim += 5; p.stats.fightingMajors++; });
        if (hittingHome) pimHome += 5; else pimAway += 5;
        if (hittingHome) pimAway += 5; else pimHome += 5;
        events.push({
          period, clock, type: 'fight', team: hittingHome ? 'home' : 'away',
          description: `Fight! ${hitter.firstName} ${hitter.lastName} drops the gloves with ${defender.firstName} ${defender.lastName} — ${hitterWins ? hitter.lastName : defender.lastName} gets the better of it. Five minute majors.`,
          scoreHome, scoreAway,
        });
      }
      return null;
    }

    // Possession sequence: pick both teams' on-ice shift groups (a 5-skater matchup)
    const homeShift = pickShiftGroup(homeCtx);
    const awayShift = pickShiftGroup(awayCtx);
    const homeCenter = homeShift.line[1];
    const awayCenter = awayShift.line[1];

    const homeFatigue = fatigueMult(homeShift.line, homeShift.pair, period);
    const awayFatigue = fatigueMult(awayShift.line, awayShift.pair, period);

    const homeAttack = (lineAttack(homeShift.line) * 0.72 + pairAttack(homeShift.pair) * 0.28) * homeFatigue;
    const awayAttack = (lineAttack(awayShift.line) * 0.72 + pairAttack(awayShift.pair) * 0.28) * awayFatigue;
    const homeDefend = (lineDefend(homeShift.line) * 0.55 + pairDefend(homeShift.pair) * 0.3 + goalieDefendComposite(homeCtx.goalie) * 0.15) * homeFatigue;
    const awayDefend = (lineDefend(awayShift.line) * 0.55 + pairDefend(awayShift.pair) * 0.3 + goalieDefendComposite(awayCtx.goalie) * 0.15) * awayFatigue;

    // faceoff-flavored possession nudge (simplification: every shift begins with a contested puck touch)
    const foWinProbHome = clamp01(0.5 + ((homeCenter?.ratings.faceoffs ?? 50) - (awayCenter?.ratings.faceoffs ?? 50)) / 300 + 0.01);
    const homeWonFO = Math.random() < foWinProbHome;
    if (homeCenter) bumpFO(faceoffHome, homeCenter.id, homeWonFO);
    if (awayCenter) bumpFO(faceoffAway, awayCenter.id, !homeWonFO);
    if (homeWonFO) foWinsHome++; else foWinsAway++;

    let possessionProbHome = 0.5 + ((homeAttack - awayDefend) - (awayAttack - homeDefend)) / 220 + 0.015;
    possessionProbHome += homeWonFO ? 0.05 : -0.05;
    if (ppTicksFor === 'home') possessionProbHome += 0.22;
    if (ppTicksFor === 'away') possessionProbHome -= 0.22;
    possessionProbHome = clamp01(possessionProbHome);

    const isHomeAttempt = Math.random() < possessionProbHome;
    const offShift = isHomeAttempt ? homeShift : awayShift;
    const defShift = isHomeAttempt ? awayShift : homeShift;
    const defCtx = isHomeAttempt ? awayCtx : homeCtx;

    // Puck battle: does the attempt survive to become a shot?
    const attackGroup = [...offShift.line, ...offShift.pair];
    const defendGroup = [...defShift.line, ...defShift.pair];
    const attackContest = avg(attackGroup.map(p => p.ratings.puckControl * 0.4 + p.ratings.deking * 0.3 + p.ratings.agility * 0.3));
    const defendContest = avg(defendGroup.map(p => p.ratings.defAwareness * 0.55 + p.ratings.stickChecking * 0.45));
    const survives = Math.random() < clamp01(0.70 + (attackContest - defendContest) / 300 + (isOT ? 0.06 : 0));
    if (!survives) {
      const stealer = pickWeightedPlayer(defendGroup, p => p.ratings.stickChecking * 0.6 + p.ratings.defAwareness * 0.4);
      stealer.stats.takeaways++;
      return null; // turnover, no shot
    }

    // Pick shooter: forward line vs D pair, weighted; D shoots less often
    const useD = Math.random() < (D_SHOT_WEIGHTS.reduce((a, b) => a + b, 0) / (D_SHOT_WEIGHTS.reduce((a, b) => a + b, 0) + FWD_WEIGHTS.reduce((a, b) => a + b, 0)));
    const shootingPool = useD && offShift.pair.length ? offShift.pair : offShift.line;
    if (!shootingPool.length) return null;
    const isDShot = shootingPool === offShift.pair;
    const shotType: 'slap' | 'wrist' = isDShot ? (Math.random() < 0.7 ? 'slap' : 'wrist') : (Math.random() < 0.78 ? 'wrist' : 'slap');
    const accKey = shotType === 'slap' ? 'slapShotAccuracy' : 'wristShotAccuracy';
    const powKey = shotType === 'slap' ? 'slapShotPower' : 'wristShotPower';
    const shooter = pickWeightedPlayer(shootingPool, p => p.ratings[accKey] * 0.6 + p.ratings[powKey] * 0.4);

    if (isHomeAttempt) shotsHome++; else shotsAway++;

    // Shot blocking check (defending D pair specifically)
    const blockRating = defShift.pair.length ? avg(defShift.pair.map(p => p.ratings.shotBlocking)) : 45;
    const blockProb = clamp01(0.28 + (blockRating - 60) / 200);
    if (Math.random() < blockProb && defShift.pair.length) {
      const blocker = pickWeightedPlayer(defShift.pair, p => p.ratings.shotBlocking);
      blocker.stats.blocks++;
      if (isHomeAttempt) { blocksAway++; bumpCount(blockersAway, blocker.id); } else { blocksHome++; bumpCount(blockersHome, blocker.id); }
      // blocked shots still count in NHL shot-attempt totals but not shots-on-goal; back it out of SOG
      if (isHomeAttempt) shotsHome--; else shotsAway--;
      events.push({
        period, clock, type: 'block', team: isHomeAttempt ? 'away' : 'home',
        description: `${blocker.firstName} ${blocker.lastName} throws himself in front of the shot to block it.`,
        scoreHome, scoreAway,
      });
      return null;
    }

    const shooterQuality = shooter.ratings[accKey] * 0.55 + shooter.ratings[powKey] * 0.25 + shooter.ratings.offAwareness * 0.2
      + (isOT ? shooter.ratings.poise * 0.15 : 0);
    shooter.stats.shots++;
    const goalie = defCtx.goalie;
    const reflexAttr = shotType === 'slap' ? goalie.ratings.blockerSave : goalie.ratings.gloveSave;
    const goalieQuality = goalie.ratings.positioning * 0.3 + goalie.ratings.angles * 0.2 + reflexAttr * 0.3 + goalie.ratings.consistency * 0.2;

    let goalProb = (isOT ? 0.15 : 0.096) + (shooterQuality - goalieQuality) / 460;
    if ((isHomeAttempt && ppTicksFor === 'home') || (!isHomeAttempt && ppTicksFor === 'away')) goalProb += 0.055;
    goalProb = clamp01(goalProb);

    const scored = Math.random() < goalProb;
    if (scored) {
      recordGoal(isHomeAttempt, shooter, [...offShift.line, ...offShift.pair], [...defShift.line, ...defShift.pair], period, clock, false);
      return isHomeAttempt ? 'goal-home' : 'goal-away';
    }

    // Save
    if (isHomeAttempt) savesAwayGoalie++; else savesHomeGoalie++;
    events.push({
      period, clock, type: 'save', team: isHomeAttempt ? 'away' : 'home',
      description: `${goalie.firstName} ${goalie.lastName} makes the save on ${shooter.firstName} ${shooter.lastName}.`,
      scoreHome, scoreAway,
    });

    // Rebound chance
    const reboundProb = clamp01((shooterQuality - goalie.ratings.reboundControl) / 420 + 0.1);
    if (Math.random() < reboundProb) {
      const trailerPool = [...offShift.line, ...offShift.pair].filter(p => p.id !== shooter.id);
      if (trailerPool.length) {
        const trailer = pickWeightedPlayer(trailerPool, p => p.ratings.handEye * 0.6 + p.ratings.offAwareness * 0.4);
        const reboundGoalProb = clamp01(0.3 + (trailer.ratings.handEye - goalie.ratings.reboundControl) / 320);
        if (isHomeAttempt) shotsHome++; else shotsAway++;
        trailer.stats.shots++;
        if (Math.random() < reboundGoalProb) {
          recordGoal(isHomeAttempt, trailer, [shooter, ...trailerPool], [...defShift.line, ...defShift.pair], period, clock, true);
          return isHomeAttempt ? 'goal-home' : 'goal-away';
        } else {
          if (isHomeAttempt) savesAwayGoalie++; else savesHomeGoalie++;
          events.push({
            period, clock, type: 'save', team: isHomeAttempt ? 'away' : 'home',
            description: `${goalie.firstName} ${goalie.lastName} fights off the rebound chance from ${trailer.firstName} ${trailer.lastName}.`,
            scoreHome, scoreAway,
          });
        }
      }
    }
    return null;
  }

  function assistWeight(p: SkaterPlayer) {
    const isD = p.position === 'LD' || p.position === 'RD';
    return p.ratings.passing * (isD ? 0.82 : 1);
  }

  function recordGoal(isHome: boolean, shooter: SkaterPlayer, onIce: SkaterPlayer[], defOnIce: SkaterPlayer[], period: 1 | 2 | 3 | 4, clock: string, isRebound: boolean) {
    const teammates = onIce.filter(p => p.id !== shooter.id);
    const assists: SkaterPlayer[] = [];
    if (teammates.length && Math.random() < (isRebound ? 0.55 : 0.75)) assists.push(pickWeightedPlayer(teammates, assistWeight));
    if (teammates.length > 1 && !isRebound && Math.random() < 0.4) {
      const rem = teammates.filter(p => !assists.includes(p));
      if (rem.length) assists.push(pickWeightedPlayer(rem, assistWeight));
    }
    if (isHome) { scoreHome++; goalsHome.push({ playerId: shooter.id, assists: assists.map(a => a.id) }); }
    else { scoreAway++; goalsAway.push({ playerId: shooter.id, assists: assists.map(a => a.id) }); }
    shooter.stats.goals++; shooter.stats.points++;
    assists.forEach(a => { a.stats.assists++; a.stats.points++; });

    // Plus-minus: skip entirely for power-play goals (scoring team has the man-advantage).
    // Even-strength and shorthanded goals both count: +1 for every on-ice skater on the
    // scoring team, −1 for every on-ice skater on the conceding team. Goalies are never
    // included because onIce/defOnIce only contain SkaterPlayer[].
    const scoringTeamOnPP = (isHome && ppTicksFor === 'home') || (!isHome && ppTicksFor === 'away');
    if (!scoringTeamOnPP) {
      onIce.forEach(p => { p.stats.plusMinus++; });
      defOnIce.forEach(p => { p.stats.plusMinus--; });
    }
    const assistText = assists.length ? ` (assists: ${assists.map(a => `${a.firstName} ${a.lastName}`).join(', ')})` : ' (unassisted)';
    const tag = isRebound ? 'REBOUND GOAL' : 'GOAL';
    events.push({
      period, clock, type: 'goal', team: isHome ? 'home' : 'away',
      description: `${tag}! ${shooter.firstName} ${shooter.lastName} (${isHome ? homeTeam.abbreviation : awayTeam.abbreviation})${assistText}. ${scoreHome}-${scoreAway}`,
      scoreHome, scoreAway,
    });
  }

  function simulatePeriod(period: 1 | 2 | 3, lengthSeconds: number) {
    let elapsed = 0;
    while (elapsed < lengthSeconds) {
      const tick = 15 + Math.random() * 20;
      elapsed += tick;
      if (elapsed > lengthSeconds) break;
      runTick(period, lengthSeconds - elapsed, false);
    }
    events.push({ period, clock: '0:00', type: 'period-end', team: 'home', description: `End of period ${period}. Score: ${scoreHome}-${scoreAway}`, scoreHome, scoreAway });
  }

  simulatePeriod(1, 1200);
  simulatePeriod(2, 1200);
  simulatePeriod(3, 1200);

  let wentToOT = false, wentToShootout = false;
  let homeScoreForGA = scoreHome, awayScoreForGA = scoreAway;
  if (scoreHome === scoreAway) {
    wentToOT = true;
    let elapsed = 0;
    const lengthSeconds = 300;
    while (elapsed < lengthSeconds && scoreHome === scoreAway) {
      const tick = 15 + Math.random() * 25;
      elapsed += tick;
      if (elapsed > lengthSeconds) break;
      const outcome = runTick(4, lengthSeconds - elapsed, true);
      if (outcome) {
        events.push({
          period: 4, clock: fmtClock(lengthSeconds - elapsed), type: 'game-end', team: outcome === 'goal-home' ? 'home' : 'away',
          description: `OVERTIME WINNER! Final: ${scoreHome}-${scoreAway}`, scoreHome, scoreAway,
        });
      }
    }

    if (scoreHome === scoreAway) {
      wentToShootout = true;
      homeScoreForGA = scoreHome;
      awayScoreForGA = scoreAway;
      const homeShooters = homeCtx.skaters.slice().sort((a, b) => b.ratings.wristShotAccuracy - a.ratings.wristShotAccuracy).slice(0, 5);
      const awayShooters = awayCtx.skaters.slice().sort((a, b) => b.ratings.wristShotAccuracy - a.ratings.wristShotAccuracy).slice(0, 5);
      let homeSO = 0, awaySO = 0;
      const rounds = Math.max(homeShooters.length, awayShooters.length, 3);
      for (let i = 0; i < rounds && (i < 3 || homeSO === awaySO); i++) {
        const hs = homeShooters[i % homeShooters.length];
        const as = awayShooters[i % awayShooters.length];
        const hsQuality = hs.ratings.wristShotAccuracy * 0.6 + hs.ratings.deking * 0.25 + hs.ratings.poise * 0.15;
        const asQuality = as.ratings.wristShotAccuracy * 0.6 + as.ratings.deking * 0.25 + as.ratings.poise * 0.15;
        if (Math.random() < clamp01(0.3 + (hsQuality - awayCtx.goalie.ratings.gloveSave) / 300)) homeSO++;
        if (Math.random() < clamp01(0.3 + (asQuality - homeCtx.goalie.ratings.gloveSave) / 300)) awaySO++;
      }
      if (homeSO > awaySO) scoreHome++; else scoreAway++;
      events.push({
        period: 4, clock: '0:00', type: 'game-end', team: homeSO > awaySO ? 'home' : 'away',
        description: `Shootout: ${homeTeam.abbreviation} ${homeSO} - ${awayTeam.abbreviation} ${awaySO}. Final: ${scoreHome}-${scoreAway}`,
        scoreHome, scoreAway,
      });
    }
  }

  events.push({ period: 3, clock: '0:00', type: 'game-end', team: 'home', description: `FINAL: ${homeTeam.abbreviation} ${scoreHome} - ${awayTeam.abbreviation} ${scoreAway}`, scoreHome, scoreAway });

  // ---- Finalize per-player season stats directly on the shared player objects ----
  homeCtx.skaters.forEach(p => { p.stats.gamesPlayed++; });
  awayCtx.skaters.forEach(p => { p.stats.gamesPlayed++; });

  const homeWon = scoreHome > scoreAway;
  const homeGoalie = homeCtx.goalie, awayGoalie = awayCtx.goalie;
  if (homeGoalie) {
    homeGoalie.stats.gamesPlayed++;
    homeGoalie.stats.saves += savesHomeGoalie;
    homeGoalie.stats.goalsAgainst += awayScoreForGA;
    homeGoalie.stats.shotsAgainst += savesHomeGoalie + awayScoreForGA;
    if (awayScoreForGA === 0) homeGoalie.stats.shutouts++;
    if (homeWon) homeGoalie.stats.wins++;
    else if (wentToOT || wentToShootout) homeGoalie.stats.otLosses++;
    else homeGoalie.stats.losses++;
  }
  if (awayGoalie) {
    awayGoalie.stats.gamesPlayed++;
    awayGoalie.stats.saves += savesAwayGoalie;
    awayGoalie.stats.goalsAgainst += homeScoreForGA;
    awayGoalie.stats.shotsAgainst += savesAwayGoalie + homeScoreForGA;
    if (homeScoreForGA === 0) awayGoalie.stats.shutouts++;
    if (!homeWon) awayGoalie.stats.wins++;
    else if (wentToOT || wentToShootout) awayGoalie.stats.otLosses++;
    else awayGoalie.stats.losses++;
  }

  const homeBox: TeamBoxscore = {
    shots: shotsHome, pim: pimHome, hits: hitsHome, blocks: blocksHome, faceoffWins: foWinsHome,
    goalScorers: goalsHome.map(g => ({ playerId: g.playerId, goals: 1, assists: g.assists })),
    hitters: hittersHome, blockers: blockersHome, faceoffTakers: faceoffHome,
    goalieId: homeCtx.goalie?.id ?? '', saves: savesHomeGoalie, goalsAgainst: scoreAway,
  };
  const awayBox: TeamBoxscore = {
    shots: shotsAway, pim: pimAway, hits: hitsAway, blocks: blocksAway, faceoffWins: foWinsAway,
    goalScorers: goalsAway.map(g => ({ playerId: g.playerId, goals: 1, assists: g.assists })),
    hitters: hittersAway, blockers: blockersAway, faceoffTakers: faceoffAway,
    goalieId: awayCtx.goalie?.id ?? '', saves: savesAwayGoalie, goalsAgainst: scoreHome,
  };

  return {
    id: uid('result'), date, homeTeamId: homeTeam.id, awayTeamId: awayTeam.id,
    homeScore: scoreHome, awayScore: scoreAway, wentToOT, wentToShootout, events,
    boxscore: { home: homeBox, away: awayBox }, played: true,
  };
}
