"""FastAPIから利用する因果探索・推論サービス。"""

from io import BytesIO, StringIO
from pathlib import Path
from typing import Iterable

import networkx as nx
import numpy as np
import pandas as pd

from .schemas import EdgeDefinition, GraphEdgeResponse, GraphValidationRequest
from .store import DiscoveryRecord, InMemoryStore


class ServiceError(ValueError):
    """APIでクライアントエラーとして返すサービス例外。"""


BACKEND_BY_MODEL = {
    "PC": "castle",
    "DirectLiNGAM": "castle",
    "GES": "pgmpy",
    "HillClimbSearch": "pgmpy",
}


def read_dataframe(filename: str, content: bytes) -> pd.DataFrame:
    """CSVまたはExcelのバイト列をDataFrameへ変換する。"""
    suffix = Path(filename).suffix.lower()

    if suffix == ".csv":
        errors: list[str] = []
        for encoding in ("utf-8-sig", "utf-8", "cp932", "shift_jis"):
            try:
                text = content.decode(encoding)
                dataframe = pd.read_csv(StringIO(text))
                break
            except (UnicodeDecodeError, pd.errors.ParserError) as exc:
                errors.append(f"{encoding}: {exc}")
        else:
            raise ServiceError(
                "CSVをUTF-8またはShift_JIS/CP932として読み込めませんでした。"
                f" details={errors}"
            )
    elif suffix == ".xlsx":
        try:
            dataframe = pd.read_excel(BytesIO(content))
        except Exception as exc:
            raise ServiceError(f"Excelファイルの読み込みに失敗しました: {exc}") from exc
    else:
        raise ServiceError("対応形式は.csvまたは.xlsxです。")

    if dataframe.empty:
        raise ServiceError("データが空です。")
    if dataframe.columns.duplicated().any():
        duplicated = dataframe.columns[dataframe.columns.duplicated()].tolist()
        raise ServiceError(f"重複した列名があります: {duplicated}")

    dataframe.columns = [str(column) for column in dataframe.columns]
    return dataframe


def validate_selected_columns(
    dataframe: pd.DataFrame,
    columns: list[str],
    *,
    minimum: int = 1,
) -> None:
    """選択列の重複と存在を検証する。"""
    if len(columns) < minimum:
        raise ServiceError(f"{minimum}列以上選択してください。")
    if len(columns) != len(set(columns)):
        raise ServiceError("columnsに重複があります。")

    missing = [column for column in columns if column not in dataframe.columns]
    if missing:
        raise ServiceError(f"データに存在しない列があります: {missing}")


def validate_numeric_data(dataframe: pd.DataFrame, columns: list[str]) -> None:
    """因果効果推定に利用する列が欠損のない数値列か確認する。"""
    non_numeric = [
        column
        for column in columns
        if not pd.api.types.is_numeric_dtype(dataframe[column])
    ]
    if non_numeric:
        raise ServiceError(f"因果効果推定には数値列が必要です: {non_numeric}")

    missing = dataframe[columns].isna().sum()
    missing = missing[missing > 0]
    if not missing.empty:
        raise ServiceError(
            "因果効果推定に使う列に欠損値があります: "
            f"{missing.astype(int).to_dict()}"
        )


def edge_tuples(edges: Iterable[EdgeDefinition]) -> list[tuple[str, str]]:
    """Pydanticのエッジ定義をモデル用タプルへ変換する。"""
    return [(edge.source, edge.target) for edge in edges]


def validate_edge_definitions(
    columns: list[str],
    edges: Iterable[EdgeDefinition],
    label: str,
) -> list[tuple[str, str]]:
    """エッジのノード、自己ループ、重複を検証する。"""
    column_set = set(columns)
    result: list[tuple[str, str]] = []
    seen: set[tuple[str, str]] = set()

    for edge in edges:
        pair = (edge.source, edge.target)
        if edge.source not in column_set or edge.target not in column_set:
            raise ServiceError(f"{label}にcolumns外のノードがあります: {pair}")
        if edge.source == edge.target:
            raise ServiceError(f"{label}に自己ループがあります: {pair}")
        if pair in seen:
            raise ServiceError(f"{label}に重複エッジがあります: {pair}")
        seen.add(pair)
        result.append(pair)

    return result


