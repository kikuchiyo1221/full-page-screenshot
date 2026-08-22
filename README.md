# Full Page Screenshot - Chrome Extension

Webページ全体のスクリーンショットを撮影・編集できるChrome拡張機能です。

## 機能

### キャプチャモード
- **ページ全体**: スクロール含むページ全体をキャプチャ
- **範囲選択**: ドラッグで選択した領域のみキャプチャ
- **遅延キャプチャ**: 3秒/5秒/10秒後にキャプチャ（ドロップダウンメニュー等に対応）
  - 「表示領域」モードはスクロールしないため、開いたメニューを保ったまま撮影できます

### 出力形式
- PNG（高画質・デフォルト）
- JPEG（圧縮率調整可能）
- PDF（ドキュメント保存用）

### 保存方法
- ダウンロード（ローカル保存）
- クリップボードにコピー

### 編集機能
矢印 / 四角形 / 円 / テキスト / マーカー（ハイライト）、色・線幅の変更、Undo/Redo

### 実行方法
- ツールバーアイコンクリック
- キーボードショートカット
  - `Alt+Shift+S`: ページ全体をキャプチャ
  - `Alt+Shift+A`: 範囲を選択してキャプチャ
- 右クリックメニュー

## インストール方法

1. Chromeで `chrome://extensions/` を開く
2. 右上の「デベロッパーモード」をONにする
3. 「パッケージ化されていない拡張機能を読み込む」をクリック
4. このリポジトリのルートフォルダを選択

## 使い方

1. ツールバーの拡張機能アイコンをクリック
2. キャプチャモードを選択
3. 編集画面で注釈を追加（任意）
4. 「保存」または「コピー」ボタンで出力

## 設定

ツールバーアイコン → 設定アイコン（⚙️）から、以下の項目を設定できます：

- デフォルト出力形式
- JPEG品質（1-100%）
- デフォルト保存方法
- ファイル名プレフィックス

## 開発

依存パッケージはありません。Node.js 18以降があればテストが実行できます。

```bash
npm test          # ユニットテスト（PDF生成・スティッチ幾何・履歴・注釈・バイト変換）
npm run test:e2e  # ヘッドレスChromeで拡張を実際に読み込み、フルページ撮影まで検証
./build.sh        # Chrome Web Store 提出用の ZIP を生成
```

`npm run test:e2e` は実Chromeに拡張をロードして、manifestの権限・全ページの読み込み・
Service Worker の起動を確認したあと、3000pxのテストページを実際にキャプチャして
**継ぎ目のズレ・欠け・重複がないか**をピクセル単位で検証します。

残りの手動確認手順は [E2E_MANUAL_TEST_CHECKLIST.md](E2E_MANUAL_TEST_CHECKLIST.md) を参照してください。
アーキテクチャと既知の課題は [HANDOFF.md](HANDOFF.md) にまとめています。

## 技術仕様

- Manifest Version: 3
- 対応ブラウザ: Google Chrome
- 対応言語: 日本語、英語
- ビルドツール・依存パッケージなし（素の ES Modules）

### 権限

要求するのは以下だけで、**host permissions は一切要求しない**。

| 権限 | 用途 |
|---|---|
| `activeTab` | キャプチャを開始したタブ1つへのアクセス（ユーザー操作で付与、遷移で失効） |
| `scripting` | 対象タブの計測・スクロール・固定要素の一時非表示・選択オーバーレイの注入 |
| `downloads` | 画像の保存 |
| `storage` / `unlimitedStorage` | 設定の保存と、撮影画像を編集画面へ受け渡し |
| `alarms` | 遅延キャプチャ |
| `contextMenus` | 右クリックメニュー |

フルページ撮影は `chrome.tabs.captureVisibleTab` + スクロールで実装している。
`debugger` 権限（DevTools Protocol）は **使わない** —— Chrome Web Store の審査で
「代替手段があるのに要求している」として却下されるため。
詳細は [STORE_SUBMISSION.md](STORE_SUBMISSION.md)。

## ディレクトリ構成

```
.
├── manifest.json           # 拡張機能の設定
├── build.sh                # ストア提出用 ZIP の生成
├── lib/                    # Service Worker と各ページで共有するモジュール
│   ├── bytes.js            # base64 / Blob / data URL 変換
│   ├── filename.js         # 出力ファイル名の生成
│   ├── i18n.js             # data-i18n 属性の適用
│   ├── pdf.js              # JPEG を埋め込む1ページPDFの生成
│   └── settings.js         # 設定のデフォルト値と読み書き
├── scripts/
│   ├── background.js       # Service Worker（イベント配線とオーケストレーション）
│   ├── content.js          # 範囲選択オーバーレイ（必要時のみ注入）
│   ├── content.css
│   └── capture/            # キャプチャの実装
│       ├── constants.js    # タイミング等のチューニング値
│       ├── page-actions.js # ページ側で実行する処理（計測・スクロール・前処理）
│       ├── full-page.js    # スクロール＆スティッチ
│       ├── selection.js    # 範囲選択キャプチャ
│       ├── stitch.js       # 継ぎ目の配置計算と合成
│       └── visible.js      # 表示領域キャプチャ（レート制限対応）
├── popup/                  # ポップアップUI
├── editor/                 # 編集画面（annotations.js / history.js に分割）
├── options/                # 設定画面
├── tests/                  # ユニットテスト + e2e/（実Chrome検証ハーネス）
├── store-assets/screenshots/  # ストア掲載画像の生成（render.sh で PNG 出力）
├── docs/                   # GitHub Pages 用（プライバシーポリシー）
├── _locales/               # 多言語対応（en / ja）
└── icons/
```

## Chrome Web Store 公開準備

1. すべての機能をテスト（`npm test` と E2E チェックリスト）
2. `./build.sh` で `screenshot-extension.zip` を生成
3. [Chrome Web Store Developer Dashboard](https://chrome.google.com/webstore/devconsole) にアップロード
4. 権限の justification とデータ使用の開示は [STORE_SUBMISSION.md](STORE_SUBMISSION.md) の文面を貼付

手順の詳細は [PUBLISHING_GUIDE.md](PUBLISHING_GUIDE.md) を参照してください。

## ライセンス

MIT License
