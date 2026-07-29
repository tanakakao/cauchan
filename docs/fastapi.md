# FastAPIバックエンド

cauchanのFastAPIは、データ登録、因果構造探索、グラフ検証、因果効果推定を提供します。

React Webアプリは探索結果を画面上で編集できるため、次の2種類のグラフを区別して扱います。

- **探索直後のグラフ**: `POST /api/v1/discovery` が返す生の探索結果
- **最終因果構造**: 手動定義、または探索結果を編集して確定したDAG

Webアプリでは、最終因果構造を `columns` と `causal_matrix` に変換して推論APIへ送ります。

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

## エンドポイント

| Method | Path | 目的 |
|---|---|---|
| `GET` | `/api/v1/health` | API稼働確認 |
| `POST` | `/api/v1/datasets` | CSV / Excel登録 |
| `DELETE` | `/api/v1/datasets/{dataset_id}` | データセット削除 |
| `POST` | `/api/v1/discovery` | 因果構造探索 |
| `POST` | `/api/v1/graphs/validate` | 手動グラフ・制約検証 |
| `POST` | `/api/v1/inference` | 因果効果推定 |

## APIフロー

### 1. データセット登録

`POST /api/v1/datasets` にCSVまたはExcelをmultipart形式で送信します。
レスポンスの `dataset_id` を探索・推論で使用します。

レスポンスには次が含まれます。

- `dataset_id`
- ファイル名
- 行数
- 列名
- データ型
- 列ごとの欠損数

### 2. グラフと事前知識の検証

`POST /api/v1/graphs/validate`

React上で矢印やノード制約を編集した際に使用します。

```json
{
  "columns": [
    "raw material 1",
    "temperature",
    "property"
  ],
  "causal_edges": [
    {
      "source": "raw material 1",
      "target": "property"
    }
  ],
  "required_edges": [],
  "forbidden_edges": [
    {
      "source": "property",
      "target": "raw material 1"
    }
  ],
  "forbidden_parents": ["property"],
  "forbidden_children": []
}
```

検証内容:

- columns内の重複
- columns外のノード参照
- 自己ループ
- 重複エッジ
- 手動因果構造の循環
- 必須エッジと禁止エッジの競合
- 手動因果構造と禁止エッジの競合
- `forbidden_parents` / `forbidden_children` との競合

Webアプリ側では、APIの検証結果に加えて次も確認します。

- 探索後の最終構造に未方向辺が残っていないこと
- 必須エッジが最終構造に存在すること

### 3. 因果構造探索

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

利用可能な探索手法:

- `PC`
- `DirectLiNGAM`
- `GES`
- `HillClimbSearch`

探索結果には次が含まれます。

- `discovery_id`
- 使用バックエンド
- 列順
- 隣接行列
- React Flow向けの辺情報

有向辺:

```json
{
  "source": "raw material 1",
  "target": "property",
  "kind": "directed",
  "weight": 1.0
}
```

PC法で方向が確定しない辺:

```json
{
  "source": "temperature",
  "target": "time",
  "kind": "undirected",
  "weight": 1.0
}
```

未方向辺は因果効果推定にそのまま使用すべきではありません。Webアプリでは、削除するか方向を確定するまで推論を無効にします。

### 4. 因果効果推定

`POST /api/v1/inference`

`factor1` を介入変数、`factor2` を結果変数として平均因果効果を推定します。

#### 探索結果を未編集で使用する場合

APIとしては `discovery_id` を指定できます。

```json
{
  "dataset_id": "<dataset_id>",
  "discovery_id": "<discovery_id>",
  "factor1": "raw material 1",
  "factor2": "property",
  "method": "LinearDML"
}
```

ただし、PC法の探索結果に未方向辺がある場合、代表DAGへの変換が必要になります。方向の科学的解釈が重要な用途では、探索結果を編集して最終DAGを明示する方法を推奨します。

#### 手動構造または編集後の探索構造を使用する場合

`columns` と `causal_matrix` を指定します。

```json
{
  "dataset_id": "<dataset_id>",
  "columns": [
    "raw material 1",
    "temperature",
    "property"
  ],
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

行列の意味:

```text
causal_matrix[i][j] != 0
    => columns[i] -> columns[j]
```

Webアプリでは、手動構造と探索後編集構造のどちらも、この形式で送信します。これにより、画面上で追加・削除・方向変更した内容が推論へ直接反映されます。

推論前にバックエンドで次を確認します。

- `factor1` と `factor2` が異なること
- 両変数がcolumnsに含まれること
- グラフがDAGとして扱えること
- `factor1` から `factor2` への有向経路が存在すること

## 因果構造の状態管理

FastAPIは探索結果を `discovery_id` 単位でメモリへ保存します。

React Webアプリは別途、次の状態をブラウザ内で保持します。

- 手動因果構造
- 必須エッジ
- 禁止エッジ
- ノード制約
- 生の探索結果
- 編集後の探索構造

編集後の探索構造はFastAPIの探索結果レコードを書き換えません。推論時に最終行列として送信します。

## 保存方式

初期版ではアップロードデータと探索結果をFastAPIプロセスのメモリに保存します。

- プロセス再起動でデータは消えます。
- 複数ワーカー間では共有されません。
- ブラウザ再読み込み後のフロントエンド状態復元には未対応です。

永続化が必要な段階で `InMemoryStore` をSQLite、PostgreSQL、Redisなどへ置き換えます。

## 関連ドキュメント

- [プロジェクトREADME](../README.md)
- [React Webアプリ](webapp.md)
- [Webフロントエンド開発](../web/README.md)
