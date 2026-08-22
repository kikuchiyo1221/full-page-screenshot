# Chrome Web Store 再申請パック

v1.0.2 は **権限過剰（`debugger` + `<all_urls>`）** で審査に通らなかった。
v1.1.0 でその両方を削除済み。このファイルの英文は Developer Dashboard の各欄に
**そのまま貼れる**形式で書いてある。

---

## 1. 何が変わったか（v1.0.2 → v1.1.0）

| 項目 | v1.0.2（却下） | v1.1.0（再申請） |
|---|---|---|
| `debugger` 権限 | **要求していた** | 削除。DevTools Protocol を一切使わない |
| `host_permissions` | `<all_urls>` | **なし**。`activeTab` のみ |
| content_scripts | 全URLに常時注入 | 宣言なし。範囲選択時に `scripting` で都度注入 |
| フルページ撮影の実装 | `Page.captureScreenshot`（CDP） | `chrome.tabs.captureVisibleTab` + スクロール |
| `web_accessible_resources` | editor/* を全URLに公開 | 削除 |

`debugger` を消したのは説明で押し切れる指摘ではないため。Chrome Web Store の
Use of Permissions ポリシーは「機能実現に必要な最小限の権限のみ」を求めており、
フルページ撮影は `captureVisibleTab` で実現できる＝代替手段が存在する以上、
`debugger` の要求は正当化できない。副作用として「このブラウザはデバッグされています」
バーも出なくなる。

---

## 2. Single purpose（単一目的）

> **Capture a screenshot of the web page the user is currently viewing, let the user
> annotate it, and save or copy the result.**
>
> Every feature in the extension serves that single purpose: the capture modes produce the
> image, the built-in editor annotates that same image, and the format and filename settings
> control how it is saved. The extension has no other functionality — it does not modify the
> pages it captures beyond temporarily hiding fixed headers during the capture itself, and it
> restores them immediately afterwards.

---

## 3. Permission justifications（各権限の説明欄）

### activeTab
> The extension only ever captures the one tab the user explicitly acts on. `activeTab` is
> granted by a user gesture — clicking the toolbar button, pressing the keyboard shortcut, or
> choosing the right-click menu entry — and it expires when that tab navigates. It is used to
> read the page's dimensions, scroll it while capturing, and call
> `chrome.tabs.captureVisibleTab`. The extension requests no host permissions, so it has no
> access to any page the user has not explicitly asked it to capture.

### scripting
> Used to inject the capture helpers into the tab being captured. Specifically:
> (1) measuring the page height, viewport size and device pixel ratio;
> (2) scrolling the page one viewport at a time so the sections can be stitched together;
> (3) temporarily hiding `position: fixed` and `position: sticky` elements so a floating header
> is not repeated in every stitched section, then restoring them;
> (4) rendering the drag-to-select overlay for area capture.
> Injection is on demand, only into the tab covered by `activeTab`. The extension registers no
> declarative content scripts and therefore runs no code on pages the user has not asked to
> capture.

### downloads
> Saves the finished screenshot to the user's Downloads folder via
> `chrome.downloads.download()` when the user presses Save in the editor. Nothing is downloaded
> without that explicit action.

### storage
> Stores the user's own preferences (default output format, JPEG quality, filename prefix,
> default save method) and passes the captured image from the service worker to the editor tab
> that opens next to it. All of it stays in `chrome.storage` on the user's device.

### unlimitedStorage
> The captured image is handed to the editor through `chrome.storage.local`. A full-page PNG of
> a long article or search-results page routinely exceeds the default 10 MB quota, and hitting
> the quota loses the user's capture. The image is written once, read by the editor tab, and
> overwritten by the next capture — nothing accumulates over time.

### alarms
> Implements the 3 / 5 / 10 second delayed capture, which lets users open a dropdown or hover
> menu before the screenshot is taken. A Manifest V3 service worker can be suspended before a
> `setTimeout` would fire, so `chrome.alarms` is the only reliable timer available.

### contextMenus
> Adds the two right-click menu entries, "Capture Full Page" and "Capture Selection", as an
> alternative to the toolbar button.

### Host permissions
> **None requested.** The extension operates entirely under `activeTab`.

### Remote code
> **No.** All code ships inside the package. There are no external scripts, no `eval()` of
> remote content, no CDN or web-hosted modules, and no WebAssembly fetched at runtime.

---

## 4. Data usage disclosures（データ使用の開示）

ダッシュボードのチェック項目は次のとおり回答する。

| 項目 | 回答 |
|---|---|
| Personally identifiable information | 収集しない |
| Health information | 収集しない |
| Financial and payment information | 収集しない |
| Authentication information | 収集しない |
| Personal communications | 収集しない |
| Location | 収集しない |
| Web history | 収集しない |
| User activity | 収集しない |
| Website content | 収集しない（画像はユーザーのデバイス内にのみ存在し、送信は一切ない） |

3つの宣誓（certifications）はすべて該当する：
- 承認された用途以外にデータを販売・譲渡しない
- 商品の単一目的と無関係な用途にデータを使用・転送しない
- 信用調査や融資目的でデータを使用・転送しない

**Privacy policy URL**（公開済み・疎通確認済み）:

```
https://kikuchiyo1221.github.io/full-page-screenshot/privacy-policy.html
```

GitHub Pages は `main` / `/docs` で有効化済み。manifest の権限を変更したら
`docs/privacy-policy.html` も必ず更新すること（記載と実際の不一致は却下理由になる）。

---

## 5. 掲載画像

生成済み。`store-assets/screenshots/out/` からそのままアップロードできる。

| ファイル | サイズ | 内容 |
|---|---|---|
| `01-full-page.png` | 1280x800 | 表示領域だけ vs ページ全体の比較 |
| `02-popup.png` | 1280x800 | ポップアップUIと3つのキャプチャモード |
| `03-editor.png` | 1280x800 | 注釈エディタ |
| `04-selection.png` | 1280x800 | 範囲選択オーバーレイ |
| `05-privacy.png` | 1280x800 | 要求する権限／しない権限 |
| `promo-tile.png` | 440x280 | プロモーションタイル（小） |

ポップアップ・エディタ・選択オーバーレイは**実際の CSS**（`popup.css` / `editor.css` /
`content.css`）で描画しているため、UIを変更したら `store-assets/screenshots/render.sh`
で作り直すこと。

---

## 6. ストア掲載テキスト

### 日本語（プライマリ）
```
名前: フルページスクリーンショット
概要: Webページ全体のスクリーンショットを撮影・編集できる拡張機能

詳細説明:
Webページ全体を1クリックでキャプチャし、そのまま注釈を付けて保存できる拡張機能です。

主な機能:
• ページ全体をワンクリックでキャプチャ（スクロール部分も自動で連結）
• 範囲を選択してキャプチャ
• 遅延キャプチャ（3秒/5秒/10秒）— ドロップダウンを開いた状態も撮影可能
• 内蔵エディタで矢印・四角形・円・テキスト・マーカーを追加
• PNG / JPEG / PDF で保存
• クリップボードにコピー

キーボードショートカット:
• Alt+Shift+S: フルページキャプチャ
• Alt+Shift+A: 範囲選択キャプチャ

プライバシー:
すべての処理はお使いのデバイス内で完結します。外部サーバーへの送信は一切ありません。
ホスト権限を要求しないため、あなたが撮影を指示したタブ以外にはアクセスできません。
```

### English
```
Name: Full Page Screenshot
Summary: Capture and edit full page screenshots of any webpage

Description:
Capture an entire web page in one click, annotate it, and save it — without leaving the browser.

Features:
• One-click full page capture (scrolling sections are stitched automatically)
• Capture a selected area
• Delayed capture (3s / 5s / 10s) — keeps dropdowns and hover menus open
• Built-in editor: arrows, rectangles, circles, text and highlighter
• Save as PNG, JPEG or PDF
• Copy to clipboard

Keyboard shortcuts:
• Alt+Shift+S: Full page capture
• Alt+Shift+A: Selection capture

Privacy:
Everything is processed on your own device. Nothing is ever sent to a server.
The extension requests no host permissions, so it cannot touch any tab other than the one you
explicitly ask it to capture.
```

---

## 7. 再申請前チェックリスト

- [x] `npm test`（ユニット）と `npm run test:e2e`（実Chrome）が全パス
- [x] 権限セットが期待どおり（`test:e2e` が manifest を実Chromeで直接検証）
- [x] スクリーンショット 1280x800 ×5枚・プロモタイル 440x280 を生成済み
      → `store-assets/screenshots/out/`（再生成は `store-assets/screenshots/render.sh`）
- [x] `./build.sh` の ZIP に `package.json` / `tests/` / `store-assets/` / `docs/` が入らないことを確認
- [ ] `chrome://extensions` に未パッケージで読み込み、`E2E_MANUAL_TEST_CHECKLIST.md` を一周
      （エディタの描画・クリップボード・ダウンロードは自動化対象外）
- [ ] 読み込み時に **権限ダイアログが「閲覧履歴の読み取り」等を要求していない**ことを目視確認
- [ ] `./build.sh` で ZIP を生成してアップロード
- [x] GitHub Pages のプライバシーポリシーURLが公開済み（HTTP 200 確認済み）
- [ ] 上記 §2〜§4 の英文を各欄に貼付
- [ ] カテゴリ「ユーティリティ」、言語「日本語」をプライマリに設定
