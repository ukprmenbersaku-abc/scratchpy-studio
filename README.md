# 🐱 ScratchPy Studio

Scratch のプロジェクトファイル(**.sb3**)と、初心者向けの静的型付きテキスト言語
**ScratchPy**(Python 風構文)を**双方向変換**する Web ツールです。

- 📂 .sb3 を読み込んで ScratchPy コードとして表示・編集(ドラッグ&ドロップ対応)
- 💾 ScratchPy を .sb3 としてダウンロード(Scratch / TurboWarp でそのまま開ける)
- 🧩 **Blockly エディタ** — Scratch 風のブロックをドラッグして組み立て、「コードに反映」で ScratchPy に変換
- 🩺 日本語の診断メッセージ(構文エラー・**静的型チェック**・構造検証)をリアルタイム表示
- 🌳 構造ツリー / project.json プレビュー / 変換ログ
- 🌙 ライト/ダークテーマ切替・グラスモーフィズム UI
- 🖼️ 読み込んだ .sb3 の画像・音声を保持し、再エクスポート時もバイト単位で保存

変換・診断はブラウザ内で完結します。**AIアシスタントを利用する場合のみ**、確認のうえコード・会話・診断・言語仕様が選択したAI事業者へ送信されます（画像・音声ファイル自体は送信しません）。

## 動かす

```bash
npm install
npm run dev        # http://localhost:5173
```

ビルド・テスト:

```bash
npm run build      # 型チェック + 4版を dist/ に本番ビルド
npm test           # 自動テスト(vitest)
npx tsc --noEmit   # 型チェックのみ
```

## GitHub と Cloudflare Pages に公開する

このリポジトリ全体（`package.json` があるフォルダー）を GitHub に置き、**1つの Cloudflare Pages プロジェクト**に接続します。初回および以降の push 時に `npm run build` が4版すべてを `dist/` に作成します。Pages 上のパスは次のとおりです。

| 版 | URL（ドメインの後） |
| --- | --- |
| Studio 日本語 | `/` |
| Studio English | `/en/` |
| Education 日本語 | `/education/` |
| Education English | `/education/en/` |

### 1. GitHub にアップロード

GitHub で**空のリポジトリ**を作り、展開したプロジェクトのルートで以下を実行してください。`<リポジトリのURL>` は GitHub の画面に表示される HTTPS URL に置き換えます。Git と GitHub の認証が必要です（パスワードや API キーをソースに書かないでください）。

```bash
git init
git add .
git commit -m "Initial commit"
git branch -M main
git remote add origin <リポジトリのURL>
git push -u origin main
```

既存リポジトリに追加する場合は上記の `git init` や `remote add` を重複して実行せず、リポジトリに合う手順で push してください。`.gitignore` により依存・ビルド成果物や `.env` 等は除外されますが、公開前に `git status` とファイル内容を確認し、秘密情報を含めないでください。

### 2. Cloudflare Pages を設定

Cloudflare ダッシュボードで **Workers & Pages → 作成 → Pages → Git に接続** を選び、GitHub アカウントとリポジトリを接続します。画面の文言は変わる場合があります。リポジトリへのアクセスを許可したうえで、次の設定でデプロイします。

- フレームワークプリセット: **React (Vite)**
- ビルドコマンド: `npm run build`
- ビルド出力ディレクトリ: `dist`
- ルートディレクトリ: リポジトリのルート（通常は空欄）
- Node.js: ルートの `.node-version` で `22.20.0` を指定済み。Cloudflare 側の `NODE_VERSION` が別途設定されているときはそちらも確認してください。

デプロイが完了すると `https://<プロジェクト名>.pages.dev/` が発行されます。上の各パスから4版を開け、上部の「ページを切替」メニューから移動できます。切り替えはページ再読み込みを伴うため、事前に作品を `.sb3` として保存してください。Education の進捗はブラウザとオリジンごとの保存なので、ローカル環境や別ドメインから自動移行されません。

### 4版をまとめてプレビューする

Node.js 22 と npm をインストールし、プロジェクトのルートで次を実行します。

```bash
npm run start:pages
```

