import { Ability, AttackType, CardDefinition, Splinter, SummonerOption } from '../types/card';
import { RulesetName } from '../types/ruleset';
import {
  BattleEvent,
  BattleEventType,
  BattleLog,
  CombatMonsterState,
  TeamSelection,
} from '../types/battle';

export interface BattleSimulationOptions {
  seed?: number;
  maxRounds?: number;
}

export class BattleEngine {
  private cardsMap: Map<string, CardDefinition>;
  private rulesets: RulesetName[];
  private manaCap: number;
  private team1Selection: TeamSelection;
  private team2Selection: TeamSelection;
  private allowedSplinters: Splinter[];
  private maxRounds: number;

  private team1Monsters: CombatMonsterState[] = [];
  private team2Monsters: CombatMonsterState[] = [];
  private team1Summoner: CardDefinition | null = null;
  private team2Summoner: CardDefinition | null = null;
  private team1SummonerAbilities: Ability[] = [];
  private team2SummonerAbilities: Ability[] = [];
  private auraDeltas = new Map<string, { attack: number; speed: number; armor: number; maxArmor: number; maxHealth: number; health: number; accuracy: number }>();
  private reflexAttackers = new Map<string, Set<string>>();
  private reprisalDamage = new Map<string, Map<string, number>>();

  private events: BattleEvent[] = [];
  private currentRound = 0;
  private eventCounter = 0;
  private randomSeed: number;

  constructor(
    cards: CardDefinition[],
    rulesets: RulesetName[],
    manaCap: number,
    team1: TeamSelection,
    team2: TeamSelection,
    allowedSplinters: Splinter[] = ['Fire', 'Water', 'Earth', 'Life', 'Death', 'Dragon', 'Neutral'],
    options: BattleSimulationOptions = {}
  ) {
    this.cardsMap = new Map();
    cards.forEach((c) => this.cardsMap.set(c.id, c));
    this.rulesets = rulesets.length > 0 ? rulesets : ['Standard'];
    this.manaCap = manaCap;
    this.team1Selection = team1;
    this.team2Selection = team2;
    this.allowedSplinters = allowedSplinters;
    this.randomSeed = options.seed ?? Date.now();
    this.maxRounds = Math.max(1, options.maxRounds ?? 50);
  }

  // Pseudo-random generator for deterministic replays if seed is provided
  private random(): number {
    const x = Math.sin(this.randomSeed++) * 10000;
    return x - Math.floor(x);
  }

  private hasRuleset(name: RulesetName): boolean {
    return this.rulesets.includes(name);
  }

  private addEvent(
    type: BattleEventType,
    text: string,
    params: {
      actor?: CombatMonsterState;
      target?: CombatMonsterState;
      amount?: number;
      attackType?: AttackType;
      ability?: Ability | string;
      ruleset?: RulesetName;
    } = {}
  ): void {
    this.eventCounter++;
    const event: BattleEvent = {
      id: `evt_${this.currentRound}_${this.eventCounter}`,
      round: this.currentRound,
      type,
      text,
      actorId: params.actor?.instanceId,
      actorName: params.actor?.name,
      actorTeam: params.actor?.teamIndex,
      targetId: params.target?.instanceId,
      targetName: params.target?.name,
      targetTeam: params.target?.teamIndex,
      amount: params.amount,
      attackType: params.attackType,
      ability: params.ability,
      ruleset: params.ruleset,
      boardSnapshot: this.createBoardSnapshot(),
    };
    this.events.push(event);
  }

  private createBoardSnapshot(): { team1: CombatMonsterState[]; team2: CombatMonsterState[] } {
    return {
      team1: this.team1Monsters.map((m) => ({ ...m, abilities: [...m.abilities] })),
      team2: this.team2Monsters.map((m) => ({ ...m, abilities: [...m.abilities] })),
    };
  }

  private getCard(cardId: string): CardDefinition {
    const card = this.cardsMap.get(cardId);
    if (!card) {
      throw new Error(`Card definition not found for ID: ${cardId}`);
    }
    return card;
  }

  private createMonsterState(
    cardId: string,
    level: number,
    teamIndex: 1 | 2,
    pos: number
  ): CombatMonsterState {
    const card = this.getCard(cardId);
    const statLevel =
      card.stats.find((s) => s.level === level) || card.stats[card.stats.length - 1] || card.stats[0];

    return {
      instanceId: `team${teamIndex}_${pos}_${card.id}`,
      teamIndex,
      position: pos,
      cardId: card.id,
      name: card.name,
      bloodline: card.bloodline,
      splinter: card.splinter,
      level: statLevel.level,
      mana: statLevel.mana,
      baseAttack: statLevel.attack,
      nativeAttackType: statLevel.attackType,
      attackType: statLevel.attackType,
      baseSpeed: statLevel.speed,
      baseArmor: statLevel.armor,
      maxArmor: statLevel.armor,
      baseHealth: statLevel.health,
      maxHealth: statLevel.health,
      currentAttack: statLevel.attack,
      currentSpeed: statLevel.speed,
      currentArmor: statLevel.armor,
      currentHealth: statLevel.health,
      abilities: [...statLevel.abilities],
      isAlive: true,
      isPoisoned: false,
      isBurning: false,
      isStunned: false,
      isAfflicted: false,
      isRevealed: false,
      isSnared: false,
      isExhausted: false,
      isEnraged: false,
      hasDivineShield: false,
      hasResurrected: false,
      hasRebirthed: false,
      hasResurged: false,
      hasSoulSiphoned: false,
      imageUrl: card.imageUrl,
    };
  }

  public resolve(): BattleLog {
    this.events = [];
    this.currentRound = 0;
    this.eventCounter = 0;
    this.auraDeltas.clear();

    // Load summoners
    this.team1Summoner = this.team1Selection.summonerId ? this.getCard(this.team1Selection.summonerId) : null;
    this.team2Summoner = this.team2Selection.summonerId ? this.getCard(this.team2Selection.summonerId) : null;

    // Instantiate monster states
    this.team1Monsters = this.team1Selection.monsters.map((m, idx) =>
      this.createMonsterState(m.cardId, m.level, 1, idx)
    );
    this.team2Monsters = this.team2Selection.monsters.map((m, idx) =>
      this.createMonsterState(m.cardId, m.level, 2, idx)
    );

    const initialSnapshot1 = this.team1Monsters.map((m) => ({ ...m, abilities: [...m.abilities] }));
    const initialSnapshot2 = this.team2Monsters.map((m) => ({ ...m, abilities: [...m.abilities] }));

    this.addEvent('BATTLE_INIT', `Battle initialized: Team 1 (${this.team1Summoner?.name || 'No Summoner'}) vs Team 2 (${this.team2Summoner?.name || 'No Summoner'})`);

    // --- RULES & SUMMONER SETUP PHASE ---
    this.applyRulesetsAndSummoners();
    this.processBattleStartAdjacencyAbilities();
    this.processShadowFocus();
    this.processKindredAbilities();
    this.processAmbushAbilities();

    // --- COMBAT ROUNDS ---
    while (this.currentRound < this.maxRounds && this.isTeamAlive(1) && this.isTeamAlive(2)) {
      this.currentRound++;
      this.executeRound();
    }

    // Determine winner
    let winner: 1 | 2 | 0 = 0;
    const team1Alive = this.isTeamAlive(1);
    const team2Alive = this.isTeamAlive(2);

    if (team1Alive && !team2Alive) {
      winner = 1;
      this.addEvent('BATTLE_END', `Team 1 (${this.team1Summoner?.name || 'No Summoner'}) emerges victorious!`);
    } else if (!team1Alive && team2Alive) {
      winner = 2;
      this.addEvent('BATTLE_END', `Team 2 (${this.team2Summoner?.name || 'No Summoner'}) emerges victorious!`);
    } else {
      winner = 0;
      this.addEvent('BATTLE_END', `The battle ended in a Draw after ${this.currentRound} rounds.`);
    }

    const t1Count = this.team1Monsters.filter((m) => m.isAlive).length;
    const t2Count = this.team2Monsters.filter((m) => m.isAlive).length;

    return {
      id: `battle_${Date.now()}_${Math.floor(Math.random() * 10000)}`,
      timestamp: Date.now(),
      manaCap: this.manaCap,
      rulesets: this.rulesets,
      allowedSplinters: this.allowedSplinters,
      initialTeam1: initialSnapshot1,
      initialTeam2: initialSnapshot2,
      summoner1: {
        name: this.team1Summoner?.name || 'No Summoner',
        splinter: this.team1Summoner?.splinter || 'Neutral',
        level: this.team1Selection.summonerLevel,
      },
      summoner2: {
        name: this.team2Summoner?.name || 'No Summoner',
        splinter: this.team2Summoner?.splinter || 'Neutral',
        level: this.team2Selection.summonerLevel,
      },
      events: this.events,
      totalRounds: this.currentRound,
      winner,
      summary: {
        rounds: this.currentRound,
        team1MonstersLeft: t1Count,
        team2MonstersLeft: t2Count,
      },
    };
  }

