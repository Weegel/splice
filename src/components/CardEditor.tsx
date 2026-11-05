import React, { useCallback, useDeferredValue, useState } from 'react';
import { CardDefinition, Splinter, CardType, Rarity, Ability, CardStatLevel, SummonerBuffs, getCardAttacks, withCardAttacks } from '../types/card';
import { ALL_ABILITIES, ABILITY_METAS } from '../data/abilities';
import { ALL_SPLINTERS } from '../types/ruleset';
import { CardPreview, SPLINTER_BG_COLORS } from './CardPreview';
import { StorageService } from '../data/storage';
import { processImportFiles } from '../services/jsonImport';
import {
  Plus,
  Trash2,
  Copy,
  Edit,
  Download,
  Upload,
  Search,
  Filter,
  Check,
  ChevronDown,
  X,
  Sparkles,
  Info,
  Shield,
  Heart,
  Swords,
  Wind,
  Image as ImageIcon,
} from 'lucide-react';

interface CardEditorProps {
  cards: CardDefinition[];
  onCardsUpdated: () => void;
}

interface CardCatalogItemProps {
  card: CardDefinition;
  onEdit: (card: CardDefinition) => void;
  onClone: (card: CardDefinition) => void;
  onExport: (card: CardDefinition) => void;
  onDelete: (cardId: string) => void;
}

interface AbilityPickerProps {
  abilities: Ability[];
  selectedAbilities: Ability[];
  search: string;
  searchLabel: string;
  placeholder: string;
  variant: 'rose' | 'amber' | 'emerald';
  onSearchChange: (search: string) => void;
  onToggle: (ability: Ability) => void;
}

function AbilityPicker({ abilities, selectedAbilities, search, searchLabel, placeholder, variant, onSearchChange, onToggle }: AbilityPickerProps) {
  const filteredAbilities = abilities.filter((ability) => ability.toLowerCase().includes(search.trim().toLowerCase())).sort();
  const selectedStyles = {
    rose: 'border-rose-500 bg-rose-950/80 text-rose-200',
    amber: 'border-amber-500 bg-amber-950/80 text-amber-200',
    emerald: 'border-emerald-500 bg-emerald-950/80 text-emerald-200',
  };
  const checkStyles = { rose: 'text-rose-400', amber: 'text-amber-400', emerald: 'text-emerald-400' };
  return (
    <details className="group">
      <summary className="flex cursor-pointer list-none items-center justify-between gap-2 rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-xs text-slate-200 hover:border-slate-500 [&::-webkit-details-marker]:hidden">
        <span>{selectedAbilities.length ? `${selectedAbilities.length} selected` : 'Select abilities'}</span>
        <ChevronDown className="h-4 w-4 shrink-0 text-slate-400 transition group-open:rotate-180" />
      </summary>
      <div className="mt-1 w-full min-w-0 rounded-lg border border-slate-700 bg-slate-900 p-2 shadow-xl">
        <input type="search" aria-label={searchLabel} value={search} onChange={(event) => onSearchChange(event.target.value)} placeholder={placeholder}
          className="mb-2 w-full rounded border border-slate-700 bg-slate-950 px-2 py-1.5 text-xs text-slate-200 placeholder-slate-500 focus:outline-none focus:border-slate-500" />
        <div className="max-h-48 overflow-y-auto">
          {filteredAbilities.map((ability) => {
            const isSelected = selectedAbilities.includes(ability);
            return (
              <button key={ability} type="button" aria-pressed={isSelected} onClick={() => onToggle(ability)} title={ABILITY_METAS[ability]?.description}
                className={`flex w-full items-center justify-between gap-2 rounded px-2 py-1.5 text-left text-xs ${isSelected ? selectedStyles[variant] : 'text-slate-300 hover:bg-slate-800 hover:text-white'}`}>
                <span className="min-w-0 truncate">{ability}</span>
                {isSelected && <Check className={`h-3.5 w-3.5 shrink-0 ${checkStyles[variant]}`} />}
              </button>
            );
          })}
          {!filteredAbilities.length && <p className="py-3 text-center text-xs text-slate-500">No abilities match.</p>}
        </div>
      </div>
    </details>
  );
}

