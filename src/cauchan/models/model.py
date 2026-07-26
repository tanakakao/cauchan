import pandas as pd
import numpy as np
import networkx as nx
from sklearn.preprocessing import StandardScaler
import logging

for name in ("castle", "castle.backend"):
    lg = logging.getLogger(name)
    lg.setLevel(logging.ERROR)   # INFOを出させない
    lg.propagate = False
    if not lg.handlers:
        lg.addHandler(logging.NullHandler())
import warnings
warnings.filterwarnings("ignore")

import castle.algorithms as castle_alg
import pgmpy.estimators as pgmpy_est
from castle.common.priori_knowledge import PrioriKnowledge

gcastle_model_dict = {
    "PC":castle_alg.PC(variant='stable', alpha=0.0),
    "GES":castle_alg.GES(),
    "ICALiNGAM":castle_alg.ICALiNGAM(),
    "DirectLiNGAM":castle_alg.DirectLiNGAM(),
    "Notears":castle_alg.Notears(),
    "NotearsNonlinear":castle_alg.NotearsNonlinear(),
    "GOLEM":castle_alg.GOLEM(),
    "ANMNonlinear":castle_alg.anm.ANMNonlinear(alpha=1e-3),
    "DAG_GNN":castle_alg.DAG_GNN(),
    "CORL": castle_alg.CORL(iteration=250),
    "RL": castle_alg.RL(nb_epoch=250)
}

