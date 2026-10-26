import React, { useState } from 'react';
import { PvEChallenge, TeamSelection } from '../types/battle';
import { CardDefinition, Splinter } from '../types/card';
import { RulesetName, RULESET_METADATA, ALL_SPLINTERS } from '../types/ruleset';
import { StorageService } from '../data/storage';
import { CardPreview, SPLINTER_BG_COLORS } from './CardPreview';
import {
  Swords,
  Plus,
  Trash2,
  Copy,
  Edit,
  Download,
  Upload,
  Play,
  ShieldAlert,
  Flame,
  Check,
  X,
  Sparkles,
  Award,
  Search,
} from 'lucide-react';

interface ChallengeBuilderProps {
  challenges: PvEChallenge[];
  cards: CardDefinition[];
  onChallengesUpdated: () => void;
  onStartChallenge: (challenge: PvEChallenge) => void;
}

export const ChallengeBuilder: React.FC<ChallengeBuilderProps> = ({
  challenges,
  cards,
  onChallengesUpdated,
  onStartChallenge,
}) => {
  const [editingChallenge, setEditingChallenge] = useState<PvEChallenge | null>(null);
  const [cardSelectModal, setCardSelectModal] = useState<{
    isOpen: boolean;
    slot: 'summoner' | number; // 'summoner' or monster index 0..5
  }>({ isOpen: false, slot: 'summoner' });

  const [feedback, setFeedback] = useState<string | null>(null);
  const [monsterSearchQuery, setMonsterSearchQuery] = useState('');
  const [monsterSplinterFilter, setMonsterSplinterFilter] = useState<Splinter | 'ALL'>('ALL');

  const showFeedback = (msg: string) => {
    setFeedback(msg);
    setTimeout(() => setFeedback(null), 3000);
  };

  const summonerCards = cards.filter((c) => c.cardType === 'Summoner');
  const monsterCards = cards.filter((c) => c.cardType === 'Monster');
  const filteredMonsterCards = monsterCards.filter((card) =>
    (monsterSplinterFilter === 'ALL' || card.splinter === monsterSplinterFilter) &&
    card.name.toLowerCase().includes(monsterSearchQuery.trim().toLowerCase())
  );

  const openCardPicker = (slot: 'summoner' | number) => {
    setMonsterSearchQuery('');
    setMonsterSplinterFilter('ALL');
    setCardSelectModal({ isOpen: true, slot });
  };

  const handleCreateNew = () => {
    const defaultSummoner = summonerCards[0] || cards[0];
    const defaultMonster = monsterCards[0] || cards[0];

    const newChallenge: PvEChallenge = {
      id: `pve_custom_${Date.now()}`,
      name: 'Custom PvE Gauntlet',
      description: 'A newly designed combat challenge for aspiring champions.',
      manaCap: 25,
      rulesets: ['Standard'],
      allowedSplinters: ['Fire', 'Water', 'Earth', 'Life', 'Death', 'Dragon', 'Neutral'],
      isCustom: true,
      enemyTeam: {
        summonerId: defaultSummoner.id,
        summonerLevel: 1,
        monsters: [{ cardId: defaultMonster.id, level: 1 }],
      },
    };
    setEditingChallenge(newChallenge);
  };

  const handleClone = (ch: PvEChallenge) => {
    const cloned: PvEChallenge = {
      ...ch,
      id: `pve_custom_${Date.now()}`,
      name: `${ch.name} (Custom Copy)`,
      isCustom: true,
      enemyTeam: {
        ...ch.enemyTeam,
        monsters: ch.enemyTeam.monsters.map((m) => ({ ...m })),
      },
    };
    setEditingChallenge(cloned);
  };

  const handleDelete = (id: string) => {
    if (confirm('Are you sure you want to delete this PvE challenge?')) {
      StorageService.deleteChallenge(id);
      onChallengesUpdated();
      showFeedback('Challenge deleted.');
    }
  };

  const handleSave = () => {
    if (!editingChallenge) return;
    if (!editingChallenge.name.trim()) {
      alert('Please enter a challenge name.');
      return;
    }
    if (editingChallenge.enemyTeam.monsters.length === 0) {
      alert('The opponent team must have at least 1 monster.');
      return;
    }
    StorageService.saveChallenge(editingChallenge);
    onChallengesUpdated();
    setEditingChallenge(null);
    showFeedback('Challenge saved successfully!');
  };

  const handleExportJson = (includeAll = false) => {
    const data = StorageService.exportChallengesJson(includeAll);
    const blob = new Blob([data], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `splinter_pve_challenges_${includeAll ? 'all' : 'custom'}_${Date.now()}.json`;
    a.click();
    URL.revokeObjectURL(url);
    showFeedback(`Exported ${includeAll ? 'all' : 'custom'} PvE challenges JSON.`);
  };

  const handleExportSingleChallenge = (challenge: PvEChallenge) => {
    const data = JSON.stringify(challenge, null, 2);
    const blob = new Blob([data], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `battle_${challenge.id}.json`;
    a.click();
    URL.revokeObjectURL(url);
    showFeedback(`Exported challenge "${challenge.name}" JSON.`);
  };

  const handleImportJson = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    let totalCount = 0;
    let filesProcessed = 0;

    Array.from(files).forEach((file) => {
      const reader = new FileReader();
      reader.onload = (evt) => {
        const content = evt.target?.result as string;
        const res = StorageService.importChallengesJson(content);
        if (res.success) {
          totalCount += res.count;
        }
        filesProcessed++;
        if (filesProcessed === files.length) {
          onChallengesUpdated();
          showFeedback(`Imported ${totalCount} challenge(s) from ${files.length} file(s)!`);
        }
      };
      reader.readAsText(file);
    });
    e.target.value = '';
  };

  const toggleRuleset = (ruleset: RulesetName) => {
    if (!editingChallenge) return;
    const existing = [...editingChallenge.rulesets];
    const idx = existing.indexOf(ruleset);
    if (idx >= 0) {
      existing.splice(idx, 1);
      if (existing.length === 0) existing.push('Standard');
    } else {
      if (existing.includes('Standard')) {
        const stdIdx = existing.indexOf('Standard');
        existing.splice(stdIdx, 1);
      }
      existing.push(ruleset);
    }
    setEditingChallenge({ ...editingChallenge, rulesets: existing });
  };

  const toggleSplinter = (splinter: Splinter) => {
    if (!editingChallenge) return;
    const splinters = [...editingChallenge.allowedSplinters];
    const idx = splinters.indexOf(splinter);
    if (idx >= 0) {
      if (splinters.length > 1) splinters.splice(idx, 1);
    } else {
      splinters.push(splinter);
    }
    setEditingChallenge({ ...editingChallenge, allowedSplinters: splinters });
  };

  const addMonsterSlot = () => {
    if (!editingChallenge || editingChallenge.enemyTeam.monsters.length >= 6) return;
    openCardPicker(editingChallenge.enemyTeam.monsters.length);
  };

  const removeMonsterSlot = (index: number) => {
    if (!editingChallenge || editingChallenge.enemyTeam.monsters.length <= 1) return;
    const monsters = editingChallenge.enemyTeam.monsters.filter((_, idx) => idx !== index);
    setEditingChallenge({
      ...editingChallenge,
      enemyTeam: { ...editingChallenge.enemyTeam, monsters },
    });
  };

  const moveMonster = (from: number, to: number) => {
    if (!editingChallenge) return;
    const monsters = [...editingChallenge.enemyTeam.monsters];
    if (to < 0 || to >= monsters.length) return;
    const [moved] = monsters.splice(from, 1);
    monsters.splice(to, 0, moved);
    setEditingChallenge({
      ...editingChallenge,
      enemyTeam: { ...editingChallenge.enemyTeam, monsters },
    });
  };

  return (
    <div className="space-y-6">
      {/* Toast */}
      {feedback && (
        <div className="fixed bottom-6 right-6 z-50 px-4 py-2.5 rounded-xl bg-emerald-950 border border-emerald-500 text-emerald-200 shadow-2xl flex items-center gap-2">
          <Check className="w-4 h-4" />
          <span>{feedback}</span>
        </div>
      )}

      {/* Header Bar */}
      <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-5 shadow-xl flex flex-col lg:flex-row items-stretch lg:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold font-fantasy text-slate-100 flex items-center gap-2">
            <Swords className="w-6 h-6 text-amber-500" />
            PvE Battle Campaigns & Encounters
          </h2>
          <p className="text-sm text-slate-400 mt-0.5">
            Select an encounter to challenge, or forge custom PvE trials with custom rulesets and boss lineups.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            onClick={handleCreateNew}
            className="flex items-center gap-1.5 px-4 py-2 bg-amber-600 hover:bg-amber-500 text-white font-bold rounded-xl transition shadow-lg shadow-amber-600/20 text-sm"
          >
            <Plus className="w-4 h-4" />
            Create Challenge
          </button>
          
          {/* Export Dropdown / Buttons */}
          <div className="flex items-center rounded-xl bg-slate-800 border border-slate-700 overflow-hidden">
            <button
              onClick={() => handleExportJson(false)}
              className="flex items-center gap-1.5 px-3 py-2 hover:bg-slate-700 text-slate-200 font-medium transition text-sm"
              title="Export Custom Challenges to JSON"
            >
              <Download className="w-4 h-4" />
              Export Custom ({challenges.filter(c => c.isCustom).length})
            </button>
            <button
              onClick={() => handleExportJson(true)}
              className="px-2.5 py-2 hover:bg-slate-700 text-slate-400 hover:text-slate-200 border-l border-slate-700 text-xs font-semibold transition"
              title="Export All Challenges (Including default campaigns)"
            >
              All
            </button>
          </div>

          <label className="flex items-center gap-1.5 px-3 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 font-medium rounded-xl border border-slate-700 transition text-sm cursor-pointer">
            <Upload className="w-4 h-4" />
            Import JSON
            <input type="file" accept=".json" multiple onChange={handleImportJson} className="hidden" />
          </label>
        </div>
      </div>

      {/* Challenges List */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
        {challenges.map((ch) => {
          const enemySummoner = cards.find((c) => c.id === ch.enemyTeam.summonerId);
          const enemyMonsters = ch.enemyTeam.monsters
            .map((m) => cards.find((c) => c.id === m.cardId))
            .filter(Boolean) as CardDefinition[];

          return (
            <div
              key={ch.id}
              className="bg-slate-900/90 border border-slate-800 hover:border-slate-700 rounded-2xl p-5 flex flex-col justify-between transition-all hover:shadow-xl shadow-slate-950/50 relative overflow-hidden group"
            >
              <div className="flex items-center justify-end mb-3">
                <div className="flex items-center gap-2">
                  <div className="flex items-center gap-1 text-xs font-bold text-blue-400 bg-blue-950/60 border border-blue-800/80 px-2.5 py-0.5 rounded-lg">
                    <span>Mana:</span>
                    <span className="text-white text-sm">{ch.manaCap}</span>
                  </div>
                </div>
              </div>

              {/* Title & Lore */}
              <div>
                <h3 className="text-lg font-bold font-fantasy text-slate-100 group-hover:text-amber-400 transition">
                  {ch.name}
                </h3>
                <p className="text-xs text-slate-400 mt-1 line-clamp-2">{ch.description}</p>
              </div>

              {/* Rulesets Badges */}
              <div className="mt-3 flex flex-wrap gap-1">
                {ch.rulesets.map((r) => (
                  <span
                    key={r}
                    title={RULESET_METADATA[r]?.description}
                    className="text-[10px] px-2 py-0.5 rounded bg-rose-950/80 border border-rose-600/40 text-rose-300 font-semibold flex items-center gap-1"
                  >
                    <ShieldAlert className="w-2.5 h-2.5" />
                    {r}
                  </span>
                ))}
              </div>

              {/* Opponent Lineup Preview */}
              <div className="mt-4 pt-3 border-t border-slate-800/80">
                <div className="text-[11px] font-bold text-slate-400 uppercase tracking-wider mb-1.5 flex items-center justify-between">
                  <span>Opponent Lineup</span>
                  <span className="text-amber-400">{enemySummoner?.name || 'No Summoner'}</span>
                </div>
                <div className="flex items-center gap-1 overflow-x-auto py-1">
                  {enemyMonsters.map((m, idx) => (
                    <div
                      key={idx}
                      title={`${m.name} (Pos ${idx + 1})`}
                      className="w-9 h-9 rounded-lg border border-slate-700 bg-slate-950 flex items-center justify-center font-bold text-[10px] text-slate-300 shrink-0 overflow-hidden relative"
                    >
                      {m.imageUrl ? (
                        <img src={m.imageUrl} alt={m.name} className="w-full h-full object-cover" />
                      ) : (
                        <span>{m.name.slice(0, 2)}</span>
                      )}
                      <div className="absolute bottom-0 right-0 bg-slate-900/90 text-[8px] px-0.5 rounded text-amber-400 font-bold">
                        {idx + 1}
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Action Buttons */}
              <div className="mt-4 pt-3 border-t border-slate-800/80 flex items-center justify-between gap-2">
                <div className="flex items-center gap-1">
                  <button
                    onClick={() => setEditingChallenge({ ...ch })}
                    className="p-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 text-xs transition"
                    title="Edit Challenge"
                  >
                    <Edit className="w-3.5 h-3.5" />
                  </button>
                  <button
                    onClick={() => handleClone(ch)}
                    className="p-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 text-xs transition"
                    title="Clone Challenge"
                  >
                    <Copy className="w-3.5 h-3.5" />
                  </button>
                  <button
                    onClick={() => handleExportSingleChallenge(ch)}
                    className="p-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 text-xs transition"
                    title="Export this battle challenge as JSON file"
                  >
                    <Download className="w-3.5 h-3.5" />
                  </button>
                  {ch.isCustom && (
                    <button
                      onClick={() => handleDelete(ch.id)}
                      className="p-2 rounded-xl bg-rose-950/80 hover:bg-rose-900 text-rose-300 border border-rose-700/60 text-xs transition"
                      title="Delete Challenge"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>

                <button
                  onClick={() => onStartChallenge(ch)}
                  className="flex-1 flex items-center justify-center gap-1.5 px-4 py-2 bg-gradient-to-r from-rose-600 to-amber-600 hover:from-rose-500 hover:to-amber-500 text-white font-bold rounded-xl shadow-lg shadow-rose-600/20 text-xs uppercase tracking-wider transition transform active:scale-95"
                >
                  <Play className="w-3.5 h-3.5 fill-current" />
                  Fight Challenge
                </button>
              </div>
            </div>
          );
        })}
      </div>

      {/* CHALLENGE CREATOR / EDITOR MODAL */}
      {editingChallenge && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4 overflow-hidden">
          <div className="bg-slate-900 border border-slate-700 rounded-2xl w-full max-w-4xl max-h-[calc(100dvh_-_2rem)] min-h-0 overflow-hidden shadow-2xl p-6 text-slate-100 flex flex-col gap-6">
            <div className="shrink-0 flex items-center justify-between border-b border-slate-800 pb-3">
              <h3 className="text-xl font-bold font-fantasy text-amber-400 flex items-center gap-2">
                <Flame className="w-5 h-5 text-rose-500" />
                {editingChallenge.isCustom ? 'PvE Challenge Forge' : `Edit: ${editingChallenge.name}`}
              </h3>
              <button
                onClick={() => setEditingChallenge(null)}
                className="p-1 rounded-lg hover:bg-slate-800 text-slate-400 hover:text-slate-200"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Basic Info */}
            <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain space-y-6 pr-2 [scrollbar-gutter:stable]">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-semibold text-slate-400 mb-1">Challenge Name</label>
                <input
                  type="text"
                  value={editingChallenge.name}
                  onChange={(e) => setEditingChallenge({ ...editingChallenge, name: e.target.value })}
                  className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-100 focus:outline-none focus:border-amber-500"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-400 mb-1">Mana Cap</label>
                <input
                  type="number"
                  min="10"
                  max="99"
                  value={editingChallenge.manaCap}
                  onChange={(e) => setEditingChallenge({ ...editingChallenge, manaCap: parseInt(e.target.value) || 20 })}
                  className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-100 font-bold"
                />
              </div>

              <div className="md:col-span-2">
                <label className="block text-xs font-semibold text-slate-400 mb-1">Lore / Instructions</label>
                <input
                  type="text"
                  value={editingChallenge.description}
                  onChange={(e) => setEditingChallenge({ ...editingChallenge, description: e.target.value })}
                  className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-xs text-slate-200"
                />
              </div>
            </div>

            {/* Allowed Splinters */}
            <div>
              <label className="block text-xs font-bold text-slate-300 mb-2">Allowed Elements / Splinters</label>
              <div className="flex flex-wrap gap-2">
                {ALL_SPLINTERS.map((splinter) => {
                  const isAllowed = editingChallenge.allowedSplinters.includes(splinter);
                  return (
                    <button
                      key={splinter}
                      type="button"
                      onClick={() => toggleSplinter(splinter)}
                      className={`px-3 py-1.5 rounded-xl text-xs font-bold border transition flex items-center gap-1.5 ${
                        isAllowed
                          ? 'bg-amber-950/80 border-amber-500 text-amber-300'
                          : 'bg-slate-950 border-slate-800 text-slate-500'
                      }`}
                    >
                      <span>{splinter}</span>
                      {isAllowed && <Check className="w-3.5 h-3.5 text-amber-400" />}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Rulesets Selector */}
            <div>
              <label className="block text-xs font-bold text-slate-300 mb-2">Active Combat Rulesets</label>
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2 max-h-48 overflow-y-auto p-2 bg-slate-950 rounded-xl border border-slate-800">
                {(Object.keys(RULESET_METADATA) as RulesetName[]).map((rName) => {
                  const isSelected = editingChallenge.rulesets.includes(rName);
                  const meta = RULESET_METADATA[rName];
                  return (
                    <button
                      key={rName}
                      type="button"
                      onClick={() => toggleRuleset(rName)}
                      title={meta.description}
                      className={`p-2 rounded-lg text-left text-xs border transition flex items-center justify-between ${
                        isSelected
                          ? 'bg-rose-950 border-rose-500 text-rose-200 font-bold'
                          : 'bg-slate-900 border-slate-800 text-slate-400 hover:text-slate-200'
                      }`}
                    >
                      <span className="truncate">{rName}</span>
                      {isSelected && <Check className="w-3.5 h-3.5 text-rose-400 shrink-0" />}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* OPPONENT TEAM SETUP */}
            <div className="bg-slate-950 border border-slate-800 rounded-2xl p-4 space-y-4">
              <div className="flex items-center justify-between">
                <h4 className="text-sm font-bold uppercase tracking-wider text-amber-400">
                  Opponent Team Formation
                </h4>
                <button
                  type="button"
                  onClick={addMonsterSlot}
                  disabled={editingChallenge.enemyTeam.monsters.length >= 6}
                  className="px-3 py-1 bg-amber-600 hover:bg-amber-500 disabled:opacity-40 text-white font-bold rounded-lg text-xs flex items-center gap-1"
                >
                  <Plus className="w-3.5 h-3.5" /> Add Monster
                </button>
              </div>

              {/* Summoner Slot */}
              <div className="flex items-center gap-3 p-3 bg-slate-900 rounded-xl border border-slate-800">
                <div className="text-xs font-bold text-slate-400 w-20">Summoner:</div>
                <div className="flex-1 flex items-center justify-between">
                  <span className="font-bold text-slate-200">
                    {editingChallenge.enemyTeam.summonerId ? cards.find((c) => c.id === editingChallenge.enemyTeam.summonerId)?.name || 'Select Summoner' : 'No Summoner'}
                  </span>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => openCardPicker('summoner')}
                      className="px-3 py-1 bg-slate-800 hover:bg-slate-700 text-xs font-semibold rounded-lg text-amber-400 border border-slate-700"
                    >
                      Choose Summoner
                    </button>
                    <button
                      type="button"
                      onClick={() => setEditingChallenge({ ...editingChallenge, enemyTeam: { ...editingChallenge.enemyTeam, summonerId: null } })}
                      className={`px-3 py-1 text-xs font-semibold rounded-lg border ${editingChallenge.enemyTeam.summonerId === null ? 'bg-amber-950 text-amber-300 border-amber-600' : 'bg-slate-800 hover:bg-slate-700 text-slate-300 border-slate-700'}`}
                    >
                      No Summoner
                    </button>
                  </div>
                </div>
              </div>

              {/* Monster Slots */}
              <div className="space-y-2">
                {editingChallenge.enemyTeam.monsters.map((monsterSlot, idx) => {
                  const card = cards.find((c) => c.id === monsterSlot.cardId);
                  return (
                    <div
                      key={idx}
                      className="flex items-center gap-3 p-3 bg-slate-900 rounded-xl border border-slate-800"
                    >
                      <div className="w-7 h-7 rounded-full bg-slate-800 border border-slate-700 flex items-center justify-center text-xs font-bold text-amber-400 shrink-0">
                        #{idx + 1}
                      </div>

                      <div className="flex-1 min-w-0">
                        <div className="font-bold text-sm text-slate-200 truncate">
                          {card?.name || 'Unknown Monster'}
                        </div>
                        <div className="text-[11px] text-slate-400">
                          {card?.splinter} • {card?.stats[0]?.mana || 0} Mana • {card?.stats[0]?.attackType}
                        </div>
                      </div>

                      {/* Level selector */}
                      <div className="flex items-center gap-1">
                        <span className="text-xs text-slate-400">Lv:</span>
                        <select
                          value={monsterSlot.level}
                          onChange={(e) => {
                            const lvl = parseInt(e.target.value) || 1;
                            const monsters = [...editingChallenge.enemyTeam.monsters];
                            monsters[idx].level = lvl;
                            setEditingChallenge({
                              ...editingChallenge,
                              enemyTeam: { ...editingChallenge.enemyTeam, monsters },
                            });
                          }}
                          className="bg-slate-950 border border-slate-700 rounded px-2 py-1 text-xs text-slate-200"
                        >
                          {(card?.stats || [{ level: 1 }]).map((s) => (
                            <option key={s.level} value={s.level}>
                              {s.level}
                            </option>
                          ))}
                        </select>
                      </div>

                      {/* Position & Change */}
                      <button
                        type="button"
                        onClick={() => openCardPicker(idx)}
                        className="px-2.5 py-1 bg-slate-800 hover:bg-slate-700 text-xs font-semibold rounded-lg text-slate-300 border border-slate-700"
                      >
                        Change
                      </button>

                      <button
                        type="button"
                        onClick={() => moveMonster(idx, idx - 1)}
                        disabled={idx === 0}
                        className="p-1 text-slate-400 hover:text-slate-200 disabled:opacity-20"
                        title="Move forward"
                      >
                        ▲
                      </button>
                      <button
                        type="button"
                        onClick={() => moveMonster(idx, idx + 1)}
                        disabled={idx === editingChallenge.enemyTeam.monsters.length - 1}
                        className="p-1 text-slate-400 hover:text-slate-200 disabled:opacity-20"
                        title="Move back"
                      >
                        ▼
                      </button>

                      {editingChallenge.enemyTeam.monsters.length > 1 && (
                        <button
                          type="button"
                          onClick={() => removeMonsterSlot(idx)}
                          className="p-1 text-rose-400 hover:text-rose-300"
                          title="Remove Monster"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Footer Buttons */}
            </div>
            <div className="shrink-0 flex flex-wrap items-center justify-end gap-3 pt-4 border-t border-slate-800">
              <button
                type="button"
                onClick={() => setEditingChallenge(null)}
                className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 font-semibold text-sm"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleSave}
                className="px-6 py-2 rounded-xl bg-amber-600 hover:bg-amber-500 text-white font-bold text-sm shadow-lg shadow-amber-600/30 flex items-center gap-1.5"
              >
                <Check className="w-4 h-4" />
                Save Challenge
              </button>
            </div>
          </div>
        </div>
      )}

      {/* CARD PICKER MODAL (For Opponent Team) */}
      {cardSelectModal.isOpen && (
        <div className="fixed inset-0 z-50 bg-black/85 backdrop-blur-md flex items-center justify-center p-4 overflow-y-auto">
          <div className="menu-panel bg-slate-900 border border-slate-700 rounded-2xl w-full max-w-4xl p-5 space-y-4">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <h3 className="text-lg font-bold font-fantasy text-slate-100">
                {cardSelectModal.slot === 'summoner' ? 'Choose Opponent Summoner' : 'Choose Opponent Monster'}
              </h3>
              <button
                onClick={() => setCardSelectModal({ isOpen: false, slot: 'summoner' })}
                className="p-1 rounded-lg hover:bg-slate-800 text-slate-400 hover:text-slate-200"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {cardSelectModal.slot !== 'summoner' && (
              <div className="grid grid-cols-1 sm:grid-cols-[1fr_12rem] gap-3">
                <label className="relative block">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
                  <input
                    type="search"
                    aria-label="Search opponent monsters"
                    placeholder="Search monsters"
                    value={monsterSearchQuery}
                    onChange={(event) => setMonsterSearchQuery(event.target.value)}
                    className="w-full bg-slate-950 border border-slate-700 rounded-lg pl-9 pr-3 py-2 text-sm text-slate-100"
                  />
                </label>
                <label className="text-xs text-slate-400">
                  Splinter
                  <select
                    value={monsterSplinterFilter}
                    onChange={(event) => setMonsterSplinterFilter(event.target.value as Splinter | 'ALL')}
                    className="mt-1 w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-100"
                  >
                    <option value="ALL">All splinters</option>
                    {ALL_SPLINTERS.map((splinter) => <option key={splinter} value={splinter}>{splinter}</option>)}
                  </select>
                </label>
              </div>
            )}

            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3 max-h-[60vh] overflow-y-auto p-1">
              {(cardSelectModal.slot === 'summoner' ? summonerCards : filteredMonsterCards).map((card) => (
                <div key={card.id} className="flex justify-center">
                  <CardPreview
                    card={card}
                    compact
                    onClick={() => {
                      if (!editingChallenge) return;
                      if (cardSelectModal.slot === 'summoner') {
                        setEditingChallenge({
                          ...editingChallenge,
                          enemyTeam: { ...editingChallenge.enemyTeam, summonerId: card.id },
                        });
                      } else {
                        const monsters = [...editingChallenge.enemyTeam.monsters];
                        monsters[cardSelectModal.slot] = { cardId: card.id, level: 1 };
                        setEditingChallenge({
                          ...editingChallenge,
                          enemyTeam: { ...editingChallenge.enemyTeam, monsters },
                        });
                      }
                      setCardSelectModal({ isOpen: false, slot: 'summoner' });
                    }}
                  />
                </div>
              ))}
              {cardSelectModal.slot !== 'summoner' && !filteredMonsterCards.length && (
                <p className="col-span-full py-8 text-center text-sm text-slate-500">No monsters match these filters.</p>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
