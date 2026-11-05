import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  CampaignDefinition,
  CampaignNode,
  CampaignNodeType,
  TextCampaignNode,
  DecisionCampaignNode,
  BattleCampaignNode,
  EndCampaignNode,
  DecisionChoice,
  HubPointOfInterest,
  PointOfInterestType,
} from '../types/campaign';
import { PvEChallenge } from '../types/battle';
import { CardDefinition, Splinter } from '../types/card';
import { SPLINTERLANDS_EDITIONS } from '../data/editions';
import { StorageService } from '../data/storage';
import { getCampaignPlayerCardIds } from '../data/campaignEffects';
import { CampaignEffectsEditor } from './CampaignEffectsEditor';
import { CampaignEncounterGraph } from './CampaignEncounterGraph';
import { CampaignShopEditor } from './CampaignShopEditor';
import { CampaignItemsModal } from './CampaignItemsModal';
import { CampaignUnlocksModal } from './CampaignUnlocksModal';
import { CampaignActionsModal } from './CampaignActionsModal';
import { CampaignPreconditionsEditor } from './CampaignPreconditionsEditor';
import { CampaignItemSelect } from './CampaignItemSelect';
import { CampaignNodePicker } from './CampaignNodePicker';
import { getCampaignItems, saveCampaignItem } from '../data/campaignItems';
import { renameCampaignNode, selectCampaignBattle } from '../data/campaignNodes';
import { processImportFiles } from '../services/jsonImport';
import {
  BookOpen,
  Plus,
  Trash2,
  Copy,
  Edit,
  Download,
  Upload,
  Play,
  Check,
  X,
  FileText,
  GitFork,
  Swords,
  Flag,
  ArrowRight,
  Sparkles,
  Layers,
  AlertCircle,
  HelpCircle,
  Award,
  ExternalLink,
  Link2,
  MapPin,
  Settings,
  Package,
  Search,
  Shuffle,
  Store,
} from 'lucide-react';

interface CampaignEditorProps {
  campaigns: CampaignDefinition[];
  challenges: PvEChallenge[];
  cards: CardDefinition[];
  onCampaignsUpdated: () => void;
  onPlayCampaign: (campaign: CampaignDefinition) => void;
}

const NODE_TYPE_META: Record<
  CampaignNodeType,
  { label: string; icon: React.ComponentType<{ className?: string }>; color: string; border: string; bg: string }
> = {
  text: {
    label: 'Story / Text',
    icon: FileText,
    color: 'text-sky-400',
    border: 'border-sky-600/50',
    bg: 'bg-sky-950/40',
  },
  decision: {
    label: 'Decision / Choice',
    icon: GitFork,
    color: 'text-amber-400',
    border: 'border-amber-600/50',
    bg: 'bg-amber-950/40',
  },
  multi: {
    label: 'Multi / Weighted Selector',
    icon: Shuffle,
    color: 'text-cyan-400',
    border: 'border-cyan-600/50',
    bg: 'bg-cyan-950/40',
  },
  hub: {
    label: 'Hub / Points of Interest',
    icon: MapPin,
    color: 'text-teal-400',
    border: 'border-teal-600/50',
    bg: 'bg-teal-950/40',
  },
  battle: {
    label: 'Combat / Battle',
    icon: Swords,
    color: 'text-rose-400',
    border: 'border-rose-600/50',
    bg: 'bg-rose-950/40',
  },
  shop: {
    label: 'Shop / Barter',
    icon: Store,
    color: 'text-lime-400',
    border: 'border-lime-600/50',
    bg: 'bg-lime-950/40',
  },
  end: {
    label: 'Conclusion / End',
    icon: Flag,
    color: 'text-emerald-400',
    border: 'border-emerald-600/50',
    bg: 'bg-emerald-950/40',
  },
};

const MAX_LEVEL_BY_RARITY = { Common: 10, Rare: 8, Epic: 6, Legendary: 4 } as const;

