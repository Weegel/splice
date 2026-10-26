import { CardDefinition } from '../types/card';

export const isOfficialSplCardId = (id: string): boolean => /^spl_\d+$/.test(id);

export function createCustomCardId(
  card: Pick<CardDefinition, 'name' | 'splinter' | 'cardType'>,
  existingIds: Iterable<string>
): string {
  const type = card.cardType === 'Summoner' ? 'sum' : 'mon';
  const splinter = card.splinter.toLowerCase();
  const name = card.name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '') || 'custom_card';
  const baseId = `${type}_${splinter}_${name}`;
  const usedIds = new Set(existingIds);

  for (let suffix = 1; ; suffix++) {
    const id = `${baseId}(${suffix})`;
    if (!usedIds.has(id)) return id;
  }
}