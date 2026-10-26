# Local Creations

This folder is the default workspace name for locally created cards, battle definitions, campaigns, and exported studio data.

Browser-based saves remain in localStorage unless the app is granted access to a folder through the browser's file system picker.

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
