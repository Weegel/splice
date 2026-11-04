import { useState } from 'react';
import { Check, Plus, Trash2, X } from 'lucide-react';
import { CampaignItemDefinition, CampaignItemParameter } from '../types/campaign';
import { parseCampaignItemParameters } from '../data/campaignItems';

const PARAMETER_LABELS: Record<CampaignItemParameter, string> = {
  [CampaignItemParameter.SellValue]: 'Sell value',
  [CampaignItemParameter.MaxCapacity]: 'Max capacity',
};

const parameterRows = (parameters: CampaignItemDefinition['parameters'] = {}) =>
  Object.entries(parameters).map(([key, value]) => ({ key: key as CampaignItemParameter, value: String(value) }));

interface CampaignItemsModalProps {
  items: CampaignItemDefinition[];
  autosaveStatus: 'saving' | 'saved' | 'error';
  onSave: (item: CampaignItemDefinition) => void;
  onDelete: (itemId: string) => void;
  onClose: () => void;
}

export function CampaignItemsModal({ items, autosaveStatus, onSave, onDelete, onClose }: CampaignItemsModalProps) {
  const [selectedId, setSelectedId] = useState<string | null>(items[0]?.id || null);
  const selected = items.find((item) => item.id === selectedId);
  const [draft, setDraft] = useState(() => ({
    name: selected?.name || '',
    description: selected?.description || '',
    parameters: parameterRows(selected?.parameters),
  }));
  const { name, description, parameters } = draft;
  const availableParameters = Object.values(CampaignItemParameter).filter((key) => !parameters.some((parameter) => parameter.key === key));
  const [error, setError] = useState('');
  const selectItem = (item?: CampaignItemDefinition) => {
    setSelectedId(item?.id || null);
    setDraft({ name: item?.name || '', description: item?.description || '', parameters: parameterRows(item?.parameters) });
    setError('');
  };
  const deleteItem = (item: CampaignItemDefinition) => {
    if (!confirm(`Delete "${item.name}"? Existing references will remain and need to be updated.`)) return;
    onDelete(item.id);
    if (selectedId === item.id) selectItem(items.find((entry) => entry.id !== item.id));
  };
  const updateDraft = (changes: Partial<typeof draft>) => {
    const next = { ...draft, ...changes };
    setDraft(next);
    try {
      const trimmedName = next.name.trim();
      if (!trimmedName) throw new Error('Item name is required.');
      if (items.some((item) => item.id !== selectedId && item.name.trim().toLowerCase() === trimmedName.toLowerCase())) {
        throw new Error('An item with this name already exists.');
      }
      if (next.parameters.some((parameter) => !parameter.value.trim())) throw new Error('Parameter values are required.');
      const parameterValues = Object.fromEntries(next.parameters.map((parameter) => [parameter.key, Number(parameter.value)]));
      const item = { id: selectedId || `campaign_item_${crypto.randomUUID()}`, name: trimmedName, description: next.description.trim(), parameters: parseCampaignItemParameters(JSON.stringify(parameterValues)) };
      onSave(item);
      setSelectedId(item.id);
      setError('');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Invalid item parameters.');
    }
  };

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/85 p-4" onKeyDown={(event) => {
      if (event.key === 'Escape') { event.stopPropagation(); onClose(); }
      if (event.key === 'Tab') {
        const controls = event.currentTarget.querySelectorAll<HTMLElement>('button:not(:disabled), input, textarea, select');
        const first = controls[0];
        const last = controls[controls.length - 1];
        if (event.shiftKey && event.target === first) { event.preventDefault(); last?.focus(); }
        if (!event.shiftKey && event.target === last) { event.preventDefault(); first?.focus(); }
      }
    }}>
      <div role="dialog" aria-modal="true" aria-labelledby="campaign-items-title" className="flex max-h-[90dvh] w-full max-w-3xl flex-col rounded-lg border border-slate-700 bg-slate-900 p-4 text-slate-100">
        <div className="mb-4 flex items-center justify-between gap-3">
          <h4 id="campaign-items-title" className="text-sm font-bold text-amber-300">Campaign Specific Items ({items.length})</h4>
          <button type="button" autoFocus title="Close campaign items" aria-label="Close campaign items" onClick={onClose} className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-slate-400 hover:bg-slate-800"><X className="h-4 w-4" /></button>
        </div>
        <div className="grid min-h-0 gap-4 overflow-y-auto sm:grid-cols-[minmax(0,1fr)_minmax(0,2fr)]">
          <div className="min-w-0 space-y-2">
            <button type="button" onClick={() => selectItem()} className="flex items-center gap-2 rounded-lg border border-slate-700 px-3 py-2 text-xs text-amber-200"><Plus className="h-4 w-4" /> New Item</button>
            <div className="max-h-48 overflow-y-auto sm:max-h-80">
              {!items.length && <p className="py-3 text-xs text-slate-500">No campaign items.</p>}
              {items.map((item) => (
                <div key={item.id} className={`flex items-center gap-1 border-b border-slate-800 ${selectedId === item.id ? 'bg-slate-800' : ''}`}>
                  <button type="button" aria-pressed={selectedId === item.id} onClick={() => selectItem(item)} className={`min-w-0 flex-1 break-words px-2 py-3 text-left text-sm ${selectedId === item.id ? 'text-amber-200' : 'text-slate-300'}`}>
                    {item.name}
                  </button>
                  <button type="button" title={`Delete ${item.name}`} aria-label={`Delete ${item.name}`} onClick={() => deleteItem(item)}
                    className="flex h-8 w-8 shrink-0 items-center justify-center rounded text-rose-400 hover:bg-rose-950"><Trash2 className="h-4 w-4" /></button>
                </div>
              ))}
            </div>
          </div>
          <div className="min-w-0 space-y-3">
            <h5 className="text-sm font-semibold text-slate-200">{selectedId ? 'Item Details' : 'New Item'}</h5>
            <label className="block text-xs text-slate-400">Name
              <input required value={name} onChange={(event) => updateDraft({ name: event.target.value })} className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100" />
            </label>
            <label className="block text-xs text-slate-400">Description
              <textarea rows={3} value={description} onChange={(event) => updateDraft({ description: event.target.value })} className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100" />
            </label>
            <fieldset className="min-w-0 space-y-2">
              <legend className="mb-2 text-xs text-slate-400">Object Parameters</legend>
              {parameters.map((parameter, index) => (
                <div key={index} className="flex items-end gap-2">
                  <label className="min-w-0 flex-1 text-xs text-slate-400">Parameter
                    <select value={parameter.key} onChange={(event) => updateDraft({ parameters: parameters.map((entry, entryIndex) => entryIndex === index ? { ...entry, key: event.target.value as CampaignItemParameter } : entry) })}
                      className="mt-1 w-full min-w-0 rounded-lg border border-slate-700 bg-slate-950 px-2 py-2 text-xs text-slate-100">
                      {!Object.values(CampaignItemParameter).includes(parameter.key) && <option value={parameter.key} disabled>{parameter.key} (Unknown)</option>}
                      {Object.values(CampaignItemParameter).filter((key) => key === parameter.key || availableParameters.includes(key)).map((key) => (
                        <option key={key} value={key}>{PARAMETER_LABELS[key]}</option>
                      ))}
                    </select>
                  </label>
                  <label className="w-24 shrink-0 text-xs text-slate-400">Value
                    <input type="number" required min="0" step={parameter.key === CampaignItemParameter.MaxCapacity ? '1' : 'any'} value={parameter.value} aria-label={`${PARAMETER_LABELS[parameter.key] || parameter.key} value`}
                      onChange={(event) => updateDraft({ parameters: parameters.map((entry, entryIndex) => entryIndex === index ? { ...entry, value: event.target.value } : entry) })}
                      className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-950 px-2 py-2 text-xs text-slate-100" />
                  </label>
                  <button type="button" title="Remove parameter" aria-label={`Remove ${PARAMETER_LABELS[parameter.key] || parameter.key}`} onClick={() => updateDraft({ parameters: parameters.filter((_, entryIndex) => entryIndex !== index) })}
                    className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-rose-400 hover:bg-slate-800"><Trash2 className="h-4 w-4" /></button>
                </div>
              ))}
              <button type="button" disabled={!availableParameters.length} onClick={() => {
                const key = availableParameters[0];
                if (key) updateDraft({ parameters: [...parameters, { key, value: '0' }] });
              }} className="flex items-center gap-2 rounded-lg border border-slate-700 px-3 py-2 text-xs text-amber-200 disabled:opacity-40"><Plus className="h-4 w-4" /> Add Parameter</button>
            </fieldset>
            {error && <p id="campaign-item-error" role="alert" className="text-xs text-rose-400">{error}</p>}
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