  private applyRulesetsAndSummoners(): void {
    const allMonsters = [...this.team1Monsters, ...this.team2Monsters];

    // Ruleset: Equalizer
    if (this.hasRuleset('Equalizer')) {
      const maxHp = Math.max(...allMonsters.map((m) => m.baseHealth), 1);
      allMonsters.forEach((m) => {
        m.baseHealth = maxHp;
        m.maxHealth = maxHp;
        m.currentHealth = maxHp;
      });
      this.addEvent('RULESET_APPLIED', `Equalizer: All monsters have their health equalized to ${maxHp} HP`, {
        ruleset: 'Equalizer',
      });
    }

    // Ruleset: Armored Up
    if (this.hasRuleset('Armored Up')) {
      allMonsters.forEach((m) => {
        m.baseArmor += 2;
        m.maxArmor += 2;
        m.currentArmor += 2;
      });
      this.addEvent('RULESET_APPLIED', 'Armored Up: All monsters receive +2 Armor', { ruleset: 'Armored Up' });
    }

    // Ruleset: Unprotected
    if (this.hasRuleset('Unprotected')) {
      allMonsters.forEach((m) => {
        m.baseArmor = 0;
        m.maxArmor = 0;
        m.currentArmor = 0;
      });
      this.addEvent('RULESET_APPLIED', 'Unprotected: All armor has been removed', { ruleset: 'Unprotected' });
    }

    // Ruleset: Holy Protection
    if (this.hasRuleset('Holy Protection')) {
      allMonsters.forEach((m) => {
        m.hasDivineShield = true;
        this.grantAbility(m, 'Divine Shield');
      });
      this.addEvent('RULESET_APPLIED', 'Holy Protection: All monsters gain Divine Shield', {
        ruleset: 'Holy Protection',
      });
    }

    // Ruleset: Super Sneak
    if (this.hasRuleset('Super Sneak')) {
      allMonsters.forEach((m) => {
        if (m.attackType === 'Melee') this.grantAbility(m, 'Sneak');
      });
      this.addEvent('RULESET_APPLIED', 'Super Sneak: All Melee monsters gain Sneak', { ruleset: 'Super Sneak' });
    }

    // Ruleset: Target Practice
    if (this.hasRuleset('Target Practice')) {
      allMonsters.forEach((m) => {
        if (m.attackType === 'Ranged' || m.attackType === 'Magic') this.grantAbility(m, 'Snipe');
      });
      this.addEvent('RULESET_APPLIED', 'Target Practice: All Ranged & Magic monsters gain Snipe', {
        ruleset: 'Target Practice',
      });
    }

    // Ruleset: Explosive Weaponry
    if (this.hasRuleset('Explosive Weaponry')) {
      allMonsters.forEach((m) => {
        this.grantAbility(m, 'Blast');
      });
      this.addEvent('RULESET_APPLIED', 'Explosive Weaponry: All monsters gain Blast', {
        ruleset: 'Explosive Weaponry',
      });
    }

    // Ruleset: Back to Basics
    if (this.hasRuleset('Back to Basics')) {
      allMonsters.forEach((m) => {
        m.abilities = [];
      });
      this.addEvent('RULESET_APPLIED', 'Back to Basics: All monster abilities have been removed', {
        ruleset: 'Back to Basics',
      });
    }

    // Ruleset: Fog of War
    if (this.hasRuleset('Fog of War')) {
      allMonsters.forEach((m) => {
        m.abilities = m.abilities.filter((a) => a !== 'Sneak' && a !== 'Snipe' && a !== 'Opportunity');
      });
      this.addEvent('RULESET_APPLIED', 'Fog of War: Sneak, Snipe, and Opportunity removed', {
        ruleset: 'Fog of War',
      });
    }

    // Ruleset: Healed Out
    if (this.hasRuleset('Healed Out')) {
      allMonsters.forEach((m) => {
        m.abilities = m.abilities.filter((a) => a !== 'Heal' && a !== 'Tank Heal' && a !== 'Triage');
      });
      this.addEvent('RULESET_APPLIED', 'Healed Out: All healing abilities removed', { ruleset: 'Healed Out' });
    }

    // Ruleset: Noxious Fumes
    if (this.hasRuleset('Noxious Fumes')) {
      allMonsters.forEach((m) => {
        m.isPoisoned = true;
      });
      this.addEvent('RULESET_APPLIED', 'Noxious Fumes: All monsters are afflicted with Poison', {
        ruleset: 'Noxious Fumes',
      });
    }

    // Summoner buffs & debuffs (if not Silenced Summoners)
    if (!this.hasRuleset('Silenced Summoners')) {
      if (this.team1Summoner) {
        this.applySummoner(this.team1Summoner, this.team1Selection.summonerLevel, this.team1Monsters, this.team2Monsters, 1);
      } else {
        this.team1SummonerAbilities = [];
        this.addEvent('SUMMONER_APPLY', 'Team 1 has no summoner; no buffs or debuffs applied');
      }
      if (this.team2Summoner) {
        this.applySummoner(this.team2Summoner, this.team2Selection.summonerLevel, this.team2Monsters, this.team1Monsters, 2);
      } else {
        this.team2SummonerAbilities = [];
        this.addEvent('SUMMONER_APPLY', 'Team 2 has no summoner; no buffs or debuffs applied');
      }
    } else {
      this.addEvent('RULESET_APPLIED', 'Silenced Summoners: Summoners grant no buffs or debuffs', {
        ruleset: 'Silenced Summoners',
      });
    }

    if (this.hasRuleset('Noxious Fumes')) {
      allMonsters.forEach((monster) => {
        if (monster.abilities.includes('Immunity')) monster.isPoisoned = false;
      });
    }

    this.applyWeaponsTraining();
    this.applyBlasphemyOfUul();

    // Passive monster auras (Swiftness, Slow, Inspire, Demoralize, Protect, Rust, etc.)
    this.recalculateAuras();
  }

  private applySummoner(
    summoner: CardDefinition,
    summonerLevel: number,
    friendly: CombatMonsterState[],
    enemy: CombatMonsterState[],
    teamIndex: 1 | 2
  ): void {
    const buffs = summoner.summonerBuffs;
    const statLevel = summoner.stats.find((s) => s.level === summonerLevel) || summoner.stats[summoner.stats.length - 1];
    const summonerAbilities = [...(statLevel?.abilities || []), ...(buffs?.abilitiesGranted || [])];
    if (teamIndex === 1) this.team1SummonerAbilities = summonerAbilities;
    else this.team2SummonerAbilities = summonerAbilities;
    if (summonerAbilities.includes('Bloodline Dominion')) this.applyBloodlineDominion(summoner, friendly);
    this.applySummonerOption(summoner, teamIndex, friendly, enemy);
    if (!buffs) {
      this.addEvent('SUMMONER_APPLY', `Summoner ${summoner.name} empowered Team ${teamIndex}`);
      return;
    }

    friendly.forEach((m) => {
      if (buffs.melee && m.attackType === 'Melee') m.currentAttack += buffs.melee;
      if (buffs.ranged && m.attackType === 'Ranged') m.currentAttack += buffs.ranged;
      if (buffs.magic && m.attackType === 'Magic') m.currentAttack += buffs.magic;
      if (buffs.speed) m.currentSpeed = Math.max(1, m.currentSpeed + buffs.speed);
      if (buffs.armor && !this.hasRuleset('Unprotected')) {
        m.currentArmor += buffs.armor;
        m.baseArmor += buffs.armor;
        m.maxArmor += buffs.armor;
      }
      if (buffs.health) {
        m.maxHealth += buffs.health;
        m.currentHealth += buffs.health;
        m.baseHealth += buffs.health;
      }
      if (buffs.abilitiesGranted) {
        buffs.abilitiesGranted.forEach((ab) => {
          this.grantAbility(m, ab);
        });
      }
    });

    enemy.forEach((m) => {
      if (buffs.enemyMelee && m.attackType === 'Melee') m.currentAttack = Math.max(1, m.currentAttack + buffs.enemyMelee);
      if (buffs.enemyRanged && m.attackType === 'Ranged') m.currentAttack = Math.max(1, m.currentAttack + buffs.enemyRanged);
      if (buffs.enemyMagic && m.attackType === 'Magic') m.currentAttack = Math.max(1, m.currentAttack + buffs.enemyMagic);
      if (buffs.enemySpeed) m.currentSpeed = Math.max(1, m.currentSpeed + buffs.enemySpeed);
      if (buffs.enemyArmor) m.currentArmor = Math.max(0, m.currentArmor + buffs.enemyArmor);
      if (buffs.enemyHealth) {
        m.maxHealth = Math.max(1, m.maxHealth + buffs.enemyHealth);
        m.currentHealth = Math.max(1, m.currentHealth + buffs.enemyHealth);
      }
    });

    this.addEvent('SUMMONER_APPLY', `Summoner ${summoner.name} empowered Team ${teamIndex}`);
  }

  private applySummonerOption(summoner: CardDefinition, teamIndex: 1 | 2, friendly: CombatMonsterState[], enemy: CombatMonsterState[]): void {
    const selection = teamIndex === 1 ? this.team1Selection : this.team2Selection;
    const option = summoner.summonerOptions?.find((candidate) => candidate.id === selection.summonerOptionId);
    if (!option) return;

    const selectedTargets = new Set(selection.summonerOptionTargets || []);
    const allTargets = [...friendly, ...enemy];
    const allowedTargets = option.target === 'team' ? friendly : option.target === 'opponent' ? enemy : allTargets;
    const targets = (option.targetType === 'unit'
      ? allowedTargets.filter((monster) => selectedTargets.has(monster.teamIndex === teamIndex ? `${teamIndex}:${monster.cardId}` : `${monster.teamIndex}:${monster.position}`))
      : option.target === 'opponent' ? enemy : friendly)
      .slice(0, option.max === undefined ? undefined : Math.max(0, option.max));

    for (const monster of targets) {
      const [melee = 0, ranged = 0, magic = 0, armor = 0, health = 0, speed = 0] = option.statBuff || [];
      if (monster.attackType === 'Melee') {
        monster.currentAttack = Math.max(0, monster.currentAttack + melee);
        monster.baseAttack = Math.max(0, monster.baseAttack + melee);
      } else if (monster.attackType === 'Ranged') {
        monster.currentAttack = Math.max(0, monster.currentAttack + ranged);
        monster.baseAttack = Math.max(0, monster.baseAttack + ranged);
      } else if (monster.attackType === 'Magic') {
        monster.currentAttack = Math.max(0, monster.currentAttack + magic);
        monster.baseAttack = Math.max(0, monster.baseAttack + magic);
      }
      if (armor && !this.hasRuleset('Unprotected')) {
        monster.currentArmor = Math.max(0, monster.currentArmor + armor);
        monster.baseArmor = Math.max(0, monster.baseArmor + armor);
        monster.maxArmor = Math.max(0, monster.maxArmor + armor);
      }
      if (health) {
        monster.maxHealth = Math.max(1, monster.maxHealth + health);
        monster.currentHealth = Math.max(1, monster.currentHealth + health);
        monster.baseHealth = Math.max(1, monster.baseHealth + health);
      }
      if (speed) monster.currentSpeed = Math.max(1, monster.currentSpeed + speed);

      for (const ability of option.abilities || []) this.grantAbility(monster, ability);
      for (const status of option.statusEffects || []) {
        if (status.toLowerCase() === 'poisoned' && !monster.abilities.includes('Immunity')) monster.isPoisoned = true;
        if (status.toLowerCase() === 'stunned' && !monster.abilities.includes('Immunity')) monster.isStunned = true;
        if (status.toLowerCase() === 'burning' && !monster.abilities.includes('Immunity')) monster.isBurning = true;
        if (status.toLowerCase() === 'revealed') monster.isRevealed = true;
        if (status.toLowerCase() === 'snared') monster.isSnared = true;
      }
      this.addEvent('SUMMONER_APPLY', `${summoner.name} applies ${option.name} to ${monster.name}`, {
        actor: monster,
        target: monster,
        ability: option.name,
      });
    }
  }

  private grantAbility(monster: CombatMonsterState, ability: Ability): void {
    if (monster.abilities.includes(ability)) return;
    monster.abilities.push(ability);
  }

  private applyBloodlineDominion(summoner: CardDefinition, friendly: CombatMonsterState[]): void {
    for (const monster of friendly) {
      const matchingSynergies = (summoner.racialSynergy || []).filter((synergy) =>
        monster.abilities.includes('Shapeshift') || monster.bloodline === synergy.race || monster.bloodline === summoner.bloodline
      );
      for (const synergy of matchingSynergies) {
        for (const ability of synergy.abilities || []) {
          const alreadyHasAbility = monster.abilities.includes(ability);
          this.grantAbility(monster, ability);
          if (!alreadyHasAbility && monster.abilities.includes(ability)) {
            this.addEvent('SUMMONER_APPLY', `${summoner.name}'s Bloodline Dominion grants ${ability} to ${monster.name}`, {
              actor: monster,
              target: monster,
              ability: 'Bloodline Dominion',
            });
          }
        }
      }
    }
  }

  private applyWeaponsTraining(): void {
    for (const team of [this.team1Monsters, this.team2Monsters]) {
      for (const trainer of team) {
        if (!trainer.isAlive || !trainer.abilities.includes('Weapons Training') || trainer.attackType === 'None' || trainer.currentAttack <= 0) continue;
        const trainerPosition = team.indexOf(trainer);
        for (const adjacentPosition of [trainerPosition - 1, trainerPosition + 1]) {
          const trainee = team[adjacentPosition];
          if (!trainee?.isAlive || trainee.abilities.includes('Untrainable') || trainee.attackType !== 'None' || trainee.currentAttack > 0) continue;
          trainee.baseAttack = Math.min(3, trainer.baseAttack);
          trainee.currentAttack = Math.min(3, trainer.currentAttack);
          trainee.attackType = trainer.attackType;
          this.addEvent('STATUS_APPLY', `${trainer.name} trains ${trainee.name} to use ${trainer.attackType} attacks!`, {
            actor: trainer,
            target: trainee,
            amount: trainee.currentAttack,
            ability: 'Weapons Training',
          });
        }
      }

    }
  }

