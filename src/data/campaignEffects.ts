import { BattleCampaignNode, CampaignActionDefinition, CampaignDefinition, CampaignEffect, CampaignItemDefinition, CampaignItemParameter, CampaignNode, CampaignPrecondition, CampaignRunState, CampaignShopOffer, CampaignShopItem } from '../types/campaign';
import { CardDefinition } from '../types/card';
import { TeamSelection } from '../types/battle';
import { awardCampaignCard, cleanCampaignInventoryItems } from './campaignCollection';

export function getCampaignPlayerCardIds(campaign: CampaignDefinition): string[] {
  return [
    ...(campaign.startingCollection || []).map((entry) => entry.cardId),
    ...Object.values(campaign.nodes).flatMap((node) => [
      ...(node.type === 'battle' && node.rewardCardId ? [node.rewardCardId] : []),
      ...(node.type === 'battle' ? [...(node.victoryEffects || []), ...(node.defeatEffects || [])] : []).flatMap((effect) => 'cardId' in effect ? [effect.cardId] : []),
      ...(node.type === 'shop' ? node.offers.flatMap((offer) => offer.effects || []) : []).flatMap((effect) => 'cardId' in effect ? [effect.cardId] : []),
      ...(node.type === 'shop' ? node.offers.flatMap((offer) => offer.preconditions || []) : []).flatMap((precondition) => 'cardId' in precondition ? [precondition.cardId] : []),
      ...(node.type === 'decision' || node.type === 'hub' || node.type === 'multi' ? node.choices.flatMap((choice) => choice.preconditions || []) : []).flatMap((precondition) => 'cardId' in precondition ? [precondition.cardId] : []),
      ...[
        ...(node.effects || []),
        ...(node.type === 'hub' ? node.choices.flatMap((point) => point.effects || []) : []),
      ].flatMap((effect) => 'cardId' in effect ? [effect.cardId] : []),
    ]),
  ];
}