def matrix_to_edges(
    columns: list[str],
    causal_matrix: np.ndarray,
) -> list[GraphEdgeResponse]:
    """隣接行列をReact Flow向けのエッジ配列へ変換する。"""
    matrix = np.asarray(causal_matrix)
    expected_shape = (len(columns), len(columns))
    if matrix.shape != expected_shape:
        raise ServiceError(
            "causal_matrixの形状がcolumnsと一致しません。"
            f" expected={expected_shape}, actual={matrix.shape}"
        )

    edges: list[GraphEdgeResponse] = []
    for i, source in enumerate(columns):
        for j in range(i + 1, len(columns)):
            target = columns[j]
            forward = matrix[i, j]
            backward = matrix[j, i]

            if forward != 0 and backward != 0:
                edges.append(
                    GraphEdgeResponse(
                        source=source,
                        target=target,
                        kind="undirected",
                        weight=float(max(abs(forward), abs(backward))),
                    )
                )
            elif forward != 0:
                edges.append(
                    GraphEdgeResponse(
                        source=source,
                        target=target,
                        kind="directed",
                        weight=float(forward),
                    )
                )
            elif backward != 0:
                edges.append(
                    GraphEdgeResponse(
                        source=target,
                        target=source,
                        kind="directed",
                        weight=float(backward),
                    )
                )

    return edges


def run_discovery(
    *,
    dataframe: pd.DataFrame,
    columns: list[str],
    model_name: str,
    scale: bool,
    categorical_columns: list[str],
    forbidden_parents: list[str],
    forbidden_children: list[str],
    forbidden_edges: list[EdgeDefinition],
    required_edges: list[EdgeDefinition],
) -> tuple[str, list[str], np.ndarray]:
    """CausalDiscoveryを実行してバックエンド、列、隣接行列を返す。"""
    validate_selected_columns(dataframe, columns, minimum=2)
    validate_selected_columns(dataframe, categorical_columns, minimum=0)

    column_set = set(columns)
    if not set(categorical_columns).issubset(column_set):
        raise ServiceError("categorical_columnsはcolumnsの部分集合にしてください。")

    for label, nodes in (
        ("forbidden_parents", forbidden_parents),
        ("forbidden_children", forbidden_children),
    ):
        unknown = [node for node in nodes if node not in column_set]
        if unknown:
            raise ServiceError(f"{label}にcolumns外のノードがあります: {unknown}")

    forbidden = validate_edge_definitions(columns, forbidden_edges, "forbidden_edges")
    required = validate_edge_definitions(columns, required_edges, "required_edges")
    contradictions = sorted(set(forbidden) & set(required))
    if contradictions:
        raise ServiceError(
            "同じエッジを必須と禁止に指定できません: "
            f"{contradictions}"
        )

    backend = BACKEND_BY_MODEL[model_name]

    # 重い因果推論依存関係はAPI起動時ではなく計算時に読み込む。
    from ..models.model import CausalDiscovery

    model = CausalDiscovery(model_name=model_name, backend=backend)
    model.learn(
        dataframe[columns],
        scale=scale,
        cat_cols=categorical_columns,
        forbidden_parents=forbidden_parents,
        forbidden_children=forbidden_children,
        forbidden_edges=forbidden,
        required_edges=required,
    )

    return backend, list(model.node_names), np.asarray(model.causal_matrix)


def resolve_inference_graph(
    *,
    store: InMemoryStore,
    dataset_id: str,
    discovery_id: str | None,
    columns: list[str],
    causal_matrix: list[list[float]] | None,
) -> tuple[str | None, list[str], np.ndarray]:
    """探索結果または手動行列から因果推論用グラフを解決する。"""
    if discovery_id is not None and causal_matrix is not None:
        raise ServiceError("discovery_idとcausal_matrixは同時に指定できません。")

    if discovery_id is not None:
        record: DiscoveryRecord | None = store.get_discovery(discovery_id)
        if record is None:
            raise ServiceError("指定したdiscovery_idが見つかりません。")
        if record.dataset_id != dataset_id:
            raise ServiceError("discovery_idは別のデータセットに属しています。")
        return discovery_id, list(record.columns), record.causal_matrix.copy()

    if causal_matrix is None:
        raise ServiceError("discovery_idまたはcausal_matrixを指定してください。")
    if not columns:
        raise ServiceError("手動行列を使う場合はcolumnsを指定してください。")

    matrix = np.asarray(causal_matrix, dtype=float)
    expected_shape = (len(columns), len(columns))
    if matrix.shape != expected_shape:
        raise ServiceError(
            "causal_matrixの形状がcolumnsと一致しません。"
            f" expected={expected_shape}, actual={matrix.shape}"
        )
    return None, list(columns), matrix


