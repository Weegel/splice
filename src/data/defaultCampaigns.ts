import { CampaignDefinition } from '../types/campaign';
import { FORESTWALK_CAMPAIGN } from './defaultForestwalk';

export const DEFAULT_CAMPAIGNS: CampaignDefinition[] = [
  {
    id: 'campaign_siege_of_vulcan',
    name: 'The Molten Awakening: Wrath of Vulcan',
    description: 'A dark seismic disturbance shakes the Burning Lands. Assemble your team, investigate the caverns, navigate treacherous magma chambers, and confront Vulcan, The Molten Sovereign!',
    difficulty: 'Gold',
    coverImage: 'https://images.unsplash.com/photo-1579783900882-c0d3dad7b119?w=600&auto=format&fit=crop&q=80',
    author: 'Splinterlands Lorekeeper',
    startNodeId: 'node_intro',
    nodes: {
      // 1. Text Node: Prelude
      'node_intro': {
        id: 'node_intro',
        type: 'text',
        title: 'Prelude: The Shivering Volcano',
        speakerName: 'Elder Archmage Pyre',
        speakerAvatarUrl: 'https://images.unsplash.com/photo-1534447677768-be436bb09401?w=120&auto=format&fit=crop&q=80',
        content: 'Greetings, summoner! The crust beneath the Smoldering Forest is fracturing. Rumors say that Vulcan, The Molten Sovereign, has awakened from centuries of slumber. If his magma horde breaches the surface, all Splinter realms will burn. We need your army to venture into the volcanic heart.',
        buttonText: 'March to the Volcano Foothills',
        nextNodeId: 'node_crossroads',
      },

      // 2. Decision Node: Foothill Crossroads
      'node_crossroads': {
        id: 'node_crossroads',
        type: 'decision',
        title: 'Decision: The Split Pass',
        prompt: 'You arrive at the edge of the jagged volcanic ridge. Two paths lead into the subterranean caldera. How will your army proceed?',
        choices: [
          {
            id: 'choice_stealth',
            text: 'Descend through the Shaded Crystal Caverns',
            description: 'A subterranean labyrinth that bypasses open lava, though goblin bandits are known to nest in the tunnels.',
            consequenceSummary: 'Triggers Goblin Ambush with standard rules.',
            nextNodeId: 'node_battle_goblin',
          },
          {
            id: 'choice_crater',
            text: 'March directly up the Molten Ridge',
            description: 'Brazenly climb the active magma tubes. The tremors are intense, but it is a direct approach.',
            consequenceSummary: 'Triggers Earthquake hazard battle on the fiery slopes.',
            nextNodeId: 'node_battle_earthquake',
          },
        ],
      },

      // 3. Battle Node: Goblin Caverns
      'node_battle_goblin': {
        id: 'node_battle_goblin',
        type: 'battle',
        title: 'Battle: Goblin Tunnel Vanguard',
        description: 'As you enter the narrow tunnels, a screech echoes from the darkness! A goblin ambush squad lunges at your flanks.',
        challengeId: 'pve_challenge_1', // Goblin Ambush
        onVictoryNodeId: 'node_after_goblin_win',
        onDefeatNodeId: 'node_goblin_defeat',
        victoryNarrative: 'The goblin raiders scatter into the dark! You discover a cache of defensive crystals and an ancient map.',
        defeatNarrative: 'Overwhelmed by rear attacks, your vanguard takes heavy losses and is forced back.',
      },

      // 4. Battle Node: Magma Ridge Earthquake
      'node_battle_earthquake': {
        id: 'node_battle_earthquake',
        type: 'battle',
        title: 'Battle: Tremors on the Caldera Slope',
        description: 'The earth shakes violently beneath your feet as magma elementals rise from the fissures! Non-flying creatures will struggle.',
        challengeId: 'pve_challenge_2', // Tremors of the Molten Core
        onVictoryNodeId: 'node_after_earthquake_win',
        onDefeatNodeId: 'node_earthquake_defeat',
        victoryNarrative: 'Your aerial forces and armored champions shatter the molten elementals, clearing the summit gateway!',
        defeatNarrative: 'The tectonic shockwaves tear through your ranks, forcing an emergency retreat.',
      },

      // 5. Text Node: Post-Goblin Path
      'node_after_goblin_win': {
        id: 'node_after_goblin_win',
        type: 'text',
        title: 'Discovery in the Underhalls',
        speakerName: 'Scout Serpentine',
        content: 'With the goblins defeated, you discover an ancient sanctum. The maps reveal a hidden thermal valve that can vent some of Vulcan’s molten armor before the final clash!',
        buttonText: 'Proceed to the Sovereign Chamber Door',
        nextNodeId: 'node_sanctum_decision',
      },

      // 6. Text Node: Post-Earthquake Path
      'node_after_earthquake_win': {
        id: 'node_after_earthquake_win',
        type: 'text',
        title: 'Summit Breach',
        speakerName: 'Flame Berserker',
        content: 'Having endured the tremors, your army stands before the colossal Obsidian Gate leading directly to Vulcan’s throne. The heat radiating through the iron doors is scorching.',
        buttonText: 'Prepare to Breach the Gate',
        nextNodeId: 'node_sanctum_decision',
      },

      // 7. Decision Node: Pre-Boss Preparation
      'node_sanctum_decision': {
        id: 'node_sanctum_decision',
        type: 'decision',
        title: 'Decision: The Obsidian Throne Approach',
        prompt: 'You stand at the precipice of Vulcan’s core chamber. How will you organize your battle formation for the ultimate confrontation?',
        choices: [
          {
            id: 'choice_water_shield',
            text: 'Infuse your army with Protective Wards',
            description: 'Focus on defensive shielding and endurance to withstand Vulcan’s lethal explosive attacks.',
            consequenceSummary: 'Face Boss Vulcan with strategic preparedness.',
            nextNodeId: 'node_boss_vulcan',
          },
          {
            id: 'choice_rush_attack',
            text: 'Launch an Immediate All-Out Assault',
            description: 'Storm the chamber before Vulcan can fully channel the core’s lava flows.',
            consequenceSummary: 'Direct decisive clash against Vulcan.',
            nextNodeId: 'node_boss_vulcan',
          },
        ],
      },

      // 8. Battle Node: Boss Vulcan
      'node_boss_vulcan': {
        id: 'node_boss_vulcan',
        type: 'battle',
        title: 'Boss Battle: Vulcan, The Molten Sovereign',
        description: 'The ground erupts in a fountain of fire! Vulcan rises in his full apocalyptic glory, wielding blast strikes and impenetrable shields. Defeat the Titan to save the Splinters!',
        challengeId: 'pve_challenge_boss_vulcan',
        onVictoryNodeId: 'node_campaign_victory',
        onDefeatNodeId: 'node_boss_defeat',
        rewardCardId: 'boss_vulcan_the_destroyer',
      },

      // 9. End Node: Victory
      'node_campaign_victory': {
        id: 'node_campaign_victory',
        type: 'end',
        title: 'Legendary Triumph: The Molten Core Quenched',
        outcome: 'victory',
        message: 'With a final resounding strike, Vulcan crumbles into hardened cooling obsidian. The seismic rifts seal shut, and the skies of the Burning Lands clear. Bards across Praetoria will sing of your legendary valor for ages!',
        rewardSummary: 'Campaign Completed! You have unlocked Vulcan, The Molten Sovereign for your Custom Card Forge!',
      },

      // 10. End Node: Defeat variants
      'node_goblin_defeat': {
        id: 'node_goblin_defeat',
        type: 'end',
        title: 'Ambushed in the Dark',
        outcome: 'defeat',
        message: 'Your party was overpowered in the cramped goblin tunnels. You were forced to evacuate without reaching the volcano core. Regroup your monsters and try again!',
      },
      'node_earthquake_defeat': {
        id: 'node_earthquake_defeat',
        type: 'end',
        title: 'Swallowed by the Earth',
        outcome: 'defeat',
        message: 'The caldera earthquake split the ground beneath your vanguard. Take flying creatures or fortified shields next time.',
      },
      'node_boss_defeat': {
        id: 'node_boss_defeat',
        type: 'end',
        title: 'Incinerated by the Molten Sovereign',
        outcome: 'defeat',
        message: 'Vulcan’s blast fury proved too immense for your front line. Hone your deck synergy, adjust your levels, and challenge the Titan once more!',
      },
    },
  },
];

DEFAULT_CAMPAIGNS.push(FORESTWALK_CAMPAIGN);
