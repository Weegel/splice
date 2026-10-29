import { useState } from 'react';
import { ChevronDown, Search, X } from 'lucide-react';
import { CampaignNode, CampaignNodeType } from '../types/campaign';

interface CampaignNodePickerProps {
  nodes: CampaignNode[];
  value?: string;
  onChange: (nodeId: string | undefined) => void;
  excludeNodeId?: string;
  nodeTypes?: CampaignNodeType[];
  emptyLabel?: string;
  className?: string;
}

export function CampaignNodePicker({ nodes, value, onChange, excludeNodeId, nodeTypes, emptyLabel = 'Select node', className }: CampaignNodePickerProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [includedTypes, setIncludedTypes] = useState<CampaignNodeType[]>([]);
  const filterableTypes = [...new Set(nodes
    .filter((node) => node.id !== excludeNodeId && (!nodeTypes || nodeTypes.includes(node.type)))
    .map((node) => node.type))].sort();
  const availableNodes = nodes.filter((node) =>
    node.id !== excludeNodeId && (!nodeTypes || nodeTypes.includes(node.type)) &&
    (!includedTypes.length || includedTypes.includes(node.type)) &&
    `${node.title} ${node.type} ${node.id}`.toLowerCase().includes(search.trim().toLowerCase())
  );
  const selectedNode = nodes.find((node) => node.id === value);
  const close = () => {
    setIsOpen(false);
    setSearch('');
    setIncludedTypes([]);
  };

  return (
    <>
      <button type="button" aria-haspopup="dialog" aria-expanded={isOpen} onClick={() => { setSearch(''); setIncludedTypes([]); setIsOpen(true); }}
        className={className || 'flex w-full items-center justify-between gap-2 rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-left text-xs text-slate-200 hover:border-slate-500'}>
        <span className="min-w-0 truncate">{selectedNode ? `[${selectedNode.type.toUpperCase()}] ${selectedNode.title}` : value ? `Missing node: ${value}` : emptyLabel}</span>
        <ChevronDown className="h-4 w-4 shrink-0 text-slate-400" />
      </button>
      {isOpen && (
        <div className="fixed inset-0 z-[90] flex items-center justify-center bg-black/75 p-4" onClick={close} onKeyDown={(event) => {
          if (event.key === 'Escape') { event.stopPropagation(); close(); }
        }}>
          <section role="dialog" aria-modal="true" aria-labelledby="campaign-node-picker-title" onClick={(event) => event.stopPropagation()}
            className="flex max-h-[min(80dvh,42rem)] w-full max-w-xl flex-col overflow-hidden rounded-lg border border-slate-700 bg-slate-900 text-slate-100 shadow-2xl">
            <header className="flex items-center gap-3 border-b border-slate-800 p-4">
              <div className="min-w-0 flex-1">
                <h3 id="campaign-node-picker-title" className="text-sm font-bold text-amber-300">Choose Node</h3>
                <p className="text-xs text-slate-500">{availableNodes.length} matching nodes</p>
              </div>
              <button type="button" title="Close node picker" aria-label="Close node picker" onClick={close}
                className="flex h-8 w-8 shrink-0 items-center justify-center rounded text-slate-400 hover:bg-slate-800"><X className="h-4 w-4" /></button>
            </header>
            <div className="space-y-3 border-b border-slate-800 p-3">
              <label className="relative block min-w-0">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
                <input autoFocus type="search" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search by title or ID"
                  aria-label="Search campaign nodes" className="w-full rounded-lg border border-slate-700 bg-slate-950 py-2 pl-9 pr-3 text-sm text-slate-100 placeholder:text-slate-500 focus:border-amber-500 focus:outline-none" />
              </label>
              <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label="Filter nodes by type">
                <button type="button" aria-pressed={!includedTypes.length} onClick={() => setIncludedTypes([])}
                  className={`rounded-md border px-2.5 py-1.5 text-xs font-medium ${!includedTypes.length ? 'border-amber-500 bg-amber-950 text-amber-200' : 'border-slate-700 bg-slate-950 text-slate-400 hover:text-slate-200'}`}>
                  All
                </button>
                {filterableTypes.map((type) => {
                  const included = !includedTypes.length || includedTypes.includes(type);
                  return (
                    <button key={type} type="button" aria-pressed={included} onClick={() => setIncludedTypes((current) => {
                      if (!current.length) return [type];
                      const next = current.includes(type) ? current.filter((entry) => entry !== type) : [...current, type];
                      return next.length === filterableTypes.length ? [] : next;
                    })}
                      className={`rounded-md border px-2.5 py-1.5 text-xs font-medium capitalize ${included ? 'border-amber-500 bg-amber-950 text-amber-200' : 'border-slate-700 bg-slate-950 text-slate-400 hover:text-slate-200'}`}>
                      {type}
                    </button>
                  );
                })}
              </div>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto p-2">
              <button type="button" onClick={() => { onChange(undefined); close(); }}
                className="mb-1 flex w-full items-center rounded-md px-3 py-2.5 text-left text-xs text-slate-400 hover:bg-slate-800 hover:text-slate-100">
                {emptyLabel}
              </button>
              {value && !selectedNode && <p className="px-3 py-2 text-xs text-rose-300">Current destination is missing: {value}</p>}
              {availableNodes.map((node) => (
                <button key={node.id} type="button" aria-current={node.id === value ? 'true' : undefined} onClick={() => { onChange(node.id); close(); }}
                  className={`mb-1 flex w-full items-center gap-3 rounded-md px-3 py-2.5 text-left hover:bg-slate-800 ${node.id === value ? 'bg-slate-800' : ''}`}>
                  <span className="w-20 shrink-0 text-[10px] font-semibold uppercase text-slate-500">{node.type}</span>
                  <span className="min-w-0 flex-1 truncate text-sm text-slate-100">{node.title || 'Untitled node'}</span>
                  <span className="shrink-0 text-[10px] text-slate-600">{node.id.slice(0, 10)}</span>
                </button>
              ))}
              {!availableNodes.length && <p className="px-3 py-6 text-center text-xs text-slate-500">No nodes match that search.</p>}
            </div>
          </section>
        </div>
      )}
    </>
  );
}