export function applyCampaignEffects(
  run: CampaignRunState,
  effects: CampaignEffect[],
  cards: CardDefinition[]
): CampaignRunState {
  return effects.reduce((current, effect) => {
    if (effect.type === 'campaignunlock') {
      const unlockIds = effect.unlockIds.filter((id) => id.trim());
      const campaignUnlockIds = [...new Set([...(current.campaignUnlockIds || []), ...unlockIds])];
      if (campaignUnlockIds.length === (current.campaignUnlockIds || []).length) return current;
      return { ...current, campaignUnlockIds };
    }
    if (effect.type === 'add_campaign_action') {
      if (!effect.actionId.trim() || current.availableCampaignActionIds?.includes(effect.actionId)) return current;
      return { ...current, availableCampaignActionIds: [...(current.availableCampaignActionIds || []), effect.actionId] };
    }
    if (effect.type === 'remove_campaign_action') {
      if (!current.availableCampaignActionIds?.includes(effect.actionId)) return current;
      return { ...current, availableCampaignActionIds: current.availableCampaignActionIds.filter((id) => id !== effect.actionId) };
    }
    if (effect.type === 'go_to_node') {
      if (!effect.nodeId.trim()) return current;
      return {
        ...current,
        currentNodeId: effect.nodeId,
        visitedNodeIds: [...current.visitedNodeIds, effect.nodeId],
        status: 'in_progress',
        finalOutcome: undefined,
      };
    }
    if (effect.type === 'set_minimum_mana') {
      if (!Number.isFinite(effect.minimumMana) || effect.minimumMana < 0) return current;
      return { ...current, mana: Math.floor(effect.minimumMana) };
    }
    if (effect.type === 'set_mana') {
      const mana = effect.useStartingMana ? current.startingMana ?? current.initialMana ?? 0 : effect.mana;
      if (!Number.isFinite(mana) || mana < 0) return current;
      return { ...current, mana: Math.floor(mana) };
    }
    if (effect.type === 'set_starting_mana') {
      if (!Number.isFinite(effect.mana) || effect.mana < 0) return current;
      return { ...current, startingMana: Math.floor(effect.mana) };
    }
    if (effect.type === 'increase_starting_mana') {
      if (!Number.isFinite(effect.quantity) || effect.quantity <= 0) return current;
      const quantity = Math.floor(effect.quantity);
      if (!quantity) return current;
      const startingMana = current.startingMana ?? current.initialMana ?? 0;
      const increasedMana = startingMana + quantity;
      if (!Number.isFinite(increasedMana) || increasedMana < 0) return current;
      return { ...current, startingMana: increasedMana };
    }
    if (effect.type === 'set_mana_to_starting_mana') {
      const mana = current.startingMana ?? current.initialMana ?? 0;
      if (!Number.isFinite(mana) || mana < 0) return current;
      return { ...current, mana: Math.floor(mana) };
    }
    if (effect.type === 'give_mana' || effect.type === 'remove_mana') {
      if (!Number.isFinite(effect.quantity) || effect.quantity <= 0) return current;
      const quantity = Math.floor(effect.quantity);
      const mana = current.mana || 0;
      return { ...current, mana: effect.type === 'give_mana' ? mana + quantity : Math.max(0, mana - quantity) };
    }
    if (effect.type === 'give_card') {
      return awardCampaignCard(current, cards.find((card) => card.id === effect.cardId));
    }
    if (effect.type === 'remove_card') {
      if (!effect.cardId) return current;
      return {
        ...current,
        removedCardIds: [...new Set([...(current.removedCardIds || []), effect.cardId])],
        earnedCards: (current.earnedCards || []).filter((card) => card.id !== effect.cardId),
        unlockedCardIds: current.unlockedCardIds.filter((id) => id !== effect.cardId),
      };
    }
    if (!('quantity' in effect) || !Number.isFinite(effect.quantity) || effect.quantity <= 0) return current;
    const quantity = Math.floor(effect.quantity);
    if (quantity === 0) return current;
    if ('object' in effect || 'resource' in effect) {
      const object = ('object' in effect ? effect.object : effect.resource).trim();
      if (!object) return current;
      const inventory = current.inventory || [];
      const existing = inventory.find((item) => item.object.trim().toLowerCase() === object.toLowerCase());
      const isGive = effect.type === 'give_object' || effect.type === 'give_item' || effect.type === 'give_resource';
      if (!existing && !isGive) return current;
      const next = isGive ? (existing?.quantity || 0) + quantity : Math.max(0, (existing?.quantity || 0) - quantity);
      const updated = existing
        ? inventory.map((item) => item.id === existing.id ? { ...item, quantity: next } : item).filter((item) => item.quantity > 0)
        : [...inventory, { id: `effect_item_${effect.id}`, object, quantity: next }];
      const legacyResources = 'resource' in effect && current.resources && Object.prototype.hasOwnProperty.call(current.resources, object)
        ? { ...current.resources, [object]: 0 }
        : current.resources;
      return { ...current, inventory: updated, resources: legacyResources };
    }
    return current;
  }, run);
}

export function applyCampaignEffectSource(
  run: CampaignRunState,
  sourceId: string,
  effects: CampaignEffect[] | undefined,
  cards: CardDefinition[]
): CampaignRunState {
  if (!effects?.length || run.appliedEffectSourceIds?.includes(sourceId)) return run;
  const updated = applyCampaignEffects(run, effects, cards);
  return { ...updated, appliedEffectSourceIds: [...(run.appliedEffectSourceIds || []), sourceId] };
}

export function applyCampaignNodeEffects(run: CampaignRunState, node: CampaignNode, cards: CardDefinition[]): CampaignRunState {
  return applyCampaignEffectSource(run, `node:${node.id}`, node.effects, cards);
}

export function meetsCampaignPreconditions(run: CampaignRunState, preconditions?: CampaignPrecondition[]): boolean {
  return (preconditions || []).every((precondition) => {
    if (precondition.type === 'has_unlock' || precondition.type === 'has_not_unlock') {
      if (!precondition.unlockId.trim()) return false;
      const unlocked = Boolean(run.campaignUnlockIds?.includes(precondition.unlockId));
      return precondition.type === 'has_unlock' ? unlocked : !unlocked;
    }
    if (precondition.type === 'card_unlocked' || precondition.type === 'card_not_unlocked') {
      if (!precondition.cardId.trim()) return false;
      const unlocked = Boolean(run.unlockedCardIds?.includes(precondition.cardId));
      return precondition.type === 'card_unlocked' ? unlocked : !unlocked;
    }
    if (precondition.type === 'has_mana') {
      const mana = run.mana ?? 0;
      return Number.isSafeInteger(precondition.mana) && precondition.mana >= 0 && Number.isFinite(mana) && mana >= precondition.mana;
    }
    if (precondition.type === 'has_item') {
      if (!precondition.item.trim() || !Number.isSafeInteger(precondition.quantity) || precondition.quantity < 0) return false;
      const quantity = (run.inventory || []).reduce((total, item) =>
        item.object.trim().toLowerCase() === precondition.item.trim().toLowerCase() && Number.isFinite(item.quantity) && item.quantity > 0
          ? total + item.quantity
          : total, 0);
      return precondition.quantity === 0 ? quantity === 0 : quantity >= precondition.quantity;
    }
    return false;
  });
}

