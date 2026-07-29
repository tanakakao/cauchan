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
  GraphValidationResponse,
  HealthState,
  InferenceMethod,
  InferenceResponse,
  InferenceSource,
  Theme,
  WorkbenchStep,
} from "../types";

export const STEPS: Array<[WorkbenchStep, string, string]> = [
  ["data", "Data", "読込・確認"],
  ["knowledge", "Knowledge", "構造・制約"],
  ["discovery", "Discovery", "探索・確認"],
  ["inference", "Inference", "効果推定"],
];

function edgeKey(edge: EdgeDefinition): string {
  return `${edge.source}\u0000${edge.target}`;
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
  const [edgeMode, setEdgeMode] = useState<EdgeMode>("causal");
  const [causalEdges, setCausalEdges] = useState<EdgeDefinition[]>([]);
  const [requiredEdges, setRequiredEdges] = useState<EdgeDefinition[]>([]);
  const [forbiddenEdges, setForbiddenEdges] = useState<EdgeDefinition[]>([]);
  const [forbiddenParents, setForbiddenParents] = useState<string[]>([]);
  const [forbiddenChildren, setForbiddenChildren] = useState<string[]>([]);
  const [validation, setValidation] = useState<GraphValidationResponse | null>(null);
  const [discovery, setDiscovery] = useState<DiscoveryResponse | null>(null);
  const [inference, setInference] = useState<InferenceResponse | null>(null);

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    window.localStorage.setItem("cauchan-theme", theme);
  }, [theme]);

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
          causal_edges: causalEdges,
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
    causalEdges,
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
      setCausalEdges([]);
      setRequiredEdges([]);
      setForbiddenEdges([]);
      setForbiddenParents([]);
      setForbiddenChildren([]);
      setDiscovery(null);
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
    setDiscovery(null);
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
    setDiscovery(null);
    setInference(null);
  }, []);

  const clearEdges = useCallback(() => {
    setCausalEdges([]);
    setRequiredEdges([]);
    setForbiddenEdges([]);
    setDiscovery(null);
    setInference(null);
  }, []);

  const runDiscovery = useCallback(async () => {
    if (!dataset) return;
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
      setInference(null);
      setStep("inference");
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : String(requestError));
    } finally {
      setBusy(null);
    }
  }, [
    dataset,
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
    setBusy("因果効果を推定しています");
    setError(null);
    try {
      const payload = source === "discovery"
        ? {
            dataset_id: dataset.dataset_id,
            factor1,
            factor2,
            method,
            discovery_id: discovery?.discovery_id,
          }
        : {
            dataset_id: dataset.dataset_id,
            factor1,
            factor2,
            method,
            columns: selectedColumns,
            causal_matrix: edgesToMatrix(selectedColumns, causalEdges),
          };
      const result = await api.infer(payload);
      setInference(result);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : String(requestError));
    } finally {
      setBusy(null);
    }
  }, [dataset, discovery, selectedColumns, causalEdges]);

  const canOpenStep = useCallback((target: WorkbenchStep) => {
    if (target === "data") return true;
    if (!dataset) return false;
    if (target === "knowledge" || target === "discovery") return true;
    return Boolean(discovery || causalEdges.length);
  }, [dataset, discovery, causalEdges.length]);

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
