"""プロセス内データストア。

初期実装ではDataFrameと探索結果をメモリに保持する。複数ワーカー構成や
永続化が必要になった段階でRedis、DB、オブジェクトストレージ等へ置き換える。
"""

from dataclasses import dataclass
from threading import RLock
from uuid import uuid4

import numpy as np
import pandas as pd


@dataclass(frozen=True)
class DatasetRecord:
    """登録済みデータセット。"""

    dataset_id: str
    filename: str
    dataframe: pd.DataFrame


@dataclass(frozen=True)
class DiscoveryRecord:
    """登録済み因果探索結果。"""

    discovery_id: str
    dataset_id: str
    model_name: str
    backend: str
    columns: list[str]
    causal_matrix: np.ndarray


class InMemoryStore:
    """スレッドセーフな簡易インメモリストア。"""

    def __init__(self) -> None:
        self._datasets: dict[str, DatasetRecord] = {}
        self._discoveries: dict[str, DiscoveryRecord] = {}
        self._lock = RLock()

    def add_dataset(self, filename: str, dataframe: pd.DataFrame) -> DatasetRecord:
        """データセットを登録する。"""
        dataset_id = str(uuid4())
        record = DatasetRecord(
            dataset_id=dataset_id,
            filename=filename,
            dataframe=dataframe.copy(),
        )
        with self._lock:
            self._datasets[dataset_id] = record
        return record

    def get_dataset(self, dataset_id: str) -> DatasetRecord | None:
        """データセットを取得する。"""
        with self._lock:
            return self._datasets.get(dataset_id)

    def delete_dataset(self, dataset_id: str) -> bool:
        """データセットと紐づく探索結果を削除する。"""
        with self._lock:
            removed = self._datasets.pop(dataset_id, None) is not None
            discovery_ids = [
                discovery_id
                for discovery_id, record in self._discoveries.items()
                if record.dataset_id == dataset_id
            ]
            for discovery_id in discovery_ids:
                self._discoveries.pop(discovery_id, None)
            return removed

    def add_discovery(
        self,
        dataset_id: str,
        model_name: str,
        backend: str,
        columns: list[str],
        causal_matrix: np.ndarray,
    ) -> DiscoveryRecord:
        """因果探索結果を登録する。"""
        discovery_id = str(uuid4())
        record = DiscoveryRecord(
            discovery_id=discovery_id,
            dataset_id=dataset_id,
            model_name=model_name,
            backend=backend,
            columns=list(columns),
            causal_matrix=np.asarray(causal_matrix).copy(),
        )
        with self._lock:
            self._discoveries[discovery_id] = record
        return record

    def get_discovery(self, discovery_id: str) -> DiscoveryRecord | None:
        """因果探索結果を取得する。"""
        with self._lock:
            return self._discoveries.get(discovery_id)


store = InMemoryStore()
