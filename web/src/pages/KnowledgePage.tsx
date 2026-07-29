import { useEffect, useState } from "react";
import GraphCanvas, { type EditableEdgeSelection } from "../components/GraphCanvas";
import { useWorkbench } from "../context/WorkbenchContext";
import type { EdgeMode, StructureSource } from "../types";

const MODE_COPY: Record<EdgeMode, { label: string; detail: string; icon: string }> = {
  causal: { label: "因果構造", detail: "手動推論にそのまま使う矢印", icon: "→" },
  required: { label: "必須エッジ", detail: "探索結果に残す既知方向", icon: "⇒" },
  forbidden: { label: "禁止エッジ", detail: "探索で認めない方向", icon: "×" },
};

const SOURCE_COPY: Record<StructureSource, { label: string; detail: string; icon: string }> = {
  manual: {
    label: "手動で定義",
    detail: "ここで作成したDAGを変更せず因果推論に使用します。",
    icon: "→",
  },
  discovery: {
    label: "因果探索を使用",
    detail: "事前知識を指定して探索し、得られた構造を編集して使用します。",
    icon: "◎",
  },
};

function toggle(values: string[], value: string): string[] {
  return values.includes(value) ? values.filter((item) => item !== value) : [...values, value];
}

function hasEdge(
  selection: EditableEdgeSelection,
  causalEdges: Array<{ source: string; target: string }>,
  requiredEdges: Array<{ source: string; target: string }>,
  forbiddenEdges: Array<{ source: string; target: string }>,
): boolean {
  const collection = selection.mode === "causal"
    ? causalEdges
    : selection.mode === "required"
      ? requiredEdges
      : forbiddenEdges;
  return collection.some(
    (edge) => edge.source === selection.edge.source && edge.target === selection.edge.target,
  );
}

