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
1. **プライバシーポリシー**: GitHub Pages で `docs/privacy-policy.html` を公開しURLを入力
2. **データ使用の開示**: STORE_SUBMISSION.md §4 の表のとおり、全項目「収集しない」
3. **権限の justification**: STORE_SUBMISSION.md §3 の英文を各欄に貼付

### Step 5: 配布設定
1. **公開設定**: 「一般公開」を選択
2. **対象地域**: 「すべての地域」または特定地域を選択

### Step 6: 審査への提出
1. すべての必須項目を入力
2. 「審査のために送信」をクリック
3. 審査は通常1〜3営業日

## 審査に通るために

> **重要**: v1.0.2 は `debugger` 権限と `<all_urls>` を要求したまま公開されている。
> 審査は通ったが、どちらもこの拡張には不要で、ストアの権限ポリシーは年々厳しくなる。
> v1.1.1 で両方を実装ごと削除した。
> 再申請に必要な文面・チェックリストは **[STORE_SUBMISSION.md](STORE_SUBMISSION.md)** に
> まとめてあるので、そちらを使うこと。

1. **権限は最小限のまま維持する**
   - 現在の要求は `activeTab` / `scripting` / `downloads` / `storage` / `unlimitedStorage` /
     `alarms` / `contextMenus` のみ。host permissions はゼロ。
   - 新機能のために `debugger`・`tabs`・`<all_urls>` を足したくなったら、まず
     `activeTab` + `scripting` で実現できないかを検討する。

2. **各権限の justification 欄を埋める**
   - STORE_SUBMISSION.md §3 の英文をそのまま貼る。空欄や一言だけの説明は却下理由になる。

3. **プライバシーポリシーは HTML ページとして公開する**
   - `docs/privacy-policy.html` を GitHub Pages で公開し、その URL を登録する。
   - `.md` の raw URL はブラウザで読める体裁にならないため避ける。

## 公開後

### バージョンアップの手順
1. `manifest.json` のバージョン番号を更新
2. `./build.sh` で新しいZIPを作成
3. Developer Dashboardで新しいZIPをアップロード

### ユーザーフィードバック
- Chrome Web Storeのレビューを定期的にチェック
- GitHubのissuesでバグ報告を受け付け

## プライバシーポリシーのホスティング

### GitHub Pages（推奨）
1. リポジトリの Settings → Pages
2. Source: `main` branch / `/docs` folder
3. URL: `https://kikuchiyo1221.github.io/full-page-screenshot/privacy-policy.html`

`docs/privacy-policy.html` は用意済み。日英併記で、要求している権限の一覧も
manifest と一致させてある。manifest の権限を変えたら**このページも必ず更新すること**
（不一致は却下理由になる）。

なお raw の `.md` URL は避ける。ブラウザで読める HTML ページであることが求められる。
