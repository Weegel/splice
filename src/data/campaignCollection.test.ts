import { awardCampaignCard, cleanCampaignInventoryItems, createCampaignCollection, createCampaignRun, getCampaignCollection, reconcileCampaignRunStartingConfiguration } from './campaignCollection';
import { CampaignActionDefinition, CampaignDefinition, CampaignItemDefinition, CampaignItemParameter, CampaignPrecondition, CampaignRunState, CampaignShopOffer } from '../types/campaign';
import { CardDefinition } from '../types/card';
import { PlayerCollectionState } from '../services/splinterlandsApi';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { BattlePreparation } from '../components/BattlePreparation';
import { CampaignPlayer } from '../components/CampaignPlayer';
import { CampaignShopEditor } from '../components/CampaignShopEditor';
import { StorageService } from './storage';
import { LocalWorkspaceService } from '../services/localWorkspace';
import { getCampaignItems, parseCampaignItemParameters, saveCampaignItem } from './campaignItems';
import { renameCampaignNode } from './campaignNodes';
import { CampaignItemSelect } from '../components/CampaignItemSelect';
import { CampaignItemsModal } from '../components/CampaignItemsModal';
import { CampaignEffectsEditor } from '../components/CampaignEffectsEditor';
import { CampaignUnlocksModal } from '../components/CampaignUnlocksModal';
import { CampaignPreconditionsEditor } from '../components/CampaignPreconditionsEditor';
import { applyCampaignBattleOutcomeEffects, applyCampaignEffects, applyCampaignEffectSource, applyCampaignNodeEffects, canTradeCampaignBuyOffer, canTradeCampaignShopOffer, getAvailableCampaignActions, getCampaignBuyOfferPayout, tradeCampaignBuyOffer, tradeCampaignShopOffer, executeCampaignAction, getCampaignPlayerCardIds, getCampaignTeamManaCost, meetsCampaignPreconditions, normalizeCampaignInventory, recoverCampaignBattleMana, resolveCampaignMultiNodes, spendCampaignMana } from './campaignEffects';

function assert(condition: boolean, message: string) {
  if (!condition) throw new Error(message);
  console.log(`PASS: ${message}`);
}

const summoner: CardDefinition = {
  id: 'spl_1', name: 'Starter Summoner', splinter: 'Earth', cardType: 'Summoner', rarity: 'Rare',
  stats: [1, 2, 3].map((level) => ({ level, mana: 3, attack: 0, attackType: 'None', speed: 1, armor: 0, health: 1, abilities: [] })),
};
const monster: CardDefinition = { ...summoner, id: 'legacy_monster', name: 'Starter Monster', cardType: 'Monster' };
const reward: CardDefinition = { ...monster, id: 'custom_reward', name: 'Reward Monster', isCustom: true };
const cards = [summoner, monster, reward];
const campaign: CampaignDefinition = {
  id: 'test_campaign', name: 'Collection Test', description: '',
  startNodeId: 'start', nodes: { start: { id: 'start', type: 'text', title: 'Start', content: '' } },
  collectionSource: 'custom',
  startingCollection: [{ cardId: summoner.id, maxLevel: 2 }, { cardId: monster.id, maxLevel: 1 }],
};

const nodeNamingCampaign: CampaignDefinition = {
  ...campaign,
  actions: [{ id: 'return', name: 'Return', preconditions: [], effects: [{ id: 'jump', type: 'go_to_node', nodeId: 'start' }] }],
  nodes: {
    start: { id: 'start', type: 'text', title: 'Start', content: 'start', nextNodeId: 'start', effects: [{ id: 'jump', type: 'go_to_node', nodeId: 'start' }] },
    node_text_abandoned_farm_stable: { id: 'node_text_abandoned_farm_stable', type: 'end', title: 'Occupied name', message: '', outcome: 'neutral' },
    decision: { id: 'decision', type: 'decision', title: 'Decision', prompt: '', choices: [{ id: 'choice', text: 'start', nextNodeId: 'start' }] },
    multi: { id: 'multi', type: 'multi', title: 'Multi', choices: [{ id: 'route', nextNodeId: 'start', probability: 100 }] },
    hub: { id: 'hub', type: 'hub', title: 'Hub', prompt: '', choices: [{ id: 'poi', text: 'Start', nextNodeId: 'start', effects: [{ id: 'jump', type: 'go_to_node', nodeId: 'start' }] }] },
    battle: {
      id: 'battle', type: 'battle', title: 'Battle', onVictoryNodeId: 'start', onDefeatNodeId: 'start', onDrawNodeId: 'start',
      victoryEffects: [{ id: 'win', type: 'go_to_node', nodeId: 'start' }], defeatEffects: [{ id: 'lose', type: 'go_to_node', nodeId: 'start' }],
    },
    shop: { id: 'shop', type: 'shop', title: 'Shop', nextNodeId: 'start', offers: [{ id: 'offer', costs: [], effects: [{ id: 'jump', type: 'go_to_node', nodeId: 'start' }] }] },
  },
};
const nodeNamingSnapshot = JSON.stringify(nodeNamingCampaign);
const renamedNodeResult = renameCampaignNode(nodeNamingCampaign, 'start', 'Abandoned Farm Stable');
const namedCampaign = renamedNodeResult.campaign;
const namedNodeId = renamedNodeResult.nodeId;
assert(namedNodeId === 'node_text_abandoned_farm_stable_2' && !namedCampaign.nodes.start && namedCampaign.nodes[namedNodeId].id === namedNodeId, 'Title edits generate node_type_name IDs with collision-safe suffixes and replace the old node key');
assert(namedCampaign.startNodeId === namedNodeId && namedCampaign.nodes[namedNodeId].type === 'text' && namedCampaign.nodes[namedNodeId].nextNodeId === namedNodeId, 'Node renames update the campaign start and self-referencing transitions');
assert(['decision', 'multi', 'hub'].every((key) => {
  const node = namedCampaign.nodes[key];
  return (node.type === 'decision' || node.type === 'multi' || node.type === 'hub') && node.choices[0].nextNodeId === namedNodeId;
}), 'Node renames update decision, weighted selector, and hub destinations');
const namedBattle = namedCampaign.nodes.battle;
assert(namedBattle.type === 'battle' && [namedBattle.onVictoryNodeId, namedBattle.onDefeatNodeId, namedBattle.onDrawNodeId].every((target) => target === namedNodeId), 'Node renames update all battle outcome destinations');
const renamedJumpEffects = [
  namedCampaign.nodes[namedNodeId].effects?.[0],
  namedCampaign.actions?.[0].effects[0],
  namedBattle.type === 'battle' ? namedBattle.victoryEffects?.[0] : undefined,
  namedBattle.type === 'battle' ? namedBattle.defeatEffects?.[0] : undefined,
  namedCampaign.nodes.hub.type === 'hub' ? namedCampaign.nodes.hub.choices[0].effects?.[0] : undefined,
  namedCampaign.nodes.shop.type === 'shop' ? namedCampaign.nodes.shop.offers[0].effects[0] : undefined,
];
assert(renamedJumpEffects.every((effect) => effect?.type === 'go_to_node' && effect.nodeId === namedNodeId), 'Node renames update navigation effects in nodes, actions, battle outcomes, hub events, and shop offers');
assert(namedCampaign.nodes.shop.type === 'shop' && namedCampaign.nodes.shop.nextNodeId === namedNodeId, 'Node renames update shop exit destinations');
assert(namedCampaign.nodes[namedNodeId].type === 'text' && namedCampaign.nodes[namedNodeId].content === 'start' && namedCampaign.nodes.decision.type === 'decision' && namedCampaign.nodes.decision.choices[0].text === 'start', 'Node renames leave matching narrative and choice text untouched');
assert(JSON.stringify(nodeNamingCampaign) === nodeNamingSnapshot, 'Automatic node naming does not mutate the source campaign');
assert(renameCampaignNode(namedCampaign, namedNodeId, 'Abandoned Farm Stable').nodeId === namedNodeId, 'Duplicate-title suffixes remain stable during repeated edits');
assert(renameCampaignNode(campaign, 'start', '  Café / Farm -- Stable! ').nodeId === 'node_text_cafe_farm_stable', 'Automatic node naming normalizes accents, whitespace, and punctuation');
assert(Object.values(nodeNamingCampaign.nodes).every((node) => renameCampaignNode(nodeNamingCampaign, node.id, 'New Location').nodeId === `node_${node.type}_new_location`), 'Every node type is included between the node prefix and normalized title');
assert(renameCampaignNode(campaign, 'start', '  !!! ').nodeId === 'start' && renameCampaignNode(campaign, 'start', '').campaign.nodes.start.title === '', 'Blank or punctuation-only titles retain the existing ID while editing');
assert(renameCampaignNode(campaign, 'missing', 'New title').campaign === campaign, 'Renaming a missing node leaves the campaign unchanged');