  private applyBlasphemyOfUul(): void {
    for (const team of [this.team1Monsters, this.team2Monsters]) {
      const constructCount = team.filter((monster) => monster.isAlive && monster.bloodline === 'Divine Construct').length;
      if (constructCount === 0) continue;
      for (const blasphemer of team.filter((monster) => monster.isAlive && monster.attackType === 'Ranged' && monster.abilities.includes('Blasphemy of Uul'))) {
        blasphemer.currentAttack += constructCount;
        blasphemer.baseAttack += constructCount;
        this.addEvent('STATUS_APPLY', `${blasphemer.name} permanently gains ${constructCount} Ranged power from allied Divine Constructs`, {
          actor: blasphemer,
          target: blasphemer,
          amount: constructCount,
          ability: 'Blasphemy of Uul',
        });
      }
    }
  }

  private processKindredAbilities(): void {
    for (const team of [this.team1Monsters, this.team2Monsters]) {
      for (const source of team) {
        const baseGrants: Array<{ sourceAbility: Ability; counterpart: string; granted: Ability }> = [
          { sourceAbility: 'Kindred Spirit', counterpart: 'Kindred Will', granted: 'True Strike' },
          { sourceAbility: 'Kindred Will', counterpart: 'Kindred Spirit', granted: 'Ambush' },
        ];
        for (const { sourceAbility, counterpart, granted } of baseGrants) {
          if (!source.abilities.includes(sourceAbility)) continue;
          const position = team.indexOf(source);
          for (const target of [team[position - 1], team[position + 1]]) {
            if (!target?.isAlive || !target.abilities.some((ability) => ability === counterpart || ability.startsWith(`${counterpart}:`))) continue;
            const alreadyHasAbility = target.abilities.includes(granted);
            this.grantAbility(target, granted);
            if (!alreadyHasAbility && target.abilities.includes(granted)) {
              this.addEvent('STATUS_APPLY', `${source.name}'s ${sourceAbility} grants ${granted} to ${target.name}`, { actor: source, target, ability: sourceAbility });
            }
          }
        }

        const spiritVariant = source.abilities.find((ability) => ability.startsWith('Kindred Spirit:'));
        const willVariant = source.abilities.find((ability) => ability.startsWith('Kindred Will:'));
        const variant = spiritVariant || willVariant;
        if (!variant) continue;

        const expectedCounterpart = spiritVariant ? 'Kindred Will' : 'Kindred Spirit';
        const grantedAbility = variant.slice(variant.indexOf(':') + 1) as Ability;
        const position = team.indexOf(source);
        for (const target of [team[position - 1], team[position + 1]]) {
          if (!target?.isAlive || !target.abilities.some((ability) => ability === expectedCounterpart || ability.startsWith(`${expectedCounterpart}:`))) continue;
          const alreadyHasAbility = target.abilities.includes(grantedAbility);
          this.grantAbility(target, grantedAbility);
          if (!alreadyHasAbility && target.abilities.includes(grantedAbility)) {
            this.addEvent('STATUS_APPLY', `${source.name}'s Kindred ability grants ${grantedAbility} to adjacent ${target.name}`, {
              actor: source,
              target,
              ability: variant,
            });
          }
        }
      }
    }
  }

  private processBattleStartAdjacencyAbilities(): void {
    for (const team of [this.team1Monsters, this.team2Monsters]) {
      for (const source of team) {
        const position = team.indexOf(source);
        const adjacent = [team[position - 1], team[position + 1]].filter((monster): monster is CombatMonsterState => Boolean(monster?.isAlive));
        const grants: Ability[] = [];
        if (source.abilities.includes('Deflection Shroud')) grants.push('Deflect');
        for (const ally of adjacent) {
          for (const ability of grants) {
            this.grantAbility(ally, ability);
            if (ally.abilities.includes(ability)) this.addEvent('STATUS_APPLY', `${source.name} grants ${ability} to adjacent ${ally.name}`, { actor: source, target: ally, ability: source.abilities.includes('Deflection Shroud') ? 'Deflection Shroud' : ability });
          }
        }
        if (source.abilities.includes('Flank') && position === 0 && team[1]?.isAlive) {
          this.grantAbility(team[1], 'Reach');
          if (team[1].abilities.includes('Reach')) this.addEvent('STATUS_APPLY', `${source.name}'s Flank grants Reach to ${team[1].name}`, { actor: source, target: team[1], ability: 'Flank' });
        }
      }

      for (const source of team) {
        const sourcePosition = team.indexOf(source);
        const front = team[sourcePosition - 1];
        if (!front?.isAlive) continue;
        const frontGrant = source.abilities.includes('Phase Ward') ? 'Phase'
          : source.abilities.includes('Shield Ward') ? 'Shield'
            : null;
        if (!frontGrant) continue;
        this.grantAbility(front, frontGrant);
        if (front.abilities.includes(frontGrant)) this.addEvent('STATUS_APPLY', `${source.name} grants ${frontGrant} to the frontline ${front.name}`, { actor: source, target: front, ability: source.abilities.includes('Phase Ward') ? 'Phase Ward' : 'Shield Ward' });
      }
    }
  }

  private processShadowFocus(): void {
    for (const team of [this.team1Monsters, this.team2Monsters]) {
      const source = team[team.length - 1];
      if (!source?.isAlive || !source.abilities.includes('Shadow Focus')) continue;
      this.grantAbility(source, 'Camouflage');
      source.currentAttack = 0;
      source.attackType = 'None';
      for (const ally of team) {
        if (ally.baseAttack > 0) {
          ally.currentAttack += 1;
          ally.baseAttack += 1;
        }
        this.grantAbility(ally, 'Determined');
      }
      this.addEvent('STATUS_APPLY', `${source.name}'s Shadow Focus grants Camouflage to itself and power and Determined to its team`, {
        actor: source,
        target: source,
        ability: 'Shadow Focus',
      });
    }
  }

  private processAmbushAbilities(): void {
    const reverseSpeed = this.hasRuleset('Reverse Speed');
    const attackRank = (type: AttackType) => type === 'Magic' ? 4 : type === 'Ranged' ? 3 : type === 'Melee' ? 2 : 1;
    const ambushers = [...this.getAliveMonsters(1), ...this.getAliveMonsters(2)]
      .filter((monster) => monster.abilities.includes('Ambush'))
      .sort((left, right) => {
        const speedDifference = reverseSpeed ? left.currentSpeed - right.currentSpeed : right.currentSpeed - left.currentSpeed;
        return speedDifference || attackRank(right.attackType) - attackRank(left.attackType) || left.instanceId.localeCompare(right.instanceId);
      });

    for (const ambusher of ambushers) {
      if (!ambusher.isAlive || !this.isTeamAlive(1) || !this.isTeamAlive(2)) break;
      this.addEvent('TURN_START', `${ambusher.name} attacks before the first round with Ambush!`, {
        actor: ambusher,
        ability: 'Ambush',
      });
      this.executeMonsterTurn(ambusher);
    }
  }

  private recalculateAuras(): void {
    this.clearAuraDeltas();
    const teams = [
      { friendly: this.team1Monsters, enemy: this.team2Monsters, summonerAbilities: this.team1SummonerAbilities },
      { friendly: this.team2Monsters, enemy: this.team1Monsters, summonerAbilities: this.team2SummonerAbilities },
    ];

    for (const { friendly, enemy, summonerAbilities } of teams) {
      const aliveFriendly = friendly.filter((m) => m.isAlive);
      const aliveEnemy = enemy.filter((m) => m.isAlive);

      const abilitySources = [...aliveFriendly.map((m) => m.abilities), summonerAbilities];
      for (const abilities of abilitySources) {
        for (const ability of abilities) {
          if (ability === 'Swiftness') {
            aliveFriendly.forEach((f) => this.addAuraDelta(f, 'speed', 1));
          }
          if (ability === 'Inspire') {
            aliveFriendly.forEach((f) => {
              if (f.attackType === 'Melee') this.addAuraDelta(f, 'attack', 1);
            });
          }
          if (ability === 'Strengthen') {
            aliveFriendly.forEach((f) => {
              this.addAuraDelta(f, 'maxHealth', 1);
              this.addAuraDelta(f, 'health', 1);
            });
          }
          if (ability === 'Protect' && !this.hasRuleset('Unprotected')) {
            aliveFriendly.forEach((f) => this.addAuraDelta(f, 'armor', 2));
          }
          if (ability === 'Slow') {
            aliveEnemy.forEach((e) => this.addAuraDelta(e, 'speed', -1));
          }
          if (ability === 'Demoralize') {
            aliveEnemy.forEach((e) => {
              if (e.attackType === 'Melee') this.addAuraDelta(e, 'attack', -1);
            });
          }
          if (ability === 'Weaken') {
            aliveEnemy.forEach((e) => {
              this.addAuraDelta(e, 'maxHealth', -1);
              this.addAuraDelta(e, 'health', -1);
            });
          }
          if (ability === 'Rust') {
            aliveEnemy.forEach((e) => this.addAuraDelta(e, 'armor', -2));
          }
          if (ability === 'Silence') {
            aliveEnemy.forEach((e) => {
              if (e.attackType === 'Magic') this.addAuraDelta(e, 'attack', -1);
            });
          }
          if (ability === 'Headwinds') {
            aliveEnemy.forEach((e) => {
              if (e.attackType === 'Ranged') this.addAuraDelta(e, 'attack', -1);
            });
          }
          if (ability === 'Focus') {
            aliveFriendly.forEach((f) => {
              if (f.attackType === 'Ranged') this.addAuraDelta(f, 'attack', 1);
            });
          }
        }
      }

      for (const source of aliveFriendly.filter((monster) => monster.abilities.includes('Empower') && !monster.isRevealed)) {
        const index = friendly.indexOf(source);
        for (const target of [friendly[index - 1], source, friendly[index + 1]]) {
          if (target?.isAlive && !target.isRevealed) this.addAuraDelta(target, 'attack', 1);
        }
      }

      const livingFront = aliveFriendly[0];
      if (livingFront?.abilities.includes('Bulwark')) {
        this.addAuraDelta(livingFront, 'attack', -2);
        this.addAuraDelta(livingFront, 'maxHealth', 8);
        this.addAuraDelta(livingFront, 'health', 8);
        this.addAuraDelta(livingFront, 'armor', 8);
        this.addAuraDelta(livingFront, 'maxArmor', 8);
      }

      if (aliveFriendly.length === 1 && aliveFriendly[0].abilities.includes('Last Stand')) {
        const last = aliveFriendly[0];
        this.addAuraDelta(last, 'attack', Math.ceil(last.currentAttack / 2));
        this.addAuraDelta(last, 'speed', Math.ceil(last.currentSpeed / 2));
        this.addAuraDelta(last, 'armor', Math.ceil(last.currentArmor / 2));
        this.addAuraDelta(last, 'maxArmor', Math.ceil(last.maxArmor / 2));
        this.addAuraDelta(last, 'maxHealth', Math.ceil(last.maxHealth / 2));
        this.addAuraDelta(last, 'health', Math.ceil(last.currentHealth / 2));
      }

    }
  }