const CardCatalogItem = React.memo(function CardCatalogItem({ card, onEdit, onClone, onExport, onDelete }: CardCatalogItemProps) {
  return (
    <div className="relative group flex flex-col items-center">
      <CardPreview card={card} level={1} />
      <div className="mt-2 flex items-center gap-1.5 w-full justify-center">
        <button
          onClick={() => onEdit({ ...card })}
          className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 text-xs flex items-center gap-1 transition"
          title="Edit Card"
        >
          <Edit className="w-3.5 h-3.5" />
          <span>Edit</span>
        </button>
        <button
          onClick={() => onClone(card)}
          className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 text-xs flex items-center gap-1 transition"
          title="Clone / Duplicate"
        >
          <Copy className="w-3.5 h-3.5" />
          <span>Clone</span>
        </button>
        <button
          onClick={() => onExport(card)}
          className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 text-xs flex items-center gap-1 transition"
          title="Export this card as individual JSON file"
        >
          <Download className="w-3.5 h-3.5" />
        </button>
        {card.isCustom && (
          <button
            onClick={() => onDelete(card.id)}
            className="p-1.5 rounded-lg bg-rose-950/80 hover:bg-rose-900 text-rose-300 border border-rose-700/60 text-xs flex items-center gap-1 transition"
            title="Delete Custom Card"
          >
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        )}
      </div>
    </div>
  );
});

const PRESET_ART_OPTIONS: { label: string; url: string; splinter: Splinter }[] = [
  { label: 'Infernal Dragon', splinter: 'Fire', url: 'https://images.unsplash.com/photo-1579783900882-c0d3dad7b119?w=300&auto=format&fit=crop&q=80' },
  { label: 'Ocean Kraken', splinter: 'Water', url: 'https://images.unsplash.com/photo-1518709268805-4e9042af9f23?w=300&auto=format&fit=crop&q=80' },
  { label: 'Forest Treant', splinter: 'Earth', url: 'https://images.unsplash.com/photo-1511497584788-87676104235f?w=300&auto=format&fit=crop&q=80' },
  { label: 'Radiant Seraph', splinter: 'Life', url: 'https://images.unsplash.com/photo-1534447677768-be436bb09401?w=300&auto=format&fit=crop&q=80' },
  { label: 'Shadow Reaper', splinter: 'Death', url: 'https://images.unsplash.com/photo-1509198397868-475647b2a1e5?w=300&auto=format&fit=crop&q=80' },
  { label: 'Ancient Wyrm', splinter: 'Dragon', url: 'https://images.unsplash.com/photo-1563089145-599997674d42?w=300&auto=format&fit=crop&q=80' },
  { label: 'Stone Golem', splinter: 'Neutral', url: 'https://images.unsplash.com/photo-1578632767115-351597cf2477?w=300&auto=format&fit=crop&q=80' },
];

const SUMMONER_ABILITY_OPTIONS: Ability[] = [
  'Heal',
  'Tank Heal',
  'Triage',
  'Resurrect',
  'Cleanse',
  'Dispel',
];

