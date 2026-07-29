# cauchan

`cauchan` は、表形式データを対象に因果構造の定義・探索・編集と因果効果推定を行うワークベンチです。

React + TypeScriptのWeb画面からFastAPIを操作し、次の2通りの方法で推論に使用する因果構造を決定できます。

- ドメイン知識に基づいて因果構造を手動で定義する
- PC、DirectLiNGAM、GES、HillClimbSearchで構造を探索し、探索結果を手動編集して最終構造を決定する

## 主な機能

- CSV / Excelデータのアップロードと列情報・欠損数の確認
- React Flowによるノード配置とドラッグ操作での因果グラフ編集
- 手動因果構造、必須エッジ、禁止エッジの個別管理
- `forbidden_parents` / `forbidden_children` によるノード単位の方向制約
- PC / DirectLiNGAM / GES / HillClimbSearchによる因果構造探索
- 探索結果の辺追加、削除、方向変更
- PC法で得られた未方向辺の明示と、方向確定後の推論
- SCMまたはLinearDMLによる `factor1 -> factor2` の平均因果効果推定
- FastAPIによる循環、自己ループ、制約競合、必須エッジ不足の検証
- ライト / ダークテーマとレスポンシブ表示

## ワークフロー

### 1. Data

CSVまたはExcelをアップロードし、使用するデータを登録します。

### 2. Knowledge

推論に使用する因果構造の作成方法を選択します。

#### 手動で定義

Knowledge画面で作成した有向非巡回グラフ（DAG）をそのまま推論に使用します。

#### 因果探索を使用

必須・禁止エッジなどの事前知識を設定し、Discovery画面で因果探索を実行します。

### 3. Discovery

因果探索を選択した場合に使用します。探索結果を初期案としてグラフエディタへ展開し、辺の追加・削除・方向変更を行います。

PC法の未方向辺は自動的に一方向へ変換しません。未方向辺を削除するか、ユーザーが矢印を追加して方向を確定するまで因果効果推定には進めません。

### 4. Inference

次のいずれかの最終構造を使い、`factor1` から `factor2` への平均因果効果を推定します。

- Knowledge画面で作成した手動構造
- Discovery画面で探索後に編集した構造

## 必要環境

- Python 3.10以上、3.12以下
- Node.js 18以上
- 対応入力形式: `.csv`、`.xlsx`

因果探索・推論ライブラリには機械学習フレームワークを含む依存関係があるため、Python仮想環境の利用を推奨します。

## セットアップ

### Python

```bash
python -m venv .venv
source .venv/bin/activate
python -m pip install --upgrade pip
python -m pip install -e .
```

Windows PowerShellでは次のように仮想環境を有効化します。

```powershell
.venv\Scripts\Activate.ps1
```

`uv` を使用する場合は、リポジトリのルートで次を実行します。

```bash
uv sync
```

### React

```bash
cd web
npm install
```

## Windowsでまとめて起動

リポジトリ直下の `start_web.bat` をダブルクリックするか、コマンドプロンプトから実行します。

```cmd
start_web.bat
```

このバッチは次を順番に実行します。

1. `npm` とPython実行環境を確認
2. cauchan専用ポートが空いていることを確認
3. FastAPIを別ウィンドウで起動
4. `/api/v1/health` が応答するまで待機
5. React開発サーバーを別ウィンドウで起動

`.venv\Scripts\python.exe` が存在する場合はそのPythonを使用します。存在しない場合は `uv run python` を使用します。

起動後のURL:

- Web画面: `http://127.0.0.1:5175`
- FastAPI: `http://127.0.0.1:8002`
- OpenAPI UI: `http://127.0.0.1:8002/docs`
- ヘルスチェック: `http://127.0.0.1:8002/api/v1/health`

### bochan・malchanとの同時起動

3アプリで重複しない固定ポートを使用します。

| アプリ | FastAPI | React |
|---|---:|---:|
| bochan | 8000 | 5173 |
| malchan | 8001 | 5174 |
| cauchan | 8002 | 5175 |

