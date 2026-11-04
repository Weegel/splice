import { CampaignDefinition, CampaignEffect, CampaignNode } from '../types/campaign';

export function renameCampaignNode(campaign: CampaignDefinition, nodeId: string, title: string): { campaign: CampaignDefinition; nodeId: string } {
  const originalNode = campaign.nodes[nodeId];
  if (!originalNode) return { campaign, nodeId };
  const slug = title.normalize('NFKD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '');
  const baseId = slug ? `node_${originalNode.type}_${slug}` : nodeId;
  let nextId = baseId;
  let suffix = 2;
  while (nextId !== nodeId && Object.prototype.hasOwnProperty.call(campaign.nodes, nextId)) {
    nextId = `${baseId}_${suffix++}`;
  }
  const updatedNode = { ...originalNode, title };
  if (nextId === nodeId) return { campaign: { ...campaign, nodes: { ...campaign.nodes, [nodeId]: updatedNode } }, nodeId };
  const reference = (target: string | undefined) => target === nodeId ? nextId : target;
  const effects = (entries: CampaignEffect[] | undefined) => entries?.map((effect) =>
    effect.type === 'go_to_node' && effect.nodeId === nodeId ? { ...effect, nodeId: nextId } : effect
  );
  const nodes = Object.fromEntries(Object.values(campaign.nodes).map((node) => {
    const updated: CampaignNode = { ...(node.id === nodeId ? updatedNode : node), id: reference(node.id)!, effects: effects(node.effects) };
    if (updated.type === 'text' || updated.type === 'shop') updated.nextNodeId = reference(updated.nextNodeId);
    if (updated.type === 'decision' || updated.type === 'multi' || updated.type === 'hub') {
      updated.choices = updated.choices.map((choice) => ({ ...choice, nextNodeId: reference(choice.nextNodeId)! }));
    }
    if (updated.type === 'hub') updated.choices = updated.choices.map((choice) => ({ ...choice, effects: effects(choice.effects) }));
    if (updated.type === 'battle') {
      updated.onVictoryNodeId = reference(updated.onVictoryNodeId);
      updated.onDefeatNodeId = reference(updated.onDefeatNodeId);
      updated.onDrawNodeId = reference(updated.onDrawNodeId);
      updated.victoryEffects = effects(updated.victoryEffects);
      updated.defeatEffects = effects(updated.defeatEffects);
    }
    if (updated.type === 'shop') updated.offers = updated.offers.map((offer) => ({ ...offer, effects: effects(offer.effects)! }));
    return [updated.id, updated];
  }));
  return {
    campaign: {
      ...campaign,
      startNodeId: reference(campaign.startNodeId)!,
      nodes,
      actions: campaign.actions?.map((action) => ({ ...action, effects: effects(action.effects)! })),
    },
    nodeId: nextId,
  };
}