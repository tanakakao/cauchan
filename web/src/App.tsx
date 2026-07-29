import type { ComponentType } from "react";
import { STEPS, WorkbenchProvider, useWorkbench } from "./context/WorkbenchContext";
import DataPage from "./pages/DataPage";
import DiscoveryPage from "./pages/DiscoveryPage";
import InferencePage from "./pages/InferencePage";
import KnowledgePage from "./pages/KnowledgePage";
import type { WorkbenchStep } from "./types";

const PAGES: Record<WorkbenchStep, ComponentType> = {
  data: DataPage,
  knowledge: KnowledgePage,
  discovery: DiscoveryPage,
  inference: InferencePage,
};

const ICONS: Record<WorkbenchStep, string> = {
  data: "▦",
  knowledge: "◇",
  discovery: "◎",
  inference: "→",
};

function WorkbenchLayout() {
  const {
    theme,
    setTheme,
    step,
    setStep,
    health,
    busy,
    error,
    setError,
    dataset,
    selectedColumns,
    structureSource,
    causalEdges,
    requiredEdges,
    forbiddenEdges,
    discovery,
    editedDiscoveryEdges,
    unresolvedDiscoveryEdges,
    inference,
    canOpenStep,
  } = useWorkbench();
  const index = STEPS.findIndex(([id]) => id === step);
  const Page = PAGES[step];
  const finalEdgeCount = structureSource === "manual"
    ? causalEdges.length
    : editedDiscoveryEdges.filter((edge) => edge.kind === "directed").length;

  return (
    <div className="app-root">
      <header className="app-header">
        <div className="brand-lockup">
          <div className="brand-mark" aria-hidden="true"><span>c</span></div>
          <div className="brand-wordmark">
            <h1>cauchan</h1>
            <p>CAUSAL DISCOVERY WORKBENCH</p>
          </div>
        </div>

        <div className="workflow-strip" aria-label="ワークフロー">
          {STEPS.map(([id, label], stepIndex) => (
            <div className="workflow-item" key={id}>
              <button
                className={`workflow-step ${id === step ? "active" : ""} ${stepIndex < index && canOpenStep(id) ? "complete" : ""}`}
                onClick={() => setStep(id)}
                disabled={!canOpenStep(id)}
                aria-current={id === step ? "step" : undefined}
              >
                <span>{stepIndex + 1}</span><strong>{label}</strong>
              </button>
              {stepIndex < STEPS.length - 1 && <i />}
            </div>
          ))}
        </div>

        <div className="header-actions">
          <div className="runtime-pill" title={health.text}>
            <span className={`dot ${health.status}`} />
            <span className="runtime-copy"><small>API status</small><strong>{health.text}</strong></span>
          </div>
          <button
            type="button"
            className="icon-button secondary"
            title={theme === "dark" ? "ライトテーマへ" : "ダークテーマへ"}
            aria-label={theme === "dark" ? "ライトテーマへ切り替える" : "ダークテーマへ切り替える"}
            onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
          >
            {theme === "dark" ? "☀" : "☾"}
          </button>
        </div>
      </header>

      <main className="app-shell">
        <aside className="left-rail">
          <div className="rail-section-label">WORKSPACE</div>
          <nav className="tabs" aria-label="ページナビゲーション">
            {STEPS.map(([id, label, detail], stepIndex) => (
              <button
                key={id}
                className={`tab ${step === id ? "active" : ""} ${stepIndex < index && canOpenStep(id) ? "complete" : ""}`}
                onClick={() => setStep(id)}
                disabled={!canOpenStep(id)}
                aria-current={step === id ? "page" : undefined}
              >
                <span className="nav-icon">{ICONS[id]}</span>
                <span><strong>{label}</strong><small>{detail}</small></span>
                <em>{stepIndex + 1}</em>
              </button>
            ))}
          </nav>
          <div className="rail-spacer" />
          <div className="rail-note">
            <div className="shield-icon">β</div>
            <div><strong>React + FastAPI</strong><p>手動構造または探索後に編集した構造から因果効果を推定します。</p></div>
          </div>
        </aside>

        <section className="content">
          <div className="content-inner">
            {error && <button className="message error inline-message" onClick={() => setError(null)}>{error}</button>}
            <Page />
          </div>
        </section>

        <aside className="right-rail">
          <div className={`side-card runtime-card ${health.status}`}>
            <div className="side-card-title"><span>RUNTIME</span><strong>API接続</strong></div>
            <div className="runtime-large"><span className={`dot ${health.status}`} /><div><strong>FastAPI</strong><small>{health.text}</small></div></div>
          </div>
          <div className="side-card">
            <div className="side-card-title"><span>DATA CONTEXT</span><strong>現在のデータ</strong></div>
            <div className="context-list">
              <div><span>File</span><strong title={dataset?.filename}>{dataset?.filename || "—"}</strong></div>
              <div><span>Rows</span><strong>{dataset?.row_count.toLocaleString() || "—"}</strong></div>
              <div><span>Nodes</span><strong>{selectedColumns.length || "—"}</strong></div>
            </div>
          </div>
          <div className="side-card">
            <div className="side-card-title"><span>FINAL STRUCTURE</span><strong>採用する因果構造</strong></div>
            <div className="context-list">
              <div><span>Source</span><strong>{structureSource === "manual" ? "Manual" : "Discovery + Edit"}</strong></div>
              <div><span>Directed</span><strong>{finalEdgeCount}</strong></div>
              <div><span>Undirected</span><strong>{structureSource === "discovery" ? unresolvedDiscoveryEdges : 0}</strong></div>
            </div>
          </div>
          <div className="side-card">
            <div className="side-card-title"><span>KNOWLEDGE</span><strong>探索制約</strong></div>
            <div className="context-list">
              <div><span>Required</span><strong>{requiredEdges.length}</strong></div>
              <div><span>Forbidden</span><strong>{forbiddenEdges.length}</strong></div>
              <div><span>Discovery</span><strong>{discovery?.model_name || "—"}</strong></div>
            </div>
          </div>
          <div className="side-card">
            <div className="side-card-title"><span>RESULT</span><strong>因果効果</strong></div>
            <div className="context-list">
              <div><span>Inference</span><strong>{inference ? Number(inference.effect).toPrecision(5) : "—"}</strong></div>
            </div>
          </div>
        </aside>
      </main>

      <footer className="statusbar">
        <span><span className={`dot ${health.status}`} /> API {health.status}</span>
        <span>{dataset ? `${dataset.row_count.toLocaleString()} rows` : "No data"}</span>
        <span className="privacy-status">cauchan web 0.2.0</span>
      </footer>

      {busy && (
        <div className="overlay" role="status" aria-live="polite">
          <div className="busy-card"><div className="spinner" /><h3>{busy}</h3><div className="busy-progress"><span /></div></div>
        </div>
      )}
    </div>
  );
}

export default function App() {
  return <WorkbenchProvider><WorkbenchLayout /></WorkbenchProvider>;
}