  private addAuraDelta(monster: CombatMonsterState, field: 'attack' | 'speed' | 'armor' | 'maxArmor' | 'maxHealth' | 'health' | 'accuracy', delta: number): void {
    const effects = this.auraDeltas.get(monster.instanceId) || { attack: 0, speed: 0, armor: 0, maxArmor: 0, maxHealth: 0, health: 0, accuracy: 0 };
    const previous = field === 'attack' ? monster.currentAttack
      : field === 'speed' ? monster.currentSpeed
        : field === 'armor' ? monster.currentArmor
          : field === 'maxArmor' ? monster.maxArmor
            : field === 'accuracy' ? monster.accuracyModifier || 0
          : field === 'maxHealth' ? monster.maxHealth
            : monster.currentHealth;
    const next = field === 'speed' ? Math.max(1, previous + delta)
      : field === 'attack' ? Math.max(0, previous + delta)
        : field === 'armor' || field === 'maxArmor' ? Math.max(0, previous + delta)
          : field === 'accuracy' ? Math.max(-100, Math.min(0, previous + delta))
            : Math.max(1, previous + delta);
    if (field === 'attack') monster.currentAttack = next;
    if (field === 'speed') monster.currentSpeed = next;
    if (field === 'armor') monster.currentArmor = next;
    if (field === 'maxArmor') monster.maxArmor = next;
    if (field === 'accuracy') monster.accuracyModifier = next;
    if (field === 'maxHealth') monster.maxHealth = next;
    if (field === 'health') monster.currentHealth = next;
    effects[field] += next - previous;
    this.auraDeltas.set(monster.instanceId, effects);
  }

  private clearAuraDeltas(): void {
    for (const monster of [...this.team1Monsters, ...this.team2Monsters]) {
      const effects = this.auraDeltas.get(monster.instanceId);
      if (!effects) continue;
      monster.currentAttack -= effects.attack;
      monster.currentSpeed -= effects.speed;
      monster.currentArmor -= effects.armor;
      monster.maxArmor = Math.max(0, monster.maxArmor - effects.maxArmor);
      monster.accuracyModifier = (monster.accuracyModifier || 0) - effects.accuracy;
      monster.maxHealth = Math.max(1, monster.maxHealth - effects.maxHealth);
      monster.currentHealth = monster.isAlive ? Math.max(1, monster.currentHealth - effects.health) : 0;
    }
    this.auraDeltas.clear();
  }

  private getEffectiveSpeed(monster: CombatMonsterState): number {
    return monster.isEnraged ? Math.ceil(monster.currentSpeed * 1.5) : monster.currentSpeed;
  }

  private applyEnrage(monster: CombatMonsterState): void {
    if (!monster.isAlive || monster.currentHealth <= 0 || monster.isEnraged || !monster.abilities.includes('Enrage')) return;
    monster.isEnraged = true;
    this.addEvent('STATUS_APPLY', `${monster.name} becomes enraged!`, { target: monster, ability: 'Enrage' });
  }

  private isTeamAlive(teamIndex: 1 | 2): boolean {
    const team = teamIndex === 1 ? this.team1Monsters : this.team2Monsters;
    return team.some((m) => m.isAlive && m.currentHealth > 0);
  }

  private getAliveMonsters(teamIndex: 1 | 2): CombatMonsterState[] {
    const team = teamIndex === 1 ? this.team1Monsters : this.team2Monsters;
    return team.filter((m) => m.isAlive && m.currentHealth > 0);
  }

  private hasTeamAbility(teamIndex: 1 | 2, ability: Ability): boolean {
    return this.getAliveMonsters(teamIndex).some((monster) => monster.abilities.includes(ability));
  }

  private hasAdjacentLookout(target: CombatMonsterState): boolean {
    const team = target.teamIndex === 1 ? this.team1Monsters : this.team2Monsters;
    const position = team.indexOf(target);
    return [team[position - 1], team[position + 1]].some((ally) => ally?.isAlive && ally.abilities.includes('Lookout'));
  }

  private getTargetPower(monster: CombatMonsterState): number {
    return monster.currentAttack * (monster.abilities.includes('Double Strike') ? 2 : 1);
  }

  private sharesBloodline(left: CombatMonsterState, right: CombatMonsterState): boolean {
    return left.abilities.includes('Shapeshift') || right.abilities.includes('Shapeshift') || Boolean(left.bloodline && left.bloodline === right.bloodline);
  }

  private executeRound(): void {
    this.reflexAttackers.clear();
    this.reprisalDamage.clear();
    this.addEvent('ROUND_START', `--- Round ${this.currentRound} Begins ---`);

    // 1. Round Start Status Effects (Poison, Fatigue)
    this.processRoundStartEffects();

    if (!this.hasRuleset('Silenced Summoners')) {
      this.recalculateAuras();
    }

    if (!this.isTeamAlive(1) || !this.isTeamAlive(2)) {
      return;
    }

    // 2. Pre-turn heals and cleanse
    this.processPreTurnAbilities();

    // 3. Build Turn Order
    const aliveMonsters = [...this.getAliveMonsters(1), ...this.getAliveMonsters(2)];

    // Sort by speed: Highest speed acts first (or lowest in Reverse Speed)
    // Tiebreakers: Magic > Ranged > Melee > None
    const reverseSpeed = this.hasRuleset('Reverse Speed');
    aliveMonsters.sort((a, b) => {
      const speedDiff = reverseSpeed ? this.getEffectiveSpeed(a) - this.getEffectiveSpeed(b) : this.getEffectiveSpeed(b) - this.getEffectiveSpeed(a);
      if (speedDiff !== 0) return speedDiff;

      const attackRank = (t: AttackType) => (t === 'Magic' ? 4 : t === 'Ranged' ? 3 : t === 'Melee' ? 2 : 1);
      const typeDiff = attackRank(b.attackType) - attackRank(a.attackType);
      if (typeDiff !== 0) return typeDiff;

      return a.instanceId.localeCompare(b.instanceId);
    });

    // 4. Monster Attack Turns
    for (const actor of aliveMonsters) {
      if (!actor.isAlive || actor.currentHealth <= 0) continue;
      if (!this.isTeamAlive(1) || !this.isTeamAlive(2)) break;

      // Handle Stun
      if (actor.isStunned) {
        actor.isStunned = false;
        this.addEvent('STATUS_EXPIRE', `${actor.name} is stunned and skips its turn!`, { actor });
        continue;
      }

      if (actor.isExhausted) {
        actor.isExhausted = false;
        this.addEvent('STATUS_EXPIRE', `${actor.name} is exhausted and skips its turn!`, { actor });
        continue;
      }

      this.executeMonsterTurn(actor);

      // Check Double Strike
      if (actor.isAlive && actor.abilities.includes('Double Strike') && this.isTeamAlive(actor.teamIndex === 1 ? 2 : 1)) {
        this.addEvent('TURN_START', `${actor.name} attacks again with Double Strike!`, {
          actor,
          ability: 'Double Strike',
        });
        this.executeMonsterTurn(actor);
      }
    }

    // 5. Round End Effects
    if (this.hasRuleset('Earthquake')) {
      this.processEarthquake();
    }

    // Reapply recurring team auras after round effects, without stacking prior applications.
    if (!this.hasRuleset('Silenced Summoners')) {
      this.recalculateAuras();
    }

    // Reorder and update positions
    this.reindexPositions();
    this.addEvent('ROUND_END', `Round ${this.currentRound} ended`);
  }

  private processRoundStartEffects(): void {
    const allLiving = [...this.getAliveMonsters(1), ...this.getAliveMonsters(2)];

    if (this.currentRound > 1) {
      for (const monster of allLiving) {
        if (monster.isPoisoned && monster.isAlive) {
          this.applyDirectHealthDamage(monster, 2, 'Poison', 'POISON_TICK');
        }
      }
    }

    for (const teamIndex of [1, 2] as const) {
      const team = this.getAliveMonsters(teamIndex);
      const hiddenEnemies = this.getAliveMonsters(teamIndex === 1 ? 2 : 1).filter((monster) => monster.abilities.includes('Camouflage') && !monster.isRevealed);
      if (team.some((monster) => monster.abilities.includes('Reveal')) && hiddenEnemies.length > 0) {
        const revealed = hiddenEnemies[Math.floor(this.random() * hiddenEnemies.length)];
        revealed.isRevealed = true;
        this.addEvent('STATUS_APPLY', `${revealed.name} is revealed by the opposing team!`, { target: revealed, ability: 'Reveal' });
      }

      if (this.currentRound > 1) {
        const excludedMimicAbilities: Ability[] = [
          'Incendiary', 'Electrified', 'Weary', 'Force Reduction',
          'Apex Strike', 'Decoy', 'Opportunity', 'Scattershot', 'Sneak', 'Snipe', 'Taunt', 'Wingbreak',
          'Ambush', 'Weapons Training', 'Flank', 'Reach', 'Charge',
        ];
        const enemyAbilities = this.getAliveMonsters(teamIndex === 1 ? 2 : 1)
          .flatMap((monster) => monster.abilities)
          .filter((ability, index, abilities) => index === abilities.indexOf(ability) && !excludedMimicAbilities.includes(ability));
        for (const mimic of team.filter((monster) => monster.abilities.includes('Mimic'))) {
          const eligible = enemyAbilities.filter((ability) => !mimic.abilities.includes(ability));
          if (eligible.length === 0) continue;
          const copied = eligible[Math.floor(this.random() * eligible.length)];
          this.grantAbility(mimic, copied);
          this.addEvent('STATUS_APPLY', `${mimic.name} copies ${copied} with Mimic!`, { actor: mimic, target: mimic, ability: 'Mimic' });
        }
      }
    }

    if (this.currentRound >= 2 && allLiving.some((monster) => monster.abilities.includes('Incendiary'))) {
      allLiving.forEach((monster) => { monster.isBurning = true; });
    }

    for (const teamIndex of [1, 2] as const) {
      const team = this.getAliveMonsters(teamIndex);
      for (const source of team.filter((monster) => monster.isBurning)) {
        if (this.random() >= 0.33) continue;
        const position = team.indexOf(source);
        const adjacent = [team[position - 1], team[position + 1]].filter((monster) => monster?.isAlive && !monster.isBurning);
        if (adjacent.length > 0) adjacent[Math.floor(this.random() * adjacent.length)]!.isBurning = true;
      }
    }

    for (const monster of [...this.getAliveMonsters(1), ...this.getAliveMonsters(2)]) {
      if (monster.isBurning && monster.isAlive) {
        if (monster.abilities.includes('Flame Fed')) {
          monster.currentHealth += 1;
          monster.maxHealth += 1;
          this.addEvent('HEAL', `${monster.name} gains 1 Health from Flame Fed!`, { actor: monster, target: monster, amount: 1, ability: 'Flame Fed' });
        } else {
          this.applyDirectHealthDamage(monster, 2, 'Burning', 'BURNING_TICK');
        }
      }
    }

    for (const teamIndex of [1, 2] as const) {
      const team = this.getAliveMonsters(teamIndex);
      const invigorated = team.some((monster) => monster.abilities.includes('Invigorate'));
      for (const monster of team.filter((unit) => unit.abilities.includes('Weary') && unit.lastWearyCheckRound !== this.currentRound)) {
        monster.lastWearyCheckRound = this.currentRound;
        if (!invigorated && this.random() < Math.min(0.8, this.currentRound * 0.1)) {
          monster.isExhausted = true;
          this.addEvent('STATUS_APPLY', `${monster.name} becomes Exhausted from Weary!`, { target: monster, ability: 'Weary' });
        }
      }
    }

    for (const teamIndex of [1, 2] as const) {
      const team = this.getAliveMonsters(teamIndex);
      if (team.some((monster) => monster.abilities.includes('Electrified'))) {
        for (const monster of team) {
          this.applyDirectHealthDamage(monster, 1, 'Electrified', 'ELECTRIFIED_TICK');
        }
      }
    }

    // Fatigue (if round > 20, deals increasing damage: round - 20)
    if (this.currentRound > 20) {
      const fatigueDamage = this.currentRound - 20;
      this.addEvent('FATIGUE_TICK', `Fatigue deals ${fatigueDamage} damage to all monsters!`, {
        amount: fatigueDamage,
      });
      for (const monster of [...this.getAliveMonsters(1), ...this.getAliveMonsters(2)]) {
        if (monster.isAlive) {
          this.applyDirectHealthDamage(monster, fatigueDamage, 'Fatigue', 'FATIGUE_TICK');
        }
      }
    }
  }

