import streamlit as st
import pandas as pd
import numpy as np
import warnings
warnings.filterwarnings("ignore")

from sklearn.preprocessing import StandardScaler
from dowhy import CausalModel
from econml.dml import LinearDML, CausalForestDML
from econml.dr import DRLearner
from sklearn.ensemble import RandomForestRegressor
from lightgbm import LGBMRegressor
import streamlit.components.v1 as components
import networkx as nx
from pyvis.network import Network
import matplotlib.pyplot as plt
import seaborn as sns
import io

from causalmodels import CausalDiscovery, gcastle_model_dict

@st.cache_data
def load_data(file):
    """データを読み込む関数。

    与えられたファイルが.csvまたは.xlsx形式の場合、その内容をDataFrameとして返します。
    サポートされていないファイル形式の場合、エラーメッセージを表示します。

    Args:
        file (File): 読み込むファイル。

    Returns:
        DataFrame: 読み込んだデータ。
        None: サポートされていないファイル形式の場合。
    """

    def read_csv_with_encodings(file, encodings=['utf-8', 'shift-jis', 'cp932']):
        file_bytes = file.getvalue()  # デコードせずバイトとして取得
        for encoding in encodings:
            try:
                file_buffer = io.StringIO(file_bytes.decode(encoding))
                return pd.read_csv(file_buffer, header=0)
            except Exception as e:
                st.warning(f"Encoding {encoding} failed: {e}")
        st.error("CSVファイルをサポートされているエンコーディングで読み込めませんでした。")
        return None

    if file is None:
        return pd.DataFrame([])

    elif file.name.endswith('.csv'):
        return read_csv_with_encodings(file)

    elif file.name.endswith('.xlsx'):
        try:
            return pd.read_excel(file)
        except Exception as e:
            st.error(f"Excelファイルの読み込みに失敗しました: {e}")
            return None

    else:
        st.error("サポートされていないファイル形式です。CSVまたはExcelファイルをアップロードしてください。")
        return None

class CausalInference:
    """因果推論"""
    def __init__(self, df, columns, model, causal_matrix):
        self.df = df
        self.model = model
        self.columns = columns
        self.causal_matrix = causal_matrix

    def estimate(self, factor1, factor2, method):
        selected_data = self.df[self.columns]
        scaler = StandardScaler()
        selected_data = pd.DataFrame(scaler.fit_transform(selected_data), columns=self.columns)

        common_causes = [col for col in self.columns if col not in [factor1, factor2]]
    
        causal_graph = self._make_graph_str(factor1, factor2)
        model_dowhy = CausalModel(
            data=selected_data,
            treatment=[factor1],
            outcome=[factor2],
            graph=causal_graph if method in ["LinearDML", "SCM"] else None,  # 因果関係のグラフを定義
            common_ca2uses=common_causes
        )
        estimand = model_dowhy.identify_effect()
        
        if method == "SCM":
            causal_estimate = model_dowhy.estimate_effect(
                estimand,
                method_name="backdoor.linear_regression"
            ).value
        elif method == "LinearDML":
            causal_estimate = model_dowhy.estimate_effect(
                identified_estimand=estimand,
                method_name='backdoor.econml.dml.LinearDML',
                target_units='ate',
                method_params={
                    'init_params': {
                        'model_y': LGBMRegressor(n_estimators=100,
                             max_depth=10, 
                             learning_rate=.01,
                             verbose=-1),
                        'model_t': RandomForestRegressor(),
                        'discrete_treatment': False
                    },
                    'fit_params': {}
                }
            ).value
        else:
            causal_estimate = 0

        # 元のスケールでの因果効果を計算
        treat_idx = self.columns.index(factor1)
        outcome_idx = self.columns.index(factor2)
        
        treat_std = scaler.scale_[treat_idx]
        outcome_std = scaler.scale_[outcome_idx]
        
        # スケールを元に戻した介入効果
        effect_in_original_scale = causal_estimate * outcome_std / treat_std
        
        return effect_in_original_scale
            
    def _make_graph_str(self, factor1, factor2):
        # DOT形式でDoWhy用の因果グラフを構築
        causal_graph = "digraph {\n"
        
        # エッジの追加のみ（ノード定義は省略でよい）
        for i, source in enumerate(self.columns):
            for j, target in enumerate(self.columns):
                if self.causal_matrix[i, j] != 0:
                    causal_graph += f'  "{source}" -> "{target}";\n'

        causal_graph += "}"
        return causal_graph

@st.cache_data
def show_heatmap():
    fig, ax = plt.subplots(figsize=(8, 6))
    sns.heatmap(
        st.session_state.adj_matrix,
        annot=True,
        cmap="coolwarm",
        cbar=True, 
        xticklabels=st.session_state.select_cols,
        yticklabels=st.session_state.select_cols,
        ax=ax
    )
    st.pyplot(fig)


