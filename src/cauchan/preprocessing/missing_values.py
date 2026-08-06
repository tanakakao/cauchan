"""欠損値補完の共通処理。

FastAPI、Webアプリ、将来のバッチ処理から同じ前処理を利用できるよう、
DataFrameを受け取る純粋な関数として定義する。
"""

from dataclasses import dataclass
from typing import Literal

import pandas as pd


ImputationMethod = Literal["median", "most_frequent"]


class PreprocessingError(ValueError):
    """前処理を完了できない場合に送出する例外。"""


@dataclass(frozen=True)
class ImputationResult:
    """欠損値補完後のデータと処理概要。"""

    dataframe: pd.DataFrame
    source_missing_counts: dict[str, int]
    remaining_missing_counts: dict[str, int]
    imputed_counts: dict[str, int]
    methods: dict[str, ImputationMethod]

    @property
    def applied(self) -> bool:
        """1件以上の欠損値を補完したか返す。"""
        return any(count > 0 for count in self.imputed_counts.values())


def _most_frequent_value(series: pd.Series, column: str):
    """欠損を除いた最頻値を返す。"""
    available = series.dropna()
    if available.empty:
        raise PreprocessingError(
            f"列'{column}'はすべて欠損しているため補完値を決定できません。"
        )

    modes = available.mode(dropna=True)
    if not modes.empty:
        return modes.iloc[0]
    return available.iloc[0]


def _numeric_median(series: pd.Series, column: str):
    """数値列の中央値を返す。"""
    available = series.dropna()
    if available.empty:
        raise PreprocessingError(
            f"列'{column}'はすべて欠損しているため補完値を決定できません。"
        )
    return available.median()


def impute_missing_values(dataframe: pd.DataFrame) -> ImputationResult:
    """列型に応じて欠損値を補完する。

    数値列は外れ値の影響を受けにくい中央値、文字列・カテゴリ・真偽値・
    日時列は最頻値を使用する。元のDataFrameは変更しない。

    Args:
        dataframe: 補完対象の表形式データ。

    Returns:
        補完済みDataFrameと列ごとの処理概要。

    Raises:
        PreprocessingError: 全件欠損の列など、補完値を決定できない場合。
    """
    result = dataframe.copy(deep=True)
    source_missing = {
        column: int(count)
        for column, count in result.isna().sum().items()
    }
    imputed_counts = {column: 0 for column in result.columns}
    methods: dict[str, ImputationMethod] = {}

    for column in result.columns:
        missing_count = source_missing[column]
        if missing_count == 0:
            continue

        series = result[column]
        if (
            pd.api.types.is_numeric_dtype(series)
            and not pd.api.types.is_bool_dtype(series)
        ):
            fill_value = _numeric_median(series, column)
            method: ImputationMethod = "median"
        else:
            fill_value = _most_frequent_value(series, column)
            method = "most_frequent"

        result[column] = series.fillna(fill_value)
        imputed_counts[column] = missing_count
        methods[column] = method

    remaining_missing = {
        column: int(count)
        for column, count in result.isna().sum().items()
    }
    unresolved = {
        column: count
        for column, count in remaining_missing.items()
        if count > 0
    }
    if unresolved:
        raise PreprocessingError(
            f"欠損値を補完できない列があります: {unresolved}"
        )

    return ImputationResult(
        dataframe=result,
        source_missing_counts=source_missing,
        remaining_missing_counts=remaining_missing,
        imputed_counts=imputed_counts,
        methods=methods,
    )
