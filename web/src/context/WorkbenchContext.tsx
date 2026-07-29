import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type Dispatch,
  type PropsWithChildren,
  type SetStateAction,
} from "react";
import { api } from "../api";
import type {
  AlgorithmName,
  DatasetResponse,
  DiscoveryResponse,
  EdgeDefinition,
  EdgeMode,
  GraphEdgeResponse,
  GraphValidationResponse,
  HealthState,
  InferenceMethod,
  InferenceResponse,
  InferenceSource,
  StructureSource,
  Theme,
  WorkbenchStep,
} from "../types";

export const STEPS: Array<[WorkbenchStep, string, string]> = [
  ["data", "Data", "読込・確認"],
  ["knowledge", "Knowledge", "構造・制約"],
  ["discovery", "Discovery", "探索・編集"],
  ["inference", "Inference", "効果推定"],
];

function edgeKey(edge: EdgeDefinition): string {
  return `${edge.source}\u0000${edge.target}`;
}

function unorderedEdgeKey(edge: EdgeDefinition): string {
  return [edge.source, edge.target].sort().join("\u0000");
}

function graphEdgeKey(edge: GraphEdgeResponse): string {
  return edge.kind === "undirected"
    ? `${edge.kind}\u0000${unorderedEdgeKey(edge)}`
    : `${edge.kind}\u0000${edgeKey(edge)}`;
}

