import { PvEChallenge } from './battle';
import { CardDefinition } from './card';

export type CampaignNodeType = 'text' | 'decision' | 'multi' | 'hub' | 'shop' | 'battle' | 'end';

export type CampaignEffect =
  | { id: string; type: 'give_object' | 'remove_object'; object: string; quantity: number }
  | { id: string; type: 'give_mana' | 'remove_mana'; quantity: number }
  | { id: string; type: 'set_mana'; mana: number; useStartingMana?: boolean }
  | { id: string; type: 'set_starting_mana'; mana: number }
  | { id: string; type: 'increase_starting_mana'; quantity: number }
  | { id: string; type: 'set_mana_to_starting_mana' }
  | { id: string; type: 'campaignunlock'; unlockIds: string[] }
  | { id: string; type: 'set_minimum_mana'; minimumMana: number }
  | { id: string; type: 'give_resource' | 'remove_resource'; resource: string; quantity: number }
  | { id: string; type: 'give_item' | 'remove_item'; object: string; quantity: number }
  | { id: string; type: 'give_card' | 'remove_card'; cardId: string };

export interface BaseCampaignNode {
  id: string;
  type: CampaignNodeType;
  title: string;
  effects?: CampaignEffect[];
}

export interface TextCampaignNode extends BaseCampaignNode {
  type: 'text';
  content: string;
  speakerName?: string;
  speakerAvatarUrl?: string;
  backgroundUrl?: string;
  buttonText?: string;
  nextNodeId?: string;
}

export type CampaignPrecondition =
  | { id: string; type: 'has_unlock'; unlockId: string }
  | { id: string; type: 'has_not_unlock'; unlockId: string }
  | { id: string; type: 'card_unlocked'; cardId: string }
  | { id: string; type: 'card_not_unlocked'; cardId: string }
  | { id: string; type: 'has_item'; item: string; quantity: number };

export interface DecisionChoice {
  id: string;
  text: string;
  description?: string;
  consequenceSummary?: string;
  nextNodeId: string;
  icon?: string;
  imageUrl?: string;
  preconditions?: CampaignPrecondition[];
}

export interface DecisionCampaignNode extends BaseCampaignNode {
  type: 'decision';
  prompt: string;
  description?: string;
  backgroundUrl?: string;
  choices: DecisionChoice[];
}

export type PointOfInterestType = 'event' | 'shop' | 'node';

export interface MultiCampaignNode extends BaseCampaignNode {
  type: 'multi';
  choices: { id: string; nextNodeId: string; probability: number; preconditions?: CampaignPrecondition[] }[];
}

export interface HubPointOfInterest extends DecisionChoice {
  type?: PointOfInterestType;
  effects?: CampaignEffect[];
}

export interface HubCampaignNode extends BaseCampaignNode {
  type: 'hub';
  prompt: string;
  description?: string;
  backgroundUrl?: string;
  choices: HubPointOfInterest[];
}

export interface BattleCampaignNode extends BaseCampaignNode {
  type: 'battle';
  description?: string;
  // Can link to an existing challenge ID or inline a challenge definition
  challengeId?: string;
  inlineChallenge?: PvEChallenge;
  
  // Branching paths based on combat resolution
  onVictoryNodeId?: string;
  onDefeatNodeId?: string;
  onDrawNodeId?: string;

  victoryEffects?: CampaignEffect[];
  defeatEffects?: CampaignEffect[];
  victoryNarrative?: string;
  defeatNarrative?: string;
  rewardCardId?: string;
}

export interface CampaignShopItem {
  object: string;
  quantity: number;
}

export interface CampaignShopOffer {
  id: string;
  title?: string;
  costs: CampaignShopItem[];
  effects: CampaignEffect[];
  preconditions?: CampaignPrecondition[];
}

export interface ShopCampaignNode extends BaseCampaignNode {
  type: 'shop';
  description?: string;
  offers: CampaignShopOffer[];
  nextNodeId?: string;
}

export interface EndCampaignNode extends BaseCampaignNode {
  type: 'end';
  outcome: 'victory' | 'defeat' | 'neutral';
  message: string;
  backgroundUrl?: string;
  rewardSummary?: string;
}

export type CampaignNode =
  | TextCampaignNode
  | DecisionCampaignNode
  | MultiCampaignNode
  | HubCampaignNode
  | ShopCampaignNode
  | BattleCampaignNode
  | EndCampaignNode;

export interface CampaignInventoryItem {
  id: string;
  object: string;
  quantity: number;
}

export enum CampaignItemParameter {
  SellValue = 'sellvalue',
  MaxCapacity = 'maxcapacity',
}

export interface CampaignItemDefinition {
  id: string;
  name: string;
  description: string;
  parameters: Partial<Record<CampaignItemParameter, number>>;
}

export interface CampaignUnlockDefinition {
  id: string;
  name: string;
  description: string;
}

export interface CampaignDefinition {
  id: string;
  name: string;
  description: string;
  coverImage?: string;
  author?: string;
  isCustom?: boolean;
  startNodeId: string;
  nodes: Record<string, CampaignNode>;
  embeddedCards?: CardDefinition[];
  embeddedChallenges?: PvEChallenge[];
  collectionSource?: 'player' | 'custom';
  startingCollection?: { cardId: string; maxLevel: number }[];
  inventory?: CampaignInventoryItem[];
  items?: CampaignItemDefinition[];
  unlocks?: CampaignUnlockDefinition[];
  campaignMana?: boolean;
  startingMana?: number;
  allowedEditions?: number[];
  allowedTiers?: Array<number | null>;
  allowGladiators?: boolean;
  allowRuni?: boolean;
  maxCardLevel?: number;
  maxCardLevelsByRarity?: Partial<Record<'Common' | 'Rare' | 'Epic' | 'Legendary', number>>;
}

export interface CampaignRunState {
  campaignId: string;
  currentNodeId: string;
  visitedNodeIds: string[];
  battleHistory: {
    nodeId: string;
    battleLogId: string;
    outcome: 'victory' | 'defeat' | 'draw';
  }[];
  unlockedCardIds: string[];
  campaignUnlockIds?: string[];
  initialCollection?: CardDefinition[];
  initialInventory?: CampaignInventoryItem[];
  inventory?: CampaignInventoryItem[];
  earnedCards?: CardDefinition[];
  resources?: Record<string, number>;
  minimumMana?: number;
  mana?: number;
  initialMana?: number;
  startingMana?: number;
  startingConfigurationKey?: string;
  removedCardIds?: string[];
  appliedEffectSourceIds?: string[];
  status: 'in_progress' | 'completed';
  finalOutcome?: 'victory' | 'defeat' | 'neutral';
}