依存関係がなければ `npm ci` で復元し、4版をビルドしてポート **4173** でプレビューします。`http://localhost:4173/` を開き、上部の「ページを切替」または上記の各パスから4版を確認できます。停止は Ctrl+C。ポート4173が使用中の場合は既存のサーバーを停止してください。macOS/Linux では `SCRATCHPY_PREVIEW_PORT=4174 npm run start:pages` のように別ポートも指定できます。ソースの変更後はコマンドを再実行すると再ビルドされます。Arena の Agent Mode では「`npm run start:pages` をプレビューとして起動して」と依頼すれば再開できます。これは Vite のローカルプレビューであり、Cloudflare へのデプロイではありません。

手動では `npm ci && npm run build && npm run preview:pages` でも確認できます。各版だけをビルドする場合は `npm run build:ja`、`npm run build:en`、`npm run build:education`、`npm run build:education:en` を使用できます（出力先はそれぞれ `dist-ja`、`dist-en`、`dist-education`、`dist-education-en`）。統合デプロイには必ず `npm run build` を使います。

**API キーは GitHub や Cloudflare のビルド環境変数に設定しないでください。** 通常版の利用者が自身のブラウザで都度入力し、選択した AI 事業者に直接通信します。公開サイトの運営者はブラウザからキーが見えるリスクと、公開コードの安全性を理解して公開してください。実際の GitHub 接続・Cloudflare デプロイは、それぞれのアカウントでの操作が必要です。

## 通常版の AI アシスタント

日本語・英語の通常版にある **AIアシスタント** タブで、Google Gemini / OpenAI / Anthropic を選び、各自の API キーと利用可能なモデルIDを入力します。キーはページのメモリー内のみで、アプリは localStorage やサーバーに保存しません。プロバイダーを切り替えるとキーを消去し、ページ再読み込みでも消えます。

1. データ送信と課金の説明を確認して同意し、チャットで作りたい内容や修正点を伝えます。現在の ScratchPy コード、ローカル診断、会話、ScratchPy 言語仕様がブラウザから選択した事業者へ直接送信されます。**機密情報は送信しないでください。** キーはブラウザ拡張、端末の利用者や開発者ツールなどに見える可能性があります。安全でない接続では送信できません（HTTPS または localhost を使用）。共有端末を避け、権限と利用上限を絞ったキーを使用してください。
2. AIがコードを提案すると、アプリが構文・静的型・.sb3 の構造を検査し、エラーがあれば最大2回、診断を送って自動修正を試みます（合計最大3回のAPIリクエスト）。プロバイダーの利用料金が発生する場合があります。
3. AIはエディターを勝手に上書きしません。提案コードと警告を確認し、**エディターに適用**を押します。適用後、コードやブロックを変更していなければ直前の AI 適用を元に戻せます。エラーの残る提案、生成後に変更されたプロジェクト、未反映のブロック編集がある場合は適用できません。
4. この機能は Scratch ゲームを実行・操作したり、画像や音声を生成したり、外部ファイルを編集したりしません。生成結果は必ず Scratch で確認してください。入力済みアセットのバイト列は送信されませんが、AIによるスプライトやコスチューム名の変更で既存アセットが使われなくなることがあるため、元の `.sb3` を残してください。

ブラウザからの直接API通信は各社の CORS・組織設定等で拒否される場合があります。特に Anthropic の一部組織では直接アクセスが禁止されています。モデルの提供状況・料金・利用制限は各事業者で確認してください。AI機能は通常版のみです。

## ScratchPy 入門

```scratchpy
stage:
    var score: int = 0 @show

sprite Cat:
    costume costume1

    def jump(power: int):
        repeat power:
            change_y(10)

    on flag:
        jump(5)
        score += 1
        if score > 3:
            say("やった!")
```

→ 💾 ダウンロード → Scratch で実行できます。

## ドキュメント

[docs/](./docs/README.md) に完全なドキュメントがあります:

1. [ScratchPy 言語仕様書](./docs/01-scratchpy-language.md)
2. [.sb3 ファイル形式 完全構造解析](./docs/02-sb3-format-analysis.md)
3. [双方向変換マッピング仕様](./docs/03-conversion-mapping.md)
4. [アーキテクチャ](./docs/04-architecture.md)
5. [使い方ガイド](./docs/05-usage-guide.md)

## 品質保証

