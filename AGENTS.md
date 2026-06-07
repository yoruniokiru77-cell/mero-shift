# AGENTS.md

This file provides guidance to Codex (Codex.ai/code) when working with code in this repository.

## プロジェクト概要

チャットレディ向けシフト管理SaaSの `new-shift` ディレクトリ。2つの独立した単一HTMLアプリで構成される。

| ファイル | 役割 |
|---|---|
| `index.html` | シフト管理システム本体（管理者・キャスト二役） |
| `memo.html` | 配信メモ管理（キャスト別にコピー用テキストを保管） |

## ビルド・テスト

ビルド不要。ブラウザで直接開くか静的サーバで確認する。

```bash
# 簡易サーバ起動（Python）
python -m http.server 8080
```

変更後の動作確認はブラウザで該当HTMLを開き直すのみ。

## バックエンド構成

### Supabase（メインDB）

両ファイルとも同一プロジェクトに接続：
- URL: `https://ikzctvohinssktfgspny.supabase.co`
- anon key: HTML内にハードコード（RLS無効・anon全権限）

**index.html のテーブル**: `casts`, `shifts`, `rooms`, `shops`, `tokens`, `points`, `daily_pays`, `staffs`, `staff_dailys`

**memo.html のテーブル**: `memos`, `genres`（+ `casts` を読み取り専用で参照）

### GAS（Google Apps Script）

`GAS_NOTIFY_URL` は LINE push通知と明細書き込みのみ担当。シフトCRUDはすべてSupabase直叩き。

## index.html アーキテクチャ

### 状態管理

グローバル `S` オブジェクトにアプリ全状態を集約：

```javascript
const S = {
  castName, isAdmin,
  casts, rooms, shops,
  approvedShifts, pendingShifts,
  payrollData, dpPoints, backRates, dpAmounts,
  staffs, ...
};
```

### 認証フロー

1. URLパラメータ `?admin=1` → 管理者モード直接起動
2. それ以外 → `showLogin()` → LINEトークン or ログインID/パスワードで認証 → `bootApp()`

### ページルーティング

`showPage(id)` で `.page` 要素の `active` クラスを切り替え。サイドバー `.nav-item` がページIDとセットで定義。

**キャスト向けページ**: `page-submit`（シフト申請）, `page-my-payroll`（自分の給与）

**管理者向けページ**: `page-approval`, `page-calendar`, `page-reminder`, `page-payroll`, `page-casts`, `page-staff`, `page-shops`, `page-rooms`

### apiGet / sbAction

`apiGet(action, params)` → `sbAction(action, params)` にディスパッチ。全DBアクセスはここに集約。スネークケース→キャメルケースのマッピングはアクションごとに個別定義（例: `sbCastFmt`, `sbShiftFmt`）。

**重要**: 新しいアクションを追加する場合は `sbAction` の `switch` に追記し、DB列名マッピング関数（`sbXxxFmt`）を定義する。

### 時刻表現

シフトの終了時刻は26時表記（例: `26:00` = 翌2:00）を文字列で保存。`timeToMin()` で分換算、`hasTimeOverlap()` で重複チェック。

## memo.html アーキテクチャ

### 状態管理

グローバル `D` オブジェクト：

```javascript
const D = { casts, memos, genres, activeGenre, memoEditTarget, genreEditTarget };
```

### apiGet / Supabase直叩き

`sbQ(table, opts)` で Supabase JS SDK を薄くラップ。

**マッピング規則**: Supabase返却値（スネークケース）は必ずキャメルケースに変換してから `D.*` に格納する。

```javascript
// 例: memos テーブル
{ row: r.id, castName: r.cast_name, genre: r.genre, body: r.body }
// 例: genres テーブル
{ row: g.id, id: String(g.id), name: g.name, order: g.display_order }
```

`casts` テーブルは `getCasts` で読み取り専用参照（シフト管理側と同じプロジェクト）。

### UI構造

- ジャンルタブ → キャストグリッド → メモボトムシート（タップでクリップボードコピー）
- 管理パネルは別画面（メモCRUD・ジャンルCRUD）

## CSS規約

- デザイントークンはすべて `:root` のCSS変数で定義（`--bg`, `--accent`, `--green` 等）
- 配色変更は CSS変数の上書きで行い、個別 `color:` 直書き不可
- モバイルファースト・max-width なし（全幅対応）
