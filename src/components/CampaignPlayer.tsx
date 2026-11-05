import React, { useState, useEffect, useCallback } from 'react';
import {
  CampaignDefinition,
  CampaignNode,
  TextCampaignNode,
  DecisionCampaignNode,
  BattleCampaignNode,
  EndCampaignNode,
  CampaignRunState,
  CampaignEffect,
  CampaignUnlockDefinition,
  CampaignPrecondition,
  CampaignShopOffer,
} from '../types/campaign';
import { CardDefinition } from '../types/card';
import { PvEChallenge, TeamSelection, BattleLog } from '../types/battle';
import { PlayerCollectionState } from '../services/splinterlandsApi';
import { StorageService } from '../data/storage';
import { getCampaignItems } from '../data/campaignItems';
import { cleanCampaignInventoryItems, createCampaignCollection, createCampaignRun, getCampaignCollection, awardCampaignCard, reconcileCampaignRunStartingConfiguration } from '../data/campaignCollection';
import { applyCampaignBattleOutcomeEffects, applyCampaignEffectSource, applyCampaignNodeEffects, canTradeCampaignBuyOffer, canTradeCampaignShopOffer, getAvailableCampaignActions, getCampaignBuyOfferPayout, tradeCampaignBuyOffer, tradeCampaignShopOffer, executeCampaignAction, getCampaignTeamManaCost, meetsCampaignPreconditions, normalizeCampaignInventory, recoverCampaignBattleMana, resolveCampaignMultiNodes, spendCampaignMana } from '../data/campaignEffects';
import { BattleEngine } from '../engine/battleEngine';
import { BattlePreparation } from './BattlePreparation';
import { BattleViewer } from './BattleViewer';
import { CardPreview } from './CardPreview';
import { CampaignEncounterGraph } from './CampaignEncounterGraph';
import {
  ArrowLeft,
  RotateCcw,
  BookOpen,
  Swords,
  GitFork,
  Award,
  Skull,
  Shield,
  ChevronRight,
  Sparkles,
  Zap,
  Info,
  CheckCircle2,
  XCircle,
  ArrowRight,
  MapPin,
  Package,
  Search,
  Store,
  X,
  ArrowRightLeft,
} from 'lucide-react';

interface CampaignPlayerProps {
  campaign: CampaignDefinition;
  cards: CardDefinition[];
  challenges: PvEChallenge[];
  playerCollection?: PlayerCollectionState | null;
  onExit: () => void;
}

function getShopEffectLabel(effect: CampaignEffect, cards: CardDefinition[], unlocks: CampaignUnlockDefinition[] = []): string {
  if (effect.type === 'campaignunlock') return `Unlock: ${effect.unlockIds.map((id) => unlocks.find((unlock) => unlock.id === id)?.name || id).join(', ')}`;
  if (effect.type === 'increase_starting_mana') return `+${effect.quantity} starting mana`;
  if (effect.type === 'set_mana_to_starting_mana') return 'Set mana to starting mana';
  if (effect.type === 'set_starting_mana') return `Starting mana: ${effect.mana}`;
  if (effect.type === 'set_mana') return effect.useStartingMana ? 'Refill mana to starting mana' : `Mana: ${effect.mana}`;
  if (effect.type === 'set_minimum_mana') return `Mana: ${effect.minimumMana}`;
  if ('cardId' in effect) return `${effect.type === 'give_card' ? 'Receive' : 'Remove'} ${cards.find((card) => card.id === effect.cardId)?.name || effect.cardId}`;
  if (effect.type === 'give_mana' || effect.type === 'remove_mana') return `${effect.type === 'give_mana' ? '+' : '-'}${effect.quantity} mana`;
  if ('object' in effect || 'resource' in effect) return `${effect.type.startsWith('give') ? 'Receive' : 'Remove'} ${effect.quantity} x ${'object' in effect ? effect.object : effect.resource}`;
  return '';
}

function getSellableInventory(offer: CampaignShopOffer, inventory: CampaignRunState['inventory'], items: ReturnType<typeof getCampaignItems>) {
  const parameter = offer.valueParameter || 'sellvalue';
  const totals = new Map<string, number>();
  for (const entry of inventory || []) {
    const item = items.find((definition) => definition.name.trim().toLowerCase() === entry.object.trim().toLowerCase());
    const value = item?.parameters?.[parameter];
    if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0 || !Number.isSafeInteger(entry.quantity) || entry.quantity <= 0) continue;
    totals.set(item!.name, (totals.get(item!.name) || 0) + entry.quantity);
  }
  return [...totals].map(([name, quantity]) => ({ name, quantity }));
}

const COLLECTION_SPLINTERS: CardDefinition['splinter'][] = ['Fire', 'Water', 'Earth', 'Life', 'Death', 'Dragon', 'Neutral'];
const COLLECTION_RARITIES: CardDefinition['rarity'][] = ['Common', 'Rare', 'Epic', 'Legendary'];
const RARITY_CARD_STYLES: Record<CardDefinition['rarity'], string> = {
  Common: 'border-slate-600/70 bg-slate-800/50',
  Rare: 'border-sky-700/60 bg-sky-950/35',
  Epic: 'border-violet-700/60 bg-violet-950/35',
  Legendary: 'border-amber-600/60 bg-amber-950/35',
};