const legacyItemCampaign: CampaignDefinition = {
  ...campaign,
  inventory: [{ id: 'ore', object: 'Ore', quantity: 2 }],
  nodes: {
    start: { id: 'start', type: 'text', title: 'Start', content: '', effects: [{ id: 'ore', type: 'give_object', object: ' ore ', quantity: 1 }] },
    hub: { id: 'hub', type: 'hub', title: 'Hub', prompt: '', choices: [{ id: 'event', text: 'Event', nextNodeId: 'start', effects: [{ id: 'fiber', type: 'give_item', object: 'Fiber', quantity: 1 }] }] },
    battle: { id: 'battle', type: 'battle', title: 'Battle', victoryEffects: [{ id: 'gold', type: 'give_resource', resource: 'Gold', quantity: 1 }], defeatEffects: [{ id: 'ore', type: 'remove_object', object: 'Ore', quantity: 1 }] },
    shop: { id: 'shop', type: 'shop', title: 'Shop', offers: [{ id: 'hammer', costs: [{ object: 'Ore', quantity: 1 }], effects: [{ id: 'hammer', type: 'give_object', object: 'Hammer', quantity: 1 }] }] },
  },
};
const legacyItems = getCampaignItems(legacyItemCampaign);
assert(legacyItems.map((item) => item.name).join(',') === 'Ore,Fiber,Gold,Hammer', 'Legacy inventory, node, event, outcome, and shop item references seed a deduplicated registry');
assert(getCampaignItems({ ...legacyItemCampaign, items: [] }).length === 0, 'An explicit registry does not silently whitelist unregistered references');
const oreDefinition = { ...legacyItems[0], name: 'Iron Ore', description: 'A useful metal.', parameters: parseCampaignItemParameters('{"sellvalue":2.5,"maxcapacity":20}') };
const renamedItemCampaign = saveCampaignItem(legacyItemCampaign, oreDefinition);
assert(renamedItemCampaign.inventory?.[0].object === 'Iron Ore' && renamedItemCampaign.nodes.start.effects?.some((effect) => 'object' in effect && effect.object === 'Iron Ore') === true, 'Renaming a registered item updates inventory and node effects');
assert(renamedItemCampaign.nodes.battle.type === 'battle' && renamedItemCampaign.nodes.battle.defeatEffects?.some((effect) => 'object' in effect && effect.object === 'Iron Ore') === true && renamedItemCampaign.nodes.shop.type === 'shop' && renamedItemCampaign.nodes.shop.offers[0].costs[0].object === 'Iron Ore', 'Item renames update battle outcomes and shop requirements');
const renamedFiberCampaign = saveCampaignItem(renamedItemCampaign, { ...legacyItems[1], name: 'Silk' });
assert(renamedFiberCampaign.nodes.hub.type === 'hub' && renamedFiberCampaign.nodes.hub.choices[0].effects?.some((effect) => 'object' in effect && effect.object === 'Silk') === true, 'Item renames update hub event effects');
const renamedGoldCampaign = saveCampaignItem(renamedItemCampaign, { ...legacyItems[2], name: 'Coins' });
assert(renamedGoldCampaign.nodes.battle.type === 'battle' && renamedGoldCampaign.nodes.battle.victoryEffects?.some((effect) => 'resource' in effect && effect.resource === 'Coins') === true, 'Item renames update legacy resource references');
assert(legacyItemCampaign.inventory?.[0].object === 'Ore' && legacyItemCampaign.items === undefined, 'Registry migration and renaming do not mutate the source campaign');
assert(JSON.parse(JSON.stringify(renamedItemCampaign)).items[0].parameters.maxcapacity === 20 && renamedItemCampaign.items?.[0].description === 'A useful metal.', 'Item descriptions and enum-governed JSON parameters survive serialization');
for (const invalid of ['null', '[]', '1', '{', '{"sellvaue":2}', '{"sellvalue":-1}', '{"maxcapacity":1.5}', '{"sellvalue":"2"}', '{"sellvalue":1e999}']) {
  let rejected = false;
  try { parseCampaignItemParameters(invalid); } catch { rejected = true; }
  assert(rejected, `Invalid item parameters are rejected: ${invalid}`);
}
assert(Object.keys(parseCampaignItemParameters('{}')).length === 0 && parseCampaignItemParameters('{"sellvalue":0,"maxcapacity":0}').maxcapacity === 0, 'Empty parameters and explicit zero parameter values are valid');
const itemSelectMarkup = renderToStaticMarkup(createElement(CampaignItemSelect, { items: legacyItems, value: 'Typo', onChange: () => {} }));
assert(itemSelectMarkup.includes('<select') && !itemSelectMarkup.includes('<input') && itemSelectMarkup.includes('Ore') && itemSelectMarkup.includes('disabled=""'), 'Item selectors only offer registered items and flag unknown references without silently replacing them');

