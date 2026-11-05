import { CardDefinition } from '../types/card';
import { PvEChallenge, BattleLog } from '../types/battle';
import { CampaignDefinition, CampaignRunState } from '../types/campaign';
import { LocalPlayerProfile } from '../types/profile';
import { PlayerCollectionState } from '../services/splinterlandsApi';
import { LocalWorkspaceService } from '../services/localWorkspace';
import { DEFAULT_PVE_CARDS, LEGACY_CARD_IDS_BY_API_ID } from './defaultPveCards';
import { DEFAULT_CHALLENGES } from './defaultChallenges';
import { DEFAULT_CAMPAIGNS } from './defaultCampaigns';
import { createCustomCardId, isOfficialSplCardId } from './cardIds';
import { getCampaignPlayerCardIds, normalizeCampaignNodes } from './campaignEffects';

const STORAGE_KEYS = {
  CARDS: 'splinter_custom_cards',
  API_CARDS: 'splinter_api_cards',
  CHALLENGES: 'splinter_custom_challenges',
  CAMPAIGNS: 'splinter_custom_campaigns',
  CAMPAIGN_RUNS: 'splinter_campaign_runs',
  BATTLE_HISTORY: 'splinter_battle_history',
  PLAYER_COLLECTION: 'splinter_player_collection',
  PLAYER_FILTER_MODE: 'splinter_collection_filter_mode',
  PROFILES: 'splinter_local_profiles',
  ACTIVE_PROFILE: 'splinter_active_profile',
};

const MAX_IMPORT_JSON_BYTES = 5_000_000;
const MAX_IMPORT_DEPTH = 40;
const MAX_IMPORT_VALUES = 100_000;
const MAX_IMPORT_STRING_LENGTH = 20_000;
const MAX_IMPORT_ITEMS = 500;

function parseImportJson(jsonString: string): any {
  if (new TextEncoder().encode(jsonString).byteLength > MAX_IMPORT_JSON_BYTES) {
    throw new Error('JSON file exceeds the 5 MB import limit.');
  }
  let depth = 0;
  let inString = false;
  let escaped = false;
  for (const character of jsonString) {
    if (inString) {
      if (escaped) escaped = false;
      else if (character === '\\') escaped = true;
      else if (character === '"') inString = false;
      continue;
    }
    if (character === '"') inString = true;
    else if (character === '{' || character === '[') {
      depth++;
      if (depth > MAX_IMPORT_DEPTH) throw new Error('JSON nesting exceeds the import limit.');
    } else if (character === '}' || character === ']') depth--;
  }

  const parsed = JSON.parse(jsonString);
  const pending: Array<{ value: any; depth: number }> = [{ value: parsed, depth: 0 }];
  let valueCount = 0;
  while (pending.length) {
    const { value, depth: valueDepth } = pending.pop()!;
    valueCount++;
    if (valueCount > MAX_IMPORT_VALUES) throw new Error('JSON contains too many values.');
    if (typeof value === 'string' && value.length > MAX_IMPORT_STRING_LENGTH) {
      throw new Error('A JSON string exceeds the 20,000 character import limit.');
    }
    if (!value || typeof value !== 'object') continue;
    if (valueDepth >= MAX_IMPORT_DEPTH) throw new Error('JSON nesting exceeds the import limit.');
    const entries = Array.isArray(value) ? value : Object.values(value);
    if (entries.length > MAX_IMPORT_ITEMS) throw new Error(`A JSON collection exceeds the ${MAX_IMPORT_ITEMS} item limit.`);
    for (const child of entries) pending.push({ value: child, depth: valueDepth + 1 });
  }
  return parsed;
}

function isRecord(value: any): value is Record<string, any> {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value));
}

function isBoundedString(value: any): value is string {
  return typeof value === 'string' && value.length > 0 && value.length <= MAX_IMPORT_STRING_LENGTH;
}

function validateImportedCard(card: any): boolean {
  const splinters = ['Fire', 'Water', 'Earth', 'Life', 'Death', 'Dragon', 'Neutral'];
  const cardTypes = ['Monster', 'Summoner'];
  const rarities = ['Common', 'Rare', 'Epic', 'Legendary'];
  const attackTypes = ['Melee', 'Ranged', 'Magic', 'None'];
  return isRecord(card) && isBoundedString(card.id) && isBoundedString(card.name)
    && splinters.includes(card.splinter) && cardTypes.includes(card.cardType) && rarities.includes(card.rarity)
    && Array.isArray(card.stats) && card.stats.length > 0 && card.stats.length <= 20
    && card.stats.every((stat: any) => isRecord(stat)
      && ['level', 'mana', 'attack', 'speed', 'armor', 'health'].every((key) => Number.isFinite(stat[key]))
      && attackTypes.includes(stat.attackType) && Array.isArray(stat.abilities) && stat.abilities.length <= 200
      && stat.abilities.every(isBoundedString));
}

