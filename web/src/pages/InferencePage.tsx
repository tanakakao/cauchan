import { useEffect, useMemo, useState, type CSSProperties } from "react";
import { api } from "../api";
import GraphCanvas from "../components/GraphCanvas";
import { edgesToMatrix, useWorkbench } from "../context/WorkbenchContext";
import type {
  BatchInferenceResponse,
  BatchInferenceResult,
  GraphEdgeResponse,
  InferenceMethod,
  InferenceSource,
} from "../types";

type ResultView = "list" | "heatmap";

type MethodOption = {
  id: InferenceMethod;
  label: string;
  detail: string;
};

const METHODS: MethodOption[] = [
  {
    id: "SCM",
    label: "Linear SCM",
    detail: "モデル層で親変数を調整する線形回帰",
  },
  {
    id: "DoWhyLinearRegression",
    label: "DoWhy Linear",
    detail: "DoWhyで識別して線形回帰",
  },
  {
    id: "LinearDML",
    label: "LinearDML",
    detail: "DoWhy + EconMLで交絡を調整",
  },
  {
    id: "CausalForestDML",
    label: "CausalForestDML",
    detail: "EconMLで異質的効果を学習",
  },
];

function pairKey(factor1: string, factor2: string): string {
  return `${factor1}\u0000${factor2}`;
}

function formatEffect(effect: number | null): string {
  if (effect === null || !Number.isFinite(effect)) return "—";
  if (effect === 0) return "0";
  return Math.abs(effect) >= 1000 || Math.abs(effect) < 0.001
    ? effect.toExponential(3)
    : effect.toPrecision(5);
}

function heatCellStyle(effect: number, maxAbsEffect: number): CSSProperties {
  const ratio = maxAbsEffect > 0 ? Math.min(Math.abs(effect) / maxAbsEffect, 1) : 0;
  const alpha = 0.12 + ratio * 0.78;
  return {
    backgroundColor: effect >= 0
      ? `rgba(37, 99, 235, ${alpha})`
      : `rgba(217, 45, 32, ${alpha})`,
    color: ratio > 0.52 ? "#ffffff" : "var(--text)",
  };
}