const initial = createCampaignCollection(campaign, cards);
const unlockRun = createCampaignRun(campaign, initial);
const unlockEffect = { id: 'unlock_spring', type: 'campaignunlock' as const, unlockIds: ['battle_x', 'mana_spring', 'battle_x', ''] };
const unlockedRun = applyCampaignEffects(unlockRun, [unlockEffect], cards);
assert(unlockedRun.campaignUnlockIds?.join(',') === 'battle_x,mana_spring', 'Campaign unlock effects grant selected flags once and ignore blank IDs');
assert(applyCampaignEffects(unlockedRun, [unlockEffect], cards) === unlockedRun, 'Repeated campaign unlock effects leave progress unchanged');
assert(!unlockRun.campaignUnlockIds?.length && !unlockedRun.unlockedCardIds.length, 'Campaign unlocks do not mutate the source run or unlock cards');
assert(JSON.parse(JSON.stringify(unlockedRun)).campaignUnlockIds.join(',') === 'battle_x,mana_spring', 'Campaign unlock progress survives save serialization');
assert(!createCampaignRun(campaign, initial).campaignUnlockIds?.length, 'Restarting a campaign clears its unlock progress');
const homecomingAction: CampaignActionDefinition = {
  id: 'activate_homecoming_pebble', name: 'Activate Homecoming Pebble',
  unlockPreconditions: [{ id: 'requires_return_key', type: 'has_unlock', unlockId: 'return_key' }],
  preconditions: [{ id: 'requires_pebble', type: 'has_item', item: 'Homecoming pebble', quantity: 1 }],
  effects: [
    { id: 'restore_mana', type: 'set_mana_to_starting_mana' },
    { id: 'return_to_text', type: 'go_to_node', nodeId: 'return_to_emor' },
  ],
};
const homecomingCampaign: CampaignDefinition = {
  ...campaign, id: 'test_homecoming_action', campaignMana: true, startingMana: 12, actions: [homecomingAction],
  nodes: {
    start: { id: 'start', type: 'text', title: 'Away from Emor', content: '' },
    return_to_emor: { id: 'return_to_emor', type: 'text', title: 'Return to Emor', content: 'You activate the homecoming pebble and find yourself back in Emor.', nextNodeId: 'emor_hub' },
    emor_hub: { id: 'emor_hub', type: 'hub', title: 'Emor', prompt: '', choices: [] },
  },
};
const homecomingRun = createCampaignRun(homecomingCampaign, initial);
const pebbleRun = { ...homecomingRun, mana: 2, campaignUnlockIds: ['return_key'], inventory: [{ id: 'pebble', object: 'homecoming pebble', quantity: 1 }] };
const returnedRun = executeCampaignAction(pebbleRun, homecomingAction, homecomingCampaign, cards);
assert(returnedRun.mana === 12 && returnedRun.currentNodeId === 'return_to_emor' && returnedRun.visitedNodeIds[returnedRun.visitedNodeIds.length - 1] === 'return_to_emor', 'Homecoming action restores starting mana and navigates to its return text node');
const unlockedWithoutPebble = { ...homecomingRun, campaignUnlockIds: ['return_key'] };
assert(executeCampaignAction(unlockedWithoutPebble, homecomingAction, homecomingCampaign, cards) === unlockedWithoutPebble, 'Homecoming action cannot run without its item use precondition');
assert(getAvailableCampaignActions(homecomingRun, homecomingCampaign).length === 0, 'An action stays hidden until its unlock preconditions pass');
assert(getAvailableCampaignActions(unlockedWithoutPebble, homecomingCampaign).length === 1, 'An action stays visible when unlocked even if its use preconditions fail');
const grantedActionRun = applyCampaignEffects({ ...homecomingRun, availableCampaignActionIds: [] }, [{ id: 'grant_homecoming', type: 'add_campaign_action', actionId: homecomingAction.id }], cards);
assert(grantedActionRun.availableCampaignActionIds?.includes(homecomingAction.id) === true, 'Campaign effects can grant an action');
const removedActionRun = applyCampaignEffects(grantedActionRun, [{ id: 'remove_homecoming', type: 'remove_campaign_action', actionId: homecomingAction.id }], cards);
assert(!removedActionRun.availableCampaignActionIds?.includes(homecomingAction.id), 'Campaign effects can remove a granted action');
const hasNotUnlock = { id: 'requires_unreceived_unlock', type: 'has_not_unlock' as const, unlockId: 'mana_spring' };
assert(meetsCampaignPreconditions(unlockRun, [hasNotUnlock]) && !meetsCampaignPreconditions(unlockedRun, [hasNotUnlock]), 'Has not unlocked passes only while the selected campaign unlock has not been received');
assert(!meetsCampaignPreconditions(unlockRun, [{ ...hasNotUnlock, unlockId: '' }]), 'A blank has-not-unlocked selection does not pass');
const hasWormSegments: CampaignPrecondition = { id: 'requires_worm_segments', type: 'has_item', item: 'Worm segment', quantity: 3 };
const itemPreconditionRun = {
  ...unlockRun,
  inventory: [
    { id: 'worm_stack_1', object: 'Worm segment', quantity: 1 },
    { id: 'worm_stack_2', object: 'worm segment', quantity: 2 },
    { id: 'dust', object: 'Luminous dust', quantity: 4 },
  ],
};
assert(meetsCampaignPreconditions(itemPreconditionRun, [hasWormSegments]), 'Has Item counts matching inventory stacks case-insensitively');
assert(!meetsCampaignPreconditions(itemPreconditionRun, [{ ...hasWormSegments, quantity: 4 }]), 'Positive Has Item quantities require at least the configured amount');
assert(!meetsCampaignPreconditions(itemPreconditionRun, [{ ...hasWormSegments, quantity: 0 }]) && meetsCampaignPreconditions(unlockRun, [{ ...hasWormSegments, quantity: 0 }]), 'Has Item 0 requires an empty inventory count for that item');
assert(!meetsCampaignPreconditions(unlockRun, [hasWormSegments]) && !meetsCampaignPreconditions(unlockRun, [{ ...hasWormSegments, item: '' }]), 'Missing items and blank Has Item selections fail positive requirements');
assert(!meetsCampaignPreconditions(itemPreconditionRun, [{ ...hasWormSegments, quantity: -1 }]) && !meetsCampaignPreconditions(itemPreconditionRun, [{ ...hasWormSegments, quantity: 1.5 }]), 'Has Item rejects negative and fractional quantities');
assert(meetsCampaignPreconditions({ ...itemPreconditionRun, campaignUnlockIds: ['battle_x'] }, [hasWormSegments, { id: 'requires_battle', type: 'has_unlock', unlockId: 'battle_x' }]), 'Has Item combines with other preconditions using AND semantics');
const hasManaCondition: CampaignPrecondition = { id: 'requires_mana', type: 'has_mana', mana: 10 };
assert(meetsCampaignPreconditions({ ...unlockRun, mana: 10 }, [hasManaCondition]) && meetsCampaignPreconditions({ ...unlockRun, mana: 11 }, [hasManaCondition]) && !meetsCampaignPreconditions({ ...unlockRun, mana: 9 }, [hasManaCondition]), 'Has mana passes at or above the minimum and fails below it');
assert(!meetsCampaignPreconditions({ ...unlockRun, mana: undefined, startingMana: 100 }, [hasManaCondition]) && meetsCampaignPreconditions({ ...unlockRun, mana: undefined }, [{ ...hasManaCondition, mana: 0 }]), 'Has mana uses current mana, treating missing balances as zero rather than starting mana');
assert([-1, 1.5, NaN, Infinity].every((mana) => !meetsCampaignPreconditions({ ...unlockRun, mana: 100 }, [{ ...hasManaCondition, mana }])) && !meetsCampaignPreconditions({ ...unlockRun, mana: NaN }, [hasManaCondition]) && !meetsCampaignPreconditions({ ...unlockRun, mana: Infinity }, [hasManaCondition]), 'Has mana rejects invalid thresholds and non-finite balances');
const manaConditionRun = { ...itemPreconditionRun, mana: 10 };
assert(meetsCampaignPreconditions(manaConditionRun, [hasManaCondition, hasWormSegments]) && !meetsCampaignPreconditions({ ...manaConditionRun, mana: 9 }, [hasManaCondition, hasWormSegments]) && !meetsCampaignPreconditions({ ...manaConditionRun, inventory: [] }, [hasManaCondition, hasWormSegments]) && manaConditionRun.mana === 10, 'Has mana combines with other requirements using AND semantics without spending mana');
const manaConditionMarkup = renderToStaticMarkup(createElement(CampaignPreconditionsEditor, {
  preconditions: [hasManaCondition], unlocks: [], cards, items: legacyItems, onChange: () => {},
}));
assert(manaConditionMarkup.includes('Has mana') && manaConditionMarkup.includes('Precondition 1 minimum mana') && manaConditionMarkup.includes('type="number"') && manaConditionMarkup.includes('value="10"'), 'Has mana editor offers the precondition and a numeric minimum-mana input');
const cardUnlockedCondition: CampaignPrecondition = { id: 'requires_card', type: 'card_unlocked', cardId: reward.id };
const cardNotUnlockedCondition: CampaignPrecondition = { id: 'requires_no_card', type: 'card_not_unlocked', cardId: reward.id };
const cardUnlockedRun = awardCampaignCard(unlockRun, reward);
assert(!meetsCampaignPreconditions(unlockRun, [cardUnlockedCondition]) && meetsCampaignPreconditions(cardUnlockedRun, [cardUnlockedCondition]), 'Card unlocked preconditions require the selected campaign card reward');
assert(meetsCampaignPreconditions(unlockRun, [cardNotUnlockedCondition]) && !meetsCampaignPreconditions(cardUnlockedRun, [cardNotUnlockedCondition]), 'Card not unlocked preconditions stop matching once the selected card is unlocked');
assert(!meetsCampaignPreconditions(unlockRun, [{ ...cardUnlockedCondition, cardId: '' }]) && !meetsCampaignPreconditions(unlockRun, [{ ...cardNotUnlockedCondition, cardId: '' }]), 'Blank selections fail both positive and negative card preconditions');
assert(meetsCampaignPreconditions({ ...cardUnlockedRun, campaignUnlockIds: ['battle_x'] }, [cardUnlockedCondition, { id: 'requires_flag', type: 'has_unlock', unlockId: 'battle_x' }]) && !meetsCampaignPreconditions(cardUnlockedRun, [cardUnlockedCondition, cardNotUnlockedCondition]), 'Card and campaign unlock preconditions combine using AND semantics');
assert(meetsCampaignPreconditions({ ...unlockRun, unlockedCardIds: undefined }, [cardNotUnlockedCondition]), 'Legacy runs without card unlock progress support negative card preconditions');
const cardConditionCampaign: CampaignDefinition = {
  ...campaign,
  nodes: { start: { id: 'start', type: 'decision', title: 'Card gate', prompt: '', choices: [{ id: 'gated', text: 'Continue', nextNodeId: '', preconditions: [cardNotUnlockedCondition] }] } },
};
assert(getCampaignPlayerCardIds(cardConditionCampaign).includes(reward.id), 'Custom cards referenced only by preconditions are included in campaign packaging');
const cardConditionsMarkup = renderToStaticMarkup(createElement(CampaignPreconditionsEditor, {
  preconditions: [cardUnlockedCondition, cardNotUnlockedCondition], unlocks: [], cards, items: legacyItems, onChange: () => {},
}));
assert(cardConditionsMarkup.includes('Precondition 1 type') && cardConditionsMarkup.includes('Precondition 1 card') && cardConditionsMarkup.includes('Card unlocked') && cardConditionsMarkup.includes('Card not unlocked') && cardConditionsMarkup.includes(reward.name), 'Precondition editors render type dropdowns and card selectors for both card conditions');
const itemConditionMarkup = renderToStaticMarkup(createElement(CampaignPreconditionsEditor, {
  preconditions: [hasWormSegments], unlocks: [], cards, items: legacyItems, onChange: () => {},
}));
assert(itemConditionMarkup.includes('Has Item') && itemConditionMarkup.includes('Precondition 1 item') && itemConditionMarkup.includes('Precondition 1 quantity') && itemConditionMarkup.includes('Worm segment') && itemConditionMarkup.includes('value="3"'), 'Has Item editor renders a campaign-item dropdown and numeric quantity');
const unlockCampaign: CampaignDefinition = {
  ...campaign, id: 'test_campaign_unlocks',
  unlocks: [
    { id: 'battle_x', name: 'Beat battle X', description: 'Defeat the forest guardian.' },
    { id: 'mana_spring', name: 'Upgraded mana spring', description: 'Purchase the spring upgrade.' },
  ],
};
const unlockEditorMarkup = renderToStaticMarkup(createElement(CampaignEffectsEditor, {
  effects: [unlockEffect], cards, items: [], unlocks: unlockCampaign.unlocks, onChange: () => {},
}));
assert(unlockEditorMarkup.includes('value="campaignunlock"') && unlockEditorMarkup.includes('Beat battle X') && unlockEditorMarkup.includes('Upgraded mana spring') && unlockEditorMarkup.includes('Select campaign unlock') && !unlockEditorMarkup.includes('type="checkbox"'), 'Campaign unlock effects select named definitions using dropdowns');
const unlockModalMarkup = renderToStaticMarkup(createElement(CampaignUnlocksModal, {
  unlocks: unlockCampaign.unlocks!, autosaveStatus: 'saved', onSave: () => {}, onDelete: () => {}, onClose: () => {},
}));
assert(unlockModalMarkup.includes('Campaign Unlocks (2)') && unlockModalMarkup.includes('Beat battle X') && unlockModalMarkup.includes('Defeat the forest guardian.') && unlockModalMarkup.includes('Delete Beat battle X') && unlockModalMarkup.includes('All changes saved'), 'The unlock modal lists, describes, and can delete unlocks');
const campaignItemsModalMarkup = renderToStaticMarkup(createElement(CampaignItemsModal, {
  items: legacyItems, autosaveStatus: 'saved', onSave: () => {}, onDelete: () => {}, onClose: () => {},
}));
assert(campaignItemsModalMarkup.includes('Campaign Specific Items (4)') && campaignItemsModalMarkup.includes('Delete Ore') && campaignItemsModalMarkup.includes('All changes saved'), 'The campaign item modal lists items and provides delete controls');
const unlockShopOffer: CampaignShopOffer = { id: 'unlock_spring', costs: [{ object: 'Ore', quantity: 1 }], effects: [{ id: 'grant_spring', type: 'campaignunlock', unlockIds: ['mana_spring'] }] };
const unlockShopRun = { ...unlockRun, inventory: [{ id: 'ore', object: 'Ore', quantity: 2 }] };
const unlockedShopRun = tradeCampaignShopOffer(unlockShopRun, unlockShopOffer, cards);
assert(unlockedShopRun.campaignUnlockIds?.includes('mana_spring') === true && unlockedShopRun.inventory[0].quantity === 1, 'Shop effects grant campaign unlocks and deduct their costs');
assert(!canTradeCampaignShopOffer(unlockedShopRun, unlockShopOffer, cards) && tradeCampaignShopOffer(unlockedShopRun, unlockShopOffer, cards) === unlockedShopRun, 'An already-earned unlock cannot consume shop costs again');
const unlockBattleNode = { id: 'unlock_battle', type: 'battle' as const, title: 'Battle X', victoryEffects: [unlockEffect] };
assert(applyCampaignBattleOutcomeEffects(unlockRun, unlockBattleNode, 'victory', 'unlock_log', cards).campaignUnlockIds?.includes('battle_x') === true && !applyCampaignBattleOutcomeEffects(unlockRun, unlockBattleNode, 'defeat', 'unlock_log', cards).campaignUnlockIds?.length, 'Victory unlock effects grant progress only for the configured battle outcome');
const randomCampaign: CampaignDefinition = {
  ...campaign,
  id: 'random_campaign',
  startNodeId: 'random_start',
  nodes: {
    random_start: {
      id: 'random_start', type: 'multi', title: 'Multi Outcome',
      effects: [{ id: 'random_mana', type: 'set_mana', mana: 2 }],
      choices: [
        { id: 'route_battle', nextNodeId: 'random_battle', probability: 70 },
        { id: 'route_end', nextNodeId: 'random_end', probability: 30 },
      ],
    },
    random_battle: {
      id: 'random_battle', type: 'battle', title: 'Moss Guardian Encounter',
      effects: [{ id: 'battle_entry_mana', type: 'give_mana', quantity: 3 }],
    },
    random_end: { id: 'random_end', type: 'end', title: 'Quiet Path', outcome: 'neutral', message: 'The trail is clear.' },
  },
};
const randomRun = createCampaignRun(randomCampaign, initial);
const selectedBattleRun = resolveCampaignMultiNodes(randomRun, randomCampaign, cards, () => 0.69);
assert(selectedBattleRun.currentNodeId === 'random_battle', 'A roll inside the 70% interval selects the battle');
assert(resolveCampaignMultiNodes(randomRun, randomCampaign, cards, () => 0).currentNodeId === 'random_battle', 'The lowest random roll selects the first route');
const selectedEndRun = resolveCampaignMultiNodes(randomRun, randomCampaign, cards, () => 0.7);
assert(selectedEndRun.currentNodeId === 'random_end' && selectedEndRun.status === 'completed' && selectedEndRun.finalOutcome === 'neutral', 'The 70% boundary selects the second route and completes an end node');
assert(resolveCampaignMultiNodes(randomRun, randomCampaign, cards, () => 0.999).currentNodeId === 'random_end', 'The highest normal random rolls select the final route');
assert(selectedBattleRun.mana === 5 && selectedBattleRun.visitedNodeIds.join(',') === 'random_start,random_battle', 'Random routing applies selector and destination effects and preserves visit history');
assert(randomRun.currentNodeId === 'random_start' && randomRun.mana === undefined, 'Random routing does not mutate the original run');
const persistedRandomRun = JSON.parse(JSON.stringify(selectedBattleRun));
assert(resolveCampaignMultiNodes(persistedRandomRun, randomCampaign, cards, () => { throw new Error('Unexpected reroll'); }) === persistedRandomRun, 'A persisted selected destination never rerolls on resume');
const invalidRouteCampaign: CampaignDefinition = {
  ...randomCampaign,
  nodes: { ...randomCampaign.nodes, random_start: {
    id: 'random_start', type: 'multi', title: 'Filtered Routes',
    choices: [
      { id: 'missing', nextNodeId: 'missing_node', probability: 100 },
      { id: 'self', nextNodeId: 'random_start', probability: 100 },
      { id: 'zero', nextNodeId: 'random_end', probability: 0 },
      { id: 'negative', nextNodeId: 'random_end', probability: -5 },
      { id: 'nan', nextNodeId: 'random_end', probability: NaN },
      { id: 'valid', nextNodeId: 'random_battle', probability: 7 },
    ],
  } },
};
assert(resolveCampaignMultiNodes(randomRun, invalidRouteCampaign, cards, () => 0.99).currentNodeId === 'random_battle', 'Missing, self-linked, zero, negative, and invalid weights are ignored');
const chainedRandomCampaign: CampaignDefinition = {
  ...randomCampaign,
  nodes: {
    ...randomCampaign.nodes,
    random_start: { id: 'random_start', type: 'multi', title: 'First Roll', choices: [{ id: 'chain', nextNodeId: 'random_second', probability: 1 }] },
    random_second: { id: 'random_second', type: 'multi', title: 'Second Roll', choices: [{ id: 'destination', nextNodeId: 'random_battle', probability: 1 }] },
  },
};
assert(resolveCampaignMultiNodes(randomRun, chainedRandomCampaign, cards, () => 0).visitedNodeIds.join(',') === 'random_start,random_second,random_battle', 'Chained multi nodes resolve automatically');
const cyclicRandomCampaign: CampaignDefinition = {
  ...chainedRandomCampaign,
  nodes: { ...chainedRandomCampaign.nodes, random_second: { id: 'random_second', type: 'multi', title: 'Loop', choices: [{ id: 'loop', nextNodeId: 'random_start', probability: 1 }] } },
};
assert(resolveCampaignMultiNodes(randomRun, cyclicRandomCampaign, cards, () => 0).visitedNodeIds.length === 3, 'Multi routing cycles stop without an infinite loop');
const emptyRandomCampaign: CampaignDefinition = { ...randomCampaign, nodes: { ...randomCampaign.nodes, random_start: { id: 'random_start', type: 'multi', title: 'Empty Outcomes', choices: [] } } };
assert(resolveCampaignMultiNodes(randomRun, emptyRandomCampaign, cards, () => 0).currentNodeId === 'random_start', 'An unconfigured multi node stops safely');
assert(initial.length === 2 && !initial.some((card) => card.id === reward.id), 'Only configured starting cards are available');
assert(initial[0].stats.length === 2 && initial[1].stats.length === 1, 'Starting levels are enforced');
const run = createCampaignRun(campaign, initial);
const shopRun = { ...run, inventory: [
  { id: 'ore_1', object: 'Ore', quantity: 3 },
  { id: 'ore_2', object: ' ore ', quantity: 2 },
  { id: 'fiber', object: 'Fiber', quantity: 2 },
] };
const shopOffer: CampaignShopOffer = { id: 'hammer', effects: [{ id: 'buy_hammer', type: 'give_object', object: 'Hammer', quantity: 1 }], costs: [
  { object: 'Ore', quantity: 2 }, { object: ' ORE ', quantity: 2 }, { object: 'Fiber', quantity: 2 },
] };
const buyOfferItems: CampaignItemDefinition[] = [
  { id: 'meat', name: 'Molerat meat', description: '', parameters: { [CampaignItemParameter.SellValue]: 2 } },
  { id: 'imagination', name: 'Imagination', description: '', parameters: {} },
];
const meatBuyOffer: CampaignShopOffer = {
  id: 'buy_meat', offerType: 'buy', valueParameter: CampaignItemParameter.SellValue, currencyObject: 'Imagination', costs: [], effects: [],
};
const meatInventoryRun = { ...run, inventory: [
  { id: 'meat_stack_1', object: 'Molerat meat', quantity: 1 },
  { id: 'meat_stack_2', object: 'molerat meat', quantity: 2 },
] };
assert(getCampaignBuyOfferPayout(meatBuyOffer, 'Molerat meat', 2, buyOfferItems) === 4, 'Buying offer payout multiplies the configured item property by sale quantity');
assert(canTradeCampaignBuyOffer(meatInventoryRun, meatBuyOffer, 'Molerat meat', 2, buyOfferItems), 'Buying offers accept eligible inventory items across case-insensitive stacks');
const soldMeatRun = tradeCampaignBuyOffer(meatInventoryRun, meatBuyOffer, 'Molerat meat', 2, buyOfferItems, cards);
assert(soldMeatRun.inventory?.reduce((total, item) => total + (item.object.toLowerCase() === 'molerat meat' ? item.quantity : 0), 0) === 1 && soldMeatRun.inventory?.some((item) => item.object === 'Imagination' && item.quantity === 4), 'Buying offers deduct sold items and credit the configured currency');
assert(meatInventoryRun.inventory.length === 2, 'Buying an item does not mutate the source inventory');
assert(!canTradeCampaignBuyOffer(meatInventoryRun, meatBuyOffer, 'Molerat meat', 4, buyOfferItems), 'Buying offers reject quantities beyond available inventory');
assert(!canTradeCampaignBuyOffer(meatInventoryRun, { ...meatBuyOffer, currencyObject: 'Unknown' }, 'Molerat meat', 1, buyOfferItems), 'Buying offers require a registered payout currency');
assert(!canTradeCampaignBuyOffer(meatInventoryRun, { ...meatBuyOffer, preconditions: [{ id: 'locked', type: 'has_unlock', unlockId: 'battle_x' }] }, 'Molerat meat', 1, buyOfferItems), 'Buying offers respect configured preconditions');
const buyOfferEditorMarkup = renderToStaticMarkup(createElement(CampaignShopEditor, {
  node: { id: 'buy_shop', type: 'shop', title: 'Butcher', offers: [{ ...meatBuyOffer, title: 'Buy monster meat' }] },
  nodes: [], cards, items: buyOfferItems, onChange: () => {},
}));
assert(buyOfferEditorMarkup.includes('Buy items') && buyOfferEditorMarkup.includes('Sell value') && buyOfferEditorMarkup.includes('Payout Currency') && buyOfferEditorMarkup.includes('Imagination'), 'Buying offer editor exposes the value property and payout currency');
const manaSpringEffectOffer: CampaignShopOffer = {
  id: 'upgrade_mana_spring', title: 'Upgrade mana spring', offerType: 'effect',
  costs: [{ object: 'Imagination', quantity: 100 }],
  effects: [{ id: 'upgrade_starting_mana', type: 'set_starting_mana', mana: 12 }],
};
const manaSpringInventoryRun = { ...run, initialMana: 10, startingMana: 10, mana: 4, inventory: [{ id: 'imagination', object: 'Imagination', quantity: 125 }] };
assert(canTradeCampaignShopOffer(manaSpringInventoryRun, manaSpringEffectOffer, cards), 'An affordable Effect offer can be purchased');
const manaSpringUpgradedRun = tradeCampaignShopOffer(manaSpringInventoryRun, manaSpringEffectOffer, cards);
assert(manaSpringUpgradedRun.startingMana === 12 && manaSpringUpgradedRun.mana === 4 && manaSpringUpgradedRun.inventory?.[0].quantity === 25, 'Effect offer charges its price and upgrades starting mana without changing current mana');
const tradedRun = tradeCampaignShopOffer(shopRun, shopOffer);
assert(canTradeCampaignShopOffer(shopRun, shopOffer), 'Shop costs aggregate duplicate requirements and inventory stacks case-insensitively');
const gatedShopOffer: CampaignShopOffer = {
  ...shopOffer,
  preconditions: [{ id: 'requires_battle', type: 'has_unlock', unlockId: 'battle_x' }],
};
assert(!canTradeCampaignShopOffer(shopRun, gatedShopOffer, cards), 'Shop offers with unmet unlock preconditions cannot be purchased even with sufficient inventory');
assert(tradeCampaignShopOffer(shopRun, gatedShopOffer, cards) === shopRun, 'A locked shop offer cannot deduct costs or grant effects');
const eligibleShopRun = { ...shopRun, campaignUnlockIds: ['battle_x'] };
assert(canTradeCampaignShopOffer(eligibleShopRun, gatedShopOffer, cards) && tradeCampaignShopOffer(eligibleShopRun, gatedShopOffer, cards).inventory?.some((item) => item.object === 'Hammer') === true, 'Shop offers become purchasable when their unlock preconditions are met');
assert(!canTradeCampaignShopOffer(eligibleShopRun, { ...gatedShopOffer, preconditions: [...gatedShopOffer.preconditions!, { id: 'requires_spring', type: 'has_unlock', unlockId: 'mana_spring' }] }, cards), 'Shop offers require every configured precondition');
assert(!canTradeCampaignShopOffer(shopRun, { ...gatedShopOffer, effects: [{ id: 'self_unlock', type: 'campaignunlock', unlockIds: ['battle_x'] }] }, cards), 'An offer cannot satisfy its own preconditions with its reward effects');
assert(tradedRun.inventory?.reduce((sum, item) => sum + (item.object.trim().toLowerCase() === 'ore' ? item.quantity : 0), 0) === 1 && !tradedRun.inventory.some((item) => item.object === 'Fiber') && tradedRun.inventory.some((item) => item.object === 'Hammer' && item.quantity === 1), 'A barter deducts every cost and grants the reward');
assert(shopRun.inventory[0].quantity === 3 && shopRun.inventory.length === 3, 'Barter does not mutate the original inventory');
assert(!canTradeCampaignShopOffer(tradedRun, shopOffer) && tradeCampaignShopOffer(tradedRun, shopOffer) === tradedRun, 'An unaffordable offer cannot partially deduct costs or grant rewards');
const repeatOffer = { ...shopOffer, costs: [{ object: 'Ore', quantity: 1 }] };
const repeatedTrade = tradeCampaignShopOffer(tradeCampaignShopOffer(shopRun, repeatOffer), repeatOffer);
assert(repeatedTrade.inventory?.find((item) => item.object === 'Hammer')?.quantity === 2, 'Offers can be traded repeatedly and rewards stack');
assert(tradeCampaignShopOffer(shopRun, { ...shopOffer, costs: [] }) === shopRun, 'An offer without barter costs is invalid');
assert(tradeCampaignShopOffer(shopRun, { ...shopOffer, effects: [{ id: 'invalid_item', type: 'give_object', object: 'Hammer', quantity: 0 }] }) === shopRun, 'An offer whose effects cannot apply does not consume its costs');
assert(tradeCampaignShopOffer(shopRun, { ...shopOffer, effects: [] }) === shopRun, 'An offer without effects cannot be purchased');
assert(tradeCampaignShopOffer(shopRun, { ...shopOffer, costs: [{ object: 'Ore', quantity: NaN }] }) === shopRun, 'Non-finite barter costs are rejected');
assert(tradeCampaignShopOffer(shopRun, { ...shopOffer, costs: [{ object: ' ', quantity: 1 }] }) === shopRun, 'Blank required item names prevent a barter');
const sameItemTrade = tradeCampaignShopOffer(shopRun, { ...repeatOffer, effects: [{ id: 'buy_ore', type: 'give_object', object: 'Ore', quantity: 1 }], costs: [{ object: 'Ore', quantity: 2 }] });
assert(sameItemTrade.inventory?.reduce((sum, item) => sum + (item.object.trim().toLowerCase() === 'ore' ? item.quantity : 0), 0) === 4, 'Receiving the same item being spent uses the pre-trade inventory for affordability');
const legacyShopRun = { ...run, resources: { Ore: 1 } };
assert(tradeCampaignShopOffer(legacyShopRun, repeatOffer).inventory?.some((item) => item.object === 'Hammer'), 'Barter supports legacy resource inventories');
assert(JSON.parse(JSON.stringify(tradedRun)).inventory.some((item: { object: string }) => item.object === 'Hammer'), 'Shop purchases survive save serialization');
const awarded = awardCampaignCard(run, reward);
assert(getCampaignCollection(awarded).length === 3, 'A victory reward joins the campaign collection');
assert(getCampaignCollection(run).length === 2 && cards[0].stats.length === 3, 'Rewards do not change the initial collection or global catalog');
assert(awardCampaignCard(awarded, reward) === awarded, 'Repeated rewards are deduplicated');
assert(awardCampaignCard(run, undefined) === run, 'Missing rewards do not unlock cards');
const resumed = JSON.parse(JSON.stringify(awarded));
assert(getCampaignCollection(resumed).length === 3, 'The collection survives save and resume');
const restarted = createCampaignRun(campaign, resumed.initialCollection);
assert(getCampaignCollection(restarted).length === 2 && restarted.unlockedCardIds.length === 0 && restarted.earnedCards.length === 0, 'Restart restores the starting collection and clears rewards');
assert(getCampaignCollection(createCampaignRun({ ...campaign, id: 'other_campaign' }, initial)).length === 2, 'Rewards do not leak into another campaign');
assert(run.initialCollection !== initial && run.initialCollection[0] !== initial[0], 'The starting collection is an independent snapshot');

