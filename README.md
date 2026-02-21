# Full Page Screenshot - Chrome Extension

Webページ全体のスクリーンショットを撮影・編集できるChrome拡張機能です。

## 機能

### キャプチャモード
- **ページ全体**: スクロール含むページ全体をキャプチャ
- **範囲選択**: ドラッグで選択した領域のみキャプチャ
- **遅延キャプチャ**: 3秒/5秒/10秒後にキャプチャ（ドロップダウンメニュー等に対応）

### 出力形式
- PNG（高画質・デフォルト）
- JPEG（圧縮率調整可能）
- PDF（ドキュメント保存用）

### 保存方法
- ダウンロード（ローカル保存）
- クリップボードにコピー

### 編集機能
- 矢印
- 四角形
- 円
- テキスト
- マーカー（ハイライト）
- 色・線幅の変更
- Undo/Redo

### 実行方法
- ツールバーアイコンクリック
- キーボードショートカット
  - `Alt+Shift+S`: ページ全体をキャプチャ
  - `Alt+Shift+A`: 範囲を選択してキャプチャ
- 右クリックメニュー

## インストール方法

### 1. アイコンの生成

```bash
cd chrome-screenshot-extension/icons
```

1. `generate-icons.html` をChromeで開く
2. 各サイズの「Download」ボタンをクリック
3. `icon16.png`, `icon48.png`, `icon128.png` を `icons/` フォルダに保存

### 2. Chromeに拡張機能を読み込む

1. Chromeで `chrome://extensions/` を開く
2. 右上の「デベロッパーモード」をONにする
3. 「パッケージ化されていない拡張機能を読み込む」をクリック
4. `chrome-screenshot-extension` フォルダを選択

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

## 技術仕様

- Manifest Version: 3
- 対応ブラウザ: Google Chrome
- 対応言語: 日本語、英語

## ディレクトリ構成

```
chrome-screenshot-extension/
├── manifest.json          # 拡張機能の設定
├── popup/                 # ポップアップUI
│   ├── popup.html
│   ├── popup.css
│   └── popup.js
├── editor/                # 編集画面
│   ├── editor.html
│   ├── editor.css
│   └── editor.js
├── scripts/               # バックグラウンド・コンテンツスクリプト
│   ├── background.js
│   ├── content.js
│   └── content.css
├── options/               # 設定画面
│   ├── options.html
│   ├── options.css
│   └── options.js
├── _locales/              # 多言語対応
│   ├── en/messages.json
│   └── ja/messages.json
├── icons/                 # アイコン
│   ├── icon.svg
│   ├── generate-icons.html
│   ├── icon16.png
│   ├── icon48.png
│   └── icon128.png
└── README.md
```

## Chrome Web Store 公開準備

1. すべての機能をテスト
2. アイコンを生成
3. Chromeでパッケージ化（`chrome://extensions/` → 「拡張機能をパッケージ化」）
4. [Chrome Web Store Developer Dashboard](https://chrome.google.com/webstore/developer/dashboard) にアップロード

## ライセンス

MIT License
