import { useState } from 'react';
import { Check, Plus, Trash2, X } from 'lucide-react';
import { CampaignActionDefinition, CampaignEffect, CampaignItemDefinition, CampaignNode, CampaignPrecondition, CampaignUnlockDefinition } from '../types/campaign';
import { CardDefinition } from '../types/card';
import { CampaignEffectsEditor } from './CampaignEffectsEditor';
import { CampaignPreconditionsEditor } from './CampaignPreconditionsEditor';

interface CampaignActionsModalProps {
  actions: CampaignActionDefinition[];
  nodes: CampaignNode[];
  cards: CardDefinition[];
  items: CampaignItemDefinition[];
  unlocks: CampaignUnlockDefinition[];
  autosaveStatus: 'saving' | 'saved' | 'error';
  onSave: (action: CampaignActionDefinition) => void;
  onClose: () => void;
}

export function CampaignActionsModal({ actions, nodes, cards, items, unlocks, autosaveStatus, onSave, onClose }: CampaignActionsModalProps) {
  const [selectedId, setSelectedId] = useState<string | null>(actions[0]?.id || null);
  const selected = actions.find((action) => action.id === selectedId);
  const [draft, setDraft] = useState(() => ({
    name: selected?.name || '',
    description: selected?.description || '',
    unlockPreconditions: selected?.unlockPreconditions || [],
    preconditions: selected?.preconditions || [],
    effects: selected?.effects || [],
  }));
  const [error, setError] = useState('');

  const selectAction = (action?: CampaignActionDefinition) => {
    setSelectedId(action?.id || null);
    setDraft({ name: action?.name || '', description: action?.description || '', unlockPreconditions: action?.unlockPreconditions || [], preconditions: action?.preconditions || [], effects: action?.effects || [] });
    setError('');
  };

  const updateDraft = (changes: Partial<typeof draft>) => {
    const next = { ...draft, ...changes };
    setDraft(next);
    const name = next.name.trim();
    if (!name) { setError('Action name is required.'); return; }
    if (actions.some((action) => action.id !== selectedId && action.name.trim().toLowerCase() === name.toLowerCase())) {
      setError('An action with this name already exists.');
      return;
    }
    const action: CampaignActionDefinition = {
      id: selectedId || `campaign_action_${crypto.randomUUID()}`,
      name,
      description: next.description.trim() || undefined,
      unlockPreconditions: next.unlockPreconditions,
      preconditions: next.preconditions,
      effects: next.effects,
    };
    onSave(action);
    setSelectedId(action.id);
    setError('');
  };

  const addAction = () => {
    const baseName = `New Action ${actions.length + 1}`;
    const name = actions.some((action) => action.name.toLowerCase() === baseName.toLowerCase()) ? `New Action ${Date.now()}` : baseName;
    const action: CampaignActionDefinition = {
      id: `campaign_action_${crypto.randomUUID()}`,
      name,
      unlockPreconditions: [],
      preconditions: [],
      effects: [],
    };
    onSave(action);
    selectAction(action);
  };

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/85 p-4" onKeyDown={(event) => {
      if (event.key === 'Escape') { event.stopPropagation(); onClose(); }
      if (event.key === 'Tab') {
        const controls = event.currentTarget.querySelectorAll<HTMLElement>('button:not(:disabled), input, textarea, select');
        const first = controls[0];
        const last = controls[controls.length - 1];
        if (event.shiftKey && event.target === first) { event.preventDefault(); last?.focus(); }
        else if (!event.shiftKey && event.target === last) { event.preventDefault(); first?.focus(); }
      }
    }}>
      <section role="dialog" aria-modal="true" aria-labelledby="campaign-actions-title" className="flex max-h-[90dvh] w-full max-w-4xl flex-col rounded-lg border border-slate-700 bg-slate-900 p-4 text-slate-100">
        <header className="mb-4 flex items-center justify-between gap-3">
          <div>
            <h3 id="campaign-actions-title" className="text-sm font-bold text-amber-300">Campaign Actions ({actions.length})</h3>
            <p className="text-xs text-slate-500">Unlock preconditions control visibility; use preconditions control when an action can be used.</p>
          </div>
          <button type="button" autoFocus title="Close campaign actions" aria-label="Close campaign actions" onClick={onClose}
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-slate-400 hover:bg-slate-800"><X className="h-4 w-4" /></button>
        </header>
        <div className="grid min-h-0 gap-4 overflow-y-auto sm:grid-cols-[minmax(0,1fr)_minmax(0,2fr)]">
          <aside className="min-w-0 space-y-2">
            <button type="button" onClick={addAction} className="flex items-center gap-2 rounded-lg border border-slate-700 px-3 py-2 text-xs text-amber-200"><Plus className="h-4 w-4" /> Add Action</button>
            <div className="max-h-48 overflow-y-auto sm:max-h-[60dvh]">
              {!actions.length && <p className="py-3 text-xs text-slate-500">No campaign actions.</p>}
              {actions.map((action) => (
                <button key={action.id} type="button" aria-pressed={selectedId === action.id} onClick={() => selectAction(action)}
                  className={`block w-full break-words border-b border-slate-800 px-2 py-3 text-left text-sm ${selectedId === action.id ? 'bg-slate-800 text-amber-200' : 'text-slate-300'}`}>
                  {action.name}
                </button>
              ))}
            </div>
          </aside>
          {selectedId && (
            <div className="min-w-0 space-y-4">
              <h4 className="text-sm font-semibold text-slate-200">Action Details</h4>
              <label className="block text-xs text-slate-400">Name
                <input value={draft.name} onChange={(event) => updateDraft({ name: event.target.value })}
                  className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100" />
              </label>
              <label className="block text-xs text-slate-400">Description
                <textarea rows={2} value={draft.description} onChange={(event) => updateDraft({ description: event.target.value })}
                  className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100" />
              </label>
              <CampaignPreconditionsEditor title="Unlock Preconditions" preconditions={draft.unlockPreconditions} unlocks={unlocks} cards={cards} items={items}
                onChange={(unlockPreconditions: CampaignPrecondition[]) => updateDraft({ unlockPreconditions })} />
              <CampaignPreconditionsEditor title="Use Preconditions" preconditions={draft.preconditions} unlocks={unlocks} cards={cards} items={items}
                onChange={(preconditions: CampaignPrecondition[]) => updateDraft({ preconditions })} />
              <section className="space-y-2 border-t border-slate-800 pt-3">
                <h5 className="text-xs font-bold text-amber-300">Action Effects</h5>
                <CampaignEffectsEditor effects={draft.effects} cards={cards} items={items} unlocks={unlocks} actions={actions} nodes={nodes}
                  onChange={(effects: CampaignEffect[]) => updateDraft({ effects })} />
              </section>
              {error && <p role="alert" className="text-xs text-rose-400">{error}</p>}
              <div role="status" aria-live="polite" className={`flex items-center gap-2 text-xs ${error || autosaveStatus === 'error' ? 'text-rose-400' : 'text-slate-400'}`}>
                {!error && autosaveStatus === 'saved' && <Check className="h-4 w-4" />}
                {error ? 'Changes not saved' : autosaveStatus === 'saving' ? 'Saving...' : autosaveStatus === 'error' ? 'Autosave failed. Your changes are still open.' : 'All changes saved'}
              </div>
            </div>
          )}
        </div>
      </section>
    </div>
  );
}