const inventoryCampaign: CampaignDefinition = {
  ...campaign,
  inventory: [{ id: 'potion', object: 'Healing Potion', quantity: 3 }, { id: 'key', object: 'Old Key', quantity: 1 }],
};
const inventoryRun = createCampaignRun(inventoryCampaign, initial);
assert(inventoryRun.inventory.length === 2 && inventoryRun.inventory[0].quantity === 3, 'New campaigns start with their configured objects and quantities');
inventoryRun.inventory[0].quantity = 1;
assert(inventoryCampaign.inventory[0].quantity === 3 && inventoryRun.initialInventory[0].quantity === 3, 'Changing run inventory does not change the campaign or starting snapshot');
const resumedInventoryRun = JSON.parse(JSON.stringify(inventoryRun));
assert(resumedInventoryRun.inventory[0].quantity === 1, 'Inventory quantities survive saving and resuming');
const resetInventoryRun = createCampaignRun(inventoryCampaign, initial, resumedInventoryRun.initialInventory);
assert(resetInventoryRun.inventory[0].quantity === 3, 'Restart restores the initial inventory quantities');
assert(createCampaignRun({ ...inventoryCampaign, id: 'other_inventory_campaign' }, initial).inventory[0].quantity === 3, 'Campaign runs have independent inventories');
assert(createCampaignRun(campaign, initial).inventory.length === 0, 'Campaigns without configured inventory start empty');
assert(createCampaignRun({ ...campaign, inventory: [{ id: 'placeholder', object: 'New Object', quantity: 1 }, { id: 'blank', object: '  ', quantity: 1 }] }, initial).inventory.length === 0, 'Blank inventory drafts and untouched New Object placeholders do not enter campaign runs');
assert(cleanCampaignInventoryItems([{ id: 'valid', object: 'Healing Potion', quantity: 2 }, { id: 'empty-quantity', object: 'Key', quantity: 0 }]).length === 1, 'Starting inventory only keeps named objects with positive quantities');