function validateImportedChallenge(challenge: any): boolean {
  const splinters = ['Fire', 'Water', 'Earth', 'Life', 'Death', 'Dragon', 'Neutral'];
  return isRecord(challenge) && isBoundedString(challenge.id) && isBoundedString(challenge.name)
    && isBoundedString(challenge.description) && Number.isFinite(challenge.manaCap)
    && Array.isArray(challenge.rulesets) && challenge.rulesets.length <= 100
    && challenge.rulesets.every(isBoundedString)
    && Array.isArray(challenge.allowedSplinters) && challenge.allowedSplinters.length <= splinters.length
    && challenge.allowedSplinters.every((splinter: any) => splinters.includes(splinter))
    && isRecord(challenge.enemyTeam)
    && (challenge.enemyTeam.summonerId === null || isBoundedString(challenge.enemyTeam.summonerId))
    && Number.isFinite(challenge.enemyTeam.summonerLevel)
    && Array.isArray(challenge.enemyTeam.monsters) && challenge.enemyTeam.monsters.length <= 6
    && challenge.enemyTeam.monsters.every((monster: any) => isRecord(monster)
      && isBoundedString(monster.cardId) && Number.isFinite(monster.level))
    && (!challenge.embeddedCards || (Array.isArray(challenge.embeddedCards)
      && challenge.embeddedCards.every(validateImportedCard)));
}

function validateImportedCampaign(campaign: any): boolean {
  const nodeTypes = ['text', 'decision', 'multi', 'hub', 'shop', 'battle', 'end'];
  if (!isRecord(campaign) || !isBoundedString(campaign.id) || !isBoundedString(campaign.name)
    || !isBoundedString(campaign.description) || !isBoundedString(campaign.startNodeId)
    || !isRecord(campaign.nodes)) return false;
  const nodeEntries = Object.entries(campaign.nodes);
  if (nodeEntries.length === 0 || nodeEntries.length > MAX_IMPORT_ITEMS) return false;
  let edgeCount = 0;
  for (const [nodeId, node] of nodeEntries) {
    if (!isRecord(node) || !isBoundedString(nodeId) || node.id !== nodeId
      || !nodeTypes.includes(node.type) || !isBoundedString(node.title)) return false;
    if (node.effects && (!Array.isArray(node.effects) || !node.effects.every((effect: any) => isRecord(effect)
      && isBoundedString(effect.id) && isBoundedString(effect.type)))) return false;
    if (node.type === 'text' && !isBoundedString(node.content)) return false;
    if ((node.type === 'decision' || node.type === 'hub') && !isBoundedString(node.prompt)) return false;
    if (node.type === 'decision' || node.type === 'hub' || node.type === 'multi') {
      if (!Array.isArray(node.choices) || node.choices.length > MAX_IMPORT_ITEMS) return false;
      edgeCount += node.choices.length;
      if (!node.choices.every((choice: any) => isRecord(choice)
        && isBoundedString(choice.id) && isBoundedString(choice.nextNodeId)
        && (node.type === 'multi'
          ? Number.isFinite(choice.probability) && choice.probability >= 0 && choice.probability <= 1
          : isBoundedString(choice.text)))) return false;
    }
    if (node.type === 'shop' && (!Array.isArray(node.offers) || node.offers.length > MAX_IMPORT_ITEMS
      || !node.offers.every((offer: any) => isRecord(offer) && isBoundedString(offer.id)
        && Array.isArray(offer.costs) && Array.isArray(offer.effects)))) return false;
    if (node.type === 'battle' && ((node.challengeId !== undefined && !isBoundedString(node.challengeId))
      || (node.inlineChallenge !== undefined && !validateImportedChallenge(node.inlineChallenge)))) return false;
    if (node.type === 'end' && (!['victory', 'defeat', 'neutral'].includes(node.outcome)
      || !isBoundedString(node.message))) return false;
  }
  return edgeCount <= 2_000
    && Object.prototype.hasOwnProperty.call(campaign.nodes, campaign.startNodeId)
    && (!campaign.embeddedCards || (Array.isArray(campaign.embeddedCards)
      && campaign.embeddedCards.every(validateImportedCard)))
    && (!campaign.embeddedChallenges || (Array.isArray(campaign.embeddedChallenges)
      && campaign.embeddedChallenges.every(validateImportedChallenge)));
}

function getImportedCollection(parsed: any, property: string, validate: (item: any) => boolean, label: string): any[] {
  let items = parsed;
  if (!Array.isArray(items)) {
    if (isRecord(items) && validate(items)) items = [items];
    else if (isRecord(items) && Array.isArray(items[property])) items = items[property];
    else throw new Error(`Imported data must be an array of ${label} or a single ${label.slice(0, -1)} object.`);
  }
  if (items.length > MAX_IMPORT_ITEMS || !items.every(validate)) {
    throw new Error(`Imported ${label} must contain at most ${MAX_IMPORT_ITEMS} valid entries.`);
  }
  return items;
}

export class StorageService {
  static getProfiles(): LocalPlayerProfile[] {
    try {
      const stored = localStorage.getItem(STORAGE_KEYS.PROFILES);
      return stored ? JSON.parse(stored) : [];
    } catch {
      return [];
    }
  }

