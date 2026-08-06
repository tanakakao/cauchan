"""FastAPI入出力スキーマ。"""

from typing import Literal

from pydantic import BaseModel, Field


AlgorithmName = Literal["PC", "DirectLiNGAM", "GES", "HillClimbSearch"]
InferenceMethod = Literal[
    "SCM",
    "DoWhyLinearRegression",
    "LinearDML",
    "CausalForestDML",
]
ImputationMethod = Literal["median", "most_frequent"]
EdgeKind = Literal["directed", "undirected"]


class EdgeDefinition(BaseModel):
    """方向付きエッジの定義。"""

    source: str = Field(min_length=1)
    target: str = Field(min_length=1)


class DatasetResponse(BaseModel):
    """登録・前処理済みデータセットの概要。"""

    dataset_id: str
    filename: str
    row_count: int
    columns: list[str]
    dtypes: dict[str, str]
    source_missing_counts: dict[str, int]
    missing_counts: dict[str, int]
    imputed_counts: dict[str, int]
    imputation_methods: dict[str, ImputationMethod]
    preprocessing_applied: bool


class DiscoveryRequest(BaseModel):
    """因果構造探索リクエスト。"""

    dataset_id: str
    columns: list[str] = Field(min_length=2)
    model_name: AlgorithmName = "PC"
    scale: bool = True
    categorical_columns: list[str] = Field(default_factory=list)
    forbidden_parents: list[str] = Field(default_factory=list)
    forbidden_children: list[str] = Field(default_factory=list)
    forbidden_edges: list[EdgeDefinition] = Field(default_factory=list)
    required_edges: list[EdgeDefinition] = Field(default_factory=list)


class GraphEdgeResponse(BaseModel):
    """画面表示用の探索結果エッジ。"""

    source: str
    target: str
    kind: EdgeKind
    weight: float | None = None


class DiscoveryResponse(BaseModel):
    """因果構造探索結果。"""

    discovery_id: str
    dataset_id: str
    model_name: AlgorithmName
    backend: Literal["castle", "pgmpy"]
    columns: list[str]
    causal_matrix: list[list[float]]
    edges: list[GraphEdgeResponse]


class InferenceRequest(BaseModel):
    """単一の因果効果推定リクエスト。"""

    dataset_id: str
    factor1: str = Field(min_length=1)
    factor2: str = Field(min_length=1)
    method: InferenceMethod = "LinearDML"
    discovery_id: str | None = None
    columns: list[str] = Field(default_factory=list)
    causal_matrix: list[list[float]] | None = None


class InferenceResponse(BaseModel):
    """単一の因果効果推定結果。"""

    dataset_id: str
    discovery_id: str | None
    factor1: str
    factor2: str
    method: InferenceMethod
    effect: float
    interpretation: str


class BatchInferenceRequest(BaseModel):
    """最終構造に含まれる全有向エッジの一括推定リクエスト。"""

    dataset_id: str
    method: InferenceMethod = "SCM"
    discovery_id: str | None = None
    columns: list[str] = Field(default_factory=list)
    causal_matrix: list[list[float]] | None = None


class BatchInferenceResult(BaseModel):
    """一括推定における1エッジ分の結果。"""

    factor1: str
    factor2: str
    effect: float | None = None
    interpretation: str | None = None
    error: str | None = None


class BatchInferenceResponse(BaseModel):
    """全有向エッジの一括推定結果。"""

    dataset_id: str
    discovery_id: str | None
    method: InferenceMethod
    result_count: int
    success_count: int
    failure_count: int
    results: list[BatchInferenceResult]


class GraphValidationRequest(BaseModel):
    """Reactのグラフエディタから送られる制約定義。"""

    columns: list[str] = Field(min_length=1)
    causal_edges: list[EdgeDefinition] = Field(default_factory=list)
    required_edges: list[EdgeDefinition] = Field(default_factory=list)
    forbidden_edges: list[EdgeDefinition] = Field(default_factory=list)
    forbidden_parents: list[str] = Field(default_factory=list)
    forbidden_children: list[str] = Field(default_factory=list)


class GraphValidationResponse(BaseModel):
    """グラフおよび制約の検証結果。"""

    valid: bool
    errors: list[str]
    warnings: list[str]


class HealthResponse(BaseModel):
    """ヘルスチェック結果。"""

    status: Literal["ok"]
    service: str
