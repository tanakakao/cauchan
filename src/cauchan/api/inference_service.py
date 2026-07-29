"""API向けの因果効果推定サービス。"""

import networkx as nx
import numpy as np
import pandas as pd
from sklearn.linear_model import LinearRegression
from sklearn.preprocessing import StandardScaler

from .schemas import BatchInferenceResult
from .services import ServiceError, validate_numeric_data, validate_selected_columns


def make_dag(columns: list[str], causal_matrix: np.ndarray) -> nx.DiGraph:
    """隣接行列から有向非巡回グラフを構築する。"""
    matrix = np.asarray(causal_matrix, dtype=float)
    expected_shape = (len(columns), len(columns))
    if matrix.shape != expected_shape:
        raise ServiceError(
            "causal_matrixの形状がcolumnsと一致しません。"
            f" expected={expected_shape}, actual={matrix.shape}"
        )
    if np.any(np.diag(matrix) != 0):
        raise ServiceError("causal_matrixに自己ループが含まれています。")

    dag = nx.DiGraph()
    dag.add_nodes_from(columns)
    for source_index, source in enumerate(columns):
        for target_index, target in enumerate(columns):
            if source_index == target_index:
                continue
            if matrix[source_index, target_index] != 0:
                dag.add_edge(source, target)

    if not nx.is_directed_acyclic_graph(dag):
        cycles = list(nx.simple_cycles(dag))
        raise ServiceError(
            "causal_matrixに有向循環が含まれています。"
            f" cycles={cycles[:5]}"
        )
    return dag


def _estimate_scm(
    dataframe: pd.DataFrame,
    columns: list[str],
    dag: nx.DiGraph,
    factor1: str,
    factor2: str,
) -> float:
    """介入変数の親ノードを調整する線形SCMで総効果を推定する。"""
    scaler = StandardScaler()
    scaled = pd.DataFrame(
        scaler.fit_transform(dataframe[columns]),
        columns=columns,
        index=dataframe.index,
    )

    adjustment_columns = list(dag.predecessors(factor1))
    feature_columns = [factor1, *adjustment_columns]
    regression = LinearRegression()
    regression.fit(scaled[feature_columns], scaled[factor2])

    standardized_effect = float(np.asarray(regression.coef_).reshape(-1)[0])
    treatment_index = columns.index(factor1)
    outcome_index = columns.index(factor2)
    return (
        standardized_effect
        * scaler.scale_[outcome_index]
        / scaler.scale_[treatment_index]
    )


def _estimate_linear_dml(
    dataframe: pd.DataFrame,
    columns: list[str],
    causal_matrix: np.ndarray,
    factor1: str,
    factor2: str,
) -> float:
    """既存のDoWhy/EconML実装でLinearDMLを実行する。"""
    from ..models.model import CausalInference

    model = CausalInference(
        df=dataframe[columns],
        columns=columns,
        causal_matrix=causal_matrix,
    )
    return float(
        np.asarray(
            model.estimate(
                factor1=factor1,
                factor2=factor2,
                method="LinearDML",
            )
        ).squeeze()
    )


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

    matrix = np.asarray(causal_matrix, dtype=float)
    dag = make_dag(columns, matrix)
    if not nx.has_path(dag, factor1, factor2):
        raise ServiceError(
            f"因果グラフに{factor1}から{factor2}への有向経路がありません。"
        )

    if method == "SCM":
        effect = _estimate_scm(dataframe, columns, dag, factor1, factor2)
    elif method == "LinearDML":
        effect = _estimate_linear_dml(
            dataframe,
            columns,
            matrix,
            factor1,
            factor2,
        )
    else:
        raise ServiceError("methodはSCMまたはLinearDMLを指定してください。")

    if not np.isfinite(effect):
        raise ServiceError("推定結果が有限値ではありません。")
    return float(effect)


def run_batch_inference(
    *,
    dataframe: pd.DataFrame,
    columns: list[str],
    causal_matrix: np.ndarray,
    method: str,
) -> list[BatchInferenceResult]:
    """最終DAGに含まれる全有向エッジの因果効果を推定する。"""
    validate_selected_columns(dataframe, columns, minimum=2)
    validate_numeric_data(dataframe, columns)

    matrix = np.asarray(causal_matrix, dtype=float)
    dag = make_dag(columns, matrix)
    edges = list(dag.edges())
    if not edges:
        raise ServiceError("一括推定の対象となる有向エッジがありません。")

    results: list[BatchInferenceResult] = []
    for factor1, factor2 in edges:
        try:
            effect = run_inference(
                dataframe=dataframe,
                columns=columns,
                causal_matrix=matrix,
                factor1=factor1,
                factor2=factor2,
                method=method,
            )
            results.append(
                BatchInferenceResult(
                    factor1=factor1,
                    factor2=factor2,
                    effect=effect,
                    interpretation=(
                        f"{factor1}を1単位増加させたとき、"
                        f"{factor2}は平均で{effect:.6g}単位変化すると推定されます。"
                    ),
                )
            )
        except Exception as exc:  # 個別失敗は一括処理を停止しない。
            results.append(
                BatchInferenceResult(
                    factor1=factor1,
                    factor2=factor2,
                    error=f"{type(exc).__name__}: {exc}",
                )
            )

    return results
