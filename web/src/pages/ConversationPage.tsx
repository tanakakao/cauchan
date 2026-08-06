import { useEffect, useMemo, useRef, useState } from "react";
import ConversationIcon from "../components/ConversationIcon";
import { useWorkbench } from "../context/WorkbenchContext";
import type {
  AlgorithmName,
  InferenceMethod,
  StructureSource,
  WorkbenchStep,
} from "../types";

type ConversationPageProps = {
  onOpenStep: (step: WorkbenchStep) => void;
};

type Stage =
  | "data"
  | "columns"
  | "categorical"
  | "source"
  | "manual"
  | "algorithm"
  | "review"
  | "treatment"
  | "outcome"
  | "method"
  | "confirm"
  | "result";

type MessageRole = "assistant" | "user";

type ConversationMessage = {
  id: number;
  role: MessageRole;
  text: string;
};

const ALGORITHMS: Array<{
  id: AlgorithmName;
  label: string;
  description: string;
}> = [
  { id: "PC", label: "PC", description: "条件付き独立性から構造を探索。未方向辺が残る場合があります。" },
  { id: "DirectLiNGAM", label: "DirectLiNGAM", description: "非ガウス性を利用して有向構造を推定します。" },
  { id: "GES", label: "GES", description: "スコアを改善しながらグラフ構造を探索します。" },
  { id: "HillClimbSearch", label: "HillClimbSearch", description: "局所探索でスコアの高い構造を選びます。" },
];

const METHODS: Array<{
  id: InferenceMethod;
  label: string;
  description: string;
}> = [
  { id: "SCM", label: "SCM", description: "親変数で調整する線形推定。最初の確認に適しています。" },
  { id: "DoWhyLinearRegression", label: "DoWhy 線形回帰", description: "DoWhyで識別後、線形回帰で平均効果を推定します。" },
  { id: "LinearDML", label: "LinearDML", description: "機械学習で交絡を調整し、線形な処置効果を推定します。" },
  { id: "CausalForestDML", label: "CausalForestDML", description: "異質的な効果を因果フォレストで推定し、平均を表示します。" },
];

const PROGRESS = [
  ["data", "データ読込"],
  ["variables", "分析変数"],
  ["structure", "因果構造"],
  ["review", "構造確認"],
  ["query", "介入と結果"],
  ["method", "推定手法"],
  ["result", "因果効果"],
] as const;

let messageSequence = 0;

function nextMessage(role: MessageRole, text: string): ConversationMessage {
  messageSequence += 1;
  return { id: messageSequence, role, text };
}

function includesColumn(text: string, column: string): boolean {
  return text.toLocaleLowerCase().includes(column.toLocaleLowerCase());
}

function sameColumns(left: string[], right: string[]): boolean {
  return left.length === right.length && left.every((value, index) => value === right[index]);
}

function inferCategoricalColumns(
  columns: string[],
  dtypes: Record<string, string> | undefined,
): string[] {
  return columns.filter((column) => {
    const dtype = dtypes?.[column] ?? "";
    return /(object|string|category|bool)/i.test(dtype);
  });
}

function progressGroup(stage: Stage): string {
  if (stage === "columns" || stage === "categorical") return "variables";
  if (stage === "source" || stage === "manual" || stage === "algorithm") return "structure";
  if (stage === "treatment" || stage === "outcome") return "query";
  if (stage === "confirm") return "method";
  return stage;
}

