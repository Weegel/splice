import React, { useState } from 'react';
import {
  CampaignDefinition,
  CampaignNode,
  CampaignNodeType,
  TextCampaignNode,
  DecisionCampaignNode,
  BattleCampaignNode,
  EndCampaignNode,
  DecisionChoice,
} from '../types/campaign';
import { PvEChallenge } from '../types/battle';
import { CardDefinition } from '../types/card';
import { SPLINTERLANDS_EDITIONS } from '../data/editions';
import { StorageService } from '../data/storage';
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
} from 'lucide-react';

interface CampaignEditorProps {
  campaigns: CampaignDefinition[];
  challenges: PvEChallenge[];
  cards: CardDefinition[];
  onCampaignsUpdated: () => void;
  onPlayCampaign: (campaign: CampaignDefinition) => void;
}

const DIFFICULTY_COLORS: Record<string, string> = {
  Novice: 'bg-emerald-950 text-emerald-400 border-emerald-600',
  Bronze: 'bg-amber-950 text-amber-400 border-amber-600',
  Silver: 'bg-slate-800 text-slate-300 border-slate-500',
  Gold: 'bg-yellow-950 text-yellow-300 border-yellow-500',
  Diamond: 'bg-cyan-950 text-cyan-300 border-cyan-400',
  Boss: 'bg-rose-950 text-rose-300 border-rose-500 font-extrabold shadow-rose-500/30',
};

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
  battle: {
    label: 'Combat / Battle',
    icon: Swords,
    color: 'text-rose-400',
    border: 'border-rose-600/50',
    bg: 'bg-rose-950/40',
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
  const [feedback, setFeedback] = useState<string | null>(null);

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
      difficulty: 'Silver',
      author: 'Custom Creator',
      isCustom: true,
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

  const handleSaveCampaign = () => {
    if (!editingCampaign) return;
    if (!editingCampaign.name.trim()) {
      alert('Please enter a campaign name.');
      return;
    }
    if (!editingCampaign.nodes[editingCampaign.startNodeId]) {
      alert('The campaign must have a valid starting node.');
      return;
    }
    StorageService.saveCampaign(editingCampaign);
    onCampaignsUpdated();
    setEditingCampaign(null);
    showFeedback('Campaign saved successfully!');
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
    const data = JSON.stringify(campaign, null, 2);
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

    const importFiles = Array.from(files).map(
      (file) =>
        new Promise<string>((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => resolve(String(reader.result || ''));
          reader.onerror = () => reject(reader.error || new Error(`Could not read ${file.name}`));
          reader.readAsText(file);
        })
    );

    void Promise.all(importFiles)
      .then((contents) => {
        let totalCount = 0;
        const importedNames: string[] = [];
        const errors: string[] = [];
        contents.forEach((content, index) => {
          const result = StorageService.importCampaignsJson(content);
          if (result.success) {
            totalCount += result.count;
            const parsed = JSON.parse(content);
            const campaigns = Array.isArray(parsed) ? parsed : parsed.campaigns || [parsed];
            campaigns.forEach((campaign: CampaignDefinition) => {
              if (campaign.name) importedNames.push(campaign.name);
            });
          } else {
            errors.push(`${files[index].name}: ${result.error || 'invalid JSON'}`);
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
    } else if (type === 'battle') {
      newNode = {
        id: newId,
        type: 'battle',
        title: 'New Battle Encounter',
        description: 'Describe the enemy ambush or battlefield situation...',
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
    setEditingCampaign({
      ...editingCampaign,
      nodes: {
        ...editingCampaign.nodes,
        [updatedNode.id]: updatedNode,
      },
    });
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
    } else if (targetType === 'battle') {
      newNode = {
        id: newId,
        type: 'battle',
        title: `Battle Encounter ${count}`,
        description: 'Enemy forces block your path! Assemble your team and fight.',
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

          return (
            <div
              key={camp.id}
              className="bg-slate-900/90 border border-slate-800 hover:border-slate-700 rounded-2xl p-5 flex flex-col justify-between transition-all hover:shadow-2xl shadow-slate-950/50 relative overflow-hidden group"
            >
              {/* Top Banner */}
              <div>
                <div className="flex items-center justify-between mb-3">
                  <span
                    className={`text-xs px-2.5 py-0.5 rounded-full border font-bold uppercase tracking-wider ${
                      DIFFICULTY_COLORS[camp.difficulty] || 'bg-slate-800 text-slate-300'
                    }`}
                  >
                    {camp.difficulty}
                  </span>

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
                <div className="mt-4 pt-3 border-t border-slate-800/80 flex items-center gap-3 text-xs text-slate-400">
                  <div className="flex items-center gap-1">
                    <Swords className="w-3.5 h-3.5 text-rose-400" />
                    <span>{battleCount} Battles</span>
                  </div>
                  <div className="flex items-center gap-1">
                    <GitFork className="w-3.5 h-3.5 text-amber-400" />
                    <span>{choiceCount} Choices</span>
                  </div>
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
      {editingCampaign && (
        <div className="fixed inset-0 z-50 bg-black/85 backdrop-blur-md flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-slate-900 border border-slate-700 rounded-3xl w-full max-w-6xl max-h-[92vh] overflow-y-auto shadow-2xl p-6 text-slate-100 flex flex-col gap-6">
            {/* Modal Header */}
            <div className="flex items-center justify-between border-b border-slate-800 pb-4">
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
                onClick={() => setEditingCampaign(null)}
                className="p-1.5 rounded-xl hover:bg-slate-800 text-slate-400 hover:text-slate-200"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Campaign Metadata Fields */}
            <div className="bg-slate-950 border border-slate-800 rounded-2xl p-4 grid grid-cols-1 md:grid-cols-4 gap-4">
              <div className="md:col-span-2">
                <label className="block text-xs font-semibold text-slate-400 mb-1">Campaign Title</label>
                <input
                  type="text"
                  value={editingCampaign.name}
                  onChange={(e) => setEditingCampaign({ ...editingCampaign, name: e.target.value })}
                  className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-1.5 text-sm font-bold text-slate-100 focus:outline-none focus:border-amber-500"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-400 mb-1">Difficulty</label>
                <select
                  value={editingCampaign.difficulty}
                  onChange={(e) => setEditingCampaign({ ...editingCampaign, difficulty: e.target.value as any })}
                  className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-1.5 text-xs text-slate-200"
                >
                  <option value="Novice">Novice</option>
                  <option value="Bronze">Bronze</option>
                  <option value="Silver">Silver</option>
                  <option value="Gold">Gold</option>
                  <option value="Diamond">Diamond</option>
                  <option value="Boss">Boss</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-400 mb-1">Start Node</label>
                <select
                  value={editingCampaign.startNodeId}
                  onChange={(e) => setEditingCampaign({ ...editingCampaign, startNodeId: e.target.value })}
                  className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-1.5 text-xs text-amber-400 font-bold"
                >
                  {Object.values(editingCampaign.nodes).map((n) => (
                    <option key={n.id} value={n.id}>
                      [{n.type.toUpperCase()}] {n.title}
                    </option>
                  ))}
                </select>
              </div>

              <div className="md:col-span-4">
                <label className="block text-xs font-semibold text-slate-400 mb-1">Campaign Overview Lore</label>
                <input
                  type="text"
                  value={editingCampaign.description}
                  onChange={(e) => setEditingCampaign({ ...editingCampaign, description: e.target.value })}
                  className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-1.5 text-xs text-slate-200"
                />
              </div>

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

                  {/* Add Node Tool Palette */}
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-1.5 mb-3">
                    <button
                      type="button"
                      onClick={() => handleAddNode('text')}
                      className="p-1.5 bg-sky-950/80 hover:bg-sky-900 border border-sky-600/50 text-sky-300 rounded-lg text-[11px] font-bold flex items-center justify-center gap-1 transition"
                    >
                      <Plus className="w-3 h-3" /> Story
                    </button>
                    <button
                      type="button"
                      onClick={() => handleAddNode('decision')}
                      className="p-1.5 bg-amber-950/80 hover:bg-amber-900 border border-amber-600/50 text-amber-300 rounded-lg text-[11px] font-bold flex items-center justify-center gap-1 transition"
                    >
                      <Plus className="w-3 h-3" /> Choice
                    </button>
                    <button
                      type="button"
                      onClick={() => handleAddNode('battle')}
                      className="p-1.5 bg-rose-950/80 hover:bg-rose-900 border border-rose-600/50 text-rose-300 rounded-lg text-[11px] font-bold flex items-center justify-center gap-1 transition"
                    >
                      <Plus className="w-3 h-3" /> Battle
                    </button>
                    <button
                      type="button"
                      onClick={() => handleAddNode('end')}
                      className="p-1.5 bg-emerald-950/80 hover:bg-emerald-900 border border-emerald-600/50 text-emerald-300 rounded-lg text-[11px] font-bold flex items-center justify-center gap-1 transition"
                    >
                      <Plus className="w-3 h-3" /> End
                    </button>
                  </div>

                  {/* Nodes List */}
                  <div className="space-y-2 max-h-[380px] overflow-y-auto pr-1">
                    {Object.values(editingCampaign.nodes).map((node) => {
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
                        onChange={(e) => handleUpdateNode({ ...currentNode, title: e.target.value })}
                        className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-1.5 text-sm font-bold text-slate-100 focus:outline-none focus:border-amber-500"
                      />
                    </div>

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

                            <select
                              value={currentNode.nextNodeId || ''}
                              onChange={(e) =>
                                handleUpdateNode({ ...currentNode, nextNodeId: e.target.value || undefined })
                              }
                              className="w-full bg-slate-950 border border-slate-700 rounded-lg px-2.5 py-1.5 text-xs text-sky-300 font-bold focus:outline-none focus:border-sky-500"
                            >
                              <option value="">-- No Transition (Story Concludes) --</option>
                              {Object.values(editingCampaign.nodes)
                                .filter((n) => n.id !== currentNode.id)
                                .map((n) => (
                                  <option key={n.id} value={n.id}>
                                    [{n.type.toUpperCase()}] {n.title} (ID: {n.id.slice(0, 10)})
                                  </option>
                                ))}
                            </select>

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

                    {/* 2. DECISION NODE FORM */}
                    {currentNode.type === 'decision' && (
                      <div className="space-y-4">
                        <div>
                          <label className="block text-xs font-semibold text-slate-400 mb-1">Decision Prompt Question</label>
                          <textarea
                            value={currentNode.prompt}
                            onChange={(e) => handleUpdateNode({ ...currentNode, prompt: e.target.value })}
                            rows={2}
                            className="w-full bg-slate-900 border border-slate-700 rounded-lg p-2.5 text-xs text-slate-200 focus:outline-none focus:border-amber-500"
                            placeholder="What dilemma or fork in the road is presented to the player?"
                          />
                        </div>

                        {/* Choices List */}
                        <div className="space-y-3">
                          <div className="flex items-center justify-between">
                            <label className="text-xs font-bold text-amber-400 uppercase tracking-wider">
                              Decision Choices ({currentNode.choices.length})
                            </label>
                            <button
                              type="button"
                              onClick={() => {
                                const newChoice: DecisionChoice = {
                                  id: `choice_${Date.now()}`,
                                  text: `New Choice ${currentNode.choices.length + 1}`,
                                  description: 'Description of consequence',
                                  nextNodeId: '',
                                };
                                handleUpdateNode({
                                  ...currentNode,
                                  choices: [...currentNode.choices, newChoice],
                                });
                              }}
                              className="px-2.5 py-1 bg-amber-600 hover:bg-amber-500 text-white font-bold rounded-lg text-xs flex items-center gap-1"
                            >
                              <Plus className="w-3.5 h-3.5" /> Add Choice
                            </button>
                          </div>

                          {currentNode.choices.map((choice, cIdx) => (
                            <div
                              key={choice.id}
                              className="p-3 bg-slate-900 rounded-xl border border-slate-800 space-y-2"
                            >
                              <div className="flex items-center justify-between gap-2">
                                <span className="text-xs font-bold text-amber-400">Choice #{cIdx + 1}</span>
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
                                placeholder="Choice label / action"
                                className="w-full bg-slate-950 border border-slate-700 rounded-lg px-2.5 py-1 text-xs text-slate-100 font-semibold"
                              />

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

                                  <select
                                    value={choice.nextNodeId || ''}
                                    onChange={(e) => {
                                      const choices = [...currentNode.choices];
                                      choices[cIdx].nextNodeId = e.target.value;
                                      handleUpdateNode({ ...currentNode, choices });
                                    }}
                                    className="w-full bg-slate-950 border border-slate-700 rounded-lg px-2 py-1 text-xs text-amber-300 font-bold"
                                  >
                                    <option value="">-- Leads To Node --</option>
                                    {Object.values(editingCampaign.nodes)
                                      .filter((n) => n.id !== currentNode.id)
                                      .map((n) => (
                                        <option key={n.id} value={n.id}>
                                          [{n.type.toUpperCase()}] {n.title} (ID: {n.id.slice(0, 10)})
                                        </option>
                                      ))}
                                  </select>
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
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* 3. BATTLE NODE FORM */}
                    {currentNode.type === 'battle' && (
                      <div className="space-y-4">
                        <div>
                          <label className="block text-xs font-semibold text-slate-400 mb-1">
                            Battle Context & Encounter Briefing
                          </label>
                          <textarea
                            value={currentNode.description || ''}
                            onChange={(e) => handleUpdateNode({ ...currentNode, description: e.target.value })}
                            rows={2}
                            className="w-full bg-slate-900 border border-slate-700 rounded-lg p-2.5 text-xs text-slate-200 focus:outline-none focus:border-rose-500"
                            placeholder="Describe the monsters, ambush, or battlefield condition..."
                          />
                        </div>

                        <div>
                          <label className="block text-xs font-semibold text-slate-400 mb-1">
                            Linked PvE Battle Challenge Definition
                          </label>
                          <select
                            value={currentNode.challengeId || ''}
                            onChange={(e) => handleUpdateNode({ ...currentNode, challengeId: e.target.value })}
                            className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-xs text-rose-300 font-bold"
                          >
                            <option value="">-- Select a PvE Encounter --</option>
                            {challenges.map((ch) => (
                              <option key={ch.id} value={ch.id}>
                                {ch.name} ({ch.difficulty} • {ch.manaCap} Mana • Rules:{' '}
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

                              <select
                                value={currentNode.onVictoryNodeId || ''}
                                onChange={(e) =>
                                  handleUpdateNode({ ...currentNode, onVictoryNodeId: e.target.value || undefined })
                                }
                                className="w-full bg-slate-900 border border-slate-700 rounded-lg px-2.5 py-1.5 text-xs text-emerald-300 font-bold"
                              >
                                <option value="">-- Victory Leads To --</option>
                                {Object.values(editingCampaign.nodes)
                                  .filter((n) => n.id !== currentNode.id)
                                  .map((n) => (
                                    <option key={n.id} value={n.id}>
                                      [{n.type.toUpperCase()}] {n.title} (ID: {n.id.slice(0, 10)})
                                    </option>
                                  ))}
                              </select>

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

                              <select
                                value={currentNode.onDefeatNodeId || ''}
                                onChange={(e) =>
                                  handleUpdateNode({ ...currentNode, onDefeatNodeId: e.target.value || undefined })
                                }
                                className="w-full bg-slate-900 border border-slate-700 rounded-lg px-2.5 py-1.5 text-xs text-rose-300 font-bold"
                              >
                                <option value="">-- Defeat Leads To --</option>
                                {Object.values(editingCampaign.nodes)
                                  .filter((n) => n.id !== currentNode.id)
                                  .map((n) => (
                                    <option key={n.id} value={n.id}>
                                      [{n.type.toUpperCase()}] {n.title} (ID: {n.id.slice(0, 10)})
                                    </option>
                                  ))}
                              </select>

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
                            </div>
                          </div>

                          <div>
                            <label className="block text-xs font-semibold text-slate-400 mb-1">
                              Unlock Card Reward (Optional)
                            </label>
                            <select
                              value={currentNode.rewardCardId || ''}
                              onChange={(e) =>
                                handleUpdateNode({ ...currentNode, rewardCardId: e.target.value || undefined })
                              }
                              className="w-full bg-slate-950 border border-slate-700 rounded-lg px-2.5 py-1.5 text-xs text-amber-300"
                            >
                              <option value="">-- None --</option>
                              {cards.map((c) => (
                                <option key={c.id} value={c.id}>
                                  {c.name} ({c.splinter} {c.cardType} • {c.rarity})
                                </option>
                              ))}
                            </select>
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
            <div className="flex items-center justify-end gap-3 pt-4 border-t border-slate-800">
              <button
                type="button"
                onClick={() => setEditingCampaign(null)}
                className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 font-semibold text-sm transition"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleSaveCampaign}
                className="px-6 py-2 rounded-xl bg-gradient-to-r from-amber-600 to-rose-600 hover:from-amber-500 hover:to-rose-500 text-white font-bold text-sm shadow-lg shadow-amber-600/30 flex items-center gap-1.5 transition"
              >
                <Check className="w-4 h-4" />
                Save Campaign
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
