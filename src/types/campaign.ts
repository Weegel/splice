import { PvEChallenge } from './battle';
import { CardDefinition } from './card';

export type CampaignNodeType = 'text' | 'decision' | 'battle' | 'end';

export interface BaseCampaignNode {
  id: string;
  type: CampaignNodeType;
  title: string;
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

export interface DecisionChoice {
  id: string;
  text: string;
  description?: string;
  consequenceSummary?: string;
  nextNodeId: string;
  icon?: string;
}

export interface DecisionCampaignNode extends BaseCampaignNode {
  type: 'decision';
  prompt: string;
  description?: string;
  backgroundUrl?: string;
  choices: DecisionChoice[];
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

  victoryNarrative?: string;
  defeatNarrative?: string;
  rewardCardId?: string;
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
  | BattleCampaignNode
  | EndCampaignNode;

export interface CampaignDefinition {
  id: string;
  name: string;
  description: string;
  difficulty: 'Novice' | 'Bronze' | 'Silver' | 'Gold' | 'Diamond' | 'Boss';
  coverImage?: string;
  author?: string;
  isCustom?: boolean;
  startNodeId: string;
  nodes: Record<string, CampaignNode>;
  embeddedCards?: CardDefinition[];
  embeddedChallenges?: PvEChallenge[];
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
  earnedCards?: CardDefinition[];
  status: 'in_progress' | 'completed';
  finalOutcome?: 'victory' | 'defeat' | 'neutral';
}
