import React, { useEffect, useState } from 'react';
import { SplinterlandsApiService, PlayerCollectionState } from '../services/splinterlandsApi';
import { StorageService } from '../data/storage';
import { isOfficialSplCardId } from '../data/cardIds';
import { CardDefinition } from '../types/card';
import { CardPreview } from './CardPreview';
import {
  User,
  RefreshCw,
  Check,
  X,
  Sparkles,
  ShieldCheck,
  Layers,
  AlertCircle,
  ExternalLink,
  Crown,
  Database,
  SlidersHorizontal,
} from 'lucide-react';

interface PlayerProfileModalProps {
  isOpen: boolean;
  onClose: () => void;
  cards: CardDefinition[];
  playerCollection: PlayerCollectionState | null;
  onCollectionUpdated: (newCollection: PlayerCollectionState | null) => void;
  filterMode: 'all' | 'owned_only';
  onFilterModeChange: (mode: 'all' | 'owned_only') => void;
  onImportDiscoveredCards?: (newCards: CardDefinition[]) => void;
}

export const PlayerProfileModal: React.FC<PlayerProfileModalProps> = ({
  isOpen,
  onClose,
  cards,
  playerCollection,
  onCollectionUpdated,
  filterMode,
  onFilterModeChange,
  onImportDiscoveredCards,
}) => {
  const [usernameInput, setUsernameInput] = useState(playerCollection?.username || '');
  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  useEffect(() => {
    setUsernameInput(playerCollection?.username || '');
    setErrorMessage(null);
    setSuccessMessage(null);
  }, [playerCollection?.username, isOpen]);

  if (!isOpen) return null;

  const handleSyncCollection = async () => {
    if (!usernameInput.trim()) {
      setErrorMessage('Please enter a Splinterlands account username.');
      return;
    }

    setIsLoading(true);
    setErrorMessage(null);
    setSuccessMessage(null);

    try {
      const res = await SplinterlandsApiService.fetchPlayerCollection(usernameInput);
      if (res.success && res.collection) {
        StorageService.savePlayerCollection(res.collection);
        onCollectionUpdated(res.collection);

        if (res.importedCards && res.importedCards.length > 0 && onImportDiscoveredCards) {
          onImportDiscoveredCards(res.importedCards);
        }

        setSuccessMessage(
          `Successfully synced @${res.collection.username} with ${res.collection.cardsCount} cards across ${
            Object.keys(res.collection.ownedCards).length
          } unique card editions!`
        );
      } else {
        setErrorMessage(res.error || 'Failed to sync collection from Splinterlands API.');
      }
    } catch (err: any) {
      setErrorMessage(err.message || 'An unexpected error occurred while fetching collection.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleDisconnect = () => {
    if (confirm('Disconnect current Splinterlands account and clear cached collection?')) {
      StorageService.clearPlayerCollection();
      onCollectionUpdated(null);
      setUsernameInput('');
      onFilterModeChange('all');
      setSuccessMessage('Account disconnected.');
    }
  };

  // Helper to check if a card in the app matches a detail_id in the player's collection
  const getCardCollectionMeta = (card: CardDefinition) => {
    if (!playerCollection || !playerCollection.ownedCards) return null;
    let detailId: number | null = null;
    if (isOfficialSplCardId(card.id)) {
      detailId = parseInt(card.id.replace('spl_', ''));
    } else if (!isNaN(Number(card.id))) {
      detailId = Number(card.id);
    }
    if (detailId !== null && playerCollection.ownedCards[detailId]) {
      return playerCollection.ownedCards[detailId];
    }
    return null;
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/85 backdrop-blur-md flex items-center justify-center p-4 overflow-y-auto">
      <div className="menu-panel bg-slate-900 border border-slate-700 rounded-3xl w-full max-w-2xl shadow-2xl p-6 text-slate-100 space-y-6 animate-fade-in">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-800 pb-4">
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-2xl bg-gradient-to-br from-amber-600 to-rose-600 flex items-center justify-center text-white shadow-lg shadow-amber-600/30">
              <User className="w-6 h-6" />
            </div>
            <div>
              <h3 className="text-xl font-bold font-fantasy text-amber-400 flex items-center gap-2">
                Splinterlands Player Collection Sync
              </h3>
              <p className="text-xs text-slate-400">
                Connect your in-game Splinterlands account to load your real card collection & levels.
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-1.5 rounded-xl hover:bg-slate-800 text-slate-400 hover:text-slate-200 transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Username Sync Box */}
        <div className="bg-slate-950 border border-slate-800 rounded-2xl p-5 space-y-4">
          <label className="block text-xs font-bold uppercase tracking-wider text-slate-300">
            Splinterlands / Hive Username
          </label>
          <div className="flex flex-col sm:flex-row gap-2">
            <div className="relative flex-1">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500 font-bold text-sm">@</span>
              <input
                type="text"
                value={usernameInput}
                onChange={(e) => setUsernameInput(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleSyncCollection()}
                placeholder="e.g. yabapmatt, splinterlands, aggroed"
                className="w-full bg-slate-900 border border-slate-700 rounded-xl pl-8 pr-3 py-2 text-sm text-slate-100 placeholder-slate-500 focus:outline-none focus:border-amber-500 font-medium"
              />
            </div>
            <button
              onClick={handleSyncCollection}
              disabled={isLoading || !usernameInput.trim()}
              className="px-5 py-2.5 bg-gradient-to-r from-amber-600 to-rose-600 hover:from-amber-500 hover:to-rose-500 disabled:opacity-40 disabled:cursor-not-allowed text-white font-extrabold rounded-xl shadow-lg shadow-amber-600/20 text-xs uppercase tracking-wider flex items-center justify-center gap-2 transition"
            >
              <RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin' : ''}`} />
              <span>{isLoading ? 'Fetching API...' : 'Sync Collection'}</span>
            </button>
          </div>

          {/* Error & Success Feedback */}
          {errorMessage && (
            <div className="p-3 bg-rose-950/80 border border-rose-500/60 rounded-xl text-rose-300 text-xs flex items-center gap-2">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{errorMessage}</span>
            </div>
          )}
          {successMessage && (
            <div className="p-3 bg-emerald-950/80 border border-emerald-500/60 rounded-xl text-emerald-300 text-xs flex items-center gap-2">
              <Check className="w-4 h-4 shrink-0" />
              <span>{successMessage}</span>
            </div>
          )}
        </div>

        {/* Collection Status Card */}
        {playerCollection ? (
          <div className="bg-slate-950/90 border border-amber-500/40 rounded-2xl p-5 space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-800 pb-3">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-full bg-amber-500/20 border border-amber-500/50 flex items-center justify-center text-amber-400">
                  <Crown className="w-4 h-4" />
                </div>
                <div>
                  <div className="text-sm font-black text-slate-100 flex items-center gap-1.5">
                    <span>@{playerCollection.username}</span>
                    <span className="text-[10px] px-1.5 py-0.2 rounded bg-emerald-950 text-emerald-400 border border-emerald-600 font-bold">
                      ACTIVE
                    </span>
                  </div>
                  <div className="text-[11px] text-slate-400">
                    Last synced: {new Date(playerCollection.lastSynced).toLocaleString()}
                  </div>
                </div>
              </div>

              <button
                onClick={handleDisconnect}
                className="text-xs text-rose-400 hover:text-rose-300 font-semibold px-2 py-1 hover:bg-rose-950/40 rounded-lg transition"
              >
                Disconnect
              </button>
            </div>

            {/* Collection Metrics */}
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 text-center">
              <div className="p-3 bg-slate-900 rounded-xl border border-slate-800">
                <div className="text-[10px] uppercase font-bold text-slate-400">Total Cards</div>
                <div className="text-xl font-black text-amber-400 mt-0.5">
                  {playerCollection.cardsCount.toLocaleString()}
                </div>
              </div>

              <div className="p-3 bg-slate-900 rounded-xl border border-slate-800">
                <div className="text-[10px] uppercase font-bold text-slate-400">Unique Cards</div>
                <div className="text-xl font-black text-sky-400 mt-0.5">
                  {Object.keys(playerCollection.ownedCards).length}
                </div>
              </div>

              <div className="p-3 bg-slate-900 rounded-xl border border-slate-800 col-span-2 sm:col-span-1">
                <div className="text-[10px] uppercase font-bold text-slate-400">Card Source</div>
                <div className="text-xs font-bold text-emerald-400 mt-1 flex items-center justify-center gap-1">
                  <Database className="w-3.5 h-3.5" />
                  <span>Splinterlands API</span>
                </div>
              </div>
            </div>

            {/* Collection Filter Mode Setting */}
            <div className="p-4 bg-slate-900/90 rounded-xl border border-slate-800 space-y-2">
              <label className="text-xs font-bold uppercase tracking-wider text-slate-300 flex items-center gap-1.5">
                <SlidersHorizontal className="w-3.5 h-3.5 text-amber-400" />
                Deck Building Mode
              </label>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-1">
                <button
                  type="button"
                  onClick={() => {
                    StorageService.setCollectionFilterMode('owned_only');
                    onFilterModeChange('owned_only');
                  }}
                  className={`p-3 rounded-xl border text-left transition flex flex-col justify-between ${
                    filterMode === 'owned_only'
                      ? 'bg-amber-950/60 border-amber-500 text-amber-200 ring-1 ring-amber-500/50'
                      : 'bg-slate-950 border-slate-800 text-slate-400 hover:text-slate-200'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-xs">My Collection Only</span>
                    {filterMode === 'owned_only' && <Check className="w-4 h-4 text-amber-400" />}
                  </div>
                  <p className="text-[11px] text-slate-400 mt-1">
                    Only allow cards you own in @{playerCollection.username}, capped to your exact card levels.
                  </p>
                </button>

                <button
                  type="button"
                  onClick={() => {
                    StorageService.setCollectionFilterMode('all');
                    onFilterModeChange('all');
                  }}
                  className={`p-3 rounded-xl border text-left transition flex flex-col justify-between ${
                    filterMode === 'all'
                      ? 'bg-amber-950/60 border-amber-500 text-amber-200 ring-1 ring-amber-500/50'
                      : 'bg-slate-950 border-slate-800 text-slate-400 hover:text-slate-200'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-xs">Sandbox / All Cards</span>
                    {filterMode === 'all' && <Check className="w-4 h-4 text-amber-400" />}
                  </div>
                  <p className="text-[11px] text-slate-400 mt-1">
                    Free access to all base cards, custom boss cards, and max level settings.
                  </p>
                </button>
              </div>
            </div>

            {/* Owned Cards Roster Preview */}
            <div className="p-3 bg-slate-900/60 rounded-xl border border-slate-800 space-y-2">
              <div className="flex items-center justify-between text-xs font-bold text-slate-300">
                <span>Owned Card Roster ({Object.keys(playerCollection.ownedCards || {}).length} unique cards)</span>
                <span className="text-amber-400">Synced Real Levels</span>
              </div>
              <div className="flex flex-wrap gap-1.5 max-h-36 overflow-y-auto p-1">
                {Object.entries(playerCollection.ownedCards || {}).map(([detailIdStr, meta]) => {
                  const detailId = parseInt(detailIdStr);
                  const matchingCard = cards.find((c) => {
                    if (c.id === `spl_${detailId}` || c.id === `${detailId}`) return true;
                    if (playerCollection.ownedCardNames) {
                      const foundKey = Object.keys(playerCollection.ownedCardNames).find(
                        (k) => playerCollection.ownedCardNames[k]?.detailId === detailId
                      );
                      if (foundKey && c.name.toLowerCase().trim() === foundKey) return true;
                    }
                    return false;
                  });
                  return (
                    <span
                      key={detailId}
                      className="px-2 py-0.5 rounded-lg bg-slate-950 border border-slate-800 text-[11px] text-slate-300 flex items-center gap-1 font-semibold"
                    >
                      <span className="truncate max-w-[120px]">{matchingCard?.name || `Card #${detailId}`}</span>
                      <strong className="text-amber-400 bg-amber-950/60 px-1 rounded text-[10px]">
                        Lv {meta?.maxLevel || 1}
                      </strong>
                    </span>
                  );
                })}
              </div>
            </div>
          </div>
        ) : (
          <div className="p-8 text-center bg-slate-950/60 border border-slate-800 rounded-2xl space-y-2">
            <ShieldCheck className="w-10 h-10 text-slate-600 mx-auto" />
            <h4 className="font-bold text-sm text-slate-300">No Splinterlands Account Connected</h4>
            <p className="text-xs text-slate-500 max-w-sm mx-auto">
              Enter your account name above and hit "Sync Collection" to load your real-time card inventory into the simulator.
            </p>
          </div>
        )}

        {/* Footer */}
        <div className="flex items-center justify-end gap-3 pt-2 border-t border-slate-800">
          <button
            onClick={onClose}
            className="px-6 py-2.5 bg-slate-800 hover:bg-slate-700 text-slate-200 font-bold rounded-xl text-xs uppercase tracking-wider transition"
          >
            Done
          </button>
        </div>
      </div>
    </div>
  );
};