def run_inference(
    *,
    dataframe: pd.DataFrame,
    columns: list[str],
    causal_matrix: np.ndarray,
    factor1: str,
    factor2: str,
    method: str,
) -> float:
    """指定されたグラフでfactor1からfactor2への因果効果を推定する。"""
    validate_selected_columns(dataframe, columns, minimum=2)
    validate_numeric_data(dataframe, columns)

    if factor1 == factor2:
        raise ServiceError("factor1とfactor2には異なる列を指定してください。")
    if factor1 not in columns or factor2 not in columns:
        raise ServiceError("factor1とfactor2は推論対象columnsに含めてください。")

    from ..models.model import CausalInference

    model = CausalInference(
        df=dataframe[columns],
        columns=columns,
        causal_matrix=causal_matrix,
    )
    dag = model._make_dag()
    if not nx.has_path(dag, factor1, factor2):
        raise ServiceError(
            f"因果グラフに{factor1}から{factor2}への有向経路がありません。"
        )

    effect = model.estimate(factor1=factor1, factor2=factor2, method=method)
    return float(np.asarray(effect).squeeze())


def validate_graph(request: GraphValidationRequest) -> tuple[list[str], list[str]]:
    """手動グラフと探索制約の矛盾を検証する。"""
    errors: list[str] = []
    warnings: list[str] = []

    columns = request.columns
    if len(columns) != len(set(columns)):
        errors.append("columnsに重複があります。")
    column_set = set(columns)

    def collect(
        edges: list[EdgeDefinition],
        label: str,
    ) -> set[tuple[str, str]]:
        result: set[tuple[str, str]] = set()
        for edge in edges:
            pair = (edge.source, edge.target)
            if edge.source not in column_set or edge.target not in column_set:
                errors.append(f"{label}にcolumns外のノードがあります: {pair}")
            if edge.source == edge.target:
                errors.append(f"{label}に自己ループがあります: {pair}")
            if pair in result:
                errors.append(f"{label}に重複エッジがあります: {pair}")
            result.add(pair)
        return result

    causal = collect(request.causal_edges, "causal_edges")
    required = collect(request.required_edges, "required_edges")
    forbidden = collect(request.forbidden_edges, "forbidden_edges")

    for label, nodes in (
        ("forbidden_parents", request.forbidden_parents),
        ("forbidden_children", request.forbidden_children),
    ):
        if len(nodes) != len(set(nodes)):
            errors.append(f"{label}に重複があります。")
        unknown = [node for node in nodes if node not in column_set]
        if unknown:
            errors.append(f"{label}にcolumns外のノードがあります: {unknown}")

    direct_conflicts = sorted(required & forbidden)
    if direct_conflicts:
        errors.append(f"必須と禁止が競合しています: {direct_conflicts}")

    causal_forbidden = sorted(causal & forbidden)
    if causal_forbidden:
        errors.append(f"因果構造と禁止エッジが競合しています: {causal_forbidden}")

    forbidden_parent_set = set(request.forbidden_parents)
    forbidden_child_set = set(request.forbidden_children)
    for source, target in sorted(causal | required):
        if source in forbidden_parent_set:
            errors.append(f"{source}は原因にしない設定ですが、{source} -> {target}があります。")
        if target in forbidden_child_set:
            errors.append(f"{target}は結果にしない設定ですが、{source} -> {target}があります。")

    graph = nx.DiGraph()
    graph.add_nodes_from(columns)
    graph.add_edges_from(causal)
    if not nx.is_directed_acyclic_graph(graph):
        cycles = list(nx.simple_cycles(graph))
        errors.append(f"因果構造に循環があります: {cycles[:5]}")

    reverse_required = sorted(
        (source, target)
        for source, target in required
        if (target, source) in forbidden
    )
    if reverse_required:
        warnings.append(
            "逆方向禁止と必須方向の組み合わせがあります。"
            f"方向付けの事前知識としては妥当です: {reverse_required}"
        )

    return errors, warnings
