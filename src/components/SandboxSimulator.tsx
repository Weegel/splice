import React, { useState } from 'react';
import { CardDefinition, Splinter } from '../types/card';
import { RulesetName, RULESET_METADATA, ALL_SPLINTERS } from '../types/ruleset';
import { TeamSelection, BattleLog } from '../types/battle';
import { BattleEngine } from '../engine/battleEngine';
import { CardPreview } from './CardPreview';
import {
  FlaskConical,
  Play,
  Zap,
  ShieldAlert,
  Plus,
  Trash2,
  RefreshCw,
  BarChart3,
  Check,
  X,
  Swords,
} from 'lucide-react';

interface SandboxSimulatorProps {
  cards: CardDefinition[];
  onLaunchVisualBattle: (battleLog: BattleLog) => void;
}

export const SandboxSimulator: React.FC<SandboxSimulatorProps> = ({
  cards,
  onLaunchVisualBattle,
}) => {
  const summoners = cards.filter((c) => c.cardType === 'Summoner');
  const monsters = cards.filter((c) => c.cardType === 'Monster');

  const [manaCap, setManaCap] = useState<number>(30);
  const [selectedRulesets, setSelectedRulesets] = useState<RulesetName[]>(['Standard']);

  // Team 1 setup
  const [team1SummonerId, setTeam1SummonerId] = useState<string>(summoners[0]?.id || cards[0]?.id);
  const [team1SummonerLevel, setTeam1SummonerLevel] = useState<number>(1);
  const [team1Monsters, setTeam1Monsters] = useState<{ cardId: string; level: number }[]>([
    { cardId: monsters[0]?.id || cards[0]?.id, level: 1 },
    { cardId: monsters[1]?.id || cards[0]?.id, level: 1 },
  ]);

  // Team 2 setup
  const [team2SummonerId, setTeam2SummonerId] = useState<string>(summoners[1]?.id || summoners[0]?.id || cards[0]?.id);
  const [team2SummonerLevel, setTeam2SummonerLevel] = useState<number>(1);
  const [team2Monsters, setTeam2Monsters] = useState<{ cardId: string; level: number }[]>([
    { cardId: monsters[2]?.id || cards[0]?.id, level: 1 },
    { cardId: monsters[3]?.id || cards[0]?.id, level: 1 },
  ]);

  // Monte Carlo Simulation stats state
  const [simResults, setSimResults] = useState<{
    simulations: number;
    team1Wins: number;
    team2Wins: number;
    draws: number;
    avgRounds: number;
  } | null>(null);

  // Card selector modal
  const [pickerState, setPickerState] = useState<{
    isOpen: boolean;
    team: 1 | 2;
    slot: 'summoner' | number;
  }>({ isOpen: false, team: 1, slot: 'summoner' });

  const toggleRuleset = (name: RulesetName) => {
    const list = [...selectedRulesets];
    const idx = list.indexOf(name);
    if (idx >= 0) {
      list.splice(idx, 1);
      if (list.length === 0) list.push('Standard');
    } else {
      if (list.includes('Standard')) {
        list.splice(list.indexOf('Standard'), 1);
      }
      list.push(name);
    }
    setSelectedRulesets(list);
  };

  const runVisualBattle = () => {
    if (team1Monsters.length === 0 || team2Monsters.length === 0) {
      alert('Both teams must have at least 1 monster.');
      return;
    }

    const t1: TeamSelection = {
      summonerId: team1SummonerId,
      summonerLevel: team1SummonerLevel,
      monsters: team1Monsters,
    };
    const t2: TeamSelection = {
      summonerId: team2SummonerId,
      summonerLevel: team2SummonerLevel,
      monsters: team2Monsters,
    };

    const engine = new BattleEngine(cards, selectedRulesets, manaCap, t1, t2);
    const log = engine.resolve();
    onLaunchVisualBattle(log);
  };

  const runMonteCarloSimulation = (count = 100) => {
    if (team1Monsters.length === 0 || team2Monsters.length === 0) {
      alert('Both teams must have at least 1 monster.');
      return;
    }

    const t1: TeamSelection = {
      summonerId: team1SummonerId,
      summonerLevel: team1SummonerLevel,
      monsters: team1Monsters,
    };
    const t2: TeamSelection = {
      summonerId: team2SummonerId,
      summonerLevel: team2SummonerLevel,
      monsters: team2Monsters,
    };

    let team1Wins = 0;
    let team2Wins = 0;
    let draws = 0;
    let totalRounds = 0;

    for (let i = 0; i < count; i++) {
      const engine = new BattleEngine(cards, selectedRulesets, manaCap, t1, t2, undefined, {
        seed: Date.now() + i * 137,
      });
      const log = engine.resolve();
      totalRounds += log.totalRounds;
      if (log.winner === 1) team1Wins++;
      else if (log.winner === 2) team2Wins++;
      else draws++;
    }

    setSimResults({
      simulations: count,
      team1Wins,
      team2Wins,
      draws,
      avgRounds: parseFloat((totalRounds / count).toFixed(1)),
    });
  };

  const renderTeamSetup = (teamIndex: 1 | 2) => {
    const isTeam1 = teamIndex === 1;
    const summonerId = isTeam1 ? team1SummonerId : team2SummonerId;
    const summoner = cards.find((c) => c.id === summonerId);
    const monsterList = isTeam1 ? team1Monsters : team2Monsters;
    const setMonsterList = isTeam1 ? setTeam1Monsters : setTeam2Monsters;

    return (
      <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-4 space-y-4 shadow-xl">
        <div className="flex items-center justify-between border-b border-slate-800 pb-2">
          <h3
            className={`font-fantasy font-bold text-base ${
              isTeam1 ? 'text-blue-400' : 'text-rose-400'
            }`}
          >
            {isTeam1 ? 'Team 1 (Blue / Player)' : 'Team 2 (Red / Enemy)'}
          </h3>
          <button
            onClick={() => {
              if (monsterList.length < 6) {
                setMonsterList([...monsterList, { cardId: monsters[0]?.id || cards[0]?.id, level: 1 }]);
              }
            }}
            disabled={monsterList.length >= 6}
            className="px-2.5 py-1 bg-slate-800 hover:bg-slate-700 disabled:opacity-30 text-xs font-bold rounded-lg text-slate-200 flex items-center gap-1"
          >
            <Plus className="w-3.5 h-3.5" /> Add Monster
          </button>
        </div>

        {/* Summoner Slot */}
        <div className="p-3 bg-slate-950 rounded-xl border border-slate-800 flex items-center justify-between gap-2">
          <div>
            <div className="text-[10px] text-amber-400 font-bold uppercase">Summoner</div>
            <div className="font-bold text-sm text-slate-200">{summoner?.name}</div>
          </div>
          <button
            onClick={() => setPickerState({ isOpen: true, team: teamIndex, slot: 'summoner' })}
            className="px-3 py-1 bg-slate-800 hover:bg-slate-700 text-xs font-semibold rounded-lg text-amber-400 border border-slate-700"
          >
            Change
          </button>
        </div>

        {/* Monsters List */}
        <div className="space-y-2">
          {monsterList.map((slot, idx) => {
            const card = cards.find((c) => c.id === slot.cardId);
            const isTank = idx === 0;

            return (
              <div
                key={idx}
                className="p-2.5 bg-slate-950 border border-slate-800 rounded-xl flex items-center justify-between gap-2 text-xs"
              >
                <div className="flex items-center gap-2 min-w-0">
                  <span
                    className={`w-6 h-6 rounded flex items-center justify-center font-bold text-[10px] shrink-0 ${
                      isTank ? 'bg-amber-600 text-white' : 'bg-slate-800 text-slate-300'
                    }`}
                  >
                    #{idx + 1}
                  </span>
                  <div className="truncate">
                    <span className="font-bold text-slate-200">{card?.name}</span>
                    <span className="text-slate-500 text-[10px] block">
                      {card?.stats[0]?.attack} {card?.stats[0]?.attackType} • {card?.stats[0]?.health} HP
                    </span>
                  </div>
                </div>

                <div className="flex items-center gap-1.5 shrink-0">
                  <button
                    onClick={() => setPickerState({ isOpen: true, team: teamIndex, slot: idx })}
                    className="px-2 py-0.5 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded font-semibold text-[11px]"
                  >
                    Change
                  </button>
                  {monsterList.length > 1 && (
                    <button
                      onClick={() => setMonsterList(monsterList.filter((_, i) => i !== idx))}
                      className="p-1 text-rose-400 hover:text-rose-300"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    );
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-5 shadow-xl flex flex-col md:flex-row items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold font-fantasy text-slate-100 flex items-center gap-2">
            <FlaskConical className="w-6 h-6 text-purple-400" />
            Sandbox Battle Simulator
          </h2>
          <p className="text-sm text-slate-400 mt-0.5">
            Test any custom card, team composition, ruleset, or run Monte Carlo 100x statistical simulations.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            onClick={() => runMonteCarloSimulation(100)}
            className="flex items-center gap-1.5 px-4 py-2 bg-purple-600 hover:bg-purple-500 text-white font-bold rounded-xl transition shadow-lg shadow-purple-600/30 text-xs uppercase tracking-wider"
          >
            <BarChart3 className="w-4 h-4" />
            Simulate 100x Battles
          </button>
          <button
            onClick={runVisualBattle}
            className="flex items-center gap-1.5 px-5 py-2 bg-gradient-to-r from-rose-600 to-amber-600 hover:from-rose-500 hover:to-amber-500 text-white font-black rounded-xl transition shadow-lg shadow-rose-600/30 text-xs uppercase tracking-wider"
          >
            <Play className="w-4 h-4 fill-current" />
            Launch Visual Arena
          </button>
        </div>
      </div>

      {/* Rules & Mana Cap Setup Bar */}
      <div className="bg-slate-900/80 border border-slate-800 rounded-2xl p-4 space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <label className="text-xs font-bold text-slate-300">Mana Cap:</label>
            <input
              type="number"
              min="10"
              max="99"
              value={manaCap}
              onChange={(e) => setManaCap(parseInt(e.target.value) || 20)}
              className="bg-slate-950 border border-slate-700 text-slate-200 text-xs font-bold rounded px-2.5 py-1 w-20 text-center"
            />
          </div>

          <div className="flex-1 flex flex-wrap gap-1.5 items-center justify-end">
            <span className="text-xs text-slate-400 font-bold mr-1">Active Rulesets:</span>
            {selectedRulesets.map((r) => (
              <span
                key={r}
                className="px-2 py-0.5 rounded bg-rose-950 border border-rose-500 text-rose-300 text-[11px] font-bold"
              >
                {r}
              </span>
            ))}
          </div>
        </div>

        {/* Quick Ruleset Toggle Row */}
        <div className="grid grid-cols-2 sm:grid-cols-4 md:grid-cols-6 gap-1.5 pt-2 border-t border-slate-800">
          {(Object.keys(RULESET_METADATA) as RulesetName[]).slice(0, 12).map((r) => {
            const active = selectedRulesets.includes(r);
            return (
              <button
                key={r}
                onClick={() => toggleRuleset(r)}
                className={`px-2 py-1 rounded text-[10px] font-bold border truncate transition ${
                  active
                    ? 'bg-rose-900/80 border-rose-500 text-white'
                    : 'bg-slate-950 border-slate-800 text-slate-400 hover:text-slate-200'
                }`}
              >
                {r}
              </button>
            );
          })}
        </div>
      </div>

      {/* Monte Carlo Stats Callout */}
      {simResults && (
        <div className="bg-gradient-to-r from-purple-950/60 via-slate-900 to-indigo-950/60 border border-purple-500/50 rounded-2xl p-5 shadow-xl flex flex-col md:flex-row items-center justify-around gap-4 text-center">
          <div>
            <div className="text-xs uppercase tracking-widest text-purple-300 font-bold">Simulations Run</div>
            <div className="text-2xl font-black text-white">{simResults.simulations} Battles</div>
          </div>
          <div>
            <div className="text-xs uppercase tracking-widest text-blue-400 font-bold">Team 1 Win Rate</div>
            <div className="text-3xl font-black text-blue-300">
              {((simResults.team1Wins / simResults.simulations) * 100).toFixed(1)}%
            </div>
          </div>
          <div>
            <div className="text-xs uppercase tracking-widest text-rose-400 font-bold">Team 2 Win Rate</div>
            <div className="text-3xl font-black text-rose-300">
              {((simResults.team2Wins / simResults.simulations) * 100).toFixed(1)}%
            </div>
          </div>
          <div>
            <div className="text-xs uppercase tracking-widest text-amber-400 font-bold">Draws / Avg Rounds</div>
            <div className="text-xl font-bold text-slate-200">
              {simResults.draws} draws • {simResults.avgRounds} rnds
            </div>
          </div>
        </div>
      )}

      {/* Teams Lineup Editors */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {renderTeamSetup(1)}
        {renderTeamSetup(2)}
      </div>

      {/* Card Picker Modal */}
      {pickerState.isOpen && (
        <div className="fixed inset-0 z-50 bg-black/85 backdrop-blur-md flex items-center justify-center p-4 overflow-y-auto">
          <div className="menu-panel bg-slate-900 border border-slate-700 rounded-2xl w-full max-w-4xl p-5 space-y-4">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <h3 className="text-lg font-bold font-fantasy text-slate-100">
                {pickerState.slot === 'summoner' ? 'Select Summoner' : 'Select Monster'}
              </h3>
              <button
                onClick={() => setPickerState({ ...pickerState, isOpen: false })}
                className="p-1 rounded-lg hover:bg-slate-800 text-slate-400 hover:text-slate-200"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3 max-h-[60vh] overflow-y-auto p-1">
              {(pickerState.slot === 'summoner' ? summoners : monsters).map((card) => (
                <div key={card.id} className="flex justify-center">
                  <CardPreview
                    card={card}
                    compact
                    onClick={() => {
                      if (pickerState.team === 1) {
                        if (pickerState.slot === 'summoner') {
                          setTeam1SummonerId(card.id);
                        } else {
                          const updated = [...team1Monsters];
                          updated[pickerState.slot] = { cardId: card.id, level: 1 };
                          setTeam1Monsters(updated);
                        }
                      } else {
                        if (pickerState.slot === 'summoner') {
                          setTeam2SummonerId(card.id);
                        } else {
                          const updated = [...team2Monsters];
                          updated[pickerState.slot] = { cardId: card.id, level: 1 };
                          setTeam2Monsters(updated);
                        }
                      }
                      setPickerState({ ...pickerState, isOpen: false });
                    }}
                  />
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
