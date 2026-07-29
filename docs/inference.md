# 因果効果推定モデル

cauchanの因果効果推定は、`src/cauchan/models/inference.py` の `CausalEffectEstimator` に集約しています。FastAPIのサービス層は入力データと最終DAGをモデル層へ渡し、推定式自体は持ちません。

## 利用可能な手法

| API値 | 実装 | 推定値 | 主な用途 |
|---|---|---|---|
| `SCM` | scikit-learn線形回帰 | 平均因果効果 | 線形仮定で高速に全体傾向を確認 |
| `DoWhyLinearRegression` | DoWhy + backdoor linear regression | 平均因果効果 | DoWhyの識別処理を明示的に使用 |
| `LinearDML` | DoWhy + EconML LinearDML | 平均因果効果 | 非線形な交絡調整を含むDML |
| `CausalForestDML` | EconML CausalForestDML | 個別効果の平均 | 効果の異質性を許容する因果フォレスト |

すべての手法は標準化したデータで推定し、最終的な効果量を元データの単位へ戻します。

## SCM

`SCM`はDoWhyを使用しません。DAG上で介入変数の親ノードを調整変数として、次の線形回帰を当てます。

```text
factor2 ~ factor1 + parents(factor1)
```

`factor1`の係数を平均因果効果として返します。線形性、因果十分性、DAGの妥当性を仮定します。

## DoWhy Linear Regression

`DoWhyLinearRegression`はNetworkXのDAGをDoWhyへ直接渡します。DOT文字列を解析しないため、pydotやpygraphvizの有無による起動・解析エラーを避けられます。

処理順は次のとおりです。

1. `CausalModel`へ観測データ、介入変数、結果変数、NetworkX DAGを渡す
2. `identify_effect()`で識別対象を決定する
3. `backdoor.linear_regression`で効果を推定する

従来の`CausalInference`クラスとDoWhy実装は後方互換用に残しています。

## LinearDML

`LinearDML`はDoWhyでバックドア識別を行った後、EconMLの`LinearDML`を利用します。

- outcome nuisance model: LightGBM
- treatment nuisance model: RandomForestRegressor
- treatment: 連続変数
- target units: ATE

## CausalForestDML

`CausalForestDML`はEconMLを直接使用します。DMLによる残差化と因果フォレストを組み合わせ、サンプルごとの条件付き平均処置効果を推定します。cauchanの現在のAPIはスカラーの平均因果効果を返すため、個別効果を全サンプルで平均して返します。

### Xに使う変数

介入変数の子孫は処置後変数になり得るため除外します。次の条件を満たす変数をベースライン特徴量`X`として使います。

- 介入変数ではない
- 結果変数ではない
- DAG上で介入変数の子孫ではない
- 値が一定ではない

親ノードや介入前の関連変数は、nuisance modelとCATE modelの双方で条件付けに利用されます。

### 実行条件

- 20行以上のデータ
- 利用可能なベースライン変数が1列以上
- 介入変数から結果変数への有向経路が存在するDAG
- 数値列のみ
- 欠損値なし

条件を満たさない場合はHTTP 422の具体的なエラーメッセージを返します。

## FastAPI

単一推定:

```text
POST /api/v1/inference
```

全有向エッジの一括推定:

```text
POST /api/v1/inference/batch
```

`method`には次のいずれかを指定します。

```json
{
  "method": "SCM"
}
```

```json
{
  "method": "DoWhyLinearRegression"
}
```

```json
{
  "method": "LinearDML"
}
```

```json
{
  "method": "CausalForestDML"
}
```

## Webアプリ

Inference画面で4手法を切り替えられます。個別ペアの推定と、最終DAGに存在する全有向エッジの一括推定の両方に適用されます。

CausalForestDMLを全エッジへ適用すると、エッジごとに因果フォレストを学習するため計算負荷が大きくなります。最初にSCMで全体を確認し、重要なエッジだけCausalForestDMLで再評価する運用を推奨します。

## テスト

`tests/test_causal_effect_estimator.py`では合成データを使い、次を実際に学習・推定します。

- SCMが真値付近を返すこと
- DoWhy Linear RegressionがNetworkX DAGで実行できること
- CausalForestDMLが連続処置で有限な平均効果を返すこと
