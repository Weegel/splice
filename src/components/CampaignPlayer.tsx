import React, { useState, useEffect } from 'react';
import {
  CampaignDefinition,
  CampaignNode,
  TextCampaignNode,
  DecisionCampaignNode,
  BattleCampaignNode,
  EndCampaignNode,
  CampaignRunState,
} from '../types/campaign';
import { CardDefinition } from '../types/card';
import { PvEChallenge, TeamSelection, BattleLog } from '../types/battle';
import { PlayerCollectionState } from '../services/splinterlandsApi';
import { StorageService } from '../data/storage';
import { BattleEngine } from '../engine/battleEngine';
import { BattlePreparation } from './BattlePreparation';
import { BattleViewer } from './BattleViewer';
import { CardPreview } from './CardPreview';
import {
  ArrowLeft,
  RotateCcw,
  BookOpen,
  Swords,
  GitFork,
  Award,
  Skull,
  Shield,
  ChevronRight,
  Sparkles,
  Zap,
  Info,
  CheckCircle2,
  XCircle,
  ArrowRight,
} from 'lucide-react';

interface CampaignPlayerProps {
  campaign: CampaignDefinition;
  cards: CardDefinition[];
  challenges: PvEChallenge[];
  playerCollection?: PlayerCollectionState | null;
  onExit: () => void;
}

