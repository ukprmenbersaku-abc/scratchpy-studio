# ScratchPy ⇔ .sb3 変換マッピング仕様

ScratchPy Studio の変換器が行う対応関係を、方向別に完全に記述します。

- **エクスポート**(ScratchPy → .sb3): `src/core/sb3/exporter.ts`
- **インポート**(.sb3 → ScratchPy): `src/core/sb3/importer.ts`

---

## 目次

1. [変換パイプライン](#1-変換パイプライン)
2. [プログラム構造の対応](#2-プログラム構造の対応)
3. [イベント(ハット)の対応](#3-イベントハットの対応)
4. [文 → opcode 対応表](#4-文--opcode-対応表)
5. [式 → opcode 対応表](#5-式--opcode-対応表)
6. [リテラルと入力符号化](#6-リテラルと入力符号化)
7. [カスタムブロック ⇔ procedures](#7-カスタムブロック--procedures)
8. [変数モニター ⇔ アノテーション](#8-変数モニター--アノテーション)
9. [インポート時の型推論](#9-インポート時の型推論)
10. [ピープホール逆変換(可逆性の担保)](#10-ピープホール逆変換可逆性の担保)
11. [変換できないもの・失われるもの](#11-変換できないもの失われるもの)
12. [ラウンドトリップ保証](#12-ラウンドトリップ保証)

---

## 1. 変換パイプライン

### ScratchPy → .sb3

```
ソーステキスト
  →字句解析(lexer)→ トークン列
  →構文解析(parser)→ AST(Program)
  →型検査(typechecker)→ 診断 + 解決テーブル(resolutions)
  →出力(exporter)→ project.json オブジェクト + アセット(md5ext→bytes)
  →構造検証(validate)→ 参照整合性・MD5 検査
  →ZIP 化(zip/fflate)→ .sb3 バイト列
```

型エラーが 1 つでもあると出力は中止されます(ExportError)。

### .sb3 → ScratchPy

```
.sb3 バイト列
  →ZIP 解凍(zip)→ project.json + アセットファイル群
  →構造検証(validate)
  →取り込み(importer)→ AST + AssetStore + notes(変換メモ)
  →印字(printer)→ 正準形(canonical)テキスト
```

---

## 2. プログラム構造の対応

| ScratchPy | .sb3 |
|---|---|
| `stage:` ブロック | `targets[0]`(isStage: true) |
| `sprite 名前:` ブロック | `targets[i]`(isStage: false)、`name` |
| スプライト宣言順 | `layerOrder`(1 からの連番。明示 `layer_order:` 設定があれば優先) |
| `var`(stage) | ステージの `variables`(グローバル) |
| `var`(sprite) | スプライトの `variables`(ローカル) |
| `list` | 同様に `lists` |
| `broadcast("m")` / `on receive "m"` | ステージの `broadcasts` に登録(id = `broadcastMsgId-<名前>`) |
| `costume 名前` / `sound 名前` | `costumes[]` / `sounds[]`。アセット未登録なら既定 SVG/WAV を生成 |
| 設定 `x: 100` 等 | ターゲットの同名フィールド |
| pen/music 系関数の使用 | `extensions` に自動登録 |
| (なし) | `meta`: semver "3.0.0" / vm "0.2.0" / agent "ScratchPy Studio" |

**スクリプトの配置**: エクスポート時、スクリプト(イベント/def)は
x = 60 + 列×330、y = 60 + 行×430 のグリッドに並べられます(topLevel の x/y)。

---

## 3. イベント(ハット)の対応

| ScratchPy | opcode | 備考 |
|---|---|---|
| `on flag:` | `event_whenflagclicked` | |
| `on key "space":` | `event_whenkeypressed` | fields `KEY_OPTION: ["space"]` + メニューシャドウ |
| `on click:` | `event_whenthisspriteclicked` | |
| `on clone:` | `event_whenstartasclone` | |
| `on receive "m":` | `event_whenbroadcastreceived` | fields `BROADCAST_OPTION: ["m", id]` |
| `on timer > n:` | `event_whengreaterthan` | fields `WHENGREATERTHANMENU: ["TIMER"]`、VALUE に n |
| `on loudness > n:` | `event_whengreaterthan` | 同上 `["LOUDNESS"]` |
| `on backdrop "b":` | `event_whenbackdropswitchesto` | fields `BACKDROP: ["b", null]` + メニューシャドウ |

---

## 4. 文 → opcode 対応表

| ScratchPy 文 | opcode | 入力/フィールド |
|---|---|---|
| `x = e` | `data_setvariableto` | fields VARIABLE、inputs `VALUE: [1,[10,値]]`(数値なら [4]) |
| `x += e` / `x -= e` | `data_changevariableby` | inputs VALUE |
| `list.add(e)` | `data_addtolist` | inputs ITEM + fields LIST |
| `list.insert(i, e)` | `data_insertatlist` | inputs INDEX, ITEM |
| `list[i] = e` | `data_replaceitemoflist` | inputs INDEX, ITEM |
| `list.delete(i)` | `data_deleteoflist` | inputs INDEX |
| `list.delete("all")` / `list.clear()` | `data_deletealloflist` | fields LIST のみ |
| `if c: ...` | `control_if` | inputs CONDITION, SUBSTACK |
| `if c: ... else: ...` | `control_if_else` | CONDITION, SUBSTACK, SUBSTACK2 |
| `elif` | `control_if_else` の SUBSTACK2 に**入れ子の control_if**(チェーン) | インポート時に平坦化して elif へ復元 |
| `repeat n:` | `control_repeat` | inputs TIMES, SUBSTACK |
| `while c:` | `control_repeat_until` | CONDITION に **operator_not(c)**、SUBSTACK |
| `forever:` | `control_forever` | SUBSTACK |
| `wait(s)` | `control_wait` | DURATION |
| `wait_until(c)` | `control_wait_until` | CONDITION |
| `stop("all")` 等 | `control_stop` | fields STOP_OPTION + mutation hasnext(§02 参照)。"other scripts" → hasnext "true" |
| `broadcast("m")` | `event_broadcast` | `BROADCAST_INPUT: [1,[11,"m",id]]` |
| `broadcast_and_wait("m")` | `event_broadcastandwait` | 同上 |
| `create_clone(t?)` | `control_create_clone_of` | CLONE_OPTION メニューシャドウ("myself"/スプライト名) |
| `delete_clone()` | `control_delete_this_clone` | |
| `ask(q)` | `sensing_askandwait` | QUESTION |
| `reset_timer()` | `sensing_resettimer` | |
| `show(v)` / `hide(v)` | `data_showvariable` / `data_hidevariable`(変数のとき)、`data_showlist` / `data_hidelist`(リストのとき) | fields VARIABLE / LIST |
| `move(n)` 〜 `clear_pen()` | §01 言語仕様書の組み込み関数表の opcode へ 1:1 | |

**C 型ブロックの next**: `if`/`repeat` 等のブロック本体(SUBSTACK)の末尾から
外側の後続文へ `next` が接続されます(チェインの連結は exporter が管理)。

---

## 5. 式 → opcode 対応表

| ScratchPy 式 | opcode / 符号 | 備考 |
|---|---|---|
| `a + b`(数値) | `operator_add` | NUM1, NUM2 |
| `a + b`(str+str) | `operator_join` | STRING1, STRING2 |
| `a - b` `a * b` | `operator_subtract` / `operator_multiply` | |
| `a / b` | `operator_divide` | |
| `a % b` | `operator_mod` | |
| `-a` | `operator_subtract(0, a)` | 単項マイナスは「0 − a」 |
| `a == b` | `operator_equals` | OPERAND1, OPERAND2 |
| `a != b` | `operator_not(operator_equals)` | |
| `a < b` | `operator_lt` | |
| `a > b` | `operator_gt` | |
| `a <= b` | `operator_not(operator_lt)` | **ピープホール**(§10 で復元) |
| `a >= b` | `operator_not(operator_gt)` | 同上 |
| `a and b` | `operator_and` | OPERAND1, OPERAND2 |
| `a or b` | `operator_or` | |
| `not a` | `operator_not` | OPERAND |
| `x in list` | `data_listcontainsitem` | fields LIST、inputs ITEM=x |
| `x in str`(右辺がリスト以外) | `operator_contains` | STRING1=右辺, STRING2=x |
| `list[i]` | `data_itemoflist` | INDEX, fields LIST |
| `len(s)` | `operator_length` | STRING |
| `len(list)` | `data_lengthoflist` | fields LIST |
| `random(a,b)` | `operator_random` | FROM, TO |
| `join(a,b)` | `operator_join` | |
| `letter(i,s)` | `operator_letter_of` | LETTER, STRING |
| `round/abs/floor/...` | `operator_round` / `operator_mathop`(OPERATOR フィールド) | |
| `touching(...)` 等のレポータ | §01 の表のとおり | |
| `timer`, `answer` 等のプロパティ | `sensing_timer`, `sensing_answer`... | |
| `Cat.x`(他スプライト) | `sensing_of` | fields PROPERTY=["x position"] + OBJECT メニューシャドウ |
| `Cat."変数名"`(他スプライトの変数) | `sensing_of` | PROPERTY=[変数名, null] |
| 変数名 | `data_variable` | fields `VARIABLE: [名前, ID]` |
| クラウド変数 | 同上 | 名前に `"☁ "` を前置して登録 |

---

## 6. リテラルと入力符号化

### エクスポート(ScratchPy → 入力配列)

| ScratchPy | 数値スロット | 文字列スロット | 真偽スロット |
|---|---|---|---|
| `42`(int/float) | `[1,[4,"42"]]` | `[1,[10,"42"]]` | — |
| `"abc"` | —(型エラー) | `[1,[10,"abc"]]` | — |
| `true` / `false` | — | `[1,[10,"true"]]` 等 | `operator_equals("1","1")` / `operator_equals("1","2")` をシャドウ接続 |
| `"#ff0000"`(色) | `[1,[9,"#ff0000"]]` | | |
| ブロック接続 | `[3, blockId, [4,""]]` 等 | | |

- スロットの種類(数値/正数/文字列…)は §02 のリテラルコード(4〜13)を opcode・入力名ごとに使い分け。
- **真偽スロットにリテラルを置く場合**、Scratch には真偽リテラルがないため
  `1 = 1`(true)/ `1 = 2`(false)という恒等式ブロックで表現します(Scratch エディタ自体の手法)。

### インポート(入力配列 → AST)

- コード 4〜8(数値系)→ 数値としてパースできれば NumLit、空文字 → NumLit(0)、
  パースできない文字列 → StrLit(後で型エラーとして表面化)。
- コード 10 → StrLit。ただし真偽スロットの `"true"`/`"false"` は BoolLit。
- コード 11 → StrLit(メッセージ名)。コード 12 → 変数名(☁ 除去)。コード 13 → リスト名。
- `"last"` / `"random"` / `"all"` の特殊添字 → StrLit として保持。

---

## 7. カスタムブロック ⇔ procedures

### エクスポート

```
def jump(times: int, shout: bool):     →  proccode: "jump %s %b"
                                            argumentnames: ["times","shout"]
                                            argumentids:   ["proc_jump_arg0","proc_jump_arg1"]
                                            argumentdefaults: ["","false"]
                                            warp: @warp により "true"/"false"
```

- パラメータ型 `bool` → `%b`(argument_reporter_boolean)、それ以外 → `%s`(argument_reporter_string_number)。
- 呼び出し `jump(3, true)` → `procedures_call` + 同 proccode の mutation + argumentids 順の inputs。
- 引数リテラルは `[1,[10,"3"]]`、式は `[3, blockId, [10,""]]`。

### インポート

- `procedures_prototype` の proccode を `%s`/`%b` で分割して定義名と引数型を復元
  (定義名 = 最初の `%` より前のテキスト)。
- 引数名が識別子として不適切な場合(空白・特殊文字・キーワード)は
  `arg1` のような安全な名前にリネームし、notes に記録。
- `mutation.warp === "true"` → `@warp`。
- 呼び出し側: proccode → 定義名マップで解決。見つからなければコメント化 + note。
- `procedures_return`(TurboWarp の「値を返す」ブロック)は**未対応**(コメント化)。

---

## 8. 変数モニター ⇔ アノテーション

| monitors[].mode | ScratchPy |
|---|---|
| `default` + visible | `@show` |
| `large` + visible | `@show(large)` |
| `slider` + visible | `@show(slider, sliderMin, sliderMax)`(旧形式は min/max フィールドで代替) |
| `list` + visible | リストの `@show` |
| visible: false | (アノテーションなし = @hide) |

- クラウド変数(`variables` の第 3 要素 true または名前が `☁ ` で始まる)→ `@cloud`(名前の接頭辞は除去)。数値文字列も int/float として読み込み、書き出し時は Scratch 形式の文字列値に戻す。表記の正規化は警告し、非数値・安全に変換できない巨大整数は元の文字列を残して型エラーにする。
- 変数/リスト以外のモニター(sensing_timer 等の**値モニター**)は変換対象外 → note に記録して無視。

---

## 9. インポート時の型推論

.sb3 には型がないため、変数の型を**使用箇所から推論**します:

1. 初期値が数値 → int(小数を含む → float)
2. `data_changevariableby`(+= 相当)に使われている → 数値
3. 数値系スロット(STEPS, DURATION, X, Y, DX, DY, SECS, TIMES, SIZE, VALUE, NUM1, NUM2, FROM, TO, OPERAND 等)や数値 opcode(operator_add 等)に `[12,[名前,ID]]` で接続されている → 数値
4. 真偽スロット(CONDITION 等)に接続されている → bool
5. 初期値が `true`/`false` → bool
6. 上記以外 → str
7. **初期値が数値化できない文字列なのに数値推論された場合 → any に緩和**
   (Scratch の動的型の再現。例: 数値変数に今はテキストが入っている)

リストの要素型: 全要素が整数 → `list[int]`、数値 → `list[float]`、文字列 → `list[str]`、混在/空 → `list[any]`(使用箇所からの推論も併用)。

`data_setvariableto` の VALUE が文字列リテラル `[10, ...]` でも、
変数型が数値なら数値として再解釈します(Scratch の保存形式が常に文字列なため)。

---

## 10. ピープホール逆変換(可逆性の担保)

エクスポートが「Scratch にその演算子がない」ために作った代替形を、
インポート時に**元の形の構文へ復元**します:

| .sb3 の形 | 復元結果 |
|---|---|
| `operator_not(operator_lt(a,b))` | `a >= b` |
| `operator_not(operator_gt(a,b))` | `a <= b` |
| `operator_not(operator_equals(a,b))` | `a != b` |
| `operator_not(operator_not(x))` | `x`(二重否定の除去) |
| `operator_not(operator_equals("1","1"))` | `true` |
| `operator_not(operator_equals("1","2"))` | `false` |
| `operator_equals("1","1")` / `("1","2")` | `true` / `false` |
| `control_repeat_until(operator_not(c))` | `while c:` |
| `operator_subtract(0, x)` | `-x` |
| `control_if_else` の SUBSTACK2 が control_if 1 個だけ | `elif`(平坦化) |
| `operator_contains(STRING2=x, STRING1=list)` | `x in list` |

これにより **text → sb3 → text → sb3 → ... の反復が固定点**(2 回目以降まったく同じ出力)になります。

---

## 11. 変換できないもの・失われるもの

| 対象 | 挙動 |
|---|---|
| 未対応 opcode(TurboWarp 拡張、procedures_return 等) | `# [変換不可ブロック] opcode=...` コメント + notes + unsupportedOpcodes に計上 |
| ハットなしの孤立スクリプト | `# [孤立ブロック・実行されません] <文の全文>` コメント化 + note |
| トップレベルの孤立レポータ | 無視 + note |
| 値モニター(sensing_timer 等) | 無視 + note |
| Scratch の comments(吹き出しメモ) | インポート時コメント化しない(破棄)※実行に影響しないため |
| 未対応の hat(testpredicate_hat 等) | 孤立スクリプト扱いでコメント化 |
| ScratchPy のコメント | .sb3 には保存されない(往復で消える) |
| ブロックのエディタ上の位置(x/y) | エクスポート時にグリッド配置で再計算(保存されない) |
| スプライト名/変数名の識別子不適文字 | 引用符形式(`sprite "My Sprite":`)で完全復元 |

**notes と unsupportedOpcodes** は `sb3ToText()` の戻り値に含まれ、UI のログタブに表示されます。

---

## 12. ラウンドトリップ保証

テスト(`src/tests/`)で機械的に保証している性質:

1. **テキスト固定点**: 任意のサンプルコードについて
   `text → sb3 → text' → sb3' → text''` を計算すると `text' === text''`(1 回目の往復以降は完全一致)。
2. **実ファイルの構造保存**: 公式フィクスチャ 12 個(default, monitors, edge-triggered-hat,
   broadcast_special_chars, tw-loop, tw-hats-and-events, top-level-reporters, draggable,
   variable_characters, comments, cloud_variables_simple, monitored_variables)について
   - インポート → 再パースが構文エラー・字句エラーなく成功
   - 再エクスポートした project.json が構造検証(validate)を通る
   - opcode 別ブロック数(event_whengreaterthan, procedures_definition 等)が保存される
   - 特殊文字入りの変数名・ブロードキャスト名(`< perfect`, `a&b`, `"foo`)が完全復元
   - monitors(表示状態・スライダー範囲)が復元される
   - アセット(SVG/WAV)が**バイト単位で**一致(MD5 検証)
   - 生成した .sb3 が再度 loadSb3 で読み込める

---

*変換の実装詳細は `docs/04-architecture.md` を参照してください。*


## 追加対応ブロックと残る制限

`looks_switchbackdroptoandwait` は `switch_backdrop_and_wait(name)`、music 拡張の `playDrumForBeats`, `midiPlayDrumForBeats`, `restForBeats`, `playNoteForBeats`, `setInstrument`, `midiSetInstrument`, `setTempo`, `changeTempo` は対応する `play_drum`, `play_midi_drum`, `rest_beats`, `play_note`, `set_instrument`, `set_midi_instrument`, `set_tempo`, `change_tempo` に変換される。Scratch の楽器/ドラムのメニュー shadow も読み込む。

すべての Scratch / TurboWarp / サードパーティ拡張が対応済みではない。未知の opcode、動的なメニュー値、孤立ブロックやコメント等は欠落または代替値となる場合がある。読み込みログと出力前の警告を確認し、元ファイルを保存すること。「元の .sb3」を選んだ実行は変換前のデータを使用するが、セキュリティ上外部拡張や通信は使えない。


`data_itemnumoflist` ⇔ `item_number(list_name, item)`（最初の位置、1始まり。見つからなければ0）。`data_lengthoflist` ⇔ `len(list_name)`。
