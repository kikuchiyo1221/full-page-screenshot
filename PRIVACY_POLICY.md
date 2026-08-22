# Privacy Policy / プライバシーポリシー

Last updated: 2026-08-23

## English

### Full Page Screenshot Extension Privacy Policy

#### Data Collection
This extension does **not** collect, store, or transmit any personal data or browsing information to external servers.

#### What the Extension Does
- Captures screenshots of web pages you are viewing
- Stores screenshots temporarily in local browser storage for editing
- Downloads images to your local device when you save them
- Copies images to your clipboard when you choose to copy

#### Permissions Used
- **activeTab**: Grants access to a single tab, only after you explicitly start a
  capture (toolbar button, keyboard shortcut, or right-click menu). The access ends
  when that tab navigates.
- **scripting**: Used to measure and scroll the page being captured, to hide fixed
  headers so they are not repeated in every stitched section, and to show the
  drag-to-select overlay. Code is injected only into the tab you are capturing.
- **downloads**: Required to save screenshots to your device
- **storage** / **unlimitedStorage**: Required to save your preferences and to pass the
  captured image to the editor tab. Full-page screenshots regularly exceed the default
  10 MB storage quota, which is why unlimited storage is requested.
- **alarms**: Required for delayed capture functionality
- **contextMenus**: Adds the two right-click menu entries

The extension requests **no host permissions**. It has no standing access to the sites
you visit and cannot read or capture any page you have not explicitly asked it to.

#### Data Storage
- All captured screenshots are processed locally on your device
- Extension settings (format preferences, filename prefix) are stored locally using Chrome's storage API
- No data is sent to any external servers

#### Third-Party Services
This extension does not use any third-party analytics, tracking, or data collection services.

#### Contact
If you have questions about this privacy policy, please create an issue on the project's repository.

---

## 日本語

### フルページスクリーンショット拡張機能 プライバシーポリシー

#### データ収集について
この拡張機能は、個人データや閲覧情報を外部サーバーに収集、保存、送信することは**一切ありません**。

#### 拡張機能の動作
- 閲覧中のWebページのスクリーンショットを撮影します
- 編集のためにスクリーンショットをブラウザのローカルストレージに一時保存します
- 保存時にお使いのデバイスに画像をダウンロードします
- コピーを選択するとクリップボードに画像をコピーします

#### 使用する権限
- **activeTab**: あなたがキャプチャを開始した時（アイコンクリック・ショートカット・右クリックメニュー）
  にのみ、そのタブ1つへのアクセスが付与されます。タブが遷移すると権限は失われます。
- **scripting**: キャプチャ対象ページの計測・スクロール、固定ヘッダーの一時非表示、
  範囲選択オーバーレイの表示に使用します。注入先はキャプチャ対象のタブのみです。
- **downloads**: スクリーンショットをデバイスに保存するために必要
- **storage** / **unlimitedStorage**: 設定の保存と、撮影した画像を編集画面へ受け渡すために必要。
  フルページのスクリーンショットは標準の10MB制限を超えることが多いため、無制限ストレージを要求しています。
- **alarms**: 遅延キャプチャ機能に必要
- **contextMenus**: 右クリックメニューの2項目を追加するために必要

この拡張機能は **host permissions（ホスト権限）を一切要求しません**。
閲覧中のサイトへの常時アクセス権はなく、あなたが明示的に指示していないページを読み取ることはできません。

#### データの保存
- すべてのスクリーンショットはお使いのデバイス上でローカルに処理されます
- 拡張機能の設定（フォーマット、ファイル名プレフィックス）はChromeのストレージAPIを使用してローカルに保存されます
- 外部サーバーにデータが送信されることはありません

#### サードパーティサービス
この拡張機能は、サードパーティの分析、追跡、データ収集サービスを一切使用していません。

#### お問い合わせ
このプライバシーポリシーについてご質問がある場合は、プロジェクトのリポジトリでissueを作成してください。