class CausalDiscovery:
    """指定したバックエンドで因果構造を探索する。"""

    def __init__(
        self,
        model_name: str,
        backend: str = "castle"
    ):
        """因果探索モデルを初期化する。

        Args:
            model_name (str): 使用する因果探索アルゴリズム名。
            backend (str): ``castle`` または ``pgmpy``。
        """
        self.model_name = model_name
        self.backend = backend  # "castle" or "pgmpy"
        self.node_names = []
    
    def learn(
        self,
        df,
        scale=True,
        cat_cols=None,
        forbidden_parents=None,
        forbidden_children=None,
        forbidden_edges=None,
        required_edges=None
    ):
        """データから因果構造を学習する。

        Args:
            df (pandas.DataFrame): 学習対象のデータ。
            scale (bool): 数値変数を標準化するかどうか。
            cat_cols (list[str] | None): カテゴリ変数の列名。
            forbidden_parents (list[str] | None): 原因にしない変数。
            forbidden_children (list[str] | None): 結果にしない変数。
            forbidden_edges (list[tuple[str, str]] | None): 禁止するエッジ。
            required_edges (list[tuple[str, str]] | None): 必須のエッジ。
        """

        # カテゴリ列処理
        cat_cols = cat_cols or df.select_dtypes(include=["object", "category"]).columns.tolist()
        df = df.copy()

        if self.backend == "castle":
            self._learn_castle(df, scale, cat_cols,
                               forbidden_parents, forbidden_children,
                               forbidden_edges, required_edges)
        elif self.backend == "pgmpy":
            self._learn_pgmpy(df, scale, cat_cols,
                              forbidden_parents, forbidden_children,
                              forbidden_edges, required_edges)
        else:
            raise ValueError("backend must be either 'castle' or 'pgmpy'")

    def _learn_castle(
        self,
        df,
        scale,
        cat_cols,
        forbidden_parents,
        forbidden_children,
        forbidden_edges,
        required_edges
    ):
        """gCastleを使用して因果構造を学習する。

        Args:
            df (pandas.DataFrame): 学習対象のデータ。
            scale (bool): 数値変数を標準化するかどうか。
            cat_cols (list[str]): カテゴリ変数の列名。
            forbidden_parents (list[str] | None): 原因にしない変数。
            forbidden_children (list[str] | None): 結果にしない変数。
            forbidden_edges (list[tuple[str, str]] | None): 禁止するエッジ。
            required_edges (list[tuple[str, str]] | None): 必須のエッジ。
        """

        # カテゴリ変数処理
        if cat_cols is None:
            cat_cols = df.select_dtypes(include=["object", "category"]).columns.tolist()

        df = pd.get_dummies(df, columns=cat_cols, drop_first=True, dtype=float)

        # スケーリング対象：One-Hot以外の列（つまり元の数値変数）
        if scale:
            num_cols = [col for col in df.columns if not any(col.startswith(cat + "_") for cat in cat_cols)]
            scaler = StandardScaler()
            df[num_cols] = scaler.fit_transform(df[num_cols])

        # node_namesはエンコード後のカラムに再定義
        self.node_names = df.columns.tolist()
        n_nodes = len(self.node_names)

        # インデックス変換
        name_to_idx = {name: i for i, name in enumerate(self.node_names)}
        
        forbidden_parent_indices = []
        if forbidden_parents:
            forbidden_parent_indices = [
                name_to_idx[name] for name in forbidden_parents
            ]

        forbidden_child_indices = []
        if forbidden_children:
            forbidden_child_indices = [
                name_to_idx[name] for name in forbidden_children
            ]

        forbidden_index_edges = []
        if forbidden_edges:
            forbidden_index_edges = [
                (name_to_idx[i], name_to_idx[j]) for i, j in forbidden_edges
            ]

        required_index_edges = []
        if required_edges:
            required_index_edges = [
                (name_to_idx[i], name_to_idx[j]) for i, j in required_edges
            ]

        if forbidden_parent_indices and required_index_edges:
            required_index_edges = [
                (i, j) for (i, j) in required_index_edges if i not in forbidden_parent_indices
            ]

        if forbidden_child_indices and required_index_edges:
            required_index_edges = [
                (i, j) for (i, j) in required_index_edges if j not in forbidden_child_indices
            ]

        if self.model_name == "DirectLiNGAM":
            prior = np.full((n_nodes, n_nodes), -1)

            for i in forbidden_parent_indices:
                prior[i, :] = 0

            for j in forbidden_child_indices:
                prior[:, j] = 0

            for i, j in forbidden_index_edges:
                prior[i, j] = 0

            for i, j in required_index_edges:
                prior[i, j] = 1

            prior = prior.T

        elif self.model_name == "PC":
            prior = PrioriKnowledge(n_nodes=n_nodes)

            for i in forbidden_parent_indices:
                for j in range(n_nodes):
                    prior.add_forbidden_edges([(i, j)])

            for j in forbidden_child_indices:
                for i in range(n_nodes):
                    prior.add_forbidden_edges([(i, j)])

            for i, j in forbidden_index_edges:
                prior.add_forbidden_edges([(i, j)])

            for i, j in required_index_edges:
                prior.add_required_edges([(i, j)])
        else:
            prior = None

        if self.model_name == "DirectLiNGAM":
            self.model = castle_alg.DirectLiNGAM(thresh=0.3, prior_knowledge=prior)
        elif self.model_name == "PC":
            print(n_nodes)
            self.model = castle_alg.PC(priori_knowledge=prior)
        else:
            self.model = gcastle_model_dict.get(self.model_name, None)
            if self.model is None:
                raise ValueError(f"Model '{self.model_name}' is not supported.")

        self.model.learn(df)

        if self.model_name in ["ICALiNGAM", "DirectLiNGAM"]:
            self.causal_matrix = self.model.weight_causal_matrix
        else:
            self.causal_matrix = self.model.causal_matrix

    def _learn_pgmpy(
        self,
        df,
        scale,
        cat_cols,
        forbidden_parents,
        forbidden_children,
        forbidden_edges,
        required_edges
    ):
        """pgmpyを使用して因果構造を学習する。

        Args:
            df (pandas.DataFrame): 学習対象のデータ。
            scale (bool): 数値変数を標準化するかどうか。
            cat_cols (list[str]): カテゴリ変数の列名。
            forbidden_parents (list[str] | None): 原因にしない変数。
            forbidden_children (list[str] | None): 結果にしない変数。
            forbidden_edges (list[tuple[str, str]] | None): 禁止するエッジ。
            required_edges (list[tuple[str, str]] | None): 必須のエッジ。
        """

        self.node_names = df.columns.tolist()
        
        # カテゴリ変数を category 型に
        if cat_cols:
            for col in cat_cols:
                df[col] = df[col].astype("category")
        
        # スケーリング（カテゴリ変数以外に適用）
        if scale:
            cat_cols = cat_cols or []
            num_cols = [col for col in df.columns if col not in cat_cols]
            scaler = StandardScaler()
            df[num_cols] = scaler.fit_transform(df[num_cols])

        all_forbidden_edges = []
        all_required_edges = []
        # forbidden_edges / required_edges はそのまま設定
        if forbidden_edges:
            all_forbidden_edges.extend(forbidden_edges)

        if required_edges:
            all_required_edges.extend(required_edges)

        # forbidden_parents: それらを親に持つエッジをすべて禁止
        if forbidden_parents:
            for p in forbidden_parents:
                for c in self.node_names:
                    if (p, c) not in all_forbidden_edges:
                        all_forbidden_edges.append((p, c))

        # forbidden_children: それらを子に持つエッジをすべて禁止
        if forbidden_children:
            for c in forbidden_children:
                for p in self.node_names:
                    if (p, c) not in all_forbidden_edges:
                        all_forbidden_edges.append((p, c))

        # ExpertKnowledgeの準備
        ex = pgmpy_est.ExpertKnowledge(
            required_edges=all_required_edges,
            forbidden_edges=all_forbidden_edges
        )

        # モデル選択と推定
        if self.model_name == "GES":
            self.model = pgmpy_est.GES(data=df)
        elif self.model_name == "HillClimbSearch":
            self.model = pgmpy_est.HillClimbSearch(data=df)
        else:
            raise ValueError(f"Model '{self.model_name}' is not supported.")

        self.estimated_dag = self.model.estimate(
            scoring_method="bic-cg" if cat_cols is not None else "bic",
            expert_knowledge=ex
        )

        self.causal_matrix = self._causal_matrix()

    def _causal_matrix(self):
        """推定済みDAGを隣接行列へ変換する。

        Returns:
            numpy.ndarray: ノード順に並んだ隣接行列。
        """
        matrix = np.zeros((len(self.node_names), len(self.node_names)))
        for u, v in self.estimated_dag.edges():
            i, j = self.node_names.index(u), self.node_names.index(v)
            matrix[i, j] = 1
        return matrix


