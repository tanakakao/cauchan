export type WorkbenchStep = "data" | "knowledge" | "discovery" | "inference";
export type Theme = "light" | "dark";
export type HealthStatus = "checking" | "ok" | "error";
export type AlgorithmName = "PC" | "DirectLiNGAM" | "GES" | "HillClimbSearch";
export type InferenceMethod =
  | "SCM"
  | "DoWhyLinearRegression"
  | "LinearDML"
  | "CausalForestDML";
export type ImputationMethod = "median" | "most_frequent";
export type EdgeMode = "causal" | "required" | "forbidden";
export type StructureSource = "manual" | "discovery";
export type InferenceSource = StructureSource;

export type EdgeDefinition = {
  source: string;
  target: string;
};

export type DatasetResponse = {
  dataset_id: string;
  filename: string;
  row_count: number;
  columns: string[];
  dtypes: Record<string, string>;
  source_missing_counts: Record<string, number>;
  missing_counts: Record<string, number>;
  imputed_counts: Record<string, number>;
  imputation_methods: Record<string, ImputationMethod>;
  preprocessing_applied: boolean;
};

export type GraphEdgeResponse = EdgeDefinition & {
  source: string;
  target: string;
  kind: "directed" | "undirected";
  weight: number | null;
};

export type DiscoveryResponse = {
  discovery_id: string;
  dataset_id: string;
  model_name: AlgorithmName;
  backend: "castle" | "pgmpy";
  columns: string[];
  causal_matrix: number[][];
  edges: GraphEdgeResponse[];
};

export type InferenceResponse = {
  dataset_id: string;
  discovery_id: string | null;
  factor1: string;
  factor2: string;
  method: InferenceMethod;
  effect: number;
  interpretation: string;
};

export type BatchInferenceResult = {
  factor1: string;
  factor2: string;
  effect: number | null;
  interpretation: string | null;
  error: string | null;
};

export type BatchInferenceResponse = {
  dataset_id: string;
  discovery_id: string | null;
  method: InferenceMethod;
  result_count: number;
  success_count: number;
  failure_count: number;
  results: BatchInferenceResult[];
};

export type GraphValidationResponse = {
  valid: boolean;
  errors: string[];
  warnings: string[];
};

export type HealthState = {
  status: HealthStatus;
  text: string;
};
