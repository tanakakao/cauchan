import GraphCanvas from "../components/GraphCanvas";
import { useWorkbench } from "../context/WorkbenchContext";
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
    runDiscovery,
  } = useWorkbench();
  const categoryEnabled = modelName === "GES" || modelName === "HillClimbSearch";

  return (
    <>
      <header className="section-header">
        <div>
          <span className="eyebrow">STEP 03 · DISCOVERY</span>
          <h2>因果構造を探索</h2>
          <p>アルゴリズムと事前知識を指定し、データから因果構造候補を推定します。</p>
        </div>
        <span className={`status-chip ${discovery ? "success" : ""}`}>
          {discovery ? `${discovery.model_name} 完了` : "未実行"}
        </span>
      </header>

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
              <input type="checkbox" checked={scale} onChange={(event) => setScale(event.target.checked)} />
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
            disabled={selectedColumns.length < 2 || validation?.valid === false}
            onClick={() => void runDiscovery()}
          >
            因果構造を探索
          </button>
          {validation?.valid === false && (
            <p className="inline-warning">Knowledge画面の矛盾を解消してから実行してください。</p>
          )}
        </section>

        <section className="panel discovery-result-panel">
          <div className="panel-title">
            <div><span>DISCOVERY RESULT</span><h3>探索結果</h3></div>
            {discovery && <span className="status-chip success">{discovery.backend}</span>}
          </div>
          {discovery ? (
            <>
              <GraphCanvas
                columns={discovery.columns}
                resultEdges={discovery.edges}
                editable={false}
              />
              <div className="result-summary-row">
                <div><small>Directed</small><strong>{discovery.edges.filter((edge) => edge.kind === "directed").length}</strong></div>
                <div><small>Undirected</small><strong>{discovery.edges.filter((edge) => edge.kind === "undirected").length}</strong></div>
                <div><small>Discovery ID</small><strong title={discovery.discovery_id}>{discovery.discovery_id.slice(0, 8)}</strong></div>
              </div>
              <details className="matrix-details">
                <summary>隣接行列を確認</summary>
                <div className="matrix-wrap">
                  <table className="matrix-table">
                    <thead><tr><th>from \ to</th>{discovery.columns.map((column) => <th key={column}>{column}</th>)}</tr></thead>
                    <tbody>
                      {discovery.causal_matrix.map((row, rowIndex) => (
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
              <p>左側でアルゴリズムを選び、因果構造を探索してください。</p>
            </div>
          )}
        </section>
      </div>
    </>
  );
}
