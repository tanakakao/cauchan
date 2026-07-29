import { useEffect, useMemo, useState } from "react";
import GraphCanvas from "../components/GraphCanvas";
import { edgesToMatrix, useWorkbench } from "../context/WorkbenchContext";
import type { InferenceMethod, InferenceSource } from "../types";

export default function InferencePage() {
  const {
    selectedColumns,
    causalEdges,
    discovery,
    inference,
    runInference,
  } = useWorkbench();
  const [source, setSource] = useState<InferenceSource>(discovery ? "discovery" : "manual");
  const [factor1, setFactor1] = useState("");
  const [factor2, setFactor2] = useState("");
  const [method, setMethod] = useState<InferenceMethod>("LinearDML");

  const columns = source === "discovery" ? discovery?.columns ?? [] : selectedColumns;
  const ready = source === "discovery" ? Boolean(discovery) : causalEdges.length > 0;

  useEffect(() => {
    if (!columns.includes(factor1)) setFactor1(columns[0] ?? "");
    if (!columns.includes(factor2) || factor2 === factor1) {
      setFactor2(columns.find((column) => column !== factor1) ?? "");
    }
  }, [columns, factor1, factor2]);

  const displayEdges = useMemo(() => {
    if (source === "discovery") return discovery?.edges;
    return causalEdges.map((edge) => ({ ...edge, kind: "directed" as const, weight: 1 }));
  }, [source, discovery, causalEdges]);

  const hasManualCycleHint = source === "manual" && causalEdges.length > 0
    ? edgesToMatrix(selectedColumns, causalEdges).some((row, index) => row[index] !== 0)
    : false;

  return (
    <>
      <header className="section-header">
        <div>
          <span className="eyebrow">STEP 04 · INFERENCE</span>
          <h2>因果効果を推定</h2>
          <p>factor1を介入変数、factor2を結果変数として平均因果効果を推定します。</p>
        </div>
        <span className={`status-chip ${inference ? "success" : ""}`}>
          {inference ? "推定済み" : "未実行"}
        </span>
      </header>

      <div className="inference-layout">
        <section className="panel inference-settings">
          <div className="panel-title"><div><span>GRAPH SOURCE</span><h3>推論に使う構造</h3></div></div>
          <div className="source-switch">
            <button
              type="button"
              className={source === "discovery" ? "active" : "secondary"}
              disabled={!discovery}
              onClick={() => setSource("discovery")}
            >
              <span>◎</span><strong>探索結果</strong><small>{discovery ? discovery.model_name : "未実行"}</small>
            </button>
            <button
              type="button"
              className={source === "manual" ? "active" : "secondary"}
              disabled={!causalEdges.length}
              onClick={() => setSource("manual")}
            >
              <span>→</span><strong>手動構造</strong><small>{causalEdges.length} edges</small>
            </button>
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

          {hasManualCycleHint && <p className="inline-warning">自己ループを含む手動構造は利用できません。</p>}
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
            <div><span>CAUSAL GRAPH</span><h3>{source === "discovery" ? "探索構造" : "手動構造"}</h3></div>
          </div>
          {ready ? (
            <GraphCanvas columns={columns} resultEdges={displayEdges} editable={false} />
          ) : (
            <div className="result-empty"><div>→</div><strong>利用可能な構造がありません</strong><p>因果探索を実行するか、Knowledge画面で因果構造を定義してください。</p></div>
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
            <div><span>Graph</span><strong>{inference.discovery_id ? "Discovery" : "Manual"}</strong></div>
            <div><span>Unit</span><strong>factor2 / factor1</strong></div>
          </div>
        </section>
      )}
    </>
  );
}