class CausalInference:
    """因果グラフを使用して2変数間の因果効果を推定する。"""

    def __init__(self, df, columns, causal_matrix):
        """因果推論器を初期化する。

        Args:
            df (pandas.DataFrame): 推論対象のデータ。
            columns (list[str]): 推論に使用する列名。
            causal_matrix (numpy.ndarray): 因果関係を表す隣接行列。
        """
        self.df = df
        self.columns = columns
        self.causal_matrix = causal_matrix

    def estimate(self, factor1, factor2, method):
        """指定した2変数間の因果効果を推定する。

        Args:
            factor1 (str): 介入変数の列名。
            factor2 (str): 結果変数の列名。
            method (str): 推定手法。``SCM`` または ``LinearDML``。

        Returns:
            float: 元データのスケールに換算した因果効果。
        """
        from dowhy import CausalModel
        from lightgbm import LGBMRegressor
        from sklearn.ensemble import RandomForestRegressor

        selected_data = self.df[self.columns]
        scaler = StandardScaler()
        selected_data = pd.DataFrame(
            scaler.fit_transform(selected_data), columns=self.columns
        )
        model_dowhy = CausalModel(
            data=selected_data,
            treatment=[factor1],
            outcome=[factor2],
            graph=self._make_graph_str() if method in ["LinearDML", "SCM"] else None,
        )
        estimand = model_dowhy.identify_effect()

        if method == "SCM":
            causal_estimate = model_dowhy.estimate_effect(
                estimand, method_name="backdoor.linear_regression"
            ).value
        elif method == "LinearDML":
            causal_estimate = model_dowhy.estimate_effect(
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
                        ),
                        "model_t": RandomForestRegressor(),
                        "discrete_treatment": False,
                    },
                    "fit_params": {},
                },
            ).value
        else:
            raise ValueError("method must be either 'SCM' or 'LinearDML'")

        treat_idx = self.columns.index(factor1)
        outcome_idx = self.columns.index(factor2)
        return causal_estimate * scaler.scale_[outcome_idx] / scaler.scale_[treat_idx]

    def _make_dag(self):
        """隣接行列をDoWhyで利用可能なDAGへ変換する。

        PC法では、向きが確定しない辺が隣接行列上の双方向辺として
        表現される。確定済みの有向辺からトポロジカル順序を求め、
        未確定辺をその順序に沿って向けることで循環を防ぐ。

        Returns:
            networkx.DiGraph: 全カラムをノードとして含むDAG。

        Raises:
            ValueError: 行列形状が不正、自己ループまたは有向閉路を含む場合。
        """
        matrix = np.asarray(self.causal_matrix)
        n_columns = len(self.columns)
        expected_shape = (n_columns, n_columns)

        if matrix.shape != expected_shape:
            raise ValueError(
                "causal_matrixの形状がcolumnsと一致しません。"
                f" expected={expected_shape}, actual={matrix.shape}"
            )

        if np.any(np.diag(matrix) != 0):
            raise ValueError("causal_matrixに自己ループが含まれています。")

        dag = nx.DiGraph()
        dag.add_nodes_from(self.columns)
        undirected_edges = []

        for i, source in enumerate(self.columns):
            for j in range(i + 1, n_columns):
                target = self.columns[j]
                forward = matrix[i, j] != 0
                backward = matrix[j, i] != 0

                if forward and backward:
                    undirected_edges.append((source, target))
                elif forward:
                    dag.add_edge(source, target)
                elif backward:
                    dag.add_edge(target, source)

        if not nx.is_directed_acyclic_graph(dag):
            cycles = list(nx.simple_cycles(dag))
            raise ValueError(
                "causal_matrixの有向辺に循環が含まれています。"
                f" cycles={cycles[:5]}"
            )

        column_order = {node: i for i, node in enumerate(self.columns)}
        topological_order = list(
            nx.lexicographical_topological_sort(
                dag,
                key=lambda node: column_order[node],
            )
        )
        order_index = {node: i for i, node in enumerate(topological_order)}

        for source, target in undirected_edges:
            if order_index[source] < order_index[target]:
                dag.add_edge(source, target)
            else:
                dag.add_edge(target, source)

        return dag

    @staticmethod
    def _quote_dot_node(node):
        """DOT形式用にノード名をエスケープする。"""
        escaped = str(node).replace("\\", "\\\\").replace('"', '\\"')
        return f'"{escaped}"'

    def _make_graph_str(self):
        """DoWhyに渡すDOT形式の因果グラフを生成する。

        Returns:
            str: DOT形式の有向グラフ。
        """
        dag = self._make_dag()
        lines = ["digraph {"]

        # 孤立ノードを含む全変数をグラフへ明示する。
        for node in self.columns:
            lines.append(f"  {self._quote_dot_node(node)};")

        for source, target in dag.edges():
            lines.append(
                f"  {self._quote_dot_node(source)} -> "
                f"{self._quote_dot_node(target)};"
            )

        lines.append("}")
        return "\n".join(lines)
