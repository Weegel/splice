// Player-facing card tier groups. The API uses null for Alpha/Beta and numeric tiers for later sets.
export const SPLINTERLANDS_EDITIONS = [
  { tiers: [null], name: 'Alpha / Beta' },
  { tiers: [4], name: 'Untamed' },
  { tiers: [7], name: 'Chaos Legion' },
  { tiers: [12], name: 'Rebellion' },
  { tiers: [14], name: 'Conclave Arcana' },
] as const;

export const TIER_NAME_BY_ID: Record<number, string> = Object.fromEntries(
  SPLINTERLANDS_EDITIONS.flatMap((edition) => edition.tiers.filter((tier): tier is number => tier !== null).map((tier) => [tier, edition.name]))
);
