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
  | 'Weapons Training'
  | 'Amplify'
  | 'Apex Strike'
  | 'Armored Strike'
  | 'Backfire'
  | 'Blasphemy of Uul'
  | 'Blind'
  | 'Bloodline Dominion'
  | 'Bloodline Pact'
  | 'Bloodline Tribute'
  | 'Bloodlust'
  | 'Bulwark'
  | 'Cleanse Rearguard'
  | 'Conscript'
  | 'Corrosive Ward'
  | 'Corrupted Healing'
  | 'Deathblow'
  | 'Decoy'
  | 'Deflect'
  | 'Deflection Shroud'
  | 'Determined'
  | 'Echo'
  | 'Electrified'
  | 'Empower'
  | 'Enfeeble'
  | 'Execute'
  | 'Expose'
  | 'Final Rest'
  | 'Flame Fed'
  | 'Flank'
  | 'Focus'
  | 'Force Reduction'
  | 'Forcefield'
  | 'Giant Killer'
  | 'Impede'
  | 'Incendiary'
  | 'Invigorate'
  | 'Kindred Spirit'
  | 'Kindred Will'
  | 'Kindred Spirit:Blast'
  | 'Kindred Spirit:Execute'
  | 'Kindred Spirit:Giant Killer'
  | 'Kindred Spirit:Poison'
  | 'Kindred Spirit:Relentless Strike'
  | 'Kindred Spirit:Strengthen'
  | 'Kindred Spirit:Stun'
  | 'Kindred Spirit:True Strike'
  | 'Kindred Will:Ambush'
  | 'Kindred Will:Armored Strike'
  | 'Kindred Will:Deflection Shroud'
  | 'Kindred Will:Life Leech'
  | 'Kindred Will:Mimic'
  | 'Kindred Will:Rebirth'
  | 'Kindred Will:Shatter'
  | 'Kindred Will:Triage'
  | 'Last Stand'
  | 'Last Word'
  | 'Lookout'
  | 'Martyr'
  | 'Mimic'
  | 'Oppress'
  | 'Painforge'
  | 'Phase Ward'
  | 'Pinpoint'
  | 'Poison Burst'
  | 'Rebirth'
  | 'Recharge'
  | 'Reckless'
  | 'Redemption'
  | 'Reflexes'
  | 'Relentless Strike'
  | 'Repair'
  | 'Reprisal'
  | 'Resurgence'
  | 'Reveal'
  | 'Scattershot'
  | 'Shadow Focus'
  | 'Shapeshift'
  | 'Shield Ward'
  | 'Snare'
  | 'Soul Siphon'
  | 'Spite'
  | 'Stray Shot'
  | 'Volley of Arrows'
  | 'Weary'
  | 'Wingbreak';

export interface CardStatLevel {
  level: number;
  mana: number;
  attack: number;
  attackType: AttackType;
  attacks?: Partial<Record<Exclude<AttackType, 'None'>, number>>;
  speed: number;
  armor: number;
  health: number;
  abilities: Ability[];
}

export const MONSTER_ATTACK_TYPES = ['Magic', 'Ranged', 'Melee'] as const;

export function getCardAttacks(stat: Pick<CardStatLevel, 'attack' | 'attackType' | 'attacks'>): Partial<Record<Exclude<AttackType, 'None'>, number>> {
  if (stat.attacks) return { ...stat.attacks };
  return stat.attackType === 'None' ? {} : { [stat.attackType]: stat.attack };
}

export function withCardAttacks(attacks: NonNullable<CardStatLevel['attacks']>): Pick<CardStatLevel, 'attacks' | 'attack' | 'attackType'> {
  const attackType = MONSTER_ATTACK_TYPES.find((type) => (attacks[type] || 0) > 0) || 'None';
  return { attacks: { ...attacks }, attackType, attack: attackType === 'None' ? 0 : attacks[attackType] || 0 };
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

export interface CardRacialSynergy {
  race: string;
  abilities?: Ability[];
  statBuff?: number[];
}

export interface SummonerOption {
  id: string;
  name: string;
  description?: string;
  effect?: string;
  statBuff?: number[];
  abilities?: Ability[];
  statusEffects?: string[];
  target?: string;
  targetType?: string;
  max?: number;
}

export interface CardDefinition {
  id: string;
  name: string;
  splinter: Splinter;
  cardType: CardType;
  rarity: Rarity;
  stats: CardStatLevel[];
  isGladiator?: boolean;
  summonerBuffs?: SummonerBuffs;
  bloodline?: string;
  racialSynergy?: CardRacialSynergy[];
  summonerOptions?: SummonerOption[];
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