function uniqueEdges(edges: EdgeDefinition[]): EdgeDefinition[] {
  const seen = new Set<string>();
  return edges.filter((edge) => {
    const key = edgeKey(edge);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function uniqueGraphEdges(edges: GraphEdgeResponse[]): GraphEdgeResponse[] {
  const seen = new Set<string>();
  return edges.filter((edge) => {
    const key = graphEdgeKey(edge);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function samePair(left: EdgeDefinition, right: EdgeDefinition): boolean {
  return unorderedEdgeKey(left) === unorderedEdgeKey(right);
}

function copyGraphEdges(edges: GraphEdgeResponse[]): GraphEdgeResponse[] {
  return edges.map((edge) => ({ ...edge }));
}

export function edgesToMatrix(columns: string[], edges: EdgeDefinition[]): number[][] {
  const index = new Map(columns.map((column, position) => [column, position]));
  const matrix = columns.map(() => columns.map(() => 0));
  for (const edge of edges) {
    const source = index.get(edge.source);
    const target = index.get(edge.target);
    if (source !== undefined && target !== undefined) matrix[source][target] = 1;
  }
  return matrix;
}

export function graphEdgesToMatrix(columns: string[], edges: GraphEdgeResponse[]): number[][] {
  const directed = edges
    .filter((edge) => edge.kind === "directed")
    .map(({ source, target }) => ({ source, target }));
  const matrix = edgesToMatrix(columns, directed);
  const index = new Map(columns.map((column, position) => [column, position]));
  for (const edge of edges.filter((item) => item.kind === "undirected")) {
    const source = index.get(edge.source);
    const target = index.get(edge.target);
    if (source !== undefined && target !== undefined) {
      matrix[source][target] = 1;
      matrix[target][source] = 1;
    }
  }
  return matrix;
}

type WorkbenchValue = {
  theme: Theme;
  setTheme: Dispatch<SetStateAction<Theme>>;
  step: WorkbenchStep;
  setStep: Dispatch<SetStateAction<WorkbenchStep>>;
  health: HealthState;
  busy: string | null;
  error: string | null;
  setError: Dispatch<SetStateAction<string | null>>;
  dataset: DatasetResponse | null;
  selectedColumns: string[];
  setSelectedColumns: Dispatch<SetStateAction<string[]>>;
  categoricalColumns: string[];
  setCategoricalColumns: Dispatch<SetStateAction<string[]>>;
  modelName: AlgorithmName;
  setModelName: Dispatch<SetStateAction<AlgorithmName>>;
  scale: boolean;
  setScale: Dispatch<SetStateAction<boolean>>;
  structureSource: StructureSource;
  setStructureSource: Dispatch<SetStateAction<StructureSource>>;
  edgeMode: EdgeMode;
  setEdgeMode: Dispatch<SetStateAction<EdgeMode>>;
  causalEdges: EdgeDefinition[];
  requiredEdges: EdgeDefinition[];
  forbiddenEdges: EdgeDefinition[];
  forbiddenParents: string[];
  forbiddenChildren: string[];
  setForbiddenParents: Dispatch<SetStateAction<string[]>>;
  setForbiddenChildren: Dispatch<SetStateAction<string[]>>;
  addEdge: (mode: EdgeMode, edge: EdgeDefinition) => void;
  removeEdge: (mode: EdgeMode, edge: EdgeDefinition) => void;
  clearEdges: () => void;
  validation: GraphValidationResponse | null;
  discovery: DiscoveryResponse | null;
  editedDiscoveryEdges: GraphEdgeResponse[];
  discoveryValidation: GraphValidationResponse | null;
  discoveryChanged: boolean;
  unresolvedDiscoveryEdges: number;
  addDiscoveryEdge: (edge: EdgeDefinition) => void;
  removeDiscoveryEdge: (edge: GraphEdgeResponse) => void;
  resetDiscoveryGraph: () => void;
  inference: InferenceResponse | null;
  uploadDataset: (file: File) => Promise<void>;
  runDiscovery: () => Promise<void>;
  runInference: (
    factor1: string,
    factor2: string,
    method: InferenceMethod,
    source: InferenceSource,
  ) => Promise<void>;
  canOpenStep: (step: WorkbenchStep) => boolean;
};

const WorkbenchContext = createContext<WorkbenchValue | null>(null);

export function WorkbenchProvider({ children }: PropsWithChildren) {
  const [theme, setTheme] = useState<Theme>(() => {
    const stored = window.localStorage.getItem("cauchan-theme");
    return stored === "dark" ? "dark" : "light";
  });
  const [step, setStep] = useState<WorkbenchStep>("data");
  const [health, setHealth] = useState<HealthState>({ status: "checking", text: "確認中" });
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [dataset, setDataset] = useState<DatasetResponse | null>(null);
  const [selectedColumns, setSelectedColumns] = useState<string[]>([]);
  const [categoricalColumns, setCategoricalColumns] = useState<string[]>([]);
  const [modelName, setModelName] = useState<AlgorithmName>("PC");
  const [scale, setScale] = useState(true);
  const [structureSource, setStructureSource] = useState<StructureSource>("manual");
  const [edgeMode, setEdgeMode] = useState<EdgeMode>("causal");
  const [causalEdges, setCausalEdges] = useState<EdgeDefinition[]>([]);
  const [requiredEdges, setRequiredEdges] = useState<EdgeDefinition[]>([]);
  const [forbiddenEdges, setForbiddenEdges] = useState<EdgeDefinition[]>([]);
  const [forbiddenParents, setForbiddenParents] = useState<string[]>([]);
  const [forbiddenChildren, setForbiddenChildren] = useState<string[]>([]);
  const [validation, setValidation] = useState<GraphValidationResponse | null>(null);
  const [discovery, setDiscovery] = useState<DiscoveryResponse | null>(null);
  const [editedDiscoveryEdges, setEditedDiscoveryEdges] = useState<GraphEdgeResponse[]>([]);
  const [discoveryValidation, setDiscoveryValidation] = useState<GraphValidationResponse | null>(null);
  const [inference, setInference] = useState<InferenceResponse | null>(null);

  const unresolvedDiscoveryEdges = editedDiscoveryEdges.filter(
    (edge) => edge.kind === "undirected",
  ).length;

  const discoveryChanged = useMemo(() => {
    if (!discovery) return false;
    const original = discovery.edges.map(graphEdgeKey).sort();
    const edited = editedDiscoveryEdges.map(graphEdgeKey).sort();
    return original.length !== edited.length || original.some((key, index) => key !== edited[index]);
  }, [discovery, editedDiscoveryEdges]);

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    window.localStorage.setItem("cauchan-theme", theme);
  }, [theme]);

  useEffect(() => {
    setInference(null);
  }, [structureSource]);

  useEffect(() => {
    let active = true;
    const check = async () => {
      try {
        await api.health();
        if (active) setHealth({ status: "ok", text: "接続済み" });
      } catch {
        if (active) setHealth({ status: "error", text: "未接続" });
      }
    };
    void check();
    const timer = window.setInterval(check, 15000);
    return () => {
      active = false;
      window.clearInterval(timer);
    };
  }, []);

  useEffect(() => {
    const selected = new Set(selectedColumns);
    const filterEdges = (edges: EdgeDefinition[]) => edges.filter(
      (edge) => selected.has(edge.source) && selected.has(edge.target),
    );
    setCausalEdges(filterEdges);
    setRequiredEdges(filterEdges);
    setForbiddenEdges(filterEdges);
    setForbiddenParents((current) => current.filter((node) => selected.has(node)));
    setForbiddenChildren((current) => current.filter((node) => selected.has(node)));
    setCategoricalColumns((current) => current.filter((node) => selected.has(node)));
    setDiscovery(null);
    setEditedDiscoveryEdges([]);
    setDiscoveryValidation(null);
    setInference(null);
  }, [selectedColumns]);

  useEffect(() => {
    if (!selectedColumns.length) {
      setValidation(null);
      return undefined;
    }
    let active = true;
    const timer = window.setTimeout(async () => {
      try {
        const result = await api.validateGraph({
          columns: selectedColumns,
          causal_edges: structureSource === "manual" ? causalEdges : [],
          required_edges: requiredEdges,
          forbidden_edges: forbiddenEdges,
          forbidden_parents: forbiddenParents,
          forbidden_children: forbiddenChildren,
        });
        if (active) setValidation(result);
      } catch (requestError) {
        if (active) {
          setValidation({
            valid: false,
            errors: [requestError instanceof Error ? requestError.message : String(requestError)],
            warnings: [],
          });
        }
      }
    }, 300);
    return () => {
      active = false;
      window.clearTimeout(timer);
    };
  }, [
    selectedColumns,
    structureSource,
    causalEdges,
    requiredEdges,
    forbiddenEdges,
    forbiddenParents,
    forbiddenChildren,
  ]);

  useEffect(() => {
    if (!discovery) {
      setDiscoveryValidation(null);
      return undefined;
    }
    let active = true;
    const timer = window.setTimeout(async () => {
      const directedEdges = editedDiscoveryEdges
        .filter((edge) => edge.kind === "directed")
        .map(({ source, target }) => ({ source, target }));
      try {
        const result = await api.validateGraph({
          columns: discovery.columns,
          causal_edges: directedEdges,
          required_edges: requiredEdges,
          forbidden_edges: forbiddenEdges,
          forbidden_parents: forbiddenParents,
          forbidden_children: forbiddenChildren,
        });
        const errors = [...result.errors];
        const warnings = [...result.warnings];
        const undirectedCount = editedDiscoveryEdges.filter(
          (edge) => edge.kind === "undirected",
        ).length;
        if (undirectedCount) {
          errors.push(
            `方向未確定のエッジが${undirectedCount}件あります。削除するか矢印を引いて方向を確定してください。`,
          );
        }
        const directedKeys = new Set(directedEdges.map(edgeKey));
        const missingRequired = requiredEdges.filter((edge) => !directedKeys.has(edgeKey(edge)));
        if (missingRequired.length) {
          warnings.push(
            `必須エッジが最終構造にありません: ${missingRequired
              .map((edge) => `${edge.source} -> ${edge.target}`)
              .join(", ")}`,
          );
        }
        if (active) {
          setDiscoveryValidation({
            valid: errors.length === 0,
            errors,
            warnings,
          });
        }
      } catch (requestError) {
        if (active) {
          setDiscoveryValidation({
            valid: false,
            errors: [requestError instanceof Error ? requestError.message : String(requestError)],
            warnings: [],
          });
        }
      }
    }, 300);
    return () => {
      active = false;
      window.clearTimeout(timer);
    };
  }, [
    discovery,
    editedDiscoveryEdges,
    requiredEdges,
    forbiddenEdges,
    forbiddenParents,
    forbiddenChildren,
  ]);

  const uploadDataset = useCallback(async (file: File) => {
    setBusy("データを読み込んでいます");
    setError(null);
    try {
      const result = await api.uploadDataset(file);
      setDataset(result);
      setSelectedColumns(result.columns);
      setCategoricalColumns([]);
      setStructureSource("manual");
      setEdgeMode("causal");
      setCausalEdges([]);
      setRequiredEdges([]);
      setForbiddenEdges([]);
      setForbiddenParents([]);
      setForbiddenChildren([]);
      setDiscovery(null);
      setEditedDiscoveryEdges([]);
      setDiscoveryValidation(null);
      setInference(null);
      setStep("knowledge");
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : String(requestError));
    } finally {
      setBusy(null);
    }
  }, []);

  const addEdge = useCallback((mode: EdgeMode, edge: EdgeDefinition) => {
    if (edge.source === edge.target) return;
    const setter = mode === "causal"
      ? setCausalEdges
      : mode === "required"
        ? setRequiredEdges
        : setForbiddenEdges;
    setter((current) => uniqueEdges([...current, edge]));
    setInference(null);
  }, []);

  const removeEdge = useCallback((mode: EdgeMode, edge: EdgeDefinition) => {
    const setter = mode === "causal"
      ? setCausalEdges
      : mode === "required"
        ? setRequiredEdges
        : setForbiddenEdges;
    const key = edgeKey(edge);
    setter((current) => current.filter((item) => edgeKey(item) !== key));
    setInference(null);
  }, []);

  const clearEdges = useCallback(() => {
    setCausalEdges([]);
    setRequiredEdges([]);
    setForbiddenEdges([]);
    setInference(null);
  }, []);

  const addDiscoveryEdge = useCallback((edge: EdgeDefinition) => {
    if (edge.source === edge.target) return;
    setEditedDiscoveryEdges((current) => uniqueGraphEdges([
      ...current.filter((item) => !samePair(item, edge)),
      { ...edge, kind: "directed", weight: 1 },
    ]));
    setInference(null);
  }, []);

  const removeDiscoveryEdge = useCallback((edge: GraphEdgeResponse) => {
    const key = graphEdgeKey(edge);
    setEditedDiscoveryEdges((current) => current.filter((item) => graphEdgeKey(item) !== key));
    setInference(null);
  }, []);

  const resetDiscoveryGraph = useCallback(() => {
    setEditedDiscoveryEdges(discovery ? copyGraphEdges(discovery.edges) : []);
    setInference(null);
  }, [discovery]);

  const runDiscovery = useCallback(async () => {
    if (!dataset) return;
    if (structureSource !== "discovery") {
      setError("因果構造の決定方法を「因果探索」に切り替えてください。");
      return;
    }
    if (selectedColumns.length < 2) {
      setError("因果探索には2列以上を選択してください。");
      return;
    }
    if (validation && !validation.valid) {
      setError("事前知識に矛盾があります。Knowledge画面で修正してください。");
      return;
    }
    setBusy("因果構造を探索しています");
    setError(null);
    try {
      const result = await api.discover({
        dataset_id: dataset.dataset_id,
        columns: selectedColumns,
        model_name: modelName,
        scale,
        categorical_columns: categoricalColumns,
        forbidden_parents: forbiddenParents,
        forbidden_children: forbiddenChildren,
        forbidden_edges: forbiddenEdges,
        required_edges: requiredEdges,
      });
      setDiscovery(result);
      setEditedDiscoveryEdges(copyGraphEdges(result.edges));
      setStructureSource("discovery");
      setInference(null);
      setStep("discovery");
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : String(requestError));
    } finally {
      setBusy(null);
    }
  }, [
    dataset,
    structureSource,
    selectedColumns,
    validation,
    modelName,
    scale,
    categoricalColumns,
    forbiddenParents,
    forbiddenChildren,
    forbiddenEdges,
    requiredEdges,
  ]);

  const runInference = useCallback(async (
    factor1: string,
    factor2: string,
    method: InferenceMethod,
    source: InferenceSource,
  ) => {
    if (!dataset) return;

    const columns = source === "discovery" ? discovery?.columns ?? [] : selectedColumns;
    const graphEdges = source === "discovery"
      ? editedDiscoveryEdges
          .filter((edge) => edge.kind === "directed")
          .map(({ source: edgeSource, target }) => ({ source: edgeSource, target }))
      : causalEdges;
    const sourceValidation = source === "discovery" ? discoveryValidation : validation;

    if (!columns.length || !graphEdges.length) {
      setError("推論に使用できる因果構造がありません。");
      return;
    }
    if (source === "discovery" && unresolvedDiscoveryEdges > 0) {
      setError("探索結果の未方向エッジをすべて確定してから推論してください。");
      return;
    }
    if (sourceValidation?.valid === false) {
      setError("最終因果構造に矛盾があります。グラフを修正してください。");
      return;
    }

    setBusy("因果効果を推定しています");
    setError(null);
    try {
      const result = await api.infer({
        dataset_id: dataset.dataset_id,
        factor1,
        factor2,
        method,
        columns,
        causal_matrix: edgesToMatrix(columns, graphEdges),
      });
      setInference(result);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : String(requestError));
    } finally {
      setBusy(null);
    }
  }, [
    dataset,
    discovery,
    selectedColumns,
    editedDiscoveryEdges,
    causalEdges,
    discoveryValidation,
    validation,
    unresolvedDiscoveryEdges,
  ]);

  const canOpenStep = useCallback((target: WorkbenchStep) => {
    if (target === "data") return true;
    if (!dataset) return false;
    if (target === "knowledge") return true;
    if (target === "discovery") return structureSource === "discovery";
    if (structureSource === "manual") {
      return causalEdges.length > 0 && validation?.valid !== false;
    }
    return Boolean(
      discovery
      && editedDiscoveryEdges.some((edge) => edge.kind === "directed")
      && unresolvedDiscoveryEdges === 0
      && discoveryValidation?.valid !== false,
    );
  }, [
    dataset,
    structureSource,
    causalEdges.length,
    validation,
    discovery,
    editedDiscoveryEdges,
    unresolvedDiscoveryEdges,
    discoveryValidation,
  ]);

  const value = useMemo<WorkbenchValue>(() => ({
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
    setSelectedColumns,
    categoricalColumns,
    setCategoricalColumns,
    modelName,
    setModelName,
    scale,
    setScale,
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
    discovery,
    editedDiscoveryEdges,
    discoveryValidation,
    discoveryChanged,
    unresolvedDiscoveryEdges,
    addDiscoveryEdge,
    removeDiscoveryEdge,
    resetDiscoveryGraph,
    inference,
    uploadDataset,
    runDiscovery,
    runInference,
    canOpenStep,
  }), [
    theme,
    step,
    health,
    busy,
    error,
    dataset,
    selectedColumns,
    categoricalColumns,
    modelName,
    scale,
    structureSource,
    edgeMode,
    causalEdges,
    requiredEdges,
    forbiddenEdges,
    forbiddenParents,
    forbiddenChildren,
    addEdge,
    removeEdge,
    clearEdges,
    validation,
    discovery,
    editedDiscoveryEdges,
    discoveryValidation,
    discoveryChanged,
    unresolvedDiscoveryEdges,
    addDiscoveryEdge,
    removeDiscoveryEdge,
    resetDiscoveryGraph,
    inference,
    uploadDataset,
    runDiscovery,
    runInference,
    canOpenStep,
  ]);

  return <WorkbenchContext.Provider value={value}>{children}</WorkbenchContext.Provider>;
}

export function useWorkbench(): WorkbenchValue {
  const context = useContext(WorkbenchContext);
  if (!context) throw new Error("useWorkbench must be used inside WorkbenchProvider");
  return context;
}
