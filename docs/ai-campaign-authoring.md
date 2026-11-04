# AI Campaign Authoring Instructions

Use this document as context when creating or editing campaigns for Splinterlands PvE Studio. Generate data the application can import and play, not a fictional schema. Unless the user requests something else, return one complete campaign JSON object with no Markdown fences, comments, or trailing commas.

## Generation Rules

1. Use the exact field names, node types, effect types, and enum values described here.
2. Create a unique campaign `id` and unique IDs for nodes, choices, offers, effects, actions, items, and unlocks. Keep IDs stable when revising an existing campaign.
3. Make every node map key equal that node's `id`. Make `startNodeId` point to an existing node.
4. Check every node destination, challenge ID, card ID, unlock ID, action ID, and item reference. Do not leave placeholder or dangling references.
5. Use at least one reachable `end` node. Link story, choice, hub, shop, and battle outcomes deliberately; do not rely on an unlinked node to become playable.
6. Use `collectionSource: "custom"` when the campaign should not require a synced Splinterlands account. Include cards in `embeddedCards` when the campaign needs custom cards that may not exist in the receiving installation.
7. Use `collectionSource: "player"` only when the story is intended to use the active profile's synced collection. It is the application's default when the field is omitted.
8. Prefer a `battle` node with a valid `inlineChallenge` or a valid referenced `challengeId`. Do not invent a challenge ID and assume the app will fetch it.
9. Keep short campaigns simple. Do not add inventory, mana, actions, or shops unless the requested gameplay needs them.
10. Before returning JSON, validate that it parses and that all graph references and required fields are present.

## Campaign Object

The import path accepts one campaign object, an array of campaign objects, or an object containing a `campaigns` array. Prefer one object for one requested campaign.

Required root fields:

| Field | Meaning |
| --- | --- |
| `id` | Stable, unique campaign identifier. |
| `name` | Name shown in the campaign list. |
| `description` | Short campaign summary. |
| `startNodeId` | ID of the first node to play. |
| `nodes` | Object keyed by node ID. |

Useful optional root fields:

| Field | Meaning |
| --- | --- |
| `author` | Campaign author label. |
| `coverImage` | Optional cover image URL. |
| `collectionSource` | `player` or `custom`; omitted behaves as `player`. |
| `startingCollection` | Array of `{ "cardId": string, "maxLevel": number }` entries for the custom collection. |
| `embeddedCards` | Card definitions needed by this campaign. |
| `embeddedChallenges` | PvE challenge definitions referenced by campaign battles. |
| `inventory` | Starting objects: `{ "id": string, "object": string, "quantity": number }`. |
| `items` | Campaign-specific object definitions for shop properties. |
| `unlocks` | Named campaign flags that effects grant and preconditions inspect. |
| `actions` | Reusable campaign actions with `preconditions` and `effects`. |
| `campaignMana` | `true` enables a shared campaign mana pool. |
| `startingMana` | Initial shared mana when campaign mana is enabled. |
| `allowedTiers` | Allowed player-card tiers for player-collection campaigns; `null` represents the untiered set. |
| `allowGladiators`, `allowRuni` | Special player-collection restrictions. |
| `maxCardLevel`, `maxCardLevelsByRarity` | Player-card level caps. Rarity keys are `Common`, `Rare`, `Epic`, and `Legendary`. |

The minimum overall shape is:

```json
{
  "id": "campaign_first_steps",
  "name": "My First Campaign",
  "description": "A short welcome story.",
  "author": "Campaign Author",
  "isCustom": true,
  "collectionSource": "custom",
  "startingCollection": [],
  "startNodeId": "intro",
  "nodes": {
    "intro": {
      "id": "intro",
      "type": "text",
      "title": "A New Beginning",
      "speakerName": "Guide",
      "content": "Welcome, traveler. Your first adventure starts here.",
      "buttonText": "Continue",
      "nextNodeId": "finish"
    },
    "finish": {
      "id": "finish",
      "type": "end",
      "title": "Journey Complete",
      "outcome": "victory",
      "message": "Your first journey is complete."
    }
  }
}
```

`isCustom` is set when the app saves an imported campaign, but include it in generated files for clarity. This example has no battle, so it has no challenge or card dependency.

## Node Types

Every node has `id`, `type`, and `title`. Optional `effects` is an array of campaign effects applied when the node is entered. Use one of these exact `type` values:

### `text`

Required: `content`. Optional: `speakerName`, `speakerAvatarUrl`, `backgroundUrl`, `buttonText`, and `nextNodeId`. If `nextNodeId` is omitted, the story has no next transition; use an explicit `end` node when the campaign should complete with an outcome.

