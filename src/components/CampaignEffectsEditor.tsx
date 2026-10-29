import React from 'react';
import { ArrowDown, ArrowUp, Plus, Trash2 } from 'lucide-react';
import { CampaignActionDefinition, CampaignEffect, CampaignItemDefinition, CampaignNode, CampaignUnlockDefinition } from '../types/campaign';
import { CardDefinition } from '../types/card';
import { CampaignItemSelect } from './CampaignItemSelect';
import { CampaignNodePicker } from './CampaignNodePicker';

interface CampaignEffectsEditorProps {
  effects: CampaignEffect[];
  cards: CardDefinition[];
  items: CampaignItemDefinition[];
  unlocks?: CampaignUnlockDefinition[];
  actions?: CampaignActionDefinition[];
  nodes?: CampaignNode[];
  onChange: (effects: CampaignEffect[]) => void;
}

type EditableEffectType = 'give_object' | 'remove_object' | 'give_mana' | 'remove_mana' | 'set_mana' | 'set_starting_mana' | 'increase_starting_mana' | 'set_mana_to_starting_mana' | 'give_card' | 'remove_card' | 'campaignunlock' | 'add_campaign_action' | 'remove_campaign_action' | 'go_to_node';

const EFFECT_TYPES: { type: EditableEffectType; label: string }[] = [
  { type: 'give_object', label: 'Give object' },
  { type: 'remove_object', label: 'Remove object' },
  { type: 'give_mana', label: 'Give campaign mana' },
  { type: 'remove_mana', label: 'Remove campaign mana' },
  { type: 'set_mana', label: 'Set mana' },
  { type: 'set_starting_mana', label: 'Set starting mana' },
  { type: 'increase_starting_mana', label: 'Increase starting mana' },
  { type: 'set_mana_to_starting_mana', label: 'Set mana to starting mana' },
  { type: 'give_card', label: 'Give card' },
  { type: 'remove_card', label: 'Remove card' },
  { type: 'campaignunlock', label: 'Campaign unlock' },
  { type: 'add_campaign_action', label: 'Add campaign action' },
  { type: 'remove_campaign_action', label: 'Remove campaign action' },
  { type: 'go_to_node', label: 'Go to node' },
];

function getEditableType(effect: CampaignEffect): EditableEffectType {
  if (effect.type === 'set_minimum_mana') return 'set_mana';
  if (effect.type === 'give_item' || effect.type === 'give_resource') return 'give_object';
  if (effect.type === 'remove_item' || effect.type === 'remove_resource') return 'remove_object';
  return effect.type;
}

function getObjectName(effect: CampaignEffect): string {
  if ('object' in effect) return effect.object;
  if ('resource' in effect) return effect.resource;
  return '';
}

function createEffect(type: EditableEffectType, id: string): CampaignEffect {
  if (type === 'add_campaign_action' || type === 'remove_campaign_action') return { id, type, actionId: '' };
  if (type === 'go_to_node') return { id, type, nodeId: '' };
  if (type === 'campaignunlock') return { id, type, unlockIds: [] };
  if (type === 'set_mana_to_starting_mana') return { id, type };
  if (type === 'give_card' || type === 'remove_card') return { id, type, cardId: '' };
  if (type === 'set_mana' || type === 'set_starting_mana') return { id, type, mana: 1 };
  if (type === 'give_mana' || type === 'remove_mana' || type === 'increase_starting_mana') return { id, type, quantity: 1 };
  return { id, type, object: '', quantity: 1 };
}