@st.cache_data
def show_network():
    html_str = st.session_state.model.show_graph(show=False).generate_html()
 
    # HTMLを直接埋め込む
    components.html(html_str, height=800, width=800)


def select_edge(columns, i):
    c1, c2, c3 = st.columns((5,1,5))
    with c1:
        edge_start = st.selectbox("原因"+str(i), columns, label_visibility="collapsed")
    with c2:
        st.write("⇒")
    with c3:
        edge_end = st.selectbox("結果"+str(i), columns, label_visibility="collapsed")
    return (edge_start, edge_end)

# algos = list(gcastle_model_dict.keys())
algos = ["DirectLiNGAM", "PC"]
algos_cat = ["GES", "HillClimbSearch"]

st.set_page_config(
    page_title='因果関係予測と可視化',  # アプリのページタイトル
    page_icon='🔍',  # アプリのアイコン
    layout="wide"  # レイアウトを広げる設定
)

if 'model' not in st.session_state: 
	st.session_state.model = None
if 'adj_matrix' not in st.session_state: 
	st.session_state.adj_matrix = None
if 'select_cols' not in st.session_state: 
	st.session_state.select_cols = None
if 'select_cat_cols' not in st.session_state: 
	st.session_state.select_cat_cols = None
    
uploaded_file = st.file_uploader("CSVファイルをアップロード",  type=['xlsx', 'csv'])


if uploaded_file is not None:
    # データ読み込み
    df = load_data(uploaded_file)
    with st.expander("データプレビュー"):
        st.write(df)

    st.subheader("因果関係予測")

    col1, col2 = st.columns(2)
    
    with col1:
        # 使用するカラムの選択
        columns = st.multiselect("使用するカラムを選択してください", df.columns)
        cat_columns = st.multiselect("カテゴリ変数があれば選択してください", columns)
        
        if len(columns) > 1:
            # LiNGAMの適用
            select_alg = st.selectbox("使用するアルゴリズムを選択してください", algos if len(cat_columns)==0 else algos_cat)
            select_backend = "castle" if len(cat_columns)==0 else "pgmpy"

        cont = st.container()

    with col2:
        with st.expander("事前知識"):
            forbidden_parents = st.multiselect("原因とならない因子(測定結果など)", columns)
            forbidden_children = st.multiselect("結果とならない因子(設定値など)", columns)
            n1, n2 = st.columns(2)
            with n1:
                st.write("禁止する因果関係")
            with n2:
                n_forbidden = st.number_input("禁止数", 0, label_visibility="collapsed")

            forbidden_edges = []
            for i in np.arange(n_forbidden):
                forbidden_edges.append(select_edge(columns, i))

            n3, n4 = st.columns(2)
            with n3:
                st.write("既知の因果関係")
            with n4:
                n_require = st.number_input("既知数", 0, label_visibility="collapsed")

            required_edges = []
            for j in np.arange(n_require):
                required_edges.append(select_edge(columns, n_forbidden+j+1))


        with cont:
            if st.button("計算開始"):
                st.session_state.select_cols = columns
                st.session_state.select_cat_cols = cat_columns
                # 選択したカラムに基づいてデータを抽出
                selected_data = df[st.session_state.select_cols]
    
                st.session_state.model = CausalDiscovery(select_alg, backend=select_backend)
                st.session_state.model.learn(selected_data, True, cat_columns,
                               forbidden_parents, forbidden_children,
                               forbidden_edges, required_edges)
                st.session_state.adj_matrix = st.session_state.model.causal_matrix
                
                show_heatmap.clear()
                show_network.clear()
    
    if st.session_state.model:
        st.subheader("2つの因子間の因果関係の推定")
        col3, col4, col5, _ = st.columns((1,1,1,4))
        with col3:
            factor1 = st.selectbox("因子1 (独立変数)", st.session_state.select_cols)
        with col4:
            factor2 = st.selectbox("因子2 (従属変数)", st.session_state.select_cols)

        with col5:
            # 推定方法の選択
            method = st.selectbox(
                "因果推定の手法",
                ["SCM", "LinearDML"]
            )
        
        if st.button("推論開始"):
            if factor1 and factor2:
                inf_model = CausalInference(df, st.session_state.select_cols, st.session_state.model, st.session_state.adj_matrix)
                causal_estimate = inf_model.estimate(factor1, factor2, method)
                st.write(f"{factor1}が{factor2}に与える介入効果（因果効果）: ", causal_estimate)

        col1, col2 = st.columns((2,3))
        with col1:
            # 結果の表示
            st.subheader("因果関係のヒートマップ")
            show_heatmap()

        with col2:
            # 可視化
            st.subheader("因果関係のネットワーク")
            show_network()

else:
    st.info("CSVファイルをアップロードしてください。")
