import { CampaignDefinition, CampaignEffect, CampaignItemDefinition, CampaignItemParameter } from '../types/campaign';

export function getCampaignItems(campaign: CampaignDefinition): CampaignItemDefinition[] {
  if (campaign.items) return campaign.items;
  const names = new Map<string, string>();
  const addName = (name: string) => {
    const trimmed = name.trim();
    if (trimmed && !names.has(trimmed.toLowerCase())) names.set(trimmed.toLowerCase(), trimmed);
  };
  const addEffects = (effects: CampaignEffect[] = []) => effects.forEach((effect) => {
    if ('object' in effect) addName(effect.object);
    if ('resource' in effect) addName(effect.resource);
  });
  campaign.inventory?.forEach((item) => addName(item.object));
  Object.values(campaign.nodes).forEach((node) => {
    addEffects(node.effects);
    if (node.type === 'battle') {
      addEffects(node.victoryEffects);
      addEffects(node.defeatEffects);
    }
    if (node.type === 'hub') node.choices.forEach((choice) => addEffects(choice.effects));
    if (node.type === 'shop') node.offers.forEach((offer) => {
      offer.costs.forEach((cost) => addName(cost.object));
      if (offer.currencyObject) addName(offer.currencyObject);
      addEffects(offer.effects);
    });
  });
  return [...names.values()].map((name, index) => ({ id: `legacy_item_${index}`, name, description: '', parameters: {} }));
}

export function parseCampaignItemParameters(json: string): CampaignItemDefinition['parameters'] {
  const value: unknown = JSON.parse(json);
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Parameters must be a JSON object.');
  const allowed = new Set<string>(Object.values(CampaignItemParameter));
  for (const [key, amount] of Object.entries(value)) {
    if (!allowed.has(key)) throw new Error(`Unknown parameter "${key}". Allowed: ${[...allowed].join(', ')}.`);
    if (typeof amount !== 'number' || !Number.isFinite(amount) || amount < 0) throw new Error(`${key} must be a non-negative number.`);
    if (key === CampaignItemParameter.MaxCapacity && !Number.isInteger(amount)) throw new Error('maxcapacity must be a whole number.');
  }
  return value as CampaignItemDefinition['parameters'];
}

export function saveCampaignItem(campaign: CampaignDefinition, item: CampaignItemDefinition): CampaignDefinition {
  const items = getCampaignItems(campaign);
  const previous = items.find((entry) => entry.id === item.id);
  const rename = (name: string) => previous && name.trim().toLowerCase() === previous.name.toLowerCase() ? item.name : name;
  const renameEffects = (effects: CampaignEffect[] | undefined) => effects?.map((effect) => {
    if ('object' in effect) return { ...effect, object: rename(effect.object) };
    if ('resource' in effect) return { ...effect, resource: rename(effect.resource) };
    return effect;
  });
  return {
    ...campaign,
    items: previous ? items.map((entry) => entry.id === item.id ? item : entry) : [...items, item],
    inventory: campaign.inventory?.map((entry) => ({ ...entry, object: rename(entry.object) })),
    nodes: Object.fromEntries(Object.entries(campaign.nodes).map(([id, node]) => {
      const updated = { ...node, effects: renameEffects(node.effects) };
      if (updated.type === 'battle') {
        updated.victoryEffects = renameEffects(updated.victoryEffects);
        updated.defeatEffects = renameEffects(updated.defeatEffects);
      }
      if (updated.type === 'hub') updated.choices = updated.choices.map((choice) => ({ ...choice, effects: renameEffects(choice.effects) }));
      if (updated.type === 'shop') updated.offers = updated.offers.map((offer) => ({
        ...offer,
        costs: offer.costs.map((cost) => ({ ...cost, object: rename(cost.object) })),
        currencyObject: offer.currencyObject ? rename(offer.currencyObject) : undefined,
        effects: renameEffects(offer.effects) || [],
      }));
      return [id, updated];
    })),
  };
}