export function getAvailableCampaignActions(run: CampaignRunState, campaign: CampaignDefinition): CampaignActionDefinition[] {
  const availableIds = run.availableCampaignActionIds ?? (campaign.actions || []).map((action) => action.id);
  return (campaign.actions || []).filter((action) =>
    availableIds.includes(action.id) && meetsCampaignPreconditions(run, action.unlockPreconditions)
  );
}

export function resolveCampaignMultiNodes(
  run: CampaignRunState,
  campaign: CampaignDefinition,
  cards: CardDefinition[],
  random: () => number = Math.random
): CampaignRunState {
  let current = run;
  const resolvedIds = new Set<string>();
  while (campaign.nodes[current.currentNodeId]?.type === 'multi') {
    const node = campaign.nodes[current.currentNodeId];
    if (node.type !== 'multi' || resolvedIds.has(node.id)) break;
    resolvedIds.add(node.id);
    current = applyCampaignNodeEffects(current, node, cards);
    const choices = node.choices.filter((choice) =>
      Number.isFinite(choice.probability) && choice.probability > 0 &&
      meetsCampaignPreconditions(current, choice.preconditions) &&
      choice.nextNodeId !== node.id && Boolean(campaign.nodes[choice.nextNodeId])
    );
    if (!choices.length) break;
    const scale = Math.max(...choices.map((choice) => choice.probability));
    const total = choices.reduce((sum, choice) => sum + choice.probability / scale, 0);
    let roll = Math.max(0, Math.min(1, random())) * total;
    const selected = choices.find((choice) => {
      roll -= choice.probability / scale;
      return roll < 0;
    }) || choices[choices.length - 1];
    const target = campaign.nodes[selected.nextNodeId];
    current = applyCampaignNodeEffects({
      ...current,
      currentNodeId: target.id,
      visitedNodeIds: [...current.visitedNodeIds, target.id],
      status: target.type === 'end' ? 'completed' : 'in_progress',
      finalOutcome: target.type === 'end' ? target.outcome : undefined,
    }, target, cards);
  }
  return current;
}

export function applyCampaignBattleOutcomeEffects(
  run: CampaignRunState,
  node: BattleCampaignNode,
  outcome: 'victory' | 'defeat' | 'draw',
  battleLogId: string,
  cards: CardDefinition[]
): CampaignRunState {
  if (outcome === 'draw') return run;
  const effects = outcome === 'victory' ? node.victoryEffects : node.defeatEffects;
  return applyCampaignEffectSource(run, `battle:${node.id}:${battleLogId}:${outcome}`, effects, cards);
}

export function normalizeCampaignInventory(run: CampaignRunState): CampaignRunState {
  let inventory = cleanCampaignInventoryItems(run.inventory);
  for (const [object, quantity] of Object.entries(run.resources || {})) {
    if (!Number.isFinite(quantity) || quantity <= 0) continue;
    const existing = inventory.find((item) => item.object.trim().toLowerCase() === object.trim().toLowerCase());
    inventory = existing
      ? inventory.map((item) => item.id === existing.id ? { ...item, quantity: item.quantity + quantity } : item)
      : [...inventory, { id: `legacy_resource_${object}`, object, quantity }];
  }
  return {
    ...run,
    inventory,
    initialInventory: cleanCampaignInventoryItems(run.initialInventory),
    resources: {},
  };
}

export function spendCampaignMana(run: CampaignRunState, amount: number): CampaignRunState {
  if (!Number.isFinite(amount) || amount <= 0) return run;
  return { ...run, mana: Math.max(0, (run.mana || 0) - Math.floor(amount)) };
}