  static getActiveProfile(): LocalPlayerProfile | null {
    const activeId = localStorage.getItem(STORAGE_KEYS.ACTIVE_PROFILE);
    return this.getProfiles().find((profile) => profile.id === activeId) || null;
  }

  static saveProfile(profile: LocalPlayerProfile): void {
    const profiles = this.getProfiles();
    const normalizedName = profile.name.trim().toLocaleLowerCase();
    if (profiles.some((item) => item.id !== profile.id && item.name.trim().toLocaleLowerCase() === normalizedName)) {
      throw new Error(`A profile named "${profile.name.trim()}" already exists.`);
    }
    const index = profiles.findIndex((item) => item.id === profile.id);
    if (index >= 0) profiles[index] = profile;
    else profiles.push(profile);
    localStorage.setItem(STORAGE_KEYS.PROFILES, JSON.stringify(profiles));
    localStorage.setItem(STORAGE_KEYS.ACTIVE_PROFILE, profile.id);
    void LocalWorkspaceService.writeProfiles(profiles, profile.id);
  }

  static createProfile(name: string): LocalPlayerProfile {
    const cleanName = name.trim();
    if (!cleanName) throw new Error('Enter a profile name.');
    if (this.getProfiles().some((profile) => profile.name.trim().toLocaleLowerCase() === cleanName.toLocaleLowerCase())) {
      throw new Error(`A profile named "${cleanName}" already exists.`);
    }
    const profile: LocalPlayerProfile = {
      id: `profile_${Date.now()}`,
      name: cleanName,
      createdAt: Date.now(),
    };
    this.saveProfile(profile);
    return profile;
  }

  static hydrateProfiles(profiles: LocalPlayerProfile[], activeProfileId: string | null): void {
    const uniqueProfiles = profiles.filter((profile, index, all) =>
      all.findIndex((item) => item.name.trim().toLocaleLowerCase() === profile.name.trim().toLocaleLowerCase()) === index
    );
    localStorage.setItem(STORAGE_KEYS.PROFILES, JSON.stringify(uniqueProfiles));
    const activeId = uniqueProfiles.some((profile) => profile.id === activeProfileId)
      ? activeProfileId
      : uniqueProfiles[0]?.id || null;
    if (activeId) localStorage.setItem(STORAGE_KEYS.ACTIVE_PROFILE, activeId);
    else localStorage.removeItem(STORAGE_KEYS.ACTIVE_PROFILE);
  }

  static hydrateLocalCreations(data: {
    cards?: CardDefinition[];
    challenges?: PvEChallenge[];
    campaigns?: CampaignDefinition[];
    battleLogs?: BattleLog[];
  }): void {
    const embeddedCards = [
      ...(data.cards || []),
      ...(data.challenges || []).flatMap((challenge) => challenge.embeddedCards || []),
      ...(data.campaigns || []).flatMap((campaign) => [
        ...(campaign.embeddedCards || []),
        ...(campaign.embeddedChallenges || []).flatMap((challenge) => challenge.embeddedCards || []),
      ]),
    ];
    const cards = this.getCustomCards();
    const cardMap = new Map<string, CardDefinition>(embeddedCards.map((card) => [card.id, { ...card, isCustom: Boolean(card.isCustom) }]));
    // Existing app-managed local cards are canonical and override embedded snapshots.
    cards.forEach((card) => cardMap.set(card.id, card));
    // Files currently present in /local are the latest app-managed artifacts.
    (data.cards || []).forEach((card) => cardMap.set(card.id, { ...card, isCustom: Boolean(card.isCustom) }));
    localStorage.setItem(STORAGE_KEYS.CARDS, JSON.stringify(Array.from(cardMap.values())));

    const embeddedChallenges = [
      ...(data.challenges || []),
      ...(data.campaigns || []).flatMap((campaign) => campaign.embeddedChallenges || []),
    ];
    const challenges = this.getCustomChallenges();
    const challengeMap = new Map<string, PvEChallenge>(embeddedChallenges.map((challenge) => [challenge.id, { ...challenge, isCustom: Boolean(challenge.isCustom) }]));
    // Standalone battle files are canonical over campaign snapshots.
    challenges.forEach((challenge) => challengeMap.set(challenge.id, challenge));
    (data.challenges || []).forEach((challenge) => challengeMap.set(challenge.id, { ...challenge, isCustom: Boolean(challenge.isCustom) }));
    localStorage.setItem(STORAGE_KEYS.CHALLENGES, JSON.stringify(Array.from(challengeMap.values())));

    const campaigns = this.getCustomCampaigns();
    const campaignMap = new Map(campaigns.map((campaign) => [campaign.id, campaign]));
    (data.campaigns || []).forEach((campaign) => campaignMap.set(campaign.id, normalizeCampaignNodes({ ...campaign, isCustom: Boolean(campaign.isCustom) })));
    localStorage.setItem(STORAGE_KEYS.CAMPAIGNS, JSON.stringify(Array.from(campaignMap.values())));

    if (data.battleLogs && data.battleLogs.length > 0) {
      const existingLogs = this.getBattleHistory();
      const logMap = new Map(existingLogs.map((log) => [log.id, log]));
      data.battleLogs.forEach((log) => logMap.set(log.id, log));
      localStorage.setItem(STORAGE_KEYS.BATTLE_HISTORY, JSON.stringify(Array.from(logMap.values()).slice(0, 20)));
    }
  }

