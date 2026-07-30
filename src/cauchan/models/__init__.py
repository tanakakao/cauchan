"""因果探索・推論モデル。

重いgCastle・DoWhy・EconML依存関係は、実際に各モデルを利用するときに
読み込む。FastAPI起動時にはインポートしない。
"""

from typing import TYPE_CHECKING, Any

if TYPE_CHECKING:
    from .inference import CausalEffectEstimator, InferenceMethodName
    from .model import CausalDiscovery, CausalInference

__all__ = [
    "CausalDiscovery",
    "CausalInference",
    "CausalEffectEstimator",
    "InferenceMethodName",
]


def __getattr__(name: str) -> Any:
    """公開モデルを必要になった時点で遅延読み込みする。"""
    if name in {"CausalDiscovery", "CausalInference"}:
        from .model import CausalDiscovery, CausalInference

        return {
            "CausalDiscovery": CausalDiscovery,
            "CausalInference": CausalInference,
        }[name]
    if name in {"CausalEffectEstimator", "InferenceMethodName"}:
        from .inference import CausalEffectEstimator, InferenceMethodName

        return {
            "CausalEffectEstimator": CausalEffectEstimator,
            "InferenceMethodName": InferenceMethodName,
        }[name]
    raise AttributeError(f"module {__name__!r} has no attribute {name!r}")
