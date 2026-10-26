import { CardDefinition, CardStatLevel, Splinter, CardType, AttackType, Rarity, Ability } from '../types/card';

export interface SplinterlandsRawCardDetail {
  id: number;
  name: string;
  color: string; // "Red", "Blue", "Green", "White", "Black", "Gold", "Gray"
  type: string; // "Monster" | "Summoner"
  rarity: number; // 1: Common, 2: Rare, 3: Epic, 4: Legendary
  stats: {
    mana?: number | number[];
    attack?: number | number[];
    ranged?: number | number[];
    magic?: number | number[];
    armor?: number | number[];
    health?: number | number[];
    speed?: number | number[];
    abilities?: (string | string[])[];
  };
}

export interface SplinterlandsPlayerCardItem {
  player: string;
  card_detail_id: number;
  edition?: number;
  tier?: number | null;
  gold?: boolean;
  xp?: number;
  level?: number;
}

export interface PlayerCollectionState {
  username: string;
  lastSynced: number;
  cardsCount: number;
  ownedCards: Record<number, { maxLevel: number; count: number; gold: boolean; tier?: number | null; edition?: number }>;
  ownedCardNames: Record<string, { maxLevel: number; count: number; detailId: number }>;
}

const SPLINTER_COLOR_MAP: Record<string, Splinter> = {
  Red: 'Fire',
  Blue: 'Water',
  Green: 'Earth',
  White: 'Life',
  Black: 'Death',
  Gold: 'Dragon',
  Gray: 'Neutral',
};

const RARITY_MAP: Record<number, Rarity> = {
  1: 'Common',
  2: 'Rare',
  3: 'Epic',
  4: 'Legendary',
};

const API_ENDPOINTS = [
  'https://api2.splinterlands.com',
  'https://api.splinterlands.io',
  'https://api.splinterlands.com',
];
const CARD_DETAILS_CACHE_KEY = 'splinter_card_details_cache';
const API_TIMEOUT_MS = 10000;

export class SplinterlandsApiService {
  private static cardDetailsCache: SplinterlandsRawCardDetail[] | null = null;

  /**
   * Fetch all official Splinterlands card definitions
   */
  static async fetchCardDetails(): Promise<SplinterlandsRawCardDetail[]> {
    if (this.cardDetailsCache && this.cardDetailsCache.length > 0) {
      return this.cardDetailsCache;
    }

    try {
      const response = await fetch('/__splinterlands_card_catalog');
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const data = await response.json();
      if (Array.isArray(data) && data.length > 0) {
        this.cardDetailsCache = data;
        return data;
      }
    } catch {
      // Static hosting has no local-file endpoint; use browser cache or the API.
    }

    try {
      const cached = localStorage.getItem(CARD_DETAILS_CACHE_KEY);
      if (cached) {
        const parsed = JSON.parse(cached);
        if (Array.isArray(parsed) && parsed.length > 0) {
          this.cardDetailsCache = parsed;
          return parsed;
        }
      }
    } catch {
      // Ignore malformed or unavailable browser cache.
    }

    let lastError: any = null;
    for (const baseUrl of API_ENDPOINTS) {
      try {
        const controller = new AbortController();
        const timeout = window.setTimeout(() => controller.abort(), API_TIMEOUT_MS);
        const response = await fetch(`${baseUrl}/cards/get_details`, { signal: controller.signal });
        window.clearTimeout(timeout);
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const data = await response.json();
        if (Array.isArray(data)) {
          this.cardDetailsCache = data;
          try {
            localStorage.setItem(CARD_DETAILS_CACHE_KEY, JSON.stringify(data));
          } catch {
            // Cache is optional.
          }
          return data;
        }
      } catch (err) {
        lastError = err;
      }
    }

    console.warn('Splinterlands card details cache and API are unavailable', lastError);
    return [];
  }

  static async fetchCardCatalog(): Promise<CardDefinition[]> {
    const details = await this.fetchCardDetails();
    return details
      .map((detail) => this.convertRawDetailToCardDefinition(detail))
      .filter((card): card is CardDefinition => card !== null);
  }

