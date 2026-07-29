import { useEffect, useMemo, useState } from "react";
import GraphCanvas from "../components/GraphCanvas";
import { useWorkbench } from "../context/WorkbenchContext";
import type { GraphEdgeResponse, InferenceMethod, InferenceSource } from "../types";

export default function InferencePage() {
  const {
    selectedColumns,
    structureSource,
    setStructureSource,
    causalEdges,
    validation,
    discovery,
    editedDiscoveryEdges,
    discoveryValidation,
    unresolvedDiscoveryEdges,
    inference,
    runInference,
  } = useWorkbench();
  const source: InferenceSource = structureSource;
  const [factor1, setFactor1] = useState("");
  const [factor2, setFactor2] = useState("");
  const [method, setMethod] = useState<InferenceMethod>("LinearDML");

  const columns = source === "discovery" ? discovery?.columns ?? [] : selectedColumns;
  const displayEdges = useMemo<GraphEdgeResponse[]>(() => (
    source === "discovery"
      ? editedDiscoveryEdges
      : causalEdges.map((edge) => ({ ...edge, kind: "directed", weight: 1 }))
  ), [source, editedDiscoveryEdges, causalEdges]);
  const sourceValidation = source === "discovery" ? discoveryValidation : validation;
  const directedCount = displayEdges.filter((edge) => edge.kind === "directed").length;
  const ready = Boolean(
    directedCount > 0
    && sourceValidation?.valid !== false
    && (source === "manual" || (discovery && unresolvedDiscoveryEdges === 0)),
  );

  useEffect(() => {
    if (!columns.includes(factor1)) setFactor1(columns[0] ?? "");
    if (!columns.includes(factor2) || factor2 === factor1) {
      setFactor2(columns.find((column) => column !== factor1) ?? "");
    }
  }, [columns, factor1, factor2]);

  return (
    <>
      <header className="section-header">
        <div>
          <span className="eyebrow">STEP 04 · INFERENCE</span>
          <h2>最終因果構造で因果効果を推定</h2>
          <p>手動構造、または探索後に編集した最終構造を使い、factor1からfactor2への平均因果効果を推定します。</p>
        </div>
        <span className={`status-chip ${inference ? "success" : ""}`}>
          {inference ? "推定済み" : "未実行"}
        </span>
      </header>

      <div className="inference-layout">
        <section className="panel inference-settings">
          <div className="panel-title"><div><span>FINAL GRAPH SOURCE</span><h3>推論に使う構造</h3></div></div>
          <div className="source-switch">
            <button
              type="button"
              className={source === "manual" ? "active" : "secondary"}
              disabled={!causalEdges.length}
              onClick={() => setStructureSource("manual")}
            >
              <span>→</span><strong>手動構造</strong><small>{causalEdges.length} edges · Knowledgeで定義</small>
            </button>
            <button
              type="button"
              className={source === "discovery" ? "active" : "secondary"}
              disabled={!discovery}
              onClick={() => setStructureSource("discovery")}
            >
              <span>◎</span><strong>探索後編集構造</strong><small>{discovery ? `${directedCount} directed` : "未実行"}</small>
            </button>
          </div>

          <div className={`selected-structure-summary ${ready ? "ready" : "not-ready"}`}>
            <div>
              <span>SELECTED STRUCTURE</span>
              <strong>{source === "manual" ? "手動定義をそのまま使用" : "探索結果を編集した最終構造"}</strong>
            </div>
            <span className={`status-chip ${ready ? "success" : "warning"}`}>
              {ready ? "推論可能" : "要確認"}
            </span>
          </div>

          <div className="form-grid">
            <label>
              <span>factor1 · 介入変数</span>
              <select value={factor1} onChange={(event) => setFactor1(event.target.value)}>
                {columns.map((column) => <option key={column} value={column}>{column}</option>)}
              </select>
            </label>
            <div className="direction-arrow">→</div>
            <label>
              <span>factor2 · 結果変数</span>
              <select value={factor2} onChange={(event) => setFactor2(event.target.value)}>
                {columns.filter((column) => column !== factor1).map((column) => (
                  <option key={column} value={column}>{column}</option>
                ))}
              </select>
            </label>
          </div>

          <div className="settings-block">
            <div className="settings-title"><span>ESTIMATOR</span><strong>推定手法</strong></div>
            <div className="method-cards">
              <button type="button" className={method === "LinearDML" ? "active" : "secondary"} onClick={() => setMethod("LinearDML")}>
                <strong>LinearDML</strong><small>機械学習で交絡を調整</small>
              </button>
              <button type="button" className={method === "SCM" ? "active" : "secondary"} onClick={() => setMethod("SCM")}>
                <strong>SCM</strong><small>線形回帰による推定</small>
              </button>
            </div>
          </div>

          {source === "discovery" && unresolvedDiscoveryEdges > 0 && (
            <p className="inline-warning">Discovery画面で未方向エッジ{unresolvedDiscoveryEdges}件の方向を確定してください。</p>
          )}
          {!!sourceValidation?.errors.length && (
            <ul className="validation-list error-list inference-validation-list">
              {sourceValidation.errors.map((message) => <li key={message}>{message}</li>)}
            </ul>
          )}
          <button
            type="button"
            className="primary-action"
            disabled={!ready || !factor1 || !factor2 || factor1 === factor2}
            onClick={() => void runInference(factor1, factor2, method, source)}
          >
            {factor1 || "factor1"} → {factor2 || "factor2"} の効果を推定
          </button>
        </section>

        <section className="panel inference-graph-panel">
          <div className="panel-title">
            <div>
              <span>FINAL CAUSAL GRAPH</span>
              <h3>{source === "manual" ? "手動構造" : "探索後編集構造"}</h3>
            </div>
            <span className={`status-chip ${ready ? "success" : "warning"}`}>{directedCount} edges</span>
          </div>
          {displayEdges.length ? (
            <GraphCanvas columns={columns} resultEdges={displayEdges} editable={false} />
          ) : (
            <div className="result-empty">
              <div>→</div>
              <strong>利用可能な構造がありません</strong>
              <p>Knowledge画面で手動構造を作成するか、Discovery画面で探索結果を編集してください。</p>
            </div>
          )}
        </section>
      </div>

      {inference && (
        <section className="panel inference-result">
          <div className="inference-result-main">
            <span>AVERAGE CAUSAL EFFECT</span>
            <div className="effect-direction"><strong>{inference.factor1}</strong><i>→</i><strong>{inference.factor2}</strong></div>
            <div className="effect-value">{Number(inference.effect).toPrecision(7)}</div>
            <p>{inference.interpretation}</p>
          </div>
          <div className="inference-result-meta">
            <div><span>Method</span><strong>{inference.method}</strong></div>
            <div><span>Graph</span><strong>{source === "manual" ? "Manual" : "Discovery + Edit"}</strong></div>
            <div><span>Unit</span><strong>factor2 / factor1</strong></div>
          </div>
        </section>
      )}
    </>
  );
}
