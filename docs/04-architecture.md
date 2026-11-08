# ScratchPy Studio アーキテクチャ

システム全体の設計・モジュール構成・データフロー・設計判断を記述します。

---

## 目次

1. [全体像](#1-全体像)
2. [ディレクトリ構成](#2-ディレクトリ構成)
3. [コアモジュール详解](#3-コアモジュール)
4. [主要データ型](#4-主要データ型)
5. [設計判断とその理由](#5-設計判断とその理由)
6. [UI(React)アーキテクチャ](#6-uireactアーキテクチャ)
7. [テスト戦略](#7-テスト戦略)
8. [ビルドと開発コマンド](#8-ビルドと開発コマンド)

---

## 1. 全体像

```
┌──────────────────────────── ブラウザ(React UI) ────────────────────────────┐
│  Toolbar / Editor / 診断 / 構造 / JSON / ログ / StatusBar                    │
└──────────────┬────────────────────────────────────────────────────────────┘
               │ src/core/api.ts(ファサード)
   ┌───────────┴──────────────────────────────────────────────┐
   │                                                          │
   ▼ ScratchPy → .sb3                                          ▼ .sb3 → ScratchPy
┌─────────────────────┐                          ┌──────────────────────────┐
│ lexer → parser →    │                          │ zip(fflate) → model →   │
│ typechecker →       │                          │ importer → printer      │
│ exporter → validate │                          │ → validate              │
│ → zip               │                          │                          │
└─────────────────────┘                          └──────────────────────────┘
        共有: ast.ts(型定義)/ builtins.ts(ブロックカタログ)/ md5.ts / assets.ts
```

**外部依存は最小限**です:

| 依存 | 用途 |
|---|---|
| react / react-dom | UI |
| fflate | ZIP の解凍・圧縮(.sb3 の読み書き)。**これだけ** |
| vite / vitest / typescript | ビルド・テスト(開発時) |

scratch-vm には依存しません。MD5 も自前実装(`md5.ts`)で、Node 環境なしにブラウザで完結します。

---

## 2. ディレクトリ構成

```
scratchpy-studio/
├── index.html                  # エントリ HTML
├── package.json / tsconfig.json / vite.config.ts
├── docs/                       # この文書群(01〜05 + README)
├── research/                   # 形式解析に使用した実 .sb3 フィクスチャ
├── public/
└── src/
    ├── main.tsx                # React エントリ
    ├── app/
    │   ├── App.tsx             # 状態管理・イベントハンドラ
    │   ├── styles.css
    │   └── components/
    │       ├── Editor.tsx          # 行番号付きコードエディタ
    │       ├── DiagnosticsPanel.tsx
    │       ├── StructurePanel.tsx
    │       ├── JsonPanel.tsx
    │       ├── LogPanel.tsx
    │       └── StatusBar.tsx
    ├── core/
    │   ├── api.ts              # ファサード(analyzeText/textToSb3/sb3ToText/formatText)
    │   ├── samples.ts          # UI 内蔵サンプル 4 本
    │   ├── lang/
    │   │   ├── ast.ts          # AST・型・診断の型定義(依存の根)
    │   │   ├── lexer.ts        # 字句解析(INDENT/DEDENT)
    │   │   ├── parser.ts       # 再帰下降構文解析
    │   │   ├── printer.ts      # AST → 正準形テキスト
    │   │   ├── builtins.ts     # 関数・メニュー・プロパティ カタログ(SSOT)
    │   │   └── typechecker.ts  # 2 パス型検査 + 名前解決
    │   └── sb3/
    │       ├── model.ts        # SB3Project 等の型定義
    │       ├── md5.ts          # 純 TS MD5
    │       ├── assets.ts       # 既定コスチューム SVG / 既定音 WAV
    │       ├── exporter.ts     # AST → project.json + アセット
    │       ├── importer.ts     # project.json → AST + AssetStore + notes
    │       ├── validate.ts     # 構造検証(参照整合性・MD5)
    │       └── zip.ts          # loadSb3 / saveSb3(fflate)
    └── tests/
        ├── smoke.test.ts       # サンプル 4 本の解析 + 固定点ラウンドトリップ
        ├── unit.test.ts        # MD5/レキサ/パーサ/型チェッカのユニット
        ├── real-sb3.test.ts    # 実 .sb3 12 ファイルの往復・保存性
        └── testdata/*.sb3      # 公式フィクスチャ
```

---

## 3. コアモジュール

### 3.1 ast.ts — 型定義の根

依存グラフの最下層。Expr(13 種)・Stmt(17 種)・BodyItem・Hat・Program・SPType・Diagnostic・Loc を定義。
実行コードを持たないため循環参照が起きません。

- `SPType`: `{kind: 'int'|'float'|'str'|'bool'|'any'}` + `{kind:'list', of: SPType}`
- 型検査の結果(`spType`)と名前解決(`resolutions`)は AST ノードに**注釈として書き戻す**(mutable annotation)設計。

### 3.2 lexer.ts — 字句解析

- Python 風 **INDENT/DEDENT** トークンをインデントスタックで発行。
- コメントのみの行・空行はインデント構造に影響しない(keepComments=true のときコメントトークンだけ残す)。
- Unicode 識別子(日本語変数名)対応。
- 括弧深度(parenDepth)を追跡し、括弧内では改行トークンを抑止(行継続)。
- 2 文字演算子(`==` `!=` `<=` `>=` `+=` `-=`)を先行マッチ。**行末で 1 文字に退化しないよう長さガードあり**(過去のバグの回帰テストあり)。

### 3.3 parser.ts — 構文解析

再帰下降。優先順位は §01 言語仕様書の通り(or < and < not < 比較 < 加減 < 乗除剰余 < 単項 < 後置 < 一次)。

- エラーは `ParseError`(行・列付き日本語メッセージ)で即時中断。
- `parseCollect()` は「エラーまでで構文できた部分 AST + 診断」を返す(UI のライブ解析用: 1 箇所エラーがあっても他の診断を出せる)。
- ブロック本体の開始(enterBlock)は INDENT 前のコメントを回収して本体先頭に付け直す(コメントだけの行がブロック前にあっても失われない)。
- `x.method(...)` 形式は obj が name/listref/varref のとき method 呼び出しとして AST 化。

### 3.4 printer.ts — 正準形への印字

AST → テキスト。**canonical 順**(コメント → 設定 → 変数/リスト → コスチューム/音 → def → イベント)で常に同じ出力を生成します。

- 識別子として出力できない名前は自動的に `"..."` 引用符形式で出力(`displayName`)。
- コメントだけ/空の本体には `pass` を補完(再パース可能性の保証)。
- この printer の出力を parser が読み戻すと同一 AST になることが固定点テストで担保されています。

### 3.5 builtins.ts — ブロックカタログ(SSOT)

「ScratchPy 関数名 ⇔ Scratch opcode ⇔ 引数型 ⇔ 戻り値型 ⇔ メニュー許可値」の**唯一の情報源**。
型チェッカ(引数検査)とエクスポータ(opcode 生成)が同じテーブルを共有することで、ズレを構造的に防いでいます。

### 3.6 typechecker.ts — 2 パス型検査

```
パス 1(収集): すべてのターゲットを走査し
  ・変数/リスト/def の宣言をスコープに登録
  ・名前解決(resolutions: ASTノード → 宣言エンティティ)を確定
パス 2(検査): 文・式を再帰的に型検査し
  ・代入可能性(assignable)判定
  ・引数型チェック(str パラメータは数値/真偽も受容)
  ・解決結果を AST に spType として注釈
```

解決順序: **パラメータ → ローカル変数 → グローバル変数(ステージ) → プロパティ**。
`in` の右辺と `list[i]` の対象は「リストを値として使う」エラーを回避するため、
名前解決を経由せず直接リスト宣言へ解決します。

エクスポータはこの resolutions/spType 注釈を読んで
「この名前は変数かリストかプロパティか」「この式の型は何か」を判断します(再解決しない)。

### 3.7 model.ts — SB3 の型定義

`SB3Project` / `SB3Target` / `SB3Block` / `SB3Monitor` / `BlockInput`(再帰的な入力配列)/ `FieldLike` 等。
実ファイルで観測された**すべての揺れ**(数値 or 文字列、タプル長 2 or 3、bitmapResolution 欠落)を許容する型にしています。

### 3.8 md5.ts — 純 TS MD5

アセットの md5ext 算出・検証用。FIPS 180-13 準拠の標準実装(テーブル驱动)。
node:crypto と 100 件ランダム一致するテストあり(unit.test.ts)。ブラウザで動くため Node API に依存しません。

### 3.9 assets.ts — 既定アセット

コスチューム未宣言のスプライトには「オレンジ枠の空 SVG」、音未宣言には「無音 WAV」を生成。
Scratch の「デフォルトスプライト」相当をコードで生成するため、**アセットなしのテキストだけで完全な .sb3 が作れます**。

### 3.10 exporter.ts — AST → project.json

- `BlockBuilder`: ブロック ID 採番(可読プレフィックス付き)+ parent/next/topLevel の整合を管理。
- ターゲットごとに `TargetCtx`(変数 ID マップ、プロシージャ情報、パラメータスコープ)を持つ。
- 変数/リスト ID は `var_<target>_<name>` 形式で決定的に生成(衝突時 `_2` サフィックス)。
- ブロードキャスト ID は `broadcastMsgId-<名前>`(ステージに登録)。
- C 型制御(if/repeat/forever)は SUBSTACK の先頭・末尾 ID を返す再帰でチェイン連結。
- 出力後、`monitors` 配列を宣言(@show 系)から構築。

### 3.11 importer.ts — project.json → AST

最大のモジュール(約 1200 行)。処理順:

```
1. 変数/リスト/ブロードキャストのメタ収集
2. 変数の型推論(使用箇所スキャン → 初期値 → any 緩和)§03-9
3. プロシージャ定義の事前収集(proccode → def 名マップ)
4. モニターの対応付け
5. ターゲットごとに: 宣言 → 設定 → スクリプト(topLevel を y,x 順に)を AST 化
6. notes / unsupportedOpcodes の収集
```

- opcode → AST の変換は大きな switch(式: `importExpr`、文: `importChain/importStmt`)。
- ピープホール逆変換(§03-10)で exporter の代替形を元の構文へ復元。
- 未知の opcode は「コマンド → 変換不可コメント」「レポータ → num(0)/str("") + note」。

### 3.12 validate.ts — 構造検証

出力 project.json の自己検証(= VM が読む前に壊れを検出):

- 変数/リスト/ブロードキャスト ID の参照整合(辞書に登録があるか)
- next/parent の双方向整合・ dangling 参照
- shadow ブロックが topLevel でないこと
- procedures mutation の JSON パース可能性・argumentids と inputs の一致
- monitors の id/mode 妥当性
- アセット Map が渡された場合、md5ext とファイル内容の MD5 一致検証
- コスチューム番号の範囲、stage が targets[0] であること 等

severity: error(=書き出し失敗)/ warning(=UI に表示)。

### 3.13 zip.ts — loadSb3 / saveSb3

- fflate の `unzipSync` / `zipSync`(圧縮レベル 6)。
- project.json の探索(大文字小文字・ネストのフォールバック付き)。
- 壊れた ZIP / project.json 欠落は `Sb3ParseError`(日本語メッセージ)。

### 3.14 api.ts — ファサード

UI・テストはここだけを見ます:

| 関数 | 用途 |
|---|---|
| `analyzeText(src)` | 字句+構文+型+統計+(型 OK なら)project.json プレビュー |
| `textToSb3(src, store?)` | テキスト → .sb3 バイト列(検証込み) |
| `sb3ToText(bytes)` | .sb3 → テキスト + AssetStore + notes |
| `formatText(src)` | 正準形への整形 |
| `roundTripSb3 / roundTripText` | テスト用往復ヘルパ |

---

## 4. 主要データ型

```ts
Program { stage?: StageDef, sprites: SpriteDef[], comments }
StageDef/SpriteDef { decl, name?, body: BodyItem[] }
BodyItem = VarDecl | ListDecl | CostumeDecl | SoundDecl | ConfigDecl
         | FuncDef | EventDef | CommentStmt | PassStmt
Stmt     = assign | augassign | listmethod | if | while | repeat | forever
         | wait | stop | broadcast | clone | ask | ... | exprstmt | comment | pass
         | unsupported(RawUnsupportedStmt)
Expr     = num | str | bool | color | listlit | name | varref | listref
         | unary | binary | index | prop | call

CheckResult { diagnostics, resolutions: Map<Expr, 解決エンティティ> }
AssetStore  { costumes: Map<"target\u0000name", CostumeAsset>, sounds: Map<...> }
SB3Project  { targets, monitors, extensions, meta }   // §02 参照
```

---

## 5. 設計判断とその理由

| 判断 | 理由 |
|---|---|
| scratch-vm に依存しない | ブラウザ完結・バンドルサイズ・オフライン動作。必要な知識は model.ts + validate.ts に再定義 |
| MD5 を自前実装 | node:crypto はブラウザにない。Web Crypto は async でパイプラインが複雑化するため同期実装 |
| ZIP に fflate | 同期 API・小さい(≈30KB)・実績十分 |
| builtins.ts を SSOT に | 型チェックと出力の二箇所でテーブルを持つと必ずズレる。1 箇所から両方が読む |
| 型解決を AST に注釈 | エクスポータが再解決すると解決順序の二重実装になる。checker の結果をそのまま使う |
| printer を正準形に | 「往復でテキストが安定する」= 固定点にできる。差分比較テストが可能になる |
| import は note 方式で非破壊 | 未対応ブロックを黙って捨てない。コメント + notes + unsupportedOpcodes の三重記録 |
| validate を独立モジュールに | エクスポートのバグを「VM に読ませる前」に検出。テストでも再利用 |
| パーサは部分 AST を返せる | UI で 1 行エラーがあっても他の診断をライブ表示できる |

---

## 6. UI(React)アーキテクチャ

```
App.tsx(状態の単一ソース)
 ├─ text          : エディタ内容
 ├─ assetStore    : 読み込んだ .sb3 のアセット(書き出し時に再利用)
 ├─ analysis      : analyzeText(text) の結果(300ms デバウンス)
 ├─ log[]         : 変換履歴(notes・エラー・統計)
 ├─ tab           : 診断 | 構造 | JSON | ログ
 └─ ファイル入出力 : input[type=file] / Blob ダウンロード / ドラッグ&ドロップ(window リスナ)

Editor          : 行番号 + textarea(スクロール同期)、Tab=4スペース挿入、jumpTo(line)
DiagnosticsPanel: 診断リスト → クリックで Editor.jumpTo
StructurePanel  : AST を折りたたみツリー表示(printHat/printStmts を再利用)
JsonPanel       : analysis.project の JSON プレビュー
LogPanel        : 変換ログ(notes / unsupportedOpcodes / 検証警告)
StatusBar       : エラー・警告数 / 統計 / カーソル位置 / ファイル名
```

- **ライブ解析**: 入力 300ms 後に analyzeText(構文+型+JSON プレビューまで)を実行。
- **アセット保持**: .sb3 を読み込むと AssetStore に元画像・音声を保持し、書き出し時に
  同じコスチューム名・音名なら**元バイト列をそのまま**再使用(MD5 不変)。
- プレビュー環境対応: 開発サーバは 0.0.0.0 バインド。変換自体は外部リソース不要。通常版のAIアシスタントとEducation版のAI学習サポートは、同意とAPIキーによる外部通信が必要。Education版の会話・レッスン情報・言語仕様は送信され、コードと診断は利用者が明示的に選択した場合のみ送信。画像・音声のバイト列は送信しない。

---

## 7. テスト戦略

| ファイル | 内容 | 件数 |
|---|---|---|
| unit.test.ts | MD5(RFC ベクトル + node:crypto 比較 100 件)/ レキサ(INDENT/DEDENT、コメント行、行末 `:` 回帰、2 文字演算子)/ パーサ(エラー 5 種 + 完全プログラム)/ 型チェッカ(負例 15 種) | 36 |
| smoke.test.ts | 内蔵サンプル 4 本 × (解析エラーなし + 固定点往復 text1===text2) | 8 |
| real-sb3.test.ts | 公式フィクスチャ 12 本 × (ZIP/MD5 健全性 + インポート再パース + ラウンドトリップ検証)+ opcode 保存・特殊文字・モニター・アセットバイト保存・saveSb3 再読込 | 37 |

AI・Education・UI等を含む全自動テストを実行: `npm test`(vitest)。型検査: `npx tsc --noEmit`。

---

## 8. ビルドと開発コマンド

```bash
npm install        # 依存インストール
npm run dev        # 開発サーバ(0.0.0.0:5173)
npm run build      # 型チェック + 本番ビルド(dist/)
npm run preview    # ビルド結果のプレビュー
npm test           # vitest 全実行
npx tsc --noEmit   # 型チェックのみ
```

---

*変換の対応表は `docs/03-conversion-mapping.md`、形式の詳細は `docs/02-sb3-format-analysis.md` を参照。*