### `decision`

Required: `prompt`, `choices`. Each choice requires `id`, `text`, and `nextNodeId`. Optional choice fields are `description`, `consequenceSummary`, `icon`, `imageUrl`, and `preconditions`. A choice whose preconditions fail is unavailable to the player.

### `multi`

Required: `choices`. Each entry requires `id`, `nextNodeId`, and positive `probability`. The app treats probability as a relative weight and normalizes it across valid destinations. A route is eligible only when its destination exists and all of its preconditions pass. Zero-weight routes are not selected.

```json
{
  "id": "weather_roll",
  "type": "multi",
  "title": "The Trail Chooses",
  "choices": [
    { "id": "dry_route", "nextNodeId": "sunny_path", "probability": 3 },
    { "id": "wet_route", "nextNodeId": "rainy_path", "probability": 1 }
  ]
}
```

### `hub`

Required: `prompt`, `choices`. Hub choices use `id`, `text`, and (for node or shop destinations) `nextNodeId`. Optional fields include `description`, `imageUrl`, and `preconditions`. `type` is `node`, `shop`, or `event`; omitted behaves as `node`. A `node` destination must exist. A `shop` destination must point to a `shop` node. An `event` can have `effects` and does not navigate to another node.

### `shop`

Required: `offers`. Optional: `description`, `nextNodeId` (the leave destination), and node `effects`. An offer has `id`, optional `title`, `costs`, `effects`, and optional `preconditions`. Use `offerType` `barter`, `buy`, or `effect`.

- Barter offers spend one or more `{ "object": string, "quantity": positive integer }` costs, then apply their effects.
- Offers need at least one effect. Use effect offers when the action itself is the reward.
- Buy offers use `valueParameter` (`sellvalue` or `maxcapacity`) and `currencyObject`; define the corresponding item parameters in the campaign's `items`.
- Preconditions determine whether the offer is available.

### `battle`

Use either `inlineChallenge` or `challengeId`. The campaign can route combat outcomes with `onVictoryNodeId`, `onDefeatNodeId`, and `onDrawNodeId`. Optional fields include `description`, `victoryNarrative`, `defeatNarrative`, `victoryEffects`, `defeatEffects`, and `rewardCardId`.

If a battle uses `challengeId`, the challenge must exist in the app's PvE challenges or in the campaign's `embeddedChallenges`. For a self-contained AI-generated campaign, prefer `inlineChallenge` or include a matching object in `embeddedChallenges`. A challenge has this shape:

```json
{
  "id": "encounter_bridge_guardian",
  "name": "Bridge Guardian",
  "description": "A guardian blocks the bridge.",
  "manaCap": 20,
  "rulesets": ["Standard"],
  "allowedSplinters": ["Fire", "Earth", "Neutral"],
  "enemyTeam": {
    "summonerId": null,
    "summonerLevel": 1,
    "monsters": [
      { "cardId": "custom_bridge_guardian", "level": 1 }
    ]
  }
}
```

Ruleset names must be supported exact values, such as `Standard`, `Earthquake`, `Noxious Fumes`, `Equalizer`, `Reverse Speed`, or `Lost Magic`. Splinters are `Fire`, `Water`, `Earth`, `Life`, `Death`, `Dragon`, and `Neutral`. A null enemy `summonerId` is allowed. Card IDs used by the enemy team must resolve through app cards or embedded card definitions. A draw follows `onDrawNodeId`, or falls back to `onDefeatNodeId` if only that route is configured.

### `end`

Required: `outcome` (`victory`, `defeat`, or `neutral`) and `message`. Optional: `backgroundUrl` and `rewardSummary`. Link at least one end node into the reachable story graph.

## Cards and Collections

`startingCollection` entries identify cards by ID and cap their campaign level. For a `custom` collection, the card must be available to the campaign, usually via `embeddedCards` or the installation's card catalog. A self-contained card definition has `id`, `name`, `splinter`, `cardType` (`Summoner` or `Monster`), `rarity` (`Common`, `Rare`, `Epic`, or `Legendary`), and a `stats` array. Each stat entry has `level`, `mana`, `attack`, `attackType` (`Melee`, `Ranged`, `Magic`, or `None`), `speed`, `armor`, `health`, and `abilities`. Summoners can also have `summonerBuffs`.

Do not invent abilities or card IDs. Reuse real or existing card definitions when the user asks for those cards, and include custom definitions when generating new cards. Campaign battle cards and custom collection cards should resolve to definitions with stats usable by the battle preparation screen.

## Preconditions

Each precondition has a unique `id` and one of these types:

