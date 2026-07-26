"""FastAPI入出力スキーマ。"""

from typing import Literal

from pydantic import BaseModel, Field


AlgorithmName = Literal["PC", "DirectLiNGAM", "GES", "HillClimbSearch"]
InferenceMethod = Literal["SCM", "LinearDML"]
EdgeKind = Literal["directed", "undirected"]


class EdgeDefinition(BaseModel):
    """方向付きエッジの定義。"""

    source: str = Field(min_length=1)
    target: str = Field(min_length=1)


class DatasetResponse(BaseModel):
    """登録したデータセットの概要。"""

    dataset_id: str
    filename: str
    row_count: int
    columns: list[str]
    dtypes: dict[str, str]
    missing_counts: dict[str, int]


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
    """因果効果推定リクエスト。"""

    dataset_id: str
    factor1: str = Field(min_length=1)
    factor2: str = Field(min_length=1)
    method: InferenceMethod = "LinearDML"
    discovery_id: str | None = None
    columns: list[str] = Field(default_factory=list)
    causal_matrix: list[list[float]] | None = None


class InferenceResponse(BaseModel):
    """因果効果推定結果。"""

    dataset_id: str
    discovery_id: str | None
    factor1: str
    factor2: str
    method: InferenceMethod
    effect: float
    interpretation: str


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