const manaCampaign = { ...campaign, campaignMana: true, startingMana: 18 };
const manaRun = createCampaignRun(manaCampaign, initial);
assert(manaRun.mana === 18 && manaRun.initialMana === 18, 'Campaign mana initializes from its configured starting balance');
const manaEffectsRun = applyCampaignEffects(manaRun, [
  { id: 'give_mana', type: 'give_mana', quantity: 7 },
  { id: 'remove_mana', type: 'remove_mana', quantity: 3 },
], cards);
assert(manaEffectsRun.mana === 22, 'Mana effects add and remove from the campaign pool');
assert(applyCampaignEffects(manaEffectsRun, [{ id: 'set_mana', type: 'set_mana', mana: 11 }], cards).mana === 11, 'Set mana replaces the campaign mana balance');
assert(spendCampaignMana(manaEffectsRun, 6).mana === 16 && spendCampaignMana(manaRun, 100).mana === 0, 'Battle spending deducts mana without allowing a negative balance');
assert(recoverCampaignBattleMana({ ...manaRun, mana: 4 }, [3, 2], [7, 5]).mana === 15, 'Battle recovery refunds surviving allies and half the total defeated enemy mana');
assert(recoverCampaignBattleMana({ ...manaRun, mana: 4 }, [3], [7]).mana === 10, 'Defeated enemy mana reward rounds down');
assert(createCampaignRun(manaCampaign, initial, [], manaRun.initialMana).mana === 18, 'Restart restores the configured starting mana');
const manaspringOffer: CampaignShopOffer = {
  id: 'upgrade_manaspring', title: 'Upgrade Manaspring', costs: [{ object: 'Wood', quantity: 4 }],
  effects: [{ id: 'manaspring_starting_mana', type: 'increase_starting_mana', quantity: 12 }],
};
const architectRun = { ...manaRun, mana: 7, inventory: [{ id: 'wood', object: 'Wood', quantity: 10 }] };
const upgradedManaspringRun = tradeCampaignShopOffer(architectRun, manaspringOffer, cards);
assert(upgradedManaspringRun.startingMana === 30 && upgradedManaspringRun.initialMana === 18 && upgradedManaspringRun.mana === 7, 'Manaspring upgrades change starting mana without changing current mana or the configured baseline');
assert(upgradedManaspringRun.inventory?.find((item) => item.object === 'Wood')?.quantity === 6, 'Effects-only upgrades deduct their barter costs');
const refillFromStartingMana = { id: 'refill_manaspring', type: 'set_mana_to_starting_mana' as const };
assert(applyCampaignEffects(upgradedManaspringRun, [refillFromStartingMana], cards).mana === 30, 'Mana refills resolve the upgraded starting-mana variable');
assert(applyCampaignEffects({ ...manaRun, startingMana: undefined }, [refillFromStartingMana], cards).mana === 18, 'Legacy runs can refill from their original starting mana');
const stackedManaspringRun = tradeCampaignShopOffer(upgradedManaspringRun, manaspringOffer, cards);
assert(stackedManaspringRun.startingMana === 42 && stackedManaspringRun.mana === 7, 'Repeated Manaspring purchases add to starting mana without refilling current mana');
assert(applyCampaignEffects(stackedManaspringRun, [refillFromStartingMana], cards).mana === 42, 'Set mana to starting mana reads the latest upgraded value');
assert(applyCampaignEffects({ ...manaRun, startingMana: undefined }, [{ id: 'legacy_increase', type: 'increase_starting_mana', quantity: 3 }], cards).startingMana === 21, 'Starting-mana increases support legacy runs');
assert(applyCampaignEffects(upgradedManaspringRun, [{ id: 'invalid_increase', type: 'increase_starting_mana', quantity: -1 }], cards) === upgradedManaspringRun, 'Negative starting-mana increases are rejected');
assert(applyCampaignEffects(upgradedManaspringRun, [{ id: 'infinite_increase', type: 'increase_starting_mana', quantity: Infinity }], cards) === upgradedManaspringRun, 'Non-finite starting-mana increases are rejected');
assert(applyCampaignEffects(upgradedManaspringRun, [{ id: 'zero_increase', type: 'increase_starting_mana', quantity: 0 }], cards) === upgradedManaspringRun, 'Zero starting-mana increases leave the run unchanged');
assert(applyCampaignEffects({ ...manaRun, startingMana: 0 }, [refillFromStartingMana], cards).mana === 0, 'Mana refills respect an explicit zero starting-mana variable');
assert(applyCampaignEffects(upgradedManaspringRun, [{ id: 'zero_start', type: 'set_starting_mana', mana: 0 }], cards).startingMana === 0, 'Starting mana can explicitly be zero');
assert(applyCampaignEffects(upgradedManaspringRun, [{ id: 'invalid_start', type: 'set_starting_mana', mana: NaN }], cards) === upgradedManaspringRun, 'Invalid starting-mana effects are ignored');
assert(reconcileCampaignRunStartingConfiguration(JSON.parse(JSON.stringify(upgradedManaspringRun)), manaCampaign, initial).startingMana === 30, 'Upgraded starting mana survives saving and reconciliation on resume');
assert(createCampaignRun(manaCampaign, initial).startingMana === 18, 'A full campaign restart resets purchased starting-mana upgrades');
assert(tradeCampaignShopOffer(manaRun, manaspringOffer, cards) === manaRun, 'Unaffordable upgrades do not apply effects');
assert(createCampaignRun({ ...manaCampaign, startingMana: undefined }, initial).startingMana === 25 && createCampaignRun({ ...manaCampaign, startingMana: 0 }, initial).startingMana === 0, 'Default starting mana is consistent with editor defaults and preserves explicit zero');
const shopCardOffer: CampaignShopOffer = { id: 'shop_card', costs: [{ object: 'Wood', quantity: 1 }], effects: [{ id: 'shop_grant_card', type: 'give_card', cardId: reward.id }] };
assert(getCampaignCollection(tradeCampaignShopOffer(architectRun, shopCardOffer, cards)).some((card) => card.id === reward.id), 'Shop effect rewards can grant campaign cards');
const itemAndEffectsOffer = { ...shopOffer, effects: [...shopOffer.effects, { id: 'item_plus_mana', type: 'give_mana' as const, quantity: 2 }] };
assert(tradeCampaignShopOffer(shopRun, itemAndEffectsOffer, cards).mana === 2 && tradeCampaignShopOffer(shopRun, itemAndEffectsOffer, cards).inventory?.some((item) => item.object === 'Hammer'), 'A shop offer can grant both an item and effects');
assert(getCampaignTeamManaCost({ summonerId: summoner.id, summonerLevel: 1, monsters: [{ cardId: monster.id, level: 1 }] }, [summoner, monster]) === 6, 'Battle cost includes the selected summoner and monster mana');
const changedStartingCampaign: CampaignDefinition = {
  ...manaCampaign,
  startingMana: 40,
  startingCollection: [...(manaCampaign.startingCollection || []), { cardId: reward.id, maxLevel: 1 }],
  inventory: [{ id: 'new-key', object: 'Iron Key', quantity: 2 }],
};
const progressedRun = { ...createCampaignRun(manaCampaign, initial), currentNodeId: 'later_node', mana: 9, visitedNodeIds: ['start', 'later_node'] };
const reconciledRun = reconcileCampaignRunStartingConfiguration(progressedRun, changedStartingCampaign, createCampaignCollection(changedStartingCampaign, cards));
assert(reconciledRun.currentNodeId === 'later_node' && reconciledRun.visitedNodeIds.length === 2, 'Updating starting settings preserves campaign progress');
assert(reconciledRun.initialCollection.some((card) => card.id === reward.id) && reconciledRun.initialInventory[0].object === 'Iron Key', 'Edited starting collection and inventory apply to a resumed run');
assert(reconciledRun.initialMana === 40 && reconciledRun.mana === 40, 'Edited starting mana applies to a resumed run');
assert(reconcileCampaignRunStartingConfiguration({ ...reconciledRun, mana: 12 }, changedStartingCampaign, createCampaignCollection(changedStartingCampaign, cards)).mana === 12, 'Unchanged campaign settings preserve current campaign mana');
assert(createCampaignRun({ ...campaign, inventory: [{ id: 'placeholder', object: 'New Object', quantity: 1 }, { id: 'blank', object: '  ', quantity: 1 }] }, initial).inventory.length === 0, 'Blank inventory drafts and untouched New Object placeholders do not enter campaign runs');
assert(cleanCampaignInventoryItems([{ id: 'valid', object: 'Healing Potion', quantity: 2 }, { id: 'empty-quantity', object: 'Key', quantity: 0 }]).length === 1, 'Starting inventory only keeps named objects with positive quantities');