  // --- CARDS ---
  static getCards(): CardDefinition[] {
    try {
      const cardMap = new Map<string, CardDefinition>();

      // Official API cards are the base catalog. Keep legacy IDs used by bundled campaigns.
      const apiCards = this.getApiCards();
      apiCards.forEach((c) => {
        const apiId = Number(c.id.replace(/^spl_/, ''));
        const id = LEGACY_CARD_IDS_BY_API_ID[apiId] || c.id;
        cardMap.set(id, { ...c, id, isCustom: false });
      });

      // Bundled and user-created PvE cards remain available beside the official catalog.
      DEFAULT_PVE_CARDS.forEach((card) => {
        cardMap.set(card.id, { ...card, isCustom: true });
      });
      const campaignCards = [
        ...this.getCampaigns().flatMap((campaign) => campaign.embeddedCards || []),
        ...this.getEmbeddedCampaignChallenges().flatMap((challenge) => challenge.embeddedCards || []),
      ];
      campaignCards.forEach((card) => {
        const official = isOfficialSplCardId(card.id);
        if (!official || !cardMap.has(card.id)) cardMap.set(card.id, { ...card, isCustom: !official });
      });
      const customCards = this.getCustomCards();
      customCards.forEach((c) => {
        cardMap.set(c.id, { ...c, isCustom: true });
      });

      return Array.from(cardMap.values());
    } catch (e) {
      console.error('Failed to load cards from storage', e);
      return DEFAULT_PVE_CARDS;
    }
  }

  static getCustomCards(): CardDefinition[] {
    try {
      const stored = localStorage.getItem(STORAGE_KEYS.CARDS);
      if (!stored) return [];
      const list: CardDefinition[] = JSON.parse(stored);
      // Exact spl_<number> IDs belong to official API cards.
      const clean = list.filter((c) => !isOfficialSplCardId(c.id));
      if (clean.length !== list.length) {
        localStorage.setItem(STORAGE_KEYS.CARDS, JSON.stringify(clean));
      }
      return clean;
    } catch {
      return [];
    }
  }

  static getApiCards(): CardDefinition[] {
    try {
      const stored = localStorage.getItem(STORAGE_KEYS.API_CARDS);
      return stored ? JSON.parse(stored) : [];
    } catch {
      return [];
    }
  }

  static saveApiCards(newCards: CardDefinition[]): void {
    try {
      localStorage.setItem(STORAGE_KEYS.API_CARDS, JSON.stringify(newCards.map((card) => ({ ...card, isCustom: false }))));
    } catch (e) {
      console.error('Failed to save API cards', e);
    }
  }

  static saveCard(card: CardDefinition): CardDefinition {
    const customCards = this.getCustomCards();
    const existingIndex = card.id ? customCards.findIndex((c) => c.id === card.id) : -1;
    const existingCards = this.getCards();
    const existingIds = existingCards.map((existingCard) => existingCard.id);
    const existingCustomCard = existingCards.some((entry) => entry.id === card.id && entry.isCustom && !isOfficialSplCardId(entry.id));
    const idIsAvailable = card.id && !existingIds.includes(card.id);
    const id = existingIndex >= 0 || existingCustomCard || idIsAvailable
      ? card.id
      : createCustomCardId(card, existingIds);
    const updatedCard = { ...card, id, isCustom: true };
    
    if (existingIndex >= 0) {
      customCards[existingIndex] = updatedCard;
    } else {
      customCards.push(updatedCard);
    }
    
    localStorage.setItem(STORAGE_KEYS.CARDS, JSON.stringify(customCards));
    void LocalWorkspaceService.writeCreation('cards', updatedCard);
    for (const campaign of this.getCampaigns()) {
      const challenges = [
        ...(campaign.embeddedChallenges || []),
        ...Object.values(campaign.nodes).flatMap((node) => node.type === 'battle' && node.inlineChallenge ? [node.inlineChallenge] : []),
      ];
      const referenced = (campaign.embeddedCards || []).some((entry) => entry.id === id)
        || getCampaignPlayerCardIds(campaign).includes(id)
        || challenges.some((challenge) => (challenge.embeddedCards || []).some((entry) => entry.id === id)
          || challenge.enemyTeam.summonerId === id || challenge.enemyTeam.monsters.some((entry) => entry.cardId === id));
      if (referenced) this.saveCampaign(campaign);
    }
    return updatedCard;
  }

  static deleteCard(id: string): void {
    const customCards = this.getCustomCards().filter((c) => c.id !== id);
    localStorage.setItem(STORAGE_KEYS.CARDS, JSON.stringify(customCards));
    void LocalWorkspaceService.deleteCreation('cards', id);
  }

