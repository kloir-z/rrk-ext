# 楽楽勤怠カスタマイザー - 開発ガイド

## プロジェクト概要

楽楽勤怠の出勤簿画面をカスタマイズするChrome/Edge拡張機能です。

### 主要機能
1. **列の表示/非表示切り替え** - 40列以上ある出勤簿から必要な列だけを表示
2. **ダブルクリックで編集モード起動** - 行をダブルクリックで即座に編集開始
3. **シングルクリックでチェックボックストグル** - 行をクリックで選択/解除
4. **備考列の幅調整** - 200px〜800pxで調整可能
5. **設定の自動保存** - Chrome Storage APIで永続化

---

## アーキテクチャ

### 技術スタック
- **Manifest Version**: 3
- **言語**: Vanilla JavaScript (フレームワークなし)
- **API**: Chrome Extensions API (storage, activeTab)
- **対象URL**: `https://tms.rakurakukintai.jp/app/attendance*`

### ファイル構成

```
C:\js\rrk-ext\
├── manifest.json       # 拡張機能の設定ファイル（権限、スクリプト注入）
├── content.js          # メインロジック（18KB、549行）
├── popup.html          # 設定画面UI
├── popup.js            # 設定画面ロジック（229行）
├── styles.css          # カスタムスタイル（テーブル幅制御など）
└── README.md           # ユーザー向けドキュメント
```

---

## 主要コンポーネント解説

### 1. content.js（メインロジック）

#### 初期化フロー
```
document ready
  └─> initialize() (376行目)
       ├─> waitForTables() (347行目) - テーブル読み込み待機
       ├─> buildColumnIndexMap() (89行目) - 列名→インデックスのマップ構築
       ├─> loadAndApplySettings() (206行目) - 保存設定の適用
       ├─> setupClickHandlers() (241行目) - クリックイベント設定
       └─> startObserver() (502行目) - DOM監視開始
```

#### 重要な関数

**buildColumnIndexMap() (89行目)**
- `#moveTable`のヘッダーを解析して列名とインデックスのマッピングを構築
- `div`要素の`title`属性を優先的に使用（省略表記対策）
- 結果は`columnIndexMap`オブジェクトに格納

**applyColumnVisibility() (117行目)**
- 設定に基づいて列の表示/非表示を切り替え
- CSSの`display: none`を使用
- `nth-child`セレクタでヘッダーとすべてのボディセルに適用

**setupClickHandlers() (241行目)**
- シングルクリックとダブルクリックを100msのタイマーで区別
- シングルクリック: チェックボックスをトグル
- ダブルクリック: チェック + 編集ボタンクリック
- チェックボックス領域のクリックは無視（元の動作を維持）

**MutationObserver (426行目)**
- `#attendance_content_area`と`#wrapper`を監視
- テーブル再描画時に設定を再適用
- 編集モード時の備考列幅も自動修正
- デバウンス処理（300ms）で連続変更をまとめて処理

#### データ構造

**DEFAULT_COLUMNS (27行目)**
```javascript
{
  'カレンダー': true,      // 表示
  '申請内容': true,
  '早出フラグ': false,     // 非表示
  // ... 全60列以上
}
```

### 2. popup.js（設定画面）

#### 主要機能

**renderColumnList() (84行目)**
- 重要な列を先頭に表示（カレンダー、出社、退社など）
- その他の列はアルファベット順

**プリセット (64行目)**
- `minimal`: 最小限（6列のみ）
- `basic`: デフォルト（8列）
- `all`: すべて表示

**設定の保存 (134行目)**
```javascript
chrome.storage.sync.set({
  columnSettings: currentSettings,
  remarksWidth: currentRemarksWidth
})
```

### 3. styles.css

#### CSS変数を使った動的幅調整
```css
--rrk-remarks-width: 400px; /* JavaScriptから動的に変更 */
```

#### 重要なスタイル
- `#moveTable tbody tr`: ポインタカーソル + ホバー効果
- 備考列: CSS変数で幅を制御
- 各列: `min-width: 60px`, `max-width: 200px`

---

## デバッグ方法

### コンソールログの活用

拡張機能は詳細なログを出力します：

```javascript
// 初期化時
console.log('楽楽勤怠カスタマイザー: 読み込み開始');
console.log('列マップ: カレンダー -> 0');

// テーブル検出
console.log('✓ テーブルが見つかりました');

// 設定適用
console.log('列の表示/非表示を適用中...', settings);
```

### デバッグ手順

1. **Edge開発者ツールを開く** (F12)
2. **Consoleタブ**で「楽楽勤怠カスタマイザー」でフィルタ
3. **Sourcesタブ**で`content.js`にブレークポイント設定
4. **Networkタブ**でページ読み込みを確認

### よくあるデバッグポイント

#### テーブルが見つからない
```javascript
// content.js:378 - debugDOMStructure()を確認
console.log('fixedTable:', document.querySelector('#fixedTable'));
console.log('moveTable:', document.querySelector('#moveTable'));
```

