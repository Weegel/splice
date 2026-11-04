# Local Creations

This folder is the default workspace name for locally created cards, battle definitions, campaigns, and exported studio data.

When using the launcher or development server, profiles are saved in `profiles.json` and campaign progress is saved automatically in `campaign_runs.json`. Progress includes each campaign's current encounter, collection, inventory, mana, and unlocks. Existing browser progress is copied to disk on startup if no progress file exists. To move your progress to another device, transfer `campaign_runs.json` along with your custom content; transfer `profiles.json` too for your profiles and linked collections.

Browser storage remains a fallback when the local server is unavailable. Player profiles and campaign progress are not included in release packages.

## Shop Upgrades And Starting Mana

Shop offers have required item `costs` and a list of `effects`.
An offer needs at least one effect; buying it pays all costs, then applies its effects in order.
Use **Give object** to reward an item. Legacy item rewards are converted to that effect automatically.

For an Architect's Manaspring upgrade, name the offer `Upgrade Manaspring`, configure its
required materials, and add an **Increase starting mana** effect.
The effect adds its quantity to the run's `startingMana` variable without immediately changing its current mana.
To refill mana from the upgraded value, use **Set mana to starting mana**.
**Set starting mana** remains available when an absolute value is needed.

The campaign's configured starting mana initializes the variable. Upgrades survive save/resume,
but a full campaign restart resets them to the configured value.
