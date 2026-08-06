# 対話モード用アイコン

このフォルダに画像を配置すると、cauchanの対話モード起動ボタンとassistantメッセージのアイコンへ表示されます。

次の順番で最初に読み込めた画像を使用します。

1. `icon.png`
2. `icon.svg`
3. `icon.webp`
4. `icon.jpg`
5. `icon.jpeg`

画像が存在しない場合は、従来の `c` を表示します。ユーザー側の `自` アイコンには画像を適用しません。

推奨形式は、128 × 128 px以上の正方形PNGまたはSVGです。

```text
web/public/conversation-mode/icon.png
```