export default function KnowledgePage() {
  const {
    dataset,
    selectedColumns,
    setSelectedColumns,
    structureSource,
    setStructureSource,
    edgeMode,
    setEdgeMode,
    causalEdges,
    requiredEdges,
    forbiddenEdges,
    forbiddenParents,
    forbiddenChildren,
    setForbiddenParents,
    setForbiddenChildren,
    addEdge,
    removeEdge,
    clearEdges,
    validation,
    setStep,
  } = useWorkbench();
  const [selectedNode, setSelectedNode] = useState<string | null>(null);
  const [selectedEdge, setSelectedEdge] = useState<EditableEdgeSelection | null>(null);
  const [layoutVersion, setLayoutVersion] = useState(0);

  useEffect(() => {
    if (structureSource === "discovery" && edgeMode === "causal") {
      setEdgeMode("required");
    }
  }, [structureSource, edgeMode, setEdgeMode]);

  useEffect(() => {
    if (!selectedEdge) return;
    if (
      (structureSource === "discovery" && selectedEdge.mode === "causal")
      || !hasEdge(selectedEdge, causalEdges, requiredEdges, forbiddenEdges)
    ) {
      setSelectedEdge(null);
    }
  }, [selectedEdge, structureSource, causalEdges, requiredEdges, forbiddenEdges]);

  useEffect(() => {
    if (selectedNode && !selectedColumns.includes(selectedNode)) setSelectedNode(null);
  }, [selectedNode, selectedColumns]);

  const visibleModes: EdgeMode[] = structureSource === "manual"
    ? ["causal", "required", "forbidden"]
    : ["required", "forbidden"];
  const canContinue = selectedColumns.length >= 2
    && validation?.valid !== false
    && (structureSource === "discovery" || causalEdges.length > 0);

  const deleteSelectedEdge = () => {
    if (!selectedEdge) return;
    removeEdge(selectedEdge.mode, selectedEdge.edge);
    setSelectedEdge(null);
  };

  const reverseSelectedEdge = () => {
    if (!selectedEdge) return;
    const reversed = {
      source: selectedEdge.edge.target,
      target: selectedEdge.edge.source,
    };
    removeEdge(selectedEdge.mode, selectedEdge.edge);
    addEdge(selectedEdge.mode, reversed);
    setSelectedEdge({ mode: selectedEdge.mode, edge: reversed });
  };

  return (
    <>
      <header className="section-header">
        <div>
          <span className="eyebrow">STEP 02 · KNOWLEDGE</span>
          <h2>因果構造の決め方と事前知識</h2>
          <p>手動構造をそのまま使うか、事前知識を与えて因果探索し、結果を編集して使うかを選択します。</p>
        </div>
        <span className={`status-chip ${validation?.valid ? "success" : validation ? "danger" : ""}`}>
          {validation ? (validation.valid ? "整合性OK" : `${validation.errors.length}件の矛盾`) : "確認中"}
        </span>
      </header>

      <section className="panel structure-source-panel">
        <div className="panel-title">
          <div><span>STRUCTURE SOURCE</span><h3>因果構造の決定方法</h3></div>
          <span className="status-chip">{structureSource === "manual" ? "Manual" : "Discovery"}</span>
        </div>
        <div className="source-switch structure-source-switch">
          {(Object.keys(SOURCE_COPY) as StructureSource[]).map((source) => (
            <button
              key={source}
              type="button"
              className={structureSource === source ? "active" : "secondary"}
              onClick={() => setStructureSource(source)}
            >
              <span>{SOURCE_COPY[source].icon}</span>
              <strong>{SOURCE_COPY[source].label}</strong>
              <small>{SOURCE_COPY[source].detail}</small>
            </button>
          ))}
        </div>
      </section>

      <section className="panel compact-panel">
        <div className="panel-title">
          <div><span>VARIABLES</span><h3>使用するカラム</h3></div>
          <strong>{selectedColumns.length} / {dataset?.columns.length ?? 0}</strong>
        </div>
        <div className="column-chip-list">
          {dataset?.columns.map((column) => (
            <label className={`column-chip ${selectedColumns.includes(column) ? "active" : ""}`} key={column}>
              <input
                type="checkbox"
                checked={selectedColumns.includes(column)}
                onChange={() => setSelectedColumns((current) => toggle(current, column))}
              />
              <span>{column}</span>
            </label>
          ))}
        </div>
      </section>

      <div className="knowledge-layout">
        <section className="panel graph-panel">
          <div className="graph-toolbar">
            <div className="edge-mode-switch" role="group" aria-label="エッジ編集モード">
              {visibleModes.map((mode) => (
                <button
                  key={mode}
                  type="button"
                  className={edgeMode === mode ? `active ${mode}` : "secondary"}
                  onClick={() => setEdgeMode(mode)}
                  title={MODE_COPY[mode].detail}
                >
                  <span>{MODE_COPY[mode].icon}</span>{MODE_COPY[mode].label}
                </button>
              ))}
            </div>
            <div className="toolbar-actions">
              <button type="button" className="secondary" onClick={() => setLayoutVersion((value) => value + 1)}>自動整列</button>
              <button
                type="button"
                className="secondary danger-text"
                onClick={() => {
                  clearEdges();
                  setSelectedEdge(null);
                }}
              >
                定義をクリア
              </button>
            </div>
          </div>
          <div className={`mode-guidance ${edgeMode}`}>
            <strong>{MODE_COPY[edgeMode].label}</strong>
            <span>{MODE_COPY[edgeMode].detail}</span>
          </div>
          <GraphCanvas
            columns={selectedColumns}
            causalEdges={structureSource === "manual" ? causalEdges : []}
            requiredEdges={requiredEdges}
            forbiddenEdges={forbiddenEdges}
            forbiddenParents={forbiddenParents}
            forbiddenChildren={forbiddenChildren}
            mode={edgeMode}
            layoutVersion={layoutVersion}
            onAddEdge={addEdge}
            onRemoveEdge={removeEdge}
            onNodeSelect={setSelectedNode}
            onEditableEdgeSelect={setSelectedEdge}
          />
          <div className="graph-legend">
            {structureSource === "manual" && <span className="causal">— 手動構造</span>}
            <span className="required">━ 必須</span>
            <span className="forbidden">┄ 禁止</span>
            <small>エッジをクリックすると、右側で削除・方向反転できます。</small>
          </div>
        </section>

        <aside className="knowledge-side">
          <section className="panel edge-settings-panel">
            <div className="panel-title">
              <div><span>EDGE EDITOR</span><h3>エッジ操作</h3></div>
            </div>
            {selectedEdge ? (
              <>
                <div className={`selected-edge-definition ${selectedEdge.mode}`}>
                  <small>{MODE_COPY[selectedEdge.mode].label}</small>
                  <strong>
                    <span>{selectedEdge.edge.source}</span>
                    <b>→</b>
                    <span>{selectedEdge.edge.target}</span>
                  </strong>
                </div>
                <div className="edge-action-grid">
                  <button type="button" className="secondary" onClick={reverseSelectedEdge}>方向を反転</button>
                  <button type="button" className="secondary danger-text" onClick={deleteSelectedEdge}>このエッジを削除</button>
                </div>
              </>
            ) : (
              <div className="empty-state">キャンバス上のエッジをクリックすると、個別に方向変更や削除ができます。</div>
            )}
          </section>

          <section className="panel node-settings-panel">
            <div className="panel-title">
              <div><span>NODE POLICY</span><h3>ノード制約</h3></div>
            </div>
            {selectedNode ? (
              <>
                <div className="selected-node-name"><small>選択中</small><strong>{selectedNode}</strong></div>
                <label className="setting-check">
                  <input
                    type="checkbox"
                    checked={forbiddenParents.includes(selectedNode)}
                    onChange={() => setForbiddenParents((current) => toggle(current, selectedNode))}
                  />
                  <span><strong>原因にしない</strong><small>このノードから出る方向を禁止</small></span>
                </label>
                <label className="setting-check">
                  <input
                    type="checkbox"
                    checked={forbiddenChildren.includes(selectedNode)}
                    onChange={() => setForbiddenChildren((current) => toggle(current, selectedNode))}
                  />
                  <span><strong>結果にしない</strong><small>このノードへ入る方向を禁止</small></span>
                </label>
              </>
            ) : (
              <div className="empty-state">キャンバス上のノードをクリックすると、ノード単位の制約を設定できます。</div>
            )}
          </section>

          <section className="panel validation-panel">
            <div className="panel-title"><div><span>VALIDATION</span><h3>整合性チェック</h3></div></div>
            {!validation && <p className="settings-note">FastAPIで確認しています...</p>}
            {validation?.valid && !validation.warnings.length && (
              <div className="validation-success"><span>✓</span><strong>矛盾はありません</strong></div>
            )}
            {!!validation?.errors.length && (
              <ul className="validation-list error-list">
                {validation.errors.map((message) => <li key={message}>{message}</li>)}
              </ul>
            )}
            {!!validation?.warnings.length && (
              <ul className="validation-list warning-list">
                {validation.warnings.map((message) => <li key={message}>{message}</li>)}
              </ul>
            )}
          </section>

          <section className="panel edge-summary-panel">
            <div className="panel-title"><div><span>EDGE SUMMARY</span><h3>定義数</h3></div></div>
            <div className="metric-grid compact">
              <div className="metric"><small>手動構造</small><strong>{causalEdges.length}</strong></div>
              <div className="metric"><small>必須</small><strong>{requiredEdges.length}</strong></div>
              <div className="metric"><small>禁止</small><strong>{forbiddenEdges.length}</strong></div>
            </div>
            <button
              type="button"
              className="primary-action knowledge-next-action"
              disabled={!canContinue}
              onClick={() => setStep(structureSource === "manual" ? "inference" : "discovery")}
            >
              {structureSource === "manual" ? "手動構造で推論へ" : "因果探索の設定へ"}
            </button>
          </section>
        </aside>
      </div>
    </>
  );
}
