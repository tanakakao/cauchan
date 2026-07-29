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

const EDGE_COLORS: Record<EdgeMode, string> = {
  causal: "#2563eb",
  required: "#07875f",
  forbidden: "#d92d20",
};

function initialPosition(index: number): { x: number; y: number } {
  const columnsPerRow = 3;
  return {
    x: (index % columnsPerRow) * 245 + 40,
    y: Math.floor(index / columnsPerRow) * 150 + 40,
  };
}

function makeNodes(
  columns: string[],
  parentSet: Set<string>,
  childSet: Set<string>,
  positions: Map<string, { x: number; y: number }>,
  resetLayout: boolean,
): Node<CausalNodeData>[] {
  return columns.map((column, index) => ({
    id: column,
    type: "causalNode",
    position: resetLayout ? initialPosition(index) : positions.get(column) ?? initialPosition(index),
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
      <Handle type="target" position={Position.Left} className="node-handle" />
      <div className="causal-node-copy">
        <small>VARIABLE</small>
        <strong title={nodeData.label}>{nodeData.label}</strong>
      </div>
      <div className="node-badges">
        {nodeData.forbiddenParent && <span className="node-badge parent">原因×</span>}
        {nodeData.forbiddenChild && <span className="node-badge child">結果×</span>}
      </div>
      <Handle type="source" position={Position.Right} className="node-handle" />
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
  causalEdges = [],
  requiredEdges = [],
  forbiddenEdges = [],
  resultEdges,
  forbiddenParents = [],
  forbiddenChildren = [],
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
  const [nodes, setNodes, onNodesChange] = useNodesState<Node<CausalNodeData>>(
    makeNodes(columns, parentSet, childSet, new Map(), true),
  );
  const flowInstance = useRef<
    ReactFlowInstance<Node<CausalNodeData>, Edge<CanvasEdgeData>> | null
  >(null);
  const previousLayoutVersion = useRef(layoutVersion);
  const showsResult = resultEdges !== undefined;

  useLayoutEffect(() => {
    const resetLayout = layoutVersion !== previousLayoutVersion.current;
    previousLayoutVersion.current = layoutVersion;
    setNodes((current) => {
      const positions = new Map(current.map((node) => [node.id, node.position]));
      return makeNodes(columns, parentSet, childSet, positions, resetLayout);
    });
  }, [columns, parentSet, childSet, layoutVersion, setNodes]);

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