export default function InferencePage() {
  const {
    dataset,
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
    setError,
  } = useWorkbench();
  const source: InferenceSource = structureSource;
  const [factor1, setFactor1] = useState("");
  const [factor2, setFactor2] = useState("");
  const [method, setMethod] = useState<InferenceMethod>("LinearDML");
  const [batchInference, setBatchInference] = useState<BatchInferenceResponse | null>(null);
  const [batchBusy, setBatchBusy] = useState(false);
  const [resultView, setResultView] = useState<ResultView>("list");

  const columns = source === "discovery" ? discovery?.columns ?? [] : selectedColumns;
  const displayEdges = useMemo<GraphEdgeResponse[]>(() => (
    source === "discovery"
      ? editedDiscoveryEdges
      : causalEdges.map((edge) => ({ ...edge, kind: "directed", weight: 1 }))
  ), [source, editedDiscoveryEdges, causalEdges]);
  const directedEdges = useMemo(
    () => displayEdges
      .filter((edge) => edge.kind === "directed")
      .map(({ source: edgeSource, target }) => ({ source: edgeSource, target })),
    [displayEdges],
  );
  const sourceValidation = source === "discovery" ? discoveryValidation : validation;
  const directedCount = directedEdges.length;
  const ready = Boolean(
    directedCount > 0
    && sourceValidation?.valid !== false
    && (source === "manual" || (discovery && unresolvedDiscoveryEdges === 0)),
  );
  const graphSignature = useMemo(
    () => directedEdges.map((edge) => `${edge.source}->${edge.target}`).sort().join("|"),
    [directedEdges],
  );
  const resultMap = useMemo(
    () => new Map(
      (batchInference?.results ?? []).map((result) => [
        pairKey(result.factor1, result.factor2),
        result,
      ]),
    ),
    [batchInference],
  );
  const maxAbsEffect = useMemo(
    () => Math.max(
      0,
      ...(batchInference?.results ?? [])
        .filter((result): result is BatchInferenceResult & { effect: number } => result.effect !== null)
        .map((result) => Math.abs(result.effect)),
    ),
    [batchInference],
  );

  useEffect(() => {
    if (!columns.includes(factor1)) setFactor1(columns[0] ?? "");
    if (!columns.includes(factor2) || factor2 === factor1) {
      setFactor2(columns.find((column) => column !== factor1) ?? "");
    }
  }, [columns, factor1, factor2]);

  useEffect(() => {
    setBatchInference(null);
  }, [source, method, graphSignature]);

  const runBatchInference = async () => {
    if (!dataset || !ready || !directedEdges.length) return;
    setBatchBusy(true);
    setError(null);
    try {
      const result = await api.inferBatch({
        dataset_id: dataset.dataset_id,
        method,
        columns,
        causal_matrix: edgesToMatrix(columns, directedEdges),
      });
      setBatchInference(result);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : String(requestError));
    } finally {
      setBatchBusy(false);
    }
  };

  return (
    <>
      <header className="section-header">
        <div>
          <span className="eyebrow">STEP 04 · INFERENCE</span>
          <h2>最終因果構造で因果効果を推定</h2>
          <p>個別の変数ペア、または最終構造に含まれる全有向エッジの因果効果を推定します。</p>
        </div>
        <span className={`status-chip ${inference || batchInference ? "success" : ""}`}>
          {inference || batchInference ? "推定済み" : "未実行"}
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
            <div className="method-cards inference-method-cards">
              {METHODS.map((option) => (
                <button
                  key={option.id}
                  type="button"
                  className={method === option.id ? "active" : "secondary"}
                  onClick={() => setMethod(option.id)}
                >
                  <strong>{option.label}</strong>
                  <small>{option.detail}</small>
                </button>
              ))}
            </div>
            {method === "SCM" && (
              <p className="estimator-note">DoWhyを使わず、DAG上の介入変数の親を調整する線形SCMです。</p>
            )}
            {method === "DoWhyLinearRegression" && (
              <p className="estimator-note">NetworkXのDAGをDoWhyへ直接渡し、識別後にbackdoor linear regressionを実行します。</p>
            )}
            {method === "CausalForestDML" && (
              <p className="estimator-note warning">介入変数の非子孫となるベースライン変数が1列以上、データが20行以上必要です。表示値は個別効果の平均です。</p>
            )}
          </div>

          {source === "discovery" && unresolvedDiscoveryEdges > 0 && (
            <p className="inline-warning">Discovery画面で未方向エッジ{unresolvedDiscoveryEdges}件の方向を確定してください。</p>
          )}
          {!!sourceValidation?.errors.length && (
            <ul className="validation-list error-list inference-validation-list">
              {sourceValidation.errors.map((message) => <li key={message}>{message}</li>)}
            </ul>
          )}
          {!!sourceValidation?.warnings.length && (
            <ul className="validation-list warning-list inference-validation-list">
              {sourceValidation.warnings.map((message) => <li key={message}>{message}</li>)}
            </ul>
          )}

          <div className="inference-action-stack">
            <button
              type="button"
              className="primary-action"
              disabled={!ready || batchBusy || !factor1 || !factor2 || factor1 === factor2}
              onClick={() => void runInference(factor1, factor2, method, source)}
            >
              {factor1 || "factor1"} → {factor2 || "factor2"} の効果を推定
            </button>
            <button
              type="button"
              className="primary-action secondary batch-inference-action"
              disabled={!ready || batchBusy}
              onClick={() => void runBatchInference()}
            >
              {batchBusy ? "全エッジを推定中..." : `有効な全${directedCount}エッジを一括推定`}
            </button>
            <small className="action-note">一括推定は最終構造に存在する有向エッジのみを対象にします。CausalForestDMLはエッジ数に応じて計算時間が増加します。</small>
          </div>
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

      {batchInference && (
        <section className="panel batch-inference-result">
          <div className="panel-title batch-result-header">
            <div>
              <span>ALL DIRECTED EDGES</span>
              <h3>有効エッジの一括因果効果</h3>
            </div>
            <div className="batch-view-switch">
              <button type="button" className={resultView === "list" ? "active" : "secondary"} onClick={() => setResultView("list")}>一覧</button>
              <button type="button" className={resultView === "heatmap" ? "active" : "secondary"} onClick={() => setResultView("heatmap")}>ヒートマップ</button>
            </div>
          </div>

          <div className="batch-result-summary">
            <div><small>Method</small><strong>{batchInference.method}</strong></div>
            <div><small>Edges</small><strong>{batchInference.result_count}</strong></div>
            <div className="success"><small>Success</small><strong>{batchInference.success_count}</strong></div>
            <div className="failure"><small>Failure</small><strong>{batchInference.failure_count}</strong></div>
          </div>

          {resultView === "list" ? (
            <div className="table-wrap batch-result-table-wrap">
              <table className="batch-result-table">
                <thead>
                  <tr><th>介入変数</th><th>結果変数</th><th>因果効果</th><th>状態</th></tr>
                </thead>
                <tbody>
                  {batchInference.results.map((result) => (
                    <tr key={pairKey(result.factor1, result.factor2)}>
                      <td><strong>{result.factor1}</strong></td>
                      <td><strong>{result.factor2}</strong></td>
                      <td className={result.effect !== null && result.effect < 0 ? "negative-effect" : "positive-effect"}>
                        {formatEffect(result.effect)}
                      </td>
                      <td>
                        {result.error
                          ? <span className="status-dot-label warning" title={result.error}>失敗 · {result.error}</span>
                          : <span className="status-dot-label success">成功</span>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <>
              <div className="heatmap-legend">
                <span className="negative">負の効果</span>
                <i />
                <span>0付近</span>
                <i />
                <span className="positive">正の効果</span>
              </div>
              <div className="table-wrap effect-heatmap-wrap">
                <table className="effect-heatmap">
                  <thead><tr><th>from ＼ to</th>{columns.map((column) => <th key={column}>{column}</th>)}</tr></thead>
                  <tbody>
                    {columns.map((row) => (
                      <tr key={row}>
                        <th>{row}</th>
                        {columns.map((column) => {
                          const result = resultMap.get(pairKey(row, column));
                          if (row === column) return <td key={column} className="diagonal">—</td>;
                          if (!result) return <td key={column} className="no-edge">·</td>;
                          if (result.effect === null) return <td key={column} className="failed" title={result.error ?? "推定失敗"}>!</td>;
                          return (
                            <td
                              key={column}
                              className="effect-cell"
                              style={heatCellStyle(result.effect, maxAbsEffect)}
                              title={`${row} → ${column}: ${result.effect}`}
                            >
                              {formatEffect(result.effect)}
                            </td>
                          );
                        })}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </section>
      )}
    </>
  );
}