const effectNode = {
  ...campaign.nodes.start,
  effects: [
    { id: 'give_potion', type: 'give_object' as const, object: 'Healing Potion', quantity: 2 },
    { id: 'spend_potion', type: 'remove_object' as const, object: 'Healing Potion', quantity: 1 },
    { id: 'give_gold', type: 'give_object' as const, object: 'Gold', quantity: 20 },
    { id: 'spend_gold', type: 'remove_object' as const, object: 'Gold', quantity: 5 },
    { id: 'set_minimum_mana', type: 'set_minimum_mana' as const, minimumMana: 18 },
    { id: 'give_reward', type: 'give_card' as const, cardId: reward.id },
    { id: 'remove_starter', type: 'remove_card' as const, cardId: monster.id },
  ],
};
const effectRun = applyCampaignNodeEffects(createCampaignRun(inventoryCampaign, initial), effectNode, cards);
assert(effectRun.inventory.find((item) => item.object === 'Healing Potion')?.quantity === 4 && effectRun.inventory.find((item) => item.object === 'Gold')?.quantity === 15, 'Object effects apply in order and stack into one inventory');
assert(effectRun.mana === 18, 'Legacy minimum-mana effects now set the campaign mana balance');
assert(getCampaignCollection(effectRun).some((card) => card.id === reward.id) && !getCampaignCollection(effectRun).some((card) => card.id === monster.id), 'Card effects grant cards and remove starting cards from the campaign roster');
assert(inventoryCampaign.inventory[0].quantity === 3 && initial.some((card) => card.id === monster.id), 'Applying effects does not mutate starting inventory or collection snapshots');
assert(applyCampaignNodeEffects(effectRun, effectNode, cards) === effectRun, 'Re-entering a node cannot apply its effects twice');
const savedEffectRun = JSON.parse(JSON.stringify(effectRun));
assert(applyCampaignNodeEffects(savedEffectRun, effectNode, cards) === savedEffectRun, 'Reloaded runs retain their applied-effect markers');
const balances = applyCampaignEffects(effectRun, [
  { id: 'spend_all', type: 'remove_object', object: 'Gold', quantity: 100 },
  { id: 'remove_all', type: 'remove_object', object: 'Healing Potion', quantity: 100 },
], cards);
assert(!balances.inventory.some((item) => item.object === 'Gold' || item.object === 'Healing Potion'), 'Removing objects cannot create negative quantities');
const regranted = applyCampaignEffects(effectRun, [{ id: 'return_starter', type: 'give_card', cardId: monster.id }], cards);
assert(getCampaignCollection(regranted).some((card) => card.id === monster.id), 'A removed card can be granted again');
const resetEffectRun = createCampaignRun(inventoryCampaign, initial, effectRun.initialInventory);
assert(Object.keys(resetEffectRun.resources || {}).length === 0 && resetEffectRun.mana === undefined && resetEffectRun.minimumMana === undefined && getCampaignCollection(resetEffectRun).some((card) => card.id === monster.id), 'Restart clears resource and mana effects and restores removed starting cards');
assert(applyCampaignNodeEffects(resetEffectRun, effectNode, cards).inventory.find((item) => item.object === 'Gold')?.quantity === 15, 'Node effects can run again after restart');
assert(applyCampaignNodeEffects(run, campaign.nodes.start, cards) === run, 'Nodes without effects leave the run unchanged');
const eventRun = applyCampaignEffectSource(run, 'poi:hub:event', [{ id: 'event_gold', type: 'give_object', object: 'Gold', quantity: 7 }], cards);
assert(eventRun.inventory.some((item) => item.object === 'Gold' && item.quantity === 7) && applyCampaignEffectSource(eventRun, 'poi:hub:event', effectNode.effects, cards) === eventRun, 'Event effects use the same once-per-source execution');
assert(getCampaignPlayerCardIds({ ...campaign, nodes: { ...campaign.nodes, start: effectNode } }).includes(reward.id), 'Effect-granted cards are included in campaign packaging references');
const battleNode = {
  id: 'battle_outcomes',
  type: 'battle' as const,
  title: 'Outcome Effects',
  victoryEffects: [
    { id: 'victory_gold', type: 'give_object' as const, object: 'Gold', quantity: 5 },
    { id: 'victory_card', type: 'give_card' as const, cardId: reward.id },
  ],
  defeatEffects: [
    { id: 'defeat_potion', type: 'remove_object' as const, object: 'Healing Potion', quantity: 1 },
    { id: 'defeat_card', type: 'give_card' as const, cardId: monster.id },
  ],
};
const victoryOutcomeRun = applyCampaignBattleOutcomeEffects(createCampaignRun(inventoryCampaign, initial), battleNode, 'victory', 'battle_log_1', cards);
assert(victoryOutcomeRun.inventory.some((item) => item.object === 'Gold' && item.quantity === 5) && getCampaignCollection(victoryOutcomeRun).some((card) => card.id === reward.id), 'Victory applies only victory effects');
assert(applyCampaignBattleOutcomeEffects(victoryOutcomeRun, battleNode, 'victory', 'battle_log_1', cards) === victoryOutcomeRun, 'A battle log cannot apply victory effects twice');
const defeatOutcomeRun = applyCampaignBattleOutcomeEffects(createCampaignRun(inventoryCampaign, initial), battleNode, 'defeat', 'battle_log_2', cards);
assert(defeatOutcomeRun.inventory.find((item) => item.object === 'Healing Potion')?.quantity === 2 && !defeatOutcomeRun.inventory.some((item) => item.object === 'Gold') && getCampaignCollection(defeatOutcomeRun).some((card) => card.id === monster.id), 'Defeat applies only defeat effects');
const drawOutcomeRun = applyCampaignBattleOutcomeEffects(run, battleNode, 'draw', 'battle_log_3', cards);
assert(drawOutcomeRun === run, 'Draws apply neither victory nor defeat effects');
const packagedOutcomeIds = getCampaignPlayerCardIds({ ...campaign, nodes: { battle_outcomes: battleNode } });
assert(packagedOutcomeIds.includes(reward.id) && packagedOutcomeIds.includes(monster.id), 'Cards referenced by both battle outcomes are included in campaign packaging');
const unusualObject = applyCampaignEffects(run, [{ id: 'named_resource', type: 'give_object', object: 'toString', quantity: 2 }], cards);
assert(unusualObject.inventory.some((item) => item.object === 'toString' && item.quantity === 2), 'Object names cannot accidentally read inherited object properties');
const legacyObject = normalizeCampaignInventory(applyCampaignEffects(run, [{ id: 'legacy_gold', type: 'give_resource', resource: 'Gold', quantity: 4 }], cards));
assert(legacyObject.inventory.some((item) => item.object === 'Gold' && item.quantity === 4) && Object.keys(legacyObject.resources).length === 0, 'Legacy resource effects migrate into the unified inventory');

