import streamlit as st
import pandas as pd
import numpy as np
import warnings
warnings.filterwarnings("ignore")

import io

from model import CausalDiscovery, CausalInference
from visualization import show_heatmap, show_network

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

    def read_csv_with_encodings(file, encodings=('utf-8', 'shift-jis', 'cp932')):
        """候補の文字コードを順番に試してCSVを読み込む。

        Args:
            file (File): 読み込むCSVファイル。
            encodings (tuple[str, ...]): 試行する文字コード。

        Returns:
            pandas.DataFrame | None: 読み込んだデータ。失敗時はNone。
        """
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

def select_edge(columns, i):
    """原因と結果を選択するUIを表示する。

    Args:
        columns (list[str]): 選択肢となる列名。
        i (int): UIラベルに使用するエッジ番号。

    Returns:
        tuple[str, str]: 選択された原因と結果。
    """
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
                inf_model = CausalInference(
                    df,
                    st.session_state.select_cols,
                    st.session_state.adj_matrix,
                )
                causal_estimate = inf_model.estimate(factor1, factor2, method)
                st.write(f"{factor1}が{factor2}に与える介入効果（因果効果）: ", causal_estimate)

        col1, col2 = st.columns((2,3))
        with col1:
            # 結果の表示
            st.subheader("因果関係のヒートマップ")
            show_heatmap(
                st.session_state.adj_matrix,
                st.session_state.model.node_names,
            )

        with col2:
            # 可視化
            st.subheader("因果関係のネットワーク")
            show_network(
                st.session_state.model.node_names,
                st.session_state.adj_matrix,
            )

else:
    st.info("CSVファイルをアップロードしてください。")