export const CampaignEditor: React.FC<CampaignEditorProps> = ({
  campaigns,
  challenges,
  cards,
  onCampaignsUpdated,
  onPlayCampaign,
}) => {
  const [editingCampaign, setEditingCampaign] = useState<CampaignDefinition | null>(null);
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [showEncounterGraph, setShowEncounterGraph] = useState(false);
  const [nodeSearch, setNodeSearch] = useState('');
  const [battleSearch, setBattleSearch] = useState('');
  useEffect(() => { setBattleSearch(''); }, [selectedNodeId, editingCampaign?.id]);
  const [nodeTypeFilter, setNodeTypeFilter] = useState<CampaignNodeType | 'all'>('all');
  const [isAddNodeMenuOpen, setIsAddNodeMenuOpen] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [autosaveStatus, setAutosaveStatus] = useState<'saving' | 'saved' | 'error'>('saved');
  const pendingCampaign = useRef<CampaignDefinition | null>(null);
  const lastSavedCampaign = useRef<string | null>(null);
  const autosaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [collectionSearch, setCollectionSearch] = useState('');
  const [collectionSplinter, setCollectionSplinter] = useState<Splinter | 'ALL'>('ALL');
  const [collectionPickerType, setCollectionPickerType] = useState<CardDefinition['cardType'] | null>(null);
  const [isCollectionOpen, setIsCollectionOpen] = useState(false);
  const [isAdvancedSettingsOpen, setIsAdvancedSettingsOpen] = useState(false);
  const [isInventoryOpen, setIsInventoryOpen] = useState(false);
  const [isCampaignItemsOpen, setIsCampaignItemsOpen] = useState(false);
  const [isCampaignUnlocksOpen, setIsCampaignUnlocksOpen] = useState(false);
  const [isCampaignActionsOpen, setIsCampaignActionsOpen] = useState(false);
  const campaignUnlocksTrigger = useRef<HTMLButtonElement | null>(null);
  const campaignItemsTrigger = useRef<HTMLButtonElement | null>(null);
  const campaignItems = editingCampaign ? getCampaignItems(editingCampaign) : [];
  const campaignActions = editingCampaign?.actions || [];
  const collectionPickerTrigger = useRef<HTMLButtonElement | null>(null);
  const collectionViewTrigger = useRef<HTMLButtonElement | null>(null);
  const advancedSettingsTrigger = useRef<HTMLButtonElement | null>(null);
  const inventoryTrigger = useRef<HTMLButtonElement | null>(null);
  const editorCards = [...new Map([...(editingCampaign?.embeddedCards || []), ...cards].map((card) => [card.id, card])).values()];
  const editorChallenges = [...new Map([...(editingCampaign?.embeddedChallenges || []), ...challenges].map((challenge) => [challenge.id, challenge])).values()];
  const collectionPickerCards = editorCards.filter((card) =>
    card.cardType === collectionPickerType &&
    (collectionSplinter === 'ALL' || card.splinter === collectionSplinter) &&
    !editingCampaign?.startingCollection?.some((entry) => entry.cardId === card.id) &&
    `${card.name} ${card.splinter} ${card.rarity}`.toLowerCase().includes(collectionSearch.toLowerCase())
  );
  const closeCollectionPicker = () => {
    setCollectionPickerType(null);
    collectionPickerTrigger.current?.focus();
  };

  const closeCollectionView = () => {
    setIsCollectionOpen(false);
    collectionViewTrigger.current?.focus();
  };

  const closeAdvancedSettings = () => {
    setIsAdvancedSettingsOpen(false);
    advancedSettingsTrigger.current?.focus();
  };

  const closeInventory = () => {
    setIsInventoryOpen(false);
    inventoryTrigger.current?.focus();
  };

  const handleCollectionDialogKeyDown = (event: React.KeyboardEvent<HTMLDivElement>, close: () => void) => {
    if (event.key === 'Escape') {
      event.stopPropagation();
      close();
    } else if (event.key === 'Tab') {
      const controls = event.currentTarget.querySelectorAll<HTMLButtonElement | HTMLInputElement | HTMLSelectElement>('button, input, select');
      const firstControl = controls[0];
      const lastControl = controls[controls.length - 1];
      if (event.shiftKey && event.target === firstControl) {
        event.preventDefault();
        lastControl?.focus();
      } else if (!event.shiftKey && event.target === lastControl) {
        event.preventDefault();
        firstControl?.focus();
      }
    }
  };

  const packageCampaign = (campaign: CampaignDefinition): CampaignDefinition => {
    const referencedIds = new Set(getCampaignPlayerCardIds(campaign));
    const embedded = new Map((campaign.embeddedCards || []).map((card) => [card.id, card]));
    for (const card of cards) {
      if (card.isCustom && referencedIds.has(card.id)) embedded.set(card.id, card);
    }
    return { ...campaign, items: getCampaignItems(campaign), embeddedCards: [...embedded.values()] };
  };

  const autosaveActions = useRef({ packageCampaign, onCampaignsUpdated });
  autosaveActions.current = { packageCampaign, onCampaignsUpdated };

  const flushAutosave = useCallback((updateStatus = true): boolean => {
    if (autosaveTimer.current !== null) {
      clearTimeout(autosaveTimer.current);
      autosaveTimer.current = null;
    }
    const campaign = pendingCampaign.current;
    if (!campaign) return true;
    try {
      const packaged = autosaveActions.current.packageCampaign(campaign);
      const snapshot = JSON.stringify(packaged);
      if (snapshot === lastSavedCampaign.current) {
        pendingCampaign.current = null;
        if (updateStatus) setAutosaveStatus('saved');
        return true;
      }
      StorageService.saveCampaign(packaged);
      lastSavedCampaign.current = snapshot;
      pendingCampaign.current = null;
      if (updateStatus) setAutosaveStatus('saved');
      autosaveActions.current.onCampaignsUpdated();
      return true;
    } catch (error) {
      console.error('Campaign autosave failed', error);
      if (updateStatus) setAutosaveStatus('error');
      return false;
    }
  }, []);

  useEffect(() => {
    if (!editingCampaign) return;
    const snapshot = JSON.stringify(packageCampaign(editingCampaign));
    if (snapshot === lastSavedCampaign.current) {
      pendingCampaign.current = null;
      setAutosaveStatus('saved');
      return;
    }
    pendingCampaign.current = editingCampaign;
    setAutosaveStatus('saving');
    autosaveTimer.current = setTimeout(() => flushAutosave(), 600);
    return () => {
      if (autosaveTimer.current !== null) {
        clearTimeout(autosaveTimer.current);
        autosaveTimer.current = null;
      }
    };
  }, [editingCampaign, flushAutosave]);

  useEffect(() => {
    const handleBeforeUnload = (event: BeforeUnloadEvent) => {
      if (!flushAutosave(false)) {
        event.preventDefault();
        event.returnValue = '';
      }
    };
    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload);
      flushAutosave(false);
    };
  }, [flushAutosave]);

  const handleCloseEditor = () => {
    pendingCampaign.current = editingCampaign;
    if (!flushAutosave()) return;
    setCollectionPickerType(null);
    setIsCollectionOpen(false);
    setIsAdvancedSettingsOpen(false);
    setIsInventoryOpen(false);
    setIsCampaignItemsOpen(false);
    setIsCampaignUnlocksOpen(false);
    setIsCampaignActionsOpen(false);
    setEditingCampaign(null);
  };

  const showFeedback = (msg: string, type: 'success' | 'error' = 'success') => {
    setFeedback(type === 'error' ? `Error: ${msg}` : msg);
    setTimeout(() => setFeedback(null), 3500);
  };

  // --- CAMPAIGN ACTIONS ---
  const handleCreateNewCampaign = () => {
    const startNodeId = `node_${Date.now()}_1`;
    const newCampaign: CampaignDefinition = {
      id: `campaign_custom_${Date.now()}`,
      name: 'Chronicle of the Splinterlands',
      description: 'An epic branching campaign with narrative prelude, moral choices, and fierce battles.',
      author: 'Custom Creator',
      isCustom: true,
      collectionSource: 'player',
      startingCollection: [],
      startingMana: 25,
      allowedTiers: SPLINTERLANDS_EDITIONS.flatMap((edition) => edition.tiers),
      allowGladiators: true,
      allowRuni: true,
      maxCardLevelsByRarity: { ...MAX_LEVEL_BY_RARITY },
      startNodeId,
      nodes: {
        [startNodeId]: {
          id: startNodeId,
          type: 'text',
          title: 'Prologue: Journey Begins',
          speakerName: 'Narrator',
          content: 'You step into the wilderness of the Splinterlands as ominous storm clouds gather on the horizon.',
          buttonText: 'March Ahead',
        },
      },
    };
    setEditingCampaign(newCampaign);
    setSelectedNodeId(startNodeId);
  };

  const handleCloneCampaign = (camp: CampaignDefinition) => {
    const cloned: CampaignDefinition = {
      ...camp,
      id: `campaign_custom_${Date.now()}`,
      name: `${camp.name} (Custom Copy)`,
      isCustom: true,
      nodes: JSON.parse(JSON.stringify(camp.nodes)),
    };
    setEditingCampaign(cloned);
    setSelectedNodeId(cloned.startNodeId);
  };

  const handleDeleteCampaign = (id: string) => {
    if (confirm('Are you sure you want to delete this custom campaign?')) {
      StorageService.deleteCampaign(id);
      onCampaignsUpdated();
      showFeedback('Campaign deleted.');
    }
  };

  const handleExportJson = (includeAll = false) => {
    const data = StorageService.exportCampaignsJson(includeAll);
    const blob = new Blob([data], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `splinter_campaigns_${includeAll ? 'all' : 'custom'}_${Date.now()}.json`;
    a.click();
    URL.revokeObjectURL(url);
    showFeedback(`Exported ${includeAll ? 'all' : 'custom'} campaigns JSON.`);
  };

  const handleExportSingleCampaign = (campaign: CampaignDefinition) => {
    const data = JSON.stringify(packageCampaign(campaign), null, 2);
    const blob = new Blob([data], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `campaign_${campaign.id}.json`;
    a.click();
    URL.revokeObjectURL(url);
    showFeedback(`Exported campaign "${campaign.name}" JSON.`);
  };

  const handleImportJson = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    void processImportFiles(files, (content, file) => ({ content, file }))
      .then((filesToImport) => {
        let totalCount = 0;
        const importedNames: string[] = [];
        const errors = filesToImport.flatMap(({ content, file }) => {
          const validation = StorageService.validateCampaignsJson(content);
          return validation.success ? [] : [`${file.name}: ${validation.error || 'invalid JSON'}`];
        });
        if (errors.length > 0) {
          showFeedback(`No files were imported. ${errors.join(' ')}`, 'error');
          return;
        }
        filesToImport.forEach(({ content, file }) => {
          const result = StorageService.importCampaignsJson(content);
          if (result.success) {
            totalCount += result.count;
            const parsed = JSON.parse(content);
            const campaigns = Array.isArray(parsed) ? parsed : parsed.campaigns || [parsed];
            campaigns.forEach((campaign: CampaignDefinition) => {
              if (campaign.name) importedNames.push(campaign.name);
            });
          } else {
            errors.push(`${file.name}: ${result.error || 'invalid JSON'}`);
          }
        });

        // Refresh after localStorage writes have completed and React can see the new collection.
        onCampaignsUpdated();
        if (errors.length > 0) {
          showFeedback(`Imported ${totalCount} campaign(s). ${errors.join(' ')}`, 'error');
        } else if (importedNames.length === 1) {
          showFeedback(`Imported campaign "${importedNames[0]}".`);
        } else {
          showFeedback(`Imported campaigns: ${importedNames.map((name) => `"${name}"`).join(', ')}.`);
        }
      })
      .catch((error) => showFeedback(error.message || 'Could not import campaign files.', 'error'));

    e.target.value = '';
  };

  // --- NODE MANAGEMENT ---
  const handleAddNode = (type: CampaignNodeType) => {
    if (!editingCampaign) return;
    const newId = `node_${Date.now()}_${Math.floor(Math.random() * 1000)}`;
    let newNode: CampaignNode;

    if (type === 'text') {
      newNode = {
        id: newId,
        type: 'text',
        title: 'New Story Segment',
        speakerName: 'Guide',
        content: 'Write the narrative dialogue or lore description here...',
        buttonText: 'Continue',
      };
    } else if (type === 'multi') {
      newNode = {
        id: newId, type: 'multi', title: 'Multi Outcome',
        choices: [
          { id: `route_${newId}_1`, nextNodeId: '', probability: 50 },
          { id: `route_${newId}_2`, nextNodeId: '', probability: 50 },
        ],
      };
    } else if (type === 'hub') {
      newNode = {
        id: newId,
        type: 'hub',
        title: 'New Hub',
        prompt: 'Where would you like to go?',
        choices: [
          { id: `poi_${newId}_1`, type: 'node', text: 'Tavern', description: 'Meet the locals.', nextNodeId: '' },
          { id: `poi_${newId}_2`, type: 'node', text: 'Forest Trail', description: 'Explore the surrounding wilderness.', nextNodeId: '' },
        ],
      };
    } else if (type === 'decision') {
      newNode = {
        id: newId,
        type: 'decision',
        title: 'New Crossroads Choice',
        prompt: 'Present a strategic or narrative question to the player...',
        choices: [
          {
            id: `choice_${Date.now()}_1`,
            text: 'First Option',
            description: 'Description of the first path',
            nextNodeId: '',
          },
          {
            id: `choice_${Date.now()}_2`,
            text: 'Second Option',
            description: 'Description of the second path',
            nextNodeId: '',
          },
        ],
      };
    } else if (type === 'shop') {
      newNode = { id: newId, type: 'shop', title: 'New Shop', offers: [] };
    } else if (type === 'battle') {
      newNode = {
        id: newId,
        type: 'battle',
        title: 'New Battle Encounter',
        challengeId: challenges[0]?.id || '',
      };
    } else {
      newNode = {
        id: newId,
        type: 'end',
        title: 'Quest Completed',
        outcome: 'victory',
        message: 'The adventure reaches its conclusion!',
      };
    }

    const updatedNodes = { ...editingCampaign.nodes, [newId]: newNode };
    setEditingCampaign({ ...editingCampaign, nodes: updatedNodes });
    setSelectedNodeId(newId);
  };

  const handleDeleteNode = (nodeId: string) => {
    if (!editingCampaign) return;
    if (Object.keys(editingCampaign.nodes).length <= 1) {
      alert('A campaign must contain at least one node.');
      return;
    }
    const updatedNodes = { ...editingCampaign.nodes };
    delete updatedNodes[nodeId];

    let newStartNodeId = editingCampaign.startNodeId;
    if (editingCampaign.startNodeId === nodeId) {
      newStartNodeId = Object.keys(updatedNodes)[0];
    }

    setEditingCampaign({
      ...editingCampaign,
      startNodeId: newStartNodeId,
      nodes: updatedNodes,
    });

    if (selectedNodeId === nodeId) {
      setSelectedNodeId(Object.keys(updatedNodes)[0] || null);
    }
  };

  const handleUpdateNode = (updatedNode: CampaignNode) => {
    if (!editingCampaign) return;
    setEditingCampaign((current) => current ? {
      ...current,
      nodes: { ...current.nodes, [updatedNode.id]: updatedNode },
    } : current);
  };

  const createAndLinkNode = (
    targetType: CampaignNodeType,
    linkCallback: (newNodeId: string) => void
  ) => {
    if (!editingCampaign) return;
    const newId = `node_${Date.now()}_${Math.floor(Math.random() * 1000)}`;
    const count = Object.keys(editingCampaign.nodes).length + 1;
    let newNode: CampaignNode;

    if (targetType === 'text') {
      newNode = {
        id: newId,
        type: 'text',
        title: `Story Chapter ${count}`,
        speakerName: 'Narrator',
        content: 'Write the narrative dialogue or lore description here...',
        buttonText: 'Continue',
      };
    } else if (targetType === 'multi') {
      newNode = {
        id: newId, type: 'multi', title: `Multi Outcome ${count}`,
        choices: [
          { id: `route_${newId}_1`, nextNodeId: '', probability: 50 },
          { id: `route_${newId}_2`, nextNodeId: '', probability: 50 },
        ],
      };
    } else if (targetType === 'hub') {
      newNode = {
        id: newId,
        type: 'hub',
        title: `Hub ${count}`,
        prompt: 'Where would you like to go?',
        choices: [
          { id: `poi_${newId}_1`, type: 'node', text: 'Tavern', description: 'Meet the locals.', nextNodeId: '' },
          { id: `poi_${newId}_2`, type: 'node', text: 'Forest Trail', description: 'Explore the surrounding wilderness.', nextNodeId: '' },
        ],
      };
    } else if (targetType === 'decision') {
      newNode = {
        id: newId,
        type: 'decision',
        title: `Choice Point ${count}`,
        prompt: 'Present a strategic or narrative question to the player...',
        choices: [
          { id: `c_${Date.now()}_1`, text: 'Path Alpha', description: 'Description of the first path', nextNodeId: '' },
          { id: `c_${Date.now()}_2`, text: 'Path Beta', description: 'Description of the second path', nextNodeId: '' },
        ],
      };
    } else if (targetType === 'shop') {
      newNode = { id: newId, type: 'shop', title: `Shop ${count}`, offers: [] };
    } else if (targetType === 'battle') {
      newNode = {
        id: newId,
        type: 'battle',
        title: `Battle Encounter ${count}`,
        challengeId: challenges[0]?.id || '',
      };
    } else {
      newNode = {
        id: newId,
        type: 'end',
        title: `Conclusion ${count}`,
        outcome: 'victory',
        message: 'The journey reaches its resolution with your triumph!',
      };
    }

    const updatedNodes = { ...editingCampaign.nodes, [newId]: newNode };
    setEditingCampaign({ ...editingCampaign, nodes: updatedNodes });
    linkCallback(newId);
    showFeedback(`Created & linked new ${targetType.toUpperCase()} node!`);
  };

  const currentNode = editingCampaign && selectedNodeId ? editingCampaign.nodes[selectedNodeId] : null;
  const campaignNodes = editingCampaign ? Object.values(editingCampaign.nodes) : [];
  const normalizedNodeSearch = nodeSearch.trim().toLowerCase();
  const filteredCampaignNodes = campaignNodes.filter((node) =>
    (nodeTypeFilter === 'all' || node.type === nodeTypeFilter) &&
    (!normalizedNodeSearch || `${node.title} ${node.id} ${node.type} ${NODE_TYPE_META[node.type].label}`.toLowerCase().includes(normalizedNodeSearch))
  );

  return (
    <div className="space-y-6">
      {/* Toast Feedback */}
      {feedback && (
        <div className="fixed bottom-6 right-6 z-50 px-4 py-2.5 rounded-xl bg-emerald-950 border border-emerald-500 text-emerald-200 shadow-2xl flex items-center gap-2 font-medium">
          <Check className="w-4 h-4" />
          <span>{feedback}</span>
        </div>
      )}

      {/* Header Bar */}
      <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-5 shadow-xl flex flex-col lg:flex-row items-stretch lg:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold font-fantasy text-slate-100 flex items-center gap-2">
            <BookOpen className="w-6 h-6 text-amber-500" />
            Campaigns & Interactive Story Studio
          </h2>
          <p className="text-sm text-slate-400 mt-0.5">
            Craft linked campaigns composed of Story Text nodes, Decision branches, and Combat Battle nodes with custom outcomes.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            onClick={handleCreateNewCampaign}
            className="flex items-center gap-1.5 px-4 py-2 bg-gradient-to-r from-amber-600 to-rose-600 hover:from-amber-500 hover:to-rose-500 text-white font-bold rounded-xl transition shadow-lg shadow-amber-600/20 text-sm"
          >
            <Plus className="w-4 h-4" />
            Create Campaign
          </button>

          {/* Export Group */}
          <div className="flex items-center rounded-xl bg-slate-800 border border-slate-700 overflow-hidden">
            <button
              onClick={() => handleExportJson(false)}
              className="flex items-center gap-1.5 px-3 py-2 hover:bg-slate-700 text-slate-200 font-medium transition text-sm"
              title="Export custom campaigns to JSON"
            >
              <Download className="w-4 h-4" />
              Export Custom ({campaigns.filter((c) => c.isCustom).length})
            </button>
            <button
              onClick={() => handleExportJson(true)}
              className="px-2.5 py-2 hover:bg-slate-700 text-slate-400 hover:text-slate-200 border-l border-slate-700 text-xs font-semibold transition"
              title="Export all campaigns (including built-ins)"
            >
              All
            </button>
          </div>

          <label className="flex items-center gap-1.5 px-3 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 font-medium rounded-xl border border-slate-700 transition text-sm cursor-pointer">
            <Upload className="w-4 h-4" />
            Import JSON
            <input type="file" accept=".json" multiple onChange={handleImportJson} className="hidden" />
          </label>
        </div>
      </div>

      {/* Campaigns Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
        {campaigns.map((camp) => {
          const nodeCount = Object.keys(camp.nodes).length;
          const battleCount = Object.values(camp.nodes).filter((n) => n.type === 'battle').length;
          const choiceCount = Object.values(camp.nodes).filter((n) => n.type === 'decision').length;
          const hubCount = Object.values(camp.nodes).filter((n) => n.type === 'hub').length;

          return (
            <div
              key={camp.id}
              className="bg-slate-900/90 border border-slate-800 hover:border-slate-700 rounded-2xl p-5 flex flex-col justify-between transition-all hover:shadow-2xl shadow-slate-950/50 relative overflow-hidden group"
            >
              {/* Top Banner */}
              <div>
                <div className="flex items-center justify-end mb-3">
                  <div className="flex items-center gap-1.5 text-xs text-slate-400 bg-slate-950/80 px-2.5 py-1 rounded-lg border border-slate-800">
                    <Layers className="w-3.5 h-3.5 text-amber-400" />
                    <span>{nodeCount} Nodes</span>
                  </div>
                </div>

                {/* Title & Lore */}
                <h3 className="text-lg font-bold font-fantasy text-slate-100 group-hover:text-amber-400 transition line-clamp-2">
                  {camp.name}
                </h3>
                <p className="text-xs text-slate-400 mt-1 line-clamp-3">{camp.description}</p>

                {/* Campaign Structure Stats */}
                <div className="mt-4 pt-3 border-t border-slate-800/80 flex flex-wrap items-center gap-3 text-xs text-slate-400">
                  <div className="flex items-center gap-1">
                    <Swords className="w-3.5 h-3.5 text-rose-400" />
                    <span>{battleCount} Battles</span>
                  </div>
                  <div className="flex items-center gap-1">
                    <GitFork className="w-3.5 h-3.5 text-amber-400" />
                    <span>{choiceCount} Choices</span>
                  </div>
                  {hubCount > 0 && (
                    <div className="flex items-center gap-1">
                      <MapPin className="w-3.5 h-3.5 text-teal-400" />
                      <span>{hubCount} Hubs</span>
                    </div>
                  )}
                  {camp.author && (
                    <span className="text-[11px] text-slate-500 ml-auto truncate">By {camp.author}</span>
                  )}
                </div>
              </div>

              {/* Action Buttons */}
              <div className="mt-5 pt-3 border-t border-slate-800/80 flex items-center justify-between gap-2">
                <div className="flex items-center gap-1">
                  <button
                    onClick={() => {
                      setEditingCampaign({ ...camp, nodes: JSON.parse(JSON.stringify(camp.nodes)) });
                      setSelectedNodeId(camp.startNodeId || Object.keys(camp.nodes)[0]);
                    }}
                    className="p-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 text-xs transition"
                    title="Edit Campaign Nodes & Story"
                  >
                    <Edit className="w-3.5 h-3.5" />
                  </button>
                  <button
                    onClick={() => handleCloneCampaign(camp)}
                    className="p-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 text-xs transition"
                    title="Clone / Duplicate Campaign"
                  >
                    <Copy className="w-3.5 h-3.5" />
                  </button>
                  <button
                    onClick={() => handleExportSingleCampaign(camp)}
                    className="p-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 text-xs transition"
                    title="Export single campaign JSON"
                  >
                    <Download className="w-3.5 h-3.5" />
                  </button>
                  {camp.isCustom && (
                    <button
                      onClick={() => handleDeleteCampaign(camp.id)}
                      className="p-2 rounded-xl bg-rose-950/80 hover:bg-rose-900 text-rose-300 border border-rose-700/60 text-xs transition"
                      title="Delete Campaign"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>

                <button
                  onClick={() => onPlayCampaign(camp)}
                  className="flex-1 flex items-center justify-center gap-1.5 px-4 py-2 bg-gradient-to-r from-amber-600 to-rose-600 hover:from-amber-500 hover:to-rose-500 text-white font-bold rounded-xl shadow-lg shadow-amber-600/20 text-xs uppercase tracking-wider transition transform active:scale-95"
                >
                  <Play className="w-3.5 h-3.5 fill-current" />
                  Play Campaign
                </button>
              </div>
            </div>
          );
        })}
      </div>

      {/* CAMPAIGN EDITOR / NODE GRAPH BUILDER MODAL */}
      {editingCampaign && showEncounterGraph && (
        <CampaignEncounterGraph campaign={editingCampaign} onClose={() => setShowEncounterGraph(false)} onSelectNode={(nodeId) => { setSelectedNodeId(nodeId); setShowEncounterGraph(false); }} />
      )}
      {editingCampaign && (
        <div className="fixed inset-0 z-50 bg-black/85 backdrop-blur-md flex items-center justify-center p-4 overflow-hidden">
          <div className="bg-slate-900 border border-slate-700 rounded-3xl w-full max-w-6xl max-h-[calc(100dvh_-_2rem)] min-h-0 overflow-hidden shadow-2xl p-6 text-slate-100 flex flex-col">
            {/* Modal Header */}
            <div className="shrink-0 flex items-center justify-between border-b border-slate-800 pb-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-amber-600 flex items-center justify-center text-white shadow-lg shadow-amber-600/30">
                  <BookOpen className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-xl font-bold font-fantasy text-amber-400">
                    Campaign Node Studio & Story Builder
                  </h3>
                  <p className="text-xs text-slate-400">
                    Link narrative text, player decision forks, and battle consequences into a cohesive adventure.
                  </p>
                </div>
              </div>

              <button
                onClick={handleCloseEditor}
                title="Close campaign editor"
                aria-label="Close campaign editor"
                className="p-1.5 rounded-xl hover:bg-slate-800 text-slate-400 hover:text-slate-200"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Campaign Metadata Fields */}
            <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain space-y-6 py-6 pr-2 [scrollbar-gutter:stable]">
            <div className="bg-slate-950 border border-slate-800 rounded-2xl p-4 grid grid-cols-1 md:grid-cols-4 gap-4">
              <div className="md:col-span-3">
                <label className="block text-xs font-semibold text-slate-400 mb-1">Campaign Title</label>
                <input
                  type="text"
                  value={editingCampaign.name}
                  onChange={(e) => setEditingCampaign({ ...editingCampaign, name: e.target.value })}
                  className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-1.5 text-sm font-bold text-slate-100 focus:outline-none focus:border-amber-500"
                />
              </div>

              <div className="flex items-end">
                <button
                  ref={advancedSettingsTrigger}
                  type="button"
                  onClick={() => setIsAdvancedSettingsOpen(true)}
                  aria-haspopup="dialog"
                  className="w-full flex items-center justify-center gap-2 px-3 py-2 rounded-lg border border-slate-700 bg-slate-900 hover:border-amber-500 text-xs text-amber-200"
                >
                  <Settings className="w-4 h-4 shrink-0" />
                  Advanced Settings
                </button>
              </div>

              <div className="md:col-span-4">
                <label className="block text-xs font-semibold text-slate-400 mb-1">Campaign Description</label>
                <input
                  type="text"
                  value={editingCampaign.description}
                  onChange={(e) => setEditingCampaign({ ...editingCampaign, description: e.target.value })}
                  className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-1.5 text-xs text-slate-200"
                />
              </div>

              <div className="md:col-span-4 flex flex-wrap gap-2">
                <button
                  ref={inventoryTrigger}
                  type="button"
                  onClick={() => setIsInventoryOpen(true)}
                  aria-haspopup="dialog"
                  className="flex items-center gap-2 px-3 py-2 rounded-lg border border-slate-700 bg-slate-900 hover:border-amber-500 text-xs text-amber-200"
                >
                  <Package className="w-4 h-4" />
                  Inventory ({editingCampaign.inventory?.length || 0})
                </button>
                <button ref={campaignItemsTrigger} type="button" onClick={() => setIsCampaignItemsOpen(true)} aria-haspopup="dialog"
                  className="flex items-center gap-2 rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-xs text-amber-200 hover:border-amber-500">
                  <Package className="h-4 w-4 shrink-0" /> Campaign Specific Items ({campaignItems.length})
                </button>
                <button ref={campaignUnlocksTrigger} type="button" onClick={() => setIsCampaignUnlocksOpen(true)} aria-haspopup="dialog"
                  className="flex items-center gap-2 rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-xs text-amber-200 hover:border-amber-500">
                  <Award className="h-4 w-4 shrink-0" /> Campaign Unlocks ({editingCampaign.unlocks?.length || 0})
                </button>
                <button type="button" onClick={() => setIsCampaignActionsOpen(true)} aria-haspopup="dialog"
                  className="flex items-center gap-2 rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-xs text-amber-200 hover:border-amber-500">
                  <Sparkles className="h-4 w-4 shrink-0" /> Actions ({campaignActions.length})
                </button>
              </div>

              <div className="md:col-span-4 flex flex-wrap gap-1" role="group" aria-label="Starting collection source">
                <h4 className="w-full text-sm font-bold text-amber-300 mb-2">Campaign collection</h4>
                {(['player', 'custom'] as const).map((source) => (
                  <button
                    key={source}
                    type="button"
                    aria-pressed={(editingCampaign.collectionSource || 'player') === source}
                    onClick={() => setEditingCampaign({ ...editingCampaign, collectionSource: source })}
                    className={`px-3 py-1.5 rounded-md border text-xs ${(editingCampaign.collectionSource || 'player') === source ? 'border-amber-500 text-amber-200 bg-amber-950' : 'border-slate-700 text-slate-400'}`}
                  >
                    {source === 'player' ? 'Player Collection' : 'Custom Collection'}
                  </button>
                ))}
              </div>

              {editingCampaign.collectionSource !== 'custom' && (
                <>
              <div className="md:col-span-2">
                <label className="block text-xs font-semibold text-slate-400 mb-1">Allowed Card Sets</label>
                <div className="flex flex-wrap gap-1.5">
                  {SPLINTERLANDS_EDITIONS.map((edition) => {
                    const selected = editingCampaign.allowedTiers === undefined || edition.tiers.every((tier) => editingCampaign.allowedTiers?.includes(tier));
                    return (
                      <button
                        key={edition.name}
                        type="button"
                        onClick={() => {
                          const current = editingCampaign.allowedTiers || SPLINTERLANDS_EDITIONS.flatMap((item) => item.tiers);
                          const editionTiers = edition.tiers as readonly (number | null)[];
                          const nextIds = selected
                            ? current.filter((tier) => !editionTiers.includes(tier))
                            : [...current, ...editionTiers.filter((tier) => !current.includes(tier))];
                          const next = selected
                            ? nextIds
                            : nextIds;
                          setEditingCampaign({ ...editingCampaign, allowedTiers: next.length ? next : undefined });
                        }}
                        className={`px-2 py-1 rounded-md border text-[10px] font-bold text-left transition ${
                          selected
                            ? 'bg-amber-950 border-amber-500 text-amber-200'
                            : 'bg-slate-900 border-slate-700 text-slate-400 hover:text-slate-200'
                        }`}
                      >
                        {edition.name}
                      </button>
                    );
                  })}
                </div>
                <div className="flex flex-wrap gap-3 mt-1.5">
                  <label className="flex items-center gap-1.5 text-[10px] font-bold text-slate-300">
                    <input
                      type="checkbox"
                      checked={editingCampaign.allowGladiators !== false}
                      onChange={(e) => setEditingCampaign({ ...editingCampaign, allowGladiators: e.target.checked })}
                      className="accent-amber-500"
                    />
                    Allow Gladiators
                  </label>
                  <label className="flex items-center gap-1.5 text-[10px] font-bold text-slate-300">
                    <input
                      type="checkbox"
                      checked={editingCampaign.allowRuni !== false}
                      onChange={(e) => setEditingCampaign({ ...editingCampaign, allowRuni: e.target.checked })}
                      className="accent-amber-500"
                    />
                    Allow Runi
                  </label>
                </div>
                <p className="text-[10px] text-slate-500 mt-1">These special cards are controlled independently of the selected tiers.</p>
              </div>

              <div className="md:col-span-2">
                <label className="block text-xs font-semibold text-slate-400 mb-1">Maximum Card Level by Rarity</label>
                <div className="grid grid-cols-4 gap-1.5 max-w-md">
                  {(['Common', 'Rare', 'Epic', 'Legendary'] as const).map((rarity) => (
                    <label key={rarity} className="text-[10px] font-bold text-slate-400">
                      {rarity}
                      <input
                        type="number"
                        min="1"
                        max={MAX_LEVEL_BY_RARITY[rarity]}
                        value={editingCampaign.maxCardLevelsByRarity?.[rarity] || MAX_LEVEL_BY_RARITY[rarity]}
                        onChange={(e) => {
                          const rarityMax = MAX_LEVEL_BY_RARITY[rarity];
                          const parsedValue = parseInt(e.target.value, 10);
                          const value = Number.isFinite(parsedValue) ? Math.min(parsedValue, rarityMax) : NaN;
                          const levels = { ...(editingCampaign.maxCardLevelsByRarity || {}) };
                          if (Number.isFinite(value) && value > 0) levels[rarity] = value;
                          else delete levels[rarity];
                          setEditingCampaign({ ...editingCampaign, maxCardLevelsByRarity: Object.keys(levels).length ? levels : undefined });
                        }}
                        placeholder="Any"
                        className="mt-1 w-full bg-slate-900 border border-slate-700 rounded-md px-2 py-1 text-xs text-slate-200"
                      />
                    </label>
                  ))}
                </div>
                <p className="text-[10px] text-slate-500 mt-1">Each rarity defaults to its official maximum level.</p>
              </div>
                </>
              )}

              {editingCampaign.collectionSource === 'custom' && (
                <section className="md:col-span-4 space-y-3">
                  <div className="flex flex-wrap items-center gap-3">
                    <button
                      ref={collectionViewTrigger}
                      type="button"
                      onClick={() => setIsCollectionOpen(true)}
                      aria-haspopup="dialog"
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-700 bg-slate-900 hover:border-amber-500 text-xs text-amber-200"
                    >
                      <Layers className="w-3.5 h-3.5" />
                      Show Collection
                    </button>
                    {(['Summoner', 'Monster'] as const).map((cardType) => (
                      <button
                        key={cardType}
                        type="button"
                        onClick={(event) => {
                          collectionPickerTrigger.current = event.currentTarget;
                          setCollectionSearch('');
                          setCollectionSplinter('ALL');
                          setCollectionPickerType(cardType);
                        }}
                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-700 bg-slate-900 hover:border-amber-500 text-xs text-amber-200"
                      >
                        <Plus className="w-3.5 h-3.5" />
                        {cardType === 'Summoner' ? 'Add Archon' : 'Add Unit'}
                      </button>
                    ))}
                    <span className="text-xs text-slate-400">{editingCampaign.startingCollection?.length || 0} cards</span>
                  </div>
                </section>
              )}
            </div>

            {/* Node Layout: Left (Node Flow List) & Right (Selected Node Editor) */}
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 min-h-[420px]">
              {/* Left Column: Nodes Catalog & Flow Navigator */}
              <div className="lg:col-span-5 bg-slate-950 border border-slate-800 rounded-2xl p-4 flex flex-col justify-between space-y-3">
                <div>
                  <div className="flex items-center justify-between border-b border-slate-800 pb-2 mb-3">
                    <h4 className="text-xs font-bold uppercase tracking-wider text-slate-300 flex items-center gap-1.5">
                      <Layers className="w-4 h-4 text-amber-400" />
                      Campaign Nodes ({Object.keys(editingCampaign.nodes).length})
                    </h4>
                  </div>
                  <div className="mb-3 flex flex-wrap items-center gap-2">
                    <button type="button" onClick={() => setShowEncounterGraph(true)} aria-haspopup="dialog" className="flex items-center gap-2 rounded-lg border border-slate-700 px-3 py-2 text-xs text-amber-200 hover:border-amber-500">
                      <GitFork className="h-4 w-4" /> Show Encounter Graph
                    </button>
                    <div className="relative">
                      <button
                        type="button"
                        onClick={() => setIsAddNodeMenuOpen((open) => !open)}
                        aria-expanded={isAddNodeMenuOpen}
                        aria-haspopup="menu"
                        className="flex items-center gap-2 rounded-lg border border-amber-600/60 bg-amber-950/50 px-3 py-2 text-xs font-semibold text-amber-200 hover:border-amber-400"
                      >
                        <Plus className="h-4 w-4" /> Add node
                      </button>
                      {isAddNodeMenuOpen && (
                        <div role="menu" aria-label="Add campaign node" className="absolute left-0 top-full z-20 mt-1 grid w-64 grid-cols-2 gap-1 rounded-lg border border-slate-700 bg-slate-950 p-2 shadow-xl">
                          {(Object.keys(NODE_TYPE_META) as CampaignNodeType[]).map((type) => {
                            const meta = NODE_TYPE_META[type];
                            const Icon = meta.icon;
                            return (
                              <button
                                key={type}
                                type="button"
                                role="menuitem"
                                onClick={() => {
                                  setIsAddNodeMenuOpen(false);
                                  handleAddNode(type);
                                }}
                                className={`flex items-center gap-2 rounded-md border px-2 py-2 text-left text-xs font-medium hover:brightness-125 ${meta.bg} ${meta.border} ${meta.color}`}
                              >
                                <Icon className="h-4 w-4 shrink-0" />
                                <span>{meta.label}</span>
                              </button>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  </div>

                  <div className="mb-3 grid grid-cols-1 gap-2 sm:grid-cols-[minmax(0,1fr)_auto]">
                    <label className="relative block">
                      <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
                      <input
                        type="search"
                        value={nodeSearch}
                        onChange={(event) => setNodeSearch(event.target.value)}
                        placeholder="Search nodes by title or ID"
                        aria-label="Search campaign nodes"
                        className="w-full rounded-lg border border-slate-700 bg-slate-900 py-2 pl-8 pr-3 text-xs text-slate-100 placeholder:text-slate-500 focus:border-amber-500 focus:outline-none"
                      />
                    </label>
                    <select
                      value={nodeTypeFilter}
                      onChange={(event) => setNodeTypeFilter(event.target.value as CampaignNodeType | 'all')}
                      aria-label="Filter nodes by type"
                      className="rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-xs text-slate-200 focus:border-amber-500 focus:outline-none"
                    >
                      <option value="all">All types</option>
                      {(Object.keys(NODE_TYPE_META) as CampaignNodeType[]).map((type) => (
                        <option key={type} value={type}>{NODE_TYPE_META[type].label}</option>
                      ))}
                    </select>
                  </div>

                  {/* Nodes List */}
                  <div className="space-y-2 max-h-[380px] overflow-y-auto pr-1">
                    {filteredCampaignNodes.map((node) => {
                      const isSelected = node.id === selectedNodeId;
                      const isStart = node.id === editingCampaign.startNodeId;
                      const meta = NODE_TYPE_META[node.type];
                      const Icon = meta.icon;

                      return (
                        <div
                          key={node.id}
                          onClick={() => setSelectedNodeId(node.id)}
                          className={`p-2.5 rounded-xl border transition-all cursor-pointer flex items-center justify-between gap-2 select-none ${
                            isSelected
                              ? 'bg-slate-900 border-amber-500 shadow-lg ring-1 ring-amber-500/50'
                              : 'bg-slate-900/60 border-slate-800 hover:border-slate-700'
                          }`}
                        >
                          <div className="flex items-center gap-2.5 min-w-0">
                            <div className={`p-1.5 rounded-lg border ${meta.bg} ${meta.border} ${meta.color} shrink-0`}>
                              <Icon className="w-4 h-4" />
                            </div>
                            <div className="min-w-0">
                              <div className="flex items-center gap-1.5">
                                <span className="font-bold text-xs text-slate-100 truncate">{node.title}</span>
                                {isStart && (
                                  <span className="text-[9px] px-1 rounded bg-amber-500 text-black font-extrabold uppercase">
                                    START
                                  </span>
                                )}
                              </div>
                              <div className="text-[10px] text-slate-400 capitalize">
                                {node.type} Node • ID: {node.id.slice(0, 12)}
                              </div>
                            </div>
                          </div>

                          <div className="flex items-center gap-1 shrink-0">
                            {Object.keys(editingCampaign.nodes).length > 1 && (
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleDeleteNode(node.id);
                                }}
                                className="p-1 text-rose-400 hover:text-rose-300 hover:bg-rose-950/60 rounded"
                                title="Delete Node"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            )}
                          </div>
                        </div>
                      );
                    })}
                    {filteredCampaignNodes.length === 0 && (
                      <div className="rounded-lg border border-dashed border-slate-800 px-3 py-6 text-center text-xs text-slate-500">
                        No nodes match the current search and type filter.
                      </div>
                    )}
                  </div>
                </div>
              </div>

              {/* Right Column: Node Detailed Editor */}
              <div className="lg:col-span-7 bg-slate-950 border border-slate-800 rounded-2xl p-5 space-y-4">
                {currentNode ? (
                  <div className="space-y-4">
                    {/* Node Header */}
                    <div className="flex items-center justify-between border-b border-slate-800 pb-3">
                      <div className="flex items-center gap-2">
                        <span
                          className={`text-xs px-2 py-0.5 rounded-lg border font-bold uppercase tracking-wider ${
                            NODE_TYPE_META[currentNode.type].bg
                          } ${NODE_TYPE_META[currentNode.type].border} ${NODE_TYPE_META[currentNode.type].color}`}
                        >
                          {NODE_TYPE_META[currentNode.type].label}
                        </span>
                        <span className="text-xs text-slate-500 font-mono">ID: {currentNode.id}</span>
                      </div>

                      {editingCampaign.startNodeId !== currentNode.id && (
                        <button
                          type="button"
                          onClick={() => setEditingCampaign({ ...editingCampaign, startNodeId: currentNode.id })}
                          className="px-2.5 py-1 bg-slate-800 hover:bg-slate-700 text-amber-400 text-xs font-bold rounded-lg border border-slate-700"
                        >
                          Set as Start Node
                        </button>
                      )}
                    </div>

                    {/* Node Title */}
                    <div>
                      <label className="block text-xs font-semibold text-slate-400 mb-1">Node Header Title</label>
                      <input
                        type="text"
                        value={currentNode.title}
                        onChange={(event) => {
                          const renamed = renameCampaignNode(editingCampaign, currentNode.id, event.target.value);
                          setEditingCampaign(renamed.campaign);
                          setSelectedNodeId(renamed.nodeId);
                        }}
                        className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-1.5 text-sm font-bold text-slate-100 focus:outline-none focus:border-amber-500"
                      />
                    </div>

                    {currentNode.type !== 'battle' && <section className="border-y border-slate-800 py-3 space-y-3">
                      <h4 className="text-xs font-bold text-amber-300">Node Effects ({currentNode.effects?.length || 0})</h4>
                      <CampaignEffectsEditor
                        effects={currentNode.effects || []}
                        cards={editorCards}
                        items={campaignItems}
                        unlocks={editingCampaign.unlocks}
                        actions={campaignActions}
                        nodes={Object.values(editingCampaign.nodes)}
                        onChange={(effects) => handleUpdateNode({ ...currentNode, effects: effects.length ? effects : undefined })}
                      />
                    </section>}

                    {/* 1. TEXT NODE FORM */}
                    {currentNode.type === 'text' && (
                      <div className="space-y-3">
                        <div className="grid grid-cols-2 gap-3">
                          <div>
                            <label className="block text-xs font-semibold text-slate-400 mb-1">Speaker Name</label>
                            <input
                              type="text"
                              value={currentNode.speakerName || ''}
                              onChange={(e) =>
                                handleUpdateNode({ ...currentNode, speakerName: e.target.value || undefined })
                              }
                              placeholder="e.g. Elder Archmage Pyre"
                              className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-1.5 text-xs text-slate-200"
                            />
                          </div>

                          <div>
                            <label className="block text-xs font-semibold text-slate-400 mb-1">Speaker Avatar URL</label>
                            <input
                              type="text"
                              value={currentNode.speakerAvatarUrl || ''}
                              onChange={(e) =>
                                handleUpdateNode({ ...currentNode, speakerAvatarUrl: e.target.value || undefined })
                              }
                              placeholder="https://..."
                              className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-1.5 text-xs text-slate-200"
                            />
                          </div>
                        </div>

                        <div>
                          <label className="block text-xs font-semibold text-slate-400 mb-1">Story Narrative & Dialogue</label>
                          <textarea
                            value={currentNode.content}
                            onChange={(e) => handleUpdateNode({ ...currentNode, content: e.target.value })}
                            rows={4}
                            className="w-full bg-slate-900 border border-slate-700 rounded-lg p-3 text-xs text-slate-200 focus:outline-none focus:border-sky-500 font-sans"
                            placeholder="Write the lore exposition or dialogue here..."
                          />
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                          <div>
                            <label className="block text-xs font-semibold text-slate-400 mb-1">Button Action Text</label>
                            <input
                              type="text"
                              value={currentNode.buttonText || 'Continue'}
                              onChange={(e) => handleUpdateNode({ ...currentNode, buttonText: e.target.value })}
                              className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-xs text-slate-200"
                              placeholder="e.g. Continue, Proceed, Venture Deeper..."
                            />
                          </div>

                          <div className="bg-slate-900/90 border border-slate-800 rounded-xl p-3 space-y-2">
                            <div className="flex items-center justify-between">
                              <label className="block text-xs font-bold text-sky-400">Transition To Next Node</label>
                              {currentNode.nextNodeId && editingCampaign.nodes[currentNode.nextNodeId] && (
                                <button
                                  type="button"
                                  onClick={() => setSelectedNodeId(currentNode.nextNodeId!)}
                                  className="text-[11px] text-amber-400 hover:text-amber-300 flex items-center gap-1 font-bold"
                                  title="Jump to edit the linked node"
                                >
                                  <span>Go to node</span>
                                  <ExternalLink className="w-3 h-3" />
                                </button>
                              )}
                            </div>

                            <CampaignNodePicker nodes={Object.values(editingCampaign.nodes)} value={currentNode.nextNodeId}
                              excludeNodeId={currentNode.id} emptyLabel="No Transition (Story Concludes)"
                              onChange={(nextNodeId) => handleUpdateNode({ ...currentNode, nextNodeId })} />

                            {/* Create and link quick buttons */}
                            <div className="pt-1.5 border-t border-slate-800/80 flex flex-wrap items-center gap-1">
                              <span className="text-[10px] text-slate-400 font-semibold mr-0.5">Create & Link:</span>
                              <button
                                type="button"
                                onClick={() =>
                                  createAndLinkNode('text', (newId) =>
                                    handleUpdateNode({ ...currentNode, nextNodeId: newId })
                                  )
                                }
                                className="px-2 py-0.5 rounded bg-sky-950/80 hover:bg-sky-900 border border-sky-600/50 text-sky-300 text-[10px] font-bold flex items-center gap-0.5"
                              >
                                <Plus className="w-2.5 h-2.5" /> Story
                              </button>
                              <button
                                type="button"
                                onClick={() =>
                                  createAndLinkNode('decision', (newId) =>
                                    handleUpdateNode({ ...currentNode, nextNodeId: newId })
                                  )
                                }
                                className="px-2 py-0.5 rounded bg-amber-950/80 hover:bg-amber-900 border border-amber-600/50 text-amber-300 text-[10px] font-bold flex items-center gap-0.5"
                              >
                                <Plus className="w-2.5 h-2.5" /> Choice
                              </button>
                              <button
                                type="button"
                                onClick={() => createAndLinkNode('multi', (newId) => handleUpdateNode({ ...currentNode, nextNodeId: newId }))}
                                className="px-2 py-0.5 rounded bg-cyan-950/80 hover:bg-cyan-900 border border-cyan-600/50 text-cyan-300 text-[10px] font-bold flex items-center gap-0.5"
                              >
                                <Shuffle className="w-2.5 h-2.5" /> Multi
                              </button>
                              <button
                                type="button"
                                onClick={() => createAndLinkNode('hub', (newId) => handleUpdateNode({ ...currentNode, nextNodeId: newId }))}
                                className="px-2 py-0.5 rounded bg-teal-950/80 hover:bg-teal-900 border border-teal-600/50 text-teal-300 text-[10px] font-bold flex items-center gap-0.5"
                              >
                                <MapPin className="w-2.5 h-2.5" /> Hub
                              </button>
                              <button
                                type="button"
                                onClick={() =>
                                  createAndLinkNode('battle', (newId) =>
                                    handleUpdateNode({ ...currentNode, nextNodeId: newId })
                                  )
                                }
                                className="px-2 py-0.5 rounded bg-rose-950/80 hover:bg-rose-900 border border-rose-600/50 text-rose-300 text-[10px] font-bold flex items-center gap-0.5"
                              >
                                <Plus className="w-2.5 h-2.5" /> Battle
                              </button>
                              <button
                                type="button"
                                onClick={() =>
                                  createAndLinkNode('end', (newId) =>
                                    handleUpdateNode({ ...currentNode, nextNodeId: newId })
                                  )
                                }
                                className="px-2 py-0.5 rounded bg-emerald-950/80 hover:bg-emerald-900 border border-emerald-600/50 text-emerald-300 text-[10px] font-bold flex items-center gap-0.5"
                              >
                                <Plus className="w-2.5 h-2.5" /> End
                              </button>
                            </div>
                          </div>
                        </div>
                      </div>
                    )}

                    {currentNode.type === 'multi' && (
                      <div className="space-y-4">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <h4 className="text-xs font-bold text-cyan-300">Multi Outcomes ({currentNode.choices.length})</h4>
                          <button
                            type="button"
                            onClick={() => handleUpdateNode({ ...currentNode, choices: [...currentNode.choices, { id: `route_${Date.now()}_${currentNode.choices.length}`, nextNodeId: '', probability: 1 }] })}
                            className="flex items-center gap-1 px-3 py-1.5 rounded-lg border border-cyan-700 bg-cyan-950 text-xs text-cyan-200"
                          >
                            <Plus className="w-3.5 h-3.5" /> Add Destination
                          </button>
                        </div>
                        <div className="max-h-[min(40dvh,24rem)] overflow-y-auto overscroll-contain space-y-3 pr-2 [scrollbar-gutter:stable]">
                        {currentNode.choices.map((route, index) => {
                          const isEligible = (entry: typeof route) => entry.nextNodeId !== currentNode.id && Boolean(editingCampaign.nodes[entry.nextNodeId]) && Number.isFinite(entry.probability) && entry.probability > 0;
                          const totalWeight = currentNode.choices.reduce((total, entry) =>
                            isEligible(entry) ? total + entry.probability : total, 0);
                          const chance = isEligible(route) && totalWeight > 0 ? route.probability / totalWeight * 100 : 0;
                          return (
                            <section key={route.id} className="border-t border-slate-800 pt-3 space-y-2">
                              <div className="flex items-center justify-between gap-2">
                                <span className="text-xs text-cyan-300">Destination {index + 1} · {Number(chance.toFixed(2))}%{currentNode.choices.some((entry) => entry.preconditions?.length) ? ' base' : ''}</span>
                                <button
                                  type="button"
                                  title="Remove destination"
                                  aria-label={`Remove destination ${index + 1}`}
                                  onClick={() => handleUpdateNode({ ...currentNode, choices: currentNode.choices.filter((entry) => entry.id !== route.id) })}
                                  className="w-8 h-8 flex items-center justify-center text-rose-400 rounded-lg hover:bg-slate-800"
                                >
                                  <Trash2 className="w-4 h-4" />
                                </button>
                              </div>
                              <div className="grid grid-cols-1 sm:grid-cols-[1fr_8rem] gap-2">
                                <label className="min-w-0 text-xs text-slate-400">
                                  Target Node
                                  <CampaignNodePicker nodes={Object.values(editingCampaign.nodes)} value={route.nextNodeId}
                                    excludeNodeId={currentNode.id} emptyLabel="Select node"
                                    onChange={(nextNodeId) => handleUpdateNode({ ...currentNode, choices: currentNode.choices.map((entry) => entry.id === route.id ? { ...entry, nextNodeId: nextNodeId || '' } : entry) })} />
                                </label>
                                <label className="text-xs text-slate-400" title="Relative probability weight. Weights are normalized across valid destinations.">
                                  Probability Weight
                                  <input
                                    type="number"
                                    min="0"
                                    max="100"
                                    step="1"
                                    value={route.probability}
                                    onChange={(event) => handleUpdateNode({ ...currentNode, choices: currentNode.choices.map((entry) => entry.id === route.id ? { ...entry, probability: Math.max(0, Math.min(100, Number(event.target.value) || 0)) } : entry) })}
                                    className="mt-1 w-full bg-slate-900 border border-slate-700 rounded-lg px-2 py-1.5 text-xs text-slate-200"
                                  />
                                </label>
                              </div>
                              <CampaignPreconditionsEditor preconditions={route.preconditions || []} unlocks={editingCampaign.unlocks || []} cards={editorCards} items={campaignItems}
                                onChange={(preconditions) => handleUpdateNode({ ...currentNode, choices: currentNode.choices.map((entry) => entry.id === route.id ? { ...entry, preconditions: preconditions.length ? preconditions : undefined } : entry) })} />
                              <div className="flex flex-wrap items-center gap-1 border-t border-slate-800/80 pt-1.5">
                                <span className="mr-0.5 text-[10px] font-semibold text-slate-400">Create & Link:</span>
                                {(Object.keys(NODE_TYPE_META) as CampaignNodeType[]).map((type) => {
                                  const meta = NODE_TYPE_META[type];
                                  const Icon = meta.icon;
                                  return (
                                    <button
                                      key={type}
                                      type="button"
                                      onClick={() => createAndLinkNode(type, (newId) => handleUpdateNode({ ...currentNode, choices: currentNode.choices.map((entry) => entry.id === route.id ? { ...entry, nextNodeId: newId } : entry) }))}
                                      className={`flex items-center gap-1 rounded border px-2 py-1 text-[10px] font-bold hover:brightness-125 ${meta.bg} ${meta.border} ${meta.color}`}
                                    >
                                      <Icon className="h-3 w-3 shrink-0" /> {meta.label}
                                    </button>
                                  );
                                })}
                              </div>
                            </section>
                          );
                        })}
                        </div>
                      </div>
                    )}

                    {/* 2. DECISION NODE FORM */}
                    {(currentNode.type === 'decision' || currentNode.type === 'hub') && (
                      <div className="space-y-4">
                        <div>
                          <label className="block text-xs font-semibold text-slate-400 mb-1">{currentNode.type === 'hub' ? 'Hub Welcome Text' : 'Decision Prompt Question'}</label>
                          <textarea
                            value={currentNode.prompt}
                            onChange={(e) => handleUpdateNode({ ...currentNode, prompt: e.target.value })}
                            rows={2}
                            className="w-full bg-slate-900 border border-slate-700 rounded-lg p-2.5 text-xs text-slate-200 focus:outline-none focus:border-amber-500"
                            placeholder={currentNode.type === 'hub' ? 'Explore the area. Where would you like to go?' : 'What dilemma or fork in the road is presented to the player?'}
                          />
                        </div>

                        {/* Choices List */}
                        <div className="space-y-3">
                          <div className="flex flex-wrap items-center justify-between gap-2">
                            <label className="text-xs font-bold text-amber-400 uppercase tracking-wider">
                              {currentNode.type === 'hub' ? 'Points of Interest' : 'Decision Choices'} ({currentNode.choices.length})
                            </label>
                            <button
                              type="button"
                              onClick={() => {
                                const newChoice: DecisionChoice = {
                                  id: `choice_${Date.now()}`,
                                  text: `${currentNode.type === 'hub' ? 'New Point of Interest' : 'New Choice'} ${currentNode.choices.length + 1}`,
                                  description: currentNode.type === 'hub' ? 'Describe this point of interest.' : 'Description of consequence',
                                  nextNodeId: '',
                                  ...(currentNode.type === 'hub' ? { type: 'node' as const } : {}),
                                };
                                handleUpdateNode({
                                  ...currentNode,
                                  choices: [...currentNode.choices, newChoice],
                                });
                              }}
                              className="px-2.5 py-1 bg-amber-600 hover:bg-amber-500 text-white font-bold rounded-lg text-xs flex items-center gap-1"
                            >
                              <Plus className="w-3.5 h-3.5" /> {currentNode.type === 'hub' ? 'Add Point of Interest' : 'Add Choice'}
                            </button>
                          </div>

                          {currentNode.choices.map((choice, cIdx) => (
                            <div
                              key={choice.id}
                              className="p-3 bg-slate-900 rounded-xl border border-slate-800 space-y-2"
                            >
                              <div className="flex items-center justify-between gap-2">
                                <span className="text-xs font-bold text-amber-400">{currentNode.type === 'hub' ? 'Point of Interest' : 'Choice'} #{cIdx + 1}</span>
                                {currentNode.choices.length > 1 && (
                                  <button
                                    type="button"
                                    onClick={() => {
                                      const filtered = currentNode.choices.filter((_, idx) => idx !== cIdx);
                                      handleUpdateNode({ ...currentNode, choices: filtered });
                                    }}
                                    className="text-rose-400 hover:text-rose-300 text-xs"
                                  >
                                    Remove
                                  </button>
                                )}
                              </div>

                              <input
                                type="text"
                                value={choice.text}
                                onChange={(e) => {
                                  const choices = [...currentNode.choices];
                                  choices[cIdx].text = e.target.value;
                                  handleUpdateNode({ ...currentNode, choices });
                                }}
                                aria-label={currentNode.type === 'hub' ? `Point of interest ${cIdx + 1} name` : `Choice ${cIdx + 1} label`}
                                placeholder={currentNode.type === 'hub' ? 'Point of interest name (e.g. Tavern, Forest Trail, Ancient Ruins)' : 'Choice label / action'}
                                className="w-full bg-slate-950 border border-slate-700 rounded-lg px-2.5 py-1 text-xs text-slate-100 font-semibold"
                              />

                              <CampaignPreconditionsEditor preconditions={choice.preconditions || []} unlocks={editingCampaign.unlocks || []} cards={editorCards} items={campaignItems}
                                onChange={(preconditions) => handleUpdateNode({ ...currentNode, choices: currentNode.choices.map((entry) => entry.id === choice.id ? { ...entry, preconditions: preconditions.length ? preconditions : undefined } : entry) })} />

                              {currentNode.type === 'hub' && (
                                <div className="space-y-2">
                                  <label className="block text-xs text-slate-400">
                                    Point of Interest Type
                                    <select
                                      value={(choice as HubPointOfInterest).type || 'node'}
                                      onChange={(event) => handleUpdateNode({ ...currentNode, choices: currentNode.choices.map((point) => point.id === choice.id ? { ...point, type: event.target.value as PointOfInterestType } : point) })}
                                      className="mt-1 w-full bg-slate-950 border border-slate-700 rounded-lg px-2.5 py-1 text-xs text-slate-100"
                                    >
                                      <option value="event">Event</option>
                                      <option value="shop">Shop</option>
                                      <option value="node">Node</option>
                                    </select>
                                  </label>
                                  <label className="block text-xs text-slate-400">
                                  Point of Interest Image URL
                                  <input
                                    type="url"
                                    value={choice.imageUrl || ''}
                                    onChange={(event) => handleUpdateNode({ ...currentNode, choices: currentNode.choices.map((building) => building.id === choice.id ? { ...building, imageUrl: event.target.value || undefined } : building) })}
                                    placeholder="https://..."
                                    className="mt-1 w-full bg-slate-950 border border-slate-700 rounded-lg px-2.5 py-1 text-xs text-slate-100"
                                  />
                                  </label>
                                  {(choice as HubPointOfInterest).type === 'event' && (
                                    <label className="block text-xs text-slate-400">
                                      Description
                                      <input
                                        type="text"
                                        value={choice.description || ''}
                                        onChange={(event) => handleUpdateNode({ ...currentNode, choices: currentNode.choices.map((point) => point.id === choice.id ? { ...point, description: event.target.value } : point) })}
                                        className="mt-1 w-full bg-slate-950 border border-slate-700 rounded-lg px-2.5 py-1 text-xs text-slate-100"
                                      />
                                    </label>
                                  )}
                                </div>
                              )}

                              {currentNode.type === 'hub' && (choice as HubPointOfInterest).type === 'event' && (
                                <section className="border-t border-slate-800 pt-3 space-y-2">
                                  <h5 className="text-xs font-bold text-amber-300">Event Effects</h5>
                                  <CampaignEffectsEditor
                                    effects={(choice as HubPointOfInterest).effects || []}
                                    cards={editorCards}
                                    items={campaignItems}
                                    unlocks={editingCampaign.unlocks}
                                    actions={campaignActions}
                                    nodes={Object.values(editingCampaign.nodes)}
                                    onChange={(effects) => handleUpdateNode({ ...currentNode, choices: currentNode.choices.map((point) => point.id === choice.id ? { ...point, effects: effects.length ? effects : undefined } : point) })}
                                  />
                                </section>
                              )}

                              {currentNode.type === 'hub' && (choice as HubPointOfInterest).type === 'shop' && (
                                <div className="space-y-2">
                                  <label className="block text-xs text-slate-400">
                                    Shop Destination
                                    <CampaignNodePicker nodes={Object.values(editingCampaign.nodes)} value={choice.nextNodeId}
                                      nodeTypes={['shop']} excludeNodeId={currentNode.id} emptyLabel="Select shop"
                                      onChange={(nextNodeId) => handleUpdateNode({ ...currentNode, choices: currentNode.choices.map((point) => point.id === choice.id ? { ...point, nextNodeId: nextNodeId || '' } : point) })} />
                                  </label>
                                  <button type="button" onClick={() => createAndLinkNode('shop', (newId) => handleUpdateNode({ ...currentNode, choices: currentNode.choices.map((point) => point.id === choice.id ? { ...point, nextNodeId: newId } : point) }))}
                                    className="flex items-center gap-1 text-xs text-lime-300"><Store className="h-3.5 w-3.5" /> Create & Link Shop</button>
                                </div>
                              )}

                              {(currentNode.type === 'decision' || ((choice as HubPointOfInterest).type || 'node') === 'node') && (
                              <div className="space-y-2">
                                <div className="flex items-center justify-between">
                                  <label className="text-[11px] font-bold text-amber-400">Leads to Target Node:</label>
                                  {choice.nextNodeId && editingCampaign.nodes[choice.nextNodeId] && (
                                    <button
                                      type="button"
                                      onClick={() => setSelectedNodeId(choice.nextNodeId)}
                                      className="text-[10px] text-amber-400 hover:text-amber-300 flex items-center gap-0.5 font-bold"
                                      title="Jump to edit this destination node"
                                    >
                                      <span>Go to node</span>
                                      <ExternalLink className="w-2.5 h-2.5" />
                                    </button>
                                  )}
                                </div>

                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                                  <input
                                    type="text"
                                    value={choice.description || ''}
                                    onChange={(e) => {
                                      const choices = [...currentNode.choices];
                                      choices[cIdx].description = e.target.value;
                                      handleUpdateNode({ ...currentNode, choices });
                                    }}
                                    placeholder="Secondary description"
                                    className="w-full bg-slate-950 border border-slate-700 rounded-lg px-2.5 py-1 text-xs text-slate-400"
                                  />

                                  <CampaignNodePicker nodes={Object.values(editingCampaign.nodes)} value={choice.nextNodeId}
                                    excludeNodeId={currentNode.id} emptyLabel="Leads To Node"
                                    onChange={(nextNodeId) => {
                                      const choices = [...currentNode.choices];
                                      choices[cIdx].nextNodeId = nextNodeId || '';
                                      handleUpdateNode({ ...currentNode, choices });
                                    }} />
                                </div>

                                {/* Create and link quick buttons for choice */}
                                <div className="flex flex-wrap items-center gap-1 pt-1">
                                  <span className="text-[9px] text-slate-500 font-semibold mr-0.5">Create & Link:</span>
                                  <button
                                    type="button"
                                    onClick={() =>
                                      createAndLinkNode('text', (newId) => {
                                        const choices = [...currentNode.choices];
                                        choices[cIdx].nextNodeId = newId;
                                        handleUpdateNode({ ...currentNode, choices });
                                      })
                                    }
                                    className="px-1.5 py-0.2 rounded bg-sky-950/80 hover:bg-sky-900 border border-sky-600/50 text-sky-300 text-[9px] font-bold flex items-center gap-0.5"
                                  >
                                    <Plus className="w-2 h-2" /> Story
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() =>
                                      createAndLinkNode('decision', (newId) => {
                                        const choices = [...currentNode.choices];
                                        choices[cIdx].nextNodeId = newId;
                                        handleUpdateNode({ ...currentNode, choices });
                                      })
                                    }
                                    className="px-1.5 py-0.2 rounded bg-amber-950/80 hover:bg-amber-900 border border-amber-600/50 text-amber-300 text-[9px] font-bold flex items-center gap-0.5"
                                  >
                                    <Plus className="w-2 h-2" /> Choice
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => createAndLinkNode('multi', (newId) => handleUpdateNode({ ...currentNode, choices: currentNode.choices.map((entry, index) => index === cIdx ? { ...entry, nextNodeId: newId } : entry) }))}
                                    className="px-1.5 py-0.2 rounded bg-cyan-950/80 hover:bg-cyan-900 border border-cyan-600/50 text-cyan-300 text-[9px] font-bold flex items-center gap-0.5"
                                  >
                                    <Shuffle className="w-2 h-2" /> Multi
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => createAndLinkNode('hub', (newId) => handleUpdateNode({ ...currentNode, choices: currentNode.choices.map((choiceEntry, index) => index === cIdx ? { ...choiceEntry, nextNodeId: newId } : choiceEntry) }))}
                                    className="px-1.5 py-0.2 rounded bg-teal-950/80 hover:bg-teal-900 border border-teal-600/50 text-teal-300 text-[9px] font-bold flex items-center gap-0.5"
                                  >
                                    <MapPin className="w-2 h-2" /> Hub
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() =>
                                      createAndLinkNode('battle', (newId) => {
                                        const choices = [...currentNode.choices];
                                        choices[cIdx].nextNodeId = newId;
                                        handleUpdateNode({ ...currentNode, choices });
                                      })
                                    }
                                    className="px-1.5 py-0.2 rounded bg-rose-950/80 hover:bg-rose-900 border border-rose-600/50 text-rose-300 text-[9px] font-bold flex items-center gap-0.5"
                                  >
                                    <Plus className="w-2 h-2" /> Battle
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() =>
                                      createAndLinkNode('end', (newId) => {
                                        const choices = [...currentNode.choices];
                                        choices[cIdx].nextNodeId = newId;
                                        handleUpdateNode({ ...currentNode, choices });
                                      })
                                    }
                                    className="px-1.5 py-0.2 rounded bg-emerald-950/80 hover:bg-emerald-900 border border-emerald-600/50 text-emerald-300 text-[9px] font-bold flex items-center gap-0.5"
                                  >
                                    <Plus className="w-2 h-2" /> End
                                  </button>
                                </div>
                              </div>
                              )}
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* 3. BATTLE NODE FORM */}
                    {currentNode.type === 'shop' && (
                      <CampaignShopEditor node={currentNode} nodes={Object.values(editingCampaign.nodes)} cards={editorCards} items={campaignItems} unlocks={editingCampaign.unlocks} actions={campaignActions} onChange={handleUpdateNode} />
                    )}
                    {currentNode.type === 'battle' && (
                      <div className="space-y-4">
                        <div>
                          <label className="block text-xs font-semibold text-slate-400 mb-1">
                            Battle Context & Encounter Briefing
                          </label>
                          <textarea
                            value={currentNode.description?.trim() ? currentNode.description : (
                              currentNode.inlineChallenge || (currentNode.challengeId
                                ? editorChallenges.find((challenge) => challenge.id === currentNode.challengeId)
                                : challenges[0])
                            )?.description || ''}
                            onChange={(e) => handleUpdateNode({ ...currentNode, description: e.target.value })}
                            rows={2}
                            className="w-full bg-slate-900 border border-slate-700 rounded-lg p-2.5 text-xs text-slate-200 focus:outline-none focus:border-rose-500"
                            placeholder="Describe the monsters, ambush, or battlefield condition..."
                          />
                        </div>

                        <div>
                          <label htmlFor="campaign-battle-select" className="block text-xs font-semibold text-slate-400 mb-1">
                            Linked PvE Battle Challenge Definition
                          </label>
                          <div className="relative mb-2">
                            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
                            <input
                              type="search"
                              aria-label="Search battles"
                              placeholder="Search battles"
                              value={battleSearch}
                              onChange={(event) => setBattleSearch(event.target.value)}
                              className="w-full bg-slate-900 border border-slate-700 rounded-lg pl-9 pr-3 py-2 text-xs text-slate-200 focus:outline-none focus:border-rose-500"
                            />
                          </div>
                          <select
                            id="campaign-battle-select"
                            value={currentNode.challengeId || ''}
                            onChange={(event) => {
                              const challenge = editorChallenges.find((entry) => entry.id === event.target.value);
                              if (!challenge) {
                                handleUpdateNode({ ...currentNode, challengeId: '', inlineChallenge: undefined });
                                return;
                              }
                              const updated = selectCampaignBattle(editingCampaign, currentNode.id, challenge);
                              setEditingCampaign(updated.campaign);
                              setSelectedNodeId(updated.nodeId);
                            }}
                            className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-xs text-rose-300 font-bold"
                          >
                            <option value="">-- Select a PvE Encounter --</option>
                            {editorChallenges.filter((challenge) => challenge.id === currentNode.challengeId
                              || `${challenge.name} ${challenge.id} ${challenge.description} ${challenge.rulesets.join(' ')}`.toLowerCase().includes(battleSearch.trim().toLowerCase())).map((ch) => (
                              <option key={ch.id} value={ch.id}>
                                {ch.name} ({ch.manaCap} Mana • Rules:{' '}
                                {ch.rulesets.join(', ')})
                              </option>
                            ))}
                          </select>
                        </div>

                        {/* Branching Consequences */}
                        <div className="p-3 bg-slate-900 rounded-xl border border-slate-800 space-y-3">
                          <h5 className="text-xs font-bold uppercase tracking-wider text-amber-400 flex items-center gap-1.5">
                            <GitFork className="w-4 h-4 text-rose-400" />
                            Battle Outcomes & Path Branching
                          </h5>

                          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            {/* Victory Branch */}
                            <div className="bg-slate-950/80 p-3 rounded-xl border border-emerald-900/60 space-y-2">
                              <div className="flex items-center justify-between">
                                <label className="block text-xs font-bold text-emerald-400">On Victory → Target Node</label>
                                {currentNode.onVictoryNodeId && editingCampaign.nodes[currentNode.onVictoryNodeId] && (
                                  <button
                                    type="button"
                                    onClick={() => setSelectedNodeId(currentNode.onVictoryNodeId!)}
                                    className="text-[10px] text-emerald-400 hover:text-emerald-300 flex items-center gap-0.5 font-bold"
                                  >
                                    <span>Go to node</span>
                                    <ExternalLink className="w-2.5 h-2.5" />
                                  </button>
                                )}
                              </div>

                              <CampaignNodePicker nodes={Object.values(editingCampaign.nodes)} value={currentNode.onVictoryNodeId}
                                excludeNodeId={currentNode.id} emptyLabel="Victory Leads To"
                                onChange={(onVictoryNodeId) => handleUpdateNode({ ...currentNode, onVictoryNodeId })} />

                              <div className="flex flex-wrap items-center gap-1 pt-1 border-t border-slate-800">
                                <span className="text-[9px] text-slate-500 font-semibold mr-0.5">Create:</span>
                                <button
                                  type="button"
                                  onClick={() =>
                                    createAndLinkNode('text', (newId) =>
                                      handleUpdateNode({ ...currentNode, onVictoryNodeId: newId })
                                    )
                                  }
                                  className="px-1.5 py-0.2 rounded bg-sky-950/80 hover:bg-sky-900 border border-sky-600/50 text-sky-300 text-[9px] font-bold flex items-center gap-0.5"
                                >
                                  <Plus className="w-2 h-2" /> Story
                                </button>
                                <button
                                  type="button"
                                  onClick={() =>
                                    createAndLinkNode('battle', (newId) =>
                                      handleUpdateNode({ ...currentNode, onVictoryNodeId: newId })
                                    )
                                  }
                                  className="px-1.5 py-0.2 rounded bg-rose-950/80 hover:bg-rose-900 border border-rose-600/50 text-rose-300 text-[9px] font-bold flex items-center gap-0.5"
                                >
                                  <Plus className="w-2 h-2" /> Battle
                                </button>
                                <button
                                  type="button"
                                  onClick={() =>
                                    createAndLinkNode('end', (newId) =>
                                      handleUpdateNode({ ...currentNode, onVictoryNodeId: newId })
                                    )
                                  }
                                  className="px-1.5 py-0.2 rounded bg-emerald-950/80 hover:bg-emerald-900 border border-emerald-600/50 text-emerald-300 text-[9px] font-bold flex items-center gap-0.5"
                                >
                                  <Plus className="w-2 h-2" /> End
                                </button>
                              </div>

                              <section className="border-t border-slate-800 pt-3 space-y-2">
                                <h6 className="text-xs font-bold text-emerald-300">Victory Effects</h6>
                                <CampaignEffectsEditor
                                  effects={currentNode.victoryEffects || []}
                                  cards={editorCards}
                                  items={campaignItems}
                                  unlocks={editingCampaign.unlocks}
                                  actions={campaignActions}
                                  nodes={Object.values(editingCampaign.nodes)}
                                  onChange={(victoryEffects) => handleUpdateNode({ ...currentNode, victoryEffects: victoryEffects.length ? victoryEffects : undefined })}
                                />
                              </section>
                            </div>

                            {/* Defeat Branch */}
                            <div className="bg-slate-950/80 p-3 rounded-xl border border-rose-900/60 space-y-2">
                              <div className="flex items-center justify-between">
                                <label className="block text-xs font-bold text-rose-400">On Defeat → Target Node</label>
                                {currentNode.onDefeatNodeId && editingCampaign.nodes[currentNode.onDefeatNodeId] && (
                                  <button
                                    type="button"
                                    onClick={() => setSelectedNodeId(currentNode.onDefeatNodeId!)}
                                    className="text-[10px] text-rose-400 hover:text-rose-300 flex items-center gap-0.5 font-bold"
                                  >
                                    <span>Go to node</span>
                                    <ExternalLink className="w-2.5 h-2.5" />
                                  </button>
                                )}
                              </div>

                              <CampaignNodePicker nodes={Object.values(editingCampaign.nodes)} value={currentNode.onDefeatNodeId}
                                excludeNodeId={currentNode.id} emptyLabel="Defeat Leads To"
                                onChange={(onDefeatNodeId) => handleUpdateNode({ ...currentNode, onDefeatNodeId })} />

                              <div className="flex flex-wrap items-center gap-1 pt-1 border-t border-slate-800">
                                <span className="text-[9px] text-slate-500 font-semibold mr-0.5">Create:</span>
                                <button
                                  type="button"
                                  onClick={() =>
                                    createAndLinkNode('text', (newId) =>
                                      handleUpdateNode({ ...currentNode, onDefeatNodeId: newId })
                                    )
                                  }
                                  className="px-1.5 py-0.2 rounded bg-sky-950/80 hover:bg-sky-900 border border-sky-600/50 text-sky-300 text-[9px] font-bold flex items-center gap-0.5"
                                >
                                  <Plus className="w-2 h-2" /> Story
                                </button>
                                <button
                                  type="button"
                                  onClick={() =>
                                    createAndLinkNode('end', (newId) =>
                                      handleUpdateNode({ ...currentNode, onDefeatNodeId: newId })
                                    )
                                  }
                                  className="px-1.5 py-0.2 rounded bg-rose-950/80 hover:bg-rose-900 border border-rose-600/50 text-rose-300 text-[9px] font-bold flex items-center gap-0.5"
                                >
                                  <Plus className="w-2 h-2" /> End
                                </button>
                              </div>

                              <section className="border-t border-slate-800 pt-3 space-y-2">
                                <h6 className="text-xs font-bold text-rose-300">Defeat Effects</h6>
                                <CampaignEffectsEditor
                                  effects={currentNode.defeatEffects || []}
                                  cards={editorCards}
                                  items={campaignItems}
                                  unlocks={editingCampaign.unlocks}
                                  actions={campaignActions}
                                  nodes={Object.values(editingCampaign.nodes)}
                                  onChange={(defeatEffects) => handleUpdateNode({ ...currentNode, defeatEffects: defeatEffects.length ? defeatEffects : undefined })}
                                />
                              </section>
                            </div>
                          </div>

                        </div>
                      </div>
                    )}

                    {/* 4. END NODE FORM */}
                    {currentNode.type === 'end' && (
                      <div className="space-y-4">
                        <div>
                          <label className="block text-xs font-semibold text-slate-400 mb-1">Campaign Outcome</label>
                          <select
                            value={currentNode.outcome}
                            onChange={(e) => handleUpdateNode({ ...currentNode, outcome: e.target.value as any })}
                            className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-1.5 text-xs font-bold text-slate-200"
                          >
                            <option value="victory">Victory / Triumphant Completion</option>
                            <option value="defeat">Defeat / Mission Failed</option>
                            <option value="neutral">Neutral / Open-Ended Finale</option>
                          </select>
                        </div>

                        <div>
                          <label className="block text-xs font-semibold text-slate-400 mb-1">Conclusion Epilogue Message</label>
                          <textarea
                            value={currentNode.message}
                            onChange={(e) => handleUpdateNode({ ...currentNode, message: e.target.value })}
                            rows={4}
                            className="w-full bg-slate-900 border border-slate-700 rounded-lg p-3 text-xs text-slate-200 focus:outline-none focus:border-emerald-500"
                            placeholder="Write the campaign resolution epilogue..."
                          />
                        </div>

                        <div>
                          <label className="block text-xs font-semibold text-slate-400 mb-1">Reward Summary Banner</label>
                          <input
                            type="text"
                            value={currentNode.rewardSummary || ''}
                            onChange={(e) =>
                              handleUpdateNode({ ...currentNode, rewardSummary: e.target.value || undefined })
                            }
                            placeholder="e.g. You have unlocked Vulcan for your Card Forge!"
                            className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-1.5 text-xs text-emerald-300"
                          />
                        </div>
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="h-full flex flex-col items-center justify-center text-slate-500 py-16">
                    <AlertCircle className="w-8 h-8 mb-2 opacity-50" />
                    <p className="text-xs font-semibold">Select a node from the left panel to edit its details.</p>
                  </div>
                )}
              </div>
            </div>

            {/* Modal Footer */}
            </div>
            <div className="shrink-0 flex items-center justify-end gap-2 pt-4 border-t border-slate-800 text-xs" role="status" aria-live="polite">
              {autosaveStatus === 'error' ? <AlertCircle className="w-4 h-4 text-rose-400" /> : <Check className="w-4 h-4 text-emerald-400" />}
              <span className={autosaveStatus === 'error' ? 'text-rose-400' : 'text-slate-400'}>
                {autosaveStatus === 'saving' ? 'Saving...' : autosaveStatus === 'error' ? 'Autosave failed. Your changes are still open.' : 'All changes saved'}
              </span>
            </div>
          </div>
        </div>
      )}
      {editingCampaign && isCampaignUnlocksOpen && (
        <CampaignUnlocksModal unlocks={editingCampaign.unlocks || []} autosaveStatus={autosaveStatus}
          onSave={(unlock) => setEditingCampaign((current) => current ? {
            ...current,
            unlocks: current.unlocks?.some((entry) => entry.id === unlock.id)
              ? current.unlocks.map((entry) => entry.id === unlock.id ? unlock : entry)
              : [...(current.unlocks || []), unlock],
          } : current)}
              onDelete={(unlockId) => setEditingCampaign((current) => current ? { ...current, unlocks: (current.unlocks || []).filter((unlock) => unlock.id !== unlockId) } : current)}
          onClose={() => { setIsCampaignUnlocksOpen(false); campaignUnlocksTrigger.current?.focus(); }} />
      )}
      {editingCampaign && isCampaignActionsOpen && (
        <CampaignActionsModal actions={campaignActions} nodes={Object.values(editingCampaign.nodes)} cards={editorCards} items={campaignItems}
          unlocks={editingCampaign.unlocks || []} autosaveStatus={autosaveStatus}
          onSave={(action) => setEditingCampaign((current) => current ? {
            ...current,
            actions: current.actions?.some((entry) => entry.id === action.id)
              ? current.actions.map((entry) => entry.id === action.id ? action : entry)
              : [...(current.actions || []), action],
          } : current)}
          onClose={() => setIsCampaignActionsOpen(false)} />
      )}
      {editingCampaign && isCampaignItemsOpen && (
        <CampaignItemsModal items={campaignItems} autosaveStatus={autosaveStatus}
          onSave={(item) => setEditingCampaign((current) => current ? saveCampaignItem(current, item) : current)}
          onDelete={(itemId) => setEditingCampaign((current) => current ? { ...current, items: getCampaignItems(current).filter((item) => item.id !== itemId) } : current)}
          onClose={() => { setIsCampaignItemsOpen(false); campaignItemsTrigger.current?.focus(); }} />
      )}
      {editingCampaign && isInventoryOpen && (
        <div
          className="fixed inset-0 z-[60] bg-black/85 flex items-center justify-center p-4"
          onKeyDown={(event) => handleCollectionDialogKeyDown(event, closeInventory)}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="inventory-title"
            className="menu-panel w-full max-w-2xl flex flex-col gap-4 bg-slate-900 border border-slate-700 rounded-lg p-4 text-slate-100"
          >
            <div className="flex items-center justify-between gap-3">
              <h4 id="inventory-title" className="text-sm font-bold text-amber-300">Starting Inventory</h4>
              <button
                type="button"
                autoFocus
                title="Close inventory"
                aria-label="Close inventory"
                onClick={closeInventory}
                className="w-8 h-8 shrink-0 flex items-center justify-center rounded-lg text-slate-400 hover:bg-slate-800"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="min-h-0 overflow-y-auto divide-y divide-slate-800">
              {(editingCampaign.inventory || []).map((item) => (
                <div key={item.id} className="flex flex-wrap items-end gap-3 py-3">
                  <label className="flex-1 min-w-0 text-xs text-slate-400">
                    Object
                    <CampaignItemSelect
                      items={campaignItems}
                      value={item.object}
                      onChange={(object) => setEditingCampaign({ ...editingCampaign, inventory: editingCampaign.inventory?.map((entry) => entry.id === item.id ? { ...entry, object } : entry) })}
                      className="mt-1 w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-100"
                    />
                  </label>
                  <label className="w-24 shrink-0 text-xs text-slate-400">
                    Quantity
                    <input
                      type="number"
                      min="0"
                      step="1"
                      value={item.quantity}
                      aria-label={`${item.object || 'Object'} quantity`}
                      onChange={(event) => setEditingCampaign({ ...editingCampaign, inventory: editingCampaign.inventory?.map((entry) => entry.id === item.id ? { ...entry, quantity: Math.max(0, parseInt(event.target.value, 10) || 0) } : entry) })}
                      className="mt-1 w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-100"
                    />
                  </label>
                  <button
                    type="button"
                    title={`Remove ${item.object || 'object'}`}
                    aria-label={`Remove ${item.object || 'object'}`}
                    onClick={() => setEditingCampaign({ ...editingCampaign, inventory: editingCampaign.inventory?.filter((entry) => entry.id !== item.id) })}
                    className="w-9 h-9 shrink-0 flex items-center justify-center rounded-lg border border-slate-700 text-slate-400 hover:text-rose-300 hover:border-rose-600"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              ))}
              {!editingCampaign.inventory?.length && <p className="py-4 text-xs text-slate-500">Inventory is empty.</p>}
            </div>
            <button
              type="button"
              onClick={() => setEditingCampaign((current) => current ? {
                ...current,
                inventory: [...(current.inventory || []), { id: `item_${Date.now()}_${current.inventory?.length || 0}`, object: '', quantity: 1 }],
              } : current)}
              className="self-start flex items-center gap-2 px-3 py-2 rounded-lg border border-slate-700 bg-slate-800 hover:border-amber-500 text-xs text-amber-200"
            >
              <Plus className="w-4 h-4" />
              Add Object
            </button>
          </div>
        </div>
      )}
      {editingCampaign && isAdvancedSettingsOpen && (
        <div
          className="fixed inset-0 z-[60] bg-black/85 flex items-center justify-center p-4"
          onKeyDown={(event) => handleCollectionDialogKeyDown(event, closeAdvancedSettings)}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="advanced-settings-title"
            className="menu-panel w-full max-w-lg bg-slate-900 border border-slate-700 rounded-lg p-4 text-slate-100 space-y-4"
          >
            <div className="flex items-center justify-between gap-3">
              <h4 id="advanced-settings-title" className="text-sm font-bold text-amber-300">Advanced Settings</h4>
              <button
                type="button"
                autoFocus
                title="Close advanced settings"
                aria-label="Close advanced settings"
                onClick={closeAdvancedSettings}
                className="w-8 h-8 shrink-0 flex items-center justify-center rounded-lg text-slate-400 hover:bg-slate-800"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <label
              className="flex items-center gap-3 border-t border-slate-700 pt-4 text-sm"
              title="When checked, mana is a resource in the campaign. Otherwise, each battle defines the mana allowance."
            >
              <input
                type="checkbox"
                checked={editingCampaign.campaignMana ?? false}
                onChange={(event) => setEditingCampaign({
                  ...editingCampaign,
                  campaignMana: event.target.checked,
                  startingMana: editingCampaign.startingMana ?? 25,
                })}
                className="accent-amber-500"
              />
              Campaign mana
            </label>
            {editingCampaign.campaignMana && (
              <label className="block max-w-48 text-xs text-slate-400">
                Starting Mana
                <input
                  type="number"
                  min="0"
                  step="1"
                  value={editingCampaign.startingMana ?? 25}
                  onChange={(event) => setEditingCampaign({ ...editingCampaign, startingMana: Math.max(0, parseInt(event.target.value, 10) || 0) })}
                  className="mt-1 w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-100"
                />
              </label>
            )}
          </div>
        </div>
      )}
      {editingCampaign?.collectionSource === 'custom' && isCollectionOpen && (
        <div
          className="fixed inset-0 z-[60] bg-black/85 flex items-center justify-center p-4"
          onKeyDown={(event) => handleCollectionDialogKeyDown(event, closeCollectionView)}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="collection-view-title"
            className="menu-panel w-full max-w-2xl flex flex-col gap-3 bg-slate-900 border border-slate-700 rounded-lg p-4 text-slate-100"
          >
            <div className="flex items-center justify-between gap-3">
              <h4 id="collection-view-title" className="text-sm font-bold text-amber-300">
                Campaign Collection ({editingCampaign.startingCollection?.length || 0})
              </h4>
              <button
                type="button"
                autoFocus
                title="Close collection"
                aria-label="Close collection"
                onClick={closeCollectionView}
                className="w-8 h-8 shrink-0 flex items-center justify-center rounded-lg text-slate-400 hover:bg-slate-800"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="min-h-0 overflow-y-auto space-y-4">
              {([
                { cardType: 'Summoner', label: 'Archons' },
                { cardType: 'Monster', label: 'Units' },
                { cardType: null, label: 'Unavailable cards' },
              ] as const).map((group) => {
                const entries = (editingCampaign.startingCollection || []).filter((entry) =>
                  (editorCards.find((card) => card.id === entry.cardId)?.cardType ?? null) === group.cardType
                );
                if (group.cardType === null && !entries.length) return null;
                return (
                  <section key={group.label} aria-label={`Selected ${group.label.toLowerCase()}`} className="border-t border-slate-700 pt-3">
                    <h5 className={`text-xs font-bold mb-2 ${group.cardType === 'Summoner' ? 'text-amber-300' : 'text-sky-300'}`}>
                      {group.label} ({entries.length})
                    </h5>
                    <div className="divide-y divide-slate-800">
                      {entries.map((entry) => {
                        const card = editorCards.find((item) => item.id === entry.cardId);
                        return (
                          <div key={entry.cardId} className="flex flex-wrap items-center gap-3 py-2">
                            <div className="flex items-center gap-2 flex-1 min-w-0 text-xs">
                              {card?.imageUrl && <img src={card.imageUrl} alt="" loading="lazy" className="w-8 h-10 object-contain shrink-0" />}
                              <span className="break-words">
                                {card?.name || entry.cardId}{' '}
                                <span className="text-slate-500">{card ? `(${card.splinter} ${card.cardType === 'Summoner' ? 'Archon' : 'Unit'})` : '(Unavailable card)'}</span>
                              </span>
                            </div>
                            {card && (
                              <label className="text-xs text-slate-400 shrink-0">
                                Level
                                <select
                                  aria-label={`${card.name} starting level`}
                                  value={entry.maxLevel}
                                  onChange={(event) => setEditingCampaign({ ...editingCampaign, startingCollection: editingCampaign.startingCollection?.map((item) => item.cardId === entry.cardId ? { ...item, maxLevel: Number(event.target.value) } : item) })}
                                  className="ml-2 bg-slate-950 border border-slate-700 rounded-md px-2 py-1"
                                >
                                  {card.stats.map((stat) => <option key={stat.level} value={stat.level}>{stat.level}</option>)}
                                </select>
                              </label>
                            )}
                            <button
                              type="button"
                              title={`Remove ${card?.name || entry.cardId}`}
                              aria-label={`Remove ${card?.name || entry.cardId}`}
                              onClick={() => setEditingCampaign({ ...editingCampaign, startingCollection: editingCampaign.startingCollection?.filter((item) => item.cardId !== entry.cardId) })}
                              className="w-8 h-8 shrink-0 flex items-center justify-center rounded-lg border border-slate-700 text-slate-400 hover:text-rose-300 hover:border-rose-600"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        );
                      })}
                      {!entries.length && <p className="py-3 text-xs text-slate-500">No {group.label.toLowerCase()} selected.</p>}
                    </div>
                  </section>
                );
              })}
            </div>
          </div>
        </div>
      )}
      {editingCampaign?.collectionSource === 'custom' && collectionPickerType && (
        <div
          className="fixed inset-0 z-[60] bg-black/85 flex items-center justify-center p-4"
          onKeyDown={(event) => handleCollectionDialogKeyDown(event, closeCollectionPicker)}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="collection-picker-title"
            className="menu-panel w-full max-w-2xl flex flex-col gap-3 bg-slate-900 border border-slate-700 rounded-lg p-4 text-slate-100"
          >
            <div className="flex items-center justify-between gap-3">
              <h4 id="collection-picker-title" className="text-sm font-bold text-amber-300">
                {collectionPickerType === 'Summoner' ? 'Add Archon' : 'Add Unit'}
              </h4>
              <button
                type="button"
                title="Close card picker"
                aria-label="Close card picker"
                onClick={closeCollectionPicker}
                className="w-8 h-8 flex items-center justify-center rounded-lg text-slate-400 hover:bg-slate-800"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-[1fr_10rem] gap-3 items-end">
              <input
                type="search"
                autoFocus
                aria-label={collectionPickerType === 'Summoner' ? 'Search archons' : 'Search units'}
                placeholder={collectionPickerType === 'Summoner' ? 'Search archons' : 'Search units'}
                value={collectionSearch}
                onChange={(event) => setCollectionSearch(event.target.value)}
                className="w-full min-w-0 bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-sm"
              />
              <label className="text-xs text-slate-400">
                Splinter
                <select
                  value={collectionSplinter}
                  onChange={(event) => setCollectionSplinter(event.target.value as Splinter | 'ALL')}
                  className="mt-1 w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-100"
                >
                  <option value="ALL">All splinters</option>
                  {(['Fire', 'Water', 'Earth', 'Life', 'Death', 'Dragon', 'Neutral'] as const).map((splinter) => (
                    <option key={splinter} value={splinter}>{splinter}</option>
                  ))}
                </select>
              </label>
            </div>
            <div className="min-h-0 overflow-y-auto divide-y divide-slate-800">
              {collectionPickerCards.map((card) => (
                <div key={card.id} className="flex items-center gap-3 py-2">
                  {card.imageUrl && <img src={card.imageUrl} alt="" loading="lazy" className="w-10 h-14 object-contain shrink-0" />}
                  <div className="flex-1 min-w-0">
                    <p className="text-sm break-words">{card.name}</p>
                    <p className="text-xs text-slate-500">{card.splinter} · {card.rarity}</p>
                  </div>
                  <button
                    type="button"
                    title={`Add ${card.name}`}
                    aria-label={`Add ${card.name}`}
                    onClick={() => setEditingCampaign((current) => {
                      if (!current || current.startingCollection?.some((entry) => entry.cardId === card.id)) return current;
                      return { ...current, startingCollection: [...(current.startingCollection || []), { cardId: card.id, maxLevel: 1 }] };
                    })}
                    className="w-8 h-8 shrink-0 flex items-center justify-center rounded-lg border border-slate-700 text-amber-300 hover:border-amber-500 hover:bg-slate-800"
                  >
                    <Plus className="w-4 h-4" />
                  </button>
                </div>
              ))}
              {!collectionPickerCards.length && <p className="py-6 text-center text-xs text-slate-500">No available cards match.</p>}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
