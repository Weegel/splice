import { PvEChallenge } from '../types/battle';
import { FORESTWALK_CHALLENGES } from './defaultForestwalk';

export const DEFAULT_CHALLENGES: PvEChallenge[] = [
  {
    id: 'pve_challenge_1',
    name: 'Goblin Ambush in the Caverns',
    description: 'A clan of rogue goblins has blocked the mining path! Defeat their sneak team with a solid rear defense.',
    difficulty: 'Novice',
    manaCap: 16,
    rulesets: ['Standard'],
    allowedSplinters: ['Fire', 'Water', 'Earth', 'Life', 'Death', 'Dragon', 'Neutral'],
    lore: 'Goblin miners and thieves strike fast from the shadows. Protect your backline!',
    enemyTeam: {
      summonerId: 'sum_fire_pyre',
      summonerLevel: 1,
      monsters: [
        { cardId: 'mon_fire_cerberus', level: 1 },
        { cardId: 'mon_fire_kobold_miner', level: 1 },
        { cardId: 'mon_fire_serpentine_spy', level: 1 },
      ],
    },
  },
  {
    id: 'pve_challenge_2',
    name: 'Tremors of the Molten Core',
    description: 'The volcanic ground is shaking violently! Bring flying units or high health tanks to endure the earthquake.',
    difficulty: 'Bronze',
    manaCap: 22,
    rulesets: ['Earthquake', 'Armored Up'],
    allowedSplinters: ['Fire', 'Water', 'Earth', 'Life', 'Death', 'Dragon', 'Neutral'],
    lore: 'Continuous shocks deal 2 damage each round to non-flying monsters. Armor provides a temporary buffer.',
    enemyTeam: {
      summonerId: 'sum_fire_malric',
      summonerLevel: 1,
      monsters: [
        { cardId: 'mon_fire_living_lava', level: 1 },
        { cardId: 'mon_fire_fire_elemental', level: 2 },
        { cardId: 'mon_neutral_mantoid', level: 1 },
      ],
    },
  },
  {
    id: 'pve_challenge_3',
    name: 'Abyssal Siren Song',
    description: 'Alric Butterfrost leads a squad of high-speed water spellcasters. Counter their magic barrage or silence them!',
    difficulty: 'Silver',
    manaCap: 25,
    rulesets: ['Super Sneak'],
    allowedSplinters: ['Fire', 'Water', 'Earth', 'Life', 'Death', 'Dragon', 'Neutral'],
    lore: 'Magic bypasses armor directly. Void monsters like Unicorn Mustang can turn the tide.',
    enemyTeam: {
      summonerId: 'sum_water_alric',
      summonerLevel: 1,
      monsters: [
        { cardId: 'mon_water_sea_monster', level: 1 },
        { cardId: 'mon_water_medusa', level: 1 },
        { cardId: 'mon_water_ice_pixie', level: 1 },
        { cardId: 'mon_water_crustacean_king', level: 1 },
      ],
    },
  },
  {
    id: 'pve_challenge_4',
    name: 'Crypt of Noxious Fumes',
    description: 'Poison fills the dungeon air. All units lose 2 health each turn. Healing and high health are paramount.',
    difficulty: 'Gold',
    manaCap: 28,
    rulesets: ['Noxious Fumes', 'Reverse Speed'],
    allowedSplinters: ['Fire', 'Water', 'Earth', 'Life', 'Death', 'Dragon', 'Neutral'],
    lore: 'Slow creatures strike first in Reverse Speed. Self-healing units survive the deadly miasma.',
    enemyTeam: {
      summonerId: 'sum_death_thaddius',
      summonerLevel: 1,
      monsters: [
        { cardId: 'mon_death_haunted_spirit', level: 1 },
        { cardId: 'mon_death_cursed_windeku', level: 1 },
        { cardId: 'mon_death_undead_priest', level: 1 },
        { cardId: 'mon_death_twisted_jester', level: 1 },
      ],
    },
  },
  {
    id: 'pve_challenge_boss_vulcan',
    name: 'Boss Trial: Vulcan, The Molten Sovereign',
    description: 'Face the mighty legendary Fire Sovereign in an explosive volcanic arena! Only the smartest tacticians will prevail.',
    difficulty: 'Boss',
    manaCap: 38,
    rulesets: ['Explosive Weaponry', 'Equalizer'],
    allowedSplinters: ['Fire', 'Water', 'Earth', 'Life', 'Death', 'Dragon', 'Neutral'],
    lore: 'Vulcan possesses massive health, shields, thorns, and tramples any fallen foe with blast damage!',
    enemyTeam: {
      summonerId: 'sum_fire_malric',
      summonerLevel: 1,
      monsters: [
        { cardId: 'boss_vulcan_the_destroyer', level: 1 },
        { cardId: 'mon_fire_cerberus', level: 2 },
        { cardId: 'mon_fire_fire_elemental', level: 2 },
        { cardId: 'mon_neutral_creeping_ooze', level: 1 },
      ],
    },
  },
  {
    id: 'pve_challenge_boss_archlich',
    name: 'Boss Trial: Archlich Malgathor',
    description: 'In the deep necropolis, Malgathor resurrects fallen minions and drains life from your frontliners.',
    difficulty: 'Boss',
    manaCap: 42,
    rulesets: ['Holy Protection', 'Target Practice'],
    allowedSplinters: ['Fire', 'Water', 'Earth', 'Life', 'Death', 'Dragon', 'Neutral'],
    lore: 'Malgathor has Void Armor and Life Leech. Defeat his escort and breach his defensive wards.',
    enemyTeam: {
      summonerId: 'sum_death_zintar',
      summonerLevel: 1,
      monsters: [
        { cardId: 'mon_death_haunted_spirit', level: 2 },
        { cardId: 'boss_archlich_malgathor', level: 1 },
        { cardId: 'mon_death_skeleton_assassin', level: 2 },
        { cardId: 'mon_neutral_sand_worm', level: 1 },
      ],
    },
  },
];

DEFAULT_CHALLENGES.push(...FORESTWALK_CHALLENGES);
