"""因果グラフを使った因果効果推定モデル。"""

from __future__ import annotations

from typing import Literal

import networkx as nx
import numpy as np
import pandas as pd
from sklearn.ensemble import RandomForestRegressor
from sklearn.linear_model import LinearRegression
from sklearn.preprocessing import StandardScaler


InferenceMethodName = Literal[
    "SCM",
    "DoWhyLinearRegression",
    "LinearDML",
    "CausalForestDML",
]


class CausalEffectEstimator:
    """DAGと観測データから平均因果効果を推定する。

    ``SCM``はモデル層で完結する親変数調整付き線形回帰、
    ``DoWhyLinearRegression``と``LinearDML``はDoWhyの識別処理、
    ``CausalForestDML``はEconMLの因果フォレストを使用する。
    """

    def __init__(
        self,
        dataframe: pd.DataFrame,
        columns: list[str],
        causal_matrix: np.ndarray,
        *,
        random_state: int = 0,
    ) -> None:
        """推定器を初期化する。

        Args:
            dataframe: 推論対象データ。
            columns: 因果グラフのノード順。
            causal_matrix: ``source, target``の順で1を持つ隣接行列。
            random_state: EconMLおよび機械学習モデルの乱数シード。
        """
        self.columns = list(columns)
        self.random_state = random_state
        self.dataframe = self._validate_dataframe(dataframe)
        self.causal_matrix = np.asarray(causal_matrix, dtype=float)
        self.dag = self._make_dag()

    def estimate(
        self,
        factor1: str,
        factor2: str,
        method: InferenceMethodName | str,
    ) -> float:
        """指定した方法でfactor1からfactor2への平均因果効果を推定する。"""
        self._validate_query(factor1, factor2)

        if method == "SCM":
            effect = self._estimate_linear_scm(factor1, factor2)
        elif method == "DoWhyLinearRegression":
            effect = self._estimate_dowhy_linear_regression(factor1, factor2)
        elif method == "LinearDML":
            effect = self._estimate_linear_dml(factor1, factor2)
        elif method == "CausalForestDML":
            effect = self._estimate_causal_forest_dml(factor1, factor2)
        else:
            raise ValueError(
                "methodはSCM、DoWhyLinearRegression、LinearDML、"
                "CausalForestDMLのいずれかを指定してください。"
            )

        scalar = float(np.asarray(effect).squeeze())
        if not np.isfinite(scalar):
            raise ValueError("推定結果が有限値ではありません。")
        return scalar

    def _validate_dataframe(self, dataframe: pd.DataFrame) -> pd.DataFrame:
        """推論対象列が欠損のない数値列であることを確認する。"""
        if len(self.columns) < 2:
            raise ValueError("因果推論には2列以上必要です。")
        if len(self.columns) != len(set(self.columns)):
            raise ValueError("columnsに重複があります。")

        missing_columns = [
            column for column in self.columns if column not in dataframe.columns
        ]
        if missing_columns:
            raise ValueError(f"データに存在しない列があります: {missing_columns}")

        non_numeric = [
            column
            for column in self.columns
            if not pd.api.types.is_numeric_dtype(dataframe[column])
        ]
        if non_numeric:
            raise ValueError(f"因果効果推定には数値列が必要です: {non_numeric}")

        selected = dataframe[self.columns].copy()
        missing_counts = selected.isna().sum()
        missing_counts = missing_counts[missing_counts > 0]
        if not missing_counts.empty:
            raise ValueError(
                "因果効果推定に使う列に欠損値があります: "
                f"{missing_counts.astype(int).to_dict()}"
            )
        return selected

    def _make_dag(self) -> nx.DiGraph:
        """隣接行列から全ノードを含むDAGを構築する。"""
        expected_shape = (len(self.columns), len(self.columns))
        if self.causal_matrix.shape != expected_shape:
            raise ValueError(
                "causal_matrixの形状がcolumnsと一致しません。"
                f" expected={expected_shape}, actual={self.causal_matrix.shape}"
            )
        if np.any(np.diag(self.causal_matrix) != 0):
            raise ValueError("causal_matrixに自己ループが含まれています。")

        dag = nx.DiGraph()
        dag.add_nodes_from(self.columns)
        for source_index, source in enumerate(self.columns):
            for target_index, target in enumerate(self.columns):
                if source_index == target_index:
                    continue
                if self.causal_matrix[source_index, target_index] != 0:
                    dag.add_edge(source, target)

        if not nx.is_directed_acyclic_graph(dag):
            cycles = list(nx.simple_cycles(dag))
            raise ValueError(
                "causal_matrixに有向循環が含まれています。"
                f" cycles={cycles[:5]}"
            )
        return dag

    def _validate_query(self, factor1: str, factor2: str) -> None:
        """変数指定とDAG上の有向経路を検証する。"""
        if factor1 == factor2:
            raise ValueError("factor1とfactor2には異なる列を指定してください。")
        if factor1 not in self.columns or factor2 not in self.columns:
            raise ValueError("factor1とfactor2は推論対象columnsに含めてください。")
        if not nx.has_path(self.dag, factor1, factor2):
            raise ValueError(
                f"因果グラフに{factor1}から{factor2}への有向経路がありません。"
            )

    def _scaled_data(self) -> tuple[pd.DataFrame, StandardScaler]:
        """全変数を標準化してDataFrameとスケーラーを返す。"""
        scaler = StandardScaler()
        scaled = pd.DataFrame(
            scaler.fit_transform(self.dataframe),
            columns=self.columns,
            index=self.dataframe.index,
        )
        return scaled, scaler

    def _restore_scale(
        self,
        standardized_effect: float,
        scaler: StandardScaler,
        factor1: str,
        factor2: str,
    ) -> float:
        """標準化空間の効果を元データの単位へ戻す。"""
        treatment_index = self.columns.index(factor1)
        outcome_index = self.columns.index(factor2)
        treatment_scale = float(scaler.scale_[treatment_index])
        outcome_scale = float(scaler.scale_[outcome_index])
        if treatment_scale == 0:
            raise ValueError(f"介入変数{factor1}の分散が0です。")
        return standardized_effect * outcome_scale / treatment_scale

    def _estimate_linear_scm(self, factor1: str, factor2: str) -> float:
        """介入変数の親ノードを調整する線形SCMで総効果を推定する。"""
        scaled, scaler = self._scaled_data()
        adjustment_columns = list(self.dag.predecessors(factor1))
        feature_columns = [factor1, *adjustment_columns]

        regression = LinearRegression()
        regression.fit(scaled[feature_columns], scaled[factor2])
        standardized_effect = float(np.asarray(regression.coef_).reshape(-1)[0])
        return self._restore_scale(
            standardized_effect,
            scaler,
            factor1,
            factor2,
        )

    def _make_dowhy_model(
        self,
        scaled: pd.DataFrame,
        factor1: str,
        factor2: str,
    ):
        """NetworkXのDAGを直接渡してDoWhyモデルを構築する。"""
        from dowhy import CausalModel

        return CausalModel(
            data=scaled,
            treatment=factor1,
            outcome=factor2,
            graph=self.dag.copy(),
        )

    def _estimate_dowhy_linear_regression(
        self,
        factor1: str,
        factor2: str,
    ) -> float:
        """DoWhyで識別し、backdoor linear regressionで効果を推定する。"""
        scaled, scaler = self._scaled_data()
        model = self._make_dowhy_model(scaled, factor1, factor2)
        estimand = model.identify_effect()
        estimate = model.estimate_effect(
            estimand,
            method_name="backdoor.linear_regression",
        )
        standardized_effect = float(np.asarray(estimate.value).squeeze())
        return self._restore_scale(
            standardized_effect,
            scaler,
            factor1,
            factor2,
        )

    def _estimate_linear_dml(self, factor1: str, factor2: str) -> float:
        """DoWhyの識別結果にEconML LinearDMLを適用する。"""
        from lightgbm import LGBMRegressor

        scaled, scaler = self._scaled_data()
        model = self._make_dowhy_model(scaled, factor1, factor2)
        estimand = model.identify_effect()
        estimate = model.estimate_effect(
            identified_estimand=estimand,
            method_name="backdoor.econml.dml.LinearDML",
            target_units="ate",
            method_params={
                "init_params": {
                    "model_y": LGBMRegressor(
                        n_estimators=100,
                        max_depth=10,
                        learning_rate=0.01,
                        verbose=-1,
                        random_state=self.random_state,
                    ),
                    "model_t": RandomForestRegressor(
                        n_estimators=100,
                        random_state=self.random_state,
                        n_jobs=-1,
                    ),
                    "discrete_treatment": False,
                    "random_state": self.random_state,
                },
                "fit_params": {},
            },
        )
        standardized_effect = float(np.asarray(estimate.value).squeeze())
        return self._restore_scale(
            standardized_effect,
            scaler,
            factor1,
            factor2,
        )

    def _causal_forest_features(self, factor1: str, factor2: str) -> list[str]:
        """処置後変数を除外して因果フォレスト用ベースライン変数を選ぶ。"""
        descendants = nx.descendants(self.dag, factor1)
        candidates = [
            column
            for column in self.columns
            if column not in descendants and column not in {factor1, factor2}
        ]
        return [
            column
            for column in candidates
            if self.dataframe[column].nunique(dropna=False) > 1
        ]

    def _estimate_causal_forest_dml(
        self,
        factor1: str,
        factor2: str,
    ) -> float:
        """EconML CausalForestDMLで異質的効果を学習し、その平均を返す。"""
        from econml.dml import CausalForestDML

        if len(self.dataframe) < 20:
            raise ValueError(
                "CausalForestDMLには20行以上のデータを用意してください。"
            )

        feature_columns = self._causal_forest_features(factor1, factor2)
        if not feature_columns:
            raise ValueError(
                "CausalForestDMLには介入変数の非子孫となるベースライン変数が"
                "1列以上必要です。"
            )

        scaled, scaler = self._scaled_data()
        sample_count = len(scaled)
        min_samples_leaf = max(2, min(10, sample_count // 20))
        nuisance_leaf = max(2, min(5, sample_count // 20))

        estimator = CausalForestDML(
            model_y=RandomForestRegressor(
                n_estimators=100,
                min_samples_leaf=nuisance_leaf,
                random_state=self.random_state,
                n_jobs=-1,
            ),
            model_t=RandomForestRegressor(
                n_estimators=100,
                min_samples_leaf=nuisance_leaf,
                random_state=self.random_state,
                n_jobs=-1,
            ),
            discrete_treatment=False,
            cv=2,
            n_estimators=200,
            min_samples_leaf=min_samples_leaf,
            max_samples=0.45,
            inference=False,
            random_state=self.random_state,
            n_jobs=-1,
        )
        features = scaled[feature_columns].to_numpy()
        estimator.fit(
            scaled[factor2].to_numpy(),
            scaled[factor1].to_numpy(),
            X=features,
            W=None,
        )
        conditional_effects = np.asarray(
            estimator.effect(features, T0=0, T1=1),
            dtype=float,
        )
        standardized_effect = float(np.mean(conditional_effects))
        return self._restore_scale(
            standardized_effect,
            scaler,
            factor1,
            factor2,
        )
