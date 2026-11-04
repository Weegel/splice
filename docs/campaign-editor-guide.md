# Campaign Editor Guide

This guide introduces the Splinterlands PvE Studio and walks through a small, playable campaign. The example uses only story and ending nodes, so it does not need a battle challenge or a synced Splinterlands account.

## What You Can Build

The studio combines several tools:

- **Campaigns** are interactive stories built from linked nodes. Add dialogue, player choices, hubs, weighted random routes, shops, battles, rewards, and endings.
- **Custom collections** let a campaign define its own starting cards and levels. **Player Collection** campaigns use the active profile's synced collection and card restrictions.
- **Campaign systems** can track inventory, campaign-only items, unlocks, reusable actions, and optional campaign mana across a run. Actions have separate unlock preconditions (which control visibility) and use preconditions (which can leave a visible action disabled with the unmet requirement shown). Node, choice, event, offer, and battle-outcome effects change those systems.
- **PvE Battles** let you define encounters and enemy teams. Campaign battle nodes can link to an encounter or contain an inline challenge.
- **Card Forge** lets you create custom cards. Referenced custom cards can be embedded when a campaign is saved or exported.
- **Sandbox Arena** lets you test teams and combat without running a campaign. **Battle History** stores and replays recorded fights.

The campaign editor has a searchable node list and an encounter graph. Select a node to edit its fields. Use node pickers to connect destinations; each campaign's `startNodeId` identifies its entry point.

Campaign edits autosave. When using the launcher or development server, campaign definitions are stored in `local/campaigns/` and run progress in `local/campaign_runs.json`. Campaign exports are JSON and can be imported on another installation.

## My First Campaign

This short campaign displays a welcome message and a victory ending.

1. Open **Campaigns** and select **Create Campaign**.
2. Set **Campaign Title** to `My First Campaign` and write a short **Campaign Description**.
3. Under **Campaign collection**, select **Custom Collection**. This example has no battles, so its starting collection can stay empty. The setting also prevents a later play attempt from requiring a synced account.
4. The editor creates one **Story / Text** node and marks it `START`. Select it if it is not already selected. Set its **Node Header Title**, **Speaker Name**, **Story Narrative & Dialogue**, and **Button Action Text**. For example:

   - Title: `A New Beginning`
   - Speaker: `Guide`
   - Narrative: `Welcome, traveler. Your first adventure starts here.`
   - Button: `Continue`

5. In **Transition To Next Node**, select **Create & Link: End**. This creates an end node and connects it to the story node.
6. Select the new end node. Set its title and message, and leave **Outcome** as `Victory`.
7. Wait for the autosave status to show the changes are saved, then close the editor with its close button.
8. Select **Play Campaign** on the campaign. Advance past the welcome text to see the victory ending.

If the app asks you to create or select a local profile, that is separate from linking a Splinterlands account. A custom-collection campaign does not require the account to be synced.

## Add More Story

- In a text node, use **Create & Link** to add and connect another story, choice, weighted route, hub, battle, or end node.
- A **Decision / Choice** node presents player-visible options. Connect each option to its own destination. Optional preconditions hide choices that are not currently available.
- A **Multi / Weighted Selector** chooses a destination automatically. Its probability values are relative weights, not percentages that must add up to 100. Only valid destinations whose preconditions pass are considered.
- A **Hub / Points of Interest** presents multiple destinations in one location. Points can lead to normal nodes or shops, or act as events that apply effects.
- A **Combat / Battle** node uses a PvE challenge and can branch on victory, defeat, or draw. Add follow-up narrative, another encounter, or an end node for each relevant outcome.
- An **End** node completes the run with a victory, defeat, or neutral outcome.

Use the **Show Encounter Graph** button to inspect the connections. A node can be edited directly from the node list, and its title can be used to find it in node pickers.

## Campaign Systems

- **Inventory** defines starting objects. **Campaign Specific Items** give objects optional sell values or capacity limits for shop mechanics.
- **Campaign Unlocks** define named flags that effects can grant and preconditions can check.
- **Actions** define reusable player actions with preconditions and effects. Effects can add or remove actions during a run.
- **Node Effects** apply when a node is entered. Similar effects can be attached to a hub event, shop offer, or battle result. Effects in the same list run in order; a node's effects are guarded so that re-entering that node does not repeatedly grant them.
- **Campaign mana** is an optional shared run resource. When enabled, it starts at the configured value and affects campaign battles. When disabled, battles use their challenge mana cap, subject to any campaign minimum mana effects.
- **Advanced Settings** controls campaign mana and its starting amount. Campaign collection settings control whether a run uses a custom collection or the active profile's player collection.

## Import, Export, and Saves

Use **Export Custom** to download custom campaigns, **All** to include built-in campaigns, or the download button on a campaign to export one campaign. Use **Import JSON** to import one or more campaign files. An exported campaign can include the cards and challenges it references; campaigns that rely on separate challenges should be transferred with those challenge definitions too.

When using the launcher, custom cards, battles, and campaigns live in the installation's `local/` folder. Profiles and campaign progress are separate files and are intentionally not included in release packages. To move a saved run to another installation, transfer `campaign_runs.json` as well as the campaign and any required cards or battles.

## Related Documentation

- [AI Campaign Authoring Instructions](ai-campaign-authoring.md) describes the JSON schema, gameplay rules, and validation checklist for generating campaigns.
- The source schema is in `src/types/campaign.ts`; a branching example is in `local/campaigns/campaign_campaign_forestwalk.json`.