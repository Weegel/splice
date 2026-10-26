import { Ability, AttackType, CardDefinition, Splinter } from '../types/card';
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

  private team1Monsters: CombatMonsterState[] = [];
  private team2Monsters: CombatMonsterState[] = [];
  private team1Summoner: CardDefinition | null = null;
  private team2Summoner: CardDefinition | null = null;
  private team1SummonerAbilities: Ability[] = [];
  private team2SummonerAbilities: Ability[] = [];
  private auraDeltas = new Map<string, { attack: number; speed: number; armor: number; maxHealth: number; health: number }>();

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
      splinter: card.splinter,
      level: statLevel.level,
      mana: statLevel.mana,
      baseAttack: statLevel.attack,
      attackType: statLevel.attackType,
      baseSpeed: statLevel.speed,
      baseArmor: statLevel.armor,
      baseHealth: statLevel.health,
      maxHealth: statLevel.health,
      currentAttack: statLevel.attack,
      currentSpeed: statLevel.speed,
      currentArmor: statLevel.armor,
      currentHealth: statLevel.health,
      abilities: [...statLevel.abilities],
      isAlive: true,
      isPoisoned: false,
      isStunned: false,
      isAfflicted: false,
      isEnraged: false,
      hasDivineShield: false,
      hasResurrected: false,
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

    // --- COMBAT ROUNDS ---
    const maxRounds = 50;
    while (this.currentRound < maxRounds && this.isTeamAlive(1) && this.isTeamAlive(2)) {
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
        m.currentArmor += 2;
      });
      this.addEvent('RULESET_APPLIED', 'Armored Up: All monsters receive +2 Armor', { ruleset: 'Armored Up' });
    }

    // Ruleset: Unprotected
    if (this.hasRuleset('Unprotected')) {
      allMonsters.forEach((m) => {
        m.baseArmor = 0;
        m.currentArmor = 0;
      });
      this.addEvent('RULESET_APPLIED', 'Unprotected: All armor has been removed', { ruleset: 'Unprotected' });
    }

    // Ruleset: Holy Protection
    if (this.hasRuleset('Holy Protection')) {
      allMonsters.forEach((m) => {
        m.hasDivineShield = true;
        if (!m.abilities.includes('Divine Shield')) {
          m.abilities.push('Divine Shield');
        }
      });
      this.addEvent('RULESET_APPLIED', 'Holy Protection: All monsters gain Divine Shield', {
        ruleset: 'Holy Protection',
      });
    }

    // Ruleset: Super Sneak
    if (this.hasRuleset('Super Sneak')) {
      allMonsters.forEach((m) => {
        if (m.attackType === 'Melee' && !m.abilities.includes('Sneak')) {
          m.abilities.push('Sneak');
        }
      });
      this.addEvent('RULESET_APPLIED', 'Super Sneak: All Melee monsters gain Sneak', { ruleset: 'Super Sneak' });
    }

    // Ruleset: Target Practice
    if (this.hasRuleset('Target Practice')) {
      allMonsters.forEach((m) => {
        if ((m.attackType === 'Ranged' || m.attackType === 'Magic') && !m.abilities.includes('Snipe')) {
          m.abilities.push('Snipe');
        }
      });
      this.addEvent('RULESET_APPLIED', 'Target Practice: All Ranged & Magic monsters gain Snipe', {
        ruleset: 'Target Practice',
      });
    }

    // Ruleset: Explosive Weaponry
    if (this.hasRuleset('Explosive Weaponry')) {
      allMonsters.forEach((m) => {
        if (!m.abilities.includes('Blast')) {
          m.abilities.push('Blast');
        }
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
      }
      if (buffs.health) {
        m.maxHealth += buffs.health;
        m.currentHealth += buffs.health;
        m.baseHealth += buffs.health;
      }
      if (buffs.abilitiesGranted) {
        buffs.abilitiesGranted.forEach((ab) => {
          if (!m.abilities.includes(ab)) m.abilities.push(ab);
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
        }
      }
    }
  }

  private addAuraDelta(monster: CombatMonsterState, field: 'attack' | 'speed' | 'armor' | 'maxHealth' | 'health', delta: number): void {
    const effects = this.auraDeltas.get(monster.instanceId) || { attack: 0, speed: 0, armor: 0, maxHealth: 0, health: 0 };
    const previous = field === 'attack' ? monster.currentAttack
      : field === 'speed' ? monster.currentSpeed
        : field === 'armor' ? monster.currentArmor
          : field === 'maxHealth' ? monster.maxHealth
            : monster.currentHealth;
    const next = field === 'speed' ? Math.max(1, previous + delta)
      : field === 'attack' ? Math.max(1, previous + delta)
        : field === 'armor' ? Math.max(0, previous + delta)
          : Math.max(1, previous + delta);
    if (field === 'attack') monster.currentAttack = next;
    if (field === 'speed') monster.currentSpeed = next;
    if (field === 'armor') monster.currentArmor = next;
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
      monster.maxHealth = Math.max(1, monster.maxHealth - effects.maxHealth);
      monster.currentHealth = Math.max(1, monster.currentHealth - effects.health);
    }
    this.auraDeltas.clear();
  }

  private isTeamAlive(teamIndex: 1 | 2): boolean {
    const team = teamIndex === 1 ? this.team1Monsters : this.team2Monsters;
    return team.some((m) => m.isAlive && m.currentHealth > 0);
  }

  private getAliveMonsters(teamIndex: 1 | 2): CombatMonsterState[] {
    const team = teamIndex === 1 ? this.team1Monsters : this.team2Monsters;
    return team.filter((m) => m.isAlive && m.currentHealth > 0);
  }

  private executeRound(): void {
    this.addEvent('ROUND_START', `--- Round ${this.currentRound} Begins ---`);

    // 1. Round Start Status Effects (Poison, Fatigue)
    this.processRoundStartEffects();

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
      const speedDiff = reverseSpeed ? a.currentSpeed - b.currentSpeed : b.currentSpeed - a.currentSpeed;
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

    // 5. Round End Effects (Earthquake)
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

    // Poison damage (2 damage directly to health)
    for (const monster of allLiving) {
      if (monster.isPoisoned && monster.isAlive) {
        this.applyDirectHealthDamage(monster, 2, 'Poison', 'POISON_TICK');
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
        // Cleanse
        if (monster.abilities.includes('Cleanse') && tank && tank.isAlive) {
          if (tank.isPoisoned || tank.isStunned || tank.isAfflicted) {
            tank.isPoisoned = false;
            tank.isStunned = false;
            tank.isAfflicted = false;
            this.addEvent('STATUS_EXPIRE', `${monster.name} cleanses negative effects from ${tank.name}`, {
              actor: monster,
              target: tank,
              ability: 'Cleanse',
            });
          }
        }

        // Self Heal
        if (monster.abilities.includes('Heal') && !monster.isAfflicted && monster.currentHealth < monster.maxHealth) {
          const healAmount = Math.max(2, Math.floor(monster.maxHealth / 3));
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
          const healAmount = Math.max(2, Math.floor(tank.maxHealth / 3));
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
            const healAmount = Math.max(2, Math.floor(target.maxHealth / 3));
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

  private executeMonsterTurn(actor: CombatMonsterState): void {
    if (actor.attackType === 'None' || actor.currentAttack <= 0) return;

    const friendlyTeam = this.getAliveMonsters(actor.teamIndex);
    const enemyTeamIdx = actor.teamIndex === 1 ? 2 : 1;
    const enemyTeam = this.getAliveMonsters(enemyTeamIdx);
    if (enemyTeam.length === 0) return;

    const actorPos = friendlyTeam.indexOf(actor);

    // Position check for Melee and Ranged
    if (actor.attackType === 'Melee') {
      const hasSneak = actor.abilities.includes('Sneak');
      const hasOpportunity = actor.abilities.includes('Opportunity');
      const hasReach = actor.abilities.includes('Reach');
      const hasCharge = actor.abilities.includes('Charge');

      if (actorPos === 0 || hasCharge) {
        // Can attack from frontline
      } else if (actorPos === 1 && hasReach) {
        // Can attack with Reach from pos 2
      } else if (hasSneak || hasOpportunity) {
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

    // 1. Check for Taunt (unless backline monster with Camouflage)
    const tauntTargets = enemyTeam.filter((m) => {
      if (!m.abilities.includes('Taunt')) return false;
      const pos = enemyTeam.indexOf(m);
      if (pos > 0 && m.abilities.includes('Camouflage')) return false;
      return true;
    });

    if (tauntTargets.length > 0) {
      return tauntTargets[0];
    }

    // 2. Opportunity: targets monster with lowest health
    if (actor.abilities.includes('Opportunity')) {
      const candidates = enemyTeam.filter((m, idx) => idx === 0 || !m.abilities.includes('Camouflage'));
      if (candidates.length > 0) {
        candidates.sort((a, b) => a.currentHealth - b.currentHealth);
        return candidates[0];
      }
    }

    // 3. Sneak: targets last monster in enemy line
    if (actor.abilities.includes('Sneak')) {
      for (let i = enemyTeam.length - 1; i >= 0; i--) {
        const candidate = enemyTeam[i];
        if (i === 0 || !candidate.abilities.includes('Camouflage')) {
          return candidate;
        }
      }
    }

    // 4. Snipe: targets first non-melee monster not in position 0
    if (actor.abilities.includes('Snipe') && (actor.attackType === 'Ranged' || actor.attackType === 'Magic')) {
      const snipeCandidates = enemyTeam
        .slice(1)
        .filter((m) => (m.attackType === 'Ranged' || m.attackType === 'Magic' || m.attackType === 'None') && !m.abilities.includes('Camouflage'));

      if (snipeCandidates.length > 0) {
        return snipeCandidates[0];
      }
    }

    // 5. Default: First living monster
    return enemyTeam[0];
  }

  private performAttack(actor: CombatMonsterState, target: CombatMonsterState, isTrample = false): void {
    // Check accuracy / Hit or Miss
    const hit = this.checkHit(actor, target);

    if (!hit) {
      this.addEvent('MISS', `${actor.name}'s ${actor.attackType} attack MISSED ${target.name}!`, {
        actor,
        target,
        attackType: actor.attackType,
      });
      return;
    }

    // Calculate attack damage
    let damage = actor.currentAttack;

    // Enrage multiplier (if damaged)
    if (actor.abilities.includes('Enrage') && actor.currentHealth < actor.maxHealth) {
      damage = Math.ceil(damage * 1.5);
    }

    // Knock Out multiplier (vs Stunned target)
    if (actor.abilities.includes('Knock Out') && target.isStunned) {
      damage *= 2;
    }

    // Fury multiplier (vs Taunt target)
    if (actor.abilities.includes('Fury') && target.abilities.includes('Taunt')) {
      damage *= 2;
    }

    this.addEvent('ATTACK', `${actor.name} attacks ${target.name} with ${damage} ${actor.attackType} damage!`, {
      actor,
      target,
      amount: damage,
      attackType: actor.attackType,
    });

    const enemyTeam = this.getAliveMonsters(target.teamIndex);
    const targetPos = enemyTeam.indexOf(target);

    // Apply primary damage
    const killed = this.applyDamage(actor, target, damage, actor.attackType);

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
        this.applyDamage(actor, adj, blastDamage, actor.attackType);
      }
    }

    // Counter triggers if target survived
    if (target.isAlive && !killed) {
      // Thorns
      if (actor.attackType === 'Melee' && target.abilities.includes('Thorns') && actor.isAlive) {
        this.addEvent('THORNS_DAMAGE', `${target.name}'s Thorns impale ${actor.name} for 2 damage!`, {
          actor: target,
          target: actor,
          amount: 2,
          ability: 'Thorns',
        });
        this.applyDirectHealthDamage(actor, 2, 'Thorns', 'THORNS_DAMAGE');
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
        this.applyDamage(target, actor, reflectDmg, 'Magic');
      }

      // Return Fire
      if (actor.attackType === 'Ranged' && target.abilities.includes('Return Fire') && actor.isAlive) {
        const returnDmg = Math.max(1, Math.ceil(damage / 2));
        this.addEvent('RETURN_FIRE_DAMAGE', `${target.name} returns fire at ${actor.name} for ${returnDmg} damage!`, {
          actor: target,
          target: actor,
          amount: returnDmg,
          ability: 'Return Fire',
        });
        this.applyDamage(target, actor, returnDmg, 'Ranged');
      }

      // Retaliate (50% chance on melee)
      if (actor.attackType === 'Melee' && target.abilities.includes('Retaliate') && actor.isAlive) {
        if (this.random() < 0.5) {
          this.addEvent('RETALIATE', `${target.name} retaliates against ${actor.name}!`, {
            actor: target,
            target: actor,
            ability: 'Retaliate',
          });
          this.applyDamage(target, actor, target.currentAttack, 'Melee');
        }
      }
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
    if (this.hasRuleset('Aim True') || actor.abilities.includes('True Strike')) {
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
      ? actor.currentSpeed - target.currentSpeed
      : target.currentSpeed - actor.currentSpeed;

    if (speedDiff > 0) {
      hitChance -= speedDiff * 10;
    }

    // Flying vs non-flying
    if (target.abilities.includes('Flying') && !actor.abilities.includes('Flying')) {
      hitChance -= 25;
    }

    // Dodge
    if (target.abilities.includes('Dodge')) {
      hitChance -= 25;
    }

    hitChance = Math.max(10, Math.min(100, hitChance));
    return this.random() * 100 < hitChance;
  }

  private applyDamage(
    attacker: CombatMonsterState,
    target: CombatMonsterState,
    rawDamage: number,
    attackType: AttackType
  ): boolean {
    if (!target.isAlive || target.currentHealth <= 0) return true;

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

    let damage = rawDamage;

    // Shield ability vs Melee/Ranged
    if ((attackType === 'Melee' || attackType === 'Ranged') && target.abilities.includes('Shield')) {
      damage = Math.ceil(damage / 2);
    }

    // Void ability vs Magic
    if (attackType === 'Magic' && target.abilities.includes('Void')) {
      damage = Math.max(1, Math.ceil(damage / 2));
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
      const leech = Math.floor(healthDamage / 2);
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
      // Poison (50% chance)
      if (attacker.abilities.includes('Poison') && !target.isPoisoned && this.random() < 0.5) {
        target.isPoisoned = true;
        this.addEvent('STATUS_APPLY', `${target.name} was poisoned!`, {
          actor: attacker,
          target,
          ability: 'Poison',
        });
      }

      // Stun (50% chance)
      if (attacker.abilities.includes('Stun') && !target.isStunned && this.random() < 0.5) {
        target.isStunned = true;
        this.addEvent('STATUS_APPLY', `${target.name} was stunned!`, {
          actor: attacker,
          target,
          ability: 'Stun',
        });
      }

      // Affliction (50% chance)
      if (attacker.abilities.includes('Affliction') && !target.isAfflicted && this.random() < 0.5) {
        target.isAfflicted = true;
        this.addEvent('STATUS_APPLY', `${target.name} was afflicted (healing prevented)!`, {
          actor: attacker,
          target,
          ability: 'Affliction',
        });
      }

      // Halving
      if (attacker.abilities.includes('Halving') && target.currentAttack > 1) {
        target.currentAttack = Math.floor(target.currentAttack / 2);
        this.addEvent('STATUS_APPLY', `${target.name}'s attack was halved to ${target.currentAttack}!`, {
          actor: attacker,
          target,
          ability: 'Halving',
        });
      }

      // Cripple
      if (attacker.abilities.includes('Cripple') && target.maxHealth > 1) {
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
      return this.handleMonsterDeath(target);
    }

    return false;
  }

  private applyDirectHealthDamage(
    target: CombatMonsterState,
    amount: number,
    source: string,
    eventType: BattleEventType
  ): boolean {
    if (!target.isAlive || target.currentHealth <= 0) return true;

    target.currentHealth -= amount;
    this.addEvent(eventType, `${target.name} suffered ${amount} ${source} damage (${target.currentHealth}/${target.maxHealth} HP)`, {
      target,
      amount,
    });

    if (target.currentHealth <= 0) {
      return this.handleMonsterDeath(target);
    }
    return false;
  }

  private handleMonsterDeath(target: CombatMonsterState): boolean {
    // Check friendly team for Resurrect
    const friendlyTeam = target.teamIndex === 1 ? this.team1Monsters : this.team2Monsters;
    const resurrector = friendlyTeam.find((m) => m.isAlive && m.abilities.includes('Resurrect') && !m.hasResurrected);

    if (resurrector) {
      resurrector.hasResurrected = true;
      target.currentHealth = 1;
      target.isAlive = true;
      this.addEvent('RESURRECT', `${resurrector.name} resurrected ${target.name} back to 1 HP!`, {
        actor: resurrector,
        target,
        ability: 'Resurrect',
      });
      return false;
    }

    target.isAlive = false;
    target.currentHealth = 0;
    this.addEvent('DEATH', `☠️ ${target.name} has been defeated!`, { target });
    return true;
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
