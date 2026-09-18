import { Splinter } from './card';

export type RulesetName =
  | 'Standard'
  | 'Earthquake'
  | 'Noxious Fumes'
  | 'Super Sneak'
  | 'Target Practice'
  | 'Equalizer'
  | 'Reverse Speed'
  | 'Armored Up'
  | 'Unprotected'
  | 'Silenced Summoners'
  | 'Little League'
  | 'Lost Magic'
  | 'Going the Distance'
  | 'Up Close & Personal'
  | 'Keep Your Distance'
  | 'Healed Out'
  | 'Explosive Weaponry'
  | 'Holy Protection'
  | 'Back to Basics'
  | 'Weak Magic'
  | 'Aim True'
  | 'Stampede'
  | 'Fog of War';

export interface RulesetMeta {
  name: RulesetName;
  description: string;
  icon: string;
}

export const RULESET_METADATA: Record<RulesetName, RulesetMeta> = {
  'Standard': {
    name: 'Standard',
    description: 'No special modifications to the standard combat rules.',
    icon: 'Shield',
  },
  'Earthquake': {
    name: 'Earthquake',
    description: 'Non-flying Monsters take 2 physical damage at the end of each round.',
    icon: 'Activity',
  },
  'Noxious Fumes': {
    name: 'Noxious Fumes',
    description: 'All Monsters start the battle poisoned and take 2 damage at the start of each round.',
    icon: 'Skull',
  },
  'Super Sneak': {
    name: 'Super Sneak',
    description: 'All Melee attack Monsters gain the Sneak ability.',
    icon: 'EyeOff',
  },
  'Target Practice': {
    name: 'Target Practice',
    description: 'All Ranged and Magic attack Monsters gain the Snipe ability.',
    icon: 'Crosshair',
  },
  'Equalizer': {
    name: 'Equalizer',
    description: 'The initial Health of all Monsters is equal to the highest base health on either team.',
    icon: 'Equal',
  },
  'Reverse Speed': {
    name: 'Reverse Speed',
    description: 'Monsters with the lowest Speed attack first and have the highest chance of evading attacks.',
    icon: 'Rewind',
  },
  'Armored Up': {
    name: 'Armored Up',
    description: 'All Monsters receive +2 Armor at the start of battle.',
    icon: 'ShieldAlert',
  },
  'Unprotected': {
    name: 'Unprotected',
    description: 'Monsters lose any armor they have and cannot gain armor.',
    icon: 'ShieldOff',
  },
  'Silenced Summoners': {
    name: 'Silenced Summoners',
    description: 'Summoners do not grant any stat buffs, debuffs, or abilities.',
    icon: 'VolumeX',
  },
  'Little League': {
    name: 'Little League',
    description: 'Only Monsters and Summoners that cost 4 Mana or less may be used.',
    icon: 'Zap',
  },
  'Lost Magic': {
    name: 'Lost Magic',
    description: 'Monsters with Magic attack may not be used.',
    icon: 'Sparkles',
  },
  'Going the Distance': {
    name: 'Going the Distance',
    description: 'Only Monsters with Ranged attack may be used.',
    icon: 'Target',
  },
  'Up Close & Personal': {
    name: 'Up Close & Personal',
    description: 'Only Monsters with Melee attack may be used.',
    icon: 'Swords',
  },
  'Keep Your Distance': {
    name: 'Keep Your Distance',
    description: 'Monsters with Melee attack may not be used.',
    icon: 'ShieldQuestion',
  },
  'Healed Out': {
    name: 'Healed Out',
    description: 'All healing abilities are removed from Monsters.',
    icon: 'HeartOff',
  },
  'Explosive Weaponry': {
    name: 'Explosive Weaponry',
    description: 'All Monsters gain the Blast ability (damages adjacent targets).',
    icon: 'Bomb',
  },
  'Holy Protection': {
    name: 'Holy Protection',
    description: 'All Monsters gain the Divine Shield ability (blocks the first damage instance).',
    icon: 'Sun',
  },
  'Back to Basics': {
    name: 'Back to Basics',
    description: 'Monsters lose all abilities during battle.',
    icon: 'Ban',
  },
  'Weak Magic': {
    name: 'Weak Magic',
    description: 'Magic attacks hit Armor before directly reducing Health.',
    icon: 'Flame',
  },
  'Aim True': {
    name: 'Aim True',
    description: 'Attacks never miss their target.',
    icon: 'CheckCircle',
  },
  'Stampede': {
    name: 'Stampede',
    description: 'The Trample ability can trigger multiple times if the trampled monster dies.',
    icon: 'FastForward',
  },
  'Fog of War': {
    name: 'Fog of War',
    description: 'Monsters lose Sneak, Snipe, and Opportunity abilities.',
    icon: 'CloudFog',
  },
};

export const ALL_SPLINTERS: Splinter[] = ['Fire', 'Water', 'Earth', 'Life', 'Death', 'Dragon', 'Neutral'];
