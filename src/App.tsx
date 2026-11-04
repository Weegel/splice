import React, { useState, useEffect } from 'react';
import { CardDefinition } from './types/card';
import { PvEChallenge, TeamSelection, BattleLog } from './types/battle';
import { CampaignDefinition } from './types/campaign';
import { LocalPlayerProfile } from './types/profile';
import { StorageService } from './data/storage';
import { BattleEngine } from './engine/battleEngine';
import { CardEditor } from './components/CardEditor';
import { ChallengeBuilder } from './components/ChallengeBuilder';
import { CampaignEditor } from './components/CampaignEditor';
import { CampaignPlayer } from './components/CampaignPlayer';
import { BattlePreparation } from './components/BattlePreparation';
import { BattleViewer } from './components/BattleViewer';
import { SandboxSimulator } from './components/SandboxSimulator';
import { PlayerProfileModal } from './components/PlayerProfileModal';
import { PlayerCollectionState, SplinterlandsApiService } from './services/splinterlandsApi';
import { LocalWorkspaceService } from './services/localWorkspace';
import { ProfileSetupModal } from './components/ProfileSetupModal';
import { isOfficialSplCardId } from './data/cardIds';
import {
  Swords,
  Sparkles,
  ShieldAlert,
  FlaskConical,
  Flame,
  Award,
  History,
  Info,
  Download,
  Upload,
  BookOpen,
  User,
} from 'lucide-react';

type AppTab = 'campaigns' | 'challenges' | 'card_editor' | 'sandbox' | 'history';

