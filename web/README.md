# cauchan web

FastAPIバックエンドを操作するReact + TypeScriptの因果分析ワークベンチです。

## 必要環境

- Node.js 18以上
- 起動済みのcauchan FastAPI

## 起動

FastAPIを起動します。

```bash
python -m pip install -e .
uvicorn cauchan.api.app:app --reload --host 127.0.0.1 --port 8000
```

別のターミナルでWebアプリを起動します。

```bash
cd web
npm install
npm run dev
```

既定では `http://127.0.0.1:8000/api/v1` に接続します。接続先を変更する場合は `.env.example` を `.env` にコピーし、`VITE_API_BASE_URL` を変更してください。

```env
VITE_API_BASE_URL=http://127.0.0.1:8000/api/v1
```

## ワークフロー

1. **Data**
   - CSVまたはExcelをアップロードします。
2. **Knowledge**
   - 使用する変数を選択します。
   - 因果構造を手動定義するか、因果探索を使うかを選択します。
   - 必須エッジ、禁止エッジ、原因・結果にしない変数を設定します。
3. **Discovery**
   - 因果探索を選択した場合にアルゴリズムを実行します。
   - 探索結果を初期構造として、辺の追加・削除・方向変更を行います。
   - PC法の未方向辺は、削除するか方向を確定するまで推論に使用できません。
4. **Inference**
   - Knowledgeで作成した手動構造、またはDiscoveryで編集した最終構造を選択します。
   - factor1からfactor2への因果効果をSCMまたはLinearDMLで推定します。

## グラフ編集

- ノード右側のハンドルから別ノードへドラッグすると有向辺を追加できます。
- 辺を選択してDeleteまたはBackspaceを押すと削除できます。
- 探索結果の未方向辺と同じノード間へ矢印を引くと、その方向の有向辺へ置き換わります。
- 最終構造はFastAPIのグラフ検証APIで循環や制約との競合を確認します。

## プロダクションビルド

```bash
cd web
npm install
npm run build
```

成果物は `web/dist` に出力されます。