  static exportCardsJson(includeDefaults = false): string {
    const cardsToExport = includeDefaults ? this.getCards() : this.getCustomCards();
    return JSON.stringify(cardsToExport, null, 2);
  }

  static validateCardsJson(jsonString: string): { success: boolean; error?: string } {
    try {
      getImportedCollection(parseImportJson(jsonString), 'cards', validateImportedCard, 'cards');
      return { success: true };
    } catch (err: any) {
      return { success: false, error: err.message || 'Invalid JSON' };
    }
  }

  static importCardsJson(jsonString: string): { success: boolean; count: number; error?: string } {
    try {
      const parsed = getImportedCollection(parseImportJson(jsonString), 'cards', validateImportedCard, 'cards');
      const existing = this.getCustomCards();
      const map = new Map<string, CardDefinition>();
      existing.forEach((c) => map.set(c.id, c));
      let count = 0;
      for (const card of parsed) {
        map.set(card.id, { ...card, isCustom: true });
        count++;
      }
      localStorage.setItem(STORAGE_KEYS.CARDS, JSON.stringify(Array.from(map.values())));
      return { success: true, count };
    } catch (err: any) {
      return { success: false, count: 0, error: err.message || 'Invalid JSON' };
    }
  }

  // --- CHALLENGES ---
  private static getEmbeddedCampaignChallenges(): PvEChallenge[] {
    return this.getCampaigns().flatMap((campaign) => [
      ...(campaign.embeddedChallenges || []),
      ...Object.values(campaign.nodes).flatMap((node) => node.type === 'battle' && node.inlineChallenge ? [node.inlineChallenge] : []),
    ]);
  }

  static getChallenges(): PvEChallenge[] {
    try {
      const stored = localStorage.getItem(STORAGE_KEYS.CHALLENGES);
      const customChallenges: PvEChallenge[] = stored ? JSON.parse(stored) : [];
      const challengeMap = new Map<string, PvEChallenge>();
      DEFAULT_CHALLENGES.forEach((ch) => challengeMap.set(ch.id, ch));
      this.getEmbeddedCampaignChallenges().forEach((challenge) => challengeMap.set(challenge.id, challenge));
      customChallenges.forEach((ch) => challengeMap.set(ch.id, { ...ch, isCustom: true }));
      return Array.from(challengeMap.values());
    } catch (e) {
      console.error('Failed to load challenges', e);
      return DEFAULT_CHALLENGES;
    }
  }

  static getCustomChallenges(): PvEChallenge[] {
    try {
      const stored = localStorage.getItem(STORAGE_KEYS.CHALLENGES);
      return stored ? JSON.parse(stored) : [];
    } catch {
      return [];
    }
  }

  static saveChallenge(challenge: PvEChallenge): void {
    const custom = this.getCustomChallenges();
    const idx = custom.findIndex((c) => c.id === challenge.id);
    const referencedCardIds = [
      challenge.enemyTeam.summonerId,
      ...challenge.enemyTeam.monsters.map((monster) => monster.cardId),
    ];
    const embeddedCards = this.getCards()
      .filter((card) => referencedCardIds.includes(card.id))
      .map((card) => ({ ...card }));
    const updated = { ...challenge, isCustom: true, embeddedCards };
    if (idx >= 0) {
      custom[idx] = updated;
    } else {
      custom.push(updated);
    }
    localStorage.setItem(STORAGE_KEYS.CHALLENGES, JSON.stringify(custom));
    void LocalWorkspaceService.writeCreation('battles', updated);
  }

  static deleteChallenge(id: string): void {
    const custom = this.getCustomChallenges().filter((c) => c.id !== id);
    localStorage.setItem(STORAGE_KEYS.CHALLENGES, JSON.stringify(custom));
    void LocalWorkspaceService.deleteCreation('battles', id);
  }

  static exportChallengesJson(includeDefaults = false): string {
    const challengesToExport = includeDefaults ? this.getChallenges() : this.getCustomChallenges();
    return JSON.stringify(challengesToExport, null, 2);
  }

  static validateChallengesJson(jsonString: string): { success: boolean; error?: string } {
    try {
      getImportedCollection(parseImportJson(jsonString), 'challenges', validateImportedChallenge, 'challenges');
      return { success: true };
    } catch (err: any) {
      return { success: false, error: err.message || 'Invalid JSON' };
    }
  }

  static importChallengesJson(jsonString: string): { success: boolean; count: number; error?: string } {
    try {
      const parsed = getImportedCollection(parseImportJson(jsonString), 'challenges', validateImportedChallenge, 'challenges');
      const existing = this.getCustomChallenges();
      const map = new Map<string, PvEChallenge>();
      existing.forEach((c) => map.set(c.id, c));
      let count = 0;
      for (const ch of parsed) {
        map.set(ch.id, { ...ch, isCustom: true });
        count++;
      }
      localStorage.setItem(STORAGE_KEYS.CHALLENGES, JSON.stringify(Array.from(map.values())));
      return { success: true, count };
    } catch (err: any) {
      return { success: false, count: 0, error: err.message || 'Invalid JSON' };
    }
  }

