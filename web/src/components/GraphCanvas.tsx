import { useEffect, useLayoutEffect, useMemo, useRef } from "react";
import {
  Background,
  BackgroundVariant,
  Controls,
  Handle,
  MarkerType,
  MiniMap,
  Position,
  ReactFlow,
  type Connection,
  type Edge,
  type Node,
  type NodeProps,
  type ReactFlowInstance,
  useNodesState,
} from "@xyflow/react";
import type { EdgeDefinition, EdgeMode, GraphEdgeResponse } from "../types";

type CausalNodeData = {
  label: string;
  forbiddenParent: boolean;
  forbiddenChild: boolean;
};

type CanvasEdgeData =
  | {
      type: "editable";
      mode: EdgeMode;
      edge: EdgeDefinition;
    }
  | {
      type: "result";
      resultEdge: GraphEdgeResponse;
    };

export type EditableEdgeSelection = {
  mode: EdgeMode;
  edge: EdgeDefinition;
};

export type ResultEdgeSelection = {
  edge: GraphEdgeResponse;
};

type GraphCanvasProps = {
  columns: string[];
  causalEdges?: EdgeDefinition[];
  requiredEdges?: EdgeDefinition[];
  forbiddenEdges?: EdgeDefinition[];
  resultEdges?: GraphEdgeResponse[];
  forbiddenParents?: string[];
  forbiddenChildren?: string[];
  mode?: EdgeMode;
  editable?: boolean;
  layoutVersion?: number;
  onAddEdge?: (mode: EdgeMode, edge: EdgeDefinition) => void;
  onRemoveEdge?: (mode: EdgeMode, edge: EdgeDefinition) => void;
  onAddResultEdge?: (edge: EdgeDefinition) => void;
  onRemoveResultEdge?: (edge: GraphEdgeResponse) => void;
  onNodeSelect?: (column: string | null) => void;
  onEditableEdgeSelect?: (selection: EditableEdgeSelection | null) => void;
  onResultEdgeSelect?: (selection: ResultEdgeSelection | null) => void;
};

type NodePosition = { x: number; y: number };

const EDGE_COLORS: Record<EdgeMode, string> = {
  causal: "#2563eb",
  required: "#07875f",
  forbidden: "#d92d20",
};

// デフォルト引数で毎レンダー新しい配列を生成すると、ノード同期の
// useLayoutEffectが連続実行されるため、共有の空配列を使用する。
const EMPTY_EDGE_DEFINITIONS: EdgeDefinition[] = [];
const EMPTY_STRINGS: string[] = [];
const NODE_X_GAP = 260;
const NODE_Y_GAP = 142;
const LAYOUT_MARGIN_X = 42;
const LAYOUT_MARGIN_Y = 42;

function fallbackPosition(index: number): NodePosition {
  const columnsPerRow = 3;
  return {
    x: (index % columnsPerRow) * 245 + LAYOUT_MARGIN_X,
    y: Math.floor(index / columnsPerRow) * 150 + LAYOUT_MARGIN_Y,
  };
}

function collectLayoutEdges(
  showsResult: boolean,
  resultEdges: GraphEdgeResponse[] | undefined,
  causalEdges: EdgeDefinition[],
  requiredEdges: EdgeDefinition[],
): EdgeDefinition[] {
  if (showsResult) {
    return (resultEdges ?? [])
      .filter((edge) => edge.kind === "directed")
      .map(({ source, target }) => ({ source, target }));
  }
  return [...causalEdges, ...requiredEdges];
}

/**
 * 有向辺とノード制約から階層を計算し、原因側を左、結果側を右へ配置する。
 *
 * - 入力だけを持つ終端ノードは右端へ揃える。
 * - 「原因×」のノードは右端、「結果×」のノードは左端へ配置する。
 * - 孤立ノードは原因とみなさず中間へ配置する。
 * - 循環などで解決できないノードは左端ではなく中間へ退避する。
 */