#### 列が非表示にならない
```javascript
// content.js:124 - columnIndexMapを確認
console.log('列が見つかりません:', columnName);
```

#### イベントが発火しない
```javascript
// content.js:259 - ハンドラ設定の重複チェック
if (tbody.dataset.rrk_handlersSet === 'true') {
  console.log('イベントハンドラは既に設定されています');
}
```

---

## よくある問題と解決方法

### 問題1: 拡張機能が動作しない

**原因**
- テーブルの読み込みタイミングの問題
- ページ構造の変更

**解決方法**
```javascript
// content.js:347 - waitForTablesの試行回数を増やす
function waitForTables(callback, maxAttempts = 20) // デフォルト20回
```

### 問題2: 編集モード時に備考列が狭い

**原因**
- 楽楽勤怠がインラインスタイルで幅を上書き

**解決方法**
```javascript
// content.js:157 - fixRemarksInputWidth()が自動修正
displayArea.removeAttribute('style'); // インラインスタイルを削除
displayArea.style.width = 'auto';      // カスタム幅を適用
```

### 問題3: 設定が保存されない

**原因**
- Chrome Storage APIの権限不足
- `manifest.json`の`storage`権限を確認

**解決方法**
```json
// manifest.json:6
"permissions": [
  "storage",  // ← これが必須
  "activeTab"
]
```

---

## 開発時の注意事項

### 1. イベントハンドラの重複防止

**問題**: MutationObserverでテーブルが再構築される度にイベントハンドラが重複登録される

**対策**:
```javascript
// content.js:259
if (tbody.dataset.rrk_handlersSet === 'true') {
  return; // 既に設定済みならスキップ
}
tbody.dataset.rrk_handlersSet = 'true';
```

### 2. デバウンス処理の重要性

**問題**: DOM変更が連続して発生すると処理が多重実行される

**対策**:
```javascript
// content.js:487 - 300msのデバウンス
if (reapplyTimer) clearTimeout(reapplyTimer);
reapplyTimer = setTimeout(() => {
  loadAndApplySettings();
}, 300);
```

### 3. シングル/ダブルクリックの区別

**実装**:
```javascript
// content.js:281 - 100msのタイマーで判定
clickTimer = setTimeout(() => {
  // シングルクリック処理
}, 100);

// ダブルクリックが来たらタイマーをクリア
if (clickTimer) {
  clearTimeout(clickTimer);
  clickTimer = null;
}
```

### 4. Chrome Storage API

**同期ストレージの制限**:
- 最大容量: 100KB
- 書き込み頻度: 1分間に最大120回

**使用例**:
```javascript
// 読み込み
chrome.storage.sync.get(['columnSettings', 'remarksWidth'], (result) => {
  const settings = result.columnSettings || DEFAULT_COLUMNS;
});

// 保存
chrome.storage.sync.set({
  columnSettings: currentSettings
});

// 変更監視
chrome.storage.onChanged.addListener((changes, namespace) => {
  if (changes.columnSettings) {
    applyColumnVisibility(changes.columnSettings.newValue);
  }
});
```

---

## 追加機能開発ガイド

### 新しい列設定を追加する場合

1. **DEFAULT_COLUMNSに追加** (content.js:27, popup.js:4)
   ```javascript
   '新しい列名': false,  // デフォルトは非表示
   ```

2. **プリセットに追加** (popup.js:64)
   ```javascript
   minimal: {
     '新しい列名': true  // 必要に応じて
   }
   ```

### 新しいクリックイベントを追加する場合

1. **setupClickHandlers()を拡張** (content.js:241)
   ```javascript
   tbody.addEventListener('contextmenu', (e) => {
     // 右クリックの処理
   });
   ```

2. **イベントの重複防止を忘れずに**
   ```javascript
   if (tbody.dataset.rrk_contextmenuSet === 'true') return;
   tbody.dataset.rrk_contextmenuSet = 'true';
   ```

### 新しい設定項目を追加する場合

1. **popup.htmlにUIを追加**
   ```html
   <div class="section">
     <div class="section-title">新しい設定</div>
     <input type="checkbox" id="newSetting">
   </div>
   ```

2. **popup.jsで保存処理を追加**
   ```javascript
   chrome.storage.sync.set({
     columnSettings: currentSettings,
     remarksWidth: currentRemarksWidth,
     newSetting: newSettingValue  // 追加
   });
   ```

3. **content.jsで設定を適用**
   ```javascript
   chrome.storage.sync.get(['columnSettings', 'remarksWidth', 'newSetting'], (result) => {
     const newSetting = result.newSetting || false;
     // 設定を適用
   });
   ```

### DOM監視の範囲を拡張する場合

1. **MutationObserverのコールバックを編集** (content.js:426)
   ```javascript
   const observer = new MutationObserver((mutations) => {
     mutations.forEach(mutation => {
       if (mutation.target.id === '新しい要素ID') {
         // 新しい処理
       }
     });
   });
   ```

