import React, { useState, useEffect, useRef } from 'react';
import { BattleLog, BattleEvent, CombatMonsterState } from '../types/battle';
import { SPLINTER_BG_COLORS, RARITY_COLORS } from './CardPreview';
import { ABILITY_METAS } from '../data/abilities';
import {
  Play,
  Pause,
  SkipBack,
  SkipForward,
  RotateCcw,
  FastForward,
  ChevronsRight,
  ChevronsLeft,
  Zap,
  Heart,
  Shield,
  Wind,
  Swords,
  Sparkles,
  Crosshair,
  Skull,
  Award,
  Download,
  Copy,
  ChevronRight,
  ShieldAlert,
  Flame,
  ArrowLeft,
} from 'lucide-react';

interface BattleViewerProps {
  battleLog: BattleLog;
  onExit: () => void;
  onRematch?: () => void;
}

export const BattleViewer: React.FC<BattleViewerProps> = ({
  battleLog,
  onExit,
  onRematch,
}) => {
  const [currentEventIndex, setCurrentEventIndex] = useState<number>(0);
  const [isPlaying, setIsPlaying] = useState<boolean>(true);
  const [playbackSpeed, setPlaybackSpeed] = useState<number>(2); // 1x, 2x, 4x, 8x, 16x, 32x
  const [showRawJson, setShowRawJson] = useState<boolean>(false);

  const eventFeedRef = useRef<HTMLDivElement>(null);

  const events = battleLog.events;
  const currentEvent: BattleEvent | undefined = events[currentEventIndex] || events[0];

  // Auto-play timer with scalable speed
  useEffect(() => {
    let timer: any;
    if (isPlaying && currentEventIndex < events.length - 1) {
      // Speed scaling: 1x = 800ms, 2x = 400ms, 4x = 200ms, 8x = 100ms, 16x = 50ms, 32x = 20ms
      const delay = Math.max(20, Math.round(800 / playbackSpeed));
      timer = setTimeout(() => {
        setCurrentEventIndex((prev) => prev + 1);
      }, delay);
    } else if (currentEventIndex >= events.length - 1) {
      setIsPlaying(false);
    }
    return () => clearTimeout(timer);
  }, [isPlaying, currentEventIndex, events.length, playbackSpeed]);

  // Keyboard shortcut controls
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Avoid hotkeys when typing in inputs
      if (['INPUT', 'TEXTAREA', 'SELECT'].includes((e.target as HTMLElement)?.tagName)) {
        return;
      }
      if (e.code === 'Space') {
        e.preventDefault();
        setIsPlaying((prev) => !prev);
      } else if (e.code === 'ArrowRight') {
        e.preventDefault();
        handleStepForward();
      } else if (e.code === 'ArrowLeft') {
        e.preventDefault();
        handleStepBack();
      } else if (e.key === 'f' || e.key === 'F' || e.code === 'End') {
        e.preventDefault();
        handleJumpToEnd();
      } else if (e.code === 'Home') {
        e.preventDefault();
        handleJumpToStart();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [currentEventIndex, events.length]);

  // Auto-scroll event feed
  useEffect(() => {
    if (eventFeedRef.current) {
      eventFeedRef.current.scrollTop = eventFeedRef.current.scrollHeight;
    }
  }, [currentEventIndex]);

  const currentSnapshot = currentEvent?.boardSnapshot || {
    team1: battleLog.initialTeam1,
    team2: battleLog.initialTeam2,
  };

  const handleStepForward = () => {
    setIsPlaying(false);
    if (currentEventIndex < events.length - 1) {
      setCurrentEventIndex(currentEventIndex + 1);
    }
  };

  const handleStepBack = () => {
    setIsPlaying(false);
    if (currentEventIndex > 0) {
      setCurrentEventIndex(currentEventIndex - 1);
    }
  };

  const handleJumpToStart = () => {
    setIsPlaying(false);
    setCurrentEventIndex(0);
  };

  const handleJumpToEnd = () => {
    setIsPlaying(false);
    setCurrentEventIndex(events.length - 1);
  };

  const handleSkipRound = (direction: 'next' | 'prev') => {
    setIsPlaying(false);
    if (direction === 'next') {
      const nextRoundIdx = events.findIndex(
        (ev, idx) => idx > currentEventIndex && ev.type === 'ROUND_START'
      );
      if (nextRoundIdx !== -1) {
        setCurrentEventIndex(nextRoundIdx);
      } else {
        setCurrentEventIndex(events.length - 1);
      }
    } else {
      // Find previous ROUND_START
      for (let i = currentEventIndex - 1; i >= 0; i--) {
        if (events[i].type === 'ROUND_START') {
          setCurrentEventIndex(i);
          return;
        }
      }
      setCurrentEventIndex(0);
    }
  };

  const handleExportJson = () => {
    const data = JSON.stringify(battleLog, null, 2);
    const blob = new Blob([data], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `splinter_battle_log_${battleLog.id}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const isBattleFinished = currentEventIndex >= events.length - 1;

  // Render a combat monster card on the battlefield
  const renderBattlefieldMonster = (monster: CombatMonsterState, isOpponent: boolean) => {
    const isActor = currentEvent?.actorId === monster.instanceId;
    const isTarget = currentEvent?.targetId === monster.instanceId;
    const colors = SPLINTER_BG_COLORS[monster.splinter] || SPLINTER_BG_COLORS.Neutral;
    const healthPercent = Math.max(0, Math.min(100, (monster.currentHealth / monster.maxHealth) * 100));

    return (
      <div
        key={monster.instanceId}
        className={`relative w-40 sm:w-44 rounded-2xl border-2 transition-all duration-300 p-2.5 flex flex-col justify-between ${
          colors.border
        } bg-gradient-to-b ${colors.frame} ${
          isActor
            ? 'scale-105 ring-4 ring-amber-400 shadow-2xl shadow-amber-400/40 z-20 animate-pulse'
            : ''
        } ${
          isTarget
            ? 'scale-105 ring-4 ring-rose-500 shadow-2xl shadow-rose-500/40 z-20'
            : ''
        } ${!monster.isAlive ? 'opacity-30 grayscale saturate-0 pointer-events-none' : 'shadow-lg'}`}
      >
        {/* Top: Mana, Name, Position */}
        <div className="flex items-center justify-between gap-1 mb-1">
          <div className="flex items-center gap-1 min-w-0">
            <div className="w-5 h-5 rounded-full bg-blue-600 border border-cyan-300 text-white font-bold flex items-center justify-center text-[10px] shadow shrink-0">
              {monster.mana}
            </div>
            <span className="font-bold text-xs truncate text-slate-100" title={monster.name}>
              {monster.name}
            </span>
          </div>
          <div className="text-[9px] font-bold px-1 rounded bg-slate-900 border border-slate-700 text-amber-400 shrink-0">
            {monster.position === 0 ? 'TANK' : `#${monster.position + 1}`}
          </div>
        </div>

        {/* Artwork Box */}
        <div className="relative w-full h-20 rounded-lg overflow-hidden border border-slate-800 bg-slate-950 flex items-center justify-center mb-2">
          {monster.imageUrl ? (
            <img src={monster.imageUrl} alt={monster.name} className="w-full h-full object-cover" />
          ) : (
            <Zap className="w-7 h-7 text-slate-500" />
          )}

          {/* Status Badges Overlay */}
          <div className="absolute top-1 left-1 flex flex-col gap-0.5">
            {monster.hasDivineShield && (
              <span className="px-1 py-0.2 rounded bg-amber-500 text-black font-extrabold text-[8px] shadow">
                DIVINE
              </span>
            )}
            {monster.isPoisoned && (
              <span className="px-1 py-0.2 rounded bg-emerald-600 text-white font-extrabold text-[8px] shadow">
                POISON
              </span>
            )}
            {monster.isStunned && (
              <span className="px-1 py-0.2 rounded bg-yellow-500 text-black font-extrabold text-[8px] shadow">
                STUN
              </span>
            )}
            {monster.isAfflicted && (
              <span className="px-1 py-0.2 rounded bg-purple-700 text-white font-extrabold text-[8px] shadow">
                AFFLICT
              </span>
            )}
          </div>

          {!monster.isAlive && (
            <div className="absolute inset-0 bg-black/70 flex flex-col items-center justify-center text-rose-500 font-bold text-xs gap-1">
              <Skull className="w-6 h-6" />
              <span>FALLEN</span>
            </div>
          )}
        </div>

        {/* Stats Row */}
        <div className="grid grid-cols-4 gap-1 mb-1.5 text-center">
          {/* Attack */}
          <div className="bg-slate-900/90 rounded border border-slate-800 p-0.5">
            <div className="text-[8px] text-slate-400">ATK</div>
            <div className="text-xs font-bold text-orange-400">{monster.currentAttack}</div>
          </div>
          {/* Speed */}
          <div className="bg-slate-900/90 rounded border border-slate-800 p-0.5">
            <div className="text-[8px] text-slate-400">SPD</div>
            <div className="text-xs font-bold text-sky-400">{monster.currentSpeed}</div>
          </div>
          {/* Armor */}
          <div className="bg-slate-900/90 rounded border border-slate-800 p-0.5">
            <div className="text-[8px] text-slate-400">ARM</div>
            <div className="text-xs font-bold text-yellow-400">{monster.currentArmor}</div>
          </div>
          {/* Health */}
          <div className="bg-slate-900/90 rounded border border-slate-800 p-0.5">
            <div className="text-[8px] text-slate-400">HP</div>
            <div className="text-xs font-bold text-rose-400">{monster.currentHealth}</div>
          </div>
        </div>

        {/* Health & Armor Progress Bars */}
        <div className="space-y-1">
          {/* Health Bar */}
          <div className="w-full h-2 bg-slate-950 rounded-full overflow-hidden border border-slate-800 relative">
            <div
              className="h-full bg-gradient-to-r from-rose-600 to-rose-400 transition-all duration-300"
              style={{ width: `${healthPercent}%` }}
            />
          </div>
        </div>

        {/* Abilities tags */}
        {monster.abilities.length > 0 && (
          <div className="mt-1 flex flex-wrap gap-0.5 overflow-hidden">
            {monster.abilities.map((ab) => (
              <span
                key={ab}
                title={ABILITY_METAS[ab]?.description || ab}
                className="text-[8px] px-1 py-0.2 rounded bg-slate-900/90 border border-slate-700 text-slate-300"
              >
                {ab}
              </span>
            ))}
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="space-y-6">
      {/* Header & Controls Bar */}
      <div className="bg-slate-900/95 border border-slate-800 rounded-2xl p-4 shadow-xl flex flex-col md:flex-row items-center justify-between gap-4">
        {/* Left: Back & Battle Meta */}
        <div className="flex items-center gap-3">
          <button
            onClick={onExit}
            className="p-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 transition flex items-center gap-1 text-xs font-bold"
          >
            <ArrowLeft className="w-4 h-4" />
            Exit Viewer
          </button>
          <div>
            <div className="flex items-center gap-2">
              <span className="font-fantasy font-bold text-slate-100 text-lg">Battle Arena</span>
              <span className="text-xs px-2 py-0.5 rounded-full bg-blue-950 text-blue-300 border border-blue-700 font-bold">
                Round {currentEvent?.round || 1}
              </span>
            </div>
            <div className="text-xs text-slate-400 flex items-center gap-2 mt-0.5">
              <span>Event {currentEventIndex + 1} of {events.length}</span>
              <span>•</span>
              <div className="flex gap-1">
                {battleLog.rulesets.map((r) => (
                  <span key={r} className="text-rose-400 font-semibold">
                    [{r}]
                  </span>
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* Center: Playback & Skip Controls */}
        <div className="flex flex-wrap items-center justify-center gap-2 bg-slate-950/90 p-2 rounded-2xl border border-slate-800 shadow-inner">
          {/* Restart */}
          <button
            onClick={handleJumpToStart}
            className="p-2 rounded-xl bg-slate-900 hover:bg-slate-800 text-slate-300 transition"
            title="Restart from beginning (Home)"
          >
            <RotateCcw className="w-4 h-4" />
          </button>

          {/* Prev Round */}
          <button
            onClick={() => handleSkipRound('prev')}
            disabled={currentEventIndex === 0}
            className="px-2.5 py-1.5 rounded-xl bg-slate-900 hover:bg-slate-800 text-slate-300 disabled:opacity-30 transition flex items-center gap-1 text-xs font-semibold"
            title="Previous Round"
          >
            <ChevronsLeft className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Prev Rnd</span>
          </button>

          {/* Step Back */}
          <button
            onClick={handleStepBack}
            disabled={currentEventIndex === 0}
            className="p-2 rounded-xl bg-slate-900 hover:bg-slate-800 text-slate-300 disabled:opacity-30 transition"
            title="Step Backward (Left Arrow)"
          >
            <SkipBack className="w-4 h-4" />
          </button>

          {/* Play / Pause */}
          <button
            onClick={() => setIsPlaying(!isPlaying)}
            className={`px-4 py-2 rounded-xl font-bold flex items-center gap-1.5 transition text-xs uppercase tracking-wider ${
              isPlaying
                ? 'bg-amber-600 hover:bg-amber-500 text-white shadow-lg shadow-amber-600/30'
                : 'bg-rose-600 hover:bg-rose-500 text-white shadow-lg shadow-rose-600/30'
            }`}
            title="Play / Pause (Space)"
          >
            {isPlaying ? <Pause className="w-4 h-4 fill-current" /> : <Play className="w-4 h-4 fill-current" />}
            {isPlaying ? 'Pause' : 'Play'}
          </button>

          {/* Step Forward */}
          <button
            onClick={handleStepForward}
            disabled={isBattleFinished}
            className="p-2 rounded-xl bg-slate-900 hover:bg-slate-800 text-slate-300 disabled:opacity-30 transition"
            title="Step Forward (Right Arrow)"
          >
            <SkipForward className="w-4 h-4" />
          </button>

          {/* Next Round */}
          <button
            onClick={() => handleSkipRound('next')}
            disabled={isBattleFinished}
            className="px-2.5 py-1.5 rounded-xl bg-slate-900 hover:bg-slate-800 text-slate-300 disabled:opacity-30 transition flex items-center gap-1 text-xs font-semibold"
            title="Next Round"
          >
            <span className="hidden sm:inline">Next Rnd</span>
            <ChevronsRight className="w-3.5 h-3.5" />
          </button>

          {/* Skip Directly to Results */}
          <button
            onClick={handleJumpToEnd}
            disabled={isBattleFinished}
            className="px-3.5 py-2 rounded-xl bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 text-white font-extrabold shadow-lg shadow-purple-600/30 text-xs uppercase tracking-wider transition flex items-center gap-1.5 disabled:opacity-40"
            title="Skip Battle to Outcome (Key F / End)"
          >
            <FastForward className="w-4 h-4" />
            <span>Skip Battle</span>
          </button>

          {/* Speed selector */}
          <div className="flex items-center gap-1 border-l border-slate-800 pl-2">
            {[1, 2, 4, 8, 16, 32].map((spd) => (
              <button
                key={spd}
                onClick={() => setPlaybackSpeed(spd)}
                className={`px-2 py-1 rounded text-[11px] font-bold transition ${
                  playbackSpeed === spd
                    ? 'bg-blue-600 text-white shadow shadow-blue-500/50'
                    : 'bg-slate-900 text-slate-400 hover:text-slate-200'
                }`}
                title={`${spd === 32 ? 'Turbo/Max' : `${spd}x`} Speed`}
              >
                {spd === 32 ? 'MAX' : `${spd}x`}
              </button>
            ))}
          </div>
        </div>

        {/* Right: Export & JSON Log */}
        <div className="flex items-center gap-2">
          <button
            onClick={handleExportJson}
            className="px-3 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-xl border border-slate-700 text-xs font-semibold flex items-center gap-1"
            title="Export Battle Log JSON"
          >
            <Download className="w-3.5 h-3.5" />
            Export Log
          </button>
          <button
            onClick={() => setShowRawJson(!showRawJson)}
            className="px-3 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-xl border border-slate-700 text-xs font-semibold flex items-center gap-1"
          >
            <ChevronRight className="w-3.5 h-3.5" />
            {showRawJson ? 'Hide JSON' : 'View JSON'}
          </button>
        </div>
      </div>

      {/* PROGRESS TIMELINE SLIDER */}
      <div className="px-2">
        <input
          type="range"
          min="0"
          max={events.length - 1}
          value={currentEventIndex}
          onChange={(e) => {
            setIsPlaying(false);
            setCurrentEventIndex(parseInt(e.target.value));
          }}
          className="w-full accent-rose-500 bg-slate-800 h-2 rounded-lg cursor-pointer"
        />
      </div>

      {/* CURRENT TICKER / ACTION CALLOUT */}
      <div className="bg-gradient-to-r from-slate-900 via-slate-850 to-slate-900 border border-slate-700/80 rounded-2xl p-4 text-center shadow-lg">
        <div className="text-xs uppercase tracking-widest text-amber-400 font-extrabold mb-1">
          {currentEvent?.type.replace('_', ' ')}
        </div>
        <div className="text-base sm:text-lg font-bold text-slate-100 animate-fade-in">
          {currentEvent?.text || 'Battle in progress...'}
        </div>
      </div>

      {/* BATTLEFIELD BOARD */}
      <div className="bg-slate-950 border border-slate-800 rounded-3xl p-6 shadow-2xl space-y-8 relative overflow-hidden">
        {/* Background Arena Pattern */}
        <div className="absolute inset-0 opacity-5 pointer-events-none bg-[radial-gradient(#e11d48_1px,transparent_1px)] [background-size:16px_16px]" />

        {/* TEAM 2: OPPONENT TEAM (TOP / RED SIDE) */}
        <div className="space-y-2">
          <div className="flex items-center justify-between border-b border-rose-900/40 pb-2">
            <div className="flex items-center gap-2">
              <span className="w-3 h-3 rounded-full bg-rose-500 animate-pulse" />
              <h3 className="font-fantasy font-bold text-rose-400 text-base">
                Opponent: {battleLog.summoner2.name} (Lv {battleLog.summoner2.level})
              </h3>
            </div>
            <span className="text-xs text-rose-300 font-semibold">
              {currentSnapshot.team2.filter((m) => m.isAlive).length} / {battleLog.initialTeam2.length} Monsters Alive
            </span>
          </div>

          <div className="flex flex-wrap items-center justify-start gap-4 overflow-x-auto py-2">
            {currentSnapshot.team2.map((m) => renderBattlefieldMonster(m, true))}
          </div>
        </div>

        {/* VS ARENA DIVIDER */}
        <div className="flex items-center justify-center relative py-2">
          <div className="h-0.5 w-full bg-gradient-to-r from-blue-900 via-amber-500 to-rose-900" />
          <div className="absolute px-4 py-1 bg-slate-900 border border-amber-500/60 rounded-full text-amber-400 font-fantasy font-black text-xs shadow-xl tracking-wider">
            VS
          </div>
        </div>

        {/* TEAM 1: PLAYER TEAM (BOTTOM / BLUE SIDE) */}
        <div className="space-y-2">
          <div className="flex items-center justify-between border-b border-blue-900/40 pb-2">
            <div className="flex items-center gap-2">
              <span className="w-3 h-3 rounded-full bg-blue-500 animate-pulse" />
              <h3 className="font-fantasy font-bold text-blue-400 text-base">
                Player Team: {battleLog.summoner1.name} (Lv {battleLog.summoner1.level})
              </h3>
            </div>
            <span className="text-xs text-blue-300 font-semibold">
              {currentSnapshot.team1.filter((m) => m.isAlive).length} / {battleLog.initialTeam1.length} Monsters Alive
            </span>
          </div>

          <div className="flex flex-wrap items-center justify-start gap-4 overflow-x-auto py-2">
            {currentSnapshot.team1.map((m) => renderBattlefieldMonster(m, false))}
          </div>
        </div>
      </div>

      {/* EVENT HISTORY FEED */}
      <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-4 shadow-xl space-y-2">
        <h4 className="text-xs font-bold uppercase tracking-wider text-slate-400 flex items-center justify-between">
          <span>Splinterlands Battle Event Log</span>
          <span className="text-slate-500">Auto-scrolling stream</span>
        </h4>

        <div
          ref={eventFeedRef}
          className="h-44 overflow-y-auto space-y-1.5 p-2 bg-slate-950 rounded-xl border border-slate-800/80 font-mono text-xs"
        >
          {events.slice(0, currentEventIndex + 1).map((ev, idx) => {
            const isLatest = idx === currentEventIndex;
            let badgeColor = 'text-slate-400 bg-slate-900';
            if (ev.type.includes('DAMAGE') || ev.type === 'ATTACK') badgeColor = 'text-orange-400 bg-orange-950/60';
            if (ev.type === 'HEAL') badgeColor = 'text-emerald-400 bg-emerald-950/60';
            if (ev.type === 'DEATH') badgeColor = 'text-rose-400 bg-rose-950/80 font-bold';
            if (ev.type === 'MISS') badgeColor = 'text-sky-400 bg-sky-950/60';

            return (
              <div
                key={ev.id}
                className={`p-1.5 rounded flex items-center gap-2 transition ${
                  isLatest ? 'bg-slate-800/90 border-l-4 border-rose-500 text-slate-100' : 'text-slate-400 opacity-80'
                }`}
              >
                <span className="text-[10px] text-slate-500 shrink-0">R{ev.round}</span>
                <span className={`text-[10px] uppercase font-bold px-1.5 py-0.2 rounded shrink-0 ${badgeColor}`}>
                  {ev.type}
                </span>
                <span className="truncate">{ev.text}</span>
              </div>
            );
          })}
        </div>
      </div>

      {/* RAW JSON VIEWER */}
      {showRawJson && (
        <div className="bg-slate-950 border border-slate-800 rounded-2xl p-4 space-y-2">
          <div className="flex items-center justify-between">
            <h4 className="text-xs font-bold uppercase tracking-wider text-amber-400">
              Raw Splinterlands Battle Log JSON
            </h4>
            <button
              onClick={() => {
                navigator.clipboard.writeText(JSON.stringify(battleLog, null, 2));
                alert('Copied battle log JSON to clipboard!');
              }}
              className="px-2.5 py-1 bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs rounded flex items-center gap-1 font-semibold"
            >
              <Copy className="w-3.5 h-3.5" /> Copy JSON
            </button>
          </div>
          <pre className="max-h-72 overflow-y-auto p-3 bg-slate-900 rounded-xl text-[11px] text-emerald-300 font-mono">
            {JSON.stringify(battleLog, null, 2)}
          </pre>
        </div>
      )}

      {/* BATTLE END MODAL / BANNER */}
      {isBattleFinished && (
        <div className="bg-gradient-to-r from-slate-900 via-slate-800 to-slate-900 border-2 border-amber-500/80 rounded-3xl p-6 shadow-2xl text-center space-y-4">
          <Award className="w-12 h-12 text-amber-400 mx-auto animate-bounce" />
          <div>
            <h3 className="text-3xl font-black font-fantasy tracking-wide">
              {battleLog.winner === 1 ? (
                <span className="text-emerald-400">VICTORY ACHIEVED!</span>
              ) : battleLog.winner === 2 ? (
                <span className="text-rose-500">DEFEAT IN BATTLE!</span>
              ) : (
                <span className="text-yellow-400">STALEMATE / DRAW</span>
              )}
            </h3>
            <p className="text-slate-300 text-sm mt-1">
              The conflict concluded after <strong className="text-white">{battleLog.totalRounds} Rounds</strong>.
            </p>
          </div>

          <div className="flex items-center justify-center gap-3 pt-2">
            {onRematch && (
              <button
                onClick={onRematch}
                className="px-5 py-2.5 bg-rose-600 hover:bg-rose-500 text-white font-bold rounded-xl shadow-lg shadow-rose-600/30 text-xs uppercase tracking-wider transition"
              >
                Rematch / Adjust Lineup
              </button>
            )}
            <button
              onClick={onExit}
              className="px-5 py-2.5 bg-slate-800 hover:bg-slate-700 text-slate-200 font-bold rounded-xl border border-slate-700 text-xs uppercase tracking-wider transition"
            >
              Back to Challenges
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