  /**
   * Fetch player card collection from Splinterlands API
   */
  static async fetchPlayerCollection(username: string): Promise<{
    success: boolean;
    collection?: PlayerCollectionState;
    importedCards?: CardDefinition[];
    error?: string;
  }> {
    const cleanUsername = username.trim().toLowerCase().replace('@', '');
    if (!cleanUsername) {
      return { success: false, error: 'Please enter a valid Splinterlands username.' };
    }

    let rawCollectionCards: SplinterlandsPlayerCardItem[] = [];
    let fetchSuccess = false;
    let lastError: any = null;

    for (const baseUrl of API_ENDPOINTS) {
      try {
        const url = `${baseUrl}/cards/collection/${cleanUsername}`;
        const controller = new AbortController();
        const timeout = window.setTimeout(() => controller.abort(), API_TIMEOUT_MS);
        const res = await fetch(url, { signal: controller.signal });
        window.clearTimeout(timeout);
        if (!res.ok) {
          if (res.status === 404) {
            throw new Error(`Account "${cleanUsername}" was not found.`);
          }
          throw new Error(`HTTP error ${res.status}`);
        }
        const json = await res.json();
        if (json && Array.isArray(json.cards)) {
          rawCollectionCards = json.cards;
          fetchSuccess = true;
          break;
        } else if (Array.isArray(json)) {
          rawCollectionCards = json;
          fetchSuccess = true;
          break;
        }
      } catch (err: any) {
        lastError = err;
      }
    }

    if (!fetchSuccess) {
      return {
        success: false,
        error: lastError?.message || `Failed to fetch collection for "${cleanUsername}". Check network or username.`,
      };
    }

    // First fetch global card details to know rarities and details for level calculation
    const details = await this.fetchCardDetails();
    const detailMap = new Map<number, SplinterlandsRawCardDetail>();
    details.forEach((d) => detailMap.set(d.id, d));

    // Process owned cards mapping (card_detail_id -> highest level owned)
    const ownedMap: Record<number, { maxLevel: number; count: number; gold: boolean; tier?: number | null; edition?: number }> = {};
    const ownedNames: Record<string, { maxLevel: number; count: number; detailId: number }> = {};

    for (const item of rawCollectionCards) {
      const detailId = item.card_detail_id;
      const detail = detailMap.get(detailId);
      const rarity = detail?.rarity || 1;
      const edition = item.edition === undefined ? undefined : Number(item.edition);
      const tier = item.tier === undefined ? edition : item.tier === null ? null : Number(item.tier);
      
      // Calculate level if level is missing or 0
      let lvl = 1;
      if (typeof item.level === 'number' && item.level > 0) {
        lvl = item.level;
      } else if (typeof item.xp === 'number' && item.xp > 0) {
        lvl = this.computeLevelFromXp(item.xp, rarity);
      }

      if (!ownedMap[detailId]) {
        ownedMap[detailId] = { maxLevel: lvl, count: 1, gold: !!item.gold, tier, edition };
      } else {
        ownedMap[detailId].count += 1;
        if (lvl > ownedMap[detailId].maxLevel) {
          ownedMap[detailId].maxLevel = lvl;
        }
        if (item.gold) ownedMap[detailId].gold = true;
        if (edition !== undefined && ownedMap[detailId].edition === undefined) {
          ownedMap[detailId].edition = edition;
        }
        if (tier !== undefined && ownedMap[detailId].tier === undefined) {
          ownedMap[detailId].tier = tier;
        } else if (tier !== undefined && ownedMap[detailId].tier !== tier) {
          console.warn(`Card detail ${detailId} reported multiple tiers; retaining the first tier.`);
        }
      }
    }

    // Populate ownedNames with fuzzy and exact lowercased names
    for (const [detailIdStr, meta] of Object.entries(ownedMap)) {
      const detailId = parseInt(detailIdStr);
      const detail = detailMap.get(detailId);
      if (detail && detail.name) {
        const normName = detail.name.toLowerCase().trim();
        ownedNames[normName] = { maxLevel: meta.maxLevel, count: meta.count, detailId };
        // Also add without punctuation/spaces if needed
        const simplified = normName.replace(/[^a-z0-9]/g, '');
        if (simplified !== normName) {
          ownedNames[simplified] = { maxLevel: meta.maxLevel, count: meta.count, detailId };
        }
      }
    }

    // Convert all known card details in detailMap that are in ownedMap OR create complete definitions
    const importedCards: CardDefinition[] = [];
    for (const detail of details) {
      if (ownedMap[detail.id]) {
        const parsed = this.convertRawDetailToCardDefinition(detail);
        if (parsed) {
          importedCards.push(parsed);
        }
      }
    }

    const collectionState: PlayerCollectionState = {
      username: cleanUsername,
      lastSynced: Date.now(),
      cardsCount: rawCollectionCards.length,
      ownedCards: ownedMap,
      ownedCardNames: ownedNames,
    };

    return {
      success: true,
      collection: collectionState,
      importedCards,
    };
  }