export function recoverCampaignBattleMana(
  run: CampaignRunState,
  survivingFriendlyManaCosts: number[],
  defeatedEnemyManaCosts: number[]
): CampaignRunState {
  const survivorsRefund = survivingFriendlyManaCosts.reduce((total, mana) => total + (Number.isFinite(mana) ? Math.max(0, mana) : 0), 0);
  const defeatedEnemyMana = defeatedEnemyManaCosts.reduce((total, mana) => total + (Number.isFinite(mana) ? Math.max(0, mana) : 0), 0);
  const enemyReward = Math.floor(defeatedEnemyMana / 2);
  return { ...run, mana: Math.max(0, run.mana || 0) + survivorsRefund + enemyReward };
}

export function getCampaignTeamManaCost(team: TeamSelection, cards: CardDefinition[]): number {
  const summoner = team.summonerId ? cards.find((card) => card.id === team.summonerId) : undefined;
  const summonerStat = summoner?.stats.find((stat) => stat.level === team.summonerLevel) || summoner?.stats[0];
  return (summonerStat?.mana || 0) + team.monsters.reduce((total, monster) => {
    const card = cards.find((entry) => entry.id === monster.cardId);
    const stat = card?.stats.find((entry) => entry.level === monster.level) || card?.stats[0];
    return total + (stat?.mana || 0);
  }, 0);
}

function getShopOfferCosts(offer: CampaignShopOffer): Map<string, number> | null {
  const validItem = (item: CampaignShopItem) => Boolean(item.object.trim()) && Number.isSafeInteger(item.quantity) && item.quantity > 0;
  if (!offer.effects?.length || !offer.costs.length || !offer.costs.every(validItem)) return null;
  const costs = new Map<string, number>();
  for (const item of offer.costs) {
    const key = item.object.trim().toLowerCase();
    const quantity = (costs.get(key) || 0) + item.quantity;
    if (!Number.isSafeInteger(quantity)) return null;
    costs.set(key, quantity);
  }
  return costs;
}

export function normalizeCampaignNodes(campaign: CampaignDefinition): CampaignDefinition {
  return { ...campaign, nodes: Object.fromEntries(Object.entries(campaign.nodes).map(([id, node]) => {
    const normalizedNode = (node as { type: string }).type === 'random'
      ? { ...node, type: 'multi' } as CampaignNode
      : node;
    if (normalizedNode.type !== 'shop') return [id, normalizedNode];
    const offers = normalizedNode.offers.map((offer) => {
      const { reward, ...current } = offer as CampaignShopOffer & { reward?: CampaignShopItem };
      const effects = current.effects || [];
      if (!reward?.object.trim() || !Number.isSafeInteger(reward.quantity) || reward.quantity <= 0) return { ...current, effects };
      const rewardEffect: CampaignEffect = { id: `legacy_shop_reward_${offer.id}`, type: 'give_object', object: reward.object, quantity: reward.quantity };
      return { ...current, effects: [rewardEffect, ...effects] };
    });
    return [id, { ...normalizedNode, offers }];
  })) };
}

export function canTradeCampaignShopOffer(run: CampaignRunState, offer: CampaignShopOffer, cards: CardDefinition[] = []): boolean {
  if (!meetsCampaignPreconditions(run, offer.preconditions)) return false;
  const costs = getShopOfferCosts(offer);
  if (!costs) return false;
  const current = normalizeCampaignInventory(run);
  if (applyCampaignEffects(current, offer.effects, cards) === current) return false;
  const inventory = current.inventory || [];
  return [...costs].every(([object, quantity]) => inventory.reduce((total, item) =>
    total + (item.object.trim().toLowerCase() === object ? item.quantity : 0), 0) >= quantity);
}

export function tradeCampaignShopOffer(run: CampaignRunState, offer: CampaignShopOffer, cards: CardDefinition[] = []): CampaignRunState {
  if (!canTradeCampaignShopOffer(run, offer, cards)) return run;
  const current = normalizeCampaignInventory(run);
  const remainingCosts = getShopOfferCosts(offer)!;
  const inventory = (current.inventory || []).map((item) => {
    const key = item.object.trim().toLowerCase();
    const spent = Math.min(item.quantity, remainingCosts.get(key) || 0);
    remainingCosts.set(key, (remainingCosts.get(key) || 0) - spent);
    return { ...item, quantity: item.quantity - spent };
  }).filter((item) => item.quantity > 0);
  return applyCampaignEffects({ ...current, inventory }, offer.effects, cards);
}

