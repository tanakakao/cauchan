"""API向けの因果効果推定サービス。"""

import numpy as np
import pandas as pd

from ..models import CausalEffectEstimator
from .schemas import BatchInferenceResult
from .services import ServiceError, validate_numeric_data, validate_selected_columns


def _build_estimator(
    dataframe: pd.DataFrame,
    columns: list[str],
    causal_matrix: np.ndarray,
) -> CausalEffectEstimator:
    """入力を検証し、モデル層の因果効果推定器を構築する。"""
    validate_selected_columns(dataframe, columns, minimum=2)
    validate_numeric_data(dataframe, columns)
    try:
        return CausalEffectEstimator(
            dataframe=dataframe,
            columns=columns,
            causal_matrix=np.asarray(causal_matrix, dtype=float),
        )
    except ValueError as exc:
        raise ServiceError(str(exc)) from exc


def run_inference(
    *,
    dataframe: pd.DataFrame,
    columns: list[str],
    causal_matrix: np.ndarray,
    factor1: str,
    factor2: str,
    method: str,
) -> float:
    """指定されたグラフとモデル層の推定手法で因果効果を推定する。"""
    estimator = _build_estimator(dataframe, columns, causal_matrix)
    try:
        return estimator.estimate(
            factor1=factor1,
            factor2=factor2,
            method=method,
        )
    except (ImportError, ModuleNotFoundError, ValueError) as exc:
        raise ServiceError(str(exc)) from exc


def run_batch_inference(
    *,
    dataframe: pd.DataFrame,
    columns: list[str],
    causal_matrix: np.ndarray,
    method: str,
) -> list[BatchInferenceResult]:
    """最終DAGに含まれる全有向エッジの因果効果を推定する。"""
    estimator = _build_estimator(dataframe, columns, causal_matrix)
    edges = list(estimator.dag.edges())
    if not edges:
        raise ServiceError("一括推定の対象となる有向エッジがありません。")

    results: list[BatchInferenceResult] = []
    for factor1, factor2 in edges:
        try:
            effect = estimator.estimate(
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