2. **監視オプションを調整**
   ```javascript
   observer.observe(contentWrapper, {
     childList: true,
     subtree: true,
     attributes: true,
     attributeFilter: ['class', 'style', 'data-custom']  // 追加
   });
   ```

---

## パフォーマンス最適化のヒント

### 1. セレクタの最適化

**遅い**:
```javascript
document.querySelectorAll('td');  // すべてのtd要素
```

**速い**:
```javascript
document.querySelectorAll('#moveTable td');  // 特定のテーブル内のみ
```

### 2. 一括DOM操作

**遅い**:
```javascript
cells.forEach(cell => {
  cell.style.display = 'none';  // 個別にスタイル変更
});
```

**速い**:
```javascript
const style = document.createElement('style');
style.textContent = selector + ' { display: none; }';
document.head.appendChild(style);
```

### 3. デバウンスの活用

**必須箇所**:
- MutationObserver (content.js:487)
- スライダーの値変更 (popup.js:224)
- ウィンドウリサイズイベント

---

## テスト方法

### 手動テスト項目

#### 基本機能
- [ ] 拡張機能が読み込まれる
- [ ] 列の表示/非表示が切り替わる
- [ ] 設定が保存される
- [ ] ページリロード後も設定が維持される

#### クリック機能
- [ ] シングルクリックでチェックボックスがトグルされる
- [ ] ダブルクリックで編集モードに入る
- [ ] チェックボックスをクリックしても誤動作しない

#### 編集モード
- [ ] 編集モード中はダブルクリックが無効になる
- [ ] 備考列の幅が正しく適用される
- [ ] 保存後にテーブルが再描画されても設定が維持される

#### プリセット
- [ ] 「最小限」プリセットが正しく動作する
- [ ] 「基本」プリセットが正しく動作する
- [ ] 「すべて表示」プリセットが正しく動作する

#### 備考列幅
- [ ] スライダーで幅を変更できる
- [ ] 編集モード時も幅が正しく適用される
- [ ] 保存後も幅が維持される

### デバッグ用のコマンド

**コンソールで設定を確認**:
```javascript
chrome.storage.sync.get(['columnSettings', 'remarksWidth'], console.log);
```

**設定をリセット**:
```javascript
chrome.storage.sync.clear(() => console.log('設定をクリアしました'));
```

**列マップを確認**:
```javascript
// content.jsのbuildColumnIndexMap()実行後
console.table(columnIndexMap);
```

---

## トラブルシューティングチェックリスト

### 拡張機能が読み込まれない
- [ ] `edge://extensions/`で拡張機能が有効になっているか
- [ ] manifest.jsonにエラーがないか
- [ ] 対象URLが`https://tms.rakurakukintai.jp/app/attendance*`か

### 列が非表示にならない
- [ ] `buildColumnIndexMap()`が実行されたか
- [ ] `columnIndexMap`に列名が含まれているか
- [ ] CSSセレクタが正しいか（`nth-child`のインデックス）

### クリックイベントが発火しない
- [ ] イベントハンドラが重複登録されていないか
- [ ] `tbody.dataset.rrk_handlersSet`をチェック
- [ ] チェックボックスが無効（disabled）でないか

### 設定が保存されない
- [ ] Chrome Storage APIのエラーログを確認
- [ ] 容量制限（100KB）を超えていないか
- [ ] 権限（`storage`）が付与されているか

### 備考列の幅が適用されない
- [ ] CSS変数`--rrk-remarks-width`が設定されているか
- [ ] インラインスタイルが上書きしていないか
- [ ] `fixRemarksInputWidth()`が実行されたか

---

## 将来の改善案

### 機能追加
- [ ] キーボードショートカット（例: Ctrl+Eで編集モード）
- [ ] 複数行の一括選択（Shift+クリック）
- [ ] カスタムプリセットの保存
- [ ] 列の並び替え機能
- [ ] エクスポート/インポート機能（設定の共有）

### パフォーマンス
- [ ] Virtual DOM的なアプローチで再描画を最適化
- [ ] Web Workerで重い処理をバックグラウンド化
- [ ] IndexedDBでより大容量の設定を保存

### UX改善
- [ ] ドラッグ&ドロップで列の並び替え
- [ ] プレビュー機能（保存前に確認）
- [ ] ダークモード対応
- [ ] アクセシビリティ改善（ARIA属性）

---

## リソース

### 公式ドキュメント
- [Chrome Extensions API](https://developer.chrome.com/docs/extensions/reference/)
- [Chrome Storage API](https://developer.chrome.com/docs/extensions/reference/storage/)
- [MutationObserver MDN](https://developer.mozilla.org/en-US/docs/Web/API/MutationObserver)

### デバッグツール
- Edge DevTools (F12)
- `chrome://extensions/` - 拡張機能管理
- Backgrounds DevTools - Service Worker（今後使う可能性）

---

## 連絡先・サポート

このドキュメントは開発者向けです。ユーザー向けのドキュメントは`README.md`を参照してください。

**最終更新**: 2026-01-17