  // --- CAMPAIGNS ---
  static getCampaigns(): CampaignDefinition[] {
    try {
      const stored = localStorage.getItem(STORAGE_KEYS.CAMPAIGNS);
      if (!stored) {
        return DEFAULT_CAMPAIGNS;
      }
      const customCampaigns = this.getCustomCampaigns();
      const campaignMap = new Map<string, CampaignDefinition>();
      DEFAULT_CAMPAIGNS.forEach((c) => campaignMap.set(c.id, c));
      customCampaigns.forEach((c) => campaignMap.set(c.id, normalizeCampaignNodes({ ...c, isCustom: true })));
      return Array.from(campaignMap.values());
    } catch (e) {
      console.error('Failed to load campaigns', e);
      return DEFAULT_CAMPAIGNS;
    }
  }

  static getCustomCampaigns(): CampaignDefinition[] {
    try {
      const stored = localStorage.getItem(STORAGE_KEYS.CAMPAIGNS);
      if (!stored) return [];
      const campaigns = JSON.parse(stored) as CampaignDefinition[];
      const legacyEmorId = 'campaign_custom_1791371731769';
      const canonicalEmorId = 'campaign_splintered_paths_of_emor';
      const legacyIndex = campaigns.findIndex((campaign) => campaign.id === legacyEmorId);
      let migrated = false;
      if (legacyIndex >= 0) {
        const canonicalIndex = campaigns.findIndex((campaign) => campaign.id === canonicalEmorId);
        const legacyCampaign = { ...campaigns[legacyIndex], id: canonicalEmorId };
        if (canonicalIndex >= 0) {
          campaigns[canonicalIndex] = { ...campaigns[canonicalIndex], ...legacyCampaign };
          campaigns.splice(legacyIndex, 1);
        } else {
          campaigns[legacyIndex] = legacyCampaign;
        }
        migrated = true;
      }
      if (migrated) localStorage.setItem(STORAGE_KEYS.CAMPAIGNS, JSON.stringify(campaigns));
      return campaigns.map(normalizeCampaignNodes);
    } catch {
      return [];
    }
  }

  static saveCampaign(campaign: CampaignDefinition): void {
    campaign = normalizeCampaignNodes(campaign);
    const catalog = this.getCards();
    const refreshChallenge = (challenge: PvEChallenge): PvEChallenge => {
      const referencedIds = new Set([
        challenge.enemyTeam.summonerId,
        ...challenge.enemyTeam.monsters.map((entry) => entry.cardId),
        ...(challenge.embeddedCards || []).map((card) => card.id),
      ]);
      return {
        ...challenge,
        embeddedCards: [...new Map([
          ...(challenge.embeddedCards || []),
          ...catalog.filter((card) => referencedIds.has(card.id)),
        ].map((card) => [card.id, card])).values()],
      };
    };
    campaign = {
      ...campaign,
      nodes: Object.fromEntries(Object.entries(campaign.nodes).map(([id, node]) => [id,
        node.type === 'battle' && node.inlineChallenge ? { ...node, inlineChallenge: refreshChallenge(node.inlineChallenge) } : node,
      ])),
    };
    const custom = this.getCustomCampaigns();
    const idx = custom.findIndex((c) => c.id === campaign.id);
    const inlineChallenges = Object.values(campaign.nodes)
      .filter((node) => node.type === 'battle' && node.inlineChallenge)
      .map((node) => (node.type === 'battle' ? node.inlineChallenge : undefined))
      .filter((challenge): challenge is PvEChallenge => Boolean(challenge));
    const referencedChallengeIds = Object.values(campaign.nodes)
      .filter((node) => node.type === 'battle' && node.challengeId)
      .map((node) => (node.type === 'battle' ? node.challengeId : undefined))
      .filter((id): id is string => Boolean(id));
    const embeddedChallenges = [
      ...this.getChallenges()
      .filter((challenge) => referencedChallengeIds.includes(challenge.id))
      .map(refreshChallenge),
      ...inlineChallenges,
    ];
    const referencedCardIds = [
      ...getCampaignPlayerCardIds(campaign),
      ...(campaign.embeddedCards || []).map((card) => card.id),
      ...embeddedChallenges.flatMap((challenge) => [
        challenge.enemyTeam.summonerId,
        ...challenge.enemyTeam.monsters.map((monster) => monster.cardId),
        ...(challenge.embeddedCards || []).map((card) => card.id),
      ]),
    ];
    const embeddedCards = [...new Map([
      ...(campaign.embeddedCards || []),
      ...catalog.filter((card) => referencedCardIds.includes(card.id)),
    ].map((card) => [card.id, { ...card }])).values()];
    const updated = { ...campaign, isCustom: true, embeddedCards, embeddedChallenges };
    if (idx >= 0) {
      custom[idx] = updated;
    } else {
      custom.push(updated);
    }
    localStorage.setItem(STORAGE_KEYS.CAMPAIGNS, JSON.stringify(custom));
    void LocalWorkspaceService.writeCreation('campaigns', updated);
  }