cauchanのViteは `strictPort` を有効にしているため、5175が使用中の場合に別ポートへ自動移動せず、明確なエラーで停止します。`start_web.bat` も8002と5175の使用状況を起動前に検査します。

## 個別に起動

### 1. FastAPI

リポジトリのルートで起動します。

```bash
uvicorn cauchan.api.app:app --reload --host 127.0.0.1 --port 8002
```

### 2. React

別のターミナルで起動します。

```bash
cd web
npm run dev
```

ブラウザで `http://127.0.0.1:5175` を開きます。

API接続先を変更する場合は、`web/.env.example` を `web/.env` にコピーして設定します。

```env
VITE_API_BASE_URL=http://127.0.0.1:8002/api/v1
```

FastAPIのCORS許可元を変更する場合は、カンマ区切りで `CAUCHAN_CORS_ORIGINS` を指定します。

```powershell
$env:CAUCHAN_CORS_ORIGINS="http://127.0.0.1:5175,http://localhost:5175"
```

## グラフ編集

- ノード右側のハンドルから別ノードへドラッグすると有向辺を追加できます。
- 辺を選択し、DeleteまたはBackspaceを押すと削除できます。
- Knowledge画面では、手動因果構造、必須エッジ、禁止エッジを編集モードで切り替えます。
- Discovery画面では、探索結果を編集して推論に使用する最終構造を作成します。
- 未方向辺と同じノード間に矢印を引くと、その方向の有向辺に置き換わります。
- 循環、禁止条件との競合、必須エッジ不足、未方向辺の残存がある場合は推論を実行できません。

## APIの考え方

因果探索APIは生の探索結果として `discovery_id`、隣接行列、辺情報を返します。

Webアプリで探索結果を編集した場合は、編集後の最終構造を新しい `columns` と `causal_matrix` として因果推論APIへ送ります。これにより、画面上の編集内容が実際の推論へ反映されます。

詳細:

- [FastAPIバックエンド](docs/fastapi.md)
- [React Webアプリ](docs/webapp.md)
- [Webフロントエンドの開発](web/README.md)

## 従来のStreamlit UI

従来のStreamlit画面も利用できます。

```bash
streamlit run main.py
```

React Webアプリと比べて、探索結果のグラフ編集や構造ソースの明示的な選択には対応していません。

## テストとビルド

### Python

```bash
python -m unittest discover -s tests
```

### React

```bash
cd web
npm run build
```

## ファイル構成

```text
.
├── docs/
│   ├── fastapi.md              # FastAPI仕様とAPI利用例
│   └── webapp.md               # Webアプリの操作・状態フロー
├── src/cauchan/
│   ├── api/                    # FastAPI、スキーマ、サービス、ストア
│   └── models/                 # 因果探索と因果効果推定
├── tests/                      # Pythonテスト
├── web/
│   ├── src/                    # React + TypeScript
│   └── package.json
├── main.py                     # 従来のStreamlit UI
├── start_web.bat               # Windows用FastAPI・React一括起動
└── pyproject.toml
```

## 現在の保存方式

アップロードデータと探索結果はFastAPIプロセス内のメモリに保存します。

- FastAPIの再起動でデータは消えます。
- 複数ワーカー間では共有されません。
- ブラウザ再読み込み後の状態復元には未対応です。

永続化が必要な場合は、ストア層をSQLite、PostgreSQL、Redisなどへ置き換える想定です。

## 注意事項

- 推定結果は、データ、アルゴリズム、事前知識、最終的に採用した因果構造に依存します。
- 因果探索で得られた構造は確定した真実ではなく、検証対象となる仮説です。
- 方向が統計的に識別できない辺は、工程順序や専門知識に基づいて慎重に判断してください。
- 観測されていない交絡、選択バイアス、測定誤差がある場合、推定結果が偏る可能性があります。
- 大規模データや一部の探索アルゴリズムでは計算に時間がかかる場合があります。
