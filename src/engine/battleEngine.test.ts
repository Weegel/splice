import { BattleEngine } from './battleEngine';
import { DEFAULT_CARDS } from '../data/defaultCards';
import { TeamSelection } from '../types/battle';

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

    const engine = new BattleEngine(DEFAULT_CARDS, ['Standard'], 20, team1, team2);
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

    const engine = new BattleEngine(DEFAULT_CARDS, ['Equalizer'], 20, team1, team2);
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

    const engine = new BattleEngine(DEFAULT_CARDS, ['Earthquake'], 20, team1, team2);
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

    const engine = new BattleEngine(DEFAULT_CARDS, ['Explosive Weaponry'], 40, team1, team2);
    const log = engine.resolve();

    const blastEvents = log.events.filter((e) => e.type === 'BLAST_DAMAGE');
    assert(blastEvents.length > 0, 'Explosive Weaponry generates Blast damage on adjacent targets');
  }

  console.log(`\nResults: ${passed} Passed, ${failed} Failed\n`);
}

runTests();