export const CampaignPlayer: React.FC<CampaignPlayerProps> = ({
  campaign,
  cards,
  challenges,
  playerCollection,
  onExit,
}) => {
  // Campaign progress state
  const [runState, setRunState] = useState<CampaignRunState>(() => {
    const existing = StorageService.getCampaignRun(campaign.id);
    if (existing && campaign.nodes[existing.currentNodeId]) {
      return existing;
    }
    return {
      campaignId: campaign.id,
      currentNodeId: campaign.startNodeId,
      visitedNodeIds: [campaign.startNodeId],
      battleHistory: [],
      unlockedCardIds: [],
      earnedCards: [],
      status: 'in_progress',
    };
  });

  // Combat sub-states for Battle nodes
  const [isInBattlePrep, setIsInBattlePrep] = useState<boolean>(false);
  const [activeBattleLog, setActiveBattleLog] = useState<BattleLog | null>(null);

  // Save run state whenever it updates
  useEffect(() => {
    StorageService.saveCampaignRun(runState);
  }, [runState]);

  const currentNode: CampaignNode =
    campaign.nodes[runState.currentNodeId] || campaign.nodes[campaign.startNodeId];

  const campaignCards = [
    ...cards,
    ...(campaign.embeddedCards || []).filter(
      (embeddedCard) => !cards.some((card) => card.id === embeddedCard.id)
    ),
    ...(runState.earnedCards || []).filter(
      (earnedCard) => !cards.some((card) => card.id === earnedCard.id) &&
        !(campaign.embeddedCards || []).some((card) => card.id === earnedCard.id)
    ),
  ];

  // Restart campaign run
  const handleRestart = () => {
    if (confirm('Restart this campaign from the beginning?')) {
      const resetState: CampaignRunState = {
        campaignId: campaign.id,
        currentNodeId: campaign.startNodeId,
        visitedNodeIds: [campaign.startNodeId],
        battleHistory: [],
        unlockedCardIds: [],
        earnedCards: [],
        status: 'in_progress',
      };
      setRunState(resetState);
      setIsInBattlePrep(false);
      setActiveBattleLog(null);
    }
  };

  // Transition to target node
  const navigateToNode = (targetNodeId: string) => {
    if (!campaign.nodes[targetNodeId]) {
      alert(`Target node "${targetNodeId}" does not exist in campaign.`);
      return;
    }
    const targetNode = campaign.nodes[targetNodeId];
    setRunState((prev) => ({
      ...prev,
      currentNodeId: targetNodeId,
      visitedNodeIds: [...prev.visitedNodeIds, targetNodeId],
      status: targetNode.type === 'end' ? 'completed' : 'in_progress',
      finalOutcome: targetNode.type === 'end' ? targetNode.outcome : undefined,
    }));
    setIsInBattlePrep(false);
    setActiveBattleLog(null);
  };

  // Resolve challenge associated with current battle node
  const getBattleChallenge = (battleNode: BattleCampaignNode): PvEChallenge | null => {
    if (battleNode.inlineChallenge) {
      return battleNode.inlineChallenge;
    }
    if (battleNode.challengeId) {
      return (
        challenges.find((ch) => ch.id === battleNode.challengeId) ||
        campaign.embeddedChallenges?.find((ch) => ch.id === battleNode.challengeId) ||
        null
      );
    }
    return challenges[0] || null;
  };

  const handleLaunchCampaignBattle = (playerTeam: TeamSelection) => {
    if (currentNode.type !== 'battle') return;
    const challenge = getBattleChallenge(currentNode);
    if (!challenge) {
      alert('Battle challenge definition could not be found.');
      return;
    }

    const engine = new BattleEngine(
      campaignCards,
      challenge.rulesets,
      challenge.manaCap,
      playerTeam,
      challenge.enemyTeam,
      challenge.allowedSplinters
    );

    const log = engine.resolve();
    StorageService.saveBattleLog(log);
    setActiveBattleLog(log);
  };

  const handleFinishBattleViewer = () => {
    if (!activeBattleLog || currentNode.type !== 'battle') {
      setActiveBattleLog(null);
      setIsInBattlePrep(false);
      return;
    }

    const outcome = activeBattleLog.winner === 1 ? 'victory' : activeBattleLog.winner === 2 ? 'defeat' : 'draw';
    const unlocked = [...runState.unlockedCardIds];
    const earnedCards = [...(runState.earnedCards || [])];

    if (outcome === 'victory' && currentNode.rewardCardId && !unlocked.includes(currentNode.rewardCardId)) {
      unlocked.push(currentNode.rewardCardId);
      const rewardCard = campaignCards.find((card) => card.id === currentNode.rewardCardId);
      if (rewardCard && !earnedCards.some((card) => card.id === rewardCard.id)) {
        earnedCards.push({ ...rewardCard, isCustom: true });
      }
    }

    const updatedRun: CampaignRunState = {
      ...runState,
      battleHistory: [
        ...runState.battleHistory,
        {
          nodeId: currentNode.id,
          battleLogId: activeBattleLog.id,
          outcome,
        },
      ],
      unlockedCardIds: unlocked,
      earnedCards,
    };

    setRunState(updatedRun);
    setActiveBattleLog(null);
    setIsInBattlePrep(false);

    // Branch to next node based on outcome
    if (outcome === 'victory' && currentNode.onVictoryNodeId) {
      navigateToNode(currentNode.onVictoryNodeId);
    } else if (outcome === 'defeat' && currentNode.onDefeatNodeId) {
      navigateToNode(currentNode.onDefeatNodeId);
    } else if (outcome === 'draw' && (currentNode.onDrawNodeId || currentNode.onDefeatNodeId)) {
      navigateToNode(currentNode.onDrawNodeId || currentNode.onDefeatNodeId!);
    }
  };

  return (
    <div className="space-y-6">
      {/* Top Campaign Status Header */}
      <div className="bg-slate-900/95 border border-slate-800 rounded-2xl p-4 shadow-xl flex flex-col sm:flex-row items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <button
            onClick={onExit}
            className="p-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 transition flex items-center gap-1.5 text-xs font-bold"
          >
            <ArrowLeft className="w-4 h-4" />
            Exit Campaign
          </button>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-lg font-bold font-fantasy text-amber-400">{campaign.name}</h2>
              <span className="text-[10px] uppercase font-bold px-2 py-0.5 rounded-full bg-slate-950 border border-slate-700 text-slate-300">
                {campaign.difficulty}
              </span>
            </div>
            <div className="text-xs text-slate-400 flex items-center gap-2 mt-0.5">
              <span>Chapter: {currentNode.title}</span>
              <span>•</span>
              <span>{runState.visitedNodeIds.length} Nodes Visited</span>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={handleRestart}
            className="px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-rose-950 text-slate-300 hover:text-rose-300 border border-slate-700 text-xs font-semibold flex items-center gap-1.5 transition"
            title="Restart campaign from beginning"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            Restart Quest
          </button>
        </div>
      </div>

      {/* ACTIVE BATTLE VIEWER EMBED */}
      {activeBattleLog ? (
        <BattleViewer
          battleLog={activeBattleLog}
          onExit={handleFinishBattleViewer}
          onRematch={() => {
            setActiveBattleLog(null);
            setIsInBattlePrep(true);
          }}
        />
      ) : isInBattlePrep && currentNode.type === 'battle' ? (
        /* BATTLE PREPARATION EMBED */
        (() => {
          const challenge = getBattleChallenge(currentNode);
          if (!challenge) {
            return (
              <div className="p-8 text-center bg-slate-900 rounded-2xl border border-slate-800">
                <p className="text-rose-400 font-bold">Challenge definition not found.</p>
                <button
                  onClick={() => setIsInBattlePrep(false)}
                  className="mt-3 px-4 py-2 bg-slate-800 rounded-xl text-xs font-bold text-slate-200"
                >
                  Return
                </button>
              </div>
            );
          }
          return (
            <BattlePreparation
              challenge={challenge}
              cards={campaignCards}
              playerCollection={playerCollection}
                            allowedTiers={campaign.allowedTiers}
                            allowGladiators={campaign.allowGladiators}
                            allowRuni={campaign.allowRuni}
              maxCardLevel={campaign.maxCardLevel}
                            maxCardLevelsByRarity={campaign.maxCardLevelsByRarity}
              onBack={() => setIsInBattlePrep(false)}
              onLaunchBattle={handleLaunchCampaignBattle}
            />
          );
        })()
      ) : (
        /* NARRATIVE / DECISION / BATTLE BRIEFING CONTAINER */
        <div className="bg-slate-900/90 border border-slate-800 rounded-3xl p-6 sm:p-8 shadow-2xl space-y-8 relative overflow-hidden max-w-4xl mx-auto">
          {/* Background Ambient Glow */}
          <div className="absolute top-0 right-0 w-96 h-96 bg-amber-500/5 rounded-full blur-3xl pointer-events-none" />

          {/* 1. TEXT / LORE NODE */}
          {currentNode.type === 'text' && (
            <div className="space-y-6 animate-fade-in">
              <div className="flex items-center gap-3 border-b border-slate-800 pb-4">
                {currentNode.speakerAvatarUrl ? (
                  <img
                    src={currentNode.speakerAvatarUrl}
                    alt={currentNode.speakerName || 'Speaker'}
                    className="w-14 h-14 rounded-2xl object-cover border-2 border-amber-500/60 shadow-lg"
                  />
                ) : (
                  <div className="w-14 h-14 rounded-2xl bg-amber-600/20 border-2 border-amber-500/40 flex items-center justify-center text-amber-400 font-bold">
                    <BookOpen className="w-6 h-6" />
                  </div>
                )}
                <div>
                  <h3 className="text-xl font-bold font-fantasy text-slate-100">{currentNode.title}</h3>
                  {currentNode.speakerName && (
                    <span className="text-xs font-bold text-amber-400 uppercase tracking-wider">
                      {currentNode.speakerName}
                    </span>
                  )}
                </div>
              </div>

              {/* Story Narrative Box */}
              <div className="bg-slate-950/80 border border-slate-800 rounded-2xl p-6 shadow-inner text-slate-200 text-sm sm:text-base leading-relaxed whitespace-pre-line font-sans">
                {currentNode.content}
              </div>

              {/* Action Continue Button */}
              <div className="flex justify-end pt-2">
                <button
                  onClick={() => {
                    if (currentNode.nextNodeId) {
                      navigateToNode(currentNode.nextNodeId);
                    } else {
                      alert('This story path reaches an open conclusion.');
                    }
                  }}
                  className="px-6 py-3 bg-gradient-to-r from-amber-600 to-rose-600 hover:from-amber-500 hover:to-rose-500 text-white font-extrabold rounded-2xl shadow-xl shadow-amber-600/30 flex items-center gap-2 text-sm uppercase tracking-wider transition transform active:scale-95"
                >
                  <span>{currentNode.buttonText || 'Continue Adventure'}</span>
                  <ArrowRight className="w-4 h-4" />
                </button>
              </div>
            </div>
          )}

          {/* 2. DECISION NODE */}
          {currentNode.type === 'decision' && (
            <div className="space-y-6 animate-fade-in">
              <div className="flex items-center gap-3 border-b border-slate-800 pb-4">
                <div className="w-12 h-12 rounded-2xl bg-amber-600/20 border-2 border-amber-500/40 flex items-center justify-center text-amber-400">
                  <GitFork className="w-6 h-6" />
                </div>
                <div>
                  <h3 className="text-xl font-bold font-fantasy text-slate-100">{currentNode.title}</h3>
                  <span className="text-xs font-bold text-amber-400 uppercase tracking-wider">
                    Crossroads & Strategic Choice
                  </span>
                </div>
              </div>

              {/* Decision Question Prompt */}
              <div className="bg-slate-950/90 border border-slate-800 rounded-2xl p-5 shadow-inner">
                <p className="text-sm sm:text-base font-semibold text-slate-200 leading-relaxed">
                  {currentNode.prompt}
                </p>
              </div>

              {/* Choices Options Grid */}
              <div className="space-y-3">
                {currentNode.choices.map((choice, idx) => (
                  <button
                    key={choice.id}
                    onClick={() => {
                      if (choice.nextNodeId) {
                        navigateToNode(choice.nextNodeId);
                      } else {
                        alert('This choice has no linked destination.');
                      }
                    }}
                    className="w-full text-left p-4 sm:p-5 rounded-2xl border-2 border-slate-800 hover:border-amber-500 bg-slate-950/80 hover:bg-slate-900/90 transition-all group shadow-lg flex items-center justify-between gap-4 select-none"
                  >
                    <div className="space-y-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="w-6 h-6 rounded-full bg-slate-800 group-hover:bg-amber-600 text-slate-300 group-hover:text-white font-bold text-xs flex items-center justify-center shrink-0 transition">
                          {idx + 1}
                        </span>
                        <span className="font-bold text-slate-100 group-hover:text-amber-300 text-sm sm:text-base">
                          {choice.text}
                        </span>
                      </div>
                      {choice.description && (
                        <p className="text-xs text-slate-400 pl-8">{choice.description}</p>
                      )}
                      {choice.consequenceSummary && (
                        <p className="text-[11px] text-amber-400/90 font-medium pl-8 italic">
                          ⚡ {choice.consequenceSummary}
                        </p>
                      )}
                    </div>

                    <ChevronRight className="w-5 h-5 text-slate-500 group-hover:text-amber-400 group-hover:translate-x-1 transition shrink-0" />
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* 3. BATTLE NODE BRIEFING */}
          {currentNode.type === 'battle' && (
            (() => {
              const challenge = getBattleChallenge(currentNode);
              return (
                <div className="space-y-6 animate-fade-in">
                  <div className="flex items-center gap-3 border-b border-slate-800 pb-4">
                    <div className="w-12 h-12 rounded-2xl bg-rose-600/20 border-2 border-rose-500/40 flex items-center justify-center text-rose-400">
                      <Swords className="w-6 h-6" />
                    </div>
                    <div>
                      <h3 className="text-xl font-bold font-fantasy text-slate-100">{currentNode.title}</h3>
                      <span className="text-xs font-bold text-rose-400 uppercase tracking-wider">
                        Encounter Impending
                      </span>
                    </div>
                  </div>

                  {/* Battle Lore Description */}
                  {currentNode.description && (
                    <div className="bg-slate-950/80 border border-slate-800 rounded-2xl p-5 text-slate-200 text-sm leading-relaxed">
                      {currentNode.description}
                    </div>
                  )}

                  {/* Challenge Intel Box */}
                  {challenge && (
                    <div className="p-4 bg-slate-950 border border-slate-800 rounded-2xl space-y-3">
                      <div className="flex items-center justify-between">
                        <span className="font-bold text-sm text-amber-400">
                          Opponent Challenge: {challenge.name}
                        </span>
                        <span className="text-xs px-2.5 py-0.5 rounded-full bg-blue-950 text-blue-300 border border-blue-700 font-bold">
                          Mana Cap: {challenge.manaCap}
                        </span>
                      </div>

                      <div className="flex flex-wrap gap-1">
                        <span className="text-xs text-slate-400 self-center mr-1">Rulesets:</span>
                        {challenge.rulesets.map((r) => (
                          <span
                            key={r}
                            className="text-[10px] px-2 py-0.5 rounded bg-rose-950 border border-rose-600/50 text-rose-300 font-bold"
                          >
                            {r}
                          </span>
                        ))}
                      </div>

                      {currentNode.rewardCardId && (
                        <div className="text-xs text-amber-400 flex items-center gap-1.5 pt-1 border-t border-slate-800">
                          <Award className="w-4 h-4" />
                          <span>
                            Victory Reward: Unlock card{' '}
                            <strong>{campaignCards.find((c) => c.id === currentNode.rewardCardId)?.name}</strong>
                          </span>
                        </div>
                      )}
                    </div>
                  )}

                  {/* Action: Deploy Troops */}
                  <div className="flex justify-end pt-2">
                    <button
                      onClick={() => setIsInBattlePrep(true)}
                      className="px-8 py-3 bg-gradient-to-r from-rose-600 to-amber-600 hover:from-rose-500 hover:to-amber-500 text-white font-extrabold rounded-2xl shadow-xl shadow-rose-600/30 flex items-center gap-2 text-sm uppercase tracking-wider transition transform active:scale-95"
                    >
                      <Swords className="w-4 h-4" />
                      <span>Assemble Team & Fight</span>
                    </button>
                  </div>
                </div>
              );
            })()
          )}

          {/* 4. END NODE CONCLUSION */}
          {currentNode.type === 'end' && (
            <div className="space-y-6 text-center animate-fade-in py-4">
              <div className="flex justify-center">
                {currentNode.outcome === 'victory' ? (
                  <div className="w-16 h-16 rounded-3xl bg-emerald-950 border-2 border-emerald-500 flex items-center justify-center text-emerald-400 shadow-2xl shadow-emerald-500/30 animate-bounce">
                    <Award className="w-8 h-8" />
                  </div>
                ) : currentNode.outcome === 'defeat' ? (
                  <div className="w-16 h-16 rounded-3xl bg-rose-950 border-2 border-rose-500 flex items-center justify-center text-rose-400 shadow-2xl shadow-rose-500/30">
                    <Skull className="w-8 h-8" />
                  </div>
                ) : (
                  <div className="w-16 h-16 rounded-3xl bg-amber-950 border-2 border-amber-500 flex items-center justify-center text-amber-400 shadow-2xl shadow-amber-500/30">
                    <Sparkles className="w-8 h-8" />
                  </div>
                )}
              </div>

              <div>
                <h3 className="text-3xl font-black font-fantasy tracking-wide">
                  {currentNode.outcome === 'victory' ? (
                    <span className="text-emerald-400">{currentNode.title}</span>
                  ) : currentNode.outcome === 'defeat' ? (
                    <span className="text-rose-400">{currentNode.title}</span>
                  ) : (
                    <span className="text-amber-400">{currentNode.title}</span>
                  )}
                </h3>
              </div>

              <div className="bg-slate-950/80 border border-slate-800 rounded-2xl p-6 text-slate-200 text-sm sm:text-base leading-relaxed max-w-2xl mx-auto whitespace-pre-line">
                {currentNode.message}
              </div>

              {currentNode.rewardSummary && (
                <div className="p-3 bg-emerald-950/60 border border-emerald-500/50 rounded-xl text-emerald-300 font-bold text-xs max-w-lg mx-auto flex items-center justify-center gap-2">
                  <Sparkles className="w-4 h-4" />
                  <span>{currentNode.rewardSummary}</span>
                </div>
              )}

              <div className="flex items-center justify-center gap-4 pt-4">
                <button
                  onClick={handleRestart}
                  className="px-6 py-2.5 bg-slate-800 hover:bg-slate-700 text-slate-200 font-bold rounded-xl border border-slate-700 text-xs uppercase tracking-wider transition flex items-center gap-1.5"
                >
                  <RotateCcw className="w-3.5 h-3.5" />
                  Play Again
                </button>
                <button
                  onClick={onExit}
                  className="px-6 py-2.5 bg-gradient-to-r from-amber-600 to-rose-600 hover:from-amber-500 hover:to-rose-500 text-white font-extrabold rounded-xl shadow-lg shadow-amber-600/30 text-xs uppercase tracking-wider transition"
                >
                  Back to Campaigns
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
};
