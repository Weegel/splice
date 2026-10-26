import { Ability, AbilityMeta } from '../types/card';

export const ABILITY_METAS: Record<Ability, AbilityMeta> = {
  Flying: {
    name: 'Flying',
    description: 'Has an increased chance (25%) of evading Melee or Ranged attacks from Monsters who do not have the Flying ability. Immune to Earthquake damage.',
    type: 'defense',
  },
  Sneak: {
    name: 'Sneak',
    description: 'Targets the last Monster on the enemy Team instead of the first Monster.',
    type: 'attack',
  },
  Snipe: {
    name: 'Snipe',
    description: 'Targets enemy Monsters with Ranged, Magic, or no attack that are not in the first position.',
    type: 'attack',
  },
  Opportunity: {
    name: 'Opportunity',
    description: 'Monsters with the Opportunity ability may attack from any position and will target the enemy Monster with the lowest health.',
    type: 'attack',
  },
  Reach: {
    name: 'Reach',
    description: 'Melee attack Monsters with the Reach ability may attack from the second position on the team.',
    type: 'passive',
  },
  Charge: {
    name: 'Charge',
    description: 'This Monster can attack with Melee attacks from any position on its team.',
    type: 'passive',
  },
  Ambush: {
    name: 'Ambush',
    description: 'Performs an attack before the first round begins.',
    type: 'attack',
  },
  Taunt: {
    name: 'Taunt',
    description: 'All enemy Monsters target this Monster (if they are able to).',
    type: 'defense',
  },
  Blast: {
    name: 'Blast',
    description: 'Does additional splash damage to Monsters adjacent to the target Monster (damage equal to half the attack, rounded up).',
    type: 'attack',
  },
  Shield: {
    name: 'Shield',
    description: 'Reduced damage from Melee and Ranged attacks (halved, rounded up; 1 damage becomes 1).',
    type: 'defense',
  },
  Void: {
    name: 'Void',
    description: 'Reduced damage from Magic attacks (halved, rounded up; 1 damage becomes 0 or 1).',
    type: 'defense',
  },
  'Void Armor': {
    name: 'Void Armor',
    description: 'Magic attacks hit this Monster\'s armor before its health.',
    type: 'defense',
  },
  'Divine Shield': {
    name: 'Divine Shield',
    description: 'The first time the Monster takes damage, it is ignored.',
    type: 'defense',
  },
  Heal: {
    name: 'Heal',
    description: 'Restores a portion of the Monster\'s health each round (1/3 max health rounded down, min 2).',
    type: 'buff',
  },
  Immunity: {
    name: 'Immunity',
    description: 'This Monster is immune to negative status effects.',
    type: 'defense',
  },
  'Tank Heal': {
    name: 'Tank Heal',
    description: 'Restores a portion of the Monster in the first position\'s health each round.',
    type: 'buff',
  },
  Triage: {
    name: 'Triage',
    description: 'Heals the friendly back-line Monster that has taken the most damage.',
    type: 'buff',
  },
  Thorns: {
    name: 'Thorns',
    description: 'When hit with a Melee attack, does 2 Melee damage back to the attacker.',
    type: 'trigger',
  },
  'Return Fire': {
    name: 'Return Fire',
    description: 'When hit with a Ranged attack, Monsters with Return Fire will return reduced damage to the attacker.',
    type: 'trigger',
  },
  'Magic Reflect': {
    name: 'Magic Reflect',
    description: 'When hit with Magic damage, does reduced Magic damage back to the attacker.',
    type: 'trigger',
  },
  Poison: {
    name: 'Poison',
    description: 'Attacks have a 50% chance to apply poison, which does 2 damage at the start of each round.',
    type: 'debuff',
  },
  Stun: {
    name: 'Stun',
    description: 'When a Monster with Stun hits a target, it has a chance to stun the target causing it to skip its next turn.',
    type: 'debuff',
  },
  Affliction: {
    name: 'Affliction',
    description: 'When a Monster with Affliction hits a target, it has a chance to apply Affliction, preventing the target from being healed.',
    type: 'debuff',
  },
  Enrage: {
    name: 'Enrage',
    description: 'Has increased Attack and Speed when damaged (Speed x 1.5, Attack x 1.5 rounded up).',
    type: 'passive',
  },
  'Double Strike': {
    name: 'Double Strike',
    description: 'Monster attacks twice each round.',
    type: 'attack',
  },
  Trample: {
    name: 'Trample',
    description: 'When a Monster with Trample hits and kills its target with Melee, it will immediately perform an additional attack on the next Monster.',
    type: 'trigger',
  },
  Piercing: {
    name: 'Piercing',
    description: 'If Melee or Ranged attack damage is in excess of the target\'s Armor, the remainder will damage the target\'s Health.',
    type: 'attack',
  },
  Cleave: {
    name: 'Cleave',
    description: 'Melee attacks also strike adjacent enemies for full attack damage. Unlike Blast, it is not a half-damage splash effect.',
    type: 'attack',
  },
  Dodge: {
    name: 'Dodge',
    description: 'Has an increased chance (25%) of evading Melee or Ranged attacks.',
    type: 'defense',
  },
  Phase: {
    name: 'Phase',
    description: 'Magic attacks can miss this Monster (using the same hit/miss calculations as Melee and Ranged).',
    type: 'defense',
  },
  Swiftness: {
    name: 'Swiftness',
    description: 'All friendly Monsters have their Speed increased by 1.',
    type: 'buff',
  },
  Slow: {
    name: 'Slow',
    description: 'Reduces the Speed of all enemy Monsters by 1.',
    type: 'debuff',
  },
  Inspire: {
    name: 'Inspire',
    description: 'Gives all friendly Monsters +1 Melee attack.',
    type: 'buff',
  },
  Demoralize: {
    name: 'Demoralize',
    description: 'Reduces the Melee attack of all enemy Monsters by 1.',
    type: 'debuff',
  },
  Strengthen: {
    name: 'Strengthen',
    description: 'Increases the Health of all friendly Monsters by 1.',
    type: 'buff',
  },
  Weaken: {
    name: 'Weaken',
    description: 'Reduces the Health of all enemy Monsters by 1.',
    type: 'debuff',
  },
  Protect: {
    name: 'Protect',
    description: 'All friendly Monsters gain +2 Armor.',
    type: 'buff',
  },
  Rust: {
    name: 'Rust',
    description: 'Reduces the Armor of all enemy Monsters by 2.',
    type: 'debuff',
  },
  Silence: {
    name: 'Silence',
    description: 'Reduces the Magic Attack of all enemy Monsters by 1.',
    type: 'debuff',
  },
  Headwinds: {
    name: 'Headwinds',
    description: 'Reduces the Ranged attack of all enemy Monsters by 1.',
    type: 'debuff',
  },
  'True Strike': {
    name: 'True Strike',
    description: 'This Monster\'s attacks cannot miss.',
    type: 'attack',
  },
  Resurrect: {
    name: 'Resurrect',
    description: 'When a friendly Monster dies, it is brought back to life with 1 Health (once per battle).',
    type: 'trigger',
  },
  Cleanse: {
    name: 'Cleanse',
    description: 'Removes all negative effects on the friendly Monster in the first position.',
    type: 'buff',
  },
  Dispel: {
    name: 'Dispel',
    description: 'When this monster hits an enemy, it clears all positive status effects on that enemy.',
    type: 'attack',
  },
  'Life Leech': {
    name: 'Life Leech',
    description: 'Monster\'s health increases each time it damages an enemy Monster\'s health (equal to half damage dealt).',
    type: 'passive',
  },
  Halving: {
    name: 'Halving',
    description: 'Each time this Monster hits a target, the target\'s attack is cut in half (rounded down).',
    type: 'debuff',
  },
  Shatter: {
    name: 'Shatter',
    description: 'Target\'s armor is completely destroyed when hit by an attack from this Monster.',
    type: 'attack',
  },
  Camouflage: {
    name: 'Camouflage',
    description: 'This Monster cannot be targeted for attacks unless it is in the first position.',
    type: 'defense',
  },
  'Close Range': {
    name: 'Close Range',
    description: 'Monsters with the Close Range ability can perform ranged attacks from the first position.',
    type: 'passive',
  },
  'Knock Out': {
    name: 'Knock Out',
    description: 'Does double damage when attacking an enemy that is stunned.',
    type: 'attack',
  },
  Retaliate: {
    name: 'Retaliate',
    description: 'When hit with a Melee attack, has a 50% chance to immediately attack back.',
    type: 'trigger',
  },
  Fury: {
    name: 'Fury',
    description: 'Does double damage to targets that have the Taunt ability.',
    type: 'attack',
  },
  Cripple: {
    name: 'Cripple',
    description: 'Each time an enemy is hit by this Monster, their max health is reduced by 1.',
    type: 'debuff',
  },
  Scavenger: {
    name: 'Scavenger',
    description: 'Gains 1 maximum Health each time any Monster dies.',
    type: 'buff',
  },
  Untrainable: {
    name: 'Untrainable',
    description: 'This Monster cannot gain additional abilities during battle.',
    type: 'passive',
  },
  'Weapons Training': {
    name: 'Weapons Training',
    description: 'Adjacent friendly Monsters with no attack gain this Monster\'s attack type and attack value.',
    type: 'buff',
  },
};

export const ALL_ABILITIES: Ability[] = Object.keys(ABILITY_METAS) as Ability[];
