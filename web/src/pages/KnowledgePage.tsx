import { useState } from "react";
import GraphCanvas from "../components/GraphCanvas";
import { useWorkbench } from "../context/WorkbenchContext";
import type { EdgeMode } from "../types";

const MODE_COPY: Record<EdgeMode, { label: string; detail: string; icon: string }> = {
  causal: { label: "因果構造", detail: "手動推論に使う仮定の矢印", icon: "→" },
  required: { label: "必須エッジ", detail: "探索時に優先する既知方向", icon: "⇒" },
  forbidden: { label: "禁止エッジ", detail: "探索で認めない方向", icon: "×" },
};

function toggle(values: string[], value: string): string[] {
  return values.includes(value) ? values.filter((item) => item !== value) : [...values, value];
}

export default function KnowledgePage() {
  const {
    dataset,
    selectedColumns,
    setSelectedColumns,
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
  } = useWorkbench();
  const [selectedNode, setSelectedNode] = useState<string | null>(null);
  const [layoutVersion, setLayoutVersion] = useState(0);

  return (
    <>
      <header className="section-header">
        <div>
          <span className="eyebrow">STEP 02 · KNOWLEDGE</span>
          <h2>因果構造と事前知識を編集</h2>
          <p>ノード右側のハンドルから別ノードへドラッグし、現在の編集モードに対応する矢印を作成します。</p>
        </div>
        <span className={`status-chip ${validation?.valid ? "success" : validation ? "danger" : ""}`}>
          {validation ? (validation.valid ? "整合性OK" : `${validation.errors.length}件の矛盾`) : "確認中"}
        </span>
      </header>

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
              {(Object.keys(MODE_COPY) as EdgeMode[]).map((mode) => (
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
              <button type="button" className="secondary danger-text" onClick={clearEdges}>矢印をクリア</button>
            </div>
          </div>
          <div className={`mode-guidance ${edgeMode}`}>
            <strong>{MODE_COPY[edgeMode].label}</strong>
            <span>{MODE_COPY[edgeMode].detail}</span>
          </div>
          <GraphCanvas
            columns={selectedColumns}
            causalEdges={causalEdges}
            requiredEdges={requiredEdges}
            forbiddenEdges={forbiddenEdges}
            forbiddenParents={forbiddenParents}
            forbiddenChildren={forbiddenChildren}
            mode={edgeMode}
            layoutVersion={layoutVersion}
            onAddEdge={addEdge}
            onRemoveEdge={removeEdge}
            onNodeSelect={setSelectedNode}
          />
          <div className="graph-legend">
            <span className="causal">— 仮定</span>
            <span className="required">━ 必須</span>
            <span className="forbidden">┄ 禁止</span>
            <small>矢印を選択してDeleteキーで削除できます。</small>
          </div>
        </section>

        <aside className="knowledge-side">
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
              <div className="metric"><small>仮定</small><strong>{causalEdges.length}</strong></div>
              <div className="metric"><small>必須</small><strong>{requiredEdges.length}</strong></div>
              <div className="metric"><small>禁止</small><strong>{forbiddenEdges.length}</strong></div>
            </div>
          </section>
        </aside>
      </div>
    </>
  );
}