  static deleteCampaign(id: string): void {
    const custom = this.getCustomCampaigns().filter((c) => c.id !== id);
    localStorage.setItem(STORAGE_KEYS.CAMPAIGNS, JSON.stringify(custom));
    // Also remove run state if any
    this.deleteCampaignRun(id);
    void LocalWorkspaceService.deleteCreation('campaigns', id);
  }

  static exportCampaignsJson(includeDefaults = false): string {
    const campaignsToExport = includeDefaults ? this.getCampaigns() : this.getCustomCampaigns();
    return JSON.stringify(campaignsToExport, null, 2);
  }

  static validateCampaignsJson(jsonString: string): { success: boolean; error?: string } {
    try {
      getImportedCollection(parseImportJson(jsonString), 'campaigns', validateImportedCampaign, 'campaigns');
      return { success: true };
    } catch (err: any) {
      return { success: false, error: err.message || 'Invalid JSON' };
    }
  }

  static importCampaignsJson(jsonString: string): { success: boolean; count: number; error?: string } {
    try {
      const parsed = getImportedCollection(parseImportJson(jsonString), 'campaigns', validateImportedCampaign, 'campaigns');
      const existing = this.getCustomCampaigns();
      const map = new Map<string, CampaignDefinition>();
      existing.forEach((c) => map.set(c.id, c));
      let count = 0;
      for (const camp of parsed) {
        map.set(camp.id, normalizeCampaignNodes({ ...camp, isCustom: true }));
        count++;
      }
      localStorage.setItem(STORAGE_KEYS.CAMPAIGNS, JSON.stringify(Array.from(map.values())));
      return { success: true, count };
    } catch (err: any) {
      return { success: false, count: 0, error: err.message || 'Invalid JSON' };
    }
  }

  // --- CAMPAIGN RUN PROGRESSION ---
  static getCampaignRuns(): Record<string, CampaignRunState> {
    try {
      return JSON.parse(localStorage.getItem(STORAGE_KEYS.CAMPAIGN_RUNS) || '{}');
    } catch {
      return {};
    }
  }

  static hydrateCampaignRuns(runs: Record<string, CampaignRunState>): void {
    localStorage.setItem(STORAGE_KEYS.CAMPAIGN_RUNS, JSON.stringify(runs));
  }

  static getCampaignRun(campaignId: string): CampaignRunState | null {
    try {
      const stored = localStorage.getItem(STORAGE_KEYS.CAMPAIGN_RUNS);
      if (!stored) return null;
      const runs: Record<string, CampaignRunState> = JSON.parse(stored);
      return runs[campaignId] || null;
    } catch {
      return null;
    }
  }

  static saveCampaignRun(run: CampaignRunState): void {
    try {
      const stored = localStorage.getItem(STORAGE_KEYS.CAMPAIGN_RUNS);
      const runs: Record<string, CampaignRunState> = stored ? JSON.parse(stored) : {};
      runs[run.campaignId] = run;
      localStorage.setItem(STORAGE_KEYS.CAMPAIGN_RUNS, JSON.stringify(runs));
      void LocalWorkspaceService.writeCampaignRuns(runs);
    } catch (e) {
      console.error('Failed to save campaign run', e);
    }
  }

  static deleteCampaignRun(campaignId: string): void {
    try {
      const stored = localStorage.getItem(STORAGE_KEYS.CAMPAIGN_RUNS);
      if (!stored) return;
      const runs: Record<string, CampaignRunState> = JSON.parse(stored);
      delete runs[campaignId];
      localStorage.setItem(STORAGE_KEYS.CAMPAIGN_RUNS, JSON.stringify(runs));
      void LocalWorkspaceService.writeCampaignRuns(runs);
    } catch (e) {
      console.error('Failed to delete campaign run', e);
    }
  }

  // --- FULL DATA BUNDLE (Cards + Challenges + Campaigns) ---
  static exportFullBundleJson(): string {
    const bundle = {
      version: '1.1',
      exportedAt: new Date().toISOString(),
      customCards: this.getCustomCards(),
      customChallenges: this.getCustomChallenges(),
      customCampaigns: this.getCustomCampaigns(),
    };
    return JSON.stringify(bundle, null, 2);
  }

