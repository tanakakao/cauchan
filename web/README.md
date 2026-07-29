# cauchan web

因果構造探索と因果効果推定を操作するReactフロントエンドです。

## 必要環境

- Node.js 18以上
- 起動済みのcauchan FastAPI

## 開発起動

```bash
cd web
npm install
npm run dev
```

既定では `http://127.0.0.1:8000/api/v1` へ接続します。接続先を変更する場合は `.env.example` を `.env` にコピーし、`VITE_API_BASE_URL` を変更してください。

```env
VITE_API_BASE_URL=http://127.0.0.1:8000/api/v1
```

## プロダクションビルド

```bash
cd web
npm install
npm run build
```

成果物は `web/dist` に出力されます。

## 画面構成

1. **Data**: CSV / Excelのアップロードと列情報確認
2. **Knowledge**: 因果構造・必須エッジ・禁止エッジ・ノード制約の編集
3. **Discovery**: PC / DirectLiNGAM / GES / HillClimbSearchによる因果探索
4. **Inference**: 探索結果または手動構造を使った因果効果推定

Knowledge画面では、ノード右側のハンドルから別ノードへドラッグして矢印を作成します。編集モードに応じて、手動因果構造、必須エッジ、禁止エッジとして保存されます。