export function getCampaignBuyOfferPayout(
  offer: CampaignShopOffer,
  itemName: string,
  quantity: number,
  items: CampaignItemDefinition[]
): number | null {
  if (offer.offerType !== 'buy' || !Number.isSafeInteger(quantity) || quantity <= 0 || !offer.currencyObject?.trim()) return null;
  const parameter = offer.valueParameter || CampaignItemParameter.SellValue;
  if (!Object.values(CampaignItemParameter).includes(parameter)) return null;
  const item = items.find((entry) => entry.name.trim().toLowerCase() === itemName.trim().toLowerCase());
  const currency = items.find((entry) => entry.name.trim().toLowerCase() === offer.currencyObject!.trim().toLowerCase());
  const value = item?.parameters?.[parameter];
  if (!item || !currency || typeof value !== 'number' || !Number.isFinite(value) || value < 0) return null;
  const payout = Math.floor(value * quantity);
  return Number.isSafeInteger(payout) && payout > 0 ? payout : null;
}

export function canTradeCampaignBuyOffer(
  run: CampaignRunState,
  offer: CampaignShopOffer,
  itemName: string,
  quantity: number,
  items: CampaignItemDefinition[]
): boolean {
  if (!meetsCampaignPreconditions(run, offer.preconditions) || getCampaignBuyOfferPayout(offer, itemName, quantity, items) === null) return false;
  const available = (run.inventory || []).reduce((total, entry) =>
    entry.object.trim().toLowerCase() === itemName.trim().toLowerCase() && Number.isSafeInteger(entry.quantity) && entry.quantity > 0
      ? total + entry.quantity
      : total, 0);
  return available >= quantity;
}

export function tradeCampaignBuyOffer(
  run: CampaignRunState,
  offer: CampaignShopOffer,
  itemName: string,
  quantity: number,
  items: CampaignItemDefinition[],
  cards: CardDefinition[] = []
): CampaignRunState {
  if (!canTradeCampaignBuyOffer(run, offer, itemName, quantity, items)) return run;
  const payout = getCampaignBuyOfferPayout(offer, itemName, quantity, items)!;
  let remaining = quantity;
  const inventory = (run.inventory || []).map((entry) => {
    if (entry.object.trim().toLowerCase() !== itemName.trim().toLowerCase() || remaining <= 0) return entry;
    const sold = Math.min(entry.quantity, remaining);
    remaining -= sold;
    return { ...entry, quantity: entry.quantity - sold };
  }).filter((entry) => entry.quantity > 0);
  const effects: CampaignEffect[] = [
    { id: `sell_${offer.id}`, type: 'give_object', object: offer.currencyObject!, quantity: payout },
    ...offer.effects,
  ];
  return applyCampaignEffects({ ...run, inventory }, effects, cards);
}

export function executeCampaignAction(
  run: CampaignRunState,
  action: CampaignActionDefinition,
  campaign: CampaignDefinition,
  cards: CardDefinition[]
): CampaignRunState {
  const availableIds = run.availableCampaignActionIds ?? (campaign.actions || []).map((entry) => entry.id);
  if (!availableIds.includes(action.id) || !meetsCampaignPreconditions(run, action.unlockPreconditions) || !meetsCampaignPreconditions(run, action.preconditions)) return run;
  const effects = action.effects.filter((effect) => effect.type !== 'go_to_node' || Boolean(campaign.nodes[effect.nodeId]));
  const previousNodeId = run.currentNodeId;
  let updated = applyCampaignEffects(run, effects, cards);
  const target = campaign.nodes[updated.currentNodeId];
  if (target && target.id !== previousNodeId) updated = applyCampaignNodeEffects(updated, target, cards);
  if (target?.type === 'end') {
    updated = { ...updated, status: 'completed', finalOutcome: target.outcome };
  } else {
    updated = { ...updated, status: 'in_progress', finalOutcome: undefined };
  }
  return resolveCampaignMultiNodes(updated, campaign, cards);
}