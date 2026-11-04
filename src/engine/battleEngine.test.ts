import { BattleEngine } from './battleEngine';
import { TeamSelection } from '../types/battle';
import { CardDefinition } from '../types/card';
import cardDetails from '../../local/all_cards.json';
import { DEFAULT_PVE_CARDS, LEGACY_CARD_IDS_BY_API_ID } from '../data/defaultPveCards';
import { SplinterlandsApiService, SplinterlandsRawCardDetail } from '../services/splinterlandsApi';

const TEST_CARDS = [
  ...(cardDetails as unknown as SplinterlandsRawCardDetail[])
    .map((detail) => SplinterlandsApiService.convertRawDetailToCardDefinition(detail))
    .filter((card) => card !== null)
    .map((card) => ({ ...card, id: LEGACY_CARD_IDS_BY_API_ID[Number(card.id.replace(/^spl_/, ''))] || card.id })),
  ...DEFAULT_PVE_CARDS,
];

function runTests() {
  console.log('=== Running Splinterlands Battle Engine Test Suite ===');
  let passed = 0;
  let failed = 0;

  function assert(condition: boolean, msg: string) {
    if (condition) {
      console.log(`  ✓ ${msg}`);
      passed++;
    } else {
      console.error(`  ✗ FAIL: ${msg}`);
      failed++;
    }
  }

  // TEST 1: Basic 1v1 Melee Battle
  {
    const team1: TeamSelection = {
      summonerId: 'sum_fire_malric', // +1 melee
      summonerLevel: 1,
      monsters: [{ cardId: 'mon_fire_living_lava', level: 1 }],
    };
    const team2: TeamSelection = {
      summonerId: 'sum_water_alric',
      summonerLevel: 1,
      monsters: [{ cardId: 'mon_water_sea_monster', level: 1 }],
    };

    const engine = new BattleEngine(TEST_CARDS, ['Standard'], 20, team1, team2);
    const log = engine.resolve();

    assert(log.events.length > 5, 'Standard battle generates events stream');
    assert(log.totalRounds > 0 && log.totalRounds <= 50, 'Battle finishes within max rounds');
    assert(log.winner === 1 || log.winner === 2 || log.winner === 0, 'Winner is properly assigned');
  }

  // TEST 2: Equalizer Ruleset
  {
    const team1: TeamSelection = {
      summonerId: 'sum_fire_pyre',
      summonerLevel: 1,
      monsters: [
        { cardId: 'mon_neutral_furious_chicken', level: 1 }, // 1 HP base
        { cardId: 'mon_fire_living_lava', level: 1 }, // 6 HP base
      ],
    };
    const team2: TeamSelection = {
      summonerId: 'sum_water_bortus',
      summonerLevel: 1,
      monsters: [{ cardId: 'mon_water_sea_monster', level: 1 }], // 8 HP base
    };

    const engine = new BattleEngine(TEST_CARDS, ['Equalizer'], 20, team1, team2);
    const log = engine.resolve();

    const eqEvent = log.events.find((e) => e.type === 'RULESET_APPLIED' && e.ruleset === 'Equalizer');
    assert(!!eqEvent, 'Equalizer ruleset applied event is recorded');
  }

  // TEST 3: Earthquake and Flying mechanic
  {
    const team1: TeamSelection = {
      summonerId: 'sum_fire_pyre',
      summonerLevel: 1,
      monsters: [{ cardId: 'mon_water_ice_pixie', level: 1 }], // Flying
    };
    const team2: TeamSelection = {
      summonerId: 'sum_death_zintar',
      summonerLevel: 1,
      monsters: [{ cardId: 'mon_fire_serpentine_spy', level: 1 }], // Non-flying, 1 HP
    };

    const engine = new BattleEngine(TEST_CARDS, ['Earthquake'], 20, team1, team2);
    const log = engine.resolve();

    const eqDamage = log.events.some((e) => e.type === 'EARTHQUAKE_TICK');
    assert(eqDamage, 'Earthquake deals tick damage');
  }

  // TEST 4: Boss Trial with Explosive Weaponry (Blast)
  {
    const team1: TeamSelection = {
      summonerId: 'sum_life_tyrus',
      summonerLevel: 1,
      monsters: [
        { cardId: 'mon_life_shieldbearer', level: 1 },
        { cardId: 'mon_life_cave_slug', level: 1 },
      ],
    };
    const team2: TeamSelection = {
      summonerId: 'sum_fire_malric',
      summonerLevel: 1,
      monsters: [
        { cardId: 'boss_vulcan_the_destroyer', level: 1 },
        { cardId: 'mon_fire_cerberus', level: 1 },
      ],
    };

    const engine = new BattleEngine(TEST_CARDS, ['Explosive Weaponry'], 40, team1, team2);
    const log = engine.resolve();

    const blastEvents = log.events.filter((e) => e.type === 'BLAST_DAMAGE');
    assert(blastEvents.length > 0, 'Explosive Weaponry generates Blast damage on adjacent targets');
  }

  // TEST 5: Opponent Without a Summoner
  {
    const team1: TeamSelection = {
      summonerId: 'sum_fire_malric',
      summonerLevel: 1,
      monsters: [{ cardId: 'mon_fire_living_lava', level: 1 }],
    };
    const team2: TeamSelection = {
      summonerId: null,
      summonerLevel: 1,
      monsters: [{ cardId: 'mon_water_sea_monster', level: 1 }],
    };

    const log = new BattleEngine(TEST_CARDS, ['Standard'], 20, team1, team2).resolve();
    assert(log.summoner2.name === 'No Summoner', 'Battle log labels a summoner-free team');
    assert(log.events.some((event) => event.text.includes('Team 2 has no summoner; no buffs or debuffs applied')), 'A summoner-free team skips summoner buffs and debuffs');
    assert(!log.events.some((event) => event.text.includes('empowered Team 2')), 'No summoner buffs are recorded for the summoner-free team');
  }

  // TEST 6: Charge Enables Melee Attacks From Any Position
  {
    const chargeMonster: CardDefinition = {
      id: 'test_charge_monster',
      name: 'Charge Test',
      splinter: 'Fire',
      cardType: 'Monster',
      rarity: 'Common',
      stats: [{ level: 1, mana: 3, attack: 2, attackType: 'Melee', speed: 3, armor: 0, health: 4, abilities: ['Charge'] }],
    };
    const team1: TeamSelection = {
      summonerId: null,
      summonerLevel: 1,
      monsters: [
        { cardId: 'mon_fire_living_lava', level: 1 },
        { cardId: chargeMonster.id, level: 1 },
      ],
    };
    const team2: TeamSelection = {
      summonerId: null,
      summonerLevel: 1,
      monsters: [{ cardId: 'mon_water_sea_monster', level: 1 }],
    };

    const log = new BattleEngine([...TEST_CARDS, chargeMonster], ['Standard'], 30, team1, team2).resolve();
    assert(log.events.some((event) => event.type === 'ATTACK' && event.actorName === chargeMonster.name), 'A melee monster with Charge attacks from the backline');
  }

  // TEST 7: Poison ticks at the beginning of each round
  {
    const poisonTestCard: CardDefinition = {
      id: 'test_round_end_poison',
      name: 'Round End Poison Test',
      splinter: 'Fire',
      cardType: 'Monster',
      rarity: 'Common',
      stats: [{ level: 1, mana: 1, attack: 1, attackType: 'Melee', speed: 1, armor: 0, health: 20, abilities: [] }],
    };
    const team: TeamSelection = {
      summonerId: null,
      summonerLevel: 1,
      monsters: [{ cardId: poisonTestCard.id, level: 1 }],
    };
    const log = new BattleEngine([...TEST_CARDS, poisonTestCard], ['Noxious Fumes'], 2, team, team).resolve();
    const roundOneEvents = log.events.filter((event) => event.round === 1);
    const roundTwoEvents = log.events.filter((event) => event.round === 2);
    const roundTwoStartIndex = roundTwoEvents.findIndex((event) => event.type === 'ROUND_START');
    const roundTwoPoisonIndex = roundTwoEvents.findIndex((event) => event.type === 'POISON_TICK');
    const firstRoundTwoAttackIndex = roundTwoEvents.findIndex((event) => event.type === 'ATTACK');
    assert(!roundOneEvents.some((event) => event.type === 'POISON_TICK'), 'Noxious Fumes does not damage units in round one');
    assert(roundTwoStartIndex >= 0 && roundTwoStartIndex < roundTwoPoisonIndex && roundTwoPoisonIndex < firstRoundTwoAttackIndex, 'Poison ticks at round two start before attacks');
  }

  // TEST 8: Ambush attacks before the first round
  {
    const ambusher: CardDefinition = {
      id: 'test_ambush', name: 'Ambusher', splinter: 'Fire', cardType: 'Monster', rarity: 'Common',
      stats: [{ level: 1, mana: 1, attack: 2, attackType: 'Melee', speed: 5, armor: 0, health: 20, abilities: ['Ambush'] }],
    };
    const target: CardDefinition = {
      ...ambusher, id: 'test_ambush_target', name: 'Ambush Target',
      stats: [{ level: 1, mana: 0, attack: 0, attackType: 'None', speed: 1, armor: 0, health: 20, abilities: [] }],
    };
    const team = (cardId: string): TeamSelection => ({ summonerId: null, summonerLevel: 1, monsters: [{ cardId, level: 1 }] });
    const log = new BattleEngine([ambusher, target], ['Standard'], 2, team(ambusher.id), team(target.id), undefined, { seed: 1 }).resolve();
    assert(log.events.some((event) => event.round === 0 && event.type === 'ATTACK' && event.actorName === ambusher.name), 'Ambush attacks before round one starts');
  }

  // TEST 9: Cleave damages both adjacent enemies
  {
    const cleaver: CardDefinition = {
      id: 'test_cleave', name: 'Cleaver', splinter: 'Fire', cardType: 'Monster', rarity: 'Common',
      stats: [{ level: 1, mana: 1, attack: 2, attackType: 'Melee', speed: 5, armor: 0, health: 30, abilities: ['Cleave'] }],
    };
    const target = (id: string, name: string, abilities: CardDefinition['stats'][number]['abilities'] = []): CardDefinition => ({
      ...cleaver, id, name,
      stats: [{ level: 1, mana: 0, attack: 0, attackType: 'None', speed: 1, armor: 0, health: 30, abilities }],
    });
    const team1: TeamSelection = { summonerId: null, summonerLevel: 1, monsters: [{ cardId: cleaver.id, level: 1 }] };
    const team2: TeamSelection = {
      summonerId: null, summonerLevel: 1,
      monsters: [
        { cardId: 'test_cleave_left', level: 1 },
        { cardId: 'test_cleave_center', level: 1 },
        { cardId: 'test_cleave_right', level: 1 },
      ],
    };
    const enemies = [target('test_cleave_left', 'Left'), target('test_cleave_center', 'Center', ['Taunt']), target('test_cleave_right', 'Right')];
    const log = new BattleEngine([cleaver, ...enemies], ['Standard'], 2, team1, team2, undefined, { seed: 2 }).resolve();
    const cleaveTargets = log.events.filter((event) => event.type === 'ATTACK' && event.ability === 'Cleave').map((event) => event.targetName);
    assert(cleaveTargets.includes('Center') && !cleaveTargets.includes('Right')
      && log.events.some((event) => event.type === 'ATTACK' && event.actorName === cleaver.name && event.targetName === 'Left'),
    'A frontline attacker ignores Taunt, then Cleave attacks the unit adjacent to its edge primary target');
  }

  // TEST 10: Immunity blocks status effects and Noxious Fumes
  {
    const attacker: CardDefinition = {
      id: 'test_status_attacker', name: 'Status Attacker', splinter: 'Fire', cardType: 'Monster', rarity: 'Common',
      stats: [{ level: 1, mana: 1, attack: 1, attackType: 'Melee', speed: 5, armor: 0, health: 30, abilities: ['Poison', 'Stun', 'Affliction', 'Cripple'] }],
    };
    const immune: CardDefinition = {
      ...attacker, id: 'test_immunity', name: 'Immune Target',
      stats: [{ level: 1, mana: 1, attack: 0, attackType: 'None', speed: 1, armor: 0, health: 30, abilities: ['Immunity'] }],
    };
    const team = (cardId: string): TeamSelection => ({ summonerId: null, summonerLevel: 1, monsters: [{ cardId, level: 1 }] });
    const cards = [attacker, immune];
    const log = new BattleEngine(cards, ['Standard'], 2, team(attacker.id), team(immune.id), undefined, { seed: 3 }).resolve();
    assert(!log.events.some((event) => event.type === 'STATUS_APPLY' && event.targetName === immune.name && ['Poison', 'Stun', 'Affliction', 'Cripple'].includes(String(event.ability)))
      && !log.events.some((event) => event.targetName === immune.name && event.boardSnapshot.team2[0].maxHealth < 30),
    'Immunity prevents Poison, Stun, Affliction, and Cripple');
    const fumesLog = new BattleEngine(cards, ['Noxious Fumes'], 2, team(attacker.id), team(immune.id), undefined, { seed: 4 }).resolve();
    assert(!fumesLog.events.some((event) => event.type === 'POISON_TICK' && event.targetName === immune.name), 'Immunity prevents Noxious Fumes poison damage');
  }

  // TEST 11: Scavenger gains maximum health on any death
  {
    const scavenger: CardDefinition = {
      id: 'test_scavenger', name: 'Scavenger', splinter: 'Earth', cardType: 'Monster', rarity: 'Common',
      stats: [{ level: 1, mana: 1, attack: 0, attackType: 'None', speed: 1, armor: 0, health: 5, abilities: ['Scavenger'] }],
    };
    const killer: CardDefinition = {
      ...scavenger, id: 'test_scavenger_killer', name: 'Killer',
      stats: [{ level: 1, mana: 1, attack: 2, attackType: 'Melee', speed: 8, armor: 0, health: 20, abilities: [] }],
    };
    const victim: CardDefinition = {
      ...scavenger, id: 'test_scavenger_victim', name: 'Victim',
      stats: [{ level: 1, mana: 0, attack: 0, attackType: 'None', speed: 1, armor: 0, health: 1, abilities: [] }],
    };
    const survivor: CardDefinition = { ...victim, id: 'test_scavenger_survivor', name: 'Survivor', stats: [{ ...victim.stats[0], health: 20 }] };
    const team1: TeamSelection = { summonerId: null, summonerLevel: 1, monsters: [{ cardId: killer.id, level: 1 }, { cardId: scavenger.id, level: 1 }] };
    const team2: TeamSelection = { summonerId: null, summonerLevel: 1, monsters: [{ cardId: victim.id, level: 1 }, { cardId: survivor.id, level: 1 }] };
    const log = new BattleEngine([scavenger, killer, victim, survivor], ['Standard'], 2, team1, team2, undefined, { seed: 5 }).resolve();
    const growth = log.events.find((event) => event.ability === 'Scavenger');
    const grownMonster = growth?.boardSnapshot.team1.find((monster) => monster.name === scavenger.name);
    assert(grownMonster?.maxHealth === 6 && grownMonster.currentHealth === 6, 'Scavenger gains one maximum and current Health when an enemy dies');
  }

  // TEST 12: Untrainable blocks summoner-granted abilities
  {
    const summoner: CardDefinition = {
      id: 'test_ability_summoner', name: 'Ability Summoner', splinter: 'Life', cardType: 'Summoner', rarity: 'Common',
      stats: [{ level: 1, mana: 0, attack: 0, attackType: 'None', speed: 0, armor: 0, health: 0, abilities: [] }],
      summonerBuffs: { abilitiesGranted: ['Flying'] },
    };
    const untrainable: CardDefinition = {
      id: 'test_untrainable', name: 'Untrainable', splinter: 'Life', cardType: 'Monster', rarity: 'Common',
      stats: [{ level: 1, mana: 1, attack: 0, attackType: 'None', speed: 1, armor: 0, health: 20, abilities: ['Untrainable'] }],
    };
    const enemy: CardDefinition = { ...untrainable, id: 'test_untrainable_enemy', name: 'Enemy', stats: [{ ...untrainable.stats[0], abilities: [] }] };
    const team1: TeamSelection = { summonerId: summoner.id, summonerLevel: 1, monsters: [{ cardId: untrainable.id, level: 1 }] };
    const team2: TeamSelection = { summonerId: null, summonerLevel: 1, monsters: [{ cardId: enemy.id, level: 1 }] };
    const log = new BattleEngine([summoner, untrainable, enemy], ['Standard'], 2, team1, team2, undefined, { seed: 6 }).resolve();
    const summonerApplied = log.events.find((event) => event.type === 'SUMMONER_APPLY' && event.text.includes('Team 1'));
    assert(Boolean(summonerApplied) && !summonerApplied!.boardSnapshot.team1[0].abilities.includes('Flying'), 'Untrainable prevents summoner-granted abilities');
    const meleeUntrainable: CardDefinition = {
      ...untrainable,
      id: 'test_untrainable_melee',
      stats: [{ ...untrainable.stats[0], attack: 1, attackType: 'Melee' }],
    };
    const ruleTeam: TeamSelection = { summonerId: null, summonerLevel: 1, monsters: [{ cardId: meleeUntrainable.id, level: 1 }] };
    const ruleLog = new BattleEngine([meleeUntrainable, enemy], ['Super Sneak'], 2, ruleTeam, team2, undefined, { seed: 9 }).resolve();
    const sneakRule = ruleLog.events.find((event) => event.ruleset === 'Super Sneak');
    assert(Boolean(sneakRule) && !sneakRule!.boardSnapshot.team1[0].abilities.includes('Sneak'), 'Untrainable prevents rule-set-granted abilities');
  }

  // TEST 13: Weapons Training grants adjacent no-attack units an attack
  {
    const trainer: CardDefinition = {
      id: 'test_weapons_trainer', name: 'Weapons Trainer', splinter: 'Life', cardType: 'Monster', rarity: 'Common',
      stats: [{ level: 1, mana: 1, attack: 5, attackType: 'Melee', speed: 1, armor: 0, health: 20, abilities: ['Weapons Training'] }],
    };
    const trainee: CardDefinition = {
      ...trainer, id: 'test_weapons_trainee', name: 'Trainee',
      stats: [{ level: 1, mana: 1, attack: 0, attackType: 'None', speed: 1, armor: 0, health: 20, abilities: [] }],
    };
    const enemy: CardDefinition = { ...trainee, id: 'test_weapons_enemy', name: 'Enemy' };
    const team1: TeamSelection = { summonerId: null, summonerLevel: 1, monsters: [{ cardId: trainer.id, level: 1 }, { cardId: trainee.id, level: 1 }] };
    const team2: TeamSelection = { summonerId: null, summonerLevel: 1, monsters: [{ cardId: enemy.id, level: 1 }] };
    const log = new BattleEngine([trainer, trainee, enemy], ['Standard'], 3, team1, team2, undefined, { seed: 7 }).resolve();
    const training = log.events.find((event) => event.ability === 'Weapons Training' && event.targetName === trainee.name);
    const trained = training?.boardSnapshot.team1.find((monster) => monster.name === trainee.name);
    assert(trained?.attackType === 'Melee' && trained.currentAttack === 3, 'Weapons Training grants at most three attack to an adjacent no-attack unit');
  }

  // TEST 14: Enrage increases attack damage and turn speed after damage
  {
    const enrage: CardDefinition = {
      id: 'test_enrage', name: 'Enraged Monster', splinter: 'Fire', cardType: 'Monster', rarity: 'Common',
      stats: [{ level: 1, mana: 1, attack: 2, attackType: 'Melee', speed: 3, armor: 0, health: 30, abilities: ['Enrage'] }],
    };
    const opponent: CardDefinition = {
      ...enrage, id: 'test_enrage_opponent', name: 'Faster Opponent',
      stats: [{ level: 1, mana: 1, attack: 1, attackType: 'Melee', speed: 4, armor: 0, health: 30, abilities: [] }],
    };
    const team = (cardId: string): TeamSelection => ({ summonerId: null, summonerLevel: 1, monsters: [{ cardId, level: 1 }] });
    const log = new BattleEngine([enrage, opponent], ['Standard'], 2, team(enrage.id), team(opponent.id), undefined, { seed: 8 }).resolve();
    const enragedAttack = log.events.find((event) => event.type === 'ATTACK' && event.actorName === enrage.name);
    const firstRoundTwoAttack = log.events.find((event) => event.type === 'ATTACK' && event.round === 2);
    assert(enragedAttack?.amount === 3 && enragedAttack.boardSnapshot.team1[0].isEnraged, 'Enrage multiplies attack damage after the monster is damaged');
    assert(firstRoundTwoAttack?.actorName === enrage.name, 'Enrage increases effective speed for the next round turn order');
  }

  // TEST 15: New target selection and damage thresholds
  {
    const makeMonster = (id: string, name: string, attack: number, attackType: CardDefinition['stats'][number]['attackType'], health: number, mana: number, abilities: CardDefinition['stats'][number]['abilities']): CardDefinition => ({
      id, name, splinter: 'Neutral', cardType: 'Monster', rarity: 'Common',
      stats: [{ level: 1, mana, attack, attackType, speed: 10, armor: 0, health, abilities }],
    });
    const team = (...cardIds: string[]): TeamSelection => ({ summonerId: null, summonerLevel: 1, monsters: cardIds.map((cardId) => ({ cardId, level: 1 })) });

    const apex = makeMonster('test_apex', 'Apex', 1, 'Melee', 20, 1, ['Apex Strike']);
    const apexFront = makeMonster('test_apex_front', 'Apex Front', 0, 'None', 20, 1, []);
    const weakTarget = makeMonster('test_apex_weak', 'Weak Target', 1, 'None', 20, 1, []);
    const strongTarget = makeMonster('test_apex_strong', 'Strong Target', 3, 'None', 20, 1, []);
    const doubleTarget = makeMonster('test_apex_double', 'Double Striker', 2, 'None', 20, 1, ['Double Strike']);
    const apexLog = new BattleEngine([apex, apexFront, weakTarget, strongTarget, doubleTarget], ['Standard'], 1, team(apexFront.id, apex.id), team(weakTarget.id, strongTarget.id, doubleTarget.id), undefined, { seed: 10 }).resolve();
    assert(apexLog.events.some((event) => event.type === 'ATTACK' && event.actorName === apex.name && event.targetName === doubleTarget.name), 'Apex Strike attacks from the backline and ranks multi-attack power in target selection');

    const giantKiller = makeMonster('test_giant_killer', 'Giant Killer', 2, 'Melee', 20, 1, ['Giant Killer']);
    const giant = makeMonster('test_giant', 'Giant', 0, 'None', 20, 10, []);
    const giantLog = new BattleEngine([giantKiller, giant], ['Standard'], 1, team(giantKiller.id), team(giant.id), undefined, { seed: 11 }).resolve();
    assert(giantLog.events.some((event) => event.type === 'ATTACK' && event.actorName === giantKiller.name && event.amount === 4), 'Giant Killer doubles damage against targets with at least 10 mana');

    const forcefield = makeMonster('test_forcefield', 'Forcefield', 0, 'None', 20, 1, ['Forcefield']);
    const forcefieldAttacker = makeMonster('test_forcefield_attacker', 'Forcefield Attacker', 5, 'Melee', 20, 1, []);
    const forcefieldLog = new BattleEngine([forcefield, forcefieldAttacker], ['Standard'], 1, team(forcefieldAttacker.id), team(forcefield.id), undefined, { seed: 12 }).resolve();
    assert(forcefieldLog.events.some((event) => event.type === 'DAMAGE' && event.targetName === forcefield.name && event.amount === 1), 'Forcefield reduces attacks of at least five damage to one');
  }

  // TEST 16: Incendiary spreads Burning from round two
  {
    const incendiary: CardDefinition = {
      id: 'test_incendiary', name: 'Incendiary', splinter: 'Fire', cardType: 'Monster', rarity: 'Common',
      stats: [{ level: 1, mana: 1, attack: 0, attackType: 'None', speed: 1, armor: 0, health: 20, abilities: ['Incendiary'] }],
    };
    const ally: CardDefinition = {
      ...incendiary, id: 'test_incendiary_ally', name: 'Incendiary Ally',
      stats: [{ ...incendiary.stats[0], abilities: [] }],
    };
    const team: TeamSelection = { summonerId: null, summonerLevel: 1, monsters: [{ cardId: incendiary.id, level: 1 }, { cardId: ally.id, level: 1 }] };
    const opponent: TeamSelection = { summonerId: null, summonerLevel: 1, monsters: [{ cardId: ally.id, level: 1 }] };
    const log = new BattleEngine([incendiary, ally], ['Standard'], 1, team, opponent, undefined, { seed: 13 }).resolve();
    assert(!log.events.some((event) => event.round === 1 && event.type === 'BURNING_TICK'), 'Incendiary does not start Burning in round one');
    assert(log.events.some((event) => event.round === 2 && event.type === 'BURNING_TICK' && event.targetName === ally.name), 'Incendiary spreads Burning to an adjacent ally at round two start');
  }

  // TEST 17: Kindred grants the variant ability to an adjacent counterpart
  {
    const spirit: CardDefinition = {
      id: 'test_kindred_spirit', name: 'Kindred Spirit', splinter: 'Dragon', cardType: 'Monster', rarity: 'Common',
      stats: [{ level: 1, mana: 1, attack: 0, attackType: 'None', speed: 1, armor: 0, health: 20, abilities: ['Kindred Spirit:Blast'] }],
    };
    const will: CardDefinition = {
      ...spirit, id: 'test_kindred_will', name: 'Kindred Will',
      stats: [{ ...spirit.stats[0], abilities: ['Kindred Will'] }],
    };
    const team: TeamSelection = { summonerId: null, summonerLevel: 1, monsters: [{ cardId: spirit.id, level: 1 }, { cardId: will.id, level: 1 }] };
    const opponent: TeamSelection = { summonerId: null, summonerLevel: 1, monsters: [{ cardId: will.id, level: 1 }] };
    const log = new BattleEngine([spirit, will], ['Standard'], 1, team, opponent, undefined, { seed: 14 }).resolve();
    const grant = log.events.find((event) => event.ability === 'Kindred Spirit:Blast' && event.targetName === will.name);
    assert(grant?.boardSnapshot.team1.find((monster) => monster.name === will.name)?.abilities.includes('Blast'), 'Kindred Spirit:Blast grants Blast to an adjacent Kindred Will carrier');

    const baseSpirit: CardDefinition = { ...spirit, id: 'test_base_kindred_spirit', name: 'Base Kindred Spirit', stats: [{ ...spirit.stats[0], abilities: ['Kindred Spirit'] }] };
    const baseWill: CardDefinition = { ...will, id: 'test_base_kindred_will', name: 'Base Kindred Will', stats: [{ ...will.stats[0], abilities: ['Kindred Will'] }] };
    const baseTeam: TeamSelection = { summonerId: null, summonerLevel: 1, monsters: [{ cardId: baseSpirit.id, level: 1 }, { cardId: baseWill.id, level: 1 }] };
    const baseLog = new BattleEngine([baseSpirit, baseWill], ['Standard'], 1, baseTeam, { ...opponent, monsters: [{ cardId: baseWill.id, level: 1 }] }, undefined, { seed: 44 }).resolve();
    const spiritState = baseLog.events.find((event) => event.ability === 'Kindred Will' && event.targetName === baseSpirit.name)?.boardSnapshot.team1[0];
    const willState = baseLog.events.find((event) => event.ability === 'Kindred Spirit' && event.targetName === baseWill.name)?.boardSnapshot.team1[1];
    assert(spiritState?.abilities.includes('Ambush') && willState?.abilities.includes('True Strike'), 'Base Kindred abilities grant Ambush and True Strike to adjacent counterparts');
  }

  // TEST 18: Bloodlust grows the unit responsible for an enemy defeat
  {
    const bloodlust: CardDefinition = {
      id: 'test_bloodlust', name: 'Bloodlust', splinter: 'Death', cardType: 'Monster', rarity: 'Common',
      stats: [{ level: 1, mana: 1, attack: 2, attackType: 'Melee', speed: 5, armor: 0, health: 20, abilities: ['Bloodlust'] }],
    };
    const victim: CardDefinition = {
      ...bloodlust, id: 'test_bloodlust_victim', name: 'Bloodlust Victim',
      stats: [{ ...bloodlust.stats[0], attack: 0, attackType: 'None', speed: 1, health: 1, abilities: [] }],
    };
    const team = (cardId: string): TeamSelection => ({ summonerId: null, summonerLevel: 1, monsters: [{ cardId, level: 1 }] });
    const log = new BattleEngine([bloodlust, victim], ['Standard'], 1, team(bloodlust.id), team(victim.id), undefined, { seed: 15 }).resolve();
    const growth = log.events.find((event) => event.ability === 'Bloodlust');
    const grown = growth?.boardSnapshot.team1[0];
    assert(grown?.currentAttack === 3 && grown.currentSpeed === 6 && grown.maxHealth === 21, 'Bloodlust increases attack, speed, and health after a credited kill');
  }

  // TEST 19: Attack thresholds and status counters
  {
    const makeMonster = (id: string, name: string, attack: number, attackType: CardDefinition['stats'][number]['attackType'], health: number, abilities: CardDefinition['stats'][number]['abilities']): CardDefinition => ({
      id, name, splinter: 'Neutral', cardType: 'Monster', rarity: 'Common',
      stats: [{ level: 1, mana: 1, attack, attackType, speed: 10, armor: 0, health, abilities }],
    });
    const team = (...cardIds: string[]): TeamSelection => ({ summonerId: null, summonerLevel: 1, monsters: cardIds.map((cardId) => ({ cardId, level: 1 })) });

    const deathblow = makeMonster('test_deathblow', 'Deathblow', 1, 'Melee', 20, ['Deathblow']);
    const target = makeMonster('test_deathblow_target', 'Last Enemy', 0, 'None', 20, []);
    const deathblowLog = new BattleEngine([deathblow, target], ['Standard'], 1, team(deathblow.id), team(target.id), undefined, { seed: 16 }).resolve();
    assert(deathblowLog.events.some((event) => event.type === 'ATTACK' && event.actorName === deathblow.name && event.amount === 2), 'Deathblow doubles damage against the last living enemy');

    const execute = makeMonster('test_execute', 'Execute', 2, 'Melee', 20, ['Execute']);
    const executeTarget = makeMonster('test_execute_target', 'Execute Target', 0, 'None', 4, []);
    const executeLog = new BattleEngine([execute, executeTarget], ['Standard'], 1, team(execute.id), team(executeTarget.id), undefined, { seed: 17 }).resolve();
    assert(executeLog.events.filter((event) => event.type === 'ATTACK' && event.actorName === execute.name).length === 2, 'Execute makes a second attack when a target survives at two health or less');
    const strongExecute = makeMonster('test_execute_strong', 'Strong Execute', 5, 'Melee', 20, ['Execute']);
    const halfHealthTarget = makeMonster('test_execute_half_health', 'Half Health Target', 0, 'None', 10, []);
    const halfHealthLog = new BattleEngine([strongExecute, halfHealthTarget], ['Standard'], 1, team(strongExecute.id), team(halfHealthTarget.id), undefined, { seed: 171, maxRounds: 1 }).resolve();
    assert(halfHealthLog.events.filter((event) => event.type === 'ATTACK' && event.actorName === strongExecute.name).length === 1, 'Execute does not trigger when a target survives above two health, even below half health');

    const snare = makeMonster('test_snare', 'Snare', 1, 'Melee', 20, ['Snare']);
    const flying = makeMonster('test_snare_flying', 'Flying Target', 0, 'None', 20, ['Flying']);
    const snareLog = new BattleEngine([snare, flying], ['Standard'], 1, team(snare.id), team(flying.id), undefined, { seed: 18 }).resolve();
    assert(snareLog.events.some((event) => event.ability === 'Snare' && event.targetName === flying.name && event.boardSnapshot.team2[0].isSnared), 'Snare disables a Flying target after a successful hit');

    const revealer = makeMonster('test_revealer', 'Revealer', 0, 'None', 20, ['Reveal']);
    const sniper = makeMonster('test_reveal_snipe', 'Snipe', 1, 'Ranged', 20, ['Snipe']);
    const front = makeMonster('test_reveal_front', 'Front', 0, 'None', 20, []);
    const camouflaged = makeMonster('test_reveal_camo', 'Camouflaged', 0, 'None', 20, ['Camouflage']);
    const revealLog = new BattleEngine([revealer, sniper, front, camouflaged], ['Standard'], 1, team(revealer.id, sniper.id), team(front.id, camouflaged.id), undefined, { seed: 19 }).resolve();
    assert(revealLog.events.some((event) => event.type === 'ATTACK' && event.actorName === sniper.name && event.targetName === camouflaged.name), 'Reveal allows Snipe to select a Camouflage target');
  }

  // TEST 20: Death-trigger abilities resolve after confirmed defeat
  {
    const makeMonster = (id: string, name: string, attack: number, attackType: CardDefinition['stats'][number]['attackType'], health: number, abilities: CardDefinition['stats'][number]['abilities']): CardDefinition => ({
      id, name, splinter: 'Neutral', cardType: 'Monster', rarity: 'Common',
      stats: [{ level: 1, mana: 1, attack, attackType, speed: 10, armor: 0, health, abilities }],
    });
    const team = (...cardIds: string[]): TeamSelection => ({ summonerId: null, summonerLevel: 1, monsters: cardIds.map((cardId) => ({ cardId, level: 1 })) });
    const killer = makeMonster('test_death_trigger_killer', 'Death Trigger Killer', 2, 'Melee', 20, []);
    const neighbor = makeMonster('test_martyr_neighbor', 'Martyr Neighbor', 1, 'Melee', 10, []);
    const martyr = makeMonster('test_martyr', 'Martyr', 0, 'None', 1, ['Martyr']);
    const martyrLog = new BattleEngine([killer, neighbor, martyr], ['Standard'], 1, team(killer.id), team(martyr.id, neighbor.id), undefined, { seed: 20 }).resolve();
    assert(martyrLog.events.some((event) => event.ability === 'Martyr' && event.targetName === neighbor.name && event.boardSnapshot.team2[1].currentAttack === 2), 'Martyr increases all stats of adjacent surviving allies');

    const redemption = makeMonster('test_redemption', 'Redemption', 0, 'None', 1, ['Redemption']);
    const enemy = makeMonster('test_redemption_enemy', 'Redemption Enemy', 0, 'None', 20, []);
    const redemptionLog = new BattleEngine([killer, redemption, enemy], ['Standard'], 1, team(killer.id), team(redemption.id, enemy.id), undefined, { seed: 21 }).resolve();
    assert(redemptionLog.events.some((event) => event.targetName === killer.name && event.text.includes('Redemption damage')), 'Redemption deals damage to all enemies when its unit dies');

    const poisonBurst = makeMonster('test_poison_burst', 'Poison Burst', 0, 'None', 1, ['Poison Burst']);
    const poisonTarget = makeMonster('test_poison_burst_target', 'Poison Burst Target', 0, 'None', 20, []);
    const poisonLog = new BattleEngine([killer, poisonBurst, poisonTarget], ['Standard'], 1, team(killer.id), team(poisonBurst.id, poisonTarget.id), undefined, { seed: 22 }).resolve();
    assert(poisonLog.events.some((event) => event.ability === 'Poison Burst' && event.targetName === killer.name), 'Poison Burst poisons surviving enemies after death');

    const spite = makeMonster('test_spite', 'Spite', 2, 'Melee', 1, ['Spite']);
    const spiteLog = new BattleEngine([killer, spite], ['Standard'], 1, team(killer.id), team(spite.id), undefined, { seed: 23 }).resolve();
    assert(spiteLog.events.some((event) => event.type === 'RETALIATE' && event.ability === 'Spite' && event.targetName === killer.name && event.amount === 2), 'Spite counterattacks the unit responsible for the defeat');
  }

  // TEST 21: Defensive grants and on-hit modifiers
  {
    const makeMonster = (id: string, name: string, attack: number, attackType: CardDefinition['stats'][number]['attackType'], speed: number, armor: number, health: number, abilities: CardDefinition['stats'][number]['abilities']): CardDefinition => ({
      id, name, splinter: 'Neutral', cardType: 'Monster', rarity: 'Common',
      stats: [{ level: 1, mana: 1, attack, attackType, speed, armor, health, abilities }],
    });
    const team = (...cardIds: string[]): TeamSelection => ({ summonerId: null, summonerLevel: 1, monsters: cardIds.map((cardId) => ({ cardId, level: 1 })) });

    const shroud = makeMonster('test_deflection_shroud', 'Shroud', 0, 'None', 1, 0, 20, ['Deflection Shroud', 'Flank']);
    const wardedAlly = makeMonster('test_warded_ally', 'Warded Ally', 0, 'None', 1, 0, 20, []);
    const grantEnemy = makeMonster('test_grant_enemy', 'Grant Enemy', 0, 'None', 1, 0, 20, []);
    const grantLog = new BattleEngine([shroud, wardedAlly, grantEnemy], ['Standard'], 1, team(shroud.id, wardedAlly.id), team(grantEnemy.id), undefined, { seed: 24 }).resolve();
    const grantedAlly = grantLog.events.find((event) => event.ability === 'Flank')?.boardSnapshot.team1[1];
    assert(grantedAlly.abilities.includes('Deflect') && grantedAlly.abilities.includes('Reach'), 'Deflection Shroud and Flank grant abilities to adjacent allies at battle start');

    const wardTank = makeMonster('test_ward_tank', 'Ward Tank', 0, 'None', 1, 0, 20, []);
    const phaseWard = makeMonster('test_phase_ward', 'Phase Ward', 0, 'None', 1, 0, 20, ['Phase Ward']);
    const shieldWard = makeMonster('test_shield_ward', 'Shield Ward', 0, 'None', 1, 0, 20, ['Shield Ward']);
    const wardLog = new BattleEngine([wardTank, phaseWard, shieldWard, grantEnemy], ['Standard'], 1, team(wardTank.id, phaseWard.id, shieldWard.id), team(grantEnemy.id), undefined, { seed: 241 }).resolve();
    assert(wardLog.events.some((event) => event.ability === 'Phase Ward' && event.targetName === wardTank.name && event.boardSnapshot.team1[0].abilities.includes('Phase'))
      && wardLog.events.some((event) => event.ability === 'Shield Ward' && event.targetName === phaseWard.name && event.boardSnapshot.team1[1].abilities.includes('Shield')),
    'Phase Ward and Shield Ward grant their abilities to the unit immediately in front');

    const blaster = makeMonster('test_deflect_blaster', 'Blaster', 2, 'Melee', 10, 0, 20, ['Blast']);
    const front = makeMonster('test_deflect_front', 'Blast Front', 0, 'None', 1, 0, 20, []);
    const deflect = makeMonster('test_deflect_target', 'Deflect Target', 0, 'None', 1, 0, 20, ['Deflect']);
    const blastLog = new BattleEngine([blaster, front, deflect], ['Standard'], 1, team(blaster.id), team(front.id, deflect.id), undefined, { seed: 25 }).resolve();
    assert(blastLog.events.some((event) => event.ability === 'Deflect' && event.targetName === deflect.name), 'Deflect blocks Blast splash damage');

    const attacker = makeMonster('test_amplify_attacker', 'Amplify Attacker', 2, 'Melee', 10, 4, 20, []);
    const thorn = makeMonster('test_amplify_thorns', 'Amplified Thorns', 0, 'None', 1, 0, 20, ['Thorns', 'Amplify']);
    const amplifyLog = new BattleEngine([attacker, thorn], ['Standard'], 1, team(attacker.id), team(thorn.id), undefined, { seed: 26 }).resolve();
    assert(amplifyLog.events.some((event) => event.type === 'THORNS_DAMAGE' && event.amount === 3), 'Amplify increases reflected Thorns damage');

    const armoredStrike = makeMonster('test_armored_strike', 'Armored Strike', 1, 'Melee', 10, 2, 20, ['Armored Strike']);
    const armorTarget = makeMonster('test_armored_strike_target', 'Armor Target', 0, 'None', 1, 0, 20, []);
    const armorLog = new BattleEngine([armoredStrike, armorTarget], ['Standard'], 1, team(armoredStrike.id), team(armorTarget.id), undefined, { seed: 27 }).resolve();
    assert(armorLog.events.some((event) => event.type === 'ATTACK' && event.actorName === armoredStrike.name && event.amount === 3), 'Armored Strike adds remaining armor to melee attack damage');

    const debuffer = makeMonster('test_enfeeble_impede', 'Enfeebling Impeder', 1, 'Melee', 10, 0, 20, ['Enfeeble', 'Impede']);
    const debuffTarget = makeMonster('test_enfeeble_target', 'Debuff Target', 2, 'Melee', 4, 0, 20, []);
    const debuffLog = new BattleEngine([debuffer, debuffTarget], ['Standard'], 1, team(debuffer.id), team(debuffTarget.id), undefined, { seed: 28 }).resolve();
    assert(debuffLog.events.some((event) => event.ability === 'Impede' && event.boardSnapshot.team2[0].currentSpeed === 3) && debuffLog.events.some((event) => event.ability === 'Enfeeble' && event.boardSnapshot.team2[0].currentAttack === 1), 'Enfeeble and Impede reduce attack and speed after a hit');

    const rangedDebuffTarget = makeMonster('test_enfeeble_ranged', 'Ranged Target', 2, 'Ranged', 4, 0, 20, []);
    const rangedDebuffLog = new BattleEngine([debuffer, rangedDebuffTarget], ['Standard'], 1, team(debuffer.id), team(rangedDebuffTarget.id), undefined, { seed: 281 }).resolve();
    assert(!rangedDebuffLog.events.some((event) => event.ability === 'Enfeeble' && event.targetName === rangedDebuffTarget.name), 'Enfeeble does not reduce ranged power');

    const halver = makeMonster('test_halving', 'Halving', 1, 'Melee', 10, 0, 20, ['Halving']);
    const onePower = makeMonster('test_halving_target', 'One-Power Target', 1, 'Melee', 1, 0, 20, []);
    const halvingLog = new BattleEngine([halver, onePower], ['Standard'], 1, team(halver.id), team(onePower.id), undefined, { seed: 282 }).resolve();
    assert(halvingLog.events.some((event) => event.ability === 'Halving' && event.boardSnapshot.team2[0].currentAttack === 0), 'Halving rounds one power down to zero');

    const ward = makeMonster('test_corrosive_ward', 'Corrosive Ward', 0, 'None', 1, 0, 20, ['Corrosive Ward']);
    const corrosionLog = new BattleEngine([attacker, ward], ['Standard'], 1, team(attacker.id), team(ward.id), undefined, { seed: 29 }).resolve();
    assert(corrosionLog.events.some((event) => event.targetName === ward.name && event.boardSnapshot.team1[0].maxArmor === 2), 'Corrosive Ward reduces the melee attacker maximum armor');
  }

  // TEST 22: Rebirth restores a unit once and skips its next turn
  {
    const attacker: CardDefinition = {
      id: 'test_rebirth_attacker', name: 'Rebirth Attacker', splinter: 'Fire', cardType: 'Monster', rarity: 'Common',
      stats: [{ level: 1, mana: 1, attack: 2, attackType: 'Melee', speed: 10, armor: 0, health: 20, abilities: [] }],
    };
    const rebirth: CardDefinition = {
      ...attacker, id: 'test_rebirth', name: 'Rebirth',
      stats: [{ ...attacker.stats[0], attack: 0, attackType: 'None', speed: 1, armor: 2, health: 5, abilities: ['Rebirth'] }],
    };
    const team = (cardId: string): TeamSelection => ({ summonerId: null, summonerLevel: 1, monsters: [{ cardId, level: 1 }] });
    const log = new BattleEngine([attacker, rebirth], ['Standard'], 1, team(attacker.id), team(rebirth.id), undefined, { seed: 30 }).resolve();
    const revival = log.events.find((event) => event.ability === 'Rebirth');
    const revived = revival?.boardSnapshot.team2[0];
    assert(revived?.isAlive && revived.hasRebirthed && revived.currentHealth === 1 && revived.currentArmor === 2, 'Rebirth restores one health and full armor once');
    assert(log.events.some((event) => event.text.includes('exhausted and skips its turn')), 'A Rebirth unit skips its next turn');
  }

  // TEST 23: Mimic copies an opposing ability after round one
  {
    const makeMonster = (id: string, name: string, abilities: CardDefinition['stats'][number]['abilities']): CardDefinition => ({
      id, name, splinter: 'Neutral', cardType: 'Monster', rarity: 'Common',
      stats: [{ level: 1, mana: 1, attack: 0, attackType: 'None', speed: 1, armor: 0, health: 20, abilities }],
    });
    const mimic = makeMonster('test_mimic', 'Mimic', ['Mimic']);
    const flier = makeMonster('test_mimic_flyer', 'Enemy Flyer', ['Flying', 'Sneak', 'Weary']);
    const team = (cardId: string): TeamSelection => ({ summonerId: null, summonerLevel: 1, monsters: [{ cardId, level: 1 }] });
    const log = new BattleEngine([mimic, flier], ['Standard'], 1, team(mimic.id), team(flier.id), undefined, { seed: 31 }).resolve();
    const copied = log.events.find((event) => event.round === 2 && event.ability === 'Mimic');
    const copiedAbilities = copied?.boardSnapshot.team1[0].abilities || [];
    assert(copiedAbilities.includes('Flying') && !copiedAbilities.includes('Sneak') && !copiedAbilities.includes('Weary'), 'Mimic copies eligible abilities but excludes targeting abilities and debilitation');
  }

  // TEST 24: Attack cadence and flying-target abilities
  {
    const makeMonster = (id: string, name: string, attack: number, attackType: CardDefinition['stats'][number]['attackType'], speed: number, health: number, abilities: CardDefinition['stats'][number]['abilities']): CardDefinition => ({
      id, name, splinter: 'Neutral', cardType: 'Monster', rarity: 'Common',
      stats: [{ level: 1, mana: 1, attack, attackType, speed, armor: 0, health, abilities }],
    });
    const team = (...cardIds: string[]): TeamSelection => ({ summonerId: null, summonerLevel: 1, monsters: cardIds.map((cardId) => ({ cardId, level: 1 })) });

    const recharge = makeMonster('test_recharge', 'Recharge', 2, 'Melee', 10, 20, ['Recharge']);
    const inert = makeMonster('test_recharge_target', 'Inert Target', 0, 'None', 1, 20, []);
    const rechargeLog = new BattleEngine([recharge, inert], ['Standard'], 1, team(recharge.id), team(inert.id), undefined, { seed: 32 }).resolve();
    const rechargeAttacks = rechargeLog.events.filter((event) => event.type === 'ATTACK' && event.actorName === recharge.name);
    assert(rechargeAttacks.some((event) => event.round === 1 && event.amount === 6) && !rechargeAttacks.some((event) => event.round === 2) && rechargeAttacks.some((event) => event.round === 3 && event.amount === 6), 'Recharge attacks for triple damage every other round');

    const pinpoint = makeMonster('test_pinpoint', 'Pinpoint', 0, 'None', 1, 20, ['Pinpoint']);
    const sneak = makeMonster('test_pinpoint_sneak', 'Sneak', 1, 'Melee', 1, 20, ['Sneak']);
    const dodger = makeMonster('test_pinpoint_dodge', 'Dodger', 0, 'None', 10, 20, ['Dodge']);
    const pinpointLog = new BattleEngine([pinpoint, sneak, dodger], ['Standard'], 1, team(pinpoint.id, sneak.id), team(dodger.id), undefined, { seed: 33 }).resolve();
    assert(pinpointLog.events.some((event) => event.type === 'ATTACK' && event.actorName === sneak.name) && !pinpointLog.events.some((event) => event.type === 'MISS' && event.actorName === sneak.name), 'Pinpoint prevents Sneak attacks from missing');

    const wingbreak = makeMonster('test_wingbreak', 'Wingbreak', 1, 'Melee', 10, 20, ['Wingbreak']);
    const ground = makeMonster('test_wingbreak_ground', 'Ground Unit', 0, 'None', 1, 20, ['Taunt']);
    const firstFlying = makeMonster('test_wingbreak_flyer_1', 'First Flyer', 0, 'None', 1, 20, ['Flying', 'Camouflage']);
    const secondFlying = makeMonster('test_wingbreak_flyer_2', 'Second Flyer', 0, 'None', 1, 20, ['Flying']);
    const wingbreakLog = new BattleEngine([wingbreak, ground, firstFlying, secondFlying], ['Standard'], 1, team(wingbreak.id), team(ground.id, firstFlying.id, secondFlying.id), undefined, { seed: 34 }).resolve();
    assert(wingbreakLog.events.some((event) => event.type === 'ATTACK' && event.actorName === wingbreak.name && event.targetName === firstFlying.name && event.amount === 3), 'Wingbreak targets the first Flying enemy and gains bonus damage');

    const scattershot = makeMonster('test_scattershot', 'Scattershot', 1, 'Ranged', 10, 20, ['Scattershot']);
    const ownFront = makeMonster('test_scattershot_front', 'Own Front', 0, 'None', 1, 20, []);
    const taunt = makeMonster('test_scattershot_taunt', 'Taunt', 0, 'None', 1, 20, ['Taunt']);
    const randomTarget = makeMonster('test_scattershot_other', 'Random Target', 0, 'None', 1, 20, ['Camouflage']);
    const scatterLog = new BattleEngine([scattershot, ownFront, taunt, randomTarget], ['Standard'], 1, team(ownFront.id, scattershot.id), team(taunt.id, randomTarget.id), undefined, { seed: 1, maxRounds: 1 }).resolve();
    assert(scatterLog.events.some((event) => event.type === 'ATTACK' && event.actorName === scattershot.name && event.targetName === randomTarget.name), 'Scattershot ignores Taunt and selects a random target');
  }

  // TEST 25: Final Rest and Last Word revival priority
  {
    const makeMonster = (id: string, name: string, attack: number, attackType: CardDefinition['stats'][number]['attackType'], health: number, abilities: CardDefinition['stats'][number]['abilities']): CardDefinition => ({
      id, name, splinter: 'Neutral', cardType: 'Monster', rarity: 'Common',
      stats: [{ level: 1, mana: 1, attack, attackType, speed: 10, armor: 0, health, abilities }],
    });
    const team = (...cardIds: string[]): TeamSelection => ({ summonerId: null, summonerLevel: 1, monsters: cardIds.map((cardId) => ({ cardId, level: 1 })) });
    const killer = makeMonster('test_final_rest_killer', 'Final Rest Killer', 2, 'Melee', 20, []);
    const finalRest = makeMonster('test_final_rest', 'Final Rest', 0, 'None', 20, ['Final Rest']);
    const rebirth = makeMonster('test_final_rest_rebirth', 'Blocked Rebirth', 0, 'None', 1, ['Rebirth']);
    const blockedLog = new BattleEngine([killer, finalRest, rebirth], ['Standard'], 1, team(killer.id, finalRest.id), team(rebirth.id), undefined, { seed: 35 }).resolve();
    assert(blockedLog.events.some((event) => event.ability === 'Final Rest' && event.targetName === rebirth.name) && !blockedLog.events.some((event) => event.ability === 'Rebirth'), 'Final Rest blocks one enemy Rebirth');

    const lastWordRebirth = makeMonster('test_last_word_rebirth', 'Last Word Rebirth', 0, 'None', 1, ['Last Word', 'Rebirth']);
    const overrideLog = new BattleEngine([killer, finalRest, lastWordRebirth], ['Standard'], 1, team(killer.id, finalRest.id), team(lastWordRebirth.id), undefined, { seed: 36 }).resolve();
    assert(overrideLog.events.some((event) => event.ability === 'Rebirth' && event.targetName === lastWordRebirth.name) && !overrideLog.events.some((event) => event.ability === 'Final Rest'), 'Last Word allows revival despite Final Rest');
  }

  // TEST 26: Decoy redirects backline targeting abilities
  {
    const makeMonster = (id: string, name: string, attack: number, attackType: CardDefinition['stats'][number]['attackType'], abilities: CardDefinition['stats'][number]['abilities']): CardDefinition => ({
      id, name, splinter: 'Neutral', cardType: 'Monster', rarity: 'Common',
      stats: [{ level: 1, mana: 1, attack, attackType, speed: 10, armor: 0, health: 20, abilities }],
    });
    const attacker = makeMonster('test_decoy_sneak', 'Snipe Attacker', 1, 'Ranged', ['Snipe', 'Close Range']);
    const front = makeMonster('test_decoy_front', 'Front', 0, 'None', []);
    const decoy = makeMonster('test_decoy', 'Decoy', 0, 'None', ['Decoy']);
    const last = makeMonster('test_decoy_last', 'Last Unit', 0, 'None', []);
    const friendlyFront = makeMonster('test_decoy_friendly_front', 'Friendly Front', 0, 'None', []);
    const team = (...cardIds: string[]): TeamSelection => ({ summonerId: null, summonerLevel: 1, monsters: cardIds.map((cardId) => ({ cardId, level: 1 })) });
    const log = new BattleEngine([attacker, front, decoy, last, friendlyFront], ['Standard'], 1, team(friendlyFront.id, attacker.id), team(front.id, decoy.id, last.id), undefined, { seed: 37 }).resolve();
    assert(log.events.some((event) => event.type === 'ATTACK' && event.actorName === attacker.name && event.targetName === decoy.name), 'Decoy draws Snipe attacks from the backline');

    const rangedFront = makeMonster('test_decoy_ranged_front', 'Frontline Snipe', 1, 'Ranged', ['Snipe', 'Close Range']);
    const meleeFront = makeMonster('test_decoy_melee_front', 'Melee Front', 0, 'Melee', []);
    const ordinaryBackline = makeMonster('test_decoy_ordinary_backline', 'Ordinary Backline', 0, 'None', []);
    const frontlineLog = new BattleEngine([rangedFront, meleeFront, ordinaryBackline, decoy], ['Standard'], 1, team(rangedFront.id), team(meleeFront.id, ordinaryBackline.id, decoy.id), undefined, { seed: 40 }).resolve();
    assert(frontlineLog.events.some((event) => event.type === 'ATTACK' && event.actorName === rangedFront.name && event.targetName === ordinaryBackline.name), 'Decoy does not redirect an attack from a frontline enemy');
  }

  // TEST 27: Determined retries once after a miss
  {
    const attacker: CardDefinition = {
      id: 'test_determined', name: 'Determined', splinter: 'Neutral', cardType: 'Monster', rarity: 'Common',
      stats: [{ level: 1, mana: 1, attack: 1, attackType: 'Melee', speed: 1, armor: 0, health: 20, abilities: ['Determined'] }],
    };
    const evasive: CardDefinition = {
      ...attacker, id: 'test_determined_evasive', name: 'Evasive Target',
      stats: [{ ...attacker.stats[0], attack: 0, attackType: 'None', speed: 10, abilities: ['Flying', 'Dodge'] }],
    };
    const team = (cardId: string): TeamSelection => ({ summonerId: null, summonerLevel: 1, monsters: [{ cardId, level: 1 }] });
    const log = new BattleEngine([attacker, evasive], ['Standard'], 1, team(attacker.id), team(evasive.id), undefined, { seed: 1 }).resolve();
    const retryIndex = log.events.findIndex((event) => event.ability === 'Determined');
    assert(retryIndex > 0 && log.events[retryIndex - 1].type === 'MISS' && ['ATTACK', 'MISS'].includes(log.events[retryIndex + 1]?.type), 'Determined retries once immediately after a miss');
  }

  // TEST 28: Reckless and Bloodline Tribute triggers
  {
    const makeMonster = (id: string, name: string, attack: number, attackType: CardDefinition['stats'][number]['attackType'], health: number, abilities: CardDefinition['stats'][number]['abilities'], bloodline?: string): CardDefinition => ({
      id, name, splinter: 'Neutral', cardType: 'Monster', rarity: 'Common', bloodline,
      stats: [{ level: 1, mana: 1, attack, attackType, speed: 10, armor: 0, health, abilities }],
    });
    const team = (...cardIds: string[]): TeamSelection => ({ summonerId: null, summonerLevel: 1, monsters: cardIds.map((cardId) => ({ cardId, level: 1 })) });
    const ally = makeMonster('test_reckless_ally', 'Reckless Ally', 0, 'None', 20, []);
    const reckless = makeMonster('test_reckless', 'Reckless', 2, 'Ranged', 20, ['Reckless']);
    const target = makeMonster('test_reckless_target', 'Reckless Target', 0, 'None', 20, []);
    const recklessLog = new BattleEngine([ally, reckless, target], ['Standard'], 1, team(ally.id, reckless.id), team(target.id), undefined, { seed: 38 }).resolve();
    assert(recklessLog.events.some((event) => event.targetName === ally.name && event.text.includes('Reckless damage')), 'Reckless damages an adjacent ally after a successful attack');

    const tribute = makeMonster('test_bloodline_tribute', 'Bloodline Tribute', 0, 'Melee', 1, ['Bloodline Tribute'], 'A');
    const sameBloodline = makeMonster('test_bloodline_ally', 'Bloodline Ally', 1, 'Melee', 20, [], 'A');
    const shapeshifter = makeMonster('test_bloodline_shapeshifter', 'Shapeshifter', 1, 'Melee', 20, ['Shapeshift'], 'B');
    const killer = makeMonster('test_bloodline_killer', 'Tribute Killer', 2, 'Melee', 20, []);
    const tributeLog = new BattleEngine([tribute, sameBloodline, shapeshifter, killer], ['Standard'], 1, team(killer.id), team(tribute.id, sameBloodline.id, shapeshifter.id), undefined, { seed: 39 }).resolve();
    assert(tributeLog.events.some((event) => event.ability === 'Bloodline Tribute' && event.targetName === sameBloodline.name && event.boardSnapshot.team2[1].currentAttack === 2)
      && tributeLog.events.some((event) => event.ability === 'Bloodline Tribute' && event.targetName === shapeshifter.name), 'Bloodline Tribute improves matching and Shapeshift allies');
  }

  // TEST 29: Flame Fed and Weary round statuses
  {
    const makeMonster = (id: string, name: string, abilities: CardDefinition['stats'][number]['abilities']): CardDefinition => ({
      id, name, splinter: 'Neutral', cardType: 'Monster', rarity: 'Common',
      stats: [{ level: 1, mana: 1, attack: 0, attackType: 'None', speed: 1, armor: 0, health: 20, abilities }],
    });
    const team = (...cardIds: string[]): TeamSelection => ({ summonerId: null, summonerLevel: 1, monsters: cardIds.map((cardId) => ({ cardId, level: 1 })) });
    const incendiary = makeMonster('test_flame_fed_incendiary', 'Incendiary', ['Incendiary']);
    const flameFed = makeMonster('test_flame_fed', 'Flame Fed', ['Flame Fed']);
    const inert = makeMonster('test_flame_fed_inert', 'Inert', []);
    const flameLog = new BattleEngine([incendiary, flameFed, inert], ['Standard'], 1, team(incendiary.id, flameFed.id), team(inert.id), undefined, { seed: 40 }).resolve();
    const fed = flameLog.events.find((event) => event.ability === 'Flame Fed' && event.round === 2)?.boardSnapshot.team1[1];
    assert(Boolean(fed) && fed!.maxHealth > 20 && !flameLog.events.some((event) => event.type === 'BURNING_TICK' && event.targetName === flameFed.name), 'Flame Fed converts Burning ticks into health and maximum-health gains');

    const weary = makeMonster('test_weary', 'Weary', ['Weary']);
    const invigoration = makeMonster('test_invigorate', 'Invigorate', ['Invigorate']);
    const wearyLog = new BattleEngine([weary, invigoration, inert], ['Standard'], 1, team(weary.id, invigoration.id), team(inert.id), undefined, { seed: 1 }).resolve();
    assert(!wearyLog.events.some((event) => event.ability === 'Weary'), 'Invigorate prevents allied Weary units from becoming Exhausted');
    const exhaustedLog = new BattleEngine([weary, inert], ['Standard'], 1, team(weary.id), team(inert.id), undefined, { seed: 1 }).resolve();
    assert(exhaustedLog.events.some((event) => event.ability === 'Weary' && event.round >= 4), 'Weary exhaustion chance increases each round');
  }

  // TEST 30: Resurrect, Resurgence, and Soul Siphon
  {
    const makeMonster = (id: string, name: string, attack: number, attackType: CardDefinition['stats'][number]['attackType'], health: number, armor: number, abilities: CardDefinition['stats'][number]['abilities']): CardDefinition => ({
      id, name, splinter: 'Neutral', cardType: 'Monster', rarity: 'Common',
      stats: [{ level: 1, mana: 1, attack, attackType, speed: 10, armor, health, abilities }],
    });
    const team = (...cardIds: string[]): TeamSelection => ({ summonerId: null, summonerLevel: 1, monsters: cardIds.map((cardId) => ({ cardId, level: 1 })) });
    const killer = makeMonster('test_revival_killer', 'Revival Killer', 2, 'Melee', 20, 0, []);
    const victim = makeMonster('test_resurrect_victim', 'Resurrected', 0, 'None', 1, 2, []);
    const resurrector = makeMonster('test_resurrector', 'Resurrector', 0, 'None', 20, 0, ['Resurrect']);
    const resurrectLog = new BattleEngine([killer, victim, resurrector], ['Standard'], 1, team(killer.id), team(victim.id, resurrector.id), undefined, { seed: 41 }).resolve();
    assert(resurrectLog.events.some((event) => event.ability === 'Resurrect' && event.boardSnapshot.team2[0].currentHealth === 1 && event.boardSnapshot.team2[0].currentArmor === 2) && resurrectLog.events.some((event) => event.text.includes('exhausted and skips its turn')), 'Resurrect restores one health and full armor and skips the revived unit turn');

    const resurgence = makeMonster('test_resurgence', 'Resurgence', 0, 'None', 5, 2, ['Resurgence']);
    const resurgenceLog = new BattleEngine([killer, resurgence], ['Standard'], 1, team(killer.id), team(resurgence.id), undefined, { seed: 42 }).resolve();
    assert(resurgenceLog.events.some((event) => event.ability === 'Resurgence' && event.boardSnapshot.team2[0].currentHealth === 5) && resurgenceLog.events.some((event) => event.targetName === resurgence.name && event.text.includes('Resurgence damage') && event.boardSnapshot.team2[0].currentHealth === 4), 'Resurgence returns at full health and armor before damaging all units');

    const siphon = makeMonster('test_soul_siphon', 'Soul Siphon', 0, 'None', 6, 1, ['Soul Siphon']);
    const donor = makeMonster('test_soul_siphon_donor', 'Donor', 0, 'None', 10, 0, []);
    const siphonLog = new BattleEngine([killer, siphon, donor], ['Standard'], 1, team(killer.id), team(siphon.id, donor.id), undefined, { seed: 43 }).resolve();
    const siphoned = siphonLog.events.find((event) => event.ability === 'Soul Siphon');
    assert(siphoned?.boardSnapshot.team2[0].currentHealth === 3 && siphoned.boardSnapshot.team2[1].currentHealth === 5 && siphoned.boardSnapshot.team2[1].abilities.includes('Weary'), 'Soul Siphon revives at half health and drains the healthiest non-Weary ally');

    const fragileSiphon = makeMonster('test_soul_siphon_fragile', 'Fragile Soul Siphon', 0, 'None', 6, 0, ['Soul Siphon']);
    const fragileDonor = makeMonster('test_soul_siphon_fragile_donor', 'Fragile Donor', 0, 'None', 1, 0, []);
    const lethalSiphonLog = new BattleEngine([killer, fragileSiphon, fragileDonor], ['Standard'], 1, team(killer.id), team(fragileSiphon.id, fragileDonor.id), undefined, { seed: 431 }).resolve();
    assert(lethalSiphonLog.events.some((event) => event.ability === 'Soul Siphon' && event.boardSnapshot.team2[0].isAlive && event.boardSnapshot.team2[0].currentHealth === 3)
      && lethalSiphonLog.events.some((event) => event.type === 'DEATH' && event.targetName === fragileDonor.name), 'Soul Siphon can defeat its donor when the health loss is lethal');
  }

  // TEST 31: Healing and defensive debuff abilities
  {
    const makeMonster = (id: string, name: string, attack: number, attackType: CardDefinition['stats'][number]['attackType'], health: number, abilities: CardDefinition['stats'][number]['abilities']): CardDefinition => ({
      id, name, splinter: 'Neutral', cardType: 'Monster', rarity: 'Common',
      stats: [{ level: 1, mana: 1, attack, attackType, speed: 10, armor: 0, health, abilities }],
    });
    const team = (...cardIds: string[]): TeamSelection => ({ summonerId: null, summonerLevel: 1, monsters: cardIds.map((cardId) => ({ cardId, level: 1 })) });

    const corruptedHealing = makeMonster('test_corrupted_healing', 'Corrupted Healing', 0, 'None', 20, ['Corrupted Healing']);
    const injured = makeMonster('test_corrupted_injured', 'Injured Ally', 0, 'None', 10, []);
    const sneak = makeMonster('test_corrupted_sneak', 'Sneak Attacker', 2, 'Melee', 20, ['Sneak']);
    const healingLog = new BattleEngine([corruptedHealing, injured, sneak], ['Standard'], 1, team(corruptedHealing.id, injured.id), team(sneak.id), undefined, { seed: 45 }).resolve();
    assert(healingLog.events.some((event) => event.ability === 'Corrupted Healing' && event.targetName === injured.name && event.boardSnapshot.team1[1].maxHealth === 9), 'Corrupted Healing restores allies and reduces their maximum health');

    const incendiary = makeMonster('test_painforge_incendiary', 'Painforge Incendiary', 0, 'None', 20, ['Incendiary']);
    const painforge = makeMonster('test_painforge', 'Painforge', 0, 'None', 20, ['Painforge']);
    const inert = makeMonster('test_painforge_inert', 'Inert', 0, 'None', 20, []);
    const painforgeLog = new BattleEngine([incendiary, painforge, inert], ['Standard'], 1, team(incendiary.id, painforge.id), team(inert.id), undefined, { seed: 46 }).resolve();
    assert(painforgeLog.events.some((event) => event.ability === 'Painforge' && event.text.includes('Burning damage') && event.round >= 2), 'Painforge gains power when damaged by Burning');

    const exposer = makeMonster('test_expose', 'Exposer', 1, 'Melee', 20, ['Expose']);
    const forcefield = makeMonster('test_expose_forcefield', 'Exposed Forcefield', 0, 'None', 20, ['Forcefield']);
    const exposeLog = new BattleEngine([exposer, forcefield], ['Standard'], 1, team(exposer.id), team(forcefield.id), undefined, { seed: 0 }).resolve();
    assert(exposeLog.events.some((event) => event.ability === 'Expose' && event.text.includes('removes Forcefield')), 'Expose can remove Forcefield after a successful attack');
  }

  // TEST 32: Amplify and Bulwark combat modifiers
  {
    const makeMonster = (id: string, name: string, attack: number, attackType: CardDefinition['stats'][number]['attackType'], health: number, armor: number, abilities: CardDefinition['stats'][number]['abilities']): CardDefinition => ({
      id, name, splinter: 'Neutral', cardType: 'Monster', rarity: 'Common',
      stats: [{ level: 1, mana: 1, attack, attackType, speed: 10, armor, health, abilities }],
    });
    const team = (...cardIds: string[]): TeamSelection => ({ summonerId: null, summonerLevel: 1, monsters: cardIds.map((cardId) => ({ cardId, level: 1 })) });
    const meleeAttacker = makeMonster('test_amplified_retaliate_attacker', 'Melee Attacker', 2, 'Melee', 20, 0, []);
    const retaliator = makeMonster('test_amplified_retaliator', 'Amplified Retaliator', 2, 'Melee', 20, 0, ['Retaliate', 'Amplify']);
    const retaliateLog = new BattleEngine([meleeAttacker, retaliator], ['Standard'], 1, team(meleeAttacker.id), team(retaliator.id), undefined, { seed: 8 }).resolve();
    assert(retaliateLog.events.some((event) => event.type === 'DAMAGE' && event.targetName === meleeAttacker.name && event.amount === 3), 'Amplify adds one damage to Retaliate');

    const bulwark = makeMonster('test_bulwark', 'Bulwark', 2, 'Melee', 10, 0, ['Bulwark']);
    const inert = makeMonster('test_bulwark_inert', 'Inert', 0, 'None', 20, 0, []);
    const bulwarkLog = new BattleEngine([bulwark, inert], ['Standard'], 1, team(bulwark.id), team(inert.id), undefined, { seed: 47 }).resolve();
    const roundStart = bulwarkLog.events.find((event) => event.type === 'ROUND_START');
    const bulwarkState = roundStart?.boardSnapshot.team1[0];
    assert(bulwarkState?.currentAttack === 0 && bulwarkState.maxHealth === 18 && bulwarkState.maxArmor === 8, 'Bulwark can reduce power to zero while adding health and armor');
  }

  // TEST 33: Reflexes blocks repeated attacks from the same unit
  {
    const attacker: CardDefinition = {
      id: 'test_reflexes_attacker', name: 'Double Striker', splinter: 'Neutral', cardType: 'Monster', rarity: 'Common',
      stats: [{ level: 1, mana: 1, attack: 2, attackType: 'Melee', speed: 10, armor: 0, health: 20, abilities: ['Double Strike'] }],
    };
    const reflexes: CardDefinition = {
      ...attacker, id: 'test_reflexes', name: 'Reflexes',
      stats: [{ ...attacker.stats[0], attack: 0, attackType: 'None', speed: 1, abilities: ['Reflexes'] }],
    };
    const team = (cardId: string): TeamSelection => ({ summonerId: null, summonerLevel: 1, monsters: [{ cardId, level: 1 }] });
    const log = new BattleEngine([attacker, reflexes], ['Standard'], 1, team(attacker.id), team(reflexes.id), undefined, { seed: 48 }).resolve();
    assert(log.events.some((event) => event.type === 'ATTACK' && event.actorName === attacker.name) && log.events.some((event) => event.type === 'MISS' && event.actorName === attacker.name), 'Reflexes makes the same attacker miss after its first successful hit that round');
  }

  // TEST 34: Echo repeats active healing abilities
  {
    const makeMonster = (id: string, name: string, abilities: CardDefinition['stats'][number]['abilities']): CardDefinition => ({
      id, name, splinter: 'Neutral', cardType: 'Monster', rarity: 'Common',
      stats: [{ level: 1, mana: 1, attack: 0, attackType: 'None', speed: 1, armor: 0, health: 20, abilities }],
    });
    const team = (...cardIds: string[]): TeamSelection => ({ summonerId: null, summonerLevel: 1, monsters: cardIds.map((cardId) => ({ cardId, level: 1 })) });
    const tank = makeMonster('test_echo_tank', 'Echo Tank', []);
    const echo = makeMonster('test_echo', 'Echo Triage', ['Echo', 'Triage']);
    const ally = makeMonster('test_echo_ally', 'Echo Ally', []);
    const inert = makeMonster('test_echo_inert', 'Inert', []);
    const log = new BattleEngine([tank, echo, ally, inert], ['Noxious Fumes'], 1, team(tank.id, echo.id, ally.id), team(inert.id), undefined, { seed: 49 }).resolve();
    assert(log.events.filter((event) => event.round === 2 && event.actorName === echo.name && event.ability === 'Triage').length === 2, 'Echo lets Triage heal twice in the same round');
  }

  // TEST 35: Bloodline Pact shares power and defeat damage
  {
    const makeMonster = (id: string, name: string, attack: number, attackType: CardDefinition['stats'][number]['attackType'], health: number, abilities: CardDefinition['stats'][number]['abilities'], bloodline: string): CardDefinition => ({
      id, name, splinter: 'Neutral', cardType: 'Monster', rarity: 'Common', bloodline,
      stats: [{ level: 1, mana: 1, attack, attackType, speed: 10, armor: 0, health, abilities }],
    });
    const team = (...cardIds: string[]): TeamSelection => ({ summonerId: null, summonerLevel: 1, monsters: cardIds.map((cardId) => ({ cardId, level: 1 })) });
    const pact = makeMonster('test_pact', 'Pact', 2, 'Melee', 20, ['Bloodline Pact'], 'A');
    const ally = makeMonster('test_pact_ally', 'Pact Ally', 1, 'Melee', 20, [], 'A');
    const victim = makeMonster('test_pact_victim', 'Pact Victim', 0, 'None', 1, [], 'B');
    const gainLog = new BattleEngine([pact, ally, victim], ['Standard'], 1, team(pact.id, ally.id), team(victim.id), undefined, { seed: 50 }).resolve();
    assert(gainLog.events.some((event) => event.ability === 'Bloodline Pact' && event.targetName === ally.name && event.boardSnapshot.team1[1].currentAttack === 2), 'Bloodline Pact grants shared power when a matching ally defeats an enemy');

    const fragile = makeMonster('test_pact_fragile', 'Fragile Ally', 0, 'None', 1, [], 'A');
    const pactSource = makeMonster('test_pact_source', 'Pact Source', 0, 'None', 20, ['Bloodline Pact'], 'A');
    const killer = makeMonster('test_pact_killer', 'Pact Killer', 2, 'Melee', 20, [], 'B');
    const lossLog = new BattleEngine([fragile, pactSource, killer], ['Standard'], 1, team(fragile.id, pactSource.id), team(killer.id), undefined, { seed: 51 }).resolve();
    assert(lossLog.events.some((event) => event.targetName === pactSource.name && event.text.includes('Bloodline Pact damage') && event.amount === 1), 'Bloodline Pact deals true damage to matching allies when one is defeated');

    const activePact = makeMonster('test_pact_active', 'Active Pact', 0, 'None', 20, ['Bloodline Pact'], 'A');
    const defeatedPact = makeMonster('test_pact_defeated', 'Defeated Pact', 0, 'None', 1, ['Bloodline Pact'], 'A');
    const sneakKiller = makeMonster('test_pact_sneak_killer', 'Pact Sneak Killer', 2, 'Melee', 20, ['Sneak'], 'B');
    const sourceLossLog = new BattleEngine([activePact, defeatedPact, sneakKiller], ['Standard'], 1, team(sneakKiller.id), team(activePact.id, defeatedPact.id), undefined, { seed: 52, maxRounds: 1 }).resolve();
    assert(sourceLossLog.events.some((event) => event.targetName === activePact.name && event.text.includes('Bloodline Pact damage') && event.amount === 2), 'A defeated Pact source makes matching allies lose accumulated power and take two damage');
  }

  // TEST 36: Volley triggers allied ranged attacks
  {
    const makeMonster = (id: string, name: string, attack: number, abilities: CardDefinition['stats'][number]['abilities']): CardDefinition => ({
      id, name, splinter: 'Neutral', cardType: 'Monster', rarity: 'Common',
      stats: [{ level: 1, mana: 1, attack, attackType: 'Ranged', speed: 10, armor: 0, health: 20, abilities }],
    });
    const volley = makeMonster('test_volley', 'Volley', 1, ['Volley of Arrows', 'Close Range']);
    const rangedAlly = makeMonster('test_volley_ally', 'Ranged Ally', 2, []);
    const target: CardDefinition = {
      ...volley, id: 'test_volley_target', name: 'Volley Target',
      stats: [{ ...volley.stats[0], attack: 0, attackType: 'None', abilities: [] }],
    };
    const team = (...cardIds: string[]): TeamSelection => ({ summonerId: null, summonerLevel: 1, monsters: cardIds.map((cardId) => ({ cardId, level: 1 })) });
    const log = new BattleEngine([volley, rangedAlly, target], ['Standard'], 1, team(volley.id, rangedAlly.id), team(target.id), undefined, { seed: 52 }).resolve();
    assert(log.events.some((event) => event.ability === 'Volley of Arrows' && event.actorName === rangedAlly.name && event.targetName === target.name), 'Volley causes allied ranged units to attack the same target regardless of position');
  }

  // TEST 37: Lookout reduces targeted and Ambush damage
  {
    const makeMonster = (id: string, name: string, attack: number, attackType: CardDefinition['stats'][number]['attackType'], health: number, abilities: CardDefinition['stats'][number]['abilities']): CardDefinition => ({
      id, name, splinter: 'Neutral', cardType: 'Monster', rarity: 'Common',
      stats: [{ level: 1, mana: 1, attack, attackType, speed: 10, armor: 0, health, abilities }],
    });
    const team = (...cardIds: string[]): TeamSelection => ({ summonerId: null, summonerLevel: 1, monsters: cardIds.map((cardId) => ({ cardId, level: 1 })) });
    const sneak = makeMonster('test_lookout_sneak', 'Sneak', 3, 'Melee', 20, ['Sneak']);
    const front = makeMonster('test_lookout_front', 'Front', 0, 'None', 20, []);
    const lookout = makeMonster('test_lookout', 'Lookout', 0, 'None', 20, ['Lookout']);
    const protectedAlly = makeMonster('test_lookout_ally', 'Protected Ally', 0, 'None', 20, []);
    const lookoutLog = new BattleEngine([sneak, front, lookout, protectedAlly], ['Standard'], 1, team(sneak.id), team(front.id, lookout.id, protectedAlly.id), undefined, { seed: 53 }).resolve();
    assert(lookoutLog.events.some((event) => event.type === 'ATTACK' && event.actorName === sneak.name && event.targetName === protectedAlly.name && event.amount === 2), 'Lookout reduces targeting-ability damage against adjacent allies by one');

    const ambusher = makeMonster('test_lookout_ambush', 'Ambusher', 4, 'Melee', 20, ['Ambush']);
    const ambushLog = new BattleEngine([ambusher, lookout], ['Standard'], 1, team(ambusher.id), team(lookout.id), undefined, { seed: 54 }).resolve();
    assert(ambushLog.events.some((event) => event.round === 0 && event.type === 'ATTACK' && event.actorName === ambusher.name && event.amount === 2), 'Lookout halves damage from enemy Ambush attacks');
  }

  // TEST 38: Shield and Void negate one-power attacks
  {
    const makeMonster = (id: string, name: string, attack: number, attackType: CardDefinition['stats'][number]['attackType'], abilities: CardDefinition['stats'][number]['abilities']): CardDefinition => ({
      id, name, splinter: 'Neutral', cardType: 'Monster', rarity: 'Common',
      stats: [{ level: 1, mana: 1, attack, attackType, speed: 10, armor: 0, health: 20, abilities }],
    });
    const team = (cardId: string): TeamSelection => ({ summonerId: null, summonerLevel: 1, monsters: [{ cardId, level: 1 }] });
    const melee = makeMonster('test_shield_attacker', 'One-Power Melee', 1, 'Melee', []);
    const shield = makeMonster('test_shield', 'Shield', 0, 'None', ['Shield']);
    const shieldLog = new BattleEngine([melee, shield], ['Standard'], 1, team(melee.id), team(shield.id), undefined, { seed: 55 }).resolve();
    assert(shieldLog.events.some((event) => event.type === 'DAMAGE' && event.targetName === shield.name && event.amount === 0), 'Shield negates a one-power physical attack');

    const magic = makeMonster('test_void_attacker', 'One-Power Magic', 1, 'Magic', []);
    const voidTarget = makeMonster('test_void', 'Void', 0, 'None', ['Void']);
    const voidLog = new BattleEngine([magic, voidTarget], ['Standard'], 1, team(magic.id), team(voidTarget.id), undefined, { seed: 56 }).resolve();
    assert(voidLog.events.some((event) => event.type === 'DAMAGE' && event.targetName === voidTarget.name && event.amount === 0), 'Void negates a one-power magic attack');

    const relentless = makeMonster('test_relentless_strike', 'Relentless Strike', 1, 'Melee', ['Relentless Strike']);
    const shielded = makeMonster('test_relentless_shield', 'Shielded', 0, 'None', ['Shield']);
    const relentlessLog = new BattleEngine([relentless, shielded], ['Standard'], 1, team(relentless.id), team(shielded.id), undefined, { seed: 59 }).resolve();
    assert(relentlessLog.events.some((event) => event.ability === 'Relentless Strike' && event.targetName === shielded.name && event.amount === 2), 'Relentless Strike bypasses Shield with one additional true damage');
  }

  // TEST 39: Shadow Focus activates from the last position
  {
    const makeMonster = (id: string, name: string, attack: number, attackType: CardDefinition['stats'][number]['attackType'], abilities: CardDefinition['stats'][number]['abilities']): CardDefinition => ({
      id, name, splinter: 'Neutral', cardType: 'Monster', rarity: 'Common',
      stats: [{ level: 1, mana: 1, attack, attackType, speed: 10, armor: 0, health: 20, abilities }],
    });
    const ally = makeMonster('test_shadow_ally', 'Shadow Ally', 1, 'Melee', []);
    const shadow = makeMonster('test_shadow_focus', 'Shadow Focus', 1, 'Melee', ['Shadow Focus']);
    const inert = makeMonster('test_shadow_inert', 'Inert', 0, 'None', []);
    const team: TeamSelection = { summonerId: null, summonerLevel: 1, monsters: [{ cardId: ally.id, level: 1 }, { cardId: shadow.id, level: 1 }] };
    const opponent: TeamSelection = { summonerId: null, summonerLevel: 1, monsters: [{ cardId: inert.id, level: 1 }] };
    const log = new BattleEngine([ally, shadow, inert], ['Standard'], 1, team, opponent, undefined, { seed: 57 }).resolve();
    const activation = log.events.find((event) => event.ability === 'Shadow Focus');
    assert(activation?.boardSnapshot.team1[1].abilities.includes('Camouflage') && activation.boardSnapshot.team1[1].attackType === 'None' && activation.boardSnapshot.team1[0].currentAttack === 2 && activation.boardSnapshot.team1[0].abilities.includes('Determined'), 'Shadow Focus hides its last-position unit and empowers the team');
  }

  // TEST 40: Bloodline Dominion grants linked abilities
  {
    const summoner: CardDefinition = {
      id: 'test_bloodline_dominion', name: 'Dominion Archon', splinter: 'Dragon', cardType: 'Summoner', rarity: 'Legendary',
      stats: [{ level: 1, mana: 0, attack: 0, attackType: 'None', speed: 0, armor: 0, health: 0, abilities: ['Bloodline Dominion'] }],
      bloodline: 'A',
      racialSynergy: [{ race: 'A', abilities: ['Flying'] }],
    };
    const ally: CardDefinition = {
      id: 'test_bloodline_dominion_ally', name: 'Bloodline Ally', splinter: 'Death', cardType: 'Monster', rarity: 'Common', bloodline: 'A',
      stats: [{ level: 1, mana: 1, attack: 0, attackType: 'None', speed: 1, armor: 0, health: 20, abilities: [] }],
    };
    const enemy: CardDefinition = { ...ally, id: 'test_bloodline_dominion_enemy', name: 'Enemy', bloodline: 'B' };
    const team = (summonerId: string | null, cardId: string): TeamSelection => ({ summonerId, summonerLevel: 1, monsters: [{ cardId, level: 1 }] });
    const log = new BattleEngine([summoner, ally, enemy], ['Standard'], 1, team(summoner.id, ally.id), team(null, enemy.id), undefined, { seed: 58 }).resolve();
    assert(log.events.some((event) => event.ability === 'Bloodline Dominion' && event.targetName === ally.name && event.boardSnapshot.team1[0].abilities.includes('Flying')), 'Bloodline Dominion grants its linked ability to matching bloodline units');
  }

  // TEST 41: Reprisal marks heavy attackers
  {
    const attacker: CardDefinition = {
      id: 'test_reprisal_attacker', name: 'Heavy Camouflaged Attacker', splinter: 'Neutral', cardType: 'Monster', rarity: 'Common',
      stats: [{ level: 1, mana: 1, attack: 6, attackType: 'Melee', speed: 10, armor: 0, health: 20, abilities: ['Camouflage'] }],
    };
    const reprisal: CardDefinition = {
      ...attacker, id: 'test_reprisal', name: 'Reprisal',
      stats: [{ ...attacker.stats[0], attack: 0, attackType: 'None', speed: 1, health: 30, abilities: ['Reprisal'] }],
    };
    const team = (cardId: string): TeamSelection => ({ summonerId: null, summonerLevel: 1, monsters: [{ cardId, level: 1 }] });
    const log = new BattleEngine([attacker, reprisal], ['Standard'], 1, team(attacker.id), team(reprisal.id), undefined, { seed: 60 }).resolve();
    const trigger = log.events.find((event) => event.ability === 'Reprisal');
    const markedAttacker = trigger?.boardSnapshot.team1[0];
    assert(markedAttacker?.abilities.includes('Taunt') && markedAttacker.isRevealed, 'Reprisal grants Taunt and reveals a Camouflaged attacker after more than five damage');
  }

  // TEST 42: Summoner options apply to selected units
  {
    const summoner: CardDefinition = {
      id: 'test_option_summoner', name: 'Option Summoner', splinter: 'Life', cardType: 'Summoner', rarity: 'Common',
      stats: [{ level: 1, mana: 1, attack: 0, attackType: 'None', speed: 0, armor: 0, health: 0, abilities: [] }],
      summonerOptions: [{ id: 'test_option_flying', name: 'Grant Flying', statBuff: [2, 0, 0, 0, 0, 0], abilities: ['Flying'], target: 'team_or_opponent', targetType: 'unit', max: 1 }],
    };
    const monster: CardDefinition = {
      id: 'test_option_monster', name: 'Option Monster', splinter: 'Life', cardType: 'Monster', rarity: 'Common',
      stats: [{ level: 1, mana: 1, attack: 1, attackType: 'Melee', speed: 1, armor: 0, health: 20, abilities: [] }],
    };
    const enemy: CardDefinition = { ...monster, id: 'test_option_enemy', name: 'Option Enemy' };
    const team: TeamSelection = {
      summonerId: summoner.id,
      summonerLevel: 1,
      summonerOptionId: 'test_option_flying',
      summonerOptionTargets: [`1:${monster.id}`, `1:${monster.id}_second`],
      monsters: [{ cardId: monster.id, level: 1 }, { cardId: `${monster.id}_second`, level: 1 }],
    };
    const second: CardDefinition = { ...monster, id: `${monster.id}_second`, name: 'Unselected Monster' };
    const opponent: TeamSelection = { summonerId: null, summonerLevel: 1, monsters: [{ cardId: enemy.id, level: 1 }] };
    const log = new BattleEngine([summoner, monster, second, enemy], ['Standard'], 1, team, opponent, undefined, { seed: 61 }).resolve();
    const optionEvent = log.events.find((event) => event.ability === 'Grant Flying' && event.targetName === monster.name);
    assert(optionEvent?.boardSnapshot.team1[0].abilities.includes('Flying') && optionEvent.boardSnapshot.team1[0].currentAttack === 3
      && !optionEvent.boardSnapshot.team1[1].abilities.includes('Flying') && optionEvent.boardSnapshot.team1[1].currentAttack === 1,
    'Summoner option stats and abilities apply only to selected units and respect the target limit');
  }

  // TEST 43: Exhausted units cannot Retaliate
  {
    const attacker: CardDefinition = {
      id: 'test_exhausted_retaliate_attacker', name: 'Attacker', splinter: 'Neutral', cardType: 'Monster', rarity: 'Common',
      stats: [{ level: 1, mana: 1, attack: 2, attackType: 'Melee', speed: 10, armor: 0, health: 20, abilities: [] }],
    };
    const defender: CardDefinition = {
      ...attacker, id: 'test_exhausted_retaliate_defender', name: 'Weary Retaliator',
      stats: [{ ...attacker.stats[0], attack: 1, speed: 1, abilities: ['Weary', 'Retaliate'] }],
    };
    const team = (cardId: string): TeamSelection => ({ summonerId: null, summonerLevel: 1, monsters: [{ cardId, level: 1 }] });
    const log = new BattleEngine([attacker, defender], ['Standard'], 1, team(attacker.id), team(defender.id), undefined, { seed: 11, maxRounds: 1 }).resolve();
    assert(log.events.some((event) => event.ability === 'Weary') && !log.events.some((event) => event.type === 'RETALIATE'), 'An Exhausted unit skips its turn and cannot Retaliate');
  }

  // TEST 44: Stray Shot hits a random friendly unit
  {
    const makeMonster = (id: string, name: string, attack: number, attackType: CardDefinition['stats'][number]['attackType'], health: number, abilities: CardDefinition['stats'][number]['abilities']): CardDefinition => ({
      id, name, splinter: 'Neutral', cardType: 'Monster', rarity: 'Common',
      stats: [{ level: 1, mana: 1, attack, attackType, speed: 10, armor: 0, health, abilities }],
    });
    const stray = makeMonster('test_stray_shot', 'Stray Shot', 1, 'Melee', 20, ['Stray Shot', 'True Strike']);
    const allyOne = makeMonster('test_stray_ally_one', 'Friendly One', 0, 'None', 20, []);
    const allyTwo = makeMonster('test_stray_ally_two', 'Friendly Two', 0, 'None', 20, []);
    const enemy = makeMonster('test_stray_enemy', 'Enemy', 0, 'None', 20, []);
    const team = (...cardIds: string[]): TeamSelection => ({ summonerId: null, summonerLevel: 1, monsters: cardIds.map((cardId) => ({ cardId, level: 1 })) });
    const log = new BattleEngine([stray, allyOne, allyTwo, enemy], ['Standard'], 1, team(stray.id, allyOne.id, allyTwo.id), team(enemy.id), undefined, { seed: 62, maxRounds: 1 }).resolve();
    const strayAttack = log.events.find((event) => event.ability === 'Stray Shot' && event.actorName === stray.name);
    assert((strayAttack?.targetName === allyOne.name || strayAttack?.targetName === allyTwo.name) && !log.events.some((event) => event.type === 'ATTACK' && event.actorName === stray.name && event.targetName === enemy.name), 'Stray Shot redirects the attack to a random living friendly unit');
    const soloLog = new BattleEngine([stray, enemy], ['Standard'], 1, team(stray.id), team(enemy.id), undefined, { seed: 63, maxRounds: 1 }).resolve();
    assert(!soloLog.events.some((event) => event.type === 'ATTACK' && event.actorName === stray.name), 'Stray Shot does not fall back to attacking an enemy when alone');
  }

  // TEST 45: Healing abilities round down without a minimum
  {
    const makeMonster = (id: string, name: string, abilities: CardDefinition['stats'][number]['abilities']): CardDefinition => ({
      id, name, splinter: 'Neutral', cardType: 'Monster', rarity: 'Common',
      stats: [{ level: 1, mana: 1, attack: 0, attackType: 'None', speed: 1, armor: 0, health: 5, abilities }],
    });
    const team = (...cardIds: string[]): TeamSelection => ({ summonerId: null, summonerLevel: 1, monsters: cardIds.map((cardId) => ({ cardId, level: 1 })) });
    const healer = makeMonster('test_floor_heal', 'Heal', ['Heal']);
    const tankHealer = makeMonster('test_floor_tank_heal', 'Tank Heal', ['Tank Heal']);
    const triage = makeMonster('test_floor_triage', 'Triage', ['Triage']);
    const tank = makeMonster('test_floor_tank', 'Tank', []);
    const patient = makeMonster('test_floor_patient', 'Patient', []);
    const attacker: CardDefinition = {
      id: 'test_floor_attacker', name: 'Guaranteed Attacker', splinter: 'Neutral', cardType: 'Monster', rarity: 'Common',
      stats: [{ level: 1, mana: 1, attack: 2, attackType: 'Melee', speed: 10, armor: 0, health: 20, abilities: ['True Strike'] }],
    };
    const sneakAttacker: CardDefinition = { ...attacker, id: 'test_floor_sneak_attacker', stats: [{ ...attacker.stats[0], abilities: ['True Strike', 'Sneak'] }] };

    const healLog = new BattleEngine([healer, attacker], ['Standard'], 1, team(healer.id), team(attacker.id), undefined, { seed: 64, maxRounds: 2 }).resolve();
    assert(healLog.events.some((event) => event.round === 2 && event.actorName === healer.name && event.ability === 'Heal' && event.amount === 1), 'Heal restores one-third max health rounded down');

    const tankHealLog = new BattleEngine([tankHealer, attacker], ['Standard'], 1, team(tankHealer.id), team(attacker.id), undefined, { seed: 65, maxRounds: 2 }).resolve();
    assert(tankHealLog.events.some((event) => event.round === 2 && event.actorName === tankHealer.name && event.ability === 'Tank Heal' && event.amount === 1), 'Tank Heal restores one-third max health rounded down');

    const triageLog = new BattleEngine([tank, triage, patient, sneakAttacker], ['Standard'], 1, team(tank.id, triage.id, patient.id), team(sneakAttacker.id), undefined, { seed: 66, maxRounds: 2 }).resolve();
    assert(triageLog.events.some((event) => event.round === 2 && event.actorName === triage.name && event.ability === 'Triage' && event.amount === 1), 'Triage restores one-third max health rounded down');
  }

  // TEST 46: Life Leech rounds half damage up
  {
    const leech: CardDefinition = {
      id: 'test_life_leech_rounding', name: 'Life Leech', splinter: 'Death', cardType: 'Monster', rarity: 'Common',
      stats: [{ level: 1, mana: 1, attack: 3, attackType: 'Melee', speed: 10, armor: 0, health: 10, abilities: ['Life Leech'] }],
    };
    const target: CardDefinition = {
      ...leech, id: 'test_life_leech_target', name: 'Leech Target',
      stats: [{ ...leech.stats[0], attack: 0, attackType: 'None', speed: 1, health: 20, abilities: [] }],
    };
    const team = (cardId: string): TeamSelection => ({ summonerId: null, summonerLevel: 1, monsters: [{ cardId, level: 1 }] });
    const log = new BattleEngine([leech, target], ['Standard'], 1, team(leech.id), team(target.id), undefined, { seed: 67, maxRounds: 1 }).resolve();
    assert(log.events.some((event) => event.ability === 'Life Leech' && event.amount === 2 && event.boardSnapshot.team1[0].maxHealth === 12), 'Life Leech gains half of odd health damage rounded up');
  }

  // TEST 47: Oppress recognizes Weapons Trained units as native no-attack targets
  {
    const oppressor: CardDefinition = {
      id: 'test_oppress', name: 'Oppress', splinter: 'Neutral', cardType: 'Monster', rarity: 'Common',
      stats: [{ level: 1, mana: 1, attack: 2, attackType: 'Melee', speed: 10, armor: 0, health: 20, abilities: ['Oppress'] }],
    };
    const trainee: CardDefinition = {
      ...oppressor, id: 'test_oppress_trainee', name: 'Trained No-Attack Unit',
      stats: [{ ...oppressor.stats[0], attack: 0, attackType: 'None', speed: 1, abilities: [] }],
    };
    const trainer: CardDefinition = {
      ...oppressor, id: 'test_oppress_trainer', name: 'Weapons Trainer',
      stats: [{ ...oppressor.stats[0], attack: 1, abilities: ['Weapons Training'] }],
    };
    const team = (...cardIds: string[]): TeamSelection => ({ summonerId: null, summonerLevel: 1, monsters: cardIds.map((cardId) => ({ cardId, level: 1 })) });
    const log = new BattleEngine([oppressor, trainee, trainer], ['Standard'], 1, team(oppressor.id), team(trainee.id, trainer.id), undefined, { seed: 68, maxRounds: 1 }).resolve();
    assert(log.events.some((event) => event.type === 'ATTACK' && event.actorName === oppressor.name && event.targetName === trainee.name && event.amount === 4), 'Oppress doubles damage against a no-attack unit after Weapons Training');
  }

  // TEST 48: Round-start reveal removes Empower before attacks
  {
    const empowerSource: CardDefinition = {
      id: 'test_round_empower', name: 'Empower Source', splinter: 'Neutral', cardType: 'Monster', rarity: 'Common',
      stats: [{ level: 1, mana: 1, attack: 0, attackType: 'None', speed: 1, armor: 0, health: 20, abilities: ['Empower', 'Camouflage'] }],
    };
    const ally: CardDefinition = {
      ...empowerSource, id: 'test_round_empower_ally', name: 'Empowered Ranged',
      stats: [{ ...empowerSource.stats[0], attack: 1, attackType: 'Ranged', speed: 10, abilities: [] }],
    };
    const revealer: CardDefinition = {
      ...empowerSource, id: 'test_round_revealer', name: 'Round Revealer', splinter: 'Life',
      stats: [{ ...empowerSource.stats[0], abilities: ['Reveal'] }],
    };
    const team = (...cardIds: string[]): TeamSelection => ({ summonerId: null, summonerLevel: 1, monsters: cardIds.map((cardId) => ({ cardId, level: 1 })) });
    const log = new BattleEngine([empowerSource, ally, revealer], ['Standard'], 1, team(empowerSource.id, ally.id), team(revealer.id), undefined, { seed: 69, maxRounds: 1 }).resolve();
    assert(log.events.some((event) => event.type === 'ATTACK' && event.actorName === ally.name && event.amount === 1), 'Reveal removes a Camouflaged Empower source aura before allied attacks');
  }

  // TEST 49: Last Stand activates immediately after an ally falls
  {
    const makeMonster = (id: string, name: string, attack: number, attackType: CardDefinition['stats'][number]['attackType'], speed: number, health: number, abilities: CardDefinition['stats'][number]['abilities']): CardDefinition => ({
      id, name, splinter: 'Neutral', cardType: 'Monster', rarity: 'Common',
      stats: [{ level: 1, mana: 1, attack, attackType, speed, armor: 0, health, abilities }],
    });
    const fragile = makeMonster('test_last_stand_fragile', 'Fragile Front', 0, 'Ranged', 1, 1, []);
    const lastStand = makeMonster('test_last_stand', 'Last Stand', 2, 'Ranged', 1, 20, ['Last Stand', 'Close Range', 'True Strike']);
    const enemy = makeMonster('test_last_stand_enemy', 'Enemy', 2, 'Melee', 10, 20, ['True Strike']);
    const team = (...cardIds: string[]): TeamSelection => ({ summonerId: null, summonerLevel: 1, monsters: cardIds.map((cardId) => ({ cardId, level: 1 })) });
    const log = new BattleEngine([fragile, lastStand, enemy], ['Standard'], 1, team(fragile.id, lastStand.id), team(enemy.id), undefined, { seed: 70, maxRounds: 1 }).resolve();
    const lastStandAttack = log.events.find((event) => event.type === 'ATTACK' && event.actorName === lastStand.name);
    assert(lastStandAttack?.amount === 3, 'Last Stand boosts the survivor attack immediately when its ally is defeated');
  }

  // TEST 50: Aura cleanup preserves zero health on defeated units
  {
    const makeMonster = (id: string, name: string, attack: number, attackType: CardDefinition['stats'][number]['attackType'], health: number, abilities: CardDefinition['stats'][number]['abilities']): CardDefinition => ({
      id, name, splinter: 'Neutral', cardType: 'Monster', rarity: 'Common',
      stats: [{ level: 1, mana: 1, attack, attackType, speed: 10, armor: 0, health, abilities }],
    });
    const killer = makeMonster('test_aura_death_killer', 'Aura Killer', 2, 'Melee', 20, []);
    const weaken = makeMonster('test_aura_death_weaken', 'Weaken', 0, 'None', 20, ['Weaken']);
    const victim = makeMonster('test_aura_death_victim', 'Weakened Victim', 0, 'None', 2, []);
    const survivor = makeMonster('test_aura_death_survivor', 'Survivor', 0, 'None', 20, []);
    const team = (...cardIds: string[]): TeamSelection => ({ summonerId: null, summonerLevel: 1, monsters: cardIds.map((cardId) => ({ cardId, level: 1 })) });
    const log = new BattleEngine([killer, weaken, victim, survivor], ['Standard'], 1, team(killer.id, weaken.id), team(victim.id, survivor.id), undefined, { seed: 71, maxRounds: 1 }).resolve();
    const battleEnd = log.events.find((event) => event.type === 'BATTLE_END');
    assert(battleEnd?.boardSnapshot.team2[0].isAlive === false && battleEnd.boardSnapshot.team2[0].currentHealth === 0, 'Clearing the Weaken aura never restores health to a defeated unit');
  }

  // TEST 51: Blasphemy of Uul permanently gains ranged power
  {
    const construct: CardDefinition = {
      id: 'test_divine_construct', name: 'Divine Construct', splinter: 'Neutral', cardType: 'Monster', rarity: 'Common', bloodline: 'Divine Construct',
      stats: [{ level: 1, mana: 1, attack: 0, attackType: 'None', speed: 1, armor: 0, health: 20, abilities: [] }],
    };
    const blasphemer: CardDefinition = {
      ...construct, id: 'test_blasphemy', name: 'Blasphemy', bloodline: 'Other',
      stats: [{ ...construct.stats[0], attack: 1, attackType: 'Ranged', abilities: ['Blasphemy of Uul'] }],
    };
    const enemy: CardDefinition = { ...construct, id: 'test_blasphemy_enemy', name: 'Enemy', bloodline: 'Other' };
    const team = (...cardIds: string[]): TeamSelection => ({ summonerId: null, summonerLevel: 1, monsters: cardIds.map((cardId) => ({ cardId, level: 1 })) });
    const log = new BattleEngine([construct, blasphemer, enemy], ['Standard'], 1, team(construct.id, blasphemer.id), team(enemy.id), undefined, { seed: 72, maxRounds: 1 }).resolve();
    assert(log.events.some((event) => event.ability === 'Blasphemy of Uul' && event.amount === 1)
      && log.events.some((event) => event.type === 'ATTACK' && event.actorName === blasphemer.name && event.amount === 2), 'Blasphemy of Uul permanently gains one ranged power per allied Divine Construct');
  }

  console.log(`\nResults: ${passed} Passed, ${failed} Failed\n`);
}

runTests();
