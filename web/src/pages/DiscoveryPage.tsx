import { useState } from "react";
import GraphCanvas from "../components/GraphCanvas";
import { graphEdgesToMatrix, useWorkbench } from "../context/WorkbenchContext";
import type { AlgorithmName } from "../types";

const ALGORITHMS: Array<{
  id: AlgorithmName;
  label: string;
  detail: string;
  backend: string;
}> = [
  { id: "PC", label: "PC", detail: "条件付き独立性検定に基づく構造探索", backend: "gCastle" },
  { id: "DirectLiNGAM", label: "DirectLiNGAM", detail: "線形・非ガウス仮定による方向推定", backend: "gCastle" },
  { id: "GES", label: "GES", detail: "スコアベースの貪欲探索", backend: "pgmpy" },
  { id: "HillClimbSearch", label: "Hill Climb", detail: "局所探索によるDAG推定", backend: "pgmpy" },
];

function toggle(values: string[], value: string): string[] {
  return values.includes(value) ? values.filter((item) => item !== value) : [...values, value];
}

export default function DiscoveryPage() {
  const {
    dataset,
    selectedColumns,
    structureSource,
    modelName,
    setModelName,
    scale,
    setScale,
    categoricalColumns,
    setCategoricalColumns,
    forbiddenParents,
    forbiddenChildren,
    forbiddenEdges,
    requiredEdges,
    validation,
    discovery,
    editedDiscoveryEdges,
    discoveryValidation,
    discoveryChanged,
    unresolvedDiscoveryEdges,
    addDiscoveryEdge,
    removeDiscoveryEdge,
    resetDiscoveryGraph,
    runDiscovery,
    setStep,
  } = useWorkbench();
  const [layoutVersion, setLayoutVersion] = useState(0);
  const categoryEnabled = modelName === "GES" || modelName === "HillClimbSearch";
  const directedCount = editedDiscoveryEdges.filter((edge) => edge.kind === "directed").length;
  const editedMatrix = discovery
    ? graphEdgesToMatrix(discovery.columns, editedDiscoveryEdges)
    : [];
  const canAdopt = Boolean(
    discovery
    && directedCount > 0
    && unresolvedDiscoveryEdges === 0
    && discoveryValidation?.valid !== false,
  );

  return (
    <>
      <header className="section-header">
        <div>
          <span className="eyebrow">STEP 03 · DISCOVERY</span>
          <h2>因果探索と最終構造の編集</h2>
          <p>探索結果を初期案として表示し、不要な辺の削除、方向変更、辺の追加を行って最終構造を確定します。</p>
        </div>
        <span className={`status-chip ${discoveryValidation?.valid ? "success" : discovery ? "warning" : ""}`}>
          {!discovery
            ? "未実行"
            : discoveryValidation?.valid
              ? "最終構造OK"
              : `${unresolvedDiscoveryEdges}件未確定`}
        </span>
      </header>

      {structureSource !== "discovery" && (
        <section className="panel structure-route-note">
          <div>
            <span className="eyebrow">MANUAL STRUCTURE SELECTED</span>
            <h3>現在は手動構造を使用する設定です</h3>
            <p>因果探索を利用する場合は、Knowledge画面で構造の決定方法を切り替えてください。</p>
          </div>
          <button type="button" onClick={() => setStep("knowledge")}>Knowledgeへ戻る</button>
        </section>
      )}

      <div className="discovery-layout">
        <section className="panel discovery-settings">
          <div className="panel-title"><div><span>ALGORITHM</span><h3>探索手法</h3></div></div>
          <div className="algorithm-grid">
            {ALGORITHMS.map((algorithm) => (
              <button
                key={algorithm.id}
                type="button"
                className={`algorithm-card ${modelName === algorithm.id ? "active" : ""}`}
                onClick={() => setModelName(algorithm.id)}
                disabled={structureSource !== "discovery"}
              >
                <span>{algorithm.backend}</span>
                <strong>{algorithm.label}</strong>
                <small>{algorithm.detail}</small>
              </button>
            ))}
          </div>

          <div className="settings-block">
            <div className="settings-title"><span>PREPROCESSING</span><strong>前処理</strong></div>
            <label className="setting-check horizontal">
              <input
                type="checkbox"
                checked={scale}
                onChange={(event) => setScale(event.target.checked)}
                disabled={structureSource !== "discovery"}
              />
              <span><strong>数値変数を標準化</strong><small>探索前にStandardScalerを適用します。</small></span>
            </label>
          </div>

          {categoryEnabled && (
            <div className="settings-block">
              <div className="settings-title"><span>CATEGORICAL</span><strong>カテゴリ変数</strong></div>
              <div className="column-chip-list">
                {selectedColumns.map((column) => (
                  <label className={`column-chip ${categoricalColumns.includes(column) ? "active" : ""}`} key={column}>
                    <input
                      type="checkbox"
                      checked={categoricalColumns.includes(column)}
                      onChange={() => setCategoricalColumns((current) => toggle(current, column))}
                      disabled={structureSource !== "discovery"}
                    />
                    <span>{column}</span>
                  </label>
                ))}
              </div>
            </div>
          )}

          <div className="constraint-summary">
            <div><span>使用データ</span><strong>{dataset?.filename ?? "—"}</strong></div>
            <div><span>ノード</span><strong>{selectedColumns.length}</strong></div>
            <div><span>必須エッジ</span><strong>{requiredEdges.length}</strong></div>
            <div><span>禁止エッジ</span><strong>{forbiddenEdges.length}</strong></div>
            <div><span>原因にしない</span><strong>{forbiddenParents.length}</strong></div>
            <div><span>結果にしない</span><strong>{forbiddenChildren.length}</strong></div>
          </div>

          <button
            type="button"
            className="primary-action"
            disabled={structureSource !== "discovery" || selectedColumns.length < 2 || validation?.valid === false}
            onClick={() => void runDiscovery()}
          >
            {discovery ? "条件を反映して再探索" : "因果構造を探索"}
          </button>
          {validation?.valid === false && (
            <p className="inline-warning">Knowledge画面の矛盾を解消してから実行してください。</p>
          )}
        </section>

        <section className="panel discovery-result-panel">
          <div className="panel-title discovery-editor-title">
            <div><span>FINAL GRAPH EDITOR</span><h3>探索結果を編集</h3></div>
            <div className="editor-status-group">
              {discoveryChanged && <span className="status-chip warning">編集済み</span>}
              {discovery && <span className="status-chip success">{discovery.backend}</span>}
            </div>
          </div>
          {discovery ? (
            <>
              <div className="graph-toolbar discovery-editor-toolbar">
                <div className="mode-guidance causal">
                  <strong>最終因果構造</strong>
                  <span>未方向辺に矢印を引くと、その方向の有向辺へ置き換わります。</span>
                </div>
                <div className="toolbar-actions">
                  <button type="button" className="secondary" onClick={() => setLayoutVersion((value) => value + 1)}>自動整列</button>
                  <button type="button" className="secondary" disabled={!discoveryChanged} onClick={resetDiscoveryGraph}>探索結果へ戻す</button>
                </div>
              </div>
              <GraphCanvas
                columns={discovery.columns}
                resultEdges={editedDiscoveryEdges}
                forbiddenParents={forbiddenParents}
                forbiddenChildren={forbiddenChildren}
                editable
                layoutVersion={layoutVersion}
                onAddResultEdge={addDiscoveryEdge}
                onRemoveResultEdge={removeDiscoveryEdge}
              />
              <div className="graph-legend discovery-edit-legend">
                <span className="causal">— 有向辺</span>
                <span className="undirected">┄ 未方向辺</span>
                <small>辺を選択してDeleteで削除し、ノード間をドラッグして矢印を追加できます。</small>
              </div>
              <div className="result-summary-row">
                <div><small>Directed</small><strong>{directedCount}</strong></div>
                <div><small>Undirected</small><strong>{unresolvedDiscoveryEdges}</strong></div>
                <div><small>State</small><strong>{discoveryChanged ? "Edited" : "Original"}</strong></div>
              </div>

              <section className={`embedded-validation ${discoveryValidation?.valid ? "valid" : "invalid"}`}>
                <div>
                  <span>FINAL GRAPH VALIDATION</span>
                  <strong>{discoveryValidation?.valid ? "推論に使用できます" : "構造の修正が必要です"}</strong>
                </div>
                {!discoveryValidation && <p>FastAPIで確認しています...</p>}
                {!!discoveryValidation?.errors.length && (
                  <ul className="validation-list error-list">
                    {discoveryValidation.errors.map((message) => <li key={message}>{message}</li>)}
                  </ul>
                )}
                {!!discoveryValidation?.warnings.length && (
                  <ul className="validation-list warning-list">
                    {discoveryValidation.warnings.map((message) => <li key={message}>{message}</li>)}
                  </ul>
                )}
              </section>

              <button
                type="button"
                className="primary-action adopt-graph-action"
                disabled={!canAdopt}
                onClick={() => setStep("inference")}
              >
                この最終構造を採用して推論へ
              </button>

              <details className="matrix-details">
                <summary>編集後の隣接行列を確認</summary>
                <div className="matrix-wrap">
                  <table className="matrix-table">
                    <thead><tr><th>from \ to</th>{discovery.columns.map((column) => <th key={column}>{column}</th>)}</tr></thead>
                    <tbody>
                      {editedMatrix.map((row, rowIndex) => (
                        <tr key={discovery.columns[rowIndex]}>
                          <th>{discovery.columns[rowIndex]}</th>
                          {row.map((value, columnIndex) => <td key={`${rowIndex}-${columnIndex}`}>{Number(value).toPrecision(3)}</td>)}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </details>
            </>
          ) : (
            <div className="result-empty">
              <div>◎</div>
              <strong>探索結果はまだありません</strong>
              <p>左側でアルゴリズムを選び、因果構造を探索してください。結果はこの画面で編集できます。</p>
            </div>
          )}
        </section>
      </div>
    </>
  );
}