export default function ConversationPage({ onOpenStep }: ConversationPageProps) {
  const {
    dataset,
    selectedColumns,
    setSelectedColumns,
    categoricalColumns,
    setCategoricalColumns,
    modelName,
    setModelName,
    scale,
    setScale,
    structureSource,
    setStructureSource,
    causalEdges,
    requiredEdges,
    forbiddenEdges,
    validation,
    discovery,
    editedDiscoveryEdges,
    discoveryValidation,
    unresolvedDiscoveryEdges,
    inference,
    busy,
    error,
    setError,
    uploadDataset,
    runDiscovery,
    runInference,
  } = useWorkbench();

  const initialStage: Stage = !dataset
    ? "data"
    : structureSource === "discovery" && discovery
      ? "review"
      : "columns";
  const initialColumns = selectedColumns.length
    ? selectedColumns
    : dataset?.columns ?? [];
  const inferredCategorical = inferCategoricalColumns(initialColumns, dataset?.dtypes);

  const [stage, setStage] = useState<Stage>(initialStage);
  const [messages, setMessages] = useState<ConversationMessage[]>([
    nextMessage(
      "assistant",
      !dataset
        ? "因果分析を一緒に進めます。まずCSVまたはExcelデータを読み込んでください。"
        : initialStage === "review"
          ? "既存の因果探索結果があります。構造を確認して、介入変数と結果変数を選びましょう。"
          : "データを確認しました。因果分析に使用する変数を選んでください。",
    ),
  ]);
  const [draftColumns, setDraftColumns] = useState<string[]>(initialColumns);
  const [draftCategorical, setDraftCategorical] = useState<string[]>(
    categoricalColumns.length ? categoricalColumns : inferredCategorical,
  );
  const [draftAlgorithm, setDraftAlgorithm] = useState<AlgorithmName>(modelName);
  const [draftTreatment, setDraftTreatment] = useState("");
  const [draftOutcome, setDraftOutcome] = useState("");
  const [draftMethod, setDraftMethod] = useState<InferenceMethod>("SCM");
  const [inputText, setInputText] = useState("");
  const [awaitingDiscovery, setAwaitingDiscovery] = useState(false);
  const [awaitingInference, setAwaitingInference] = useState(false);
  const previousDatasetId = useRef(dataset?.dataset_id ?? null);
  const previousDiscovery = useRef(discovery);
  const previousInference = useRef(inference);

  const selectedColumnSet = useMemo(() => new Set(draftColumns), [draftColumns]);
  const categoricalSet = useMemo(() => new Set(draftCategorical), [draftCategorical]);
  const analysisColumns = useMemo(
    () => structureSource === "discovery" && discovery
      ? discovery.columns
      : draftColumns,
    [structureSource, discovery, draftColumns],
  );
  const directedEdgeCount = editedDiscoveryEdges.filter((edge) => edge.kind === "directed").length;
  const selectedMethod = METHODS.find((method) => method.id === draftMethod) ?? METHODS[0];
  const progressIndex = PROGRESS.findIndex(([id]) => id === progressGroup(stage));

  function append(role: MessageRole, text: string): void {
    setMessages((current) => [...current, nextMessage(role, text)]);
  }

  function resetConversation(): void {
    const columns = selectedColumns.length ? selectedColumns : dataset?.columns ?? [];
    const categories = categoricalColumns.length
      ? categoricalColumns
      : inferCategoricalColumns(columns, dataset?.dtypes);
    const nextStage: Stage = !dataset
      ? "data"
      : structureSource === "discovery" && discovery
        ? "review"
        : "columns";
    setDraftColumns(columns);
    setDraftCategorical(categories);
    setDraftAlgorithm(modelName);
    setDraftTreatment("");
    setDraftOutcome("");
    setDraftMethod("SCM");
    setStage(nextStage);
    setMessages([
      nextMessage(
        "assistant",
        !dataset
          ? "因果分析を一緒に進めます。まずデータを読み込んでください。"
          : nextStage === "review"
            ? "現在の探索結果から再開します。因果構造を確認してください。"
            : "因果分析に使用する変数を選んでください。",
      ),
    ]);
    setInputText("");
    setAwaitingDiscovery(false);
    setAwaitingInference(false);
  }

  useEffect(() => {
    if (!dataset || dataset.dataset_id === previousDatasetId.current) return;
    previousDatasetId.current = dataset.dataset_id;
    const categories = inferCategoricalColumns(dataset.columns, dataset.dtypes);
    setDraftColumns(dataset.columns);
    setDraftCategorical(categories);
    setDraftTreatment("");
    setDraftOutcome("");
    setStage("columns");
    setMessages([
      nextMessage(
        "assistant",
        `${dataset.filename}を読み込みました。${dataset.row_count.toLocaleString()}行、${dataset.columns.length}列です。因果分析に使用する変数を選んでください。`,
      ),
    ]);
  }, [dataset]);

  useEffect(() => {
    if (!awaitingDiscovery) return;
    if (discovery && discovery !== previousDiscovery.current) {
      previousDiscovery.current = discovery;
      setAwaitingDiscovery(false);
      setStage("review");
      append(
        "assistant",
        `因果探索が完了しました。有向エッジ${discovery.edges.filter((edge) => edge.kind === "directed").length}件、未方向エッジ${discovery.edges.filter((edge) => edge.kind === "undirected").length}件です。`,
      );
      return;
    }
    if (!busy && error) {
      setAwaitingDiscovery(false);
      setStage("algorithm");
      append("assistant", "因果探索を完了できませんでした。エラー内容と変数・制約を確認してください。");
    }
  }, [awaitingDiscovery, discovery, busy, error]);

  useEffect(() => {
    if (!awaitingInference) return;
    if (inference && inference !== previousInference.current) {
      previousInference.current = inference;
      setAwaitingInference(false);
      setStage("result");
      append(
        "assistant",
        `${inference.factor1}から${inference.factor2}への因果効果を推定しました。推定値は${Number(inference.effect).toPrecision(6)}です。`,
      );
      return;
    }
    if (!busy && error) {
      setAwaitingInference(false);
      setStage("confirm");
      append("assistant", "因果効果を推定できませんでした。因果構造と推定条件を確認してください。");
    }
  }, [awaitingInference, inference, busy, error]);

  function toggleColumn(column: string): void {
    const next = selectedColumnSet.has(column)
      ? draftColumns.filter((item) => item !== column)
      : [...draftColumns, column];
    const ordered = (dataset?.columns ?? []).filter((item) => next.includes(item));
    setDraftColumns(ordered);
    setDraftCategorical((current) => current.filter((item) => ordered.includes(item)));
  }

  function confirmColumns(): void {
    if (draftColumns.length < 2) return;
    if (!sameColumns(selectedColumns, draftColumns)) setSelectedColumns([...draftColumns]);
    append("user", `${draftColumns.join("、")}を分析に使います。`);
    append("assistant", "カテゴリ変数を確認してください。データ型から候補を初期選択しています。");
    setStage("categorical");
  }

  function toggleCategorical(column: string): void {
    const next = categoricalSet.has(column)
      ? draftCategorical.filter((item) => item !== column)
      : [...draftCategorical, column];
    setDraftCategorical(draftColumns.filter((item) => next.includes(item)));
  }

  function confirmCategorical(): void {
    if (!sameColumns(categoricalColumns, draftCategorical)) {
      setCategoricalColumns([...draftCategorical]);
    }
    append(
      "user",
      draftCategorical.length
        ? `${draftCategorical.join("、")}をカテゴリ変数として扱います。`
        : "すべて数値変数として扱います。",
    );
    append("assistant", "因果構造を、因果探索で作るか、手動で定義するか選んでください。");
    setStage("source");
  }

  function selectSource(source: StructureSource): void {
    setStructureSource(source);
    if (source === "discovery") {
      append("user", "データから因果構造を探索します。");
      append("assistant", "使用する因果探索アルゴリズムと標準化の有無を選んでください。");
      setStage("algorithm");
      return;
    }

    append("user", "因果構造を手動で定義します。");
    if (causalEdges.length && validation?.valid !== false) {
      append("assistant", `既存の手動構造に${causalEdges.length}本の因果エッジがあります。この構造を使って推論へ進めます。`);
      setStage("treatment");
    } else {
      append("assistant", "手動構造はKnowledge画面のグラフ上で定義します。構造作成後、対話モードへ戻ってください。");
      setStage("manual");
    }
  }

  function selectAlgorithm(algorithm: AlgorithmName): void {
    setDraftAlgorithm(algorithm);
    setModelName(algorithm);
  }

  async function executeDiscovery(): Promise<void> {
    if (awaitingDiscovery || busy) return;
    previousDiscovery.current = discovery;
    setError(null);
    setAwaitingDiscovery(true);
    append("user", `${draftAlgorithm}で因果構造を探索してください。`);
    append("assistant", "既存の変数設定と事前知識を使って因果探索を実行します。");
    await runDiscovery();
  }

  function continueFromReview(): void {
    if (!analysisColumns.length || unresolvedDiscoveryEdges > 0 || discoveryValidation?.valid === false) return;
    append("user", "この因果構造を使います。");
    append("assistant", "次に、操作・介入を想定する変数を選んでください。");
    setStage("treatment");
  }

  function selectTreatment(column: string): void {
    setDraftTreatment(column);
    if (draftOutcome === column) setDraftOutcome("");
    append("user", `${column}を介入変数にします。`);
    append("assistant", "介入による変化を確認したい結果変数を選んでください。");
    setStage("outcome");
  }

  function selectOutcome(column: string): void {
    setDraftOutcome(column);
    append("user", `${column}への因果効果を確認します。`);
    append("assistant", "因果効果の推定手法を選んでください。最初の確認にはSCMが扱いやすいです。");
    setStage("method");
  }

  function selectMethod(method: InferenceMethod): void {
    setDraftMethod(method);
    const label = METHODS.find((item) => item.id === method)?.label ?? method;
    append("user", `${label}で推定します。`);
    append("assistant", "分析条件をまとめました。内容を確認して因果効果を推定してください。");
    setStage("confirm");
  }

  async function executeInference(): Promise<void> {
    if (!draftTreatment || !draftOutcome || awaitingInference || busy) return;
    previousInference.current = inference;
    setError(null);
    setAwaitingInference(true);
    append("user", "この内容で因果効果を推定してください。");
    append("assistant", "採用した因果構造と推定手法を使って因果効果を計算します。");
    await runInference(draftTreatment, draftOutcome, draftMethod, structureSource);
  }

  function handleTextSubmit(event: React.FormEvent<HTMLFormElement>): void {
    event.preventDefault();
    const text = inputText.trim();
    if (!text) return;
    setInputText("");

    if (/やり直|最初|リセット/.test(text)) {
      resetConversation();
      return;
    }

    if (stage === "columns") {
      if (/すべて|全部/.test(text)) {
        setDraftColumns(dataset?.columns ?? []);
        append("user", text);
        append("assistant", "すべての列を選択しました。「この変数で進む」を押してください。");
        return;
      }
      const matched = (dataset?.columns ?? []).filter((column) => includesColumn(text, column));
      if (matched.length) {
        setDraftColumns(matched);
        setDraftCategorical((current) => current.filter((column) => matched.includes(column)));
        append("user", text);
        append("assistant", `${matched.join("、")}を分析変数として選択しました。`);
        return;
      }
    }

    if (stage === "categorical") {
      if (/なし|数値のみ/.test(text)) {
        setDraftCategorical([]);
        append("user", text);
        append("assistant", "カテゴリ変数を選択しない設定にしました。");
        return;
      }
      const matched = draftColumns.filter((column) => includesColumn(text, column));
      if (matched.length) {
        setDraftCategorical(matched);
        append("user", text);
        append("assistant", `${matched.join("、")}をカテゴリ変数として選択しました。`);
        return;
      }
    }

    if (stage === "source") {
      if (/探索|自動/.test(text)) return selectSource("discovery");
      if (/手動|自分/.test(text)) return selectSource("manual");
    }

    if (stage === "algorithm") {
      const matched = ALGORITHMS.find((item) => text.toLocaleLowerCase().includes(item.id.toLocaleLowerCase()));
      if (matched) {
        selectAlgorithm(matched.id);
        append("user", text);
        append("assistant", `${matched.label}を選択しました。「因果探索を実行」を押してください。`);
        return;
      }
      if (/実行|探索開始|開始/.test(text)) {
        void executeDiscovery();
        return;
      }
    }

    if (stage === "review" && /進む|採用|使う/.test(text)) {
      continueFromReview();
      return;
    }

    if (stage === "treatment") {
      const matched = analysisColumns.find((column) => includesColumn(text, column));
      if (matched) return selectTreatment(matched);
    }

    if (stage === "outcome") {
      const matched = analysisColumns.find(
        (column) => column !== draftTreatment && includesColumn(text, column),
      );
      if (matched) return selectOutcome(matched);
    }

    if (stage === "method") {
      const normalized = text.toLocaleLowerCase();
      const matched = METHODS.find((item) => (
        normalized.includes(item.id.toLocaleLowerCase())
        || normalized.includes(item.label.toLocaleLowerCase())
      ));
      if (matched) return selectMethod(matched.id);
    }

    if (stage === "confirm" && /実行|推定|計算/.test(text)) {
      void executeInference();
      return;
    }

    append("user", text);
    append(
      "assistant",
      "画面の選択肢から回答するか、列名・「因果探索」「手動」「PC」「DirectLiNGAM」「SCM」「推定を実行」などを入力してください。",
    );
  }

  return (
    <div className="conversation-page">
      <div className="conversation-heading">
        <div>
          <span className="conversation-kicker">GUIDED CAUSAL ANALYSIS</span>
          <h2>対話しながら因果効果を推定</h2>
          <p>分析変数、因果構造、介入変数、結果変数、推定手法を順番に確認します。既存のKnowledge・Discovery・Inference画面と同じ状態とAPIを使用します。</p>
        </div>
        <div className="conversation-heading-actions">
          <button type="button" className="secondary" onClick={resetConversation}>対話をやり直す</button>
          {dataset && (
            <button type="button" className="secondary" onClick={() => onOpenStep("knowledge")}>画面で設定する</button>
          )}
        </div>
      </div>

      <div className="conversation-layout">
        <section className="conversation-thread" aria-label="cauchanとの対話">
          <div className="conversation-messages" aria-live="polite">
            {messages.map((message) => (
              <div key={message.id} className={`conversation-message ${message.role}`}>
                <ConversationIcon
                  fallback={message.role === "assistant" ? "c" : "自"}
                  className="conversation-avatar"
                />
                <div className="conversation-bubble">{message.text}</div>
              </div>
            ))}

            {stage === "data" && (
              <div className="conversation-action-card">
                <strong>分析データを読み込む</strong>
                <p>CSV、XLSX、XLSに対応しています。データは既存のData画面と同じAPIへ登録されます。</p>
                <label className="conversation-file-button">
                  <input
                    type="file"
                    accept=".csv,.xlsx,.xls"
                    onChange={(event) => {
                      const file = event.target.files?.[0];
                      if (file) void uploadDataset(file);
                    }}
                  />
                  ファイルを選択
                </label>
              </div>
            )}

            {stage === "columns" && dataset && (
              <div className="conversation-action-card">
                <strong>因果分析に使用する変数</strong>
                <p>2列以上を選択してください。不要なID列、日時列、自由記述列などは除外します。</p>
                <div className="conversation-feature-list">
                  {dataset.columns.map((column) => {
                    const selected = selectedColumnSet.has(column);
                    return (
                      <button
                        key={column}
                        type="button"
                        className={`conversation-feature ${selected ? "selected" : ""}`}
                        aria-pressed={selected}
                        onClick={() => toggleColumn(column)}
                      >
                        <span className="conversation-check">{selected ? "✓" : ""}</span>
                        <span><strong>{column}</strong><small>{dataset.dtypes[column] ?? "unknown"}</small></span>
                      </button>
                    );
                  })}
                </div>
                <div className="conversation-card-actions">
                  <button type="button" className="secondary" onClick={() => setDraftColumns(dataset.columns)}>全選択</button>
                  <button type="button" className="secondary" onClick={() => setDraftColumns([])}>解除</button>
                  <button type="button" disabled={draftColumns.length < 2} onClick={confirmColumns}>この変数で進む</button>
                </div>
              </div>
            )}

            {stage === "categorical" && (
              <div className="conversation-action-card">
                <strong>カテゴリ変数を確認</strong>
                <p>カテゴリとして扱う列を選択します。データ型から推定した候補を初期選択しています。</p>
                <div className="conversation-feature-list">
                  {draftColumns.map((column) => {
                    const selected = categoricalSet.has(column);
                    return (
                      <button
                        key={column}
                        type="button"
                        className={`conversation-feature category ${selected ? "selected" : ""}`}
                        aria-pressed={selected}
                        onClick={() => toggleCategorical(column)}
                      >
                        <span className="conversation-check">{selected ? "✓" : ""}</span>
                        <span><strong>{column}</strong><small>{selected ? "カテゴリ変数" : "数値変数"}</small></span>
                      </button>
                    );
                  })}
                </div>
                <div className="conversation-card-actions">
                  <button type="button" className="secondary" onClick={() => setDraftCategorical([])}>すべて数値</button>
                  <button type="button" onClick={confirmCategorical}>この設定で進む</button>
                </div>
              </div>
            )}

            {stage === "source" && (
              <div className="conversation-action-card">
                <strong>因果構造の作り方</strong>
                <div className="conversation-choice-grid two-columns">
                  <button type="button" onClick={() => selectSource("discovery")}>
                    <strong>因果探索</strong>
                    <small>データと事前知識から構造候補を自動探索する</small>
                  </button>
                  <button type="button" className="secondary" onClick={() => selectSource("manual")}>
                    <strong>手動構造</strong>
                    <small>専門知識に基づいてKnowledge画面で矢印を定義する</small>
                  </button>
                </div>
              </div>
            )}

            {stage === "manual" && (
              <div className="conversation-action-card">
                <strong>Knowledge画面で因果構造を定義</strong>
                <p>対話モードでは変数選択まで引き継ぎます。グラフ上で因果エッジ、必須・禁止エッジ、原因・結果制約を設定してください。</p>
                <div className="conversation-card-actions">
                  <button type="button" onClick={() => onOpenStep("knowledge")}>Knowledge画面を開く</button>
                  <button type="button" className="secondary" onClick={() => setStage("source")}>作り方を選び直す</button>
                </div>
              </div>
            )}

            {stage === "algorithm" && (
              <div className="conversation-action-card">
                <strong>因果探索アルゴリズム</strong>
                <p>PCでは未方向辺が残る場合があります。対話だけで推論まで進める場合は、有向構造を返しやすいDirectLiNGAMも候補です。</p>
                <div className="conversation-choice-grid">
                  {ALGORITHMS.map((algorithm) => (
                    <button
                      key={algorithm.id}
                      type="button"
                      className={draftAlgorithm === algorithm.id ? "selected" : "secondary"}
                      aria-pressed={draftAlgorithm === algorithm.id}
                      onClick={() => selectAlgorithm(algorithm.id)}
                    >
                      <strong>{algorithm.label}</strong>
                      <small>{algorithm.description}</small>
                    </button>
                  ))}
                </div>
                <label className="conversation-toggle-row">
                  <input
                    type="checkbox"
                    checked={scale}
                    onChange={(event) => setScale(event.target.checked)}
                  />
                  <span><strong>数値変数を標準化する</strong><small>変数間のスケール差が大きい場合に推奨します。</small></span>
                </label>
                <div className="conversation-existing-knowledge">
                  <span>既存の事前知識</span>
                  <strong>必須 {requiredEdges.length}件 · 禁止 {forbiddenEdges.length}件</strong>
                </div>
                <div className="conversation-card-actions">
                  <button type="button" className="secondary" onClick={() => onOpenStep("knowledge")}>事前知識を画面で設定</button>
                  <button type="button" disabled={Boolean(busy) || awaitingDiscovery} onClick={() => void executeDiscovery()}>
                    {awaitingDiscovery ? "因果探索中..." : "因果探索を実行"}
                  </button>
                </div>
              </div>
            )}

            {stage === "review" && discovery && (
              <div className="conversation-action-card conversation-review-card">
                <span className="conversation-result-label">CAUSAL STRUCTURE</span>
                <h3>{discovery.model_name}</h3>
                <div className="conversation-result-values">
                  <div><span>分析変数</span><strong>{discovery.columns.length}列</strong></div>
                  <div><span>有向エッジ</span><strong>{directedEdgeCount}件</strong></div>
                  <div><span>未方向エッジ</span><strong>{unresolvedDiscoveryEdges}件</strong></div>
                  <div><span>構造検証</span><strong>{discoveryValidation?.valid === false ? "要修正" : "推論可能"}</strong></div>
                </div>
                {unresolvedDiscoveryEdges > 0 && (
                  <p className="conversation-warning">方向未確定のエッジがあります。Discovery画面で削除するか、矢印を追加して方向を確定してください。</p>
                )}
                {discoveryValidation?.valid === false && (
                  <p className="conversation-warning">最終構造に矛盾があります。Discovery画面でグラフを修正してください。</p>
                )}
                <div className="conversation-result-actions">
                  <button type="button" className="secondary" onClick={() => onOpenStep("discovery")}>探索結果を画面で確認</button>
                  <button
                    type="button"
                    disabled={!directedEdgeCount || unresolvedDiscoveryEdges > 0 || discoveryValidation?.valid === false}
                    onClick={continueFromReview}
                  >
                    この構造で推論へ進む
                  </button>
                  <button type="button" className="secondary" onClick={() => setStage("algorithm")}>探索をやり直す</button>
                </div>
              </div>
            )}

            {stage === "treatment" && (
              <div className="conversation-action-card">
                <strong>介入変数を選ぶ</strong>
                <p>値を操作・変更したと仮定する原因側の変数を選択します。</p>
                <div className="conversation-choice-grid">
                  {analysisColumns.map((column) => (
                    <button key={column} type="button" className="secondary" onClick={() => selectTreatment(column)}>
                      <strong>{column}</strong><small>介入候補</small>
                    </button>
                  ))}
                </div>
              </div>
            )}

            {stage === "outcome" && (
              <div className="conversation-action-card">
                <strong>結果変数を選ぶ</strong>
                <p>{draftTreatment}を変化させたときに、影響を確認したい変数を選択します。</p>
                <div className="conversation-choice-grid">
                  {analysisColumns.filter((column) => column !== draftTreatment).map((column) => (
                    <button key={column} type="button" className="secondary" onClick={() => selectOutcome(column)}>
                      <strong>{column}</strong><small>結果候補</small>
                    </button>
                  ))}
                </div>
              </div>
            )}

            {stage === "method" && (
              <div className="conversation-action-card">
                <strong>因果効果の推定手法</strong>
                <div className="conversation-choice-grid two-columns">
                  {METHODS.map((method) => (
                    <button key={method.id} type="button" className="secondary" onClick={() => selectMethod(method.id)}>
                      <strong>{method.label}</strong><small>{method.description}</small>
                    </button>
                  ))}
                </div>
              </div>
            )}

            {stage === "confirm" && (
              <div className="conversation-action-card conversation-confirm-card">
                <strong>この内容で因果効果を推定します</strong>
                <dl>
                  <div><dt>因果構造</dt><dd>{structureSource === "discovery" ? `因果探索 · ${discovery?.model_name ?? draftAlgorithm}` : "手動構造"}</dd></div>
                  <div><dt>介入変数</dt><dd>{draftTreatment}</dd></div>
                  <div><dt>結果変数</dt><dd>{draftOutcome}</dd></div>
                  <div><dt>推定手法</dt><dd>{selectedMethod.label}</dd></div>
                  <div><dt>分析変数</dt><dd>{analysisColumns.length}列</dd></div>
                </dl>
                <button type="button" disabled={Boolean(busy) || awaitingInference} onClick={() => void executeInference()}>
                  {awaitingInference ? "因果効果を推定中..." : "因果効果を推定"}
                </button>
              </div>
            )}

            {stage === "result" && inference && (
              <div className="conversation-action-card conversation-result-card">
                <span className="conversation-result-label">CAUSAL EFFECT</span>
                <h3>{Number(inference.effect).toPrecision(6)}</h3>
                <div className="conversation-result-path">
                  <strong>{inference.factor1}</strong><span>→</span><strong>{inference.factor2}</strong>
                </div>
                <div className="conversation-result-values">
                  <div><span>推定手法</span><strong>{METHODS.find((item) => item.id === inference.method)?.label ?? inference.method}</strong></div>
                  <div><span>効果の符号</span><strong>{inference.effect > 0 ? "正" : inference.effect < 0 ? "負" : "0"}</strong></div>
                  <div><span>構造</span><strong>{structureSource === "discovery" ? "探索結果" : "手動"}</strong></div>
                  <div><span>状態</span><strong>推定完了</strong></div>
                </div>
                <p>{inference.interpretation}</p>
                <div className="conversation-result-actions">
                  <button type="button" onClick={() => onOpenStep("inference")}>Inference画面で詳しく見る</button>
                  <button type="button" className="secondary" onClick={() => setStage("treatment")}>変数を変えて再推定</button>
                  <button type="button" className="secondary" onClick={resetConversation}>最初から確認する</button>
                </div>
              </div>
            )}
          </div>

          <form className="conversation-composer" onSubmit={handleTextSubmit}>
            <input
              type="text"
              value={inputText}
              onChange={(event) => setInputText(event.target.value)}
              placeholder={dataset ? "例：温度と時間を使う、因果探索、DirectLiNGAM、温度から強度、SCM" : "データ読込後に自然文でも回答できます"}
              disabled={!dataset || Boolean(busy)}
              aria-label="対話モードへの入力"
            />
            <button type="submit" disabled={!dataset || !inputText.trim() || Boolean(busy)}>送信</button>
          </form>
        </section>

        <aside className="conversation-summary" aria-label="現在の因果分析設定">
          <div className="conversation-summary-card">
            <span>CURRENT PLAN</span>
            <h3>現在の分析設定</h3>
            <dl>
              <div><dt>データ</dt><dd>{dataset ? `${dataset.row_count.toLocaleString()}行` : "未読込"}</dd></div>
              <div><dt>分析変数</dt><dd>{draftColumns.length ? `${draftColumns.length}列` : "未選択"}</dd></div>
              <div><dt>カテゴリ</dt><dd>{draftCategorical.length ? `${draftCategorical.length}列` : "なし"}</dd></div>
              <div><dt>構造</dt><dd>{structureSource === "discovery" ? `探索 · ${draftAlgorithm}` : "手動"}</dd></div>
              <div><dt>介入</dt><dd>{draftTreatment || "未選択"}</dd></div>
              <div><dt>結果</dt><dd>{draftOutcome || "未選択"}</dd></div>
              <div><dt>推定</dt><dd>{selectedMethod.label}</dd></div>
            </dl>
          </div>

          <div className="conversation-summary-card conversation-progress-card">
            <span>PROGRESS</span>
            <h3>対話の進行</h3>
            <ol>
              {PROGRESS.map(([id, label], index) => (
                <li key={id} className={index < progressIndex ? "complete" : index === progressIndex ? "active" : ""}>
                  <span>{index < progressIndex ? "✓" : index + 1}</span>{label}
                </li>
              ))}
            </ol>
          </div>

          <div className="conversation-summary-card conversation-note-card">
            <span>CAUTION</span>
            <h3>因果推論の前提</h3>
            <p>推定結果は、採用した因果構造、未観測交絡がないこと、各手法のモデル仮定に依存します。探索結果は因果関係の確定ではなく、専門知識による確認が必要です。</p>
          </div>
        </aside>
      </div>
    </div>
  );
}