| Type | Additional fields | Passes when |
| --- | --- | --- |
| `has_unlock` | `unlockId` | The campaign unlock has been granted. |
| `has_not_unlock` | `unlockId` | The campaign unlock has not been granted. |
| `card_unlocked` | `cardId` | The card is in campaign unlock progress. |
| `card_not_unlocked` | `cardId` | The card is not in campaign unlock progress. |
| `has_item` | `item`, `quantity` | Inventory contains at least that quantity. Quantity zero checks that the item is absent. |
| `has_mana` | `mana` | Current campaign mana is at least this amount. |

All preconditions in an array are ANDed. Empty strings or missing referenced definitions should not be used. Preconditions can gate choices, weighted routes, shop offers, and campaign actions.

## Effects

Every effect has a unique `id` and a `type`. Effects in one list are applied in array order. Prefer these current effect types:

| Type | Additional fields | Behavior |
| --- | --- | --- |
| `give_object`, `remove_object` | `object`, positive integer `quantity` | Add or remove an inventory object. |
| `give_mana`, `remove_mana` | positive integer `quantity` | Add or remove current campaign mana. |
| `set_mana` | non-negative integer `mana`; optional `useStartingMana` | Set current campaign mana. |
| `set_starting_mana` | non-negative integer `mana` | Set the run's starting-mana value. |
| `increase_starting_mana` | positive integer `quantity` | Increase starting mana without immediately refilling current mana. |
| `set_mana_to_starting_mana` | none | Refill current mana from the current starting-mana value. |
| `give_card`, `remove_card` | `cardId` | Add or remove a campaign card. |
| `campaignunlock` | `unlockIds` array | Grant one or more campaign unlock IDs. |
| `add_campaign_action`, `remove_campaign_action` | `actionId` | Add or remove an action from the run's available actions. |
| `go_to_node` | `nodeId` | Move the run to a node. Use sparingly; prefer explicit node links for ordinary story flow. |

Legacy fields such as `give_item`, `give_resource`, `remove_item`, `remove_resource`, and `set_minimum_mana` may appear in older saves. Generate the current canonical forms above. Node effects are guarded by source ID and do not reapply every time the same node is revisited. Battle result effects are associated with that battle result.

## Items, Unlocks, and Actions

- An item definition has `id`, `name`, `description`, and `parameters`. Supported parameter names are `sellvalue` and `maxcapacity`.
- An unlock definition has `id`, `name`, and `description`. `campaignunlock` effects grant unlock IDs, which preconditions can check.
- An action definition has `id`, `name`, optional `description`, optional `unlockPreconditions`, `preconditions`, and `effects`. Unlock preconditions control whether the action is visible; use preconditions keep a visible action disabled until it can be used. Declared actions without unlock preconditions are visible at run start by default; campaign effects can add or remove actions during a run.
- Inventory objects are plain names, but use the defined item names consistently. Quantities should be positive integers.

## Mana Rules

With `campaignMana: true`, `startingMana` initializes a shared resource used by campaign battles. `increase_starting_mana` changes the value used for future refills but does not refill immediately; follow it with `set_mana_to_starting_mana` when an immediate refill is intended. `set_mana` can assign a fixed amount or use `useStartingMana: true`.

Without campaign mana, each battle uses its challenge's mana cap. Effects do not turn campaign mana on; set `campaignMana: true` on the campaign if the design depends on a shared pool.

## Final Validation Checklist

- JSON parses without comments or trailing commas.
- Root has a unique `id`, `name`, `description`, valid `startNodeId`, and non-empty `nodes` object.
- Every node key equals its node `id`; all IDs are unique in their relevant lists.
- Every `nextNodeId`, choice destination, battle outcome destination, shop destination, `go_to_node` target, and `startNodeId` refers to an existing node of the right kind.
- Every reachable path has a sensible continuation or an explicit `end` node.
- Every referenced challenge, card, item, unlock, and action exists or is intentionally supplied inline/embedded.
- Every effect and precondition has the fields required for its type and uses supported enum spellings.
- A custom-collection campaign has `collectionSource: "custom"`; all required cards resolve.
- A player-collection campaign intentionally requires a synced active profile.
- Shops have valid positive costs where applicable and at least one effect per offer.
- Multi routes have positive weights and valid destinations; probabilities are treated as relative weights.

## Source References

- Campaign and run types: `src/types/campaign.ts`
- Card types: `src/types/card.ts`
- Battle challenge and team types: `src/types/battle.ts`
- Ruleset names: `src/types/ruleset.ts`
- Example branching campaign: `local/campaigns/campaign_campaign_forestwalk.json`