export const CampaignEffectsEditor: React.FC<CampaignEffectsEditorProps> = ({ effects, cards, items, unlocks = [], actions = [], nodes = [], onChange }) => {
  const updateEffect = (updated: CampaignEffect) => onChange(effects.map((effect) => effect.id === updated.id ? updated : effect));
  const moveEffect = (index: number, offset: number) => {
    const target = index + offset;
    if (target < 0 || target >= effects.length) return;
    const next = [...effects];
    [next[index], next[target]] = [next[target], next[index]];
    onChange(next);
  };

  return (
    <div className="space-y-3">
      {effects.map((effect, index) => (
        <div key={effect.id} className="border-t border-slate-800 pt-3 space-y-2">
          <div className="flex flex-wrap items-center gap-2">
            <select
              aria-label={`Effect ${index + 1} type`}
              value={getEditableType(effect)}
              onChange={(event) => updateEffect(createEffect(event.target.value as EditableEffectType, effect.id))}
              className="flex-1 min-w-0 bg-slate-900 border border-slate-700 rounded-lg px-2 py-1.5 text-xs text-slate-200"
            >
              {EFFECT_TYPES.map((option) => <option key={option.type} value={option.type}>{option.label}</option>)}
            </select>
            <button type="button" title="Move effect up" aria-label={`Move effect ${index + 1} up`} disabled={index === 0} onClick={() => moveEffect(index, -1)} className="w-8 h-8 shrink-0 flex items-center justify-center rounded-lg border border-slate-700 text-slate-400 disabled:opacity-30"><ArrowUp className="w-4 h-4" /></button>
            <button type="button" title="Move effect down" aria-label={`Move effect ${index + 1} down`} disabled={index === effects.length - 1} onClick={() => moveEffect(index, 1)} className="w-8 h-8 shrink-0 flex items-center justify-center rounded-lg border border-slate-700 text-slate-400 disabled:opacity-30"><ArrowDown className="w-4 h-4" /></button>
            <button type="button" title="Remove effect" aria-label={`Remove effect ${index + 1}`} onClick={() => onChange(effects.filter((entry) => entry.id !== effect.id))} className="w-8 h-8 shrink-0 flex items-center justify-center rounded-lg border border-slate-700 text-rose-400"><Trash2 className="w-4 h-4" /></button>
          </div>
          {effect.type === 'go_to_node' ? (
            <label className="block text-xs text-slate-400">
              Destination
              <CampaignNodePicker nodes={nodes} value={effect.nodeId} emptyLabel="Select destination"
                onChange={(nodeId) => updateEffect({ ...effect, nodeId: nodeId || '' })} />
            </label>
          ) : effect.type === 'add_campaign_action' || effect.type === 'remove_campaign_action' ? (
            <label className="block text-xs text-slate-400">
              Campaign Action
              <select value={effect.actionId} onChange={(event) => updateEffect({ ...effect, actionId: event.target.value })}
                className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-900 px-2 py-1.5 text-xs text-slate-200">
                <option value="">Select action</option>
                {effect.actionId && !actions.some((action) => action.id === effect.actionId) && <option value={effect.actionId} disabled>{effect.actionId} (Unavailable)</option>}
                {actions.map((action) => <option key={action.id} value={action.id}>{action.name}</option>)}
              </select>
            </label>
          ) : effect.type === 'campaignunlock' ? (
            <div className="min-w-0 space-y-2">
              {(effect.unlockIds.length ? effect.unlockIds : ['']).map((unlockId, unlockIndex) => (
                <div key={unlockIndex} className="flex items-end gap-2">
                  <div className="min-w-0 flex-1">
                    <select value={unlockId} aria-label={`Effect ${index + 1} campaign unlock ${unlockIndex + 1}`}
                      onChange={(event) => updateEffect({ ...effect, unlockIds: [...effect.unlockIds.slice(0, unlockIndex), event.target.value, ...effect.unlockIds.slice(unlockIndex + 1)] })}
                      className="w-full min-w-0 rounded-lg border border-slate-700 bg-slate-900 px-2 py-1.5 text-xs text-slate-200">
                      <option value="">Select campaign unlock</option>
                      {unlockId && !unlocks.some((unlock) => unlock.id === unlockId) && <option value={unlockId} disabled>{unlockId} (Unavailable)</option>}
                      {unlocks.filter((unlock) => unlock.id === unlockId || !effect.unlockIds.includes(unlock.id)).map((unlock) => (
                        <option key={unlock.id} value={unlock.id}>{unlock.name}</option>
                      ))}
                    </select>
                  </div>
                  {(unlockId || effect.unlockIds.length > 1) && (
                    <button type="button" title="Remove campaign unlock" aria-label={`Remove campaign unlock ${unlockIndex + 1} from effect ${index + 1}`}
                      onClick={() => updateEffect({ ...effect, unlockIds: effect.unlockIds.filter((_, entryIndex) => entryIndex !== unlockIndex) })}
                      className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-slate-700 text-rose-400"><Trash2 className="h-4 w-4" /></button>
                  )}
                </div>
              ))}
              {!!effect.unlockIds.length && effect.unlockIds.every((id) => id.trim()) && unlocks.some((unlock) => !effect.unlockIds.includes(unlock.id)) && (
                <button type="button" onClick={() => updateEffect({ ...effect, unlockIds: [...effect.unlockIds, ''] })}
                  className="flex items-center gap-1.5 rounded-lg border border-slate-700 px-2 py-1.5 text-xs text-amber-200"><Plus className="h-3.5 w-3.5" /> Add Unlock</button>
              )}
              {!unlocks.length && <p className="text-xs text-slate-500">No campaign unlocks defined.</p>}
            </div>
          ) : effect.type === 'set_mana_to_starting_mana' ? null : 'cardId' in effect ? (
            <label className="block text-xs text-slate-400">
              Card
              <select
                value={effect.cardId}
                onChange={(event) => updateEffect({ ...effect, cardId: event.target.value })}
                className="mt-1 w-full bg-slate-900 border border-slate-700 rounded-lg px-2 py-1.5 text-xs text-slate-200"
              >
                <option value="">Select card</option>
                {effect.cardId && !cards.some((card) => card.id === effect.cardId) && <option value={effect.cardId}>{effect.cardId} (Unavailable)</option>}
                {cards.map((card) => <option key={card.id} value={card.id}>{card.name} ({card.splinter} {card.cardType})</option>)}
              </select>
            </label>
          ) : 'mana' in effect ? (
            <label className="block max-w-40 text-xs text-slate-400">
              {effect.type === 'set_starting_mana' ? 'Starting mana' : 'Campaign mana'}
              {effect.type === 'set_mana' && (
                <select aria-label="Mana source" value={effect.useStartingMana ? 'starting' : 'fixed'}
                  onChange={(event) => updateEffect({ ...effect, useStartingMana: event.target.value === 'starting' })}
                  className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-900 px-2 py-1.5 text-xs text-slate-200">
                  <option value="fixed">Fixed amount</option>
                  <option value="starting">Starting mana</option>
                </select>
              )}
              {!(effect.type === 'set_mana' && effect.useStartingMana) && (
              <input
                type="number"
                min="0"
                step="1"
                value={effect.mana}
                onChange={(event) => updateEffect({ ...effect, mana: Math.max(0, parseInt(event.target.value, 10) || 0) })}
                className="mt-1 w-full bg-slate-900 border border-slate-700 rounded-lg px-2 py-1.5 text-xs text-slate-200"
              />
              )}
            </label>
          ) : 'minimumMana' in effect ? (
            <label className="block max-w-40 text-xs text-slate-400">
              Campaign mana
              <input
                type="number"
                min="0"
                step="1"
                value={effect.minimumMana}
                onChange={(event) => updateEffect({ id: effect.id, type: 'set_mana', mana: Math.max(0, parseInt(event.target.value, 10) || 0) })}
                className="mt-1 w-full bg-slate-900 border border-slate-700 rounded-lg px-2 py-1.5 text-xs text-slate-200"
              />
            </label>
          ) : effect.type === 'give_mana' || effect.type === 'remove_mana' || effect.type === 'increase_starting_mana' ? (
            <label className="block max-w-40 text-xs text-slate-400">
              {effect.type === 'increase_starting_mana' ? 'Starting mana increase' : 'Mana'}
              <input
                type="number"
                min="1"
                step="1"
                value={effect.quantity}
                onChange={(event) => updateEffect({ ...effect, quantity: Math.max(1, parseInt(event.target.value, 10) || 1) })}
                className="mt-1 w-full bg-slate-900 border border-slate-700 rounded-lg px-2 py-1.5 text-xs text-slate-200"
              />
            </label>
          ) : 'object' in effect || 'resource' in effect ? (
            <div className="grid grid-cols-1 sm:grid-cols-[1fr_6rem] gap-2">
              <label className="block text-xs text-slate-400">
                Object
                <CampaignItemSelect
                  items={items}
                  value={getObjectName(effect)}
                  onChange={(object) => updateEffect({ id: effect.id, type: getEditableType(effect) === 'remove_object' ? 'remove_object' : 'give_object', object, quantity: effect.quantity })}
                  className="mt-1 w-full bg-slate-900 border border-slate-700 rounded-lg px-2 py-1.5 text-xs text-slate-200"
                />
              </label>
              <label className="block text-xs text-slate-400">
                Quantity
                <input
                  type="number"
                  min="1"
                  step="1"
                  value={effect.quantity}
                  onChange={(event) => updateEffect({ ...effect, quantity: Math.max(1, parseInt(event.target.value, 10) || 1) })}
                  className="mt-1 w-full bg-slate-900 border border-slate-700 rounded-lg px-2 py-1.5 text-xs text-slate-200"
                />
              </label>
            </div>
          ) : null}
        </div>
      ))}
      {!effects.length && <p className="text-xs text-slate-500">No effects.</p>}
      <button type="button" onClick={() => onChange([...effects, createEffect('give_object', `effect_${Date.now()}_${effects.length}`)])} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-700 bg-slate-900 text-xs text-amber-300">
        <Plus className="w-4 h-4" /> Add Effect
      </button>
    </div>
  );
};