function causalLayoutPositions(
  columns: string[],
  candidateEdges: EdgeDefinition[],
  causeForbiddenSet: Set<string>,
  effectForbiddenSet: Set<string>,
): Map<string, NodePosition> {
  const positions = new Map<string, NodePosition>();
  const columnSet = new Set(columns);
  const columnOrder = new Map(columns.map((column, index) => [column, index]));
  const uniqueEdges = new Map<string, EdgeDefinition>();

  for (const edge of candidateEdges) {
    if (
      edge.source === edge.target
      || !columnSet.has(edge.source)
      || !columnSet.has(edge.target)
    ) {
      continue;
    }
    uniqueEdges.set(`${edge.source}\u0000${edge.target}`, edge);
  }

  const edges = [...uniqueEdges.values()];
  const outgoing = new Map(columns.map((column) => [column, [] as string[]]));
  const incoming = new Map(columns.map((column) => [column, [] as string[]]));
  const remainingIndegree = new Map(columns.map((column) => [column, 0]));
  const level = new Map(columns.map((column) => [column, 0]));

  for (const edge of edges) {
    outgoing.get(edge.source)?.push(edge.target);
    incoming.get(edge.target)?.push(edge.source);
    remainingIndegree.set(
      edge.target,
      (remainingIndegree.get(edge.target) ?? 0) + 1,
    );
  }

  const sortByColumnOrder = (left: string, right: string) => (
    (columnOrder.get(left) ?? 0) - (columnOrder.get(right) ?? 0)
  );
  const queue = columns
    .filter((column) => remainingIndegree.get(column) === 0)
    .sort(sortByColumnOrder);
  const processed = new Set<string>();

  while (queue.length) {
    const source = queue.shift();
    if (!source) break;
    processed.add(source);

    const targets = [...(outgoing.get(source) ?? [])].sort(sortByColumnOrder);
    for (const target of targets) {
      level.set(
        target,
        Math.max(level.get(target) ?? 0, (level.get(source) ?? 0) + 1),
      );
      const nextIndegree = (remainingIndegree.get(target) ?? 0) - 1;
      remainingIndegree.set(target, nextIndegree);
      if (nextIndegree === 0) {
        queue.push(target);
        queue.sort(sortByColumnOrder);
      }
    }
  }

  const processedMaxLevel = Math.max(
    0,
    ...columns
      .filter((column) => processed.has(column))
      .map((column) => level.get(column) ?? 0),
  );
  const unresolvedMiddleLevel = Math.max(1, Math.ceil(processedMaxLevel / 2));

  // 循環などでトポロジカルソートできないノードは、解決済みの親が
  // あればその右隣へ置き、それ以外は中間階層へ退避する。
  for (const column of columns) {
    if (processed.has(column)) continue;
    const resolvedParentLevels = (incoming.get(column) ?? [])
      .filter((parent) => processed.has(parent))
      .map((parent) => level.get(parent) ?? 0);
    level.set(
      column,
      resolvedParentLevels.length
        ? Math.max(...resolvedParentLevels) + 1
        : unresolvedMiddleLevel,
    );
  }

  const structuralMaxLevel = Math.max(0, ...columns.map((column) => level.get(column) ?? 0));
  const sinkLevel = Math.max(2, structuralMaxLevel);
  const explicitlyResultOnlyLevel = sinkLevel + 1;
  const neutralLevel = Math.max(1, Math.ceil(sinkLevel / 2));

  for (const column of columns) {
    const incomingCount = incoming.get(column)?.length ?? 0;
    const outgoingCount = outgoing.get(column)?.length ?? 0;
    const isStructuralCauseOnly = incomingCount === 0 && outgoingCount > 0;
    const isStructuralResultOnly = incomingCount > 0 && outgoingCount === 0;
    const isIsolated = incomingCount === 0 && outgoingCount === 0;
    const causeForbidden = causeForbiddenSet.has(column);
    const effectForbidden = effectForbiddenSet.has(column);

    // 両方の制約がある場合は検証エラー側へ任せ、構造から計算した位置を保つ。
    if (causeForbidden && !effectForbidden) {
      level.set(column, explicitlyResultOnlyLevel);
    } else if (effectForbidden && !causeForbidden) {
      level.set(column, 0);
    } else if (isStructuralResultOnly) {
      level.set(column, sinkLevel);
    } else if (isStructuralCauseOnly) {
      level.set(column, 0);
    } else if (isIsolated) {
      level.set(column, neutralLevel);
    }
  }

  const layers = new Map<number, string[]>();
  for (const column of columns) {
    const nodeLevel = level.get(column) ?? neutralLevel;
    layers.set(nodeLevel, [...(layers.get(nodeLevel) ?? []), column]);
  }
  for (const layerColumns of layers.values()) layerColumns.sort(sortByColumnOrder);

  const maxLayerSize = Math.max(1, ...[...layers.values()].map((items) => items.length));
  for (const [nodeLevel, layerColumns] of [...layers.entries()].sort(([left], [right]) => left - right)) {
    const verticalOffset = ((maxLayerSize - layerColumns.length) * NODE_Y_GAP) / 2;
    layerColumns.forEach((column, index) => {
      positions.set(column, {
        x: nodeLevel * NODE_X_GAP + LAYOUT_MARGIN_X,
        y: index * NODE_Y_GAP + verticalOffset + LAYOUT_MARGIN_Y,
      });
    });
  }

  return positions;
}

