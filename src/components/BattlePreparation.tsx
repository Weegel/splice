import React, { useState, useEffect } from 'react';
import { PvEChallenge, TeamSelection } from '../types/battle';
import { CardDefinition, Splinter, AttackType } from '../types/card';
import { RULESET_METADATA } from '../types/ruleset';
import { StorageService } from '../data/storage';
import { PlayerCollectionState } from '../services/splinterlandsApi';
import { CardPreview, SPLINTER_BG_COLORS } from './CardPreview';
import {
  Swords,
  ShieldAlert,
  ArrowLeft,
  Play,
  Trash2,
  ArrowUp,
  ArrowDown,
  AlertTriangle,
  Zap,
  Info,
  CheckCircle2,
  User,
  Crown,
  Lock,
  X,
  Sparkles,
  RefreshCw,
  Search,
  SlidersHorizontal,
  Crosshair,
  Shield,
  Heart,
} from 'lucide-react';

interface BattlePreparationProps {
  challenge: PvEChallenge;
  cards: CardDefinition[];
  onBack: () => void;
  onLaunchBattle: (playerTeam: TeamSelection) => void;
  playerCollection?: PlayerCollectionState | null;
  allowedEditions?: number[];
  allowedTiers?: Array<number | null>;
  allowGladiators?: boolean;
  allowRuni?: boolean;
  maxCardLevel?: number;
  maxCardLevelsByRarity?: Partial<Record<CardDefinition['rarity'], number>>;
}

const RARITY_MAX_LEVEL: Record<CardDefinition['rarity'], number> = {
  Common: 10,
  Rare: 8,
  Epic: 6,
  Legendary: 4,
};

