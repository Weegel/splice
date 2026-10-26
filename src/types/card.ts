export type Splinter = 'Fire' | 'Water' | 'Earth' | 'Life' | 'Death' | 'Dragon' | 'Neutral';

export type CardType = 'Monster' | 'Summoner';

export type AttackType = 'Melee' | 'Ranged' | 'Magic' | 'None';

export type Rarity = 'Common' | 'Rare' | 'Epic' | 'Legendary';

export type Ability =
  | 'Flying'
  | 'Sneak'
  | 'Snipe'
  | 'Opportunity'
  | 'Reach'
  | 'Charge'
  | 'Ambush'
  | 'Taunt'
  | 'Blast'
  | 'Shield'
  | 'Void'
  | 'Void Armor'
  | 'Divine Shield'
  | 'Heal'
  | 'Tank Heal'
  | 'Triage'
  | 'Thorns'
  | 'Return Fire'
  | 'Magic Reflect'
  | 'Poison'
  | 'Stun'
  | 'Affliction'
  | 'Enrage'
  | 'Double Strike'
  | 'Trample'
  | 'Piercing'
  | 'Cleave'
  | 'Dodge'
  | 'Phase'
  | 'Swiftness'
  | 'Slow'
  | 'Inspire'
  | 'Demoralize'
  | 'Strengthen'
  | 'Weaken'
  | 'Protect'
  | 'Rust'
  | 'Silence'
  | 'Headwinds'
  | 'True Strike'
  | 'Resurrect'
  | 'Cleanse'
  | 'Dispel'
  | 'Life Leech'
  | 'Halving'
  | 'Shatter'
  | 'Camouflage'
  | 'Close Range'
  | 'Knock Out'
  | 'Retaliate'
  | 'Fury'
  | 'Cripple'
  | 'Immunity'
  | 'Scavenger'
  | 'Untrainable'
  | 'Weapons Training';

export interface CardStatLevel {
  level: number;
  mana: number;
  attack: number;
  attackType: AttackType;
  speed: number;
  armor: number;
  health: number;
  abilities: Ability[];
}

export interface SummonerBuffs {
  melee?: number;
  ranged?: number;
  magic?: number;
  speed?: number;
  armor?: number;
  health?: number;
  enemyMelee?: number;
  enemyRanged?: number;
  enemyMagic?: number;
  enemySpeed?: number;
  enemyArmor?: number;
  enemyHealth?: number;
  abilitiesGranted?: Ability[];
}

export interface CardDefinition {
  id: string;
  name: string;
  splinter: Splinter;
  cardType: CardType;
  rarity: Rarity;
  stats: CardStatLevel[];
  summonerBuffs?: SummonerBuffs;
  imageUrl?: string;
  description?: string;
  isCustom?: boolean;
}

export interface AbilityMeta {
  name: Ability;
  description: string;
  iconName?: string;
  type: 'passive' | 'attack' | 'defense' | 'buff' | 'debuff' | 'trigger';
}