  static importFullBundleJson(jsonString: string): {
    success: boolean;
    cardsCount: number;
    challengesCount: number;
    campaignsCount: number;
    error?: string;
  } {
    try {
      const validation = this.validateFullBundleJson(jsonString);
      if (!validation.success) throw new Error(validation.error || 'Invalid JSON');
      const parsed = parseImportJson(jsonString);
      let cardsCount = 0;
      let challengesCount = 0;
      let campaignsCount = 0;

      if (parsed.customCards || parsed.cards) {
        const cardsRes = this.importCardsJson(JSON.stringify(parsed.customCards || parsed.cards));
        if (cardsRes.success) cardsCount = cardsRes.count;
      }
      if (parsed.customChallenges || parsed.challenges) {
        const chRes = this.importChallengesJson(JSON.stringify(parsed.customChallenges || parsed.challenges));
        if (chRes.success) challengesCount = chRes.count;
      }
      if (parsed.customCampaigns || parsed.campaigns) {
        const campRes = this.importCampaignsJson(JSON.stringify(parsed.customCampaigns || parsed.campaigns));
        if (campRes.success) campaignsCount = campRes.count;
      }

      // Fallback: try individual types
      if (cardsCount === 0 && challengesCount === 0 && campaignsCount === 0) {
        const asCamp = this.importCampaignsJson(jsonString);
        if (asCamp.success && asCamp.count > 0) {
          campaignsCount = asCamp.count;
        } else {
          const asCards = this.importCardsJson(jsonString);
          if (asCards.success && asCards.count > 0) {
            cardsCount = asCards.count;
          } else {
            const asCh = this.importChallengesJson(jsonString);
            if (asCh.success && asCh.count > 0) {
              challengesCount = asCh.count;
            } else {
              throw new Error('Could not recognize cards, battles, or campaigns format in this file.');
            }
          }
        }
      }

      return { success: true, cardsCount, challengesCount, campaignsCount };
    } catch (err: any) {
      return { success: false, cardsCount: 0, challengesCount: 0, campaignsCount: 0, error: err.message || 'Invalid JSON' };
    }
  }

  static validateFullBundleJson(jsonString: string): { success: boolean; error?: string } {
    try {
      const parsed = parseImportJson(jsonString);
      if (!isRecord(parsed)) throw new Error('Imported bundle must be a JSON object.');
      const cards = parsed.customCards || parsed.cards;
      const challenges = parsed.customChallenges || parsed.challenges;
      const campaigns = parsed.customCampaigns || parsed.campaigns;
      if (cards) getImportedCollection(cards, 'cards', validateImportedCard, 'cards');
      if (challenges) getImportedCollection(challenges, 'challenges', validateImportedChallenge, 'challenges');
      if (campaigns) getImportedCollection(campaigns, 'campaigns', validateImportedCampaign, 'campaigns');
      if (!cards && !challenges && !campaigns) {
        const validators = [
          () => getImportedCollection(parsed, 'campaigns', validateImportedCampaign, 'campaigns'),
          () => getImportedCollection(parsed, 'cards', validateImportedCard, 'cards'),
          () => getImportedCollection(parsed, 'challenges', validateImportedChallenge, 'challenges'),
        ];
        for (const validate of validators) {
          try {
            validate();
            return { success: true };
          } catch {
            // Try the next supported standalone import format.
          }
        }
        throw new Error('Could not recognize cards, battles, or campaigns format in this file.');
      }
      return { success: true };
    } catch (err: any) {
      return { success: false, error: err.message || 'Invalid JSON' };
    }
  }

  // --- BATTLE LOGS ---
  static getBattleHistory(): BattleLog[] {
    try {
      const stored = localStorage.getItem(STORAGE_KEYS.BATTLE_HISTORY);
      return stored ? JSON.parse(stored) : [];
    } catch {
      return [];
    }
  }

  static saveBattleLog(log: BattleLog): void {
    try {
      const history = this.getBattleHistory();
      history.unshift(log);
      // Keep up to 20 most recent logs
      if (history.length > 20) {
        history.length = 20;
      }
      localStorage.setItem(STORAGE_KEYS.BATTLE_HISTORY, JSON.stringify(history));
      void LocalWorkspaceService.writeCreation('battles', log);
    } catch (e) {
      console.error('Failed to save battle log', e);
    }
  }

  static clearBattleHistory(): void {
    localStorage.removeItem(STORAGE_KEYS.BATTLE_HISTORY);
  }

  // --- PLAYER SPLINTERLANDS COLLECTION ---
  static getPlayerCollection(): PlayerCollectionState | null {
    try {
      const stored = localStorage.getItem(STORAGE_KEYS.PLAYER_COLLECTION);
      return stored ? JSON.parse(stored) : null;
    } catch {
      return null;
    }
  }

  static savePlayerCollection(collection: PlayerCollectionState): void {
    try {
      localStorage.setItem(STORAGE_KEYS.PLAYER_COLLECTION, JSON.stringify(collection));
    } catch (e) {
      console.error('Failed to save player collection', e);
    }
  }

  static clearPlayerCollection(): void {
    localStorage.removeItem(STORAGE_KEYS.PLAYER_COLLECTION);
  }

  static getCollectionFilterMode(): 'all' | 'owned_only' {
    try {
      const stored = localStorage.getItem(STORAGE_KEYS.PLAYER_FILTER_MODE);
      return stored === 'owned_only' ? 'owned_only' : 'all';
    } catch {
      return 'all';
    }
  }

  static setCollectionFilterMode(mode: 'all' | 'owned_only'): void {
    localStorage.setItem(STORAGE_KEYS.PLAYER_FILTER_MODE, mode);
  }
}
