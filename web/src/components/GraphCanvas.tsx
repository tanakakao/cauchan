import { useEffect, useMemo } from "react";
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
  useNodesState,
} from "@xyflow/react";
import type { EdgeDefinition, EdgeMode, GraphEdgeResponse } from "../types";

type CausalNodeData = {
  label: string;
  forbiddenParent: boolean;
  forbiddenChild: boolean;
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
  onNodeSelect?: (column: string | null) => void;
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
): Edge[] {
  const convert = (mode: EdgeMode, edge: EdgeDefinition): Edge => ({
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
    data: { mode },
    animated: mode === "required",
  });
  return [
    ...causalEdges.map((edge) => convert("causal", edge)),
    ...requiredEdges.map((edge) => convert("required", edge)),
    ...forbiddenEdges.map((edge) => convert("forbidden", edge)),
  ];
}

function discoveryEdges(edges: GraphEdgeResponse[]): Edge[] {
  return edges.map((edge, index) => {
    const directed = edge.kind === "directed";
    const color = directed ? "#2563eb" : "#b54708";
    return {
      id: `result|${index}|${edge.source}|${edge.target}`,
      source: edge.source,
      target: edge.target,
      label: directed ? "推定" : "未方向",
      markerEnd: directed ? { type: MarkerType.ArrowClosed, color } : undefined,
      style: {
        stroke: color,
        strokeWidth: directed ? 2.5 : 2,
        strokeDasharray: directed ? undefined : "5 4",
      },
      labelStyle: { fill: color, fontWeight: 700, fontSize: 10 },
      animated: false,
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
  onNodeSelect,
}: GraphCanvasProps) {
  const [nodes, setNodes, onNodesChange] = useNodesState<Node<CausalNodeData>>([]);
  const parentSet = useMemo(() => new Set(forbiddenParents), [forbiddenParents]);
  const childSet = useMemo(() => new Set(forbiddenChildren), [forbiddenChildren]);

  useEffect(() => {
    setNodes((current) => {
      const positions = new Map(current.map((node) => [node.id, node.position]));
      return columns.map((column, index) => ({
        id: column,
        type: "causalNode",
        position: layoutVersion ? initialPosition(index) : positions.get(column) ?? initialPosition(index),
        data: {
          label: column,
          forbiddenParent: parentSet.has(column),
          forbiddenChild: childSet.has(column),
        },
      }));
    });
  }, [columns, parentSet, childSet, layoutVersion, setNodes]);

  const edges = useMemo(
    () => resultEdges
      ? discoveryEdges(resultEdges)
      : editableEdges(causalEdges, requiredEdges, forbiddenEdges),
    [resultEdges, causalEdges, requiredEdges, forbiddenEdges],
  );

  const connect = (connection: Connection) => {
    if (!editable || !onAddEdge || !connection.source || !connection.target) return;
    onAddEdge(mode, { source: connection.source, target: connection.target });
  };

  return (
    <div className="graph-canvas" data-mode={mode}>
      <ReactFlow
        nodes={nodes}
        edges={edges}
        nodeTypes={nodeTypes}
        onNodesChange={onNodesChange}
        onConnect={connect}
        onNodeClick={(_, node) => onNodeSelect?.(node.id)}
        onPaneClick={() => onNodeSelect?.(null)}
        onEdgesDelete={(deleted) => {
          if (!editable || !onRemoveEdge) return;
          for (const edge of deleted) {
            const [edgeMode, source, target] = edge.id.split("|");
            if (edgeMode === "causal" || edgeMode === "required" || edgeMode === "forbidden") {
              onRemoveEdge(edgeMode, { source, target });
            }
          }
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