export default function App() {
  const [activeTab, setActiveTab] = useState<AppTab>('campaigns');
  const [cards, setCards] = useState<CardDefinition[]>([]);
  const [challenges, setChallenges] = useState<PvEChallenge[]>([]);
  const [campaigns, setCampaigns] = useState<CampaignDefinition[]>([]);

  // Player Splinterlands Collection State
  const [playerCollection, setPlayerCollection] = useState<PlayerCollectionState | null>(() =>
    StorageService.getActiveProfile()
      ? StorageService.getActiveProfile()?.collection || null
      : StorageService.getPlayerCollection()
  );
  const [filterMode, setFilterMode] = useState<'all' | 'owned_only'>(() =>
    StorageService.getCollectionFilterMode()
  );
  const [isProfileModalOpen, setIsProfileModalOpen] = useState<boolean>(false);
  const [profiles, setProfiles] = useState<LocalPlayerProfile[]>(() => StorageService.getProfiles());
  const [activeProfile, setActiveProfile] = useState<LocalPlayerProfile | null>(() => StorageService.getActiveProfile());
  const [isProfileSetupOpen, setIsProfileSetupOpen] = useState(false);

  // Navigation flow states
  const [activeChallenge, setActiveChallenge] = useState<PvEChallenge | null>(null);
  const [activeCampaign, setActiveCampaign] = useState<CampaignDefinition | null>(null);
  const [activeBattleLog, setActiveBattleLog] = useState<BattleLog | null>(null);

  // Load cards, challenges, and campaigns from storage on mount
  useEffect(() => {
    loadData();
    void SplinterlandsApiService.fetchCardCatalog().then((catalog) => {
      if (catalog.length > 0) {
        StorageService.saveApiCards(catalog);
        loadData();
      }
    });
  }, []);

  useEffect(() => {
    void LocalWorkspaceService.loadLocalCreations().then((localCreations) => {
      if (localCreations.campaignRuns != null) {
        StorageService.hydrateCampaignRuns(localCreations.campaignRuns);
      } else {
        const existingRuns = StorageService.getCampaignRuns();
        if (Object.keys(existingRuns).length > 0) void LocalWorkspaceService.writeCampaignRuns(existingRuns);
      }
      if (localCreations.profiles) {
        StorageService.hydrateProfiles(localCreations.profiles, localCreations.activeProfileId);
      } else {
        const existingProfiles = StorageService.getProfiles();
        const activeProfileId = StorageService.getActiveProfile()?.id || null;
        if (existingProfiles.length > 0) void LocalWorkspaceService.writeProfiles(existingProfiles, activeProfileId);
      }
      const hasLocalCreations =
        localCreations.cards.length > 0 ||
        localCreations.challenges.length > 0 ||
        localCreations.campaigns.length > 0 ||
        localCreations.battleLogs.length > 0;
      if (hasLocalCreations) {
        StorageService.hydrateLocalCreations(localCreations);
      }
      loadData();
      setIsProfileSetupOpen(!StorageService.getActiveProfile());
    });
  }, []);

  const loadData = () => {
    setCards(StorageService.getCards());
    setChallenges(StorageService.getChallenges());
    setCampaigns(StorageService.getCampaigns());
    const profile = StorageService.getActiveProfile();
    setPlayerCollection(profile ? profile.collection || null : StorageService.getPlayerCollection());
    setProfiles(StorageService.getProfiles());
    setActiveProfile(StorageService.getActiveProfile());
  };

  const handleCreateProfile = (name: string): string | null => {
    try {
      const profile = StorageService.createProfile(name);
      setActiveProfile(profile);
      setProfiles(StorageService.getProfiles());
      setIsProfileSetupOpen(false);
      return null;
    } catch (error: any) {
      return error?.message || 'Could not create profile.';
    }
  };

  const handleSelectProfile = (profile: LocalPlayerProfile) => {
    StorageService.saveProfile(profile);
    setActiveProfile(profile);
    setPlayerCollection(profile.collection || null);
    setIsProfileSetupOpen(false);
  };

  const handleSyncProfile = (profile: LocalPlayerProfile) => {
    StorageService.saveProfile(profile);
    setActiveProfile(profile);
    setPlayerCollection(profile.collection || null);
    setIsProfileSetupOpen(false);
    setIsProfileModalOpen(true);
  };

  const handleDisconnectProfile = (profile: LocalPlayerProfile) => {
    const updatedProfile = { ...profile, linkedUsername: undefined, collection: undefined };
    StorageService.saveProfile(updatedProfile);
    setProfiles(StorageService.getProfiles());
    if (activeProfile?.id === profile.id) {
      setActiveProfile(updatedProfile);
      setPlayerCollection(null);
      setIsProfileModalOpen(false);
    }
  };

  const handleImportDiscoveredCards = (newCards: CardDefinition[]) => {
    StorageService.saveApiCards(newCards);
    // Clean up any spl_ cards that might have accidentally been saved into customCards
    const rawCustom = StorageService.getCustomCards();
    const cleanCustom = rawCustom.filter((c) => !isOfficialSplCardId(c.id));
    if (cleanCustom.length !== rawCustom.length) {
      localStorage.setItem('splinter_custom_cards', JSON.stringify(cleanCustom));
    }
    loadData();
  };

  const handleStartChallenge = (challenge: PvEChallenge) => {
    if (!playerCollection) {
      setIsProfileModalOpen(true);
      return;
    }
    setActiveChallenge(challenge);
  };

  const handlePlayCampaign = (campaign: CampaignDefinition) => {
    if (campaign.collectionSource !== 'custom' && !playerCollection) {
      if (window.confirm('This campaign requires your account to be synced. Sync your account now?')) {
        setIsProfileModalOpen(true);
      }
      return;
    }
    setActiveCampaign(campaign);
  };

  const handleLaunchBattle = (playerTeam: TeamSelection) => {
    if (!activeChallenge) return;

    const engine = new BattleEngine(
      cards,
      activeChallenge.rulesets,
      activeChallenge.manaCap,
      playerTeam,
      activeChallenge.enemyTeam,
      activeChallenge.allowedSplinters
    );

    const log = engine.resolve();
    StorageService.saveBattleLog(log);
    setActiveBattleLog(log);
  };

  const handleLaunchSandboxBattle = (log: BattleLog) => {
    StorageService.saveBattleLog(log);
    setActiveBattleLog(log);
  };

  const handleExitViewer = () => {
    setActiveBattleLog(null);
  };

  const handleRematch = () => {
    setActiveBattleLog(null);
    // Keeps activeChallenge to allow tweaking lineup in BattlePreparation
  };

  const handleExportFullStudioBundle = () => {
    const data = StorageService.exportFullBundleJson();
    const blob = new Blob([data], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `splinter_studio_bundle_${Date.now()}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleImportFullStudioBundle = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    let totalCards = 0;
    let totalChallenges = 0;
    let filesProcessed = 0;

    Array.from(files).forEach((file) => {
      const reader = new FileReader();
      reader.onload = (evt) => {
        const content = evt.target?.result as string;
        const res = StorageService.importFullBundleJson(content);
        if (res.success) {
          totalCards += res.cardsCount;
          totalChallenges += res.challengesCount;
        }
        filesProcessed++;
        if (filesProcessed === files.length) {
          loadData();
          alert(`Successfully imported ${totalCards} custom card(s) and ${totalChallenges} challenge(s) from ${files.length} file(s)!`);
        }
      };
      reader.readAsText(file);
    });
    e.target.value = '';
  };

  return (
    <div className="min-h-screen flex flex-col selection:bg-rose-500 selection:text-white">
      {/* Top Navbar */}
      <header className="bg-slate-900/90 border-b border-slate-800 backdrop-blur-md sticky top-0 z-40">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 py-3 flex items-center justify-between">
          {/* Brand Logo & Title */}
          <div
            onClick={() => {
              setActiveBattleLog(null);
              setActiveChallenge(null);
              setActiveTab('challenges');
            }}
            className="flex items-center gap-3 cursor-pointer group"
          >
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-rose-600 via-amber-600 to-yellow-500 flex items-center justify-center shadow-lg shadow-rose-600/30 group-hover:scale-105 transition transform">
              <Flame className="w-6 h-6 text-white" />
            </div>
            <div>
              <h1 className="font-fantasy font-black text-lg tracking-wider text-transparent bg-clip-text bg-gradient-to-r from-rose-400 via-amber-300 to-yellow-400">
                SPLINTERLANDS
              </h1>
              <div className="text-[10px] uppercase font-bold tracking-widest text-slate-400 -mt-1">
                PvE Studio & Battle Simulator
              </div>
            </div>
          </div>

          {/* Navigation Tabs & Global Import/Export */}
          {!activeBattleLog && !activeCampaign && (
            <div className="flex items-center gap-2 sm:gap-3">
              <nav className="flex items-center gap-1.5 sm:gap-2 overflow-x-auto">
                <button
                  onClick={() => {
                    setActiveChallenge(null);
                    setActiveTab('campaigns');
                  }}
                  className={`flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs sm:text-sm font-bold transition ${
                    activeTab === 'campaigns' && !activeChallenge
                      ? 'bg-amber-600 text-white shadow-lg shadow-amber-600/20'
                      : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800'
                  }`}
                >
                  <BookOpen className="w-4 h-4" />
                  <span>Campaigns</span>
                </button>

                <button
                  onClick={() => {
                    setActiveChallenge(null);
                    setActiveTab('challenges');
                  }}
                  className={`flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs sm:text-sm font-bold transition ${
                    activeTab === 'challenges' && !activeChallenge
                      ? 'bg-rose-600 text-white shadow-lg shadow-rose-600/20'
                      : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800'
                  }`}
                >
                  <Swords className="w-4 h-4" />
                  <span>PvE Battles</span>
                </button>

                <button
                  onClick={() => {
                    setActiveChallenge(null);
                    setActiveTab('card_editor');
                  }}
                  className={`flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs sm:text-sm font-bold transition ${
                    activeTab === 'card_editor'
                      ? 'bg-rose-600 text-white shadow-lg shadow-rose-600/20'
                      : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800'
                  }`}
                >
                  <Sparkles className="w-4 h-4" />
                  <span>Card Forge</span>
                </button>

                <button
                  onClick={() => {
                    setActiveChallenge(null);
                    setActiveTab('sandbox');
                  }}
                  className={`flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs sm:text-sm font-bold transition ${
                    activeTab === 'sandbox'
                      ? 'bg-rose-600 text-white shadow-lg shadow-rose-600/20'
                      : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800'
                  }`}
                >
                  <FlaskConical className="w-4 h-4" />
                  <span>Sandbox Arena</span>
                </button>

                <button
                  onClick={() => {
                    setActiveChallenge(null);
                    setActiveTab('history');
                  }}
                  className={`flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs sm:text-sm font-bold transition ${
                    activeTab === 'history'
                      ? 'bg-rose-600 text-white shadow-lg shadow-rose-600/20'
                      : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800'
                  }`}
                >
                  <History className="w-4 h-4" />
                  <span>History</span>
                </button>
              </nav>

              {/* Active Local Profile Selector */}
              <button
                onClick={() => setIsProfileSetupOpen(true)}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl border bg-slate-800 border-slate-700 text-slate-200 hover:bg-slate-700 transition shadow-sm text-xs font-bold"
                title="Switch local player profile or create a new one"
              >
                <User className="w-3.5 h-3.5 text-amber-400" />
                <span className="max-w-[110px] truncate">{activeProfile?.name || 'Select Profile'}</span>
              </button>

              {/* Global Bundle Import/Export Hub */}
              <div className="hidden md:flex items-center gap-1.5 pl-2 border-l border-slate-800">
                <button
                  onClick={handleExportFullStudioBundle}
                  className="px-2.5 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg text-xs font-semibold flex items-center gap-1 border border-slate-700 transition"
                  title="Export complete custom studio collection (all custom cards, battles & campaigns)"
                >
                  <Download className="w-3.5 h-3.5" />
                  <span>Backup All</span>
                </button>
                <label
                  className="px-2.5 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg text-xs font-semibold flex items-center gap-1 border border-slate-700 transition cursor-pointer"
                  title="Import cards, battles, campaigns, or full backup bundles"
                >
                  <Upload className="w-3.5 h-3.5" />
                  <span>Import Any</span>
                  <input type="file" accept=".json" multiple onChange={handleImportFullStudioBundle} className="hidden" />
                </label>
              </div>
            </div>
          )}
        </div>
      </header>

      {/* Main Content Area */}
      <main className="flex-1 max-w-7xl w-full mx-auto p-4 sm:p-6 lg:p-8">
        {activeBattleLog ? (
          /* 1. Active Battle Replay Viewer */
          <BattleViewer
            battleLog={activeBattleLog}
            onExit={handleExitViewer}
            onRematch={activeChallenge ? handleRematch : undefined}
          />
        ) : activeCampaign ? (
          /* 2. Interactive Campaign Adventure Player */
          <CampaignPlayer
            campaign={activeCampaign}
            cards={cards}
            challenges={challenges}
            playerCollection={playerCollection}
            onExit={() => setActiveCampaign(null)}
          />
        ) : activeChallenge ? (
          /* 3. Team Selection & Battle Preparation */
          <BattlePreparation
            challenge={activeChallenge}
            cards={cards}
            playerCollection={playerCollection}
            onBack={() => setActiveChallenge(null)}
            onLaunchBattle={handleLaunchBattle}
          />
        ) : activeTab === 'campaigns' ? (
          /* 4. Interactive Campaigns Studio */
          <CampaignEditor
            campaigns={campaigns}
            challenges={challenges}
            cards={cards}
            onCampaignsUpdated={loadData}
            onPlayCampaign={handlePlayCampaign}
          />
        ) : activeTab === 'challenges' ? (
          /* 5. PvE Challenges & Encounter Forge */
          <ChallengeBuilder
            challenges={challenges}
            cards={cards}
            onChallengesUpdated={loadData}
            onStartChallenge={handleStartChallenge}
          />
        ) : activeTab === 'card_editor' ? (
          /* 6. Non-NFT Custom Card Bestiary & Editor */
          <CardEditor cards={cards} onCardsUpdated={loadData} />
        ) : activeTab === 'sandbox' ? (
          /* 7. Free Sandbox Simulator (100x Monte Carlo) */
          <SandboxSimulator cards={cards} onLaunchVisualBattle={handleLaunchSandboxBattle} />
        ) : (
          /* 8. Battle History */
          <div className="space-y-4">
            <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-5 shadow-xl flex items-center justify-between">
              <div>
                <h2 className="text-xl font-bold font-fantasy text-slate-100 flex items-center gap-2">
                  <History className="w-5 h-5 text-amber-400" />
                  Recent Battle Log History
                </h2>
                <p className="text-xs text-slate-400">Review and replay your past Splinterlands battle records.</p>
              </div>
              <button
                onClick={() => {
                  StorageService.clearBattleHistory();
                  loadData();
                }}
                className="px-3 py-1.5 bg-slate-800 hover:bg-rose-950 text-slate-300 hover:text-rose-300 border border-slate-700 rounded-xl text-xs font-semibold"
              >
                Clear History
              </button>
            </div>

            <div className="space-y-3">
              {StorageService.getBattleHistory().map((log) => (
                <div
                  key={log.id}
                  className="bg-slate-900/80 border border-slate-800 rounded-xl p-4 flex items-center justify-between gap-4 hover:border-slate-700 transition"
                >
                  <div>
                    <div className="flex items-center gap-2">
                      <span
                        className={`text-xs px-2 py-0.5 rounded font-bold uppercase ${
                          log.winner === 1
                            ? 'bg-emerald-950 text-emerald-300 border border-emerald-600'
                            : log.winner === 2
                            ? 'bg-rose-950 text-rose-300 border border-rose-600'
                            : 'bg-yellow-950 text-yellow-300 border border-yellow-600'
                        }`}
                      >
                        {log.winner === 1 ? 'Victory' : log.winner === 2 ? 'Defeat' : 'Draw'}
                      </span>
                      <span className="font-bold text-sm text-slate-200">
                        {log.summoner1.name} vs {log.summoner2.name}
                      </span>
                    </div>
                    <div className="text-xs text-slate-400 mt-1 flex items-center gap-2">
                      <span>{new Date(log.timestamp).toLocaleTimeString()}</span>
                      <span>•</span>
                      <span>{log.totalRounds} Rounds</span>
                      <span>•</span>
                      <span>Rules: {log.rulesets.join(', ')}</span>
                    </div>
                  </div>

                  <button
                    onClick={() => setActiveBattleLog(log)}
                    className="px-4 py-2 bg-rose-600 hover:bg-rose-500 text-white text-xs font-bold rounded-xl shadow transition"
                  >
                    Replay Battle
                  </button>
                </div>
              ))}

              {StorageService.getBattleHistory().length === 0 && (
                <div className="text-center py-12 text-slate-500 text-xs bg-slate-900/30 rounded-xl border border-slate-800">
                  No battles logged yet. Play a challenge or sandbox match to record battles!
                </div>
              )}
            </div>
          </div>
        )}
      </main>

      {/* Player Profile & Collection Sync Modal */}
      <PlayerProfileModal
        isOpen={isProfileModalOpen}
        onClose={() => setIsProfileModalOpen(false)}
        cards={cards}
        playerCollection={playerCollection}
        onCollectionUpdated={(newCol) => {
          setPlayerCollection(newCol);
          const profile = StorageService.getActiveProfile();
          if (profile) {
            profile.collection = newCol || undefined;
            profile.linkedUsername = newCol?.username;
            StorageService.saveProfile(profile);
            setActiveProfile(profile);
            setProfiles(StorageService.getProfiles());
          }
        }}
        filterMode={filterMode}
        onFilterModeChange={(mode) => setFilterMode(mode)}
        onImportDiscoveredCards={handleImportDiscoveredCards}
      />

      <ProfileSetupModal
        profiles={profiles}
        isOpen={isProfileSetupOpen}
        onCreate={handleCreateProfile}
        onSelect={handleSelectProfile}
        onSync={handleSyncProfile}
        onDisconnect={handleDisconnectProfile}
      />

      {/* Footer */}
      <footer className="border-t border-slate-800/80 bg-slate-950/80 py-4 text-center text-xs text-slate-500">
        Standalone Splinterlands PvE Battle Studio • Complete Non-NFT Custom Bestiary & Combat Engine
      </footer>
    </div>
  );
}
