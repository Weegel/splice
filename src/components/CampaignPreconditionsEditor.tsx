import { Plus, Trash2 } from 'lucide-react';
import { CampaignItemDefinition, CampaignPrecondition, CampaignUnlockDefinition } from '../types/campaign';
import { CardDefinition } from '../types/card';
import { CampaignItemSelect } from './CampaignItemSelect';

interface CampaignPreconditionsEditorProps {
  preconditions: CampaignPrecondition[];
  unlocks: CampaignUnlockDefinition[];
  cards: CardDefinition[];
  items: CampaignItemDefinition[];
  onChange: (preconditions: CampaignPrecondition[]) => void;
}

export function CampaignPreconditionsEditor({ preconditions, unlocks, cards, items, onChange }: CampaignPreconditionsEditorProps) {
  const updatePrecondition = (updated: CampaignPrecondition) => onChange(preconditions.map((entry) => entry.id === updated.id ? updated : entry));
  return (
    <fieldset className="min-w-0 space-y-2 border-t border-slate-800 pt-3">
      <legend className="text-xs font-semibold text-slate-400">Preconditions</legend>
      {preconditions.map((precondition, index) => (
        <div key={precondition.id} className="flex items-end gap-2">
          <div className="grid min-w-0 flex-1 grid-cols-1 gap-2 sm:grid-cols-2">
            <label className="min-w-0 text-xs text-slate-400">
              Type
              <select value={precondition.type} aria-label={`Precondition ${index + 1} type`}
                onChange={(event) => {
                  const type = event.target.value as CampaignPrecondition['type'];
                  if (type === 'has_unlock' || type === 'has_not_unlock') {
                    updatePrecondition({ id: precondition.id, type, unlockId: 'unlockId' in precondition ? precondition.unlockId : '' });
                  } else if (type === 'has_item') {
                    updatePrecondition({ id: precondition.id, type, item: 'item' in precondition ? precondition.item : '', quantity: 'quantity' in precondition ? precondition.quantity : 0 });
                  } else {
                    updatePrecondition({ id: precondition.id, type, cardId: 'cardId' in precondition ? precondition.cardId : '' });
                  }
                }}
                className="mt-1 w-full min-w-0 rounded-lg border border-slate-700 bg-slate-950 px-2 py-1.5 text-xs text-slate-200">
                <option value="has_unlock">Has unlock</option>
                <option value="has_not_unlock">Has not unlocked</option>
                <option value="card_unlocked">Card unlocked</option>
                <option value="card_not_unlocked">Card not unlocked</option>
                <option value="has_item">Has Item</option>
              </select>
            </label>
            {precondition.type === 'has_unlock' || precondition.type === 'has_not_unlock' ? (
              <label className="min-w-0 text-xs text-slate-400">
                Campaign unlock
                <select value={precondition.unlockId} aria-label={`Precondition ${index + 1} unlock`}
                  onChange={(event) => updatePrecondition({ ...precondition, unlockId: event.target.value })}
                  className="mt-1 w-full min-w-0 rounded-lg border border-slate-700 bg-slate-950 px-2 py-1.5 text-xs text-slate-200">
                  <option value="">Select unlock</option>
                  {precondition.unlockId && !unlocks.some((unlock) => unlock.id === precondition.unlockId) && <option value={precondition.unlockId} disabled>{precondition.unlockId} (Unavailable)</option>}
                  {unlocks.map((unlock) => <option key={unlock.id} value={unlock.id}>{unlock.name}</option>)}
                </select>
              </label>
            ) : precondition.type === 'has_item' ? (
              <div className="grid min-w-0 grid-cols-[minmax(0,1fr)_5rem] gap-2">
                <label className="min-w-0 text-xs text-slate-400">Item
                  <CampaignItemSelect items={items} value={precondition.item} ariaLabel={`Precondition ${index + 1} item`} onChange={(item) => updatePrecondition({ ...precondition, item })}
                    className="mt-1 w-full min-w-0 rounded-lg border border-slate-700 bg-slate-950 px-2 py-1.5 text-xs text-slate-200" />
                </label>
                <label className="text-xs text-slate-400">Quantity
                  <input type="number" min="0" step="1" value={precondition.quantity} aria-label={`Precondition ${index + 1} quantity`}
                    onChange={(event) => updatePrecondition({ ...precondition, quantity: Math.max(0, Math.floor(Number(event.target.value) || 0)) })}
                    className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-950 px-2 py-1.5 text-xs text-slate-200" />
                </label>
              </div>
            ) : (
              <label className="min-w-0 text-xs text-slate-400">
                Card
                <select value={precondition.cardId} aria-label={`Precondition ${index + 1} card`}
                  onChange={(event) => updatePrecondition({ ...precondition, cardId: event.target.value })}
                  className="mt-1 w-full min-w-0 rounded-lg border border-slate-700 bg-slate-950 px-2 py-1.5 text-xs text-slate-200">
                  <option value="">Select card</option>
                  {precondition.cardId && !cards.some((card) => card.id === precondition.cardId) && <option value={precondition.cardId} disabled>{precondition.cardId} (Unavailable)</option>}
                  {cards.map((card) => <option key={card.id} value={card.id}>{card.name} ({card.splinter} {card.cardType})</option>)}
                </select>
              </label>
            )}
          </div>
          <button type="button" title="Remove precondition" aria-label={`Remove precondition ${index + 1}`}
            onClick={() => onChange(preconditions.filter((entry) => entry.id !== precondition.id))}
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-slate-700 text-rose-400"><Trash2 className="h-4 w-4" /></button>
        </div>
      ))}
      <button type="button" onClick={() => onChange([...preconditions, { id: `precondition_${crypto.randomUUID()}`, type: 'has_unlock', unlockId: '' }])}
        className="flex items-center gap-1.5 rounded-lg border border-slate-700 px-2 py-1.5 text-xs text-amber-200"><Plus className="h-3.5 w-3.5" /> Add Precondition</button>
    </fieldset>
  );
}