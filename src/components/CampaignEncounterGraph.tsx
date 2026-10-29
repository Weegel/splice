import { memo, useEffect, useRef } from 'react';
import { Background, BaseEdge, Controls, EdgeLabelRenderer, getBezierPath, Handle, MiniMap, Position, ReactFlow, MarkerType, useViewport, type Edge, type EdgeProps, type Node } from '@xyflow/react';
import dagre from '@dagrejs/dagre';
import { X } from 'lucide-react';
import { CampaignDefinition, CampaignNodeType } from '../types/campaign';
import '@xyflow/react/dist/style.css';

const colors: Record<CampaignNodeType, string> = {
  text: '#38bdf8', decision: '#fbbf24', multi: '#22d3ee',
  hub: '#2dd4bf', shop: '#a3e635', battle: '#fb7185', end: '#34d399',
};

const MIN_LABEL_ZOOM = 0.75;

function CampaignGraphEdge(props: EdgeProps) {
  const { id, sourceX, sourceY, targetX, targetY, sourcePosition, targetPosition, markerEnd, style, label } = props;
  const { zoom } = useViewport();
  const [path, labelX, labelY] = getBezierPath({ sourceX, sourceY, sourcePosition, targetX, targetY, targetPosition });
  return (
    <>
      <BaseEdge id={id} path={path} markerEnd={markerEnd} style={style} />
      {label && zoom >= MIN_LABEL_ZOOM && (
        <EdgeLabelRenderer>
          <div className="nodrag nopan rounded border border-slate-600 bg-slate-950 px-1.5 py-0.5 text-[10px] font-semibold leading-none text-slate-100 shadow"
            style={{ position: 'absolute', transform: `translate(-50%, -50%) translate(${labelX}px,${labelY}px)`, pointerEvents: 'none' }}>
            {label}
          </div>
        </EdgeLabelRenderer>
      )}
    </>
  );
}

const edgeTypes = { campaign: CampaignGraphEdge };

interface CampaignEncounterGraphProps {
  campaign: CampaignDefinition;
  currentNodeId?: string;
  onClose: () => void;
  onSelectNode?: (nodeId: string) => void;
}