function makeNodes(
  columns: string[],
  parentSet: Set<string>,
  childSet: Set<string>,
  positions: Map<string, NodePosition>,
  layoutPositions: Map<string, NodePosition>,
  resetLayout: boolean,
): Node<CausalNodeData>[] {
  return columns.map((column, index) => ({
    id: column,
    type: "causalNode",
    position: resetLayout
      ? layoutPositions.get(column) ?? fallbackPosition(index)
      : positions.get(column) ?? layoutPositions.get(column) ?? fallbackPosition(index),
    data: {
      label: column,
      forbiddenParent: parentSet.has(column),
      forbiddenChild: childSet.has(column),
    },
  }));
}

function CausalNode({ data, selected }: NodeProps) {
  const nodeData = data as CausalNodeData;
  return (
    <div className={`causal-node ${selected ? "selected" : ""}`}>
      <Handle
        type="target"
        position={Position.Left}
        className="node-handle node-handle-target"
        aria-label="入力側の接続ポイント"
        title="入力側：原因ノードからのエッジを受け取ります"
      />
      <div className="causal-node-copy">
        <small>VARIABLE</small>
        <strong title={nodeData.label}>{nodeData.label}</strong>
      </div>
      <div className="node-badges">
        {nodeData.forbiddenParent && <span className="node-badge parent">原因×</span>}
        {nodeData.forbiddenChild && <span className="node-badge child">結果×</span>}
      </div>
      <Handle
        type="source"
        position={Position.Right}
        className="node-handle node-handle-source"
        aria-label="出力側の接続ポイント"
        title="出力側：このノードを原因とするエッジを伸ばします"
      />
    </div>
  );
}

const nodeTypes = { causalNode: CausalNode };

function editableEdges(
  causalEdges: EdgeDefinition[],
  requiredEdges: EdgeDefinition[],
  forbiddenEdges: EdgeDefinition[],
): Edge<CanvasEdgeData>[] {
  const convert = (mode: EdgeMode, edge: EdgeDefinition): Edge<CanvasEdgeData> => ({
    id: `${mode}|${edge.source}|${edge.target}`,
    source: edge.source,
    target: edge.target,
    label: mode === "causal" ? "仮定" : mode === "required" ? "必須" : "禁止",
    markerEnd: { type: MarkerType.ArrowClosed, color: EDGE_COLORS[mode] },
    style: {
      stroke: EDGE_COLORS[mode],
      strokeWidth: mode === "required" ? 3 : 2,
      strokeDasharray: mode === "forbidden" ? "7 5" : undefined,
    },
    labelStyle: { fill: EDGE_COLORS[mode], fontWeight: 700, fontSize: 10 },
    data: { type: "editable", mode, edge },
    animated: mode === "required",
  });
  return [
    ...causalEdges.map((edge) => convert("causal", edge)),
    ...requiredEdges.map((edge) => convert("required", edge)),
    ...forbiddenEdges.map((edge) => convert("forbidden", edge)),
  ];
}

