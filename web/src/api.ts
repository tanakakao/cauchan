import type {
  AlgorithmName,
  BatchInferenceResponse,
  DatasetResponse,
  DiscoveryResponse,
  EdgeDefinition,
  GraphValidationResponse,
  InferenceMethod,
  InferenceResponse,
} from "./types";

const API_BASE_URL = (import.meta.env.VITE_API_BASE_URL as string | undefined)
  ?? "http://127.0.0.1:8002/api/v1";

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  let response: Response;
  try {
    response = await fetch(`${API_BASE_URL}${path}`, init);
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    throw new Error(`APIへ接続できませんでした (${API_BASE_URL}): ${detail}`);
  }

  if (!response.ok) {
    let message = `${response.status} ${response.statusText}`;
    try {
      const payload = await response.json() as { detail?: string };
      if (payload.detail) message = payload.detail;
    } catch {
      // JSONでないエラー本文はHTTPステータスを使用する。
    }
    throw new Error(message);
  }
  if (response.status === 204) return undefined as T;
  return response.json() as Promise<T>;
}

export const api = {
  async health(): Promise<void> {
    await request("/health");
  },

  uploadDataset(file: File): Promise<DatasetResponse> {
    const body = new FormData();
    body.append("file", file);
    return request("/datasets", { method: "POST", body });
  },

  deleteDataset(datasetId: string): Promise<void> {
    return request(`/datasets/${encodeURIComponent(datasetId)}`, { method: "DELETE" });
  },

  discover(payload: {
    dataset_id: string;
    columns: string[];
    model_name: AlgorithmName;
    scale: boolean;
    categorical_columns: string[];
    forbidden_parents: string[];
    forbidden_children: string[];
    forbidden_edges: EdgeDefinition[];
    required_edges: EdgeDefinition[];
  }): Promise<DiscoveryResponse> {
    return request("/discovery", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
  },

  validateGraph(payload: {
    columns: string[];
    causal_edges: EdgeDefinition[];
    required_edges: EdgeDefinition[];
    forbidden_edges: EdgeDefinition[];
    forbidden_parents: string[];
    forbidden_children: string[];
  }): Promise<GraphValidationResponse> {
    return request("/graphs/validate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
  },

  infer(payload: {
    dataset_id: string;
    factor1: string;
    factor2: string;
    method: InferenceMethod;
    discovery_id?: string;
    columns?: string[];
    causal_matrix?: number[][];
  }): Promise<InferenceResponse> {
    return request("/inference", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
  },

  inferBatch(payload: {
    dataset_id: string;
    method: InferenceMethod;
    discovery_id?: string;
    columns?: string[];
    causal_matrix?: number[][];
  }): Promise<BatchInferenceResponse> {
    return request("/inference/batch", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
  },
};