export const BattlePreparation: React.FC<BattlePreparationProps> = ({
  challenge,
  cards,
  onBack,
  onLaunchBattle,
  playerCollection: propCollection,
  allowedEditions,
  allowedTiers,
  allowGladiators = true,
  allowRuni = true,
  maxCardLevel,
  maxCardLevelsByRarity,
}) => {
  const playerCollection = propCollection ?? StorageService.getPlayerCollection();
  const campaignTiers = allowedTiers || allowedEditions;
  const [filterMode, setFilterMode] = useState<'all' | 'owned_only'>(StorageService.getCollectionFilterMode());
  const [isSummonerModalOpen, setIsSummonerModalOpen] = useState<boolean>(false);

  const isCardAllowedByCampaign = (tier?: number | null, edition?: number): boolean => {
    const isGladiator = edition === 6 && tier === 4;
    const isRuni = edition === 2 && tier === 7;
    if (isRuni) return allowRuni;
    if (isGladiator) return allowGladiators;
    return !campaignTiers || campaignTiers.length === 0 || (tier !== undefined && campaignTiers.includes(tier));
  };

  // Helper to determine ownership & level cap
  const getCardOwnership = (card: CardDefinition): { isOwned: boolean; maxLevel: number } => {
    const cardMaxLevel = Math.min(RARITY_MAX_LEVEL[card.rarity], card.stats.length || 1);
    const campaignMaxLevel = maxCardLevelsByRarity?.[card.rarity] || maxCardLevel || Infinity;
    if (!playerCollection || (filterMode === 'all' && (!campaignTiers || campaignTiers.length === 0))) {
      return { isOwned: true, maxLevel: Math.min(campaignMaxLevel, cardMaxLevel) };
    }

    // When 'owned_only' mode is active:
    // Custom non-NFT cards created in the card forge are not part of an in-game NFT collection
    if (card.isCustom) {
      return { isOwned: false, maxLevel: 1 };
    }

    // 1. Try matching by card ID (e.g. spl_123 or direct number)
    let detailId: number | null = null;
    if (card.id.startsWith('spl_')) {
      detailId = parseInt(card.id.replace('spl_', ''));
    } else if (!isNaN(Number(card.id))) {
      detailId = Number(card.id);
    }

    if (detailId !== null && playerCollection.ownedCards && playerCollection.ownedCards[detailId]) {
      const owned = playerCollection.ownedCards[detailId];
      if (!isCardAllowedByCampaign(owned.tier, owned.edition)) {
        return { isOwned: false, maxLevel: 1 };
      }
      return { isOwned: true, maxLevel: Math.min(campaignMaxLevel, cardMaxLevel, Math.max(1, owned.maxLevel)) };
    }

    // 2. Try matching by normalized card name (e.g. for base game cards like "Living Lava", "Sea Monster")
    const normName = card.name.toLowerCase().trim();
    if (playerCollection.ownedCardNames) {
      if (playerCollection.ownedCardNames[normName]) {
        const owned = playerCollection.ownedCardNames[normName];
        const editionMeta = playerCollection.ownedCards[owned.detailId];
        if (!editionMeta || !isCardAllowedByCampaign(editionMeta.tier, editionMeta.edition)) {
          return { isOwned: false, maxLevel: 1 };
        }
        return { isOwned: true, maxLevel: Math.min(campaignMaxLevel, cardMaxLevel, Math.max(1, owned.maxLevel)) };
      }
      const simplified = normName.replace(/[^a-z0-9]/g, '');
      if (playerCollection.ownedCardNames[simplified]) {
        const owned = playerCollection.ownedCardNames[simplified];
        const editionMeta = playerCollection.ownedCards[owned.detailId];
        if (!editionMeta || !isCardAllowedByCampaign(editionMeta.tier, editionMeta.edition)) {
          return { isOwned: false, maxLevel: 1 };
        }
        return { isOwned: true, maxLevel: Math.min(campaignMaxLevel, cardMaxLevel, Math.max(1, owned.maxLevel)) };
      }
    }

    return { isOwned: false, maxLevel: 1 };
  };

  // Available summoners for allowed splinters
  const summoners = cards.filter((c) => {
    if (c.cardType !== 'Summoner') return false;
    const editionRestricted = Boolean(playerCollection && campaignTiers && campaignTiers.length > 0);
    if (filterMode === 'owned_only' || editionRestricted) {
      if (filterMode === 'owned_only' && c.isCustom) return false;
      if (playerCollection && !getCardOwnership(c).isOwned) return false;
    }
    if (!challenge.allowedSplinters.includes(c.splinter) && c.splinter !== 'Neutral') return false;
    return true;
  });

  // Fallback summoners if filterMode was too restrictive (only non-custom official summoners)
  const fallbackSummoners = cards.filter((c) => {
    if (c.cardType !== 'Summoner') return false;
    if (filterMode === 'owned_only' && c.isCustom) return false;
    if (!challenge.allowedSplinters.includes(c.splinter) && c.splinter !== 'Neutral') return false;
    const editionRestricted = Boolean(playerCollection && campaignTiers && campaignTiers.length > 0);
    if (playerCollection && (filterMode === 'owned_only' || editionRestricted)) {
      return getCardOwnership(c).isOwned;
    }
    return true;
  });

  const effectiveSummoners = summoners.length > 0 ? summoners : fallbackSummoners;

  // Player selected summoner
  const [selectedSummonerId, setSelectedSummonerId] = useState<string>(
    effectiveSummoners[0]?.id || ''
  );
  const [summonerLevel, setSummonerLevel] = useState<number>(1);

  // Player selected monsters
  const [selectedMonsters, setSelectedMonsters] = useState<{ cardId: string; level: number }[]>([]);

  // Synchronize summoner ID if current one becomes invalid or unavailable
  useEffect(() => {
    if (effectiveSummoners.length > 0 && !effectiveSummoners.some((s) => s.id === selectedSummonerId)) {
      const newSumm = effectiveSummoners[0];
      setSelectedSummonerId(newSumm.id);
      const ownership = getCardOwnership(newSumm);
      setSummonerLevel(Math.min(1, ownership.maxLevel));
    }
  }, [challenge.id, effectiveSummoners, selectedSummonerId, filterMode]);

  // Active filter for monster picker
  const selectedSummoner = cards.find((c) => c.id === selectedSummonerId);
  const activeSplinter: Splinter = selectedSummoner?.splinter || 'Fire';

  // For Dragon Summoners: Allowed non-Dragon elements for the secondary element
  const allowedSecondarySplinters: Splinter[] = challenge.allowedSplinters.filter(
    (s) => s !== 'Dragon' && s !== 'Neutral'
  );

  // Dragon secondary splinter state (e.g. Fire, Water, Earth, Life, Death)
  const [dragonSecondarySplinter, setDragonSecondarySplinter] = useState<Splinter>(
    allowedSecondarySplinters[0] || 'Fire'
  );

  // Ensure dragon secondary splinter is always valid when challenge changes
  useEffect(() => {
    if (allowedSecondarySplinters.length > 0 && !allowedSecondarySplinters.includes(dragonSecondarySplinter)) {
      setDragonSecondarySplinter(allowedSecondarySplinters[0]);
    }
  }, [challenge.id, allowedSecondarySplinters]);

  const [searchQuery, setSearchQuery] = useState<string>('');
  const [filterAttack, setFilterAttack] = useState<AttackType | 'ALL'>('ALL');
  const [filterSplinter, setFilterSplinter] = useState<Splinter | 'ALL'>('ALL');
  const [sortBy, setSortBy] = useState<'mana_asc' | 'mana_desc' | 'speed' | 'health' | 'attack'>('mana_asc');

  // Summoner Modal Search & Filter state
  const [summonerSearchQuery, setSummonerSearchQuery] = useState<string>('');
  const [summonerFilterSplinter, setSummonerFilterSplinter] = useState<Splinter | 'ALL'>('ALL');

  // Allowed splinters for the current monster bench based on active summoner:
  // - Neutral Summoner: Can pick from all allowed splinters in this battle + Neutral
  // - Dragon Summoner: Can pick Dragon + the selected secondary splinter + Neutral
  // - Elemental Summoner (Fire, Water, etc.): Can only pick their element + Neutral
  const availableSplintersForBench: Splinter[] =
    activeSplinter === 'Neutral'
      ? Array.from(new Set([...challenge.allowedSplinters, 'Neutral' as Splinter]))
      : activeSplinter === 'Dragon'
      ? Array.from(new Set(['Dragon' as Splinter, dragonSecondarySplinter, 'Neutral' as Splinter]))
      : [activeSplinter, 'Neutral' as Splinter];

  // Filtered summoners for the modal
  const filteredSummoners = effectiveSummoners.filter((summ) => {
    // Splinter filter
    if (summonerFilterSplinter !== 'ALL' && summ.splinter !== summonerFilterSplinter) {
      return false;
    }
    // Search query filter
    if (summonerSearchQuery.trim()) {
      const q = summonerSearchQuery.toLowerCase().trim();
      const matchesName = summ.name.toLowerCase().includes(q);
      const matchesSplinter = summ.splinter.toLowerCase().includes(q);
      const matchesDesc = (summ.description || '').toLowerCase().includes(q);
      if (!matchesName && !matchesSplinter && !matchesDesc) return false;
    }
    return true;
  });

  // Auto-reset splinter filter if not valid for active summoner
  useEffect(() => {
    if (filterSplinter !== 'ALL' && !availableSplintersForBench.includes(filterSplinter)) {
      setFilterSplinter('ALL');
    }
  }, [activeSplinter, dragonSecondarySplinter, challenge.id]);

  // Calculate current mana used
  const summonerMana = selectedSummoner?.stats[0]?.mana || 0;
  const monstersMana = selectedMonsters.reduce((acc, m) => {
    const card = cards.find((c) => c.id === m.cardId);
    const stat = card?.stats.find((s) => s.level === m.level) || card?.stats[0];
    return acc + (stat?.mana || 0);
  }, 0);

  const totalManaUsed = summonerMana + monstersMana;
  const isManaOver = totalManaUsed > challenge.manaCap;

  // Ruleset validations
  const isCardAllowedByRulesets = (
    card: CardDefinition,
    targetSplinter = activeSplinter,
    secondarySplinter = dragonSecondarySplinter
  ): { allowed: boolean; reason?: string } => {
    const stat = card.stats[0];
    if (!stat) return { allowed: false, reason: 'Invalid card stats' };

    // Element check:
    // - Neutral summoner: any allowed splinter + Neutral
    // - Dragon summoner: Dragon + selected secondary splinter + Neutral
    // - Specific element summoner: only that element + Neutral
    if (targetSplinter === 'Dragon') {
      const isDragonAllowed = card.splinter === 'Dragon' || card.splinter === secondarySplinter || card.splinter === 'Neutral';
      if (!isDragonAllowed) {
        return { allowed: false, reason: `Requires Dragon, ${secondarySplinter}, or Neutral element` };
      }
    } else if (targetSplinter !== 'Neutral') {
      if (card.splinter !== targetSplinter && card.splinter !== 'Neutral') {
        return { allowed: false, reason: `Requires ${targetSplinter} or Neutral element` };
      }
    }

    // Must be allowed by battle's allowed splinters (or Neutral)
    if (card.splinter !== 'Neutral' && !challenge.allowedSplinters.includes(card.splinter)) {
      return { allowed: false, reason: `${card.splinter} is not allowed in this battle` };
    }

    // Little League: <= 4 mana
    if (challenge.rulesets.includes('Little League') && stat.mana > 4) {
      return { allowed: false, reason: 'Little League: Mana cost must be 4 or less' };
    }

    // Lost Magic: No magic
    if (challenge.rulesets.includes('Lost Magic') && stat.attackType === 'Magic') {
      return { allowed: false, reason: 'Lost Magic: Magic attacks prohibited' };
    }

    // Going the Distance: Only ranged
    if (challenge.rulesets.includes('Going the Distance') && stat.attackType !== 'Ranged') {
      return { allowed: false, reason: 'Going the Distance: Only Ranged attacks allowed' };
    }

    // Up Close & Personal: Only melee
    if (challenge.rulesets.includes('Up Close & Personal') && stat.attackType !== 'Melee') {
      return { allowed: false, reason: 'Up Close & Personal: Only Melee attacks allowed' };
    }

    // Keep Your Distance: No melee
    if (challenge.rulesets.includes('Keep Your Distance') && stat.attackType === 'Melee') {
      return { allowed: false, reason: 'Keep Your Distance: Melee attacks prohibited' };
    }

    // Collection filter in 'owned_only' mode:
    if (filterMode === 'owned_only' && playerCollection) {
      const { isOwned } = getCardOwnership(card);
      if (!isOwned) {
        return { allowed: false, reason: 'Not owned in your Splinterlands collection' };
      }
    }

    return { allowed: true };
  };

  // Handler for changing summoner
  const handleSelectSummoner = (newSummonerId: string) => {
    const newSumm = cards.find((c) => c.id === newSummonerId);
    if (!newSumm) return;
    
    setSelectedSummonerId(newSummonerId);
    const maxLvl = getCardOwnership(newSumm).maxLevel;
    setSummonerLevel((prev) => Math.min(prev, maxLvl));

    // Clean up any monsters in lineup that are incompatible with the new summoner's element
    const newSplinter = newSumm.splinter;
    const filteredMonsters = selectedMonsters.filter((m) => {
      const card = cards.find((c) => c.id === m.cardId);
      return card ? isCardAllowedByRulesets(card, newSplinter, dragonSecondarySplinter).allowed : false;
    });
    setSelectedMonsters(filteredMonsters);
    setIsSummonerModalOpen(false);
  };

  // Handler for changing Dragon secondary splinter
  const handleSelectDragonSecondary = (newSecondary: Splinter) => {
    setDragonSecondarySplinter(newSecondary);
    // Clean up monsters that were using the old secondary element
    const filteredMonsters = selectedMonsters.filter((m) => {
      const card = cards.find((c) => c.id === m.cardId);
      return card ? isCardAllowedByRulesets(card, 'Dragon', newSecondary).allowed : false;
    });
    setSelectedMonsters(filteredMonsters);
  };

  // Available monsters for selection
  const availableMonsters = cards
    .filter((c) => {
      if (c.cardType !== 'Monster') return false;
      const stat = c.stats[0];
      if (!stat) return false;

      // Search query filter
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase().trim();
        const matchesName = c.name.toLowerCase().includes(q);
        const matchesSplinter = c.splinter.toLowerCase().includes(q);
        const matchesAbilities = stat.abilities.some((ab) => ab.toLowerCase().includes(q));
        if (!matchesName && !matchesSplinter && !matchesAbilities) return false;
      }

      // Attack type filter
      if (filterAttack !== 'ALL' && stat.attackType !== filterAttack) return false;

      // Splinter filter
      if (filterSplinter !== 'ALL' && c.splinter !== filterSplinter) return false;

      return isCardAllowedByRulesets(c).allowed;
    })
    .sort((a, b) => {
      const aStat = a.stats[0] || { mana: 0, speed: 0, health: 0, attack: 0 };
      const bStat = b.stats[0] || { mana: 0, speed: 0, health: 0, attack: 0 };
      if (sortBy === 'mana_asc') return aStat.mana - bStat.mana || a.name.localeCompare(b.name);
      if (sortBy === 'mana_desc') return bStat.mana - aStat.mana || a.name.localeCompare(b.name);
      if (sortBy === 'speed') return bStat.speed - aStat.speed || aStat.mana - bStat.mana;
      if (sortBy === 'health') return bStat.health - aStat.health || aStat.mana - bStat.mana;
      if (sortBy === 'attack') return bStat.attack - aStat.attack || aStat.mana - bStat.mana;
      return a.name.localeCompare(b.name);
    });

  const handleAddMonster = (card: CardDefinition) => {
    if (selectedMonsters.length >= 6) return;
    if (selectedMonsters.some((m) => m.cardId === card.id)) return; // 1 of each card in team
    const ownership = getCardOwnership(card);
    const initialLevel = Math.min(1, ownership.maxLevel);
    setSelectedMonsters([...selectedMonsters, { cardId: card.id, level: initialLevel }]);
  };

  const handleRemoveMonster = (index: number) => {
    setSelectedMonsters(selectedMonsters.filter((_, idx) => idx !== index));
  };

  const moveMonster = (from: number, to: number) => {
    if (to < 0 || to >= selectedMonsters.length) return;
    const updated = [...selectedMonsters];
    const [item] = updated.splice(from, 1);
    updated.splice(to, 0, item);
    setSelectedMonsters(updated);
  };

  const handleLaunch = () => {
    if (!selectedSummoner) {
      alert('No eligible summoner is available for this campaign and collection.');
      return;
    }
    if (selectedMonsters.length === 0) {
      alert('You must select at least 1 monster for your team.');
      return;
    }
    if (isManaOver) {
      alert(`Mana limit exceeded! You have used ${totalManaUsed}/${challenge.manaCap} mana.`);
      return;
    }

    const playerTeam: TeamSelection = {
      summonerId: selectedSummonerId,
      summonerLevel,
      monsters: selectedMonsters,
    };

    onLaunchBattle(playerTeam);
  };

  const enemySummoner = cards.find((c) => c.id === challenge.enemyTeam.summonerId);

  return (
    <div className="space-y-6">
      {/* Top Navigation & Challenge Header */}
      <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-5 shadow-xl flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <button
            onClick={onBack}
            className="p-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 transition flex items-center gap-1.5 text-xs font-bold"
          >
            <ArrowLeft className="w-4 h-4" />
            Back
          </button>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-xl font-bold font-fantasy text-slate-100">{challenge.name}</h2>
              <span className="text-[10px] uppercase font-extrabold px-2 py-0.5 rounded-full bg-amber-950 text-amber-400 border border-amber-600">
                {challenge.difficulty}
              </span>
            </div>
            <p className="text-xs text-slate-400 mt-0.5">{challenge.description}</p>
          </div>
        </div>

        {/* Rulesets & Mana Cap Badges */}
        <div className="flex flex-wrap items-center gap-2 self-stretch md:self-auto justify-end">
          <div
            className={`px-3 py-1.5 rounded-xl border font-bold text-xs flex items-center gap-2 ${
              isManaOver
                ? 'bg-rose-950/90 border-rose-500 text-rose-300 animate-pulse'
                : 'bg-blue-950/80 border-blue-500 text-blue-300'
            }`}
          >
            <Zap className="w-4 h-4" />
            <span>
              Mana: <strong className="text-white">{totalManaUsed}</strong> / {challenge.manaCap}
            </span>
          </div>

          {challenge.rulesets.map((r) => (
            <span
              key={r}
              title={RULESET_METADATA[r]?.description}
              className="text-xs px-2.5 py-1 rounded-xl bg-rose-950/80 border border-rose-600/50 text-rose-300 font-bold flex items-center gap-1"
            >
              <ShieldAlert className="w-3.5 h-3.5" />
              {r}
            </span>
          ))}
        </div>
      </div>

      {/* Opponent Intel Bar */}
      <div className="bg-slate-900/60 border border-slate-800/80 rounded-xl p-3 flex flex-wrap items-center justify-between gap-2 text-xs">
        <div className="flex items-center gap-2 text-slate-300">
          <Info className="w-4 h-4 text-amber-400 shrink-0" />
          <span>
            Opponent: <strong className="text-amber-300">{enemySummoner?.name}</strong> with{' '}
            <strong className="text-slate-100">{challenge.enemyTeam.monsters.length} Monsters</strong>
          </span>
        </div>
        <div className="flex items-center gap-1">
          {challenge.enemyTeam.monsters.map((m, idx) => {
            const card = cards.find((c) => c.id === m.cardId);
            return (
              <span
                key={idx}
                title={card?.name}
                className="px-2 py-0.5 rounded bg-slate-950 border border-slate-800 text-[10px] text-slate-400 font-semibold"
              >
                #{idx + 1} {card?.name}
              </span>
            );
          })}
        </div>
      </div>

      {/* MAIN TEAM BUILDER INTERFACE */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left / Center Column: Player Team Lineup (Positions 1 to 6) */}
        <div className="lg:col-span-7 space-y-4">
          <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-4 space-y-3 shadow-xl">
            <div className="flex items-center justify-between border-b border-slate-800 pb-2">
              <h3 className="text-sm font-bold uppercase tracking-wider text-amber-400 flex items-center gap-2">
                <Swords className="w-4 h-4" />
                Your Battle Lineup ({selectedMonsters.length}/6 Monsters)
              </h3>
              <button
                onClick={() => setSelectedMonsters([])}
                className="text-xs text-rose-400 hover:text-rose-300 font-medium"
              >
                Clear Lineup
              </button>
            </div>

            {/* Selected Summoner Card Bar */}
            <div className="p-3 bg-slate-950 border border-slate-800 rounded-xl flex flex-wrap items-center justify-between gap-3">
              <div
                onClick={() => setIsSummonerModalOpen(true)}
                className="flex items-center gap-3 min-w-0 cursor-pointer group/summ"
                title="Click to change Summoner"
              >
                <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-amber-600 to-rose-600 text-white font-black flex items-center justify-center text-xs shadow-md shrink-0 group-hover/summ:scale-105 transition transform">
                  SUM
                </div>
                <div className="min-w-0">
                  <div className="font-bold text-slate-100 text-sm truncate group-hover/summ:text-amber-400 transition" title={selectedSummoner?.name}>
                    {selectedSummoner?.name || 'No Eligible Summoner'}
                  </div>
                  <div className="text-[11px] text-amber-400 font-semibold flex items-center gap-1.5">
                    <span>{selectedSummoner?.splinter} Element</span>
                    <span>•</span>
                    <span>Mana: {selectedSummoner?.stats[0]?.mana || 0}</span>
                    {activeSplinter === 'Dragon' && (
                      <>
                        <span>•</span>
                        <span className="text-orange-300 font-bold">Secondary: {dragonSecondarySplinter}</span>
                      </>
                    )}
                  </div>
                </div>
              </div>

              <div className="flex items-center gap-2">
                {/* Dragon Secondary Splinter Selector */}
                {activeSplinter === 'Dragon' && allowedSecondarySplinters.length > 0 && (
                  <div className="flex items-center gap-1 bg-slate-900 border border-orange-500/50 rounded-lg px-2 py-1 shadow-sm">
                    <span className="text-[11px] text-orange-400 font-bold">Element:</span>
                    <select
                      value={dragonSecondarySplinter}
                      onChange={(e) => handleSelectDragonSecondary(e.target.value as Splinter)}
                      className="bg-transparent text-orange-200 font-bold text-xs focus:outline-none cursor-pointer"
                      title="Choose secondary element paired with Dragon"
                    >
                      {allowedSecondarySplinters.map((s) => (
                        <option key={s} value={s} className="bg-slate-900 text-slate-200 font-bold">
                          {s}
                        </option>
                      ))}
                    </select>
                  </div>
                )}

                {/* Summoner Level */}
                <div className="flex items-center gap-1.5 bg-slate-900 border border-slate-700 rounded-lg px-2.5 py-1.5">
                  <span className="text-xs text-slate-400 font-bold">Lv:</span>
                  <select
                    value={summonerLevel}
                    onChange={(e) => setSummonerLevel(parseInt(e.target.value) || 1)}
                    className="bg-transparent text-amber-300 font-bold text-xs focus:outline-none cursor-pointer"
                  >
                    {(selectedSummoner?.stats || [{ level: 1 }])
                      .filter((s) => s.level <= (selectedSummoner ? getCardOwnership(selectedSummoner).maxLevel : 1))
                      .map((s) => (
                        <option key={s.level} value={s.level} className="bg-slate-900 text-slate-200">
                          {s.level}
                        </option>
                      ))}
                  </select>
                </div>

                {/* Visual Picker Trigger Button */}
                <button
                  type="button"
                  onClick={() => setIsSummonerModalOpen(true)}
                  disabled={effectiveSummoners.length === 0}
                  className="px-3.5 py-1.5 bg-gradient-to-r from-amber-600 to-rose-600 hover:from-amber-500 hover:to-rose-500 disabled:opacity-40 disabled:cursor-not-allowed text-white text-xs font-bold rounded-lg shadow-md shadow-amber-600/20 transition flex items-center gap-1.5 shrink-0"
                >
                  <Sparkles className="w-3.5 h-3.5" />
                  <span>Choose Summoner</span>
                </button>
              </div>
            </div>

            {effectiveSummoners.length === 0 && (
              <div className="px-3 py-2 bg-rose-950/60 border border-rose-600/60 rounded-xl text-xs text-rose-300 font-semibold">
                No summoners in your collection match this campaign&apos;s allowed editions and splinter rules. Adjust the campaign restrictions or resync your account.
              </div>
            )}

            {/* Lineup Monster Slots */}
            <div className="space-y-2 min-h-[220px]">
              {selectedMonsters.map((m, idx) => {
                const card = cards.find((c) => c.id === m.cardId);
                const stat = card?.stats.find((s) => s.level === m.level) || card?.stats[0];
                const isTank = idx === 0;
                const ownership = card ? getCardOwnership(card) : { isOwned: true, maxLevel: 1 };

                return (
                  <div
                    key={m.cardId}
                    className={`p-2.5 rounded-xl border flex items-center justify-between gap-3 transition ${
                      isTank
                        ? 'bg-amber-950/30 border-amber-600/60 shadow-lg shadow-amber-950/20'
                        : 'bg-slate-950 border-slate-800 hover:border-slate-700'
                    }`}
                  >
                    {/* Position Badge */}
                    <div className="flex items-center gap-2.5 min-w-0">
                      <div
                        className={`w-7 h-7 rounded-lg flex items-center justify-center font-bold text-xs shrink-0 ${
                          isTank ? 'bg-amber-600 text-white' : 'bg-slate-800 text-slate-300'
                        }`}
                      >
                        {isTank ? 'TANK' : `#${idx + 1}`}
                      </div>

                      <div className="min-w-0">
                        <div className="font-bold text-sm text-slate-100 truncate flex items-center gap-1.5">
                          <span>{card?.name}</span>
                          {stat?.abilities.map((ab) => (
                            <span
                              key={ab}
                              className="text-[9px] px-1.5 py-0.2 rounded bg-slate-800 text-slate-300 font-normal"
                            >
                              {ab}
                            </span>
                          ))}
                        </div>
                        <div className="text-[11px] text-slate-400">
                          {stat?.mana} Mana • {stat?.attack} {stat?.attackType} • {stat?.speed} Spd •{' '}
                          {stat?.armor} Arm • {stat?.health} HP
                        </div>
                      </div>
                    </div>

                    {/* Level selector & Position shifts */}
                    <div className="flex items-center gap-1.5 shrink-0">
                      <select
                        value={m.level}
                        onChange={(e) => {
                          const lvl = parseInt(e.target.value) || 1;
                          const updated = [...selectedMonsters];
                          updated[idx].level = lvl;
                          setSelectedMonsters(updated);
                        }}
                        className="bg-slate-900 border border-slate-700 text-slate-200 text-xs rounded px-1.5 py-1"
                      >
                        {(card?.stats || [{ level: 1 }])
                          .filter((s) => s.level <= ownership.maxLevel)
                          .map((s) => (
                            <option key={s.level} value={s.level}>
                              Lv {s.level}
                            </option>
                          ))}
                      </select>

                      <button
                        onClick={() => moveMonster(idx, idx - 1)}
                        disabled={idx === 0}
                        className="p-1 text-slate-400 hover:text-slate-100 disabled:opacity-20 rounded hover:bg-slate-800"
                        title="Move forward"
                      >
                        <ArrowUp className="w-3.5 h-3.5" />
                      </button>

                      <button
                        onClick={() => moveMonster(idx, idx + 1)}
                        disabled={idx === selectedMonsters.length - 1}
                        className="p-1 text-slate-400 hover:text-slate-100 disabled:opacity-20 rounded hover:bg-slate-800"
                        title="Move backward"
                      >
                        <ArrowDown className="w-3.5 h-3.5" />
                      </button>

                      <button
                        onClick={() => handleRemoveMonster(idx)}
                        className="p-1 text-rose-400 hover:text-rose-300 rounded hover:bg-rose-950"
                        title="Remove from team"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                );
              })}

              {selectedMonsters.length === 0 && (
                <div className="h-44 border-2 border-dashed border-slate-800 rounded-xl flex flex-col items-center justify-center text-slate-500">
                  <Swords className="w-8 h-8 mb-2 opacity-50" />
                  <p className="text-xs font-semibold">Click cards from the right bench to add to your team.</p>
                  <p className="text-[10px] text-slate-600">Position 1 will be your frontline Tank.</p>
                </div>
              )}
            </div>

            {/* Launch Action */}
            <div className="pt-3 border-t border-slate-800 flex items-center justify-between">
              {isManaOver ? (
                <div className="flex items-center gap-1.5 text-xs text-rose-400 font-bold">
                  <AlertTriangle className="w-4 h-4" />
                  <span>Mana limit exceeded ({totalManaUsed}/{challenge.manaCap})</span>
                </div>
              ) : selectedMonsters.length === 0 ? (
                <div className="text-xs text-slate-500 italic">
                  Select at least 1 monster from the bench
                </div>
              ) : (
                <div className="text-xs text-slate-400 font-semibold">
                  Team: <strong className="text-slate-200">{selectedMonsters.length}/6 Monsters</strong>
                </div>
              )}

              <button
                onClick={handleLaunch}
                disabled={selectedMonsters.length === 0 || isManaOver}
                className="px-6 py-2.5 bg-gradient-to-r from-rose-600 via-amber-600 to-yellow-500 hover:from-rose-500 hover:to-yellow-400 disabled:opacity-40 disabled:cursor-not-allowed text-white font-extrabold rounded-xl shadow-xl shadow-rose-600/30 flex items-center gap-2 text-sm uppercase tracking-wider transition transform active:scale-95"
              >
                <Play className="w-4 h-4 fill-current" />
                Submit Team & Resolve Battle
              </button>
            </div>
          </div>
        </div>

        {/* Right Column: Card Bench / Available Monster Selection */}
        <div className="lg:col-span-5 space-y-4">
          <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-4 shadow-xl space-y-3">
            {/* Top Collection Filter Switch Bar if player collection is synced */}
            {playerCollection && (
              <div className="p-2.5 bg-slate-950 rounded-xl border border-amber-500/30 flex items-center justify-between gap-2 text-xs">
                <div className="flex items-center gap-1.5 min-w-0">
                  <User className="w-4 h-4 text-amber-400 shrink-0" />
                  <span className="truncate text-slate-300">
                    Deck Mode: <strong className="text-amber-300">@{playerCollection.username}</strong>
                  </span>
                </div>

                <div className="flex items-center gap-1 shrink-0 bg-slate-900 p-0.5 rounded-lg border border-slate-800">
                  <button
                    type="button"
                    onClick={() => {
                      setFilterMode('owned_only');
                      StorageService.setCollectionFilterMode('owned_only');
                    }}
                    className={`px-2 py-0.5 rounded text-[10px] font-bold transition ${
                      filterMode === 'owned_only'
                        ? 'bg-amber-600 text-white shadow'
                        : 'text-slate-400 hover:text-slate-200'
                    }`}
                  >
                    Owned Only
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setFilterMode('all');
                      StorageService.setCollectionFilterMode('all');
                    }}
                    className={`px-2 py-0.5 rounded text-[10px] font-bold transition ${
                      filterMode === 'all'
                        ? 'bg-amber-600 text-white shadow'
                        : 'text-slate-400 hover:text-slate-200'
                    }`}
                  >
                    All Cards
                  </button>
                </div>
              </div>
            )}

            {/* Monster Bench Header */}
            <div className="flex items-center justify-between border-b border-slate-800 pb-2">
              <h3 className="text-sm font-bold uppercase tracking-wider text-slate-200">
                Monster Bench
              </h3>
              <span className="text-xs text-amber-400 font-bold bg-amber-950/60 border border-amber-600/50 px-2 py-0.5 rounded-lg">
                {availableMonsters.length} Available
              </span>
            </div>

            {/* Quick Search Input */}
            <div className="relative">
              <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search monster by name or ability..."
                className="w-full bg-slate-950 border border-slate-800 rounded-xl pl-9 pr-8 py-1.5 text-xs text-slate-100 placeholder-slate-500 focus:outline-none focus:border-amber-500"
              />
              {searchQuery && (
                <button
                  type="button"
                  onClick={() => setSearchQuery('')}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-200"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>

            {/* Attack Type Filter Buttons */}
            <div className="space-y-1.5">
              <div className="flex items-center justify-between text-[11px] text-slate-400 font-bold">
                <span>Attack Type:</span>
                {(filterAttack !== 'ALL' || filterSplinter !== 'ALL' || searchQuery) && (
                  <button
                    type="button"
                    onClick={() => {
                      setFilterAttack('ALL');
                      setFilterSplinter('ALL');
                      setSearchQuery('');
                    }}
                    className="text-[10px] text-rose-400 hover:text-rose-300 font-medium"
                  >
                    Reset Filters
                  </button>
                )}
              </div>

              <div className="grid grid-cols-5 gap-1 text-[11px]">
                {[
                  { id: 'ALL', label: 'All' },
                  { id: 'Melee', label: 'Melee' },
                  { id: 'Ranged', label: 'Ranged' },
                  { id: 'Magic', label: 'Magic' },
                  { id: 'None', label: 'Support' },
                ].map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => setFilterAttack(item.id as any)}
                    className={`py-1 rounded-lg font-bold border transition text-center ${
                      filterAttack === item.id
                        ? 'bg-amber-600 text-white border-amber-400 shadow-sm'
                        : 'bg-slate-950 border-slate-800 text-slate-400 hover:text-slate-200 hover:border-slate-700'
                    }`}
                  >
                    {item.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Element Filter & Sort Controls */}
            <div className="grid grid-cols-2 gap-2 pt-1 border-t border-slate-800/80">
              {/* Element Dropdown */}
              <div>
                <label className="block text-[10px] font-bold text-slate-400 mb-1">Element:</label>
                <select
                  value={filterSplinter}
                  onChange={(e) => setFilterSplinter(e.target.value as any)}
                  className="w-full bg-slate-950 border border-slate-800 text-slate-300 text-xs rounded-lg px-2 py-1.5 focus:outline-none focus:border-amber-500 font-semibold cursor-pointer"
                >
                  <option value="ALL">All Elements</option>
                  {availableSplintersForBench.map((s) => (
                    <option key={s} value={s}>
                      {s}
                    </option>
                  ))}
                </select>
              </div>

              {/* Sort By Dropdown */}
              <div>
                <label className="block text-[10px] font-bold text-slate-400 mb-1">Sort By:</label>
                <select
                  value={sortBy}
                  onChange={(e) => setSortBy(e.target.value as any)}
                  className="w-full bg-slate-950 border border-slate-800 text-slate-300 text-xs rounded-lg px-2 py-1.5 focus:outline-none focus:border-amber-500 font-semibold cursor-pointer"
                >
                  <option value="mana_asc">Mana: Low → High</option>
                  <option value="mana_desc">Mana: High → Low</option>
                  <option value="speed">Speed: Highest</option>
                  <option value="attack">Attack: Highest</option>
                  <option value="health">Health: Highest</option>
                </select>
              </div>
            </div>

            {/* Grid of monster cards */}
            <div className="grid grid-cols-2 gap-3 max-h-[460px] overflow-y-auto p-1">
              {availableMonsters.map((card) => {
                const isSelected = selectedMonsters.some((m) => m.cardId === card.id);
                const ownership = getCardOwnership(card);
                return (
                  <div key={card.id} className="flex justify-center">
                    <CardPreview
                      card={card}
                      level={ownership.maxLevel}
                      compact
                      selected={isSelected}
                      disabled={isSelected || selectedMonsters.length >= 6}
                      onClick={() => handleAddMonster(card)}
                      showCustomBadge={false}
                    />
                  </div>
                );
              })}

              {availableMonsters.length === 0 && (
                <div className="col-span-2 text-center py-12 text-slate-500 text-xs space-y-2">
                  <Info className="w-6 h-6 mx-auto opacity-50" />
                  <p>No monsters match the selected filters or active summoner element.</p>
                  <button
                    type="button"
                    onClick={() => {
                      setFilterAttack('ALL');
                      setFilterSplinter('ALL');
                      setSearchQuery('');
                    }}
                    className="px-3 py-1 bg-slate-800 hover:bg-slate-700 text-amber-400 rounded-lg text-xs font-bold"
                  >
                    Clear All Filters
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* VISUAL SUMMONER SELECTOR MODAL */}
      {isSummonerModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/85 backdrop-blur-md flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-slate-900 border border-slate-700 rounded-3xl w-full max-w-4xl max-h-[85vh] overflow-y-auto p-6 space-y-4 animate-fade-in shadow-2xl">
            {/* Header */}
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-amber-600 to-rose-600 text-white font-black flex items-center justify-center text-xs">
                  SUM
                </div>
                <div>
                  <h3 className="text-lg font-bold font-fantasy text-slate-100">
                    Choose Your Battle Summoner
                  </h3>
                  <p className="text-xs text-slate-400">
                    Select a summoner aligned with this battle's allowed elements ({challenge.allowedSplinters.join(', ')}).
                  </p>
                </div>
              </div>

              <button
                type="button"
                onClick={() => setIsSummonerModalOpen(false)}
                className="p-1.5 rounded-xl hover:bg-slate-800 text-slate-400 hover:text-slate-200"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Search & Filter Bar */}
            <div className="bg-slate-950/80 border border-slate-800 rounded-2xl p-3.5 space-y-3">
              <div className="flex flex-col sm:flex-row gap-2.5 items-stretch sm:items-center justify-between">
                {/* Search Input */}
                <div className="relative flex-1">
                  <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                  <input
                    type="text"
                    value={summonerSearchQuery}
                    onChange={(e) => setSummonerSearchQuery(e.target.value)}
                    placeholder="Search summoner by name or blessing..."
                    className="w-full bg-slate-900 border border-slate-800 rounded-xl pl-9 pr-8 py-1.5 text-xs text-slate-100 placeholder-slate-500 focus:outline-none focus:border-amber-500 font-medium"
                  />
                  {summonerSearchQuery && (
                    <button
                      type="button"
                      onClick={() => setSummonerSearchQuery('')}
                      className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-200"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>

                <div className="flex items-center gap-2 justify-between sm:justify-end">
                  <span className="text-xs text-amber-400 font-bold bg-amber-950/60 border border-amber-600/50 px-2.5 py-1 rounded-lg shrink-0">
                    {filteredSummoners.length} Found
                  </span>
                  {(summonerSearchQuery || summonerFilterSplinter !== 'ALL') && (
                    <button
                      type="button"
                      onClick={() => {
                        setSummonerSearchQuery('');
                        setSummonerFilterSplinter('ALL');
                      }}
                      className="text-xs text-rose-400 hover:text-rose-300 font-semibold shrink-0"
                    >
                      Reset Filters
                    </button>
                  )}
                </div>
              </div>

              {/* Splinter Element Filter Pills */}
              <div className="flex flex-wrap items-center gap-1.5 pt-1 border-t border-slate-800/80">
                <span className="text-[11px] font-bold text-slate-400 mr-1">Splinter:</span>
                <button
                  type="button"
                  onClick={() => setSummonerFilterSplinter('ALL')}
                  className={`px-2.5 py-1 rounded-lg text-xs font-bold border transition ${
                    summonerFilterSplinter === 'ALL'
                      ? 'bg-amber-600 text-white border-amber-400 shadow-sm'
                      : 'bg-slate-900 border-slate-800 text-slate-400 hover:text-slate-200 hover:border-slate-700'
                  }`}
                >
                  All ({effectiveSummoners.length})
                </button>
                {Array.from(new Set([...challenge.allowedSplinters, 'Neutral' as Splinter])).map((splinter) => {
                  const count = effectiveSummoners.filter((s) => s.splinter === splinter).length;
                  if (count === 0) return null;
                  return (
                    <button
                      key={splinter}
                      type="button"
                      onClick={() => setSummonerFilterSplinter(splinter)}
                      className={`px-2.5 py-1 rounded-lg text-xs font-bold border transition ${
                        summonerFilterSplinter === splinter
                          ? 'bg-amber-600 text-white border-amber-400 shadow-sm'
                          : 'bg-slate-900 border-slate-800 text-slate-400 hover:text-slate-200 hover:border-slate-700'
                      }`}
                    >
                      {splinter} ({count})
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Summoners Grid */}
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4 p-1 max-h-[50vh] overflow-y-auto">
              {filteredSummoners.map((summ) => {
                const isSelected = summ.id === selectedSummonerId;
                const ownership = getCardOwnership(summ);

                return (
                  <div key={summ.id} className="flex justify-center">
                    <CardPreview
                      card={summ}
                      level={ownership.maxLevel}
                      selected={isSelected}
                      onClick={() => handleSelectSummoner(summ.id)}
                      showCustomBadge={false}
                    />
                  </div>
                );
              })}

              {filteredSummoners.length === 0 && (
                <div className="col-span-full text-center py-12 text-slate-500 text-xs space-y-2">
                  <Info className="w-6 h-6 mx-auto opacity-50" />
                  <p>No summoners match the current search query or splinter filter.</p>
                  <button
                    type="button"
                    onClick={() => {
                      setSummonerSearchQuery('');
                      setSummonerFilterSplinter('ALL');
                    }}
                    className="px-3 py-1 bg-slate-800 hover:bg-slate-700 text-amber-400 rounded-lg text-xs font-bold"
                  >
                    Clear Filters
                  </button>
                </div>
              )}
            </div>

            <div className="flex items-center justify-end pt-2 border-t border-slate-800">
              <button
                type="button"
                onClick={() => setIsSummonerModalOpen(false)}
                className="px-5 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-bold rounded-xl transition"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
