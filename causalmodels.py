import pandas as pd
import numpy as np
import networkx as nx
from pyvis.network import Network
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
    def __init__(
        self,
        model_name: str,
        backend: str = "castle"
    ):
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
        matrix = np.zeros((len(self.node_names), len(self.node_names)))
        for u, v in self.estimated_dag.edges():
            i, j = self.node_names.index(u), self.node_names.index(v)
            matrix[i, j] = 1
        return matrix
    
    def show_graph(self, show=True):
        G = nx.DiGraph()
        for col in self.node_names:
            G.add_node(col, label=col)

        for i, col1 in enumerate(self.node_names):
            for j, col2 in enumerate(self.node_names):
                if self.causal_matrix[i, j] != 0:
                    edge_value = float(abs(self.causal_matrix[i, j]))  # 負の値を正の値に変換
                    sign = float(self.causal_matrix[i, j])  # プラスかマイナスかを判断
                    G.add_edge(
                        col1,
                        col2,
                        weight=edge_value,
                        sign=sign,
                        title=f"{col1} → {col2}"
                    )

        # ノードの大きさを次数に応じて設定
        node_sizes = {}
        for node in G.nodes():
            node_sizes[node] = G.degree(node) * 3  # 次数に応じてノードサイズを設定
        
        net = Network(notebook=True, directed=True)
        net.from_nx(G)
    
        # ノードのサイズを設定
        for node in net.nodes:
            node['size'] = node_sizes[node['id']]  # サイズを設定
            
        # # pyvisエッジの太さを設定
        for edge in net.edges:
            # `weight`の値を使って`width`を設定（エッジの太さ）
            edge['width'] = abs(edge['width']) * 4  # 重みを太さに反映（調整可能）
    
        # エッジの色を因果関係の符号に応じて設定
        for edge in net.edges:
            if edge['sign'] > 0:
                edge['color'] = 'red'  # プラスの因果関係は赤
            else:
                edge['color'] = 'blue'  # マイナスの因果関係は青
        
        if show:
            return net.show("temp_graph.html")
        else:
            return net