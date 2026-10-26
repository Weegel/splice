import { Ability, AttackType, CardDefinition, Splinter } from './card';
import { RulesetName } from './ruleset';

export interface MonsterSelection {
  cardId: string;
  level: number;
}

export interface TeamSelection {
  summonerId: string | null;
  summonerLevel: number;
  monsters: MonsterSelection[];
}

export interface PvEChallenge {
  id: string;
  name: string;
  description: string;
  manaCap: number;
  rulesets: RulesetName[];
  allowedSplinters: Splinter[];
  enemyTeam: TeamSelection;
  lore?: string;
  isCustom?: boolean;
  embeddedCards?: CardDefinition[];
}

export interface CombatMonsterState {
  instanceId: string; // unique ID in battle, e.g. "team1_0", "team2_2"
  teamIndex: 1 | 2;
  position: number; // 0-indexed position in line
  cardId: string;
  name: string;
  splinter: Splinter;
  level: number;
  mana: number;
  
  // Base stats (after level and equalizer if any)
  baseAttack: number;
  attackType: AttackType;
  baseSpeed: number;
  baseArmor: number;
  baseHealth: number;
  maxHealth: number;

  // Current live combat stats
  currentAttack: number;
  currentSpeed: number;
  currentArmor: number;
  currentHealth: number;
  
  // Abilities
  abilities: Ability[];
  temporaryAbilities?: Ability[];
  
  // Status effects
  isAlive: boolean;
  isPoisoned: boolean;
  isStunned: boolean;
  isAfflicted: boolean; // cannot heal
  isEnraged: boolean;
  hasDivineShield: boolean;
  hasResurrected: boolean;
  
  imageUrl?: string;
}

export interface CombatTeamState {
  teamIndex: 1 | 2;
  summonerId: string | null;
  summonerName: string;
  summonerSplinter: Splinter;
  summonerLevel: number;
  monsters: CombatMonsterState[];
}

export type BattleEventType =
  | 'BATTLE_INIT'
  | 'RULESET_APPLIED'
  | 'SUMMONER_APPLY'
  | 'PASSIVE_BUFF'
  | 'PASSIVE_DEBUFF'
  | 'ROUND_START'
  | 'TURN_START'
  | 'HEAL'
  | 'ATTACK'
  | 'MISS'
  | 'DIVINE_SHIELD_POP'
  | 'DAMAGE'
  | 'STATUS_APPLY'
  | 'STATUS_EXPIRE'
  | 'RESURRECT'
  | 'DEATH'
  | 'RETALIATE'
  | 'BLAST_DAMAGE'
  | 'THORNS_DAMAGE'
  | 'MAGIC_REFLECT_DAMAGE'
  | 'RETURN_FIRE_DAMAGE'
  | 'TRAMPLE'
  | 'POISON_TICK'
  | 'EARTHQUAKE_TICK'
  | 'FATIGUE_TICK'
  | 'ROUND_END'
  | 'BATTLE_END';

export interface BattleEvent {
  id: string;
  round: number;
  type: BattleEventType;
  actorId?: string;
  actorName?: string;
  actorTeam?: 1 | 2;
  targetId?: string;
  targetName?: string;
  targetTeam?: 1 | 2;
  
  amount?: number;
  attackType?: AttackType;
  ability?: Ability | string;
  ruleset?: RulesetName;
  text: string;
  
  // Full battlefield snapshot after this event occurs for seamless replay
  boardSnapshot: {
    team1: CombatMonsterState[];
    team2: CombatMonsterState[];
  };
}

export interface BattleLog {
  id: string;
  timestamp: number;
  manaCap: number;
  rulesets: RulesetName[];
  allowedSplinters: Splinter[];
  initialTeam1: CombatMonsterState[];
  initialTeam2: CombatMonsterState[];
  summoner1: { name: string; splinter: Splinter; level: number };
  summoner2: { name: string; splinter: Splinter; level: number };
  events: BattleEvent[];
  totalRounds: number;
  winner: 1 | 2 | 0; // 0 for draw
  summary: {
    rounds: number;
    team1MonstersLeft: number;
    team2MonstersLeft: number;
    mvpCardId?: string;
  };
}