const playerCollection: PlayerCollectionState = {
  username: 'tester', lastSynced: 1, cardsCount: 3,
  ownedCards: {
    1: { maxLevel: 2, count: 1, gold: false, tier: 1, edition: 1 },
    2: { maxLevel: 3, count: 1, gold: false, tier: 2, edition: 2 },
  },
  ownedCardNames: { 'starter monster': { maxLevel: 3, count: 1, detailId: 2 } },
};
const syncedCampaign = { ...campaign, collectionSource: 'player' as const };
const synced = createCampaignCollection(syncedCampaign, cards, playerCollection);
assert(synced.length === 2 && synced[0].stats.length === 2, 'Synced cards match official IDs and legacy names with owned level caps');
assert(createCampaignCollection({ ...syncedCampaign, allowedTiers: [1] }, cards, playerCollection).length === 1, 'Synced starting cards respect campaign edition restrictions');
assert(createCampaignCollection({ ...syncedCampaign, maxCardLevelsByRarity: { Rare: 1 } }, cards, playerCollection).every((card) => card.stats.length === 1), 'Campaign rarity caps apply to starting cards');
assert(createCampaignCollection(syncedCampaign, cards, null).length === 0, 'An unsynced player does not receive the global catalog');
const syncedRun = createCampaignRun(syncedCampaign, synced);
playerCollection.ownedCards[1].maxLevel = 3;
assert(syncedRun.initialCollection[0].stats.length === 2, 'Resyncing does not change an active campaign snapshot');
const originalStorage = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
const storedValues = new Map<string, string>([['splinter_collection_filter_mode', 'owned_only']]);
Object.defineProperty(globalThis, 'localStorage', {
  configurable: true,
  value: {
    getItem: (key: string) => storedValues.get(key) ?? null,
    setItem: (key: string, value: string) => storedValues.set(key, value),
    removeItem: (key: string) => storedValues.delete(key),
    clear: () => storedValues.clear(),
    key: (index: number) => [...storedValues.keys()][index] ?? null,
    get length() { return storedValues.size; },
  },
});
const originalWriteCampaignRuns = LocalWorkspaceService.writeCampaignRuns;
const persistedRuns: Record<string, CampaignRunState>[] = [];
LocalWorkspaceService.writeCampaignRuns = async (runs) => {
  persistedRuns.push(JSON.parse(JSON.stringify(runs)));
  return true;
};
try {
  StorageService.saveCampaignRun(syncedRun);
  assert(persistedRuns[0][syncedRun.campaignId].currentNodeId === syncedRun.currentNodeId, 'Saving campaign progress also writes its complete run to disk');
  storedValues.delete('splinter_campaign_runs');
  StorageService.hydrateCampaignRuns(persistedRuns[0]);
  assert(JSON.stringify(StorageService.getCampaignRun(syncedRun.campaignId)) === JSON.stringify(syncedRun), 'Campaign progress restores from disk into an empty browser store');
  StorageService.saveCampaignRun({ ...syncedRun, campaignId: 'second_campaign' });
  StorageService.deleteCampaignRun(syncedRun.campaignId);
  const resetRuns = persistedRuns[persistedRuns.length - 1];
  assert(!resetRuns[syncedRun.campaignId] && Boolean(resetRuns.second_campaign), 'Resetting progress updates disk without deleting other campaigns');
  StorageService.hydrateCampaignRuns({});
  assert(Object.keys(StorageService.getCampaignRuns()).length === 0, 'An empty disk progress file clears stale browser campaign saves');
  const legacyEmorCampaign: CampaignDefinition = { ...campaign, id: 'campaign_custom_1791371731769', name: 'The splintered paths of Emor' };
  const canonicalEmorCampaign: CampaignDefinition = { ...legacyEmorCampaign, id: 'campaign_splintered_paths_of_emor' };
  assert(StorageService.importCampaignsJson(JSON.stringify(legacyEmorCampaign)).success, 'Legacy Emor campaign IDs can be loaded');
  const migratedEmor = StorageService.getCustomCampaigns().filter((entry) => entry.name === 'The splintered paths of Emor');
  assert(migratedEmor.length === 1 && migratedEmor[0].id === canonicalEmorCampaign.id, 'Legacy Emor campaign IDs migrate to the canonical default ID');
  assert(StorageService.importCampaignsJson(JSON.stringify([legacyEmorCampaign, canonicalEmorCampaign])).success, 'Duplicate Emor campaign IDs can be loaded for migration');
  const mergedEmor = StorageService.getCustomCampaigns().filter((entry) => entry.name === 'The splintered paths of Emor');
  assert(mergedEmor.length === 1 && mergedEmor[0].id === canonicalEmorCampaign.id, 'Legacy and canonical Emor entries merge into one stored campaign');
  assert(StorageService.importCampaignsJson(JSON.stringify(unlockCampaign)).success, 'Campaign unlock definitions can be imported');
  const savedUnlockCampaign = (JSON.parse(StorageService.exportCampaignsJson()) as CampaignDefinition[]).find((entry) => entry.id === unlockCampaign.id);
  assert(savedUnlockCampaign?.unlocks?.[1].id === 'mana_spring' && savedUnlockCampaign.unlocks[1].description === 'Purchase the spring upgrade.', 'Campaign unlock IDs, names, and descriptions survive export');
  StorageService.saveCampaignRun({ ...unlockedRun, campaignId: unlockCampaign.id });
  const unlockPlayerMarkup = renderToStaticMarkup(createElement(CampaignPlayer, { campaign: unlockCampaign, cards, challenges: [], onExit: () => {} }));
  assert(unlockPlayerMarkup.includes('Unlocks (2/2)'), 'Campaign playback resumes saved unlock progress independently of card unlocks');
  const offerVisibilityCampaign: CampaignDefinition = {
    ...campaign,
    id: 'offer_visibility_campaign',
    startNodeId: 'offer_shop',
    nodes: { offer_shop: { id: 'offer_shop', type: 'shop', title: 'Test Shop', offers: [
      { id: 'locked_offer', title: 'Locked Offer', costs: [], effects: [{ id: 'locked_reward', type: 'give_mana', quantity: 1 }], preconditions: [{ id: 'requires_flag', type: 'has_unlock', unlockId: 'not_yet' }] },
      { id: 'available_offer', title: 'Available Offer', costs: [], effects: [{ id: 'available_reward', type: 'give_mana', quantity: 1 }] },
    ] } },
  };
  const offerVisibilityMarkup = renderToStaticMarkup(createElement(CampaignPlayer, { campaign: offerVisibilityCampaign, cards, challenges: [], onExit: () => {} }));
  assert(offerVisibilityMarkup.includes('Available Offer') && !offerVisibilityMarkup.includes('Locked Offer') && !offerVisibilityMarkup.includes('Requires unlock: Unavailable unlock'), 'Shop offers with unmet preconditions are hidden while eligible offers remain visible');
  const allOffersLockedCampaign: CampaignDefinition = {
    ...offerVisibilityCampaign, id: 'all_offers_locked_campaign',
    nodes: { offer_shop: { id: 'offer_shop', type: 'shop', title: 'Test Shop', offers: [offerVisibilityCampaign.nodes.offer_shop.type === 'shop' ? offerVisibilityCampaign.nodes.offer_shop.offers[0] : { id: 'missing', costs: [], effects: [] }] } },
  };
  const allOffersLockedMarkup = renderToStaticMarkup(createElement(CampaignPlayer, { campaign: allOffersLockedCampaign, cards, challenges: [], onExit: () => {} }));
  assert(allOffersLockedMarkup.includes('No available offers') && !allOffersLockedMarkup.includes('Locked Offer'), 'A shop with only locked offers shows the no-available-offers state');
  const architectCampaign: CampaignDefinition = {
    ...manaCampaign, id: 'test_architect_shop', startNodeId: 'architect', inventory: [{ id: 'wood', object: 'Wood', quantity: 10 }],
    nodes: {
      architect: { id: 'architect', type: 'shop', title: 'Architect', offers: [manaspringOffer, shopCardOffer], nextNodeId: 'exit' },
      exit: { id: 'exit', type: 'end', title: 'Leave Architect', outcome: 'neutral', message: '' },
    },
  };
  assert(StorageService.importCampaignsJson(JSON.stringify(architectCampaign)).success, 'Effects-only shop nodes can be imported');
  const savedArchitect = (JSON.parse(StorageService.exportCampaignsJson()) as CampaignDefinition[]).find((entry) => entry.id === architectCampaign.id)?.nodes.architect;
  assert(savedArchitect?.type === 'shop' && savedArchitect.offers[0].effects?.[0].type === 'increase_starting_mana' && !('reward' in savedArchitect.offers[0]), 'Shop costs and effects survive JSON export without a separate reward');
  assert(getCampaignPlayerCardIds(architectCampaign).includes(reward.id), 'Shop effect-granted cards are included in campaign packaging');
  const architectMarkup = renderToStaticMarkup(createElement(CampaignPlayer, { campaign: architectCampaign, cards, challenges: [], onExit: () => {} }));
  assert(architectMarkup.includes('Upgrade Manaspring') && architectMarkup.includes('+12 starting mana') && architectMarkup.includes('Leave'), 'The architect shop renders upgrade effects and a Leave button');
  const shopPriceCampaign: CampaignDefinition = {
    ...campaign,
    id: 'shop_price_inventory',
    startNodeId: 'price_shop',
    inventory: [{ id: 'starting_wood', object: 'Wood', quantity: 3 }],
    nodes: { price_shop: { id: 'price_shop', type: 'shop', title: 'Wood Trader', offers: [{
      id: 'wood_trade', title: 'Trade wood', costs: [{ object: 'Wood', quantity: 2 }], effects: [{ id: 'wood_trade_reward', type: 'give_mana', quantity: 1 }],
    }] } },
  };
  const shopPriceMarkup = renderToStaticMarkup(createElement(CampaignPlayer, { campaign: shopPriceCampaign, cards, challenges: [], onExit: () => {} }));
  assert(shopPriceMarkup.includes('2 x Wood (3 available)') && !shopPriceMarkup.includes('3 x Wood'), 'Shop prices show available item quantities without repeating the inventory list');
  if (savedArchitect?.type === 'shop') {
    const shopEditorMarkup = renderToStaticMarkup(createElement(CampaignShopEditor, { node: savedArchitect, nodes: Object.values(architectCampaign.nodes), cards, items: getCampaignItems(architectCampaign), onChange: () => {} }));
    assert(shopEditorMarkup.includes('Increase starting mana') && shopEditorMarkup.includes('Set mana to starting mana') && shopEditorMarkup.includes('Offer Effects') && !shopEditorMarkup.includes('Item Reward'), 'Shop editing uses effects for all rewards without a separate item reward control');
  }
  const legacyShopCampaign = {
    ...campaign, id: 'legacy_shop_campaign', startNodeId: 'shop',
    nodes: { shop: { id: 'shop', type: 'shop', title: 'Legacy Shop', offers: [{
      id: 'legacy_hammer', reward: { object: 'Hammer', quantity: 1 }, costs: [{ object: 'Ore', quantity: 1 }],
      effects: [{ id: 'legacy_mana', type: 'give_mana', quantity: 2 }],
    }] } },
  };
  assert(StorageService.importCampaignsJson(JSON.stringify(legacyShopCampaign)).success, 'Legacy item-reward shop offers can be imported');
  const migratedShop = StorageService.getCampaigns().find((entry) => entry.id === legacyShopCampaign.id)?.nodes.shop;
  assert(migratedShop?.type === 'shop' && !('reward' in migratedShop.offers[0]) && migratedShop.offers[0].effects.length === 2 && migratedShop.offers[0].effects[0].type === 'give_object', 'Legacy item rewards migrate to Give object effects while retaining other effects');
  if (migratedShop?.type === 'shop') {
    const migratedPurchase = tradeCampaignShopOffer(shopRun, migratedShop.offers[0], cards);
    assert(migratedPurchase.inventory?.some((item) => item.object === 'Hammer' && item.quantity === 1) && migratedPurchase.mana === 2, 'Migrated offers grant both their original item and additional effects');
    StorageService.importCampaignsJson(StorageService.exportCampaignsJson());
    const reloadedShop = StorageService.getCampaigns().find((entry) => entry.id === legacyShopCampaign.id)?.nodes.shop;
    assert(reloadedShop?.type === 'shop' && reloadedShop.offers[0].effects.length === 2, 'Repeated migration does not duplicate item reward effects');
  }
  assert(StorageService.importCampaignsJson(JSON.stringify(randomCampaign)).success, 'Random campaign nodes can be imported');
  const savedRandomCampaign = (JSON.parse(StorageService.exportCampaignsJson()) as CampaignDefinition[]).find((entry) => entry.id === randomCampaign.id);
  assert(savedRandomCampaign?.nodes.random_start.type === 'multi' && savedRandomCampaign.nodes.random_start.choices[0].probability === 70, 'Multi outcomes and probabilities survive JSON export');
  const legacyMultiCampaign = JSON.parse(JSON.stringify(randomCampaign));
  legacyMultiCampaign.id = 'legacy_random_campaign';
  legacyMultiCampaign.nodes.random_start.type = 'random';
  assert(StorageService.importCampaignsJson(JSON.stringify(legacyMultiCampaign)).success, 'Legacy random-node campaigns can still be imported');
  const normalizedLegacyMulti = StorageService.getCampaigns().find((entry) => entry.id === legacyMultiCampaign.id);
  assert(normalizedLegacyMulti?.nodes.random_start.type === 'multi', 'Legacy random nodes migrate to the Multi type on import');
  StorageService.saveCampaignRun(selectedBattleRun);
  const randomPlayerMarkup = renderToStaticMarkup(createElement(CampaignPlayer, { campaign: randomCampaign, cards, challenges: [], onExit: () => {} }));
  assert(randomPlayerMarkup.includes('Moss Guardian Encounter') && !randomPlayerMarkup.includes('This multi outcome could not be resolved'), 'Campaign playback resumes at the selected battle destination');
  const markup = renderToStaticMarkup(createElement(BattlePreparation, {
    challenge: {
      id: 'test_battle', name: 'Test Battle', description: '', manaCap: 20,
      rulesets: ['Standard'], allowedSplinters: ['Earth'],
      enemyTeam: { summonerId: summoner.id, summonerLevel: 1, monsters: [{ cardId: monster.id, level: 1 }] },
    },
    cards: [summoner, { ...monster, isCustom: true }, reward],
    campaignCollection: initial,
    playerCollection,
    onBack: () => {},
    onLaunchBattle: () => {},
  }));
  assert(markup.includes(monster.name), 'Campaign custom monsters remain selectable with the global owned-only preference');
  assert(!markup.includes(reward.name), 'Unearned reward monsters do not appear in battle preparation');
  assert(!markup.includes('Deck Mode:'), 'The global collection toggle cannot bypass the campaign roster');
  const hubCampaign: CampaignDefinition = {
    ...campaign,
    id: 'test_hub_campaign',
    startNodeId: 'hub',
    nodes: {
      hub: {
        id: 'hub', type: 'hub', title: 'Village Square', prompt: 'Where would you like to go?',
        choices: [
          { id: 'tavern_building', text: 'Village Tavern', description: 'Meet the innkeeper.', imageUrl: '/test-tavern.png', nextNodeId: 'tavern' },
          { id: 'market_building', text: 'Village Market', description: 'Visit the merchants.', nextNodeId: 'market' },
          { id: 'closed_building', text: 'Closed Guild', nextNodeId: 'missing' },
          { id: 'locked_building', type: 'node', text: 'Locked Grove', nextNodeId: 'tavern', preconditions: [{ id: 'requires_lost_key', type: 'has_unlock', unlockId: 'lost_key' }] },
          { id: 'campfire_event', type: 'event', text: 'Campfire Event', nextNodeId: 'tavern' },
          { id: 'trader_shop', type: 'shop', text: 'Traveling Trader', nextNodeId: 'market' },
          { id: 'supply_shop_poi', type: 'shop', text: 'Supply Shop', description: 'Outdated POI description.', nextNodeId: 'supply_shop' },
        ],
      },
      tavern: { id: 'tavern', type: 'text', title: 'The Innkeeper', content: 'Welcome!', nextNodeId: 'hub' },
      market: { id: 'market', type: 'text', title: 'Merchants', content: 'Browse our wares.', nextNodeId: 'hub' },
      supply_shop: { id: 'supply_shop', type: 'shop', title: 'Supplies', description: 'Fresh supplies from the shop.', offers: [], nextNodeId: 'hub' },
    },
  };
  const imported = StorageService.importCampaignsJson(JSON.stringify(hubCampaign));
  assert(imported.success && imported.count === 1, 'Campaign JSON import accepts Hub nodes');
  const exported: CampaignDefinition[] = JSON.parse(StorageService.exportCampaignsJson());
  const exportedHub = exported.find((item) => item.id === hubCampaign.id)?.nodes.hub;
  assert(exportedHub?.type === 'hub' && exportedHub.choices[0].imageUrl === '/test-tavern.png', 'Hub points of interest and images survive JSON export');
  assert(exportedHub?.type === 'hub' && exportedHub.choices[4].type === 'event' && exportedHub.choices[5].type === 'shop', 'Event and Shop point types survive JSON import and export');
  const renderHub = () => renderToStaticMarkup(createElement(CampaignPlayer, {
    campaign: hubCampaign, cards, challenges: [], onExit: () => {},
  }));
  const hubMarkup = renderHub();
  assert(hubMarkup.includes('Village Tavern') && hubMarkup.includes('Village Market'), 'Hub play displays each visitable point of interest');
  assert(hubMarkup.includes('Meet the innkeeper.') && hubMarkup.includes('src="/test-tavern.png"'), 'Hub play displays point of interest descriptions and images');
  assert(hubMarkup.includes('Fresh supplies from the shop.') && !hubMarkup.includes('Outdated POI description.'), 'Shop points of interest inherit the linked shop description instead of their own');
  if (hubCampaign.nodes.supply_shop.type === 'shop') {
    hubCampaign.nodes.supply_shop.description = 'Updated shop supplies.';
    assert(renderHub().includes('Updated shop supplies.'), 'Editing a shop description immediately updates its point of interest');
    hubCampaign.nodes.supply_shop.description = undefined;
    const emptyShopDescriptionMarkup = renderHub();
    assert(!emptyShopDescriptionMarkup.includes('Updated shop supplies.') && !emptyShopDescriptionMarkup.includes('Outdated POI description.'), 'A shop without a description does not fall back to stale POI text');
  }
  assert(!hubMarkup.includes('Closed Guild') && !hubMarkup.includes('Locked Grove'), 'Hub points with missing destinations or unmet preconditions are hidden');
  const getPointButtonMarkup = (name: string) => {
    const labelIndex = hubMarkup.indexOf(name);
    const buttonStart = hubMarkup.lastIndexOf('<button', labelIndex);
    const buttonEnd = hubMarkup.indexOf('</button>', labelIndex);
    return buttonStart >= 0 && buttonEnd >= 0 ? hubMarkup.slice(buttonStart, buttonEnd) : '';
  };
  assert(!getPointButtonMarkup('Village Tavern').includes('disabled=""'), 'Legacy points without a type remain available Node destinations');
  assert(!hubMarkup.includes('Campfire Event') && !hubMarkup.includes('Traveling Trader'), 'Unconfigured events and invalid shop destinations are hidden from hubs');
  const visitedHubRun = createCampaignRun(hubCampaign, initial);
  visitedHubRun.visitedNodeIds.push('tavern', 'hub');
  StorageService.saveCampaignRun(visitedHubRun);
  assert(renderHub().includes('Visited'), 'Resuming a hub preserves point of interest visit markers');
} finally {
  LocalWorkspaceService.writeCampaignRuns = originalWriteCampaignRuns;
  if (originalStorage) Object.defineProperty(globalThis, 'localStorage', originalStorage);
  else Reflect.deleteProperty(globalThis, 'localStorage');
}
console.log('Campaign collection and Hub tests passed.');