- `npx tsc --noEmit` で型エラーゼロ
- **自動テスト**:
  - ユニット: 純 TS 実装 MD5(node:crypto と 100 件一致)/ レキサ / パーサ / 型チェッカ
  - UI: 各パネルの SSR スモークテスト、Blockly と ScratchPy 間の往復変換
  - スモーク: 内蔵サンプル 4 本の解析 + **固定点ラウンドトリップ**(text → sb3 → text' → sb3 → text'' で text' === text'')
  - 実ファイル: scratch-vm / TurboWarp **公式テストフィクスチャ 12 個**の .sb3 で
    インポート・再パース・再エクスポート・構造検証・opcode 保存・特殊文字名の復元・
    モニター復元・アセットの MD5 一致・saveSb3 再読込を確認

## 技術構成

React 18 + TypeScript + Vite。コア変換エンジンは UI から独立した純 TS モジュール
(`src/core/lang/` = 言語フロントエンド、`src/core/sb3/` = .sb3 バックエンド)。
ZIP 処理には fflate を使用します（MD5 は自前実装）。UI は Blockly や Markdown 関連ライブラリを使用します。

## 日本語版と英語版のプレビューを再開する

サーバーや `node_modules` がセッション終了時に消える環境では、プロジェクトのルートで次を実行します。

```bash
npm run start:both
```

必要な依存関係がなければ `npm ci` で復元し、日本語版を **5173**、英語版を **5174** で起動します。両ポートが空いている必要があります。停止するには Ctrl+C。Arena の Agent Mode では「`npm run start:both` をバックグラウンドのプレビューとして起動して」と依頼すると、管理されたプロセスで再開できます。環境のセッション終了後も常時稼働し続ける機能ではありません。

個別に起動する場合は、必要に応じて `npm ci` の後、別ターミナルで `npm run dev:ja` と `npm run dev:en` を実行します。どちらもポートが使用中ならエラーになります。英語版のガイドは概要版で、詳細な技術資料と変換エンジンの診断・一部のログは日本語です。

## Education 版（小中学生向け）

ブロックから ScratchPy にステップアップするための、独立した日本語版と英語版です。日本語版・英語版それぞれに次のモードがあります。

- **レッスン**：全14レッスンで、先に講習を読み、その後で課題に挑戦します。上部に進捗を表示し、ヒントとコード解説を見ながらコードを編集します。後半には Python のコードを読み結果を予想するステップアップ問題もあります。ブロックは参照専用で、コードに合わせて表示されます。「コードに反映」はレッスンにはありません。
- **エディター**：ブロックもコードも自由に編集できます。ブロックの変更を「コードに反映」してから保存してください。対応できない構文や未接続ブロックは、元データを守るため反映できません。

```bash
npm run start:education       # 日本語 Education :5175（必要なら npm ci も実行）
npm run start:education:en    # English Education :5176（必要なら npm ci も実行）
npm run start:all             # 日本語 :5173、英語 :5174、Education 日本語 :5175、Education English :5176
```

該当ポートが空いている必要があります。停止は Ctrl+C。既存の `npm run start:both` は日本語・英語の 2 版のままです。依存関係が準備済みなら `npm run dev:education` または `npm run dev:education:en` でも起動できます。

- レッスンのコードとクリア状況は各版のブラウザの localStorage に保存されます。日本語版と英語版の進捗は別々です。ブラウザデータの削除や別端末では引き継がれません。
- エディターの作品や読み込んだ画像・音声はセッション中のみ保持されます。再読み込みで失われるので、大切な作品は `.sb3` で保存してください。読み込みで既存の作品を置き換える際は確認します。
- アプリ内に Scratch の実行エンジンはありません。「.sb3を保存」でダウンロードし、Scratch の「ファイル」→「コンピューターから読み込む」で開いて実行します。非対応の拡張などは変換で失われる場合があり、読み込み時に警告します。元のファイルも残してください。
- 課題は ScratchPy の構造を静的にチェックし、実行結果をテストするものではありません。例示する Python は比較・読解用で、この画面では編集・実行できません。辞書・内包表記・短絡評価などへの橋渡しはありますが、Python 中級のすべてを網羅するコースではありません。
- 旧6レッスンのコードとクリア状況はそのまま引き継がれます。
- 英語版のミッション、ガイド、操作画面、主な Blockly ラベルは英語ですが、変換エンジンの詳細診断・一部のブロックは日本語です。
- ビルド: `npm run build:education`、`npm run build:education:en`。テスト: `npm test`（日英レッスンの正解、Blockly 往復、`.sb3` 変換を含む）。
