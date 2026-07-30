"""モデル層の因果効果推定手法を合成データで検証する。"""

import unittest

import numpy as np
import pandas as pd

from cauchan.models.inference import CausalEffectEstimator


class CausalEffectEstimatorTest(unittest.TestCase):
    """線形SCM、DoWhy、EconML推定器のスモークテスト。"""

    @classmethod
    def setUpClass(cls) -> None:
        rng = np.random.default_rng(42)
        sample_count = 240
        confounder = rng.normal(size=sample_count)
        treatment = 0.8 * confounder + rng.normal(scale=0.8, size=sample_count)
        outcome = (
            2.0 * treatment
            + 1.4 * confounder
            + rng.normal(scale=0.8, size=sample_count)
        )
        cls.dataframe = pd.DataFrame(
            {
                "confounder": confounder,
                "treatment": treatment,
                "outcome": outcome,
            }
        )
        cls.columns = ["confounder", "treatment", "outcome"]
        cls.causal_matrix = np.array(
            [
                [0, 1, 1],
                [0, 0, 1],
                [0, 0, 0],
            ],
            dtype=float,
        )

    def make_estimator(self) -> CausalEffectEstimator:
        """各テスト用に新しい推定器を返す。"""
        return CausalEffectEstimator(
            dataframe=self.dataframe,
            columns=self.columns,
            causal_matrix=self.causal_matrix,
            random_state=42,
        )

    def test_linear_scm_recovers_effect(self) -> None:
        """親変数調整付き線形SCMが真値付近の効果を返す。"""
        effect = self.make_estimator().estimate(
            "treatment",
            "outcome",
            "SCM",
        )
        self.assertTrue(np.isfinite(effect))
        self.assertAlmostEqual(effect, 2.0, delta=0.3)

    def test_dowhy_linear_regression_runs(self) -> None:
        """NetworkX DAGを使うDoWhy線形回帰が実行できる。"""
        effect = self.make_estimator().estimate(
            "treatment",
            "outcome",
            "DoWhyLinearRegression",
        )
        self.assertTrue(np.isfinite(effect))
        self.assertAlmostEqual(effect, 2.0, delta=0.35)

    def test_causal_forest_dml_runs(self) -> None:
        """連続処置のCausalForestDMLが有限な平均効果を返す。"""
        effect = self.make_estimator().estimate(
            "treatment",
            "outcome",
            "CausalForestDML",
        )
        self.assertTrue(np.isfinite(effect))
        self.assertGreater(effect, 0.5)
        self.assertLess(effect, 3.5)


if __name__ == "__main__":
    unittest.main()