export const CardEditor: React.FC<CardEditorProps> = ({ cards, onCardsUpdated }) => {
  // Filters
  const [searchQuery, setSearchQuery] = useState('');
  const deferredSearchQuery = useDeferredValue(searchQuery);
  const [selectedSplinter, setSelectedSplinter] = useState<Splinter | 'ALL'>('ALL');
  const [selectedType, setSelectedType] = useState<CardType | 'ALL'>('ALL');
  const [selectedRarity, setSelectedRarity] = useState<Rarity | 'ALL'>('ALL');
  const [customOnly, setCustomOnly] = useState(false);

  // Modal / Form state
  const [editingCard, setEditingCard] = useState<CardDefinition | null>(null);
  const [activeLevelTab, setActiveLevelTab] = useState<number>(1);
  const [abilitySearch, setAbilitySearch] = useState('');
  const [supportAbilitySearch, setSupportAbilitySearch] = useState('');
  const [grantedAbilitySearch, setGrantedAbilitySearch] = useState('');
  const [feedbackMessage, setFeedbackMessage] = useState<{ text: string; type: 'success' | 'error' } | null>(null);

  const resetAbilitySearches = useCallback(() => {
    setAbilitySearch('');
    setSupportAbilitySearch('');
    setGrantedAbilitySearch('');
  }, []);

  const handleEditCard = useCallback((card: CardDefinition) => {
    resetAbilitySearches();
    setActiveLevelTab(1);
    setEditingCard(card);
  }, [resetAbilitySearches]);

  const showFeedback = useCallback((text: string, type: 'success' | 'error' = 'success') => {
    setFeedbackMessage({ text, type });
    setTimeout(() => setFeedbackMessage(null), 3500);
  }, []);

  // Filtered card list
  const filteredCards = cards.filter((c) => {
    if (deferredSearchQuery && !c.name.toLowerCase().includes(deferredSearchQuery.toLowerCase())) return false;
    if (selectedSplinter !== 'ALL' && c.splinter !== selectedSplinter) return false;
    if (selectedType !== 'ALL' && c.cardType !== selectedType) return false;
    if (selectedRarity !== 'ALL' && c.rarity !== selectedRarity) return false;
    if (customOnly && !c.isCustom) return false;
    return true;
  });

  const handleCreateNew = (type: CardType = 'Monster') => {
    resetAbilitySearches();
    const newCard: CardDefinition = {
      id: '',
      name: type === 'Monster' ? 'New Custom Monster' : 'New Custom Summoner',
      splinter: 'Fire',
      cardType: type,
      rarity: 'Rare',
      isCustom: true,
      description: 'A newly forged PvE battle entity.',
      stats:
        type === 'Monster'
          ? [
              {
                level: 1,
                mana: 4,
                attack: 2,
                attackType: 'Melee',
                speed: 2,
                armor: 1,
                health: 5,
                abilities: [],
              },
            ]
          : [
              {
                level: 1,
                mana: 3,
                attack: 0,
                attackType: 'None',
                speed: 0,
                armor: 0,
                health: 0,
                abilities: [],
              },
            ],
      summonerBuffs: type === 'Summoner' ? { melee: 1 } : undefined,
    };
    setEditingCard(newCard);
    setActiveLevelTab(1);
  };

  const handleCloneCard = useCallback((card: CardDefinition) => {
    resetAbilitySearches();
    const cloned: CardDefinition = {
      ...card,
      id: '',
      name: `${card.name} (Custom Copy)`,
      isCustom: true,
      stats: card.stats.map((s) => ({ ...s, abilities: [...s.abilities] })),
      summonerBuffs: card.summonerBuffs ? { ...card.summonerBuffs } : undefined,
    };
    setEditingCard(cloned);
    setActiveLevelTab(1);
  }, [resetAbilitySearches]);

  const handleDeleteCard = useCallback((cardId: string) => {
    if (confirm('Are you sure you want to delete this custom card?')) {
      StorageService.deleteCard(cardId);
      onCardsUpdated();
      showFeedback('Card deleted successfully.');
    }
  }, [onCardsUpdated, showFeedback]);

  const handleSaveCard = () => {
    if (!editingCard) return;
    if (!editingCard.name.trim()) {
      showFeedback('Please provide a card name.', 'error');
      return;
    }
    const savedCard = StorageService.saveCard(editingCard);
    onCardsUpdated();
    setEditingCard(null);
    showFeedback(`Saved card "${savedCard.name}" as ${savedCard.id}!`);
  };

  const handleExportJson = (includeAll = false) => {
    const dataStr = StorageService.exportCardsJson(includeAll);
    const blob = new Blob([dataStr], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `splinter_cards_${includeAll ? 'all' : 'custom'}_${Date.now()}.json`;
    link.click();
    URL.revokeObjectURL(url);
    showFeedback(`Exported ${includeAll ? 'all' : 'custom'} cards JSON.`);
  };

  const handleExportSingleCard = useCallback((card: CardDefinition) => {
    const dataStr = JSON.stringify(card, null, 2);
    const blob = new Blob([dataStr], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `card_${card.id}.json`;
    link.click();
    URL.revokeObjectURL(url);
    showFeedback(`Exported card "${card.name}" JSON.`);
  }, [showFeedback]);

  const handleImportJson = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    let totalCount = 0;
    void processImportFiles(files, (content, file) => ({ content, file }))
      .then((results) => {
        const invalidFiles = results.flatMap(({ content, file }) => {
          const validation = StorageService.validateCardsJson(content);
          return validation.success ? [] : [`${file.name}: ${validation.error || 'invalid JSON'}`];
        });
        if (invalidFiles.length > 0) {
          showFeedback(`No files were imported. ${invalidFiles.join(' ')}`);
          return;
        }
        results.forEach(({ content }) => {
          const result = StorageService.importCardsJson(content);
          if (result.success) totalCount += result.count;
        });
        onCardsUpdated();
        showFeedback(`Imported ${totalCount} card(s) from ${files.length} file(s)!`);
      })
      .catch((error) => showFeedback(error.message || 'Could not import card files.', 'error'));
    e.target.value = '';
  };

  // Stat level manipulation for monsters
  const currentStatLevel =
    editingCard?.stats.find((s) => s.level === activeLevelTab) ||
    editingCard?.stats[0] || {
      level: 1,
      mana: 1,
      attack: 1,
      attackType: 'Melee',
      speed: 1,
      armor: 0,
      health: 1,
      abilities: [],
    };

  const updateCurrentStatLevel = (updated: Partial<CardStatLevel>) => {
    if (!editingCard) return;
    const stats = [...editingCard.stats];
    const idx = stats.findIndex((s) => s.level === activeLevelTab);
    if (idx >= 0) {
      stats[idx] = { ...stats[idx], ...updated };
    } else {
      stats.push({ ...currentStatLevel, level: activeLevelTab, ...updated });
    }
    setEditingCard({ ...editingCard, stats });
  };

  const toggleAbility = (ability: Ability) => {
    const abilities = [...currentStatLevel.abilities];
    const pos = abilities.indexOf(ability);
    if (pos >= 0) {
      abilities.splice(pos, 1);
    } else {
      abilities.push(ability);
    }
    updateCurrentStatLevel({ abilities });
  };

  const toggleSummonerGrantedAbility = (ability: Ability) => {
    if (!editingCard) return;
    const granted = [...(editingCard.summonerBuffs?.abilitiesGranted || [])];
    const pos = granted.indexOf(ability);
    if (pos >= 0) granted.splice(pos, 1);
    else granted.push(ability);
    setEditingCard({
      ...editingCard,
      summonerBuffs: { ...editingCard.summonerBuffs, abilitiesGranted: granted },
    });
  };

  const addLevel = () => {
    if (!editingCard) return;
    const nextLevel = (editingCard.stats[editingCard.stats.length - 1]?.level || 1) + 1;
    const prev = editingCard.stats[editingCard.stats.length - 1] || currentStatLevel;
    const newStatLevel: CardStatLevel = {
      ...prev,
      level: nextLevel,
      abilities: [...prev.abilities],
    };
    setEditingCard({
      ...editingCard,
      stats: [...editingCard.stats, newStatLevel],
    });
    setActiveLevelTab(nextLevel);
  };

  const removeCurrentLevel = () => {
    if (!editingCard || editingCard.stats.length <= 1) return;
    const filtered = editingCard.stats.filter((s) => s.level !== activeLevelTab);
    setEditingCard({ ...editingCard, stats: filtered });
    setActiveLevelTab(filtered[0].level);
  };

  return (
    <div className="space-y-6">
      {/* Toast Feedback */}
      {feedbackMessage && (
        <div
          className={`fixed bottom-6 right-6 z-50 px-4 py-3 rounded-xl shadow-2xl flex items-center gap-2 border font-medium ${
            feedbackMessage.type === 'success'
              ? 'bg-emerald-950 border-emerald-500 text-emerald-200'
              : 'bg-rose-950 border-rose-500 text-rose-200'
          }`}
        >
          {feedbackMessage.type === 'success' ? <Check className="w-5 h-5" /> : <X className="w-5 h-5" />}
          <span>{feedbackMessage.text}</span>
        </div>
      )}

      {/* Header Controls Bar */}
      <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-5 shadow-xl flex flex-col lg:flex-row items-stretch lg:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold font-fantasy text-slate-100 flex items-center gap-2">
            <Sparkles className="w-6 h-6 text-rose-500" />
            Card Studio & PvE Bestiary
          </h2>
          <p className="text-sm text-slate-400 mt-0.5">
            Design custom non-NFT cards, boss enemies, and summoners for Splinterlands challenges.
          </p>
        </div>

        {/* Action Buttons */}
        <div className="flex flex-wrap items-center gap-2">
          <button
            onClick={() => handleCreateNew('Monster')}
            className="flex items-center gap-1.5 px-4 py-2 bg-rose-600 hover:bg-rose-500 text-white font-semibold rounded-xl transition shadow-lg shadow-rose-600/20 text-sm"
          >
            <Plus className="w-4 h-4" />
            Create Monster
          </button>
          <button
            onClick={() => handleCreateNew('Summoner')}
            className="flex items-center gap-1.5 px-4 py-2 bg-amber-600 hover:bg-amber-500 text-white font-semibold rounded-xl transition shadow-lg shadow-amber-600/20 text-sm"
          >
            <Plus className="w-4 h-4" />
            Create Summoner
          </button>
          
          {/* Export Dropdown / Buttons */}
          <div className="flex items-center rounded-xl bg-slate-800 border border-slate-700 overflow-hidden">
            <button
              onClick={() => handleExportJson(false)}
              className="flex items-center gap-1.5 px-3 py-2 hover:bg-slate-700 text-slate-200 font-medium transition text-sm"
              title="Export Custom Cards to JSON"
            >
              <Download className="w-4 h-4" />
              Export Custom ({cards.filter(c => c.isCustom).length})
            </button>
            <button
              onClick={() => handleExportJson(true)}
              className="px-2.5 py-2 hover:bg-slate-700 text-slate-400 hover:text-slate-200 border-l border-slate-700 text-xs font-semibold transition"
              title="Export All Cards (Including base game cards)"
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

      {/* Filter / Search Row */}
      <div className="bg-slate-900/60 border border-slate-800/80 rounded-xl p-4 flex flex-wrap items-center gap-3">
        {/* Search */}
        <div className="relative flex-1 min-w-[220px]">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search by card name..."
            className="w-full bg-slate-950 border border-slate-800 rounded-lg pl-9 pr-3 py-2 text-sm text-slate-200 placeholder-slate-500 focus:outline-none focus:border-rose-500"
          />
        </div>

        {/* Splinter filter */}
        <select
          value={selectedSplinter}
          onChange={(e) => setSelectedSplinter(e.target.value as any)}
          className="bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-sm text-slate-200 focus:outline-none focus:border-rose-500"
        >
          <option value="ALL">All Splinters</option>
          {ALL_SPLINTERS.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>

        {/* Card Type filter */}
        <select
          value={selectedType}
          onChange={(e) => setSelectedType(e.target.value as any)}
          className="bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-sm text-slate-200 focus:outline-none focus:border-rose-500"
        >
          <option value="ALL">All Types</option>
          <option value="Monster">Monsters</option>
          <option value="Summoner">Summoners</option>
        </select>

        {/* Rarity filter */}
        <select
          value={selectedRarity}
          onChange={(e) => setSelectedRarity(e.target.value as any)}
          className="bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-sm text-slate-200 focus:outline-none focus:border-rose-500"
        >
          <option value="ALL">All Rarities</option>
          <option value="Common">Common</option>
          <option value="Rare">Rare</option>
          <option value="Epic">Epic</option>
          <option value="Legendary">Legendary</option>
        </select>

        {/* Custom Only Toggle */}
        <button
          onClick={() => setCustomOnly(!customOnly)}
          className={`px-3 py-2 rounded-lg text-xs font-semibold border transition ${
            customOnly
              ? 'bg-rose-950/80 border-rose-500 text-rose-300'
              : 'bg-slate-950 border-slate-800 text-slate-400 hover:text-slate-200'
          }`}
        >
          Custom Only ({cards.filter((c) => c.isCustom).length})
        </button>
      </div>

      {/* Cards Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
        {filteredCards.map((card) => (
          <CardCatalogItem
            key={card.id}
            card={card}
            onEdit={handleEditCard}
            onClone={handleCloneCard}
            onExport={handleExportSingleCard}
            onDelete={handleDeleteCard}
          />
        ))}
      </div>

      {filteredCards.length === 0 && (
        <div className="text-center py-16 bg-slate-900/40 border border-slate-800 rounded-2xl">
          <Info className="w-10 h-10 text-slate-600 mx-auto mb-2" />
          <p className="text-slate-400 font-medium">No cards match the selected filters.</p>
        </div>
      )}

      {/* EDIT / CREATE CARD MODAL */}
      {editingCard && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4 overflow-hidden">
          <div className="bg-slate-900 border border-slate-700 rounded-2xl w-full max-w-5xl max-h-[calc(100dvh_-_2rem)] min-h-0 overflow-hidden shadow-2xl p-6 text-slate-100 flex flex-col lg:flex-row gap-4 lg:gap-8">
            {/* Left Side: Form Controls */}
            <div className="min-h-0 min-w-0 flex-1 flex flex-col gap-5">
              <div className="shrink-0 flex items-center justify-between border-b border-slate-800 pb-3">
                <h3 className="text-xl font-bold font-fantasy text-rose-400 flex items-center gap-2">
                  <Sparkles className="w-5 h-5" />
                  {editingCard.isCustom ? 'Card Forge' : `Inspect / Edit: ${editingCard.name}`}
                </h3>
                <button
                  onClick={() => setEditingCard(null)}
                  className="p-1 rounded-lg hover:bg-slate-800 text-slate-400 hover:text-slate-200"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              {/* Name & Splinter & Rarity */}
              <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain space-y-5 pr-2 [scrollbar-gutter:stable]">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-400 mb-1">Card Name</label>
                  <input
                    type="text"
                    value={editingCard.name}
                    onChange={(e) => setEditingCard({ ...editingCard, name: e.target.value })}
                    className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-100 focus:outline-none focus:border-rose-500"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-400 mb-1">Splinter / Element</label>
                  <select
                    value={editingCard.splinter}
                    onChange={(e) => setEditingCard({ ...editingCard, splinter: e.target.value as Splinter })}
                    className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-100 focus:outline-none focus:border-rose-500"
                  >
                    {ALL_SPLINTERS.map((s) => (
                      <option key={s} value={s}>
                        {s}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-400 mb-1">Card Type</label>
                  <select
                    value={editingCard.cardType}
                    onChange={(e) => {
                      const newType = e.target.value as CardType;
                      setEditingCard({
                        ...editingCard,
                        cardType: newType,
                        summonerBuffs: newType === 'Summoner' ? { melee: 1 } : undefined,
                      });
                    }}
                    className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-100 focus:outline-none focus:border-rose-500"
                  >
                    <option value="Monster">Monster</option>
                    <option value="Summoner">Summoner</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-400 mb-1">Rarity</label>
                  <select
                    value={editingCard.rarity}
                    onChange={(e) => setEditingCard({ ...editingCard, rarity: e.target.value as Rarity })}
                    className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-100 focus:outline-none focus:border-rose-500"
                  >
                    <option value="Common">Common</option>
                    <option value="Rare">Rare</option>
                    <option value="Epic">Epic</option>
                    <option value="Legendary">Legendary</option>
                  </select>
                </div>
              </div>

              {/* Artwork URL & Presets */}
              <div>
                <label className="block text-xs font-semibold text-slate-400 mb-1">Artwork Image URL</label>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={editingCard.imageUrl || ''}
                    onChange={(e) => setEditingCard({ ...editingCard, imageUrl: e.target.value })}
                    placeholder="https://... (or pick a preset below)"
                    className="flex-1 bg-slate-950 border border-slate-700 rounded-lg px-3 py-1.5 text-xs text-slate-200 focus:outline-none focus:border-rose-500"
                  />
                  {editingCard.imageUrl && (
                    <button
                      onClick={() => setEditingCard({ ...editingCard, imageUrl: undefined })}
                      className="px-2 py-1 bg-slate-800 text-xs rounded hover:bg-slate-700 text-slate-300"
                    >
                      Clear
                    </button>
                  )}
                </div>
                <div className="flex flex-wrap gap-1.5 mt-2">
                  <span className="text-[10px] text-slate-500 self-center">Presets:</span>
                  {PRESET_ART_OPTIONS.map((preset) => (
                    <button
                      key={preset.label}
                      type="button"
                      onClick={() => setEditingCard({ ...editingCard, imageUrl: preset.url })}
                      className="text-[10px] px-2 py-0.5 rounded bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-300"
                    >
                      {preset.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* MONSTER STATS & LEVEL TABS */}
              {editingCard.cardType === 'Monster' ? (
                <div className="bg-slate-950 border border-slate-800 rounded-xl p-4 space-y-4">
                  {/* Level selection tabs */}
                  <div className="flex items-center justify-between border-b border-slate-800 pb-2">
                    <div className="flex items-center gap-1 overflow-x-auto">
                      <span className="text-xs text-slate-400 font-bold mr-1">Levels:</span>
                      {editingCard.stats.map((s) => (
                        <button
                          key={s.level}
                          onClick={() => setActiveLevelTab(s.level)}
                          className={`px-3 py-1 text-xs font-bold rounded-lg transition ${
                            activeLevelTab === s.level
                              ? 'bg-rose-600 text-white shadow'
                              : 'bg-slate-900 text-slate-400 hover:text-slate-200 border border-slate-800'
                          }`}
                        >
                          Lv {s.level}
                        </button>
                      ))}
                      <button
                        onClick={addLevel}
                        className="px-2 py-1 text-xs font-bold rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 flex items-center gap-0.5"
                        title="Add next level"
                      >
                        <Plus className="w-3.5 h-3.5" /> Level
                      </button>
                    </div>

                    {editingCard.stats.length > 1 && (
                      <button
                        onClick={removeCurrentLevel}
                        className="text-xs text-rose-400 hover:text-rose-300"
                        title="Delete current level"
                      >
                        Delete Lv {activeLevelTab}
                      </button>
                    )}
                  </div>

                  {/* Core Combat Stats */}
                  <div className="grid grid-cols-2 sm:grid-cols-4 md:grid-cols-7 gap-3">
                    {/* Mana */}
                    <div>
                      <label className="block text-[11px] font-bold text-blue-400 mb-1">Mana Cost</label>
                      <input
                        type="number"
                        min="0"
                        max="20"
                        value={currentStatLevel.mana}
                        onChange={(e) => updateCurrentStatLevel({ mana: parseInt(e.target.value) || 0 })}
                        className="w-full bg-slate-900 border border-slate-700 rounded px-2 py-1 text-sm font-bold text-center text-blue-300"
                      />
                    </div>

                    {(['Melee', 'Ranged', 'Magic'] as const).map((type) => (
                      <div key={type}>
                        <label htmlFor={`card-attack-${type}`} className="block text-[11px] font-bold text-orange-400 mb-1">{type}</label>
                        <input
                          id={`card-attack-${type}`}
                          type="number"
                          min="0"
                          max="20"
                          value={getCardAttacks(currentStatLevel)[type] || 0}
                          onChange={(event) => updateCurrentStatLevel(withCardAttacks({
                            ...getCardAttacks(currentStatLevel),
                            [type]: Math.max(0, Math.min(20, parseInt(event.target.value) || 0)),
                          }))}
                          className="w-full bg-slate-900 border border-slate-700 rounded px-2 py-1 text-sm font-bold text-center text-orange-300"
                        />
                      </div>
                    ))}

                    {/* Speed */}
                    <div>
                      <label className="block text-[11px] font-bold text-sky-400 mb-1">Speed</label>
                      <input
                        type="number"
                        min="1"
                        max="20"
                        value={currentStatLevel.speed}
                        onChange={(e) => updateCurrentStatLevel({ speed: Math.max(1, parseInt(e.target.value) || 1) })}
                        className="w-full bg-slate-900 border border-slate-700 rounded px-2 py-1 text-sm font-bold text-center text-sky-300"
                      />
                    </div>

                    {/* Armor */}
                    <div>
                      <label className="block text-[11px] font-bold text-yellow-400 mb-1">Armor</label>
                      <input
                        type="number"
                        min="0"
                        max="20"
                        value={currentStatLevel.armor}
                        onChange={(e) => updateCurrentStatLevel({ armor: parseInt(e.target.value) || 0 })}
                        className="w-full bg-slate-900 border border-slate-700 rounded px-2 py-1 text-sm font-bold text-center text-yellow-300"
                      />
                    </div>

                    {/* Health */}
                    <div>
                      <label className="block text-[11px] font-bold text-rose-400 mb-1">Health</label>
                      <input
                        type="number"
                        min="1"
                        max="50"
                        value={currentStatLevel.health}
                        onChange={(e) => updateCurrentStatLevel({ health: Math.max(1, parseInt(e.target.value) || 1) })}
                        className="w-full bg-slate-900 border border-slate-700 rounded px-2 py-1 text-sm font-bold text-center text-rose-300"
                      />
                    </div>
                  </div>

                  {/* Abilities Selector */}
                  <div>
                    <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
                      <label className="text-xs font-bold text-slate-300 flex items-center gap-1">
                        <Sparkles className="w-3.5 h-3.5 text-rose-400" />
                        Abilities for Level {activeLevelTab} ({currentStatLevel.abilities.length} selected):
                      </label>
                    </div>
                    <AbilityPicker abilities={ALL_ABILITIES} selectedAbilities={currentStatLevel.abilities} search={abilitySearch}
                      searchLabel="Search monster abilities" placeholder="Search abilities..." variant="rose"
                      onSearchChange={setAbilitySearch} onToggle={toggleAbility} />
                  </div>
                </div>
              ) : (
                /* SUMMONER BUFF CONFIGURATION */
                <div className="bg-slate-950 border border-slate-800 rounded-xl p-4 space-y-4">
                  <h4 className="text-xs font-bold uppercase tracking-wider text-amber-400">
                    Summoner Stat Modifiers
                  </h4>

                  <div className="max-w-xs">
                    <label className="block text-[11px] font-bold text-blue-400 mb-1" htmlFor="summoner-mana-cost">
                      Mana Cost
                    </label>
                    <input
                      id="summoner-mana-cost"
                      type="number"
                      min="0"
                      max="99"
                      value={currentStatLevel.mana}
                      onChange={(event) => updateCurrentStatLevel({ mana: Math.max(0, parseInt(event.target.value, 10) || 0) })}
                      className="w-full bg-slate-900 border border-slate-700 rounded px-2 py-1 text-sm font-bold text-blue-300"
                    />
                  </div>

                  {/* Summoner abilities */}
                  <div>
                    <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
                      <div>
                        <span className="text-xs text-slate-300 font-semibold block">Summoner Support Abilities</span>
                        <span className="text-[10px] text-slate-500">Team-interaction abilities this summoner provides at level {activeLevelTab}.</span>
                      </div>
                    </div>
                    <AbilityPicker abilities={SUMMONER_ABILITY_OPTIONS} selectedAbilities={currentStatLevel.abilities} search={supportAbilitySearch}
                      searchLabel="Search summoner support abilities" placeholder="Search support abilities..." variant="amber"
                      onSearchChange={setSupportAbilitySearch} onToggle={toggleAbility} />
                  </div>

                  {/* Granted abilities */}
                  <div>
                    <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
                      <div>
                      <span className="text-xs text-slate-300 font-semibold block">Grant Abilities to Friendly Monsters</span>
                      <span className="text-[10px] text-slate-500">Selected abilities are added to every friendly monster.</span>
                      </div>
                    </div>
                    <AbilityPicker abilities={ALL_ABILITIES} selectedAbilities={editingCard.summonerBuffs?.abilitiesGranted || []} search={grantedAbilitySearch}
                      searchLabel="Search granted abilities" placeholder="Search granted abilities..." variant="emerald"
                      onSearchChange={setGrantedAbilitySearch} onToggle={toggleSummonerGrantedAbility} />
                  </div>

                  {/* Friendly Team Buffs */}
                  <div>
                    <span className="text-xs text-slate-400 font-semibold mb-1 block">Friendly Team Buffs</span>
                    <div className="grid grid-cols-3 sm:grid-cols-6 gap-2">
                      {['melee', 'ranged', 'magic', 'speed', 'armor', 'health'].map((stat) => (
                        <div key={stat}>
                          <label className="block text-[10px] uppercase font-bold text-slate-400 mb-1">{stat}</label>
                          <input
                            type="number"
                            min="-5"
                            max="5"
                            value={(editingCard.summonerBuffs as any)?.[stat] || 0}
                            onChange={(e) => {
                              const val = parseInt(e.target.value) || 0;
                              setEditingCard({
                                ...editingCard,
                                summonerBuffs: { ...editingCard.summonerBuffs, [stat]: val },
                              });
                            }}
                            className="w-full bg-slate-900 border border-slate-700 rounded px-2 py-1 text-xs text-center text-slate-200 font-bold"
                          />
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Enemy Debuffs */}
                  <div>
                    <span className="text-xs text-slate-400 font-semibold mb-1 block">Enemy Team Debuffs</span>
                    <div className="grid grid-cols-3 sm:grid-cols-6 gap-2">
                      {[
                        { key: 'enemyMelee', label: 'En. Melee' },
                        { key: 'enemyRanged', label: 'En. Ranged' },
                        { key: 'enemyMagic', label: 'En. Magic' },
                        { key: 'enemySpeed', label: 'En. Speed' },
                        { key: 'enemyArmor', label: 'En. Armor' },
                        { key: 'enemyHealth', label: 'En. Health' },
                      ].map(({ key, label }) => (
                        <div key={key}>
                          <label className="block text-[10px] font-bold text-slate-400 mb-1">{label}</label>
                          <input
                            type="number"
                            min="-5"
                            max="5"
                            value={(editingCard.summonerBuffs as any)?.[key] || 0}
                            onChange={(e) => {
                              const val = parseInt(e.target.value) || 0;
                              setEditingCard({
                                ...editingCard,
                                summonerBuffs: { ...editingCard.summonerBuffs, [key]: val },
                              });
                            }}
                            className="w-full bg-slate-900 border border-slate-700 rounded px-2 py-1 text-xs text-center text-rose-300 font-bold"
                          />
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              )}

              {/* Description / Lore */}
              <div>
                <label className="block text-xs font-semibold text-slate-400 mb-1">Description / Lore</label>
                <textarea
                  value={editingCard.description || ''}
                  onChange={(e) => setEditingCard({ ...editingCard, description: e.target.value })}
                  rows={2}
                  className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-xs text-slate-200 focus:outline-none focus:border-rose-500"
                  placeholder="Tell the story of this card..."
                />
              </div>

              {/* Footer Save & Cancel Buttons */}
              </div>
              <div className="shrink-0 flex flex-wrap items-center justify-end gap-3 pt-3 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => setEditingCard(null)}
                  className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 font-semibold text-sm transition"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleSaveCard}
                  className="px-6 py-2 rounded-xl bg-rose-600 hover:bg-rose-500 text-white font-bold text-sm shadow-lg shadow-rose-600/30 transition flex items-center gap-1.5"
                >
                  <Check className="w-4 h-4" />
                  Save Card to Bestiary
                </button>
              </div>
            </div>

            {/* Right Side: Live Card Preview */}
            <div className="lg:w-64 max-h-[25dvh] lg:max-h-none overflow-y-auto overscroll-contain flex flex-col items-center p-4 bg-slate-950/80 border border-slate-800 rounded-2xl shrink-0 [&>*]:shrink-0">
              <span className="text-xs font-bold text-slate-400 mb-3 uppercase tracking-wider">
                Live Card Preview
              </span>
              <CardPreview card={editingCard} level={activeLevelTab} />
              <p className="text-[11px] text-slate-500 text-center mt-4">
                This preview reflects exactly how this card appears during battle setup and resolution.
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
