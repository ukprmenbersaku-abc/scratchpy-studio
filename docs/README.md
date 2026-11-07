# ScratchPy Studio ドキュメント

| # | 文書 | 内容 |
|---|---|---|
| 01 | [ScratchPy 言語仕様書](./01-scratchpy-language.md) | 独自言語 ScratchPy の完全な仕様。字句・型システム・宣言・イベント・文・式・組み込み関数カタログ・プロパティ・診断メッセージ |
| 02 | [.sb3 ファイル形式 完全構造解析](./02-sb3-format-analysis.md) | Scratch 3 プロジェクトファイル(ZIP / project.json / ブロック辞書 / 入力符号化 / fields / mutation / アセット / モニター)の構造解析 |
| 03 | [双方向変換マッピング仕様](./03-conversion-mapping.md) | ScratchPy ⇔ .sb3 の対応表全体。opcode マッピング、リテラル符号化、procedures、型推論、ピープホール逆変換、ラウンドトリップ保証 |
| 04 | [アーキテクチャ](./04-architecture.md) | モジュール構成・データフロー・主要データ型・設計判断・UI 構造・テスト戦略 |
| 05 | [使い方ガイド](./05-usage-guide.md) | Web ツールの使い方。クイックスタート、.sb3 の読み込み/書き出し、チュートリアル、FAQ |

## 読み方のおすすめ

- **まず触ってみたい** → [05 使い方ガイド](./05-usage-guide.md)
- **ScratchPy で書きたい** → [01 言語仕様書](./01-scratchpy-language.md)
- **.sb3 の中身を知りたい** → [02 形式解析](./02-sb3-format-analysis.md)
- **変換の仕組みを知りたい** → [03 マッピング](./03-conversion-mapping.md) → [04 アーキテクチャ](./04-architecture.md)
