# FastAPIバックエンド

## 起動

```bash
python -m pip install -e .
uvicorn cauchan.api.app:app --reload --host 127.0.0.1 --port 8000
```

起動後は次のURLを利用できます。

- OpenAPI UI: `http://127.0.0.1:8000/docs`
- ヘルスチェック: `http://127.0.0.1:8000/api/v1/health`

Reactの開発サーバーは既定で次のオリジンを許可します。

- `http://localhost:5173`
- `http://localhost:3000`

変更する場合は、カンマ区切りで環境変数を設定します。

```powershell
$env:CAUCHAN_CORS_ORIGINS="http://localhost:5173,http://localhost:4173"
```

## APIフロー

### 1. データセット登録

`POST /api/v1/datasets` にCSVまたはExcelをmultipart形式で送信します。
レスポンスの `dataset_id` を探索・推論で使用します。

### 2. 因果構造探索

`POST /api/v1/discovery`

```json
{
  "dataset_id": "<dataset_id>",
  "columns": [
    "property",
    "raw material 1",
    "raw material 2",
    "temperature",
    "time"
  ],
  "model_name": "PC",
  "scale": true,
  "categorical_columns": [],
  "forbidden_parents": ["property"],
  "forbidden_children": [],
  "forbidden_edges": [],
  "required_edges": []
}
```

探索結果には、隣接行列とReact Flowで扱いやすい `edges` が含まれます。
PC法で方向が確定しない辺は `kind: "undirected"` として返します。

### 3. 因果効果推定

探索結果を使用する場合:

`POST /api/v1/inference`

```json
{
  "dataset_id": "<dataset_id>",
  "discovery_id": "<discovery_id>",
  "factor1": "raw material 1",
  "factor2": "property",
  "method": "LinearDML"
}
```

手動定義した因果行列を使用する場合は、`discovery_id` の代わりに
`columns` と `causal_matrix` を指定します。

```json
{
  "dataset_id": "<dataset_id>",
  "columns": ["raw material 1", "temperature", "property"],
  "causal_matrix": [
    [0, 0, 1],
    [1, 0, 1],
    [0, 0, 0]
  ],
  "factor1": "raw material 1",
  "factor2": "property",
  "method": "LinearDML"
}
```

### 4. グラフ・制約検証

`POST /api/v1/graphs/validate`

React上で矢印を追加・削除した際に、次を検証できます。

- 自己ループ、重複エッジ
- 手動因果構造の循環
- 必須エッジと禁止エッジの競合
- `forbidden_parents` / `forbidden_children` との競合

## 保存方式

初期版ではアップロードデータと探索結果をFastAPIプロセスのメモリに保存します。
そのため、プロセス再起動でデータは消え、複数ワーカー間では共有されません。
永続化が必要な段階で `InMemoryStore` をDBやRedis等へ置き換えます。
