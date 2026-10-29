import { Plus, Trash2 } from 'lucide-react';
import { CampaignActionDefinition, CampaignItemDefinition, CampaignItemParameter, CampaignNode, CampaignShopItem, CampaignShopOffer, CampaignUnlockDefinition, ShopCampaignNode } from '../types/campaign';
import { CardDefinition } from '../types/card';
import { CampaignEffectsEditor } from './CampaignEffectsEditor';
import { CampaignItemSelect } from './CampaignItemSelect';
import { CampaignPreconditionsEditor } from './CampaignPreconditionsEditor';
import { CampaignNodePicker } from './CampaignNodePicker';

interface CampaignShopEditorProps {
  node: ShopCampaignNode;
  nodes: CampaignNode[];
  cards: CardDefinition[];
  items: CampaignItemDefinition[];
  unlocks?: CampaignUnlockDefinition[];
  actions?: CampaignActionDefinition[];
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

export function CampaignShopEditor({ node, nodes, cards, items, unlocks = [], actions = [], onChange }: CampaignShopEditorProps) {
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
      <div className="space-y-1">
        <label className="block text-xs text-slate-400">Leave Destination</label>
        <CampaignNodePicker nodes={nodes} value={node.nextNodeId} excludeNodeId={node.id} emptyLabel="Select node"
          onChange={(nextNodeId) => onChange({ ...node, nextNodeId })} />
      </div>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h4 className="text-xs font-bold text-lime-300">Shop Offers ({node.offers.length})</h4>
        <button type="button" onClick={() => onChange({ ...node, offers: [...node.offers, {
          id: `offer_${Date.now()}_${node.offers.length}`, offerType: 'barter', costs: [{ object: '', quantity: 1 }], effects: [],
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
            <div className="grid gap-2 sm:grid-cols-2">
              <label className="block text-xs text-slate-400">
                Offer Name
                <input type="text" value={offer.title || ''} onChange={(event) => updateOffer(offer.id, { title: event.target.value })}
                  className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-900 px-2 py-1.5 text-xs text-slate-100" />
              </label>
              <label className="block text-xs text-slate-400">
                Offer Type
                <select value={offer.offerType || 'barter'} onChange={(event) => {
                  const offerType = event.target.value as CampaignShopOffer['offerType'];
                  updateOffer(offer.id, offerType === 'buy' ? {
                    offerType,
                    valueParameter: offer.valueParameter || CampaignItemParameter.SellValue,
                    currencyObject: offer.currencyObject || items.find((item) => item.name.trim().toLowerCase() === 'imagination')?.name || '',
                  } : { offerType });
                }}
                  className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-900 px-2 py-1.5 text-xs text-slate-100">
                  <option value="barter">Barter</option>
                  <option value="buy">Buy items</option>
                  <option value="effect">Effect offer</option>
                </select>
              </label>
            </div>
            <CampaignPreconditionsEditor preconditions={offer.preconditions || []} unlocks={unlocks} cards={cards} items={items}
              onChange={(preconditions) => updateOffer(offer.id, { preconditions: preconditions.length ? preconditions : undefined })} />
            {offer.offerType === 'buy' ? (
              <div className="grid gap-2 sm:grid-cols-2">
                <label className="block text-xs text-slate-400">
                  Item Value Property
                  <select value={offer.valueParameter || CampaignItemParameter.SellValue}
                    onChange={(event) => updateOffer(offer.id, { valueParameter: event.target.value as CampaignItemParameter })}
                    className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-900 px-2 py-1.5 text-xs text-slate-100">
                    {Object.values(CampaignItemParameter).map((parameter) => (
                      <option key={parameter} value={parameter}>{parameter === CampaignItemParameter.SellValue ? 'Sell value' : parameter === CampaignItemParameter.MaxCapacity ? 'Max capacity' : parameter}</option>
                    ))}
                  </select>
                </label>
                <label className="block text-xs text-slate-400">
                  Payout Currency
                  <CampaignItemSelect items={items} value={offer.currencyObject || ''} onChange={(currencyObject) => updateOffer(offer.id, { currencyObject })}
                    className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-900 px-2 py-1.5 text-xs text-slate-100" />
                </label>
              </div>
            ) : (
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
            )}
            <section className="space-y-2 border-t border-slate-800 pt-3">
              <h5 className="text-xs font-bold text-amber-300">Offer Effects</h5>
              <CampaignEffectsEditor effects={offer.effects || []} cards={cards} items={items} unlocks={unlocks} actions={actions} nodes={nodes}
                onChange={(effects) => updateOffer(offer.id, { effects })} />
            </section>
          </section>
        ))}
      </div>
    </div>
  );
}