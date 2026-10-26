import { useState } from 'react';
import { Check, Plus, X } from 'lucide-react';
import { CampaignUnlockDefinition } from '../types/campaign';

interface CampaignUnlocksModalProps {
  unlocks: CampaignUnlockDefinition[];
  autosaveStatus: 'saving' | 'saved' | 'error';
  onSave: (unlock: CampaignUnlockDefinition) => void;
  onClose: () => void;
}

export function CampaignUnlocksModal({ unlocks, autosaveStatus, onSave, onClose }: CampaignUnlocksModalProps) {
  const [selectedId, setSelectedId] = useState<string | null>(unlocks[0]?.id || null);
  const [draft, setDraft] = useState(() => ({ name: unlocks[0]?.name || '', description: unlocks[0]?.description || '' }));
  const [error, setError] = useState('');
  const selectUnlock = (unlock?: CampaignUnlockDefinition) => {
    setSelectedId(unlock?.id || null);
    setDraft({ name: unlock?.name || '', description: unlock?.description || '' });
    setError('');
  };
  const updateDraft = (changes: Partial<typeof draft>) => {
    const next = { ...draft, ...changes };
    setDraft(next);
    const name = next.name.trim();
    if (!name) { setError('Unlock name is required.'); return; }
    if (unlocks.some((unlock) => unlock.id !== selectedId && unlock.name.trim().toLowerCase() === name.toLowerCase())) {
      setError('An unlock with this name already exists.');
      return;
    }
    const unlock = { id: selectedId || `campaign_unlock_${crypto.randomUUID()}`, name, description: next.description.trim() };
    onSave(unlock);
    setSelectedId(unlock.id);
    setError('');
  };

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/85 p-4" onKeyDown={(event) => {
      if (event.key === 'Escape') { event.stopPropagation(); onClose(); }
      if (event.key === 'Tab') {
        const controls = event.currentTarget.querySelectorAll<HTMLElement>('button:not(:disabled), input, textarea');
        const first = controls[0];
        const last = controls[controls.length - 1];
        if (event.shiftKey && event.target === first) { event.preventDefault(); last?.focus(); }
        if (!event.shiftKey && event.target === last) { event.preventDefault(); first?.focus(); }
      }
    }}>
      <div role="dialog" aria-modal="true" aria-labelledby="campaign-unlocks-title" className="flex max-h-[90dvh] w-full max-w-3xl flex-col rounded-lg border border-slate-700 bg-slate-900 p-4 text-slate-100">
        <div className="mb-4 flex items-center justify-between gap-3">
          <h4 id="campaign-unlocks-title" className="text-sm font-bold text-amber-300">Campaign Unlocks ({unlocks.length})</h4>
          <button type="button" autoFocus title="Close campaign unlocks" aria-label="Close campaign unlocks" onClick={onClose} className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-slate-400 hover:bg-slate-800"><X className="h-4 w-4" /></button>
        </div>
        <div className="grid min-h-0 gap-4 overflow-y-auto sm:grid-cols-[minmax(0,1fr)_minmax(0,2fr)]">
          <div className="min-w-0 space-y-2">
            <button type="button" onClick={() => selectUnlock()} className="flex items-center gap-2 rounded-lg border border-slate-700 px-3 py-2 text-xs text-amber-200"><Plus className="h-4 w-4" /> New Unlock</button>
            <div className="max-h-48 overflow-y-auto sm:max-h-80">
              {!unlocks.length && <p className="py-3 text-xs text-slate-500">No campaign unlocks.</p>}
              {unlocks.map((unlock) => (
                <button key={unlock.id} type="button" aria-pressed={selectedId === unlock.id} onClick={() => selectUnlock(unlock)} className={`block w-full break-words border-b border-slate-800 px-2 py-3 text-left text-sm ${selectedId === unlock.id ? 'bg-slate-800 text-amber-200' : 'text-slate-300'}`}>{unlock.name}</button>
              ))}
            </div>
          </div>
          <div className="min-w-0 space-y-3">
            <h5 className="text-sm font-semibold text-slate-200">{selectedId ? 'Unlock Details' : 'New Unlock'}</h5>
            <label className="block text-xs text-slate-400">Name
              <input required value={draft.name} onChange={(event) => updateDraft({ name: event.target.value })} className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100" />
            </label>
            <label className="block text-xs text-slate-400">Description
              <textarea rows={4} value={draft.description} onChange={(event) => updateDraft({ description: event.target.value })} className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100" />
            </label>
            {error && <p role="alert" className="text-xs text-rose-400">{error}</p>}
            <div role="status" aria-live="polite" className={`flex items-center gap-2 text-xs ${error || autosaveStatus === 'error' ? 'text-rose-400' : 'text-slate-400'}`}>
              {!error && autosaveStatus === 'saved' && <Check className="h-4 w-4" />}
              {error ? 'Changes not saved' : autosaveStatus === 'saving' ? 'Saving...' : autosaveStatus === 'error' ? 'Autosave failed. Your changes are still open.' : 'All changes saved'}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}