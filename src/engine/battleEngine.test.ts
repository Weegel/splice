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

  // TEST 7: Poison ticks after monster turns at round end
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
    const firstPoisonIndex = roundOneEvents.findIndex((event) => event.type === 'POISON_TICK');
    const lastAttackIndex = roundOneEvents.reduce((last, event, index) => event.type === 'ATTACK' ? index : last, -1);
    const roundEndIndex = roundOneEvents.findIndex((event) => event.type === 'ROUND_END');
    assert(lastAttackIndex >= 0 && lastAttackIndex < firstPoisonIndex && firstPoisonIndex < roundEndIndex, 'Noxious Fumes Poison ticks after attacks at round end');
  }

  console.log(`\nResults: ${passed} Passed, ${failed} Failed\n`);
}

runTests();