  /**
   * Helper to compute card level from XP thresholds
   */
  private static computeLevelFromXp(xp: number, rarity: number): number {
    if (rarity === 1) {
      // Common: 10 levels
      const thresholds = [1, 2, 4, 9, 19, 39, 79, 159, 289, 504];
      for (let i = thresholds.length - 1; i >= 0; i--) {
        if (xp >= thresholds[i]) return i + 1;
      }
      return 1;
    }
    if (rarity === 2) {
      // Rare: 8 levels
      const thresholds = [1, 2, 4, 8, 16, 32, 64, 115];
      for (let i = thresholds.length - 1; i >= 0; i--) {
        if (xp >= thresholds[i]) return i + 1;
      }
      return 1;
    }
    if (rarity === 3) {
      // Epic: 6 levels
      const thresholds = [1, 2, 4, 8, 16, 32];
      for (let i = thresholds.length - 1; i >= 0; i--) {
        if (xp >= thresholds[i]) return i + 1;
      }
      return 1;
    }
    // Legendary: 4 levels
    const thresholds = [1, 2, 3, 4];
    for (let i = thresholds.length - 1; i >= 0; i--) {
      if (xp >= thresholds[i]) return i + 1;
    }
    return 1;
  }

  /**
   * Helper to convert raw Splinterlands card detail into our CardDefinition format
   */
  static convertRawDetailToCardDefinition(detail: SplinterlandsRawCardDetail): CardDefinition | null {
    try {
      if (!detail.stats || (!('mana' in detail.stats) && detail.type !== 'Summoner')) {
        return null;
      }

      const splinter = SPLINTER_COLOR_MAP[detail.color] || 'Neutral';
      const cardType: CardType = detail.type === 'Summoner' ? 'Summoner' : 'Monster';
      const rarity = RARITY_MAP[detail.rarity] || 'Common';

      // Determine standard maximum levels based on rarity
      const maxLevelsForRarity = detail.rarity === 1 ? 10 : detail.rarity === 2 ? 8 : detail.rarity === 3 ? 6 : 4;
      const statsObj: Record<string, any> = detail.stats || {};
      
      const healthLen = Array.isArray(statsObj.health) ? statsObj.health.length : 0;
      const speedLen = Array.isArray(statsObj.speed) ? statsObj.speed.length : 0;
      const totalLevels = Math.max(1, healthLen || speedLen || maxLevelsForRarity);

      const statsList: CardStatLevel[] = [];

      for (let lvl = 1; lvl <= totalLevels; lvl++) {
        const idx = lvl - 1;
        const getVal = (val: any, fallback = 0) =>
          Array.isArray(val) ? val[idx] ?? val[val.length - 1] ?? fallback : val ?? fallback;

        const mana = typeof statsObj.mana === 'number' ? statsObj.mana : getVal(statsObj.mana, 3);
        const melee = getVal(statsObj.attack, 0);
        const ranged = getVal(statsObj.ranged, 0);
        const magic = getVal(statsObj.magic, 0);
        const armor = getVal(statsObj.armor, 0);
        const health = Math.max(1, getVal(statsObj.health, 1));
        const speed = Math.max(1, getVal(statsObj.speed, 1));

        let attack = 0;
        let attackType: AttackType = 'None';
        if (magic > 0) {
          attack = magic;
          attackType = 'Magic';
        } else if (ranged > 0) {
          attack = ranged;
          attackType = 'Ranged';
        } else if (melee > 0) {
          attack = melee;
          attackType = 'Melee';
        }

        // Parse abilities up to this level
        const abilities: Ability[] = [];
        if (Array.isArray(statsObj.abilities)) {
          for (let l = 0; l <= Math.min(idx, statsObj.abilities.length - 1); l++) {
            const abEntry = statsObj.abilities[l];
            if (Array.isArray(abEntry)) {
              abEntry.forEach((ab) => {
                if (typeof ab === 'string' && !abilities.includes(ab as Ability)) {
                  abilities.push(ab as Ability);
                }
              });
            } else if (typeof abEntry === 'string' && !abilities.includes(abEntry as Ability)) {
              abilities.push(abEntry as Ability);
            }
          }
        }

        statsList.push({
          level: lvl,
          mana,
          attack,
          attackType,
          speed,
          armor,
          health,
          abilities,
        });
      }

      if (statsList.length === 0) {
        statsList.push({
          level: 1,
          mana: 3,
          attack: 1,
          attackType: 'Melee',
          speed: 1,
          armor: 0,
          health: 3,
          abilities: [],
        });
      }

      // If summoner, parse summoner buffs/debuffs/abilities granted from stats
      let summonerBuffs = undefined;
      if (cardType === 'Summoner') {
        const signedBuff = (value: number | number[] | undefined) =>
          typeof value === 'number' ? value : value?.[0] || undefined;
        const melee = signedBuff(statsObj.attack);
        const ranged = signedBuff(statsObj.ranged);
        const magic = signedBuff(statsObj.magic);
        const speed = signedBuff(statsObj.speed);
        const armor = signedBuff(statsObj.armor);
        const health = signedBuff(statsObj.health);
        summonerBuffs = {
          melee: melee && melee > 0 ? melee : undefined,
          ranged: ranged && ranged > 0 ? ranged : undefined,
          magic: magic && magic > 0 ? magic : undefined,
          speed: speed && speed > 0 ? speed : undefined,
          armor: armor && armor > 0 ? armor : undefined,
          health: health && health > 0 ? health : undefined,
          enemyMelee: melee && melee < 0 ? melee : undefined,
          enemyRanged: ranged && ranged < 0 ? ranged : undefined,
          enemyMagic: magic && magic < 0 ? magic : undefined,
          enemySpeed: speed && speed < 0 ? speed : undefined,
          enemyArmor: armor && armor < 0 ? armor : undefined,
          enemyHealth: health && health < 0 ? health : undefined,
          abilitiesGranted: Array.isArray(statsObj.abilities)
            ? (statsObj.abilities.flat().filter((a: any) => typeof a === 'string') as Ability[])
            : undefined,
        };
        // Clean out undefined
        Object.keys(summonerBuffs).forEach((key) => {
          if ((summonerBuffs as any)[key] === undefined || (summonerBuffs as any)[key] === 0) {
            delete (summonerBuffs as any)[key];
          }
        });
        if (Object.keys(summonerBuffs).length === 0) {
          summonerBuffs = undefined;
        }
      }

      return {
        id: `spl_${detail.id}`,
        name: detail.name,
        splinter,
        cardType,
        rarity,
        stats: statsList,
        summonerBuffs,
        imageUrl: `https://d36mxiodh3r3b5.cloudfront.net/cards_by_level/beta/${detail.name.replace(/ /g, '%20')}_lv1.png`,
      };
    } catch {
      return null;
    }
  }
}
