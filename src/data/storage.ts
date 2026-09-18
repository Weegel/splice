import { CardDefinition } from '../types/card';
import { PvEChallenge, BattleLog } from '../types/battle';
import { CampaignDefinition, CampaignRunState } from '../types/campaign';
import { LocalPlayerProfile } from '../types/profile';
import { PlayerCollectionState } from '../services/splinterlandsApi';
import { LocalWorkspaceService } from '../services/localWorkspace';
import { DEFAULT_CARDS } from './defaultCards';
import { DEFAULT_CHALLENGES } from './defaultChallenges';
import { DEFAULT_CAMPAIGNS } from './defaultCampaigns';

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
    const index = profiles.findIndex((item) => item.id === profile.id);
    if (index >= 0) profiles[index] = profile;
    else profiles.push(profile);
    localStorage.setItem(STORAGE_KEYS.PROFILES, JSON.stringify(profiles));
    localStorage.setItem(STORAGE_KEYS.ACTIVE_PROFILE, profile.id);
  }

  static createProfile(name: string): LocalPlayerProfile {
    const profile: LocalPlayerProfile = {
      id: `profile_${Date.now()}`,
      name: name.trim() || 'Player Profile',
      createdAt: Date.now(),
    };
    this.saveProfile(profile);
    return profile;
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
    (data.campaigns || []).forEach((campaign) => campaignMap.set(campaign.id, { ...campaign, isCustom: Boolean(campaign.isCustom) }));
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
      const nameMap = new Map<string, string>(); // normalized card name -> card ID

      // 1. Base game cards
      DEFAULT_CARDS.forEach((c) => {
        cardMap.set(c.id, { ...c });
        nameMap.set(c.name.toLowerCase().trim(), c.id);
      });

      // 2. Splinterlands API synced cards
      const apiCards = this.getApiCards();
      apiCards.forEach((c) => {
        const normName = c.name.toLowerCase().trim();
        const existingId = nameMap.get(normName);
        if (existingId) {
          // Merge API stats into existing base card so we don't have duplicate cards
          const existing = cardMap.get(existingId)!;
          cardMap.set(existingId, {
            ...existing,
            ...c,
            id: existingId,
            summonerBuffs: existing.summonerBuffs || c.summonerBuffs,
            isCustom: false,
          });
        } else {
          cardMap.set(c.id, { ...c, isCustom: false });
          nameMap.set(normName, c.id);
        }
      });

      // 3. User-created custom cards
      const customCards = this.getCustomCards();
      customCards.forEach((c) => {
        cardMap.set(c.id, { ...c, isCustom: true });
      });

      return Array.from(cardMap.values());
    } catch (e) {
      console.error('Failed to load cards from storage', e);
      return DEFAULT_CARDS;
    }
  }

  static getCustomCards(): CardDefinition[] {
    try {
      const stored = localStorage.getItem(STORAGE_KEYS.CARDS);
      if (!stored) return [];
      const list: CardDefinition[] = JSON.parse(stored);
      // Ensure cards fetched from Splinterlands API (starting with spl_) are never flagged or stored as custom cards
      const clean = list.filter((c) => !c.id.startsWith('spl_'));
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
      const existing = this.getApiCards();
      const map = new Map<string, CardDefinition>();
      existing.forEach((c) => map.set(c.id, c));
      newCards.forEach((c) => map.set(c.id, { ...c, isCustom: false }));
      localStorage.setItem(STORAGE_KEYS.API_CARDS, JSON.stringify(Array.from(map.values())));
    } catch (e) {
      console.error('Failed to save API cards', e);
    }
  }

  static saveCard(card: CardDefinition): void {
    const customCards = this.getCustomCards();
    const existingIndex = customCards.findIndex((c) => c.id === card.id);
    const updatedCard = { ...card, isCustom: true };
    
    if (existingIndex >= 0) {
      customCards[existingIndex] = updatedCard;
    } else {
      customCards.push(updatedCard);
    }
    
    localStorage.setItem(STORAGE_KEYS.CARDS, JSON.stringify(customCards));
    void LocalWorkspaceService.writeCreation('cards', updatedCard);
  }

  static deleteCard(id: string): void {
    const customCards = this.getCustomCards().filter((c) => c.id !== id);
    localStorage.setItem(STORAGE_KEYS.CARDS, JSON.stringify(customCards));
  }

  static exportCardsJson(includeDefaults = false): string {
    const cardsToExport = includeDefaults ? this.getCards() : this.getCustomCards();
    return JSON.stringify(cardsToExport, null, 2);
  }

  static importCardsJson(jsonString: string): { success: boolean; count: number; error?: string } {
    try {
      let parsed = JSON.parse(jsonString);
      // Support single card object or array of cards
      if (!Array.isArray(parsed)) {
        if (parsed && typeof parsed === 'object' && parsed.id && parsed.name) {
          parsed = [parsed];
        } else if (parsed && typeof parsed === 'object' && Array.isArray(parsed.cards)) {
          parsed = parsed.cards;
        } else {
          throw new Error('Imported data must be an array of card definitions or a single card object.');
        }
      }
      const existing = this.getCustomCards();
      const map = new Map<string, CardDefinition>();
      existing.forEach((c) => map.set(c.id, c));
      let count = 0;
      for (const card of parsed) {
        if (card.id && card.name && card.stats) {
          map.set(card.id, { ...card, isCustom: true });
          count++;
        }
      }
      localStorage.setItem(STORAGE_KEYS.CARDS, JSON.stringify(Array.from(map.values())));
      return { success: true, count };
    } catch (err: any) {
      return { success: false, count: 0, error: err.message || 'Invalid JSON' };
    }
  }

  // --- CHALLENGES ---
  static getChallenges(): PvEChallenge[] {
    try {
      const stored = localStorage.getItem(STORAGE_KEYS.CHALLENGES);
      if (!stored) {
        return DEFAULT_CHALLENGES;
      }
      const customChallenges: PvEChallenge[] = JSON.parse(stored);
      const challengeMap = new Map<string, PvEChallenge>();
      DEFAULT_CHALLENGES.forEach((ch) => challengeMap.set(ch.id, ch));
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
  }

  static exportChallengesJson(includeDefaults = false): string {
    const challengesToExport = includeDefaults ? this.getChallenges() : this.getCustomChallenges();
    return JSON.stringify(challengesToExport, null, 2);
  }

  static importChallengesJson(jsonString: string): { success: boolean; count: number; error?: string } {
    try {
      let parsed = JSON.parse(jsonString);
      // Support single challenge or array or bundle wrapper
      if (!Array.isArray(parsed)) {
        if (parsed && typeof parsed === 'object' && parsed.id && parsed.name && parsed.enemyTeam) {
          parsed = [parsed];
        } else if (parsed && typeof parsed === 'object' && Array.isArray(parsed.challenges)) {
          parsed = parsed.challenges;
        } else {
          throw new Error('Imported data must be an array of PvE challenges or a single challenge object.');
        }
      }
      const existing = this.getCustomChallenges();
      const map = new Map<string, PvEChallenge>();
      existing.forEach((c) => map.set(c.id, c));
      let count = 0;
      for (const ch of parsed) {
        if (ch.id && ch.name && ch.enemyTeam) {
          map.set(ch.id, { ...ch, isCustom: true });
          count++;
        }
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
      const customCampaigns: CampaignDefinition[] = JSON.parse(stored);
      const campaignMap = new Map<string, CampaignDefinition>();
      DEFAULT_CAMPAIGNS.forEach((c) => campaignMap.set(c.id, c));
      customCampaigns.forEach((c) => campaignMap.set(c.id, { ...c, isCustom: true }));
      return Array.from(campaignMap.values());
    } catch (e) {
      console.error('Failed to load campaigns', e);
      return DEFAULT_CAMPAIGNS;
    }
  }

  static getCustomCampaigns(): CampaignDefinition[] {
    try {
      const stored = localStorage.getItem(STORAGE_KEYS.CAMPAIGNS);
      return stored ? JSON.parse(stored) : [];
    } catch {
      return [];
    }
  }

  static saveCampaign(campaign: CampaignDefinition): void {
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
      .map((challenge) => ({ ...challenge })),
      ...inlineChallenges,
    ];
    const referencedCardIds = embeddedChallenges.flatMap((challenge) => [
      challenge.enemyTeam.summonerId,
      ...challenge.enemyTeam.monsters.map((monster) => monster.cardId),
      ...(challenge.embeddedCards || []).map((card) => card.id),
    ]);
    const embeddedCards = this.getCards()
      .filter((card) => referencedCardIds.includes(card.id))
      .map((card) => ({ ...card }));
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

  static importCampaignsJson(jsonString: string): { success: boolean; count: number; error?: string } {
    try {
      let parsed = JSON.parse(jsonString);
      if (!Array.isArray(parsed)) {
        if (parsed && typeof parsed === 'object' && parsed.id && parsed.name && parsed.nodes) {
          parsed = [parsed];
        } else if (parsed && typeof parsed === 'object' && Array.isArray(parsed.campaigns)) {
          parsed = parsed.campaigns;
        } else {
          throw new Error('Imported data must be an array of campaigns or a single campaign object.');
        }
      }
      const existing = this.getCustomCampaigns();
      const map = new Map<string, CampaignDefinition>();
      existing.forEach((c) => map.set(c.id, c));
      let count = 0;
      for (const camp of parsed) {
        if (camp.id && camp.name && camp.nodes && camp.startNodeId) {
          map.set(camp.id, { ...camp, isCustom: true });
          count++;
        }
      }
      localStorage.setItem(STORAGE_KEYS.CAMPAIGNS, JSON.stringify(Array.from(map.values())));
      return { success: true, count };
    } catch (err: any) {
      return { success: false, count: 0, error: err.message || 'Invalid JSON' };
    }
  }

  // --- CAMPAIGN RUN PROGRESSION ---
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
      const parsed = JSON.parse(jsonString);
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