function discoveryEdges(edges: GraphEdgeResponse[]): Edge<CanvasEdgeData>[] {
  return edges.map((edge, index) => {
    const directed = edge.kind === "directed";
    const color = directed ? "#2563eb" : "#b54708";
    return {
      id: `result|${edge.kind}|${index}|${edge.source}|${edge.target}`,
      source: edge.source,
      target: edge.target,
      label: directed ? "有向" : "未方向",
      markerEnd: directed ? { type: MarkerType.ArrowClosed, color } : undefined,
      style: {
        stroke: color,
        strokeWidth: directed ? 2.5 : 2,
        strokeDasharray: directed ? undefined : "5 4",
      },
      labelStyle: { fill: color, fontWeight: 700, fontSize: 10 },
      animated: false,
      data: { type: "result", resultEdge: edge },
    };
  });
}

export default function GraphCanvas({
  columns,
  causalEdges = EMPTY_EDGE_DEFINITIONS,
  requiredEdges = EMPTY_EDGE_DEFINITIONS,
  forbiddenEdges = EMPTY_EDGE_DEFINITIONS,
  resultEdges,
  forbiddenParents = EMPTY_STRINGS,
  forbiddenChildren = EMPTY_STRINGS,
  mode = "causal",
  editable = true,
  layoutVersion = 0,
  onAddEdge,
  onRemoveEdge,
  onAddResultEdge,
  onRemoveResultEdge,
  onNodeSelect,
  onEditableEdgeSelect,
  onResultEdgeSelect,
}: GraphCanvasProps) {
  const parentSet = useMemo(() => new Set(forbiddenParents), [forbiddenParents]);
  const childSet = useMemo(() => new Set(forbiddenChildren), [forbiddenChildren]);
  const columnsKey = useMemo(() => columns.join("\u0000"), [columns]);
  const showsResult = resultEdges !== undefined;
  const layoutEdges = useMemo(
    () => collectLayoutEdges(showsResult, resultEdges, causalEdges, requiredEdges),
    [showsResult, resultEdges, causalEdges, requiredEdges],
  );
  const edgeLayoutSignature = useMemo(
    () => layoutEdges
      .map((edge) => `${edge.source}->${edge.target}`)
      .sort()
      .join("|"),
    [layoutEdges],
  );
  const policyLayoutSignature = useMemo(() => {
    const causes = [...parentSet].sort().join("|");
    const effects = [...childSet].sort().join("|");
    return causes || effects ? `cause-forbidden:${causes};effect-forbidden:${effects}` : "";
  }, [parentSet, childSet]);
  const layoutSignature = useMemo(
    () => [edgeLayoutSignature, policyLayoutSignature].filter(Boolean).join("||"),
    [edgeLayoutSignature, policyLayoutSignature],
  );
  const layoutPositions = useMemo(
    () => causalLayoutPositions(columns, layoutEdges, parentSet, childSet),
    [columnsKey, layoutSignature, parentSet, childSet],
  );
  const [nodes, setNodes, onNodesChange] = useNodesState<Node<CausalNodeData>>(
    makeNodes(columns, parentSet, childSet, new Map(), layoutPositions, true),
  );
  const flowInstance = useRef<
    ReactFlowInstance<Node<CausalNodeData>, Edge<CanvasEdgeData>> | null
  >(null);
  const previousLayoutVersion = useRef(layoutVersion);
  const previousLayoutSignature = useRef(layoutSignature);

  useLayoutEffect(() => {
    const layoutRequested = layoutVersion !== previousLayoutVersion.current;
    const firstStructureAppeared = !previousLayoutSignature.current && Boolean(layoutSignature);
    const resetLayout = layoutRequested || firstStructureAppeared;
    previousLayoutVersion.current = layoutVersion;
    previousLayoutSignature.current = layoutSignature;

    setNodes((current) => {
      const positions = new Map(current.map((node) => [node.id, node.position]));
      return makeNodes(
        columns,
        parentSet,
        childSet,
        positions,
        layoutPositions,
        resetLayout,
      );
    });
  }, [
    columns,
    parentSet,
    childSet,
    layoutVersion,
    layoutSignature,
    layoutPositions,
    setNodes,
  ]);

  useEffect(() => {
    const frame = window.requestAnimationFrame(() => {
      void flowInstance.current?.fitView({ padding: 0.2, duration: 180 });
    });
    return () => window.cancelAnimationFrame(frame);
  }, [columnsKey, layoutVersion]);

  const edges = useMemo<Edge<CanvasEdgeData>[]>(
    () => showsResult
      ? discoveryEdges(resultEdges ?? [])
      : editableEdges(causalEdges, requiredEdges, forbiddenEdges),
    [showsResult, resultEdges, causalEdges, requiredEdges, forbiddenEdges],
  );

  const clearEdgeSelection = () => {
    onEditableEdgeSelect?.(null);
    onResultEdgeSelect?.(null);
  };

  const connect = (connection: Connection) => {
    if (!editable || !connection.source || !connection.target) return;
    const edge = { source: connection.source, target: connection.target };
    if (showsResult) onAddResultEdge?.(edge);
    else onAddEdge?.(mode, edge);
  };

  return (
    <div className="graph-canvas" data-mode={showsResult ? "result" : mode}>
      <ReactFlow<Node<CausalNodeData>, Edge<CanvasEdgeData>>
        nodes={nodes}
        edges={edges}
        nodeTypes={nodeTypes}
        onInit={(instance) => {
          flowInstance.current = instance;
          window.requestAnimationFrame(() => {
            void instance.fitView({ padding: 0.2 });
          });
        }}
        onNodesChange={onNodesChange}
        onConnect={connect}
        onNodeClick={(_, node) => {
          clearEdgeSelection();
          onNodeSelect?.(node.id);
        }}
        onEdgeClick={(_, edge) => {
          onNodeSelect?.(null);
          const edgeData = edge.data;
          if (edgeData?.type === "result") {
            onEditableEdgeSelect?.(null);
            onResultEdgeSelect?.({ edge: edgeData.resultEdge });
            return;
          }
          onResultEdgeSelect?.(null);
          onEditableEdgeSelect?.(
            edgeData?.type === "editable"
              ? { mode: edgeData.mode, edge: edgeData.edge }
              : null,
          );
        }}
        onPaneClick={() => {
          onNodeSelect?.(null);
          clearEdgeSelection();
        }}
        onEdgesDelete={(deleted) => {
          if (!editable) return;
          for (const edge of deleted) {
            const edgeData = edge.data;
            if (edgeData?.type === "result") {
              onRemoveResultEdge?.(edgeData.resultEdge);
              continue;
            }
            if (edgeData?.type === "editable") {
              onRemoveEdge?.(edgeData.mode, edgeData.edge);
            }
          }
          clearEdgeSelection();
        }}
        nodesDraggable={editable}
        nodesConnectable={editable}
        elementsSelectable={editable}
        deleteKeyCode={editable ? ["Backspace", "Delete"] : null}
        fitView
        fitViewOptions={{ padding: 0.2 }}
        proOptions={{ hideAttribution: true }}
      >
        <MiniMap pannable zoomable />
        <Controls showInteractive={editable} />
        <Background variant={BackgroundVariant.Dots} gap={18} size={1.2} />
      </ReactFlow>
      {!columns.length && (
        <div className="graph-empty">
          <strong>ノードがありません</strong>
          <span>使用するカラムを選択してください。</span>
        </div>
      )}
    </div>
  );
}
