# Chrome Web Store 公開ガイド

## 事前準備

### 1. 開発者アカウント登録
1. https://chrome.google.com/webstore/devconsole にアクセス
2. Googleアカウントでログイン
3. **$5 USD**の登録料を支払い（一度だけ、クレジットカード必要）
4. 開発者情報を入力

### 2. 必要なアセット

#### ストア掲載用画像（必須）
| 種類 | サイズ | 説明 |
|------|--------|------|
| スクリーンショット | 1280x800 または 640x400 | 最低1枚、最大5枚 |
| プロモーションタイル（小） | 440x280 | ストア一覧に表示 |

#### スクリーンショット撮影のヒント
1. 拡張機能のポップアップが開いた状態
2. フルページキャプチャの結果例
3. エディタ画面での編集例
4. 設定画面

### 3. ストア掲載情報

#### 日本語（メイン）
```
名前: フルページスクリーンショット
概要: Webページ全体のスクリーンショットを撮影・編集できる拡張機能

詳細説明:
フルページスクリーンショットは、Webページ全体を簡単にキャプチャできるChrome拡張機能です。

主な機能:
• ページ全体をワンクリックでキャプチャ
• 範囲を選択してキャプチャ
• 遅延キャプチャ（3秒/5秒/10秒）
• 内蔵エディタで矢印、図形、テキストを追加
• PNG/JPEG/PDF形式で保存
• クリップボードにコピー

キーボードショートカット:
• Alt+Shift+S: フルページキャプチャ
• Alt+Shift+A: 範囲選択キャプチャ

プライバシー:
すべてのデータはローカルで処理され、外部サーバーには送信されません。
```

#### 英語
```
Name: Full Page Screenshot
Summary: Capture and edit full page screenshots of any webpage

Description:
Full Page Screenshot is a Chrome extension that makes it easy to capture entire web pages.

Features:
• One-click full page capture
• Select area to capture
• Delayed capture (3s/5s/10s)
• Built-in editor with arrows, shapes, and text
• Save as PNG/JPEG/PDF
• Copy to clipboard

Keyboard Shortcuts:
• Alt+Shift+S: Full page capture
• Alt+Shift+A: Selection capture

Privacy:
All data is processed locally and never sent to external servers.
```

## 公開手順

### Step 1: ZIPファイルの準備
```bash
cd /Users/miyamotokikuchiyo/Documents/antigravity/chrome-screenshot-extension
./build.sh
```
生成されるファイル: `screenshot-extension.zip`

### Step 2: アイテムの作成
1. Chrome Developer Dashboard にアクセス
2. 「新しいアイテム」をクリック
3. `screenshot-extension.zip` をアップロード

### Step 3: ストア掲載情報の入力
1. **言語**: 日本語をプライマリに設定
2. **詳細説明**: 上記のテキストをコピー
3. **カテゴリ**: 「ユーティリティ」を選択
4. **スクリーンショット**: 撮影した画像をアップロード
5. **プロモーションタイル**: 440x280の画像をアップロード

### Step 4: プライバシー設定
1. **プライバシーポリシー**: PRIVACY_POLICY.md をホスティングしてURLを入力
   - GitHub Pagesを使用するか
   - GitHubリポジトリのRAWファイルURLを使用
2. **データ使用の開示**:
   - 「個人情報を収集しない」を選択
   - 「ユーザーの閲覧履歴を収集しない」を選択

### Step 5: 配布設定
1. **公開設定**: 「一般公開」を選択
2. **対象地域**: 「すべての地域」または特定地域を選択

### Step 6: 審査への提出
1. すべての必須項目を入力
2. 「審査のために送信」をクリック
3. 審査は通常1〜3営業日

## 審査に通るためのヒント

1. **debugger権限の説明**
   - 審査担当者への注意で「debugger権限はフルページスクリーンショットのためにDevTools Protocolを使用するためのみに使用」と説明

2. **host_permissions の説明**
   - 「あらゆるWebページでスクリーンショットを撮影するために必要」と説明

3. **プライバシーポリシーの公開**
   - GitHubにリポジトリを公開し、PRIVACY_POLICY.mdへのリンクを使用

## 公開後

### バージョンアップの手順
1. `manifest.json` のバージョン番号を更新
2. `./build.sh` で新しいZIPを作成
3. Developer Dashboardで新しいZIPをアップロード

### ユーザーフィードバック
- Chrome Web Storeのレビューを定期的にチェック
- GitHubのissuesでバグ報告を受け付け

## プライバシーポリシーのホスティング

### オプション1: GitHub Pages
1. リポジトリの Settings → Pages
2. Source: main branch / docs folder
3. URL: `https://yourusername.github.io/repo-name/PRIVACY_POLICY`

### オプション2: GitHub RAW URL
```
https://raw.githubusercontent.com/yourusername/repo-name/main/PRIVACY_POLICY.md
```

### オプション3: 専用ページ作成
PRIVACY_POLICY.html を作成してホスティング
