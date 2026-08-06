import { useMemo } from "react";
import { useWorkbench } from "../context/WorkbenchContext";
import type { WorkbenchStep } from "../types";
import GraphCanvas from "./GraphCanvas";

type ConversationGraphPreviewProps = {
  active: boolean;
  onOpenStep: (step: WorkbenchStep) => void;
};

function signatureVersion(signature: string): number {
  return [...signature].reduce(
    (hash, character) => ((hash * 31) + character.charCodeAt(0)) | 0,
    0,
  );
}

export default function ConversationGraphPreview({
  active,
  onOpenStep,
}: ConversationGraphPreviewProps) {
  const {
    selectedColumns,
    structureSource,
    causalEdges,
    discovery,
    editedDiscoveryEdges,
    unresolvedDiscoveryEdges,
  } = useWorkbench();

  const columns = structureSource === "discovery" && discovery
    ? discovery.columns
    : selectedColumns;
  const directedEdgeCount = structureSource === "discovery"
    ? editedDiscoveryEdges.filter((edge) => edge.kind === "directed").length
    : causalEdges.length;
  const hasStructure = structureSource === "discovery"
    ? Boolean(discovery && editedDiscoveryEdges.length)
    : causalEdges.length > 0;

  const layoutVersion = useMemo(() => {
    const edges = structureSource === "discovery"
      ? editedDiscoveryEdges.map((edge) => `${edge.kind}:${edge.source}->${edge.target}`)
      : causalEdges.map((edge) => `directed:${edge.source}->${edge.target}`);
    const signature = `${active}:${columns.join("|")}::${edges.sort().join("|")}`;
    return signatureVersion(signature);
  }, [active, structureSource, columns, editedDiscoveryEdges, causalEdges]);

  if (!hasStructure) return null;

  return (
    <div className="conversation-graph-preview-layout">
      <section className="conversation-graph-preview" aria-label="推論に使用する因果構造">
        <div className="conversation-graph-preview-heading">
          <div>
            <span>CAUSAL STRUCTURE</span>
            <h3>推論に使用する因果構造</h3>
            <p>
              対話を離れずに構造を確認できます。このプレビューではノード移動や
              エッジ編集は行いません。
            </p>
          </div>
          <div className="conversation-graph-preview-status">
            <span>
              {structureSource === "discovery"
                ? `探索 · ${discovery?.model_name ?? "Discovery"}`
                : "手動構造"}
            </span>
            <strong>{directedEdgeCount} directed</strong>
          </div>
        </div>

        <div className="conversation-graph-preview-canvas" aria-readonly="true">
          {structureSource === "discovery" ? (
            <GraphCanvas
              columns={columns}
              resultEdges={editedDiscoveryEdges}
              editable={false}
              layoutVersion={layoutVersion}
            />
          ) : (
            <GraphCanvas
              columns={columns}
              causalEdges={causalEdges}
              editable={false}
              layoutVersion={layoutVersion}
            />
          )}
        </div>

        <div className="conversation-graph-preview-footer">
          <p>
            {unresolvedDiscoveryEdges > 0
              ? `未方向エッジが${unresolvedDiscoveryEdges}件あります。推論前に方向を確定してください。`
              : "表示中の構造を保持したまま、対話で介入変数と結果変数を選択できます。"}
          </p>
          <button
            type="button"
            className="secondary"
            onClick={() => onOpenStep(structureSource === "discovery" ? "discovery" : "knowledge")}
          >
            {structureSource === "discovery" ? "Discovery画面で編集" : "Knowledge画面で編集"}
          </button>
        </div>
      </section>
      <div aria-hidden="true" />
    </div>
  );
}