export const CampaignPlayer: React.FC<CampaignPlayerProps> = ({
  campaign,
  cards,
  challenges,
  playerCollection,
  onExit,
}) => {
  const cardCatalog = [...new Map([...(campaign.embeddedCards || []), ...cards].map((card) => [card.id, card])).values()];
  // Campaign progress state
  const [runState, setRunState] = useState<CampaignRunState>(() => {
    const existing = StorageService.getCampaignRun(campaign.id);
    if (existing && campaign.nodes[existing.currentNodeId]) {
      const currentStartingCollection = createCampaignCollection(campaign, cardCatalog, playerCollection);
      const initialInventory = cleanCampaignInventoryItems(existing.initialInventory ?? []);
      const initialMana = existing.initialMana;
      const normalizedRun = {
        ...normalizeCampaignInventory(existing),
        initialCollection: existing.initialCollection ?? currentStartingCollection,
        initialInventory: JSON.parse(JSON.stringify(initialInventory)),
        inventory: cleanCampaignInventoryItems(existing.inventory ?? initialInventory),
        availableCampaignActionIds: existing.availableCampaignActionIds ?? (campaign.actions || []).map((action) => action.id),
        initialMana,
        mana: existing.mana ?? initialMana,
        appliedEffectSourceIds: existing.appliedEffectSourceIds ?? existing.visitedNodeIds.map((id) => `node:${id}`),
      };
      return resolveCampaignMultiNodes(reconcileCampaignRunStartingConfiguration(normalizedRun, campaign, currentStartingCollection), campaign, cardCatalog);
    }
    return resolveCampaignMultiNodes(applyCampaignNodeEffects(createCampaignRun(campaign, createCampaignCollection(campaign, cardCatalog, playerCollection)), campaign.nodes[campaign.startNodeId], cardCatalog), campaign, cardCatalog);
  });

  // Combat sub-states for Battle nodes
  const [isInBattlePrep, setIsInBattlePrep] = useState<boolean>(false);
  const [activeBattleLog, setActiveBattleLog] = useState<BattleLog | null>(null);
  const [showCollection, setShowCollection] = useState(false);
  const [showActions, setShowActions] = useState(false);
  const [buyOfferSelections, setBuyOfferSelections] = useState<Record<string, { item: string; quantity: number }>>({});
  const [collectionSearch, setCollectionSearch] = useState('');
  const [collectionSplinterFilter, setCollectionSplinterFilter] = useState<CardDefinition['splinter'] | 'ALL'>('ALL');
  const [collectionRarityFilter, setCollectionRarityFilter] = useState<CardDefinition['rarity'] | 'ALL'>('ALL');
  const [showInventory, setShowInventory] = useState(false);
  const [showUnlocks, setShowUnlocks] = useState(false);
  const [showEncounterGraph, setShowEncounterGraph] = useState(false);
  const closeEncounterGraph = useCallback(() => setShowEncounterGraph(false), []);

  // Save run state whenever it updates
  useEffect(() => {
    if (campaign.collectionSource !== 'custom' && !playerCollection && !runState.initialCollection?.length && !runState.inventory?.length && !runState.initialInventory?.length && !runState.appliedEffectSourceIds?.length && !runState.visitedNodeIds.some((id) => campaign.nodes[id]?.type === 'multi')) return;
    StorageService.saveCampaignRun(runState);
  }, [runState, campaign.collectionSource, playerCollection]);

  const currentNode: CampaignNode =
    campaign.nodes[runState.currentNodeId] || campaign.nodes[campaign.startNodeId];

  const campaignCards = [
    ...cards,
    ...(campaign.embeddedCards || []).filter(
      (embeddedCard) => !cards.some((card) => card.id === embeddedCard.id)
    ),
    ...(runState.earnedCards || []).filter(
      (earnedCard) => !cards.some((card) => card.id === earnedCard.id) &&
        !(campaign.embeddedCards || []).some((card) => card.id === earnedCard.id)
    ),
  ];
  const availableCards = getCampaignCollection(runState);
  const filteredCollectionCards = availableCards.filter((card) =>
    (collectionSplinterFilter === 'ALL' || card.splinter === collectionSplinterFilter) &&
    (collectionRarityFilter === 'ALL' || card.rarity === collectionRarityFilter) &&
    `${card.name} ${card.splinter} ${card.rarity}`.toLowerCase().includes(collectionSearch.trim().toLowerCase())
  );
  const campaignItems = getCampaignItems(campaign);
  const availableActions = getAvailableCampaignActions(runState, campaign);
  const availableShopOffers = currentNode.type === 'shop'
    ? currentNode.offers.filter((offer) => meetsCampaignPreconditions(runState, offer.preconditions))
    : [];
  const availableHubPoints = currentNode.type === 'hub'
    ? currentNode.choices.filter((building) => {
      if (!meetsCampaignPreconditions(runState, building.preconditions)) return false;
      const pointType = building.type || 'node';
      if (pointType === 'node') return Boolean(campaign.nodes[building.nextNodeId]);
      if (pointType === 'shop') return campaign.nodes[building.nextNodeId]?.type === 'shop';
      const sourceId = `poi:${currentNode.id}:${building.id}`;
      return Boolean(building.effects?.length) && !runState.appliedEffectSourceIds?.includes(sourceId);
    })
    : [];
  const getPreconditionMessage = (preconditions: CampaignPrecondition[] | undefined) => {
    const missing = (preconditions || []).filter((precondition) => !meetsCampaignPreconditions(runState, [precondition]));
    return missing.map((precondition) => {
      if (precondition.type === 'has_unlock') return `Requires unlock: ${campaign.unlocks?.find((unlock) => unlock.id === precondition.unlockId)?.name || 'Unavailable unlock'}`;
      if (precondition.type === 'has_not_unlock') return `Requires unlock not received: ${campaign.unlocks?.find((unlock) => unlock.id === precondition.unlockId)?.name || 'Unavailable unlock'}`;
      if (precondition.type === 'has_item') return `Requires ${precondition.quantity === 0 ? 'no' : `at least ${precondition.quantity}`} ${campaignItems.find((item) => item.name.toLowerCase() === precondition.item.toLowerCase())?.name || 'Unavailable item'}`;
      if (precondition.type === 'has_mana') return `Requires at least ${precondition.mana} mana`;
      const cardName = campaignCards.find((card) => card.id === precondition.cardId)?.name || 'Unavailable card';
      return precondition.type === 'card_unlocked' ? `Requires card unlocked: ${cardName}` : `Requires card not unlocked: ${cardName}`;
    }).join('; ');
  };

  // Restart campaign run
  const handleRestart = () => {
    if (confirm('Restart this campaign? All progress, including node progress, battle history, inventory, mana, unlocks, earned cards, and available actions, will be lost. The campaign will return to its starting state.')) {
      const resetState = createCampaignRun(campaign, createCampaignCollection(campaign, cardCatalog, playerCollection));
      setRunState(resolveCampaignMultiNodes(applyCampaignNodeEffects(resetState, campaign.nodes[campaign.startNodeId], cardCatalog), campaign, cardCatalog));
      setIsInBattlePrep(false);
      setActiveBattleLog(null);
    }
  };

  // Transition to target node
  const navigateToNode = (targetNodeId: string) => {
    if (!campaign.nodes[targetNodeId]) {
      alert(`Target node "${targetNodeId}" does not exist in campaign.`);
      return;
    }
    const targetNode = campaign.nodes[targetNodeId];
    setRunState((prev) => resolveCampaignMultiNodes(applyCampaignNodeEffects({
      ...prev,
      currentNodeId: targetNodeId,
      visitedNodeIds: [...prev.visitedNodeIds, targetNodeId],
      status: targetNode.type === 'end' ? 'completed' : 'in_progress',
      finalOutcome: targetNode.type === 'end' ? targetNode.outcome : undefined,
    }, targetNode, campaignCards), campaign, campaignCards));
    setIsInBattlePrep(false);
    setActiveBattleLog(null);
  };

  // Resolve challenge associated with current battle node
  const getBattleChallenge = (battleNode: BattleCampaignNode): PvEChallenge | null => {
    let challenge: PvEChallenge | null;
    if (battleNode.inlineChallenge) {
      challenge = battleNode.inlineChallenge;
    } else if (battleNode.challengeId) {
      challenge =
        challenges.find((ch) => ch.id === battleNode.challengeId) ||
        campaign.embeddedChallenges?.find((ch) => ch.id === battleNode.challengeId) ||
        null;
    } else {
      challenge = challenges[0] || null;
    }
    if (!challenge) return null;
    return {
      ...challenge,
      manaCap: campaign.campaignMana
        ? Math.max(0, runState.mana || 0)
        : Math.max(challenge.manaCap, runState.minimumMana || 0),
    };
  };

  const handleLaunchCampaignBattle = (playerTeam: TeamSelection) => {
    if (currentNode.type !== 'battle') return;
    const challenge = getBattleChallenge(currentNode);
    if (!challenge) {
      alert('Battle challenge definition could not be found.');
      return;
    }

    if (campaign.campaignMana) {
      setRunState((current) => spendCampaignMana(current, getCampaignTeamManaCost(playerTeam, campaignCards)));
    }

    const engine = new BattleEngine(
      campaignCards,
      challenge.rulesets,
      challenge.manaCap,
      playerTeam,
      challenge.enemyTeam,
      challenge.allowedSplinters
    );

    const log = engine.resolve();
    StorageService.saveBattleLog(log);
    setActiveBattleLog(log);
  };

  const handleFinishBattleViewer = () => {
    if (!activeBattleLog || currentNode.type !== 'battle') {
      setActiveBattleLog(null);
      setIsInBattlePrep(false);
      return;
    }

    const outcome = activeBattleLog.winner === 1 ? 'victory' : activeBattleLog.winner === 2 ? 'defeat' : 'draw';
    const finalBoard = activeBattleLog.events[activeBattleLog.events.length - 1]?.boardSnapshot;
    const recoveredRun = campaign.campaignMana && finalBoard
      ? recoverCampaignBattleMana(
        runState,
        finalBoard.team1.filter((monster) => monster.isAlive).map((monster) => monster.mana),
        finalBoard.team2.filter((monster) => !monster.isAlive).map((monster) => monster.mana)
      )
      : runState;
    const rewardedRun = outcome === 'victory'
      ? awardCampaignCard(recoveredRun, campaignCards.find((card) => card.id === currentNode.rewardCardId))
      : recoveredRun;

    const outcomeEffectsRun = applyCampaignBattleOutcomeEffects(
      rewardedRun,
      currentNode,
      outcome,
      activeBattleLog.id,
      campaignCards
    );

    const updatedRun: CampaignRunState = {
      ...outcomeEffectsRun,
      battleHistory: [
        ...runState.battleHistory,
        {
          nodeId: currentNode.id,
          battleLogId: activeBattleLog.id,
          outcome,
        },
      ],
    };

    setRunState(updatedRun);
    setActiveBattleLog(null);
    setIsInBattlePrep(false);

    // Branch to next node based on outcome
    if (outcome === 'victory' && currentNode.onVictoryNodeId) {
      navigateToNode(currentNode.onVictoryNodeId);
    } else if (outcome === 'defeat' && currentNode.onDefeatNodeId) {
      navigateToNode(currentNode.onDefeatNodeId);
    } else if (outcome === 'draw' && (currentNode.onDrawNodeId || currentNode.onDefeatNodeId)) {
      navigateToNode(currentNode.onDrawNodeId || currentNode.onDefeatNodeId!);
    }
  };

  return (
    <div className="space-y-6">
      {showEncounterGraph && (
        <CampaignEncounterGraph campaign={campaign} currentNodeId={runState.currentNodeId} onClose={closeEncounterGraph} />
      )}
      {/* Top Campaign Status Header */}
      <div className="bg-slate-900/95 border border-slate-800 rounded-2xl p-4 shadow-xl flex flex-col sm:flex-row items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <button
            onClick={onExit}
            className="p-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 transition flex items-center gap-1.5 text-xs font-bold"
          >
            <ArrowLeft className="w-4 h-4" />
            Exit Campaign
          </button>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-lg font-bold font-fantasy text-amber-400">{campaign.name}</h2>
            </div>
            <div className="text-xs text-slate-400 flex items-center gap-2 mt-0.5">
              <span>Chapter: {currentNode.title}</span>
              <span>•</span>
              <span>{runState.visitedNodeIds.length} Nodes Visited</span>
            </div>
          </div>
        </div>

        <div className="flex flex-wrap items-center justify-center gap-2">
          <button type="button" onClick={() => setShowEncounterGraph(true)} aria-haspopup="dialog" className="px-3 py-1.5 rounded-lg bg-slate-800 border border-slate-700 text-xs text-slate-200 flex items-center gap-1.5 hover:border-amber-500">
            <GitFork className="w-4 h-4" />
            Show Encounter Graph
          </button>
          <button
            onClick={() => setShowInventory(!showInventory)}
            aria-expanded={showInventory}
            className="px-3 py-1.5 rounded-lg bg-slate-800 border border-slate-700 text-xs text-slate-200 flex items-center gap-1.5"
          >
            <Package className="w-4 h-4" />
            Inventory ({runState.inventory?.length || 0})
          </button>
          {!!campaign.actions?.length && (
            <button type="button" onClick={() => setShowActions(true)} aria-haspopup="dialog"
              className="flex items-center gap-1.5 rounded-lg border border-slate-700 bg-slate-800 px-3 py-1.5 text-xs text-slate-200">
              <Sparkles className="h-4 w-4" /> Actions ({availableActions.length})
            </button>
          )}
          {!!campaign.unlocks?.length && (
            <button type="button" onClick={() => setShowUnlocks(!showUnlocks)} aria-expanded={showUnlocks} aria-controls="campaign-player-unlocks"
              className="flex items-center gap-1.5 rounded-lg border border-slate-700 bg-slate-800 px-3 py-1.5 text-xs text-slate-200">
              <Award className="h-4 w-4" /> Unlocks ({campaign.unlocks.filter((unlock) => runState.campaignUnlockIds?.includes(unlock.id)).length}/{campaign.unlocks.length})
            </button>
          )}
          {campaign.campaignMana && (
            <span className="px-3 py-1.5 rounded-lg bg-blue-950/70 border border-blue-800 text-xs text-blue-200 flex items-center gap-1.5">
              <Zap className="w-4 h-4" /> Mana: {runState.mana || 0}
            </span>
          )}
          <button
            onClick={() => setShowCollection(!showCollection)}
            aria-expanded={showCollection}
            aria-haspopup="dialog"
            className="px-3 py-1.5 rounded-lg bg-slate-800 border border-slate-700 text-xs text-slate-200 flex items-center gap-1.5"
          >
            <BookOpen className="w-4 h-4" />
            Collection ({availableCards.length})
          </button>
          <button
            onClick={handleRestart}
            className="px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-rose-950 text-slate-300 hover:text-rose-300 border border-slate-700 text-xs font-semibold flex items-center gap-1.5 transition"
            title="Restart campaign and lose all progress"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            Restart Campaign
          </button>
        </div>
      </div>

      {showUnlocks && (
        <section id="campaign-player-unlocks" className="border-y border-slate-800 py-4">
          <h3 className="mb-3 text-sm font-bold text-amber-300">Campaign Unlocks</h3>
          <ul className="divide-y divide-slate-800">
            {(campaign.unlocks || []).map((unlock) => {
              const earned = runState.campaignUnlockIds?.includes(unlock.id);
              return (
                <li key={unlock.id} className="flex items-start gap-3 py-3">
                  {earned ? <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-400" /> : <Shield className="h-4 w-4 shrink-0 text-slate-500" />}
                  <div className="min-w-0 flex-1 break-words">
                    <p className={`text-sm ${earned ? 'text-emerald-200' : 'text-slate-400'}`}>{unlock.name}</p>
                    {unlock.description && <p className="mt-1 text-xs text-slate-500">{unlock.description}</p>}
                  </div>
                  <span className="shrink-0 text-xs text-slate-400">{earned ? 'Unlocked' : 'Locked'}</span>
                </li>
              );
            })}
          </ul>
        </section>
      )}
      {showActions && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/85 p-4" onClick={() => setShowActions(false)} onKeyDown={(event) => {
          if (event.key === 'Escape') { event.stopPropagation(); setShowActions(false); }
        }}>
          <section role="dialog" aria-modal="true" aria-labelledby="campaign-player-actions-title" onClick={(event) => event.stopPropagation()}
            className="flex max-h-[85dvh] w-full max-w-xl flex-col overflow-hidden rounded-lg border border-slate-700 bg-slate-900 p-4 text-slate-100">
            <header className="mb-3 flex items-center justify-between gap-3">
              <div>
                <h3 id="campaign-player-actions-title" className="text-sm font-bold text-amber-300">Campaign Actions</h3>
                <p className="text-xs text-slate-500">Actions require their listed conditions.</p>
              </div>
              <button type="button" autoFocus title="Close campaign actions" aria-label="Close campaign actions" onClick={() => setShowActions(false)}
                className="flex h-8 w-8 shrink-0 items-center justify-center rounded text-slate-400 hover:bg-slate-800"><X className="h-4 w-4" /></button>
            </header>
            <div className="min-h-0 space-y-2 overflow-y-auto">
              {!availableActions.length && <p className="py-4 text-center text-xs text-slate-500">No actions are currently available.</p>}
              {availableActions.map((action) => {
                const eligible = meetsCampaignPreconditions(runState, action.preconditions);
                return (
                  <button key={action.id} type="button" disabled={!eligible}
                    onClick={() => {
                      setRunState((current) => executeCampaignAction(current, action, campaign, campaignCards));
                      setShowActions(false);
                    }}
                    className="w-full rounded-lg border border-slate-700 bg-slate-950 p-3 text-left hover:border-amber-500 disabled:cursor-not-allowed disabled:opacity-60">
                    <span className="block text-sm font-semibold text-slate-100">{action.name}</span>
                    {action.description && <span className="mt-1 block text-xs text-slate-400">{action.description}</span>}
                    {!eligible && <span className="mt-2 block text-xs text-amber-300">{getPreconditionMessage(action.preconditions)}</span>}
                  </button>
                );
              })}
            </div>
          </section>
        </div>
      )}
      {showInventory && (
        <section className="border-y border-slate-800 py-4">
          <h3 className="text-sm font-bold text-amber-300 mb-3">Campaign Inventory</h3>
          {runState.inventory?.length ? (
            <table className="w-full table-fixed text-sm text-left">
              <thead className="text-xs text-slate-400">
                <tr><th className="py-2 font-semibold">Object</th><th className="w-24 py-2 text-right font-semibold">Quantity</th></tr>
              </thead>
              <tbody className="divide-y divide-slate-800">
                {runState.inventory.map((item) => (
                  <tr key={item.id}>
                    <td className="py-2 pr-4 text-slate-200 break-words">{item.object}</td>
                    <td className="py-2 text-right text-amber-300 tabular-nums">{item.quantity}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : <p className="text-xs text-slate-500">Inventory is empty.</p>}
        </section>
      )}

      {showCollection && (
        <div
          className="fixed inset-0 z-[60] bg-black/85 flex items-center justify-center p-4"
          role="presentation"
          onClick={() => setShowCollection(false)}
          onKeyDown={(event) => {
            if (event.key === 'Escape') setShowCollection(false);
          }}
        >
          <section
            role="dialog"
            aria-modal="true"
            aria-labelledby="campaign-player-collection-title"
            onClick={(event) => event.stopPropagation()}
            className="menu-panel w-full max-w-2xl flex flex-col gap-3 bg-slate-900 border border-slate-700 rounded-lg p-4 text-slate-100"
          >
            <div className="flex items-center justify-between gap-3">
              <h3 id="campaign-player-collection-title" className="text-sm font-bold text-amber-300">
                Campaign Collection ({filteredCollectionCards.length}/{availableCards.length})
              </h3>
              <button
                type="button"
                autoFocus
                title="Close campaign collection"
                aria-label="Close campaign collection"
                onClick={() => setShowCollection(false)}
                className="w-8 h-8 shrink-0 flex items-center justify-center rounded-lg text-slate-400 hover:bg-slate-800"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="grid shrink-0 gap-2 sm:grid-cols-[minmax(0,1fr)_9rem_9rem]">
              <label className="relative min-w-0">
                <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
                <input type="search" value={collectionSearch} onChange={(event) => setCollectionSearch(event.target.value)} placeholder="Search cards"
                  aria-label="Search campaign cards" className="w-full rounded-lg border border-slate-700 bg-slate-950 py-2 pl-9 pr-3 text-xs text-slate-100 placeholder:text-slate-500 focus:border-amber-500 focus:outline-none" />
              </label>
              <select aria-label="Filter campaign cards by splinter" value={collectionSplinterFilter} onChange={(event) => setCollectionSplinterFilter(event.target.value as CardDefinition['splinter'] | 'ALL')}
                className="min-w-0 rounded-lg border border-slate-700 bg-slate-950 px-2 py-2 text-xs text-slate-200 focus:border-amber-500 focus:outline-none">
                <option value="ALL">All Splinters</option>
                {COLLECTION_SPLINTERS.map((splinter) => <option key={splinter} value={splinter}>{splinter}</option>)}
              </select>
              <select aria-label="Filter campaign cards by rarity" value={collectionRarityFilter} onChange={(event) => setCollectionRarityFilter(event.target.value as CardDefinition['rarity'] | 'ALL')}
                className="min-w-0 rounded-lg border border-slate-700 bg-slate-950 px-2 py-2 text-xs text-slate-200 focus:border-amber-500 focus:outline-none">
                <option value="ALL">All Rarities</option>
                {COLLECTION_RARITIES.map((rarity) => <option key={rarity} value={rarity}>{rarity}</option>)}
              </select>
            </div>
            <div className="min-h-0 overflow-y-auto space-y-4">
              {!filteredCollectionCards.length && <p className="py-5 text-center text-xs text-slate-500">No cards match these filters.</p>}
              {([
                { cardType: 'Summoner', label: 'Archons' },
                { cardType: 'Monster', label: 'Summons' },
              ] as const).map((group) => {
                const groupCards = filteredCollectionCards.filter((card) => card.cardType === group.cardType);
                return (
                  <section key={group.label} aria-label={group.label} className="border-t border-slate-700 pt-3">
                    <h4 className={`text-xs font-bold mb-2 ${group.cardType === 'Summoner' ? 'text-amber-300' : 'text-sky-300'}`}>
                      {group.label} ({groupCards.length})
                    </h4>
                    {groupCards.length ? (
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                        {groupCards.map((card) => (
                          <div key={card.id} className={`flex min-w-0 items-center gap-3 rounded-lg border p-2 ${RARITY_CARD_STYLES[card.rarity]}`}>
                            {card.imageUrl && <img src={card.imageUrl} alt="" className="w-10 h-14 object-contain shrink-0" />}
                            <div className="min-w-0">
                              <p className="text-sm text-slate-200 break-words">{card.name}</p>
                              <p className="text-xs text-slate-400">{card.splinter} · Level {Math.max(...card.stats.map((stat) => stat.level))}</p>
                            </div>
                          </div>
                        ))}
                      </div>
                    ) : <p className="py-2 text-xs text-slate-500">No {group.label.toLowerCase()} in the collection.</p>}
                  </section>
                );
              })}
            </div>
          </section>
        </div>
      )}

      {/* ACTIVE BATTLE VIEWER EMBED */}
      {activeBattleLog ? (
        <BattleViewer
          battleLog={activeBattleLog}
          onExit={handleFinishBattleViewer}
          onRematch={() => {
            setActiveBattleLog(null);
            setIsInBattlePrep(true);
          }}
        />
      ) : isInBattlePrep && currentNode.type === 'battle' ? (
        /* BATTLE PREPARATION EMBED */
        (() => {
          const challenge = getBattleChallenge(currentNode);
          if (!challenge) {
            return (
              <div className="p-8 text-center bg-slate-900 rounded-2xl border border-slate-800">
                <p className="text-rose-400 font-bold">Challenge definition not found.</p>
                <button
                  onClick={() => setIsInBattlePrep(false)}
                  className="mt-3 px-4 py-2 bg-slate-800 rounded-xl text-xs font-bold text-slate-200"
                >
                  Return
                </button>
              </div>
            );
          }
          return (
            <BattlePreparation
              challenge={challenge}
              cards={campaignCards}
              campaignCollection={availableCards}
              campaignMana={campaign.campaignMana}
              playerCollection={playerCollection}
                            allowedTiers={campaign.allowedTiers}
                            allowGladiators={campaign.allowGladiators}
                            allowRuni={campaign.allowRuni}
              maxCardLevel={campaign.maxCardLevel}
                            maxCardLevelsByRarity={campaign.maxCardLevelsByRarity}
              onBack={() => setIsInBattlePrep(false)}
              onLaunchBattle={handleLaunchCampaignBattle}
            />
          );
        })()
      ) : (
        /* NARRATIVE / DECISION / BATTLE BRIEFING CONTAINER */
        <div className="bg-slate-900/90 border border-slate-800 rounded-3xl p-6 sm:p-8 shadow-2xl space-y-8 relative overflow-hidden max-w-4xl mx-auto">
          {/* Background Ambient Glow */}
          <div className="absolute top-0 right-0 w-96 h-96 bg-amber-500/5 rounded-full blur-3xl pointer-events-none" />

          {/* 1. TEXT / LORE NODE */}
          {currentNode.type === 'text' && (
            <div className="space-y-6 animate-fade-in">
              <div className="flex items-center gap-3 border-b border-slate-800 pb-4">
                {currentNode.speakerAvatarUrl ? (
                  <img
                    src={currentNode.speakerAvatarUrl}
                    alt={currentNode.speakerName || 'Speaker'}
                    className="w-14 h-14 rounded-2xl object-cover border-2 border-amber-500/60 shadow-lg"
                  />
                ) : (
                  <div className="w-14 h-14 rounded-2xl bg-amber-600/20 border-2 border-amber-500/40 flex items-center justify-center text-amber-400 font-bold">
                    <BookOpen className="w-6 h-6" />
                  </div>
                )}
                <div>
                  <h3 className="text-xl font-bold font-fantasy text-slate-100">{currentNode.title}</h3>
                  {currentNode.speakerName && (
                    <span className="text-xs font-bold text-amber-400 uppercase tracking-wider">
                      {currentNode.speakerName}
                    </span>
                  )}
                </div>
              </div>

              {/* Story Narrative Box */}
              <div className="bg-slate-950/80 border border-slate-800 rounded-2xl p-6 shadow-inner text-slate-200 text-sm sm:text-base leading-relaxed whitespace-pre-line font-sans">
                {currentNode.content}
              </div>

              {/* Action Continue Button */}
              <div className="flex justify-end pt-2">
                <button
                  onClick={() => {
                    if (currentNode.nextNodeId) {
                      navigateToNode(currentNode.nextNodeId);
                    } else {
                      alert('This story path reaches an open conclusion.');
                    }
                  }}
                  className="px-6 py-3 bg-gradient-to-r from-amber-600 to-rose-600 hover:from-amber-500 hover:to-rose-500 text-white font-extrabold rounded-2xl shadow-xl shadow-amber-600/30 flex items-center gap-2 text-sm uppercase tracking-wider transition transform active:scale-95"
                >
                  <span>{currentNode.buttonText || 'Continue Adventure'}</span>
                  <ArrowRight className="w-4 h-4" />
                </button>
              </div>
            </div>
          )}

          {/* 2. DECISION NODE */}
          {currentNode.type === 'decision' && (
            <div className="space-y-6 animate-fade-in">
              <div className="flex items-center gap-3 border-b border-slate-800 pb-4">
                <div className="w-12 h-12 rounded-2xl bg-amber-600/20 border-2 border-amber-500/40 flex items-center justify-center text-amber-400">
                  <GitFork className="w-6 h-6" />
                </div>
                <div>
                  <h3 className="text-xl font-bold font-fantasy text-slate-100">{currentNode.title}</h3>
                  <span className="text-xs font-bold text-amber-400 uppercase tracking-wider">
                    Crossroads & Strategic Choice
                  </span>
                </div>
              </div>

              {/* Decision Question Prompt */}
              <div className="bg-slate-950/90 border border-slate-800 rounded-2xl p-5 shadow-inner">
                <p className="text-sm sm:text-base font-semibold text-slate-200 leading-relaxed">
                  {currentNode.prompt}
                </p>
              </div>

              {/* Choices Options Grid */}
              <div className="space-y-3">
                {currentNode.choices.map((choice, idx) => (
                  <button
                    key={choice.id}
                    disabled={!meetsCampaignPreconditions(runState, choice.preconditions)}
                    onClick={() => {
                      if (!meetsCampaignPreconditions(runState, choice.preconditions)) return;
                      if (choice.nextNodeId) {
                        navigateToNode(choice.nextNodeId);
                      } else {
                        alert('This choice has no linked destination.');
                      }
                    }}
                    className="w-full text-left p-4 sm:p-5 rounded-2xl border-2 border-slate-800 enabled:hover:border-amber-500 bg-slate-950/80 enabled:hover:bg-slate-900/90 disabled:opacity-50 disabled:cursor-not-allowed transition-all group shadow-lg flex items-center justify-between gap-4 select-none"
                  >
                    <div className="space-y-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="w-6 h-6 rounded-full bg-slate-800 group-hover:bg-amber-600 text-slate-300 group-hover:text-white font-bold text-xs flex items-center justify-center shrink-0 transition">
                          {idx + 1}
                        </span>
                        <span className="font-bold text-slate-100 group-hover:text-amber-300 text-sm sm:text-base">
                          {choice.text}
                        </span>
                      </div>
                      {choice.description && (
                        <p className="text-xs text-slate-400 pl-8">{choice.description}</p>
                      )}
                      {!meetsCampaignPreconditions(runState, choice.preconditions) && (
                        <p className="break-words pl-8 text-xs text-amber-300">{getPreconditionMessage(choice.preconditions)}</p>
                      )}
                      {choice.consequenceSummary && (
                        <p className="text-[11px] text-amber-400/90 font-medium pl-8 italic">
                          ⚡ {choice.consequenceSummary}
                        </p>
                      )}
                    </div>

                    <ChevronRight className="w-5 h-5 text-slate-500 group-hover:text-amber-400 group-hover:translate-x-1 transition shrink-0" />
                  </button>
                ))}
              </div>
            </div>
          )}

          {currentNode.type === 'hub' && (
            <div className="space-y-6 animate-fade-in">
              <div className="flex items-center gap-3 border-b border-slate-800 pb-4">
                <MapPin className="w-8 h-8 text-teal-400 shrink-0" />
                <div className="min-w-0">
                  <h3 className="text-xl font-bold font-fantasy text-slate-100 break-words">{currentNode.title}</h3>
                  <span className="text-xs font-bold text-teal-400">Points of Interest</span>
                </div>
              </div>
              <p className="text-sm text-slate-200 leading-relaxed whitespace-pre-line">{currentNode.prompt}</p>
              {currentNode.description && <p className="text-sm text-slate-400">{currentNode.description}</p>}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {availableHubPoints.map((building) => {
                  const pointType = building.type || 'node';
                  const PointIcon = pointType === 'event' ? Zap : pointType === 'shop' ? Store : MapPin;
                  const destination = pointType === 'node' || pointType === 'shop' ? campaign.nodes[building.nextNodeId] : undefined;
                  const description = pointType === 'shop' ? (destination?.type === 'shop' ? destination.description : undefined) : building.description;
                  const visited = (pointType === 'node' || pointType === 'shop') && runState.visitedNodeIds.includes(building.nextNodeId);
                  const effectSourceId = `poi:${currentNode.id}:${building.id}`;
                  const completed = runState.appliedEffectSourceIds?.includes(effectSourceId);
                  return (
                    <button
                      key={building.id}
                      type="button"
                      onClick={() => {
                        if (pointType === 'node' || pointType === 'shop') navigateToNode(building.nextNodeId);
                        else if (pointType === 'event') setRunState((current) => meetsCampaignPreconditions(current, building.preconditions) ? applyCampaignEffectSource(current, effectSourceId, building.effects, campaignCards) : current);
                      }}
                      className="min-w-0 text-left rounded-lg border border-slate-700 bg-slate-950/80 overflow-hidden hover:border-teal-500 transition group"
                    >
                      {building.imageUrl ? (
                        <img src={building.imageUrl} alt="" className="w-full aspect-[16/9] object-cover" />
                      ) : (
                        <div className="aspect-[16/9] bg-teal-950/30 flex items-center justify-center">
                          <PointIcon className="w-12 h-12 text-teal-500" />
                        </div>
                      )}
                      <div className="p-4 space-y-2">
                        <span className="text-xs text-teal-400">{pointType === 'event' ? 'Event' : pointType === 'shop' ? 'Shop' : 'Node'}</span>
                        <div className="flex items-center justify-between gap-2">
                          <h4 className="font-bold text-slate-100 group-hover:text-teal-300 break-words min-w-0">{building.text}</h4>
                          <ChevronRight className="w-4 h-4 text-teal-400 shrink-0" />
                        </div>
                        {description && <p className="text-xs text-slate-400 break-words">{description}</p>}
                        <span className="text-xs text-teal-400">{pointType === 'event' ? completed ? 'Completed' : 'Activate' : visited ? 'Visited' : pointType === 'shop' ? 'Browse' : 'Visit'}</span>
                      </div>
                    </button>
                  );
                })}
              </div>
              {!availableHubPoints.length && <p className="text-xs text-slate-500">No available points of interest.</p>}
            </div>
          )}

          {currentNode.type === 'multi' && (
            <div role="alert" className="space-y-2">
              <h3 className="text-lg font-bold text-slate-100">{currentNode.title}</h3>
              <p className="text-sm text-rose-300">This multi outcome could not be resolved. No eligible destination, or a route cycle, was found.</p>
            </div>
          )}

          {currentNode.type === 'shop' && (
            <section className="space-y-4 animate-fade-in">
              <div className="flex items-center gap-3 border-b border-slate-800 pb-4">
                <Store className="h-8 w-8 shrink-0 text-lime-400" />
                <h3 className="min-w-0 break-words text-xl font-bold font-fantasy text-slate-100">{currentNode.title}</h3>
              </div>
              {currentNode.description && <p className="whitespace-pre-line text-sm text-slate-300">{currentNode.description}</p>}
              <div className="max-h-[min(50dvh,32rem)] divide-y divide-slate-800 overflow-y-auto overscroll-contain pr-2 [scrollbar-gutter:stable]">
                {!currentNode.offers.length && <p className="py-4 text-sm text-slate-500">No offers</p>}
                {currentNode.offers.length > 0 && !availableShopOffers.length && <p className="py-4 text-sm text-slate-500">No available offers</p>}
                {availableShopOffers.map((offer) => {
                  if (offer.offerType === 'buy') {
                    const sellableItems = getSellableInventory(offer, runState.inventory, campaignItems);
                    const savedSelection = buyOfferSelections[offer.id];
                    const selectedItem = sellableItems.find((item) => item.name === savedSelection?.item) || sellableItems[0];
                    const quantity = selectedItem ? Math.min(Math.max(1, savedSelection?.quantity || 1), selectedItem.quantity) : 1;
                    const payout = selectedItem ? getCampaignBuyOfferPayout(offer, selectedItem.name, quantity, campaignItems) : null;
                    const canSell = Boolean(selectedItem && payout !== null && meetsCampaignPreconditions(runState, offer.preconditions) && canTradeCampaignBuyOffer(runState, offer, selectedItem.name, quantity, campaignItems));
                    return (
                      <article key={offer.id} className="space-y-3 border-b border-slate-800 py-4">
                        <div className="min-w-0 space-y-1">
                          <h4 className="break-words text-sm font-bold text-lime-300">{offer.title || 'Buy Items'}</h4>
                          {offer.valueParameter && <p className="text-xs text-slate-400">Pays by {offer.valueParameter}</p>}
                          {Boolean(offer.effects?.length) && <ul className="space-y-1 text-xs text-amber-300">{offer.effects.map((effect) => <li key={effect.id}>{getShopEffectLabel(effect, campaignCards, campaign.unlocks)}</li>)}</ul>}
                        </div>
                        <div className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_6rem_auto] sm:items-end">
                          <label className="block min-w-0 text-xs text-slate-400">Sell item
                            <select value={selectedItem?.name || ''} aria-label={`Sell item for ${offer.title || 'buy offer'}`}
                              onChange={(event) => setBuyOfferSelections((current) => ({ ...current, [offer.id]: { item: event.target.value, quantity: 1 } }))}
                              className="mt-1 w-full min-w-0 rounded-lg border border-slate-700 bg-slate-950 px-2 py-2 text-xs text-slate-100">
                              <option value="">Select item</option>
                              {sellableItems.map((item) => <option key={item.name} value={item.name}>{item.name} ({item.quantity})</option>)}
                            </select>
                          </label>
                          <label className="block text-xs text-slate-400">Quantity
                            <input type="number" min="1" max={selectedItem?.quantity || 1} step="1" value={quantity} aria-label={`Sell quantity for ${offer.title || 'buy offer'}`}
                              disabled={!selectedItem}
                              onChange={(event) => setBuyOfferSelections((current) => ({ ...current, [offer.id]: { item: selectedItem?.name || '', quantity: Math.max(1, Math.min(selectedItem?.quantity || 1, Math.floor(Number(event.target.value) || 1))) } }))}
                              className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-950 px-2 py-2 text-xs text-slate-100 disabled:opacity-50" />
                          </label>
                          <button type="button" disabled={!canSell} aria-label={`Sell ${selectedItem?.name || 'item'} to ${offer.title || 'offer'}`}
                            title={!meetsCampaignPreconditions(runState, offer.preconditions) ? getPreconditionMessage(offer.preconditions) : canSell ? 'Sell selected items' : 'No eligible item or payout currency'}
                            onClick={() => selectedItem && setRunState((current) => current.currentNodeId === currentNode.id ? tradeCampaignBuyOffer(current, offer, selectedItem.name, quantity, campaignItems, campaignCards) : current)}
                            className="flex shrink-0 items-center justify-center gap-2 rounded-lg border border-lime-700 bg-lime-950 px-3 py-2 text-xs font-bold text-lime-200 hover:bg-lime-900 disabled:cursor-not-allowed disabled:opacity-40">
                            <ArrowRightLeft className="h-4 w-4" /> Sell
                          </button>
                        </div>
                        <p className="text-xs text-slate-400">Receive {payout ?? 0} x {offer.currencyObject || 'No currency selected'}</p>
                        {!sellableItems.length && <p className="text-xs text-slate-500">No inventory items have this value property.</p>}
                      </article>
                    );
                  }
                  const affordable = canTradeCampaignShopOffer(runState, offer, campaignCards);
                  return (
                    <article key={offer.id} className="flex flex-wrap items-center justify-between gap-3 py-4">
                      <div className="min-w-0 flex-1 space-y-2">
                        <h4 className="break-words text-sm font-bold text-lime-300">{offer.title || 'Offer'}</h4>
                        {Boolean(offer.effects?.length) && <ul className="space-y-1 text-xs text-amber-300">
                          {offer.effects?.map((effect) => <li key={effect.id}>{getShopEffectLabel(effect, campaignCards, campaign.unlocks)}</li>)}
                        </ul>}
                        <div className="text-xs text-slate-400">For</div>
                        <ul className="space-y-1 text-xs text-slate-300">
                          {offer.costs.map((cost, index) => {
                            const available = (runState.inventory || []).reduce((total, item) =>
                              total + (item.object.trim().toLowerCase() === cost.object.trim().toLowerCase() ? item.quantity : 0), 0);
                            return <li key={index} className="break-words">{cost.quantity} x {cost.object || 'Unnamed item'} ({available} available)</li>;
                          })}
                        </ul>
                      </div>
                      <button type="button" disabled={!affordable} aria-label={`Buy ${offer.title || 'offer'}`}
                        title={affordable ? 'Exchange required items for this offer' : 'Required items are missing or this offer is incomplete'}
                        onClick={() => setRunState((current) => current.currentNodeId === currentNode.id ? tradeCampaignShopOffer(current, offer, campaignCards) : current)}
                        className="flex shrink-0 items-center gap-2 rounded-lg border border-lime-700 bg-lime-950 px-3 py-2 text-xs font-bold text-lime-200 hover:bg-lime-900 disabled:cursor-not-allowed disabled:opacity-40">
                        <ArrowRightLeft className="h-4 w-4" /> Buy
                      </button>
                    </article>
                  );
                })}
              </div>
              <div className="flex justify-end border-t border-slate-800 pt-4">
                <button type="button" disabled={!currentNode.nextNodeId || !campaign.nodes[currentNode.nextNodeId]}
                  onClick={() => { if (currentNode.nextNodeId) navigateToNode(currentNode.nextNodeId); }}
                  className="flex items-center gap-2 rounded-lg border border-slate-700 bg-slate-800 px-4 py-2 text-sm text-slate-200 hover:bg-slate-700 disabled:opacity-40">
                  Leave <ArrowRight className="h-4 w-4" />
                </button>
              </div>
            </section>
          )}

          {/* 3. BATTLE NODE BRIEFING */}
          {currentNode.type === 'battle' && (
            (() => {
              const challenge = getBattleChallenge(currentNode);
              const description = currentNode.description?.trim() ? currentNode.description : challenge?.description;
              return (
                <div className="space-y-6 animate-fade-in">
                  <div className="flex items-center gap-3 border-b border-slate-800 pb-4">
                    <div className="w-12 h-12 rounded-2xl bg-rose-600/20 border-2 border-rose-500/40 flex items-center justify-center text-rose-400">
                      <Swords className="w-6 h-6" />
                    </div>
                    <div>
                      <h3 className="text-xl font-bold font-fantasy text-slate-100">{currentNode.title}</h3>
                      <span className="text-xs font-bold text-rose-400 uppercase tracking-wider">
                        Encounter Impending
                      </span>
                    </div>
                  </div>

                  {/* Battle Lore Description */}
                  {description && (
                    <div className="bg-slate-950/80 border border-slate-800 rounded-2xl p-5 text-slate-200 text-sm leading-relaxed">
                      {description}
                    </div>
                  )}

                  {/* Challenge Intel Box */}
                  {challenge && (
                    <div className="p-4 bg-slate-950 border border-slate-800 rounded-2xl space-y-3">
                      <div className="flex items-center justify-between">
                        <span className="font-bold text-sm text-amber-400">
                          Opponent Challenge: {challenge.name}
                        </span>
                        <span className="text-xs px-2.5 py-0.5 rounded-full bg-blue-950 text-blue-300 border border-blue-700 font-bold">
                          {campaign.campaignMana ? `Campaign Mana: ${runState.mana || 0}` : `Mana Cap: ${challenge.manaCap}`}
                        </span>
                      </div>

                      <div className="flex flex-wrap gap-1">
                        <span className="text-xs text-slate-400 self-center mr-1">Rulesets:</span>
                        {challenge.rulesets.map((r) => (
                          <span
                            key={r}
                            className="text-[10px] px-2 py-0.5 rounded bg-rose-950 border border-rose-600/50 text-rose-300 font-bold"
                          >
                            {r}
                          </span>
                        ))}
                      </div>

                      {currentNode.rewardCardId && (
                        <div className="text-xs text-amber-400 flex items-center gap-1.5 pt-1 border-t border-slate-800">
                          <Award className="w-4 h-4" />
                          <span>
                            Victory Reward: Unlock card{' '}
                            <strong>{campaignCards.find((c) => c.id === currentNode.rewardCardId)?.name}</strong>
                          </span>
                        </div>
                      )}
                    </div>
                  )}

                  {/* Action: Deploy Troops */}
                  <div className="flex justify-end pt-2">
                    <button
                      onClick={() => setIsInBattlePrep(true)}
                      className="px-8 py-3 bg-gradient-to-r from-rose-600 to-amber-600 hover:from-rose-500 hover:to-amber-500 text-white font-extrabold rounded-2xl shadow-xl shadow-rose-600/30 flex items-center gap-2 text-sm uppercase tracking-wider transition transform active:scale-95"
                    >
                      <Swords className="w-4 h-4" />
                      <span>Assemble Team & Fight</span>
                    </button>
                  </div>
                </div>
              );
            })()
          )}

          {/* 4. END NODE CONCLUSION */}
          {currentNode.type === 'end' && (
            <div className="space-y-6 text-center animate-fade-in py-4">
              <div className="flex justify-center">
                {currentNode.outcome === 'victory' ? (
                  <div className="w-16 h-16 rounded-3xl bg-emerald-950 border-2 border-emerald-500 flex items-center justify-center text-emerald-400 shadow-2xl shadow-emerald-500/30 animate-bounce">
                    <Award className="w-8 h-8" />
                  </div>
                ) : currentNode.outcome === 'defeat' ? (
                  <div className="w-16 h-16 rounded-3xl bg-rose-950 border-2 border-rose-500 flex items-center justify-center text-rose-400 shadow-2xl shadow-rose-500/30">
                    <Skull className="w-8 h-8" />
                  </div>
                ) : (
                  <div className="w-16 h-16 rounded-3xl bg-amber-950 border-2 border-amber-500 flex items-center justify-center text-amber-400 shadow-2xl shadow-amber-500/30">
                    <Sparkles className="w-8 h-8" />
                  </div>
                )}
              </div>

              <div>
                <h3 className="text-3xl font-black font-fantasy tracking-wide">
                  {currentNode.outcome === 'victory' ? (
                    <span className="text-emerald-400">{currentNode.title}</span>
                  ) : currentNode.outcome === 'defeat' ? (
                    <span className="text-rose-400">{currentNode.title}</span>
                  ) : (
                    <span className="text-amber-400">{currentNode.title}</span>
                  )}
                </h3>
              </div>

              <div className="bg-slate-950/80 border border-slate-800 rounded-2xl p-6 text-slate-200 text-sm sm:text-base leading-relaxed max-w-2xl mx-auto whitespace-pre-line">
                {currentNode.message}
              </div>

              {currentNode.rewardSummary && (
                <div className="p-3 bg-emerald-950/60 border border-emerald-500/50 rounded-xl text-emerald-300 font-bold text-xs max-w-lg mx-auto flex items-center justify-center gap-2">
                  <Sparkles className="w-4 h-4" />
                  <span>{currentNode.rewardSummary}</span>
                </div>
              )}

              <div className="flex items-center justify-center gap-4 pt-4">
                <button
                  onClick={handleRestart}
                  className="px-6 py-2.5 bg-slate-800 hover:bg-slate-700 text-slate-200 font-bold rounded-xl border border-slate-700 text-xs uppercase tracking-wider transition flex items-center gap-1.5"
                >
                  <RotateCcw className="w-3.5 h-3.5" />
                  Play Again
                </button>
                <button
                  onClick={onExit}
                  className="px-6 py-2.5 bg-gradient-to-r from-amber-600 to-rose-600 hover:from-amber-500 hover:to-rose-500 text-white font-extrabold rounded-xl shadow-lg shadow-amber-600/30 text-xs uppercase tracking-wider transition"
                >
                  Back to Campaigns
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
};