export const CampaignEncounterGraph = memo(function CampaignEncounterGraph({ campaign, currentNodeId, onClose, onSelectNode }: CampaignEncounterGraphProps) {
  const dialog = useRef<HTMLDivElement>(null);
  const closeButton = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    const previousFocus = document.activeElement as HTMLElement | null;
    closeButton.current?.focus();
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = previousOverflow;
      previousFocus?.focus();
    };
  }, []);

  const edges: Edge[] = [];
  const addEdge = (source: string, target: string | undefined, label: string, color = '#94a3b8') => {
    if (!target) return;
    edges.push({
      id: `encounter-edge-${edges.length}`, source, target, label,
      type: 'campaign',
      markerEnd: { type: MarkerType.ArrowClosed, color },
      style: { stroke: color, strokeWidth: 1.5, opacity: 0.62 },
    });
  };
  for (const node of Object.values(campaign.nodes)) {
    if (node.type === 'text') addEdge(node.id, node.nextNodeId, node.buttonText || 'Continue');
    if (node.type === 'shop') addEdge(node.id, node.nextNodeId, 'Leave', colors.shop);
    if (node.type === 'decision' || node.type === 'hub') {
      node.choices.forEach((choice) => {
        if ('type' in choice && choice.type === 'event') return;
        addEdge(node.id, choice.nextNodeId, choice.text);
      });
    }
    if (node.type === 'multi') {
      const choices = node.choices.filter((choice) => Number.isFinite(choice.probability) && choice.probability > 0 && choice.nextNodeId !== node.id && Boolean(campaign.nodes[choice.nextNodeId]));
      const scale = Math.max(1, ...choices.map((choice) => choice.probability));
      const total = choices.reduce((sum, choice) => sum + choice.probability / scale, 0);
      choices.forEach((choice) => addEdge(node.id, choice.nextNodeId, `${Number((choice.probability / scale / total * 100).toFixed(1))}%`, colors.multi));
    }
    if (node.type === 'battle') {
      addEdge(node.id, node.onVictoryNodeId, 'Victory', '#34d399');
      addEdge(node.id, node.onDefeatNodeId, 'Defeat', '#fb7185');
      addEdge(node.id, node.onDrawNodeId || node.onDefeatNodeId, 'Draw', '#fbbf24');
    }
  }
  const groupedEdges = new Map<string, Edge>();
  for (const edge of edges) {
    const key = JSON.stringify([edge.source, edge.target]);
    const existing = groupedEdges.get(key);
    if (existing) existing.label = `${existing.label} / ${edge.label}`;
    else groupedEdges.set(key, { ...edge });
  }
  const reachable = new Set<string>();
  const pending = [campaign.startNodeId];
  while (pending.length) {
    const nodeId = pending.pop()!;
    if (reachable.has(nodeId)) continue;
    reachable.add(nodeId);
    edges.filter((edge) => edge.source === nodeId).forEach((edge) => pending.push(edge.target));
  }
  const nodeIds = new Set([...Object.values(campaign.nodes).map((node) => node.id), ...edges.map((edge) => edge.target)]);
  if (campaign.startNodeId) nodeIds.add(campaign.startNodeId);
  const layout = new dagre.graphlib.Graph({ multigraph: true });
  layout.setGraph({ rankdir: 'LR', nodesep: 80, ranksep: 200, marginx: 40, marginy: 40, acyclicer: 'greedy' });
  layout.setDefaultEdgeLabel(() => ({}));
  nodeIds.forEach((id) => layout.setNode(id, { width: 220, height: 100 }));
  [...groupedEdges.values()].forEach((edge) => layout.setEdge(edge.source, edge.target, {}, edge.id));
  dagre.layout(layout);
  const sourceHandleTops = new Map<string, number>();
  const targetHandleTops = new Map<string, number>();
  for (const id of nodeIds) {
    const outgoing = [...groupedEdges.values()].filter((edge) => edge.source === id)
      .sort((left, right) => layout.node(left.target).y - layout.node(right.target).y);
    outgoing.forEach((edge, index) => sourceHandleTops.set(edge.id, (index + 1) / (outgoing.length + 1) * 100));
    const incoming = [...groupedEdges.values()].filter((edge) => edge.target === id)
      .sort((left, right) => layout.node(left.source).y - layout.node(right.source).y);
    incoming.forEach((edge, index) => targetHandleTops.set(edge.id, (index + 1) / (incoming.length + 1) * 100));
  }
  const routedEdges = [...groupedEdges.values()].map((edge) => ({
    ...edge,
    sourceHandle: `${edge.id}-source`,
    targetHandle: `${edge.id}-target`,
  }));
  const nodes: Node[] = [...nodeIds].map((id) => {
    const node = campaign.nodes[id];
    const position = layout.node(id);
    const color = node ? colors[node.type] : '#f87171';
    const nodeEdges = [...groupedEdges.values()];
    return {
      id, position: { x: position.x - 110, y: position.y - 50 },
      sourcePosition: Position.Right, targetPosition: Position.Left,
      data: { label: (
        <>
          {nodeEdges.filter((edge) => edge.target === id).map((edge) => (
            <Handle key={edge.id} id={`${edge.id}-target`} type="target" position={Position.Left}
              style={{ top: `${targetHandleTops.get(edge.id)}%`, width: 8, height: 8, opacity: 0, border: 0, background: 'transparent' }} />
          ))}
          <div className="flex h-full flex-col justify-center gap-1 text-left">
            <div className="text-[10px] uppercase" style={{ color }}>
              {node?.type || 'Missing node'}{id === campaign.startNodeId ? ' / Start' : ''}{id === currentNodeId ? ' / Current' : ''}
            </div>
            <div className="text-sm font-bold break-words line-clamp-2" title={node?.title || id}>{node?.title || id}</div>
            {!reachable.has(id) && <div className="text-[10px] text-slate-400">Unreachable</div>}
          </div>
          {nodeEdges.filter((edge) => edge.source === id).map((edge) => (
            <Handle key={edge.id} id={`${edge.id}-source`} type="source" position={Position.Right}
              style={{ top: `${sourceHandleTops.get(edge.id)}%`, width: 8, height: 8, opacity: 0, border: 0, background: 'transparent' }} />
          ))}
        </>
      ) },
      style: {
        width: 220, height: 100, background: '#0f172a', color: '#f1f5f9',
        border: `2px ${reachable.has(id) ? 'solid' : 'dashed'} ${color}`, borderRadius: 8,
        boxShadow: id === currentNodeId ? `0 0 0 3px ${color}55` : undefined,
      },
    };
  });

  return (
    <div className="fixed inset-0 z-[80] bg-black/80 p-2 sm:p-6" onKeyDown={(event) => {
      if (event.key === 'Escape') { event.stopPropagation(); onClose(); }
      if (event.key === 'Tab') {
        const focusable = [...(dialog.current?.querySelectorAll<HTMLElement>('button:not([disabled]), [tabindex="0"], a[href], input') || [])];
        const first = focusable[0];
        const last = focusable[focusable.length - 1];
        if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
        else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
      }
    }}>
      <div ref={dialog} role="dialog" aria-modal="true" aria-labelledby="encounter-graph-title" className="flex h-full w-full flex-col overflow-hidden rounded-lg border border-slate-700 bg-slate-950 text-slate-100">
        <header className="flex shrink-0 items-center gap-3 border-b border-slate-700 p-3 sm:p-4">
          <div className="min-w-0 flex-1">
            <h3 id="encounter-graph-title" className="text-lg font-bold">Encounter Graph</h3>
            <p className="truncate text-xs text-slate-400" title={campaign.name}>{campaign.name} / {Object.keys(campaign.nodes).length} encounters / {edges.length} paths</p>
            <p className="text-[10px] text-slate-500">Path labels appear when zoomed in.</p>
          </div>
          <button ref={closeButton} type="button" onClick={onClose} title="Close encounter graph" aria-label="Close encounter graph" className="rounded p-2 text-slate-300 hover:bg-slate-800"><X className="h-5 w-5" /></button>
        </header>
        <div className="min-h-0 flex-1">
          {nodes.length ? (
            <ReactFlow nodes={nodes} edges={routedEdges} edgeTypes={edgeTypes} fitView fitViewOptions={{ padding: 0.2 }} minZoom={0.05} maxZoom={2} nodesDraggable={false} nodesConnectable={false} colorMode="dark"
              onNodeClick={(_, node) => { if (onSelectNode && campaign.nodes[node.id]) onSelectNode(node.id); }}>
              <Background color="#334155" gap={24} />
              <Controls showInteractive={false} />
              <MiniMap nodeColor={(node) => colors[campaign.nodes[node.id]?.type] || '#f87171'} pannable zoomable className="hidden sm:block" />
            </ReactFlow>
          ) : <div className="p-6 text-slate-400">No encounters</div>}
        </div>
      </div>
    </div>
  );
});