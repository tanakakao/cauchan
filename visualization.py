"""因果探索結果の可視化機能。"""

import matplotlib.pyplot as plt
import networkx as nx
import seaborn as sns
import streamlit as st
import streamlit.components.v1 as components
from pyvis.network import Network


def create_network(node_names, causal_matrix):
    """因果行列からPyVisネットワークを生成する。

    Args:
        node_names (list[str]): 行列の行・列に対応するノード名。
        causal_matrix (numpy.ndarray): エッジと重みを表す因果行列。

    Returns:
        pyvis.network.Network: 表示用の有向ネットワーク。
    """
    graph = nx.DiGraph()
    graph.add_nodes_from((name, {"label": name}) for name in node_names)
    for i, source in enumerate(node_names):
        for j, target in enumerate(node_names):
            value = causal_matrix[i, j]
            if value != 0:
                graph.add_edge(
                    source,
                    target,
                    weight=float(abs(value)),
                    sign=float(value),
                    title=f"{source} → {target}",
                )

    network = Network(notebook=True, directed=True)
    network.from_nx(graph)
    node_sizes = {node: graph.degree(node) * 3 for node in graph.nodes()}
    for node in network.nodes:
        node["size"] = node_sizes[node["id"]]
    for edge in network.edges:
        edge["width"] = abs(edge["width"]) * 4
        edge["color"] = "red" if edge["sign"] > 0 else "blue"
    return network


@st.cache_data
def show_heatmap(causal_matrix, node_names):
    """因果行列をヒートマップとしてStreamlitに表示する。

    Args:
        causal_matrix (numpy.ndarray): 表示する因果行列。
        node_names (list[str]): 行列の軸に表示するノード名。
    """
    fig, ax = plt.subplots(figsize=(8, 6))
    sns.heatmap(
        causal_matrix,
        annot=True,
        cmap="coolwarm",
        cbar=True,
        xticklabels=node_names,
        yticklabels=node_names,
        ax=ax,
    )
    st.pyplot(fig)
    plt.close(fig)


@st.cache_data
def show_network(node_names, causal_matrix):
    """因果行列をネットワークとしてStreamlitに表示する。

    Args:
        node_names (list[str]): 行列の行・列に対応するノード名。
        causal_matrix (numpy.ndarray): 表示する因果行列。
    """
    html = create_network(node_names, causal_matrix).generate_html()
    components.html(html, height=800, width=800)
