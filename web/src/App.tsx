import { useState, type ComponentType } from "react";
import ConversationIcon from "./components/ConversationIcon";
import { STEPS, WorkbenchProvider, useWorkbench } from "./context/WorkbenchContext";
import ConversationPage from "./pages/ConversationPage";
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

const API_STATUS_LABELS = {
  checking: "確認中",
  ok: "接続済み",
  error: "エラー",
} as const;

const DEFAULT_PORTAL_URL = "http://127.0.0.1:5172";

function resolvePortalUrl(): string {
  const configured = import.meta.env.VITE_PORTAL_URL?.trim();
  if (!configured) return DEFAULT_PORTAL_URL;

  try {
    const url = new URL(configured, window.location.href);
    return url.protocol === "http:" || url.protocol === "https:"
      ? url.toString()
      : DEFAULT_PORTAL_URL;
  } catch {
    return DEFAULT_PORTAL_URL;
  }
}

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
  const [conversationOpen, setConversationOpen] = useState(false);
  const index = STEPS.findIndex(([id]) => id === step);
  const Page = PAGES[step];
  const finalEdgeCount = structureSource === "manual"
    ? causalEdges.length
    : editedDiscoveryEdges.filter((edge) => edge.kind === "directed").length;
  const apiStatusLabel = API_STATUS_LABELS[health.status];

  function openStep(target: WorkbenchStep): void {
    setConversationOpen(false);
    setStep(target);
  }

  return (
    <div className="app-root">
      <header className="app-header">
        <div className="brand-lockup">
          <div className="brand-mark" aria-hidden="true"><span>c</span></div>
          <div className="brand-wordmark">
            <h1>因果分析</h1>
            <p>Materials Analysis Workbench · cauchan</p>
          </div>
        </div>

        <div className="workflow-strip" aria-label="ワークフロー">
          {STEPS.map(([id, label], stepIndex) => (
            <div className="workflow-item" key={id}>
              <button
                className={`workflow-step ${!conversationOpen && id === step ? "active" : ""} ${stepIndex < index && canOpenStep(id) ? "complete" : ""}`}
                onClick={() => openStep(id)}
                disabled={!canOpenStep(id)}
                aria-current={!conversationOpen && id === step ? "step" : undefined}
              >
                <span>{stepIndex + 1}</span><strong>{label}</strong>
              </button>
              {stepIndex < STEPS.length - 1 && <i />}
            </div>
          ))}
        </div>

        <div className="header-actions">
          <div className="runtime-pill" title={`API接続: ${health.text}`}>
            <span className={`dot ${health.status}`} />
            <span className="runtime-copy"><small>API接続</small><strong>{apiStatusLabel}</strong></span>
          </div>
          <button
            type="button"
            className="portal-button secondary"
            title="ツール一覧へ戻る"
            aria-label="ツール一覧へ戻る"
            onClick={() => window.location.assign(resolvePortalUrl())}
          >
            <span aria-hidden="true">▦</span>
            <span>ツール一覧</span>
          </button>
          <button
            type="button"
            className="icon-button secondary theme-toggle"
            title={theme === "dark" ? "ライトテーマへ" : "ダークテーマへ"}
            aria-label={theme === "dark" ? "ライトテーマへ切り替える" : "ダークテーマへ切り替える"}
            onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
          >
            <span aria-hidden="true">{theme === "dark" ? "☀" : "☾"}</span>
          </button>
        </div>
      </header>

      <main className="app-shell">
        <aside className="left-rail">
          <button
            type="button"
            className={`conversation-launcher ${conversationOpen ? "active" : ""}`}
            onClick={() => setConversationOpen(true)}
            aria-current={conversationOpen ? "page" : undefined}
          >
            <ConversationIcon className="conversation-launcher-icon" fallback="c" />
            <span className="conversation-launcher-copy">
              <strong>対話モード</strong>
              <small>因果分析を順番に進める</small>
            </span>
            <span className="conversation-launcher-arrow" aria-hidden="true">›</span>
          </button>

          <div className="rail-section-label">WORKFLOW</div>
          <nav className="tabs" aria-label="ページナビゲーション">
            {STEPS.map(([id, label, detail], stepIndex) => (
              <button
                key={id}
                className={`tab ${!conversationOpen && step === id ? "active" : ""} ${stepIndex < index && canOpenStep(id) ? "complete" : ""}`}
                onClick={() => openStep(id)}
                disabled={!canOpenStep(id)}
                aria-current={!conversationOpen && step === id ? "page" : undefined}
              >
                <span className="nav-icon">{ICONS[id]}</span>
                <span><strong>{label}</strong><small>{detail}</small></span>
                <em>{stepIndex + 1}</em>
              </button>
            ))}
          </nav>
          <div className="rail-spacer" />
          <div className="rail-note">
            <div className="shield-icon">c</div>
            <div><strong>React + FastAPI</strong><p>手動構造または探索後に編集した構造から因果効果を推定します。</p></div>
          </div>
        </aside>

        <section className="content">
          <div className="content-inner">
            {error && (
              <div className="inline-alert error" role="alert">
                <div className="inline-alert-icon" aria-hidden="true">!</div>
                <div className="inline-alert-copy">
                  <span className="eyebrow">ERROR</span>
                  <strong>処理を完了できませんでした</strong>
                  <p>{error}</p>
                  <small>入力内容、因果構造、API接続を確認してから再実行してください。</small>
                </div>
                <button
                  type="button"
                  className="alert-close icon-button secondary"
                  title="エラー表示を閉じる"
                  aria-label="エラー表示を閉じる"
                  onClick={() => setError(null)}
                >
                  <span aria-hidden="true">×</span>
                </button>
              </div>
            )}
            {conversationOpen
              ? <ConversationPage onOpenStep={openStep} />
              : <Page />}
          </div>
        </section>

        <aside className="right-rail">
          <div className={`side-card runtime-card ${health.status}`}>
            <div className="side-card-title"><span>RUNTIME</span><strong>API接続</strong></div>
            <div className="runtime-large"><span className={`dot ${health.status}`} /><div><strong>FastAPI</strong><small>{apiStatusLabel} · {health.text}</small></div></div>
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
              <div><span>Source</span><strong title={structureSource === "manual" ? "Manual" : "Discovery + Edit"}>{structureSource === "manual" ? "Manual" : "Discovery + Edit"}</strong></div>
              <div><span>Directed</span><strong>{finalEdgeCount}</strong></div>
              <div><span>Undirected</span><strong>{structureSource === "discovery" ? unresolvedDiscoveryEdges : 0}</strong></div>
            </div>
          </div>
          <div className="side-card">
            <div className="side-card-title"><span>KNOWLEDGE</span><strong>探索制約</strong></div>
            <div className="context-list">
              <div><span>Required</span><strong>{requiredEdges.length}</strong></div>
              <div><span>Forbidden</span><strong>{forbiddenEdges.length}</strong></div>
              <div><span>Discovery</span><strong title={discovery?.model_name}>{discovery?.model_name || "—"}</strong></div>
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
        <span><span className={`dot ${health.status}`} /> API接続 {apiStatusLabel}</span>
        <span>{dataset ? `${dataset.row_count.toLocaleString()} rows` : "No data"}</span>
        <span className="privacy-status">React · FastAPI · cauchan</span>
      </footer>

      {busy && (
        <div className="overlay" role="status" aria-live="polite" aria-busy="true">
          <div className="busy-card">
            <div className="spinner" aria-hidden="true" />
            <span className="eyebrow">PROCESSING</span>
            <h3>{busy}</h3>
            <p>処理中は画面操作を一時停止しています。完了後に結果を表示します。</p>
            <span className="busy-state">処理中</span>
          </div>
        </div>
      )}
    </div>
  );
}

export default function App() {
  return <WorkbenchProvider><WorkbenchLayout /></WorkbenchProvider>;
}
