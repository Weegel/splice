import { CampaignDefinition, CampaignInventoryItem, CampaignRunState } from '../types/campaign';
import { CardDefinition } from '../types/card';
import { PlayerCollectionState } from '../services/splinterlandsApi';

export function cleanCampaignInventoryItems(items: CampaignInventoryItem[] = []): CampaignInventoryItem[] {
  return items.filter((item) => {
    const object = item.object.trim();
    return object.length > 0 && object.toLowerCase() !== 'new object' && Number.isFinite(item.quantity) && item.quantity > 0;
  });
}

function getConfiguredCollectionKey(collection: CardDefinition[]): string {
  return JSON.stringify(collection
    .map((card) => ({ id: card.id, levels: card.stats.map((stat) => stat.level) }))
    .sort((left, right) => left.id.localeCompare(right.id)));
}

function getCampaignStartingConfigurationKey(campaign: CampaignDefinition, collection: CardDefinition[]): string {
  return JSON.stringify({
    collectionSource: campaign.collectionSource || 'player',
    customCollection: campaign.collectionSource === 'custom' ? getConfiguredCollectionKey(collection) : undefined,
    allowedTiers: campaign.allowedTiers || campaign.allowedEditions,
    allowGladiators: campaign.allowGladiators,
    allowRuni: campaign.allowRuni,
    maxCardLevel: campaign.maxCardLevel,
    maxCardLevelsByRarity: campaign.maxCardLevelsByRarity,
    inventory: cleanCampaignInventoryItems(campaign.inventory).sort((a, b) => a.id.localeCompare(b.id)),
    campaignMana: campaign.campaignMana ? campaign.startingMana ?? 25 : undefined,
  });
}

export function createCampaignCollection(
  campaign: CampaignDefinition,
  cards: CardDefinition[],
  playerCollection?: PlayerCollectionState | null
): CardDefinition[] {
  const tiers = campaign.allowedTiers || campaign.allowedEditions;
  return cards.flatMap((card) => {
    let maxLevel: number;
    if (campaign.collectionSource === 'custom') {
      const entry = campaign.startingCollection?.find((item) => item.cardId === card.id);
      if (!entry) return [];
      maxLevel = entry.maxLevel;
    } else {
      if (!playerCollection || card.isCustom) return [];
      const detailId = /^(?:spl_)?\d+$/.test(card.id) ? Number(card.id.replace(/^spl_/, '')) : undefined;
      const name = card.name.toLowerCase().trim();
      const named = playerCollection.ownedCardNames[name] || playerCollection.ownedCardNames[name.replace(/[^a-z0-9]/g, '')];
      const owned = playerCollection.ownedCards[detailId ?? named?.detailId];
      if (!owned) return [];
      const isGladiator = owned.edition === 6 && owned.tier === 4;
      const isRuni = owned.edition === 2 && owned.tier === 7;
      if (isGladiator ? campaign.allowGladiators === false : isRuni ? campaign.allowRuni === false :
        tiers?.length && (owned.tier === undefined || !tiers.includes(owned.tier))) return [];
      maxLevel = owned.maxLevel;
    }
    maxLevel = Math.max(1, Math.min(maxLevel || 1, campaign.maxCardLevelsByRarity?.[card.rarity] || campaign.maxCardLevel || Infinity));
    const stats = card.stats.filter((stat) => stat.level <= maxLevel);
    return stats.length ? [{ ...card, stats }] : [];
  });
}

export function createCampaignRun(
  campaign: CampaignDefinition,
  initialCollection: CardDefinition[],
  initialInventory: CampaignInventoryItem[] = cleanCampaignInventoryItems(campaign.inventory),
  initialMana = campaign.campaignMana ? Math.max(0, Math.floor(campaign.startingMana ?? 25)) : undefined
): CampaignRunState {
  const startingInventory = cleanCampaignInventoryItems(initialInventory);
  return {
    campaignId: campaign.id,
    currentNodeId: campaign.startNodeId,
    visitedNodeIds: [campaign.startNodeId],
    battleHistory: [],
    initialCollection: JSON.parse(JSON.stringify(initialCollection)),
    initialInventory: JSON.parse(JSON.stringify(startingInventory)),
    inventory: JSON.parse(JSON.stringify(startingInventory)),
    initialMana,
    startingMana: initialMana,
    mana: initialMana,
    startingConfigurationKey: getCampaignStartingConfigurationKey(campaign, initialCollection),
    resources: {},
    removedCardIds: [],
    appliedEffectSourceIds: [],
    unlockedCardIds: [],
    campaignUnlockIds: [],
    availableCampaignActionIds: (campaign.actions || []).map((action) => action.id),
    earnedCards: [],
    status: 'in_progress',
  };
}

export function reconcileCampaignRunStartingConfiguration(
  run: CampaignRunState,
  campaign: CampaignDefinition,
  initialCollection: CardDefinition[]
): CampaignRunState {
  const initialInventory = cleanCampaignInventoryItems(campaign.inventory);
  const initialMana = campaign.campaignMana ? Math.max(0, Math.floor(campaign.startingMana ?? 25)) : undefined;
  const configurationKey = getCampaignStartingConfigurationKey(campaign, initialCollection);
  const legacyConfigChanged = !run.startingConfigurationKey && (
    (campaign.collectionSource === 'custom' && getConfiguredCollectionKey(run.initialCollection || []) !== getConfiguredCollectionKey(initialCollection)) ||
    JSON.stringify(cleanCampaignInventoryItems(run.initialInventory)) !== JSON.stringify(initialInventory) ||
    run.initialMana !== initialMana
  );

  if (run.startingConfigurationKey === configurationKey || (!run.startingConfigurationKey && !legacyConfigChanged)) {
    return { ...run, startingMana: run.startingMana ?? run.initialMana ?? initialMana, startingConfigurationKey: configurationKey };
  }

  return {
    ...run,
    initialCollection: JSON.parse(JSON.stringify(initialCollection)),
    initialInventory: JSON.parse(JSON.stringify(initialInventory)),
    inventory: JSON.parse(JSON.stringify(initialInventory)),
    initialMana,
    startingMana: run.initialMana === initialMana ? run.startingMana ?? initialMana : initialMana,
    mana: run.initialMana === initialMana ? run.mana : initialMana,
    startingConfigurationKey: configurationKey,
  };
}

export function getCampaignCollection(run: CampaignRunState): CardDefinition[] {
  const cards = new Map((run.initialCollection || []).map((card) => [card.id, card]));
  for (const card of run.earnedCards || []) {
    if (!cards.has(card.id)) cards.set(card.id, card);
  }
  return [...cards.values()].filter((card) => !run.removedCardIds?.includes(card.id));
}

export function awardCampaignCard(run: CampaignRunState, reward?: CardDefinition): CampaignRunState {
  if (!reward || run.unlockedCardIds.includes(reward.id)) return run;
  return {
    ...run,
    unlockedCardIds: [...run.unlockedCardIds, reward.id],
    removedCardIds: (run.removedCardIds || []).filter((id) => id !== reward.id),
    earnedCards: [...(run.earnedCards || []), JSON.parse(JSON.stringify(reward))],
  };
}