  private processPreTurnAbilities(): void {
    for (const teamIdx of [1, 2] as const) {
      const living = this.getAliveMonsters(teamIdx);
      if (living.length === 0) continue;

      const tank = living[0];

      for (const monster of living) {
        const activationCount = monster.abilities.includes('Echo') ? 2 : 1;
        for (let activation = 0; activation < activationCount; activation++) {
        // Cleanse
        if (monster.abilities.includes('Cleanse') && tank && tank.isAlive) {
          if (tank.isPoisoned || tank.isStunned || tank.isAfflicted || tank.isBurning || tank.isSnared || tank.isRevealed) {
            tank.isPoisoned = false;
            tank.isStunned = false;
            tank.isAfflicted = false;
            tank.isBurning = false;
            tank.isSnared = false;
            tank.isRevealed = false;
            this.addEvent('STATUS_EXPIRE', `${monster.name} cleanses negative effects from ${tank.name}`, {
              actor: monster,
              target: tank,
              ability: 'Cleanse',
            });
          }
        }

        if (monster.abilities.includes('Cleanse Rearguard')) {
          const rearguard = living[living.length - 1];
          if (rearguard && rearguard !== tank && (rearguard.isPoisoned || rearguard.isStunned || rearguard.isAfflicted || rearguard.isBurning || rearguard.isSnared || rearguard.isRevealed)) {
            rearguard.isPoisoned = false;
            rearguard.isStunned = false;
            rearguard.isAfflicted = false;
            rearguard.isBurning = false;
            rearguard.isSnared = false;
            rearguard.isRevealed = false;
            this.addEvent('STATUS_EXPIRE', `${monster.name} cleanses negative effects from ${rearguard.name}`, {
              actor: monster,
              target: rearguard,
              ability: 'Cleanse Rearguard',
            });
          }
        }

        if (monster.abilities.includes('Repair')) {
          const armorTarget = living.filter((ally) => ally.currentArmor < ally.maxArmor)
            .sort((a, b) => (b.maxArmor - b.currentArmor) - (a.maxArmor - a.currentArmor))[0];
          if (armorTarget) {
            const repaired = Math.min(2, armorTarget.maxArmor - armorTarget.currentArmor);
            armorTarget.currentArmor += repaired;
            this.addEvent('HEAL', `${monster.name} repairs ${armorTarget.name}'s armor by ${repaired}`, {
              actor: monster,
              target: armorTarget,
              amount: repaired,
              ability: 'Repair',
            });
          }
        }

        if (monster.abilities.includes('Corrupted Healing')) {
          for (const ally of living.filter((unit) => unit !== monster && unit.currentHealth < unit.maxHealth && !unit.isAfflicted)) {
            const healed = Math.min(Math.floor(ally.maxHealth * 0.7), ally.maxHealth - ally.currentHealth);
            if (healed <= 0) continue;
            ally.currentHealth += healed;
            ally.maxHealth = Math.max(1, ally.maxHealth - 1);
            if (ally.currentHealth > ally.maxHealth) ally.currentHealth = ally.maxHealth;
            this.addEvent('HEAL', `${monster.name} uses Corrupted Healing on ${ally.name} for ${healed} Health, reducing its maximum Health`, {
              actor: monster,
              target: ally,
              amount: healed,
              ability: 'Corrupted Healing',
            });
          }
        }

        // Self Heal
        if (monster.abilities.includes('Heal') && !monster.isAfflicted && monster.currentHealth < monster.maxHealth) {
          const healAmount = Math.floor(monster.maxHealth / 3);
          const actualHeal = Math.min(healAmount, monster.maxHealth - monster.currentHealth);
          monster.currentHealth += actualHeal;
          this.addEvent('HEAL', `${monster.name} healed self for ${actualHeal} HP (${monster.currentHealth}/${monster.maxHealth})`, {
            actor: monster,
            target: monster,
            amount: actualHeal,
            ability: 'Heal',
          });
        }

        // Tank Heal
        if (monster.abilities.includes('Tank Heal') && tank && tank.isAlive && !tank.isAfflicted && tank.currentHealth < tank.maxHealth) {
          const healAmount = Math.floor(tank.maxHealth / 3);
          const actualHeal = Math.min(healAmount, tank.maxHealth - tank.currentHealth);
          tank.currentHealth += actualHeal;
          this.addEvent('HEAL', `${monster.name} used Tank Heal on ${tank.name} for ${actualHeal} HP (${tank.currentHealth}/${tank.maxHealth})`, {
            actor: monster,
            target: tank,
            amount: actualHeal,
            ability: 'Tank Heal',
          });
        }

        // Triage (heals backline most damaged)
        if (monster.abilities.includes('Triage')) {
          const backline = living.slice(1).filter((m) => !m.isAfflicted && m.currentHealth < m.maxHealth);
          if (backline.length > 0) {
            backline.sort((a, b) => (b.maxHealth - b.currentHealth) - (a.maxHealth - a.currentHealth));
            const target = backline[0];
            const healAmount = Math.floor(target.maxHealth / 3);
            const actualHeal = Math.min(healAmount, target.maxHealth - target.currentHealth);
            target.currentHealth += actualHeal;
            this.addEvent('HEAL', `${monster.name} used Triage on ${target.name} for ${actualHeal} HP`, {
              actor: monster,
              target,
              amount: actualHeal,
              ability: 'Triage',
            });
          }
        }
        }
      }
    }
  }

  private executeMonsterTurn(actor: CombatMonsterState): void {
    if (actor.attackType === 'None' || actor.currentAttack <= 0) return;
    if (actor.abilities.includes('Recharge')) {
      if (actor.lastRechargeRound !== undefined && this.currentRound - actor.lastRechargeRound < 2) return;
      actor.lastRechargeRound = this.currentRound;
    }

    const friendlyTeam = this.getAliveMonsters(actor.teamIndex);
    const enemyTeamIdx = actor.teamIndex === 1 ? 2 : 1;
    const enemyTeam = this.getAliveMonsters(enemyTeamIdx);
    if (enemyTeam.length === 0) return;

    const actorPos = friendlyTeam.indexOf(actor);

    // Position check for Melee and Ranged
    if (actor.attackType === 'Melee') {
      const hasSneak = actor.abilities.includes('Sneak');
      const hasOpportunity = actor.abilities.includes('Opportunity');
      const hasApexStrike = actor.abilities.includes('Apex Strike');
      const hasReach = actor.abilities.includes('Reach');
      const hasCharge = actor.abilities.includes('Charge');

      if (actorPos === 0 || hasCharge) {
        // Can attack from frontline
      } else if (actorPos === 1 && hasReach) {
        // Can attack with Reach from pos 2
      } else if (hasSneak || hasOpportunity || hasApexStrike) {
        // Can attack from backline
      } else {
        // Ineligible to attack from backline
        return;
      }
    } else if (actor.attackType === 'Ranged') {
      if (actorPos === 0 && !actor.abilities.includes('Close Range')) {
        // Cannot attack with Ranged from position 1 without Close Range
        return;
      }
    }

    // Select Target
    const target = this.selectTarget(actor, enemyTeam);
    if (!target) return;

    this.performAttack(actor, target);
  }

  private selectTarget(actor: CombatMonsterState, enemyTeam: CombatMonsterState[]): CombatMonsterState | null {
    if (enemyTeam.length === 0) return null;

    if (actor.abilities.includes('Wingbreak')) {
      const flyingTarget = enemyTeam.find((monster) => monster.abilities.includes('Flying'));
      if (flyingTarget) return flyingTarget;
    }

    // 1. Check for Taunt (unless backline monster with Camouflage)
    const friendlyTeam = this.getAliveMonsters(actor.teamIndex);
    const actorPosition = friendlyTeam.indexOf(actor);
    const tauntTargets = actorPosition > 0 && !actor.abilities.includes('Reach') && !actor.abilities.includes('Scattershot')
      ? enemyTeam.filter((monster) => {
        if (!monster.abilities.includes('Taunt')) return false;
        const position = enemyTeam.indexOf(monster);
        return position === 0 || !monster.abilities.includes('Camouflage') || monster.isRevealed;
      })
      : [];

    if (tauntTargets.length > 0) {
      return tauntTargets[0];
    }

    const decoy = enemyTeam.find((monster, position) => position > 0 && monster.abilities.includes('Decoy') && (!monster.abilities.includes('Camouflage') || monster.isRevealed));
    if (actorPosition > 0 && decoy && actor.abilities.some((ability) => ability === 'Opportunity' || ability === 'Snipe' || ability === 'Apex Strike')) {
      return decoy;
    }

    if (actor.abilities.includes('Apex Strike')) {
      const candidates = enemyTeam.filter((monster) => !monster.abilities.includes('Camouflage') || monster.isRevealed);
      return candidates.sort((a, b) => this.getTargetPower(b) - this.getTargetPower(a) || a.instanceId.localeCompare(b.instanceId))[0] || enemyTeam[0];
    }

    if (actor.abilities.includes('Scattershot') && (actor.attackType === 'Ranged' || actor.attackType === 'Magic')) {
      return enemyTeam[Math.floor(this.random() * enemyTeam.length)];
    }

    // 2. Opportunity: targets monster with lowest health
    if (actor.abilities.includes('Opportunity')) {
      const candidates = enemyTeam.filter((m, idx) => idx === 0 || !m.abilities.includes('Camouflage') || m.isRevealed);
      if (candidates.length > 0) {
        candidates.sort((a, b) => a.currentHealth - b.currentHealth);
        return candidates[0];
      }
    }

    // 3. Sneak: targets last monster in enemy line
    if (actor.abilities.includes('Sneak')) {
      for (let i = enemyTeam.length - 1; i >= 0; i--) {
        const candidate = enemyTeam[i];
        if (i === 0 || !candidate.abilities.includes('Camouflage') || candidate.isRevealed) {
          return candidate;
        }
      }
    }

    // 4. Snipe: targets first non-melee monster not in position 0
    if (actor.abilities.includes('Snipe') && (actor.attackType === 'Ranged' || actor.attackType === 'Magic')) {
      const snipeCandidates = enemyTeam
        .slice(1)
        .filter((m) => (m.attackType === 'Ranged' || m.attackType === 'Magic' || m.attackType === 'None') && (!m.abilities.includes('Camouflage') || m.isRevealed));

      if (snipeCandidates.length > 0) {
        return snipeCandidates[0];
      }
    }

    // 5. Default: First living monster
    return enemyTeam[0];
  }

  private performAttack(actor: CombatMonsterState, target: CombatMonsterState, isTrample = false, isCleaveStrike = false, isExecuteStrike = false, isDeterminedStrike = false, isVolleyStrike = false, isStrayShotStrike = false): void {
    if (actor.abilities.includes('Stray Shot') && !isStrayShotStrike) {
      const friendlyTargets = this.getAliveMonsters(actor.teamIndex).filter((monster) => monster !== actor);
      if (friendlyTargets.length === 0) return;
      const friendlyTarget = friendlyTargets[Math.floor(this.random() * friendlyTargets.length)];
      this.performAttack(actor, friendlyTarget, isTrample, isCleaveStrike, isExecuteStrike, isDeterminedStrike, isVolleyStrike, true);
      return;
    }

    // Check accuracy / Hit or Miss
    const attackersThatHit = this.reflexAttackers.get(target.instanceId);
    const hit = isVolleyStrike || (!(target.abilities.includes('Reflexes') && attackersThatHit?.has(actor.instanceId)) && this.checkHit(actor, target));

    if (!hit) {
      this.addEvent('MISS', `${actor.name}'s ${actor.attackType} attack MISSED ${target.name}!`, {
        actor,
        target,
        attackType: actor.attackType,
      });
      if (target.abilities.includes('Backfire') && actor.isAlive) {
        this.applyDirectHealthDamage(actor, 2, 'Backfire', 'DAMAGE', target);
      }
      if (actor.abilities.includes('Determined') && !isDeterminedStrike && actor.determinedRound !== this.currentRound && actor.isAlive) {
        actor.determinedRound = this.currentRound;
        this.addEvent('TURN_START', `${actor.name} tries again with Determined!`, { actor, target, ability: 'Determined' });
        this.performAttack(actor, target, false, false, false, true);
      }
      return;
    }

    // Calculate attack damage
    let damage = actor.currentAttack + (actor.attackType === 'Melee' && actor.abilities.includes('Armored Strike') ? actor.currentArmor : 0);

    // Enrage multiplier (if damaged)
    if (actor.isEnraged) {
      damage = Math.ceil(damage * 1.5);
    }

    if (actor.abilities.includes('Recharge') && actor.lastRechargeRound === this.currentRound) damage *= 3;
    if (actor.abilities.includes('Wingbreak') && target.abilities.includes('Flying')) damage += 2;

    // Knock Out multiplier (vs Stunned target)
    if (actor.abilities.includes('Knock Out') && target.isStunned) {
      damage *= 2;
    }

    // Fury multiplier (vs Taunt target)
    if (actor.abilities.includes('Fury') && target.abilities.includes('Taunt')) {
      damage *= 2;
    }

    if (actor.abilities.includes('Giant Killer') && target.mana >= 10) damage *= 2;
    if (actor.abilities.includes('Oppress') && target.nativeAttackType === 'None') damage *= 2;
    if (actor.abilities.includes('Deathblow') && this.getAliveMonsters(target.teamIndex).length === 1) damage *= 2;
    if (this.hasAdjacentLookout(target) && actor.abilities.some((ability) => ability === 'Sneak' || ability === 'Snipe' || ability === 'Opportunity')) {
      damage = Math.max(0, damage - 1);
    }
    if (actor.abilities.includes('Ambush') && this.hasTeamAbility(target.teamIndex, 'Lookout')) {
      damage = Math.floor(damage / 2);
    }

    this.addEvent('ATTACK', `${actor.name} attacks ${target.name} with ${damage} ${actor.attackType} damage!`, {
      actor,
      target,
      amount: damage,
      attackType: actor.attackType,
      ability: isStrayShotStrike ? 'Stray Shot' : isVolleyStrike ? 'Volley of Arrows' : isCleaveStrike ? 'Cleave' : undefined,
    });

    const enemyTeam = this.getAliveMonsters(target.teamIndex);
    const targetPos = enemyTeam.indexOf(target);

    // Apply primary damage
    const killed = this.applyDamage(actor, target, damage, actor.attackType);
    if (target.isAlive && target.abilities.includes('Reflexes')) {
      const attackers = this.reflexAttackers.get(target.instanceId) || new Set<string>();
      attackers.add(actor.instanceId);
      this.reflexAttackers.set(target.instanceId, attackers);
    }

    if (actor.abilities.includes('Reckless')) {
      const friendlyTeam = this.getAliveMonsters(actor.teamIndex);
      const position = friendlyTeam.indexOf(actor);
      for (const ally of [friendlyTeam[position - 1], friendlyTeam[position + 1]]) {
        if (ally) this.applyDirectHealthDamage(ally, 1, 'Reckless', 'DAMAGE');
      }
    }

    if (!killed && target.isAlive && !isExecuteStrike && actor.abilities.includes('Execute') && target.currentHealth <= 2) {
      this.addEvent('TURN_START', `${actor.name} executes ${target.name} with a second attack!`, { actor, target, ability: 'Execute' });
      this.performAttack(actor, target, false, false, true);
    }

    // Blast damage to adjacent monsters
    if (actor.abilities.includes('Blast')) {
      const blastDamage = Math.ceil(damage / 2);
      const adjacent: CombatMonsterState[] = [];
      if (targetPos > 0 && enemyTeam[targetPos - 1]?.isAlive) {
        adjacent.push(enemyTeam[targetPos - 1]);
      }
      if (targetPos < enemyTeam.length - 1 && enemyTeam[targetPos + 1]?.isAlive) {
        adjacent.push(enemyTeam[targetPos + 1]);
      }

      for (const adj of adjacent) {
        this.addEvent('BLAST_DAMAGE', `Blast hits ${adj.name} for ${blastDamage} damage!`, {
          actor,
          target: adj,
          amount: blastDamage,
          ability: 'Blast',
        });
        this.applyDamage(actor, adj, blastDamage, actor.attackType, 'Blast');
      }
    }

    if (actor.abilities.includes('Cleave') && !isCleaveStrike) {
      const adjacent = [enemyTeam[targetPos - 1], enemyTeam[targetPos + 1]].filter((monster) => monster?.isAlive);
      for (const monster of adjacent) this.performAttack(actor, monster, false, true);
    }

    if (actor.abilities.includes('Volley of Arrows') && actor.attackType === 'Ranged' && !isVolleyStrike) {
      for (const ally of this.getAliveMonsters(actor.teamIndex)) {
        if (ally === actor || ally.attackType !== 'Ranged' || !target.isAlive) continue;
        this.performAttack(ally, target, false, false, false, false, true);
      }
    }

    // Counter triggers if target survived
    if (target.isAlive && !killed) {
      // Thorns
      if (actor.attackType === 'Melee' && target.abilities.includes('Thorns') && actor.isAlive) {
        const thornsDamage = 2 + (this.hasTeamAbility(target.teamIndex, 'Amplify') ? 1 : 0);
        this.addEvent('THORNS_DAMAGE', `${target.name}'s Thorns impale ${actor.name} for ${thornsDamage} damage!`, {
          actor: target,
          target: actor,
          amount: thornsDamage,
          ability: 'Thorns',
        });
        this.applyDirectHealthDamage(actor, thornsDamage, 'Thorns', 'THORNS_DAMAGE', target);
      }

      // Magic Reflect
      if (actor.attackType === 'Magic' && target.abilities.includes('Magic Reflect') && actor.isAlive) {
        const reflectDmg = Math.max(1, Math.ceil(damage / 2));
        this.addEvent('MAGIC_REFLECT_DAMAGE', `${target.name} reflects ${reflectDmg} Magic damage back at ${actor.name}!`, {
          actor: target,
          target: actor,
          amount: reflectDmg,
          ability: 'Magic Reflect',
        });
        this.applyDamage(target, actor, reflectDmg, 'Magic', 'Reflected');
      }

      // Return Fire
      if (actor.attackType === 'Ranged' && target.abilities.includes('Return Fire') && actor.isAlive) {
        const returnDmg = Math.max(1, Math.ceil(damage / 2)) + (this.hasTeamAbility(target.teamIndex, 'Amplify') ? 1 : 0);
        this.addEvent('RETURN_FIRE_DAMAGE', `${target.name} returns fire at ${actor.name} for ${returnDmg} damage!`, {
          actor: target,
          target: actor,
          amount: returnDmg,
          ability: 'Return Fire',
        });
        this.applyDamage(target, actor, returnDmg, 'Ranged', 'Reflected');
      }

    }

    if (actor.attackType === 'Melee' && target.abilities.includes('Retaliate') && !target.isStunned && !target.isExhausted && actor.isAlive && this.random() < 0.5) {
      const retaliation = target.currentAttack + (this.hasTeamAbility(target.teamIndex, 'Amplify') ? 1 : 0);
      this.addEvent('RETALIATE', `${target.name} retaliates against ${actor.name}!`, { actor: target, target: actor, ability: 'Retaliate' });
      this.applyDamage(target, actor, retaliation, 'Melee');
    }

    // Trample trigger on death from Melee
    if (killed && actor.attackType === 'Melee' && actor.abilities.includes('Trample') && actor.isAlive) {
      const remainingEnemies = this.getAliveMonsters(target.teamIndex);
      if (remainingEnemies.length > 0) {
        const newFront = remainingEnemies[0];
        this.addEvent('TRAMPLE', `${actor.name} tramples through to attack ${newFront.name}!`, {
          actor,
          target: newFront,
          ability: 'Trample',
        });
        this.performAttack(actor, newFront, true);
      }
    }
  }

  private checkHit(actor: CombatMonsterState, target: CombatMonsterState): boolean {
    // Aim True ruleset or True Strike ability
    if (this.hasRuleset('Aim True') || actor.abilities.includes('True Strike') || (actor.abilities.includes('Sneak') && this.hasTeamAbility(actor.teamIndex, 'Pinpoint'))) {
      return true;
    }

    // Magic attacks never miss UNLESS target has Phase
    if (actor.attackType === 'Magic' && !target.abilities.includes('Phase')) {
      return true;
    }

    let hitChance = 100;

    // Speed differential
    const reverseSpeed = this.hasRuleset('Reverse Speed');
    const speedDiff = reverseSpeed
      ? this.getEffectiveSpeed(actor) - this.getEffectiveSpeed(target)
      : this.getEffectiveSpeed(target) - this.getEffectiveSpeed(actor);

    if (speedDiff > 0) {
      hitChance -= speedDiff * 10;
    }

    // Flying vs non-flying
    if (target.abilities.includes('Flying') && !target.isSnared && !actor.abilities.includes('Flying')) {
      hitChance -= 25;
    }

    // Dodge
    if (target.abilities.includes('Dodge')) {
      hitChance -= 25;
    }

    hitChance += actor.accuracyModifier || 0;
    if ((actor.attackType === 'Melee' || actor.attackType === 'Ranged') && this.hasTeamAbility(target.teamIndex, 'Blind')) {
      hitChance -= 15;
    }

    hitChance = Math.max(10, Math.min(100, hitChance));
    return this.random() * 100 < hitChance;
  }

  private applyDamage(
    attacker: CombatMonsterState,
    target: CombatMonsterState,
    rawDamage: number,
    attackType: AttackType,
    damageSource?: 'Blast' | 'Reflected'
  ): boolean {
    if (!target.isAlive || target.currentHealth <= 0) return true;

    if (target.abilities.includes('Deflect') && damageSource) {
      this.addEvent('STATUS_APPLY', `${target.name}'s Deflect blocks ${damageSource} damage!`, {
        actor: attacker,
        target,
        ability: 'Deflect',
      });
      return false;
    }

    // Divine Shield check
    if (target.hasDivineShield) {
      target.hasDivineShield = false;
      this.addEvent('DIVINE_SHIELD_POP', `${target.name}'s Divine Shield absorbed all damage!`, {
        actor: attacker,
        target,
        ability: 'Divine Shield',
      });
      return false;
    }

    const relentlessStrike = attacker.abilities.includes('Relentless Strike') && (
      target.abilities.includes('Forcefield')
      || (attackType === 'Magic' && target.abilities.includes('Void'))
      || ((attackType === 'Melee' || attackType === 'Ranged') && target.abilities.includes('Shield'))
    );
    if (relentlessStrike) {
      const trueDamage = rawDamage + 1;
      target.currentHealth -= trueDamage;
      this.addEvent('DAMAGE', `${attacker.name}'s Relentless Strike deals ${trueDamage} true damage to ${target.name}!`, {
        actor: attacker,
        target,
        amount: trueDamage,
        ability: 'Relentless Strike',
      });
      this.applyEnrage(target);
      if (target.currentHealth <= 0) return this.handleMonsterDeath(target, attacker);
      return false;
    }

    let damage = rawDamage;
    if (target.abilities.includes('Forcefield') && damage >= 5) damage = 1;

    if (target.abilities.includes('Painforge') && attacker.teamIndex === target.teamIndex) {
      target.currentAttack += 1;
      target.baseAttack += 1;
      this.addEvent('STATUS_APPLY', `${target.name} gains +1 power from Painforge after an allied hit!`, { actor: attacker, target, ability: 'Painforge', amount: 1 });
    }

    if (attackType === 'Melee' && target.abilities.includes('Corrosive Ward') && !attacker.abilities.includes('Deflect') && attacker.maxArmor > 0) {
      const armorReduction = 2 + (this.hasTeamAbility(target.teamIndex, 'Amplify') ? 1 : 0);
      attacker.maxArmor = Math.max(0, attacker.maxArmor - armorReduction);
      attacker.currentArmor = Math.min(attacker.currentArmor, attacker.maxArmor);
      attacker.baseArmor = Math.max(0, attacker.baseArmor - armorReduction);
    }

    // Shield ability vs Melee/Ranged
    if ((attackType === 'Melee' || attackType === 'Ranged') && target.abilities.includes('Shield')) {
      damage = damage <= 1 ? 0 : Math.ceil(damage / 2);
    }

    // Void ability vs Magic
    if (attackType === 'Magic' && target.abilities.includes('Void')) {
      damage = damage <= 1 ? 0 : Math.ceil(damage / 2);
    }

    // Dispel: clears temporary buffs
    if (attacker.abilities.includes('Dispel')) {
      target.isEnraged = false;
    }

    // Shatter: breaks all armor
    const hasShatter = attacker.abilities.includes('Shatter') && target.currentArmor > 0;

    // Determine if damage hits Armor or Health
    const hitsArmor =
      attackType !== 'Magic' ||
      this.hasRuleset('Weak Magic') ||
      target.abilities.includes('Void Armor');

    let healthDamage = 0;

    if (hitsArmor && target.currentArmor > 0) {
      if (damage <= target.currentArmor) {
        target.currentArmor -= damage;
        this.addEvent('DAMAGE', `${target.name}'s Armor absorbed ${damage} damage (${target.currentArmor} armor remaining)`, {
          actor: attacker,
          target,
          amount: damage,
        });
      } else {
        const excess = damage - target.currentArmor;
        const armorAbsorbed = target.currentArmor;
        target.currentArmor = 0;

        if (attacker.abilities.includes('Piercing') || attackType === 'Magic') {
          healthDamage = excess;
          target.currentHealth -= healthDamage;
          this.addEvent('DAMAGE', `${target.name}'s Armor broke! Took ${healthDamage} piercing damage to Health (${target.currentHealth}/${target.maxHealth} HP)`, {
            actor: attacker,
            target,
            amount: healthDamage,
          });
        } else {
          this.addEvent('DAMAGE', `${target.name}'s Armor absorbed ${armorAbsorbed} damage and was destroyed!`, {
            actor: attacker,
            target,
            amount: armorAbsorbed,
          });
        }
      }
    } else {
      // Direct Health Damage
      healthDamage = damage;
      target.currentHealth -= healthDamage;
      this.addEvent('DAMAGE', `${target.name} took ${healthDamage} damage directly to Health (${target.currentHealth}/${target.maxHealth} HP)`, {
        actor: attacker,
        target,
        amount: healthDamage,
      });
    }

    this.applyEnrage(target);

    if (target.abilities.includes('Reprisal') && attacker.teamIndex !== target.teamIndex) {
      const damageByAttacker = this.reprisalDamage.get(target.instanceId) || new Map<string, number>();
      const totalDamage = (damageByAttacker.get(attacker.instanceId) || 0) + damage;
      damageByAttacker.set(attacker.instanceId, totalDamage);
      this.reprisalDamage.set(target.instanceId, damageByAttacker);
      if (totalDamage > 5 && !attacker.abilities.includes('Taunt')) {
        this.grantAbility(attacker, 'Taunt');
        if (attacker.abilities.includes('Camouflage')) attacker.isRevealed = true;
        this.addEvent('STATUS_APPLY', `${attacker.name} gains Taunt from Reprisal!`, { actor: target, target: attacker, ability: 'Reprisal' });
      }
    }

    if (hasShatter) {
      target.currentArmor = 0;
      this.addEvent('STATUS_APPLY', `${attacker.name}'s Shatter completely broke ${target.name}'s armor!`, {
        actor: attacker,
        target,
        ability: 'Shatter',
      });
    }

    // Life Leech on health damage
    if (healthDamage > 0 && attacker.abilities.includes('Life Leech')) {
      const leech = Math.ceil(healthDamage / 2);
      if (leech > 0) {
        attacker.maxHealth += leech;
        attacker.currentHealth += leech;
        this.addEvent('HEAL', `${attacker.name} leeched +${leech} Health from ${target.name}!`, {
          actor: attacker,
          target,
          amount: leech,
          ability: 'Life Leech',
        });
      }
    }

    // Debuff triggers
    if (target.currentHealth > 0) {
      if (attacker.abilities.includes('Expose') && this.random() < 0.8) {
        const removable = ['Immunity', 'Forcefield', 'Lookout', 'Deflect', 'Shield', 'Void', 'Void Armor'] as const;
        const abilityToRemove = removable.find((ability) => target.abilities.includes(ability));
        if (abilityToRemove) {
          target.abilities = target.abilities.filter((ability) => ability !== abilityToRemove);
          this.addEvent('STATUS_APPLY', `${attacker.name}'s Expose removes ${abilityToRemove} from ${target.name}!`, { actor: attacker, target, ability: 'Expose' });
        }
      }

      if (attacker.abilities.includes('Enfeeble') && target.attackType === 'Melee' && target.currentAttack > 0) {
        target.currentAttack = Math.max(0, target.currentAttack - 1);
        this.addEvent('STATUS_APPLY', `${target.name}'s attack is reduced by Enfeeble!`, { actor: attacker, target, ability: 'Enfeeble' });
      }

      if (attacker.abilities.includes('Impede') && target.currentSpeed > 1) {
        target.currentSpeed -= 1;
        this.addEvent('STATUS_APPLY', `${target.name}'s speed is reduced by Impede!`, { actor: attacker, target, ability: 'Impede' });
      }

      if (attacker.abilities.includes('Snare') && target.abilities.includes('Flying') && !target.isSnared) {
        target.isSnared = true;
        this.addEvent('STATUS_APPLY', `${target.name} is Snared and can no longer evade attacks by Flying!`, {
          actor: attacker,
          target,
          ability: 'Snare',
        });
      }

      // Poison (50% chance)
      if (!target.abilities.includes('Immunity') && attacker.abilities.includes('Poison') && !target.isPoisoned && this.random() < 0.5) {
        target.isPoisoned = true;
        this.addEvent('STATUS_APPLY', `${target.name} was poisoned!`, {
          actor: attacker,
          target,
          ability: 'Poison',
        });
      }

      // Stun (50% chance)
      if (!target.abilities.includes('Immunity') && attacker.abilities.includes('Stun') && !target.isStunned && this.random() < 0.5) {
        target.isStunned = true;
        this.addEvent('STATUS_APPLY', `${target.name} was stunned!`, {
          actor: attacker,
          target,
          ability: 'Stun',
        });
      }

      // Affliction (50% chance)
      if (!target.abilities.includes('Immunity') && attacker.abilities.includes('Affliction') && !target.isAfflicted && this.random() < 0.5) {
        target.isAfflicted = true;
        this.addEvent('STATUS_APPLY', `${target.name} was afflicted (healing prevented)!`, {
          actor: attacker,
          target,
          ability: 'Affliction',
        });
      }

      // Halving
      if (attacker.abilities.includes('Halving') && target.currentAttack > 0) {
        target.currentAttack = Math.floor(target.currentAttack / 2);
        this.addEvent('STATUS_APPLY', `${target.name}'s attack was halved to ${target.currentAttack}!`, {
          actor: attacker,
          target,
          ability: 'Halving',
        });
      }

      // Cripple
      if (attacker.abilities.includes('Cripple') && !target.abilities.includes('Immunity') && target.maxHealth > 1) {
        target.maxHealth -= 1;
        if (target.currentHealth > target.maxHealth) target.currentHealth = target.maxHealth;
        this.addEvent('STATUS_APPLY', `${target.name}'s max health was crippled by 1!`, {
          actor: attacker,
          target,
          ability: 'Cripple',
        });
      }
    }

    // Check Death and Resurrect
    if (target.currentHealth <= 0) {
      return this.handleMonsterDeath(target, attacker);
    }

    return false;
  }

  private applyDirectHealthDamage(
    target: CombatMonsterState,
    amount: number,
    source: string,
    eventType: BattleEventType,
    killer?: CombatMonsterState
  ): boolean {
    if (!target.isAlive || target.currentHealth <= 0) return true;

    if (target.abilities.includes('Deflect') && source === 'Thorns') {
      this.addEvent('STATUS_APPLY', `${target.name}'s Deflect blocks Thorns damage!`, { target, ability: 'Deflect' });
      return false;
    }

    target.currentHealth -= amount;
    this.addEvent(eventType, `${target.name} suffered ${amount} ${source} damage (${target.currentHealth}/${target.maxHealth} HP)`, {
      target,
      amount,
    });
    this.applyEnrage(target);

    if (target.abilities.includes('Painforge') && (source === 'Poison' || source === 'Burning')) {
      target.currentAttack += 1;
      target.baseAttack += 1;
      this.addEvent('STATUS_APPLY', `${target.name} gains +1 power from Painforge after ${source} damage!`, { target, ability: 'Painforge', amount: 1 });
    }

    if (target.currentHealth <= 0) {
      return this.handleMonsterDeath(target, killer);
    }
    return false;
  }

  private handleMonsterDeath(target: CombatMonsterState, killer?: CombatMonsterState): boolean {
    const finalRestBlocker = target.abilities.includes('Last Word') ? undefined
      : this.getAliveMonsters(target.teamIndex === 1 ? 2 : 1).find((monster) => monster.abilities.includes('Final Rest') && !monster.finalRestUsed);
    const hasRevival = (target.abilities.includes('Rebirth') && !target.hasRebirthed)
      || (target.abilities.includes('Resurgence') && !target.hasResurged)
      || (target.abilities.includes('Soul Siphon') && !target.hasSoulSiphoned)
      || this.getAliveMonsters(target.teamIndex).some((monster) => monster.abilities.includes('Resurrect') && !monster.hasResurrected);
    const revivalBlocked = Boolean(finalRestBlocker && hasRevival);
    if (revivalBlocked && finalRestBlocker) {
      finalRestBlocker.finalRestUsed = true;
      this.addEvent('STATUS_APPLY', `${finalRestBlocker.name}'s Final Rest prevents ${target.name} from being revived!`, {
        actor: finalRestBlocker,
        target,
        ability: 'Final Rest',
      });
    }

    if (!revivalBlocked && target.abilities.includes('Rebirth') && !target.hasRebirthed) {
      target.hasRebirthed = true;
      target.isAlive = true;
      target.currentHealth = 1;
      target.currentArmor = target.maxArmor;
      target.isPoisoned = false;
      target.isBurning = false;
      target.isStunned = false;
      target.isAfflicted = false;
      target.isSnared = false;
      target.isRevealed = false;
      target.isExhausted = true;
      this.addEvent('RESURRECT', `${target.name} returns with Rebirth at 1 Health and full Armor, but will skip its next turn!`, {
        actor: target,
        target,
        ability: 'Rebirth',
      });
      return false;
    }

    if (!revivalBlocked && target.abilities.includes('Resurgence') && !target.hasResurged) {
      target.hasResurged = true;
      this.restoreRevivedUnit(target, target.maxHealth);
      this.addEvent('RESURRECT', `${target.name} returns with Resurgence at full Health and Armor, then all units take 1 damage!`, { actor: target, target, ability: 'Resurgence' });
      for (const monster of [...this.getAliveMonsters(1), ...this.getAliveMonsters(2)]) {
        this.applyDirectHealthDamage(monster, 1, 'Resurgence', 'DAMAGE');
      }
      return false;
    }

    if (!revivalBlocked && target.abilities.includes('Soul Siphon') && !target.hasSoulSiphoned) {
      const donor = this.getAliveMonsters(target.teamIndex).filter((monster) => monster !== target && !monster.abilities.includes('Weary'))
        .sort((a, b) => b.currentHealth - a.currentHealth)[0];
      if (donor) {
        target.hasSoulSiphoned = true;
        this.restoreRevivedUnit(target, Math.floor(target.maxHealth / 2));
        if (!donor.abilities.includes('Weary')) donor.abilities.push('Weary');
        this.applyDirectHealthDamage(donor, Math.ceil(donor.currentHealth / 2), 'Soul Siphon', 'DAMAGE');
        this.addEvent('RESURRECT', `${target.name} returns through Soul Siphon, draining ${donor.name} and leaving them Weary!`, { actor: target, target, ability: 'Soul Siphon' });
        return false;
      }
    }

    // Check friendly team for Resurrect
    const friendlyTeam = target.teamIndex === 1 ? this.team1Monsters : this.team2Monsters;
    const resurrector = revivalBlocked ? undefined : friendlyTeam.find((m) => m.isAlive && m.abilities.includes('Resurrect') && !m.hasResurrected);

    if (resurrector) {
      resurrector.hasResurrected = true;
      this.restoreRevivedUnit(target, 1);
      this.addEvent('RESURRECT', `${resurrector.name} resurrected ${target.name} back to 1 HP!`, {
        actor: resurrector,
        target,
        ability: 'Resurrect',
      });
      target.isExhausted = true;
      return false;
    }

    target.isAlive = false;
    target.currentHealth = 0;
    this.addEvent('DEATH', `☠️ ${target.name} has been defeated!`, { target });
    const position = friendlyTeam.indexOf(target);
    if (target.abilities.includes('Martyr')) {
      for (const ally of [friendlyTeam[position - 1], friendlyTeam[position + 1]]) {
        if (!ally?.isAlive) continue;
        this.increaseAllStats(ally, 1);
        this.addEvent('STATUS_APPLY', `${ally.name} gains +1 to all stats from ${target.name}'s Martyr ability`, {
          actor: target,
          target: ally,
          amount: 1,
          ability: 'Martyr',
        });
      }
    }
    if (target.abilities.includes('Bloodline Tribute') && (target.bloodline || target.abilities.includes('Shapeshift'))) {
      for (const ally of friendlyTeam) {
        if (!ally.isAlive || ally === target || !this.sharesBloodline(target, ally)) continue;
        ally.maxHealth += 1;
        ally.currentHealth += 1;
        ally.currentSpeed += 1;
        ally.baseSpeed += 1;
        ally.currentArmor += 1;
        ally.maxArmor += 1;
        ally.baseArmor += 1;
        if (target.attackType !== 'None' && target.attackType === ally.attackType) {
          ally.currentAttack += 1;
          ally.baseAttack += 1;
        }
        this.addEvent('STATUS_APPLY', `${ally.name} gains Bloodline Tribute stats from ${target.name}`, {
          actor: target,
          target: ally,
          amount: 1,
          ability: 'Bloodline Tribute',
        });
      }
    }
    if (target.bloodline || target.abilities.includes('Shapeshift')) {
      const targetIsPactSource = target.abilities.includes('Bloodline Pact');
      const pactSource = friendlyTeam.find((monster) => monster.abilities.includes('Bloodline Pact') && this.sharesBloodline(monster, target));
      if (pactSource) {
        for (const ally of friendlyTeam.filter((monster) => monster.isAlive && this.sharesBloodline(pactSource, monster))) {
          if (targetIsPactSource) {
            const powerLoss = ally.bloodlinePowerGained || 0;
            ally.currentAttack = Math.max(0, ally.currentAttack - powerLoss);
            ally.baseAttack = Math.max(0, ally.baseAttack - powerLoss);
            ally.bloodlinePowerGained = 0;
            this.applyDirectHealthDamage(ally, 2, 'Bloodline Pact', 'DAMAGE');
          } else {
            this.applyDirectHealthDamage(ally, 1, 'Bloodline Pact', 'DAMAGE');
          }
        }
      }
    }
    if (target.abilities.includes('Redemption')) {
      for (const enemy of this.getAliveMonsters(target.teamIndex === 1 ? 2 : 1)) {
        this.applyDirectHealthDamage(enemy, 1, 'Redemption', 'DAMAGE');
      }
    }
    if (target.abilities.includes('Poison Burst')) {
      const burstTargets = killer?.isAlive ? [killer] : [];
      if (killer?.isAlive) {
        const killerTeam = this.getAliveMonsters(killer.teamIndex);
        const killerPosition = killerTeam.indexOf(killer);
        for (const adjacent of [killerTeam[killerPosition - 1], killerTeam[killerPosition + 1]]) {
          if (adjacent?.isAlive && this.random() < 0.5) burstTargets.push(adjacent);
        }
      }
      for (const enemy of burstTargets) {
        if (enemy.abilities.includes('Immunity') || enemy.isPoisoned) continue;
        enemy.isPoisoned = true;
        this.addEvent('STATUS_APPLY', `${enemy.name} is poisoned by ${target.name}'s Poison Burst!`, { actor: target, target: enemy, ability: 'Poison Burst' });
      }
    }
    if (target.abilities.includes('Spite') && killer?.isAlive) {
      this.addEvent('RETALIATE', `${target.name} counterattacks ${killer.name} with Spite!`, {
        actor: target,
        target: killer,
        amount: target.currentAttack,
        ability: 'Spite',
      });
      this.applyDamage(target, killer, target.currentAttack, 'Melee');
    }
    if (killer?.isAlive && killer.teamIndex !== target.teamIndex && killer.abilities.includes('Bloodlust')) {
      this.increaseAllStats(killer, 1);
      this.addEvent('STATUS_APPLY', `${killer.name} gains +1 to all stats with Bloodlust!`, {
        actor: killer,
        target: killer,
        amount: 1,
        ability: 'Bloodlust',
      });
    }
    if (killer?.isAlive && killer.teamIndex !== target.teamIndex) {
      const pactSources = this.getAliveMonsters(killer.teamIndex).filter((monster) => monster.abilities.includes('Bloodline Pact'));
      for (const ally of this.getAliveMonsters(killer.teamIndex)) {
        if (!pactSources.some((source) => this.sharesBloodline(source, ally))) continue;
        ally.currentAttack += 1;
        ally.baseAttack += 1;
        ally.bloodlinePowerGained = (ally.bloodlinePowerGained || 0) + 1;
        this.addEvent('STATUS_APPLY', `${ally.name} gains +1 power from Bloodline Pact!`, {
          actor: killer,
          target: ally,
          amount: 1,
          ability: 'Bloodline Pact',
        });
      }
    }
    for (const scavenger of [...this.getAliveMonsters(1), ...this.getAliveMonsters(2)]) {
      if (!scavenger.abilities.includes('Scavenger')) continue;
      scavenger.maxHealth += 1;
      scavenger.currentHealth += 1;
      this.addEvent('STATUS_APPLY', `${scavenger.name} gains 1 maximum Health with Scavenger!`, {
        actor: scavenger,
        target: scavenger,
        amount: 1,
        ability: 'Scavenger',
      });
    }
    if (!this.hasRuleset('Silenced Summoners')) this.recalculateAuras();
    return true;
  }

  private restoreRevivedUnit(monster: CombatMonsterState, health: number): void {
    monster.isAlive = true;
    monster.currentHealth = Math.max(1, health);
    monster.currentArmor = monster.maxArmor;
    monster.isPoisoned = false;
    monster.isBurning = false;
    monster.isStunned = false;
    monster.isAfflicted = false;
    monster.isSnared = false;
    monster.isRevealed = false;
    monster.isExhausted = true;
  }

  private increaseAllStats(monster: CombatMonsterState, amount: number): void {
    if (monster.baseAttack > 0) {
      monster.currentAttack += amount;
      monster.baseAttack += amount;
    }
    monster.currentSpeed += amount;
    monster.baseSpeed += amount;
    monster.currentArmor += amount;
    monster.maxArmor += amount;
    monster.baseArmor += amount;
    monster.currentHealth += amount;
    monster.maxHealth += amount;
    monster.baseHealth += amount;
  }

  private processEarthquake(): void {
    const allLiving = [...this.getAliveMonsters(1), ...this.getAliveMonsters(2)];
    this.addEvent('EARTHQUAKE_TICK', '🌋 Earthquake shakes the battlefield! Non-flying units take 2 damage.');

    for (const monster of allLiving) {
      if (!monster.abilities.includes('Flying') && monster.isAlive) {
        if (monster.currentArmor > 0) {
          if (monster.currentArmor >= 2) {
            monster.currentArmor -= 2;
            this.addEvent('EARTHQUAKE_TICK', `${monster.name}'s armor absorbed 2 Earthquake damage (${monster.currentArmor} left)`, {
              target: monster,
              amount: 2,
            });
          } else {
            const leftover = 2 - monster.currentArmor;
            monster.currentArmor = 0;
            monster.currentHealth -= leftover;
            this.addEvent('EARTHQUAKE_TICK', `${monster.name}'s armor broke and took ${leftover} Earthquake damage to health`, {
              target: monster,
              amount: leftover,
            });
            if (monster.currentHealth <= 0) {
              this.handleMonsterDeath(monster);
            }
          }
        } else {
          this.applyDirectHealthDamage(monster, 2, 'Earthquake', 'EARTHQUAKE_TICK');
        }
      }
    }
  }

  private reindexPositions(): void {
    const t1 = this.getAliveMonsters(1);
    t1.forEach((m, idx) => (m.position = idx));

    const t2 = this.getAliveMonsters(2);
    t2.forEach((m, idx) => (m.position = idx));
  }
}
