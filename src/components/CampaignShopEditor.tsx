import { Plus, Trash2 } from 'lucide-react';
import { CampaignItemDefinition, CampaignNode, CampaignShopItem, CampaignShopOffer, CampaignUnlockDefinition, ShopCampaignNode } from '../types/campaign';
import { CardDefinition } from '../types/card';
import { CampaignEffectsEditor } from './CampaignEffectsEditor';
import { CampaignItemSelect } from './CampaignItemSelect';
import { CampaignPreconditionsEditor } from './CampaignPreconditionsEditor';

interface CampaignShopEditorProps {
  node: ShopCampaignNode;
  nodes: CampaignNode[];
  cards: CardDefinition[];
  items: CampaignItemDefinition[];
  unlocks?: CampaignUnlockDefinition[];
  onChange: (node: ShopCampaignNode) => void;
}

function ShopItemFields({ item, items, label, onChange }: { item: CampaignShopItem; items: CampaignItemDefinition[]; label: string; onChange: (item: CampaignShopItem) => void }) {
  return (
    <div className="grid min-w-0 grid-cols-[minmax(0,1fr)_5rem] gap-2">
      <label className="min-w-0 text-xs text-slate-400">
        {label}
        <CampaignItemSelect items={items} value={item.object} onChange={(object) => onChange({ ...item, object })}
          className="mt-1 w-full min-w-0 rounded-lg border border-slate-700 bg-slate-900 px-2 py-1.5 text-xs text-slate-100" />
      </label>
      <label className="text-xs text-slate-400">
        Quantity
        <input type="number" min="1" step="1" aria-label={`${label} quantity`} value={item.quantity}
          onChange={(event) => onChange({ ...item, quantity: Math.max(0, Math.floor(Number(event.target.value) || 0)) })}
          className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-900 px-2 py-1.5 text-xs text-slate-100" />
      </label>
    </div>
  );
}

export function CampaignShopEditor({ node, nodes, cards, items, unlocks = [], onChange }: CampaignShopEditorProps) {
  const updateOffer = (id: string, update: Partial<CampaignShopOffer>) => onChange({
    ...node, offers: node.offers.map((offer) => offer.id === id ? { ...offer, ...update } : offer),
  });
  return (
    <div className="space-y-4">
      <label className="block text-xs text-slate-400">
        Shop Description
        <textarea rows={2} value={node.description || ''} onChange={(event) => onChange({ ...node, description: event.target.value })}
          className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-900 p-2 text-xs text-slate-100" />
      </label>
      <label className="block text-xs text-slate-400">
        Leave Destination
        <select value={node.nextNodeId || ''} onChange={(event) => onChange({ ...node, nextNodeId: event.target.value || undefined })}
          className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-900 px-2 py-1.5 text-xs text-lime-200">
          <option value="">Select node</option>
          {node.nextNodeId && !nodes.some((entry) => entry.id === node.nextNodeId) && <option value={node.nextNodeId}>Missing node: {node.nextNodeId}</option>}
          {nodes.filter((entry) => entry.id !== node.id).map((entry) => <option key={entry.id} value={entry.id}>[{entry.type.toUpperCase()}] {entry.title}</option>)}
        </select>
      </label>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h4 className="text-xs font-bold text-lime-300">Barter Offers ({node.offers.length})</h4>
        <button type="button" onClick={() => onChange({ ...node, offers: [...node.offers, {
          id: `offer_${Date.now()}_${node.offers.length}`, costs: [{ object: '', quantity: 1 }], effects: [],
        }] })} className="flex items-center gap-1 rounded-lg border border-lime-700 bg-lime-950 px-2 py-1.5 text-xs text-lime-200">
          <Plus className="h-3.5 w-3.5" /> Add Offer
        </button>
      </div>
      <div className="max-h-[min(50dvh,30rem)] space-y-4 overflow-y-auto overscroll-contain pr-2 [scrollbar-gutter:stable]">
        {!node.offers.length && <p className="text-xs text-slate-500">No offers</p>}
        {node.offers.map((offer, offerIndex) => (
          <section key={offer.id} className="space-y-3 border-t border-slate-800 pt-3">
            <div className="flex items-center justify-between">
              <h5 className="text-xs font-bold text-lime-300">Offer {offerIndex + 1}</h5>
              <button type="button" title="Remove offer" aria-label={`Remove offer ${offerIndex + 1}`}
                onClick={() => onChange({ ...node, offers: node.offers.filter((entry) => entry.id !== offer.id) })}
                className="rounded p-1.5 text-rose-400 hover:bg-slate-800"><Trash2 className="h-4 w-4" /></button>
            </div>
            <label className="block text-xs text-slate-400">
              Offer Name
              <input type="text" value={offer.title || ''} onChange={(event) => updateOffer(offer.id, { title: event.target.value })}
                className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-900 px-2 py-1.5 text-xs text-slate-100" />
            </label>
            <CampaignPreconditionsEditor preconditions={offer.preconditions || []} unlocks={unlocks} cards={cards} items={items}
              onChange={(preconditions) => updateOffer(offer.id, { preconditions: preconditions.length ? preconditions : undefined })} />
            <div className="space-y-2">
              {offer.costs.map((cost, costIndex) => (
                <div key={costIndex} className="flex items-end gap-2">
                  <div className="min-w-0 flex-1">
                    <ShopItemFields item={cost} items={items} label={`Required item ${costIndex + 1}`} onChange={(item) => updateOffer(offer.id, { costs: offer.costs.map((entry, index) => index === costIndex ? item : entry) })} />
                  </div>
                  <button type="button" title="Remove required item" aria-label={`Remove required item ${costIndex + 1} from offer ${offerIndex + 1}`}
                    onClick={() => updateOffer(offer.id, { costs: offer.costs.filter((_, index) => index !== costIndex) })}
                    className="mb-0.5 shrink-0 rounded p-1.5 text-rose-400 hover:bg-slate-800"><Trash2 className="h-4 w-4" /></button>
                </div>
              ))}
              <button type="button" onClick={() => updateOffer(offer.id, { costs: [...offer.costs, { object: '', quantity: 1 }] })}
                className="flex items-center gap-1 py-1 text-xs text-lime-300"><Plus className="h-3.5 w-3.5" /> Add Required Item</button>
            </div>
            <section className="space-y-2 border-t border-slate-800 pt-3">
              <h5 className="text-xs font-bold text-amber-300">Offer Effects</h5>
              <CampaignEffectsEditor effects={offer.effects || []} cards={cards} items={items} unlocks={unlocks}
                onChange={(effects) => updateOffer(offer.id, { effects })} />
            </section>
          </section>
        ))}
      </div>
    </div>
  );
}