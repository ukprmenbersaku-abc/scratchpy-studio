# ScratchPy 言語仕様書 (ver 1.0)

ScratchPy は、Scratch のプロジェクトファイル(.sb3)と**双方向に変換できる**ことを第一に設計した、
初心者向けのテキストプログラミング言語です。Python 風のインデント構文に、
Scratch にはない**静的型**を加えています。

---

## 目次

1. [設計思想](#1-設計思想)
2. [プログラムの構造](#2-プログラムの構造)
3. [字句構造](#3-字句構造)
4. [型システム](#4-型システム)
5. [宣言(変数・リスト・コスチューム・音・設定)](#5-宣言)
6. [イベント(ハットブロック)](#6-イベントハットブロック)
7. [カスタムブロック(関数定義)](#7-カスタムブロック関数定義)
8. [文](#8-文)
9. [式と演算子](#9-式と演算子)
10. [組み込み関数カタログ](#10-組み込み関数カタログ)
11. [プロパティ](#11-プロパティ)
12. [名前の解決順序と予約名](#12-名前の解決順序と予約名)
13. [診断メッセージ](#13-診断メッセージ)
14. [完全なサンプル](#14-完全なサンプル)

---

## 1. 設計思想

| 目標 | 手段 |
|---|---|
| 初心者でも読める | Python 風のインデント構文・日本語の診断メッセージ |
| 実行前に間違いに気づける | 静的型チェック(int/float/str/bool/list[T]) |
| Scratch と 1:1 で対応 | 1 文 = 1 ブロック(原則)。独自命令は作らない |
| 往復変換で壊れない | 印字器(printer)が常に「正準形」を出力し、再パースして同じ AST になることを保証 |

**Scratch との主な違い**

- 変数は使う前に `var 名前: 型 = 初期値` で**宣言**する(型は実行時に変わらない)。
- `while` がある(Scratch の「〜まで繰り返す」+ 条件反転として変換される)。
- カスタムブロック(関数)は**値を返さない**(Scratch と同じコマンド型)。
- プロパティ(x 座標など)は**読み取り専用**。書き込みは `set_x()` などの関数で行う。

---

## 2. プログラムの構造

1 つのファイル = 1 つの Scratch プロジェクトです。

```scratchpy
# コメントは # から行末まで

stage:                     # ステージ(1 つだけ・省略可)
    var score: int = 0     # グローバル変数
    costume backdrop1      # 背景
    tempo: 60              # ステージの設定

sprite Cat:                # スプライト(0 個以上)
    costume costume1
    x: 0
    y: 0

    def jump(power: int):  # カスタムブロック
        change_y(power)

    on flag:               # イベント(スクリプト)
        jump(10)
        say("こんにちは!")
```

- トップレベルに書けるのは `stage:` と `sprite 名前:` とコメント**だけ**です。
- `stage:` は高々 1 つ。書かなければ変換時に自動生成されます。
- `sprite 名前:` の名前が識別子として書けない文字を含む場合は引用符で囲みます:
  `sprite "Banana <2":`
- ブロック(コロン `:` で終わる行)の中身は**インデント**で表します。

---

## 3. 字句構造

### 3.1 インデント

- ブロックの開始は `:` + 改行 + **深いインデント**、終了はインデントが戻ることで表します。
- インデント幅は自由に選べますが、同じブロック内では揃える必要があります。
- 推奨は 4 スペース(整形機能も 4 スペースを出力します)。
- コメントだけの行と空行はインデント構造に影響しません。

### 3.2 コメント

```scratchpy
# 行コメント(この形式のみ)
move(10)  # 行の後ろにも書けます
```

コメントは AST に保存され、.sb3 → ScratchPy 変換時の注記(孤立ブロックや未対応ブロックの説明)にも使われます。**コメントは .sb3 には保存されません**(Scratch にコメントブロックとして出力しない設計です)。

### 3.3 識別子

- 先頭: 英字 / `_` / **日本語などの Unicode 文字**
- 2 文字目以降: 上記 + 数字
- 例: `score`, `_tmp`, `点数`, `なまえ2`
- 識別子として書けない名前(空白・記号を含む等)は文字列で囲みます: `var "< Perfect": int = 0`、`sprite "My Sprite":`

### 3.4 数値リテラル

- 整数: `0`, `42`, `-7`(単項マイナス)
- 小数: `3.14`, `0.5`
- 指数表記・2 進数などは**ありません**(Scratch に合わせるため)。

### 3.5 文字列リテラル

- `"二重引用符"` または `'一重引用符'`
- エスケープ: `\"` `\'` `\\` `\n` `\t`
- 色は `"#ff0000"` 形式の文字列を色の引数の位置に書くと色リテラルとして扱われます。

### 3.6 演算子・記号

| 分類 | 記号 |
|---|---|
| 算術 | `+` `-` `*` `/` `%` |
| 比較 | `==` `!=` `<` `<=` `>` `>=` `in` |
| 論理 | `and` `or` `not`(キーワード) |
| 代入 | `=` `+=` `-=` |
| その他 | `:` `,` `.` `(` `)` `[` `]` `@` |

### 3.7 括弧による行継続

括弧 `( )`・角括弧 `[ ]` の中は改行を挟めます:

```scratchpy
say(join("とても長いメッセージ",
         "の連結"))
list items: list[str] = [
    "a", "b",
]
```

### 3.8 キーワード

```
stage sprite var list costume sound def on if elif else while repeat forever
pass and or not in true false int float str bool any
flag key click clone receive timer loudness backdrop
```

キーワードは変数名などに使えません(→ §12)。

---

## 4. 型システム

### 4.1 型の種類

| 型 | 意味 | 例 |
|---|---|---|
| `int` | 整数 | `0`, `-3`, `42` |
| `float` | 小数 | `3.14` |
| `str` | 文字列 | `"こんにちは"` |
| `bool` | 真偽値 | `true`, `false` |
| `any` | 任意(型チェックを緩める) | — |
| `list[T]` | 要素型 T のリスト | `list[int]`, `list[str]`, `list[any]` |

### 4.2 代入可能性(暗黙変換)ルール

- `any` ⇔ すべての型(双方向に OK)
- `int` → `float`(数値の広げは OK。`float` → `int` は**エラー**)
- `list[A]` → `list[B]`(A が B に代入可能なら OK = 共変)
- `bool` → `int` / `str` は**不可**(明示的な変換関数はありません。Scratch 同様の暗黙変換が必要な場面は `any` を使います)
- **例外**: カスタムブロックの `str` パラメータには int / float / bool も渡せます
  (Scratch の `%s` 引数が何でも文字列として受け付ける挙動に合わせた暗黙の文字列化)。

### 4.3 演算の結果型

| 式 | 結果型 |
|---|---|
| `数 + 数` `-` `*` `%` | int同士→int、それ以外→float |
| `数 / 数` | **常に float**(Scratch の除法と同じ) |
| `str + str` | str(連結。数値と文字列の `+` はエラー) |
| 比較 `== != < <= > >=` | bool |
| `a in b` | bool |
| `and or not` | bool |
| `random(a, b)` | 引数が両方 int→int、それ以外→float |
| `len(s)` / `len(list)` | int |
| `list[i]` | 要素型 T |
| プロパティ(x, y, ...) | 定義済み型(§11) |

### 4.4 型チェックのタイミング

型チェックは**変換前**に静的に行われます。実行という概念はありません(ScratchPy は .sb3 に変換されて Scratch 上で実行されます)。型エラーが 1 つでもあると .sb3 は生成されません。

---

## 5. 宣言

`stage:` / `sprite:` の本体に書ける宣言は次の 5 種類 + コメントです。
**書ける順序は自由**ですが、整形時は「設定 → 変数/リスト → コスチューム/音 → def → イベント」の順に並びます。

### 5.1 変数 `var`

```scratchpy
var score: int = 0
var name: str = "Scratch"
var ratio: float = 0.5
var ready: bool = false
var whatever: any = 100
```

- ステージの `var` → **グローバル変数(すべてのスプライト用)**
- スプライトの `var` → **このスプライトのみの変数(ローカル)**
- 初期値は必須です。

**モニター表示のアノテーション**(宣言の後ろに書く):

| アノテーション | 意味 |
|---|---|
| `@show` | 画面に表示(標準モニター) |
| `@show(large)` | 大きな表示 |
| `@show(slider, 0, 100)` | スライダー表示(最小, 最大) |
| `@hide` | 非表示(既定) |
| `@cloud` | クラウド変数(☁)。数値型のみ・ステージのみ推奨 |

```scratchpy
stage:
    var hp: int = 100 @show(slider, 0, 100)
    var "☁ ハイスコア": int = 0 @cloud @show
```

### 5.2 リスト `list`

```scratchpy
list items: list[str] = []
list scores: list[int] = [10, 20, 30] @show
```

- 要素型は `int` / `float` / `str` / `bool` / `any`。
- `@show` でリストモニター表示(表示モードは「リスト」固定)。
- **リスト全体を値として使うことはできません**(`say(items)` はエラー)。
  使うときは `items[i]`(要素)、`len(items)`(長さ)、`x in items`(含まれる?) の形にします。

### 5.3 コスチューム・音

```scratchpy
sprite Cat:
    costume costume1     # 1 つ目の costume が表示コスチューム
    costume costume2
    sound meow
```

- 名前は .sb3 内のアセット名と一致させます。
- **1 つも書かなかった場合、変換時に既定のコスチューム(オレンジ枠の空 SVG / 無音 WAV)が自動生成されます。**
- 実在のアセット名を書いて .sb3 を読み込んだ直後の場合、元プロジェクトの画像・音がそのまま保存されます。

### 5.4 設定(コンフィグ)

`キー: 値` の形でスプライト・ステージの初期状態を書きます。**既定値と違うときだけ**書けば OK です。

**スプライトの設定キー**

| キー | 型 | 既定値 | 意味 |
|---|---|---|---|
| `x` | 数値 | 0 | x 座標 |
| `y` | 数値 | 0 | y 座標 |
| `direction` | 数値 | 90 | 向き(度) |
| `size` | 数値 | 100 | 大きさ(%) |
| `visible` | bool | true | 表示/非表示 |
| `draggable` | bool | false | ドラッグできるか |
| `rotation_style` | str | "all around" | 回転方法("all around" / "left-right" / "don't rotate") |
| `volume` | 数値 | 100 | 音量(%) |
| `current_costume` | int | 0 | 表示中のコスチューム番号(0 始まり) |
| `layer_order` | int | — | 重なり順(書かなければ宣言順) |

**ステージの設定キー**

| キー | 型 | 既定値 | 意味 |
|---|---|---|---|
| `tempo` | 数値 | 60 | 楽器のテンポ(music 拡張) |
| `video_state` | str | "off" | カメラ("on" / "off" / "on-flipped") |
| `video_transparency` | 数値 | 50 | カメラの透明度 |
| `volume` | 数値 | 100 | 音量 |
| `current_costume` | int | 0 | 表示中の背景番号 |
| `tts_language` | str | なし | 読み上げ言語(textToSpeechLanguage) |

---

## 6. イベント(ハットブロック)

スクリプト(実行の起点)は `on ...:` で始めます。

| 構文 | Scratch ブロック |
|---|---|
| `on flag:` | 🚩 が押されたとき |
| `on key "space":` | キーが押されたとき(§10 の key メニュー参照) |
| `on click:` | このスプライトが押されたとき |
| `on clone:` | クローンされたとき(スプライトのみ) |
| `on receive "メッセージ":` | メッセージを受け取ったとき |
| `on timer > 10:` | タイマー > 10 のとき |
| `on loudness > 30:` | 音量(マイク)> 30 のとき |
| `on backdrop "背景名":` | 背景が「背景名」になったとき |

```scratchpy
on key "up arrow":
    change_y(10)

on receive "start":
    broadcast("go")
```

---

## 7. カスタムブロック(関数定義)

```scratchpy
sprite Cat:
    @warp                          # 画面を更新せずに実行(即時実行)
    def draw_square(length: int):  # %s 引数(数値・文字列)
        repeat 4:
            move(length)
            turn_right(90)

    def check(ok: bool):           # bool 型パラメータ = %b 引数(真偽)
        if ok:
            say("OK")

    on flag:
        draw_square(100)
        check(true)
```

- パラメータの型が `bool` → Scratch の **%b(真偽)引数**、それ以外 → **%s(数値/文字列)引数**になります。
- **パラメータは代入不可**(読み取り専用)。ローカル変数にコピーして使います。
- 戻り値はありません(Scratch のカスタムブロックと同じ)。
- `@warp` は def の直前の行に書きます(省略可 = 通常実行)。
- 名前の解決: パラメータ → このスプライトの変数 → グローバル変数 → プロパティ。

---

## 8. 文

### 8.1 代入

```scratchpy
score = 10          # 代入
score += 5          # 加算代入(= score = score + 5)
score -= 5          # 減算代入
items[1] = "x"      # リスト要素への代入(1 始まり)
items[len(items)] = "最後"
```

代入できるのは**変数**と**リストの要素**だけです(プロパティ・パラメータは不可)。

### 8.2 リストのメソッド

| 文 | Scratch ブロック |
|---|---|
| `items.add("x")` | 「x」を items に追加する |
| `items.insert(2, "x")` | "x" を items の 2 番目に挿入する |
| `items.delete(3)` | items の 3 番目を削除する |
| `items.delete("all")` | items のすべてを削除する(→ `clear()` 推奨の警告が出ます) |
| `items.clear()` | items のすべてを削除する |

位置には整数のほか `"last"`, `"random"`(delete は `"all"` も)が使えます。

### 8.3 条件分岐

```scratchpy
if x > 0:
    say("正")
elif x == 0:
    say("ゼロ")
else:
    say("負")
```

- `elif` / `else` は省略可。
- 条件は bool 型(`any` も可)でなければなりません。

### 8.4 繰り返し

```scratchpy
repeat 10:        # 10 回繰り返す
    move(10)

while score < 100:  # score < 100 まで繰り返す(= 「〜でないまで繰り返す」+ not)
    score += 1

forever:          # ずっと
    turn_right(15)
```

### 8.5 その他の文

| 文 | Scratch ブロック |
|---|---|
| `wait(1.5)` | 1.5 秒待つ |
| `wait_until(touching("edge"))` | 〜まで待つ |
| `stop("all")` | すべてを止める("all" / "this script" / "other scripts") |
| `broadcast("go")` | "go" を送る |
| `broadcast_and_wait("go")` | "go" を送って待つ |
| `create_clone()` | 自分自身のクローンを作る |
| `create_clone("Cat")` | Cat のクローンを作る |
| `delete_clone()` | このクローンを削除する |
| `ask("名前は?")` | 〜と聞いて待つ |
| `reset_timer()` | タイマーをリセット |
| `show()` / `hide()` | 表示する / 隠す |
| `show(score)` / `hide(score)` | 変数(リスト)モニターを表示/隠す |
| `pass` | 何もしない(空の本体に必要) |
| `move(10)` などの関数呼び出し | 対応するブロック |

### 8.6 本体が空のときは `pass`

```scratchpy
on flag:
    pass        # 何もしないスクリプト
```

コメントだけが書かれた本体には変換時に `pass` が自動で補われます。

---

## 9. 式と演算子

### 9.1 優先順位(弱い → 強い)

| 順位 | 演算子 |
|---|---|
| 1 | `or` |
| 2 | `and` |
| 3 | `not`(単項) |
| 4 | `==` `!=` `<` `<=` `>` `>=` `in` |
| 5 | `+` `-`(二項) |
| 6 | `*` `/` `%` |
| 7 | `-`(単項マイナス) |
| 8 | 後置: `呼び出し()` `添字[]` `プロパティ.` |
| 9 | 一次式: リテラル `( )` 名前 |

### 9.2 一次式

```scratchpy
42              # int
3.14            # float
"文字列"         # str
true / false    # bool
"#ff0000"       # 色の引数の位置では色リテラル
[1, 2, 3]       # リストリテラル(宣言の初期値専用)
score           # 変数/パラメータ/プロパティの名前
var("☁ 変数")    # 識別子で書けない変数名の参照
list("a&b")     # 識別子で書けないリスト名の参照
items[2]        # リストの要素(1 始まり。"last"/"random" も可)
items[i + 1]    # 式を添字にできる
Cat.x           # 他のスプライトのプロパティ
stage.tempo     # ステージのプロパティ
```

### 9.3 `in` 演算子

```scratchpy
if "apple" in items:      # リストに含まれる? → data_listcontainsitem
if key_pressed("space"):  # (関数)
```

右辺に**リスト名**を直接書けます(リストを値として使う唯一の形の 1 つ)。

### 9.4 型による制約

- 数値演算の数値以外への使用、`str + int` などはエラー。
- `not` の対象は bool のみ。
- リスト名を単独の値として使う(`say(items)`)はエラー。
- 式文(値を返す式だけを文にする)は「結果が使われていません」警告。

---

## 10. 組み込み関数カタログ

`引数の型: number = int/float/any`。🅢=スプライトのみ、🅢🅣=両方。

### 動き(motion) 🅢

| 関数 | Scratch ブロック |
|---|---|
| `move(steps)` | (steps) 歩動かす |
| `turn_right(degrees)` / `turn_left(degrees)` | 時計回り/反時計回りに回す |
| `goto(x, y)` / `goto("mouse")` / `goto("random")` / `goto("Cat")` | へ行く |
| `glide(secs, x, y)` / `glide(secs, "mouse")` | 秒で滑る |
| `point(direction)` | 度に向ける |
| `point_towards(target)` | へ向ける |
| `change_x(dx)` / `set_x(x)` | x 座標を変える/にする |
| `change_y(dy)` / `set_y(y)` | y 座標を変える/にする |
| `bounce()` | もし端についたら、跳ね返る |
| `set_rotation_style(style)` | 回転方法を〜にする("all around" / "left-right" / "don't rotate") |

### 見た目(looks)

| 関数 | Scratch ブロック | 対象 |
|---|---|---|
| `say(msg)` / `say(msg, secs)` | と言う / と〜秒言う | 🅢 |
| `think(msg)` / `think(msg, secs)` | と考える | 🅢 |
| `show()` / `hide()` | 表示する/隠す(引数 1 つで変数・リストモニター) | 🅢 |
| `switch_costume(name)` / `next_costume()` | コスチュームを〜にする/次にする | 🅢 |
| `switch_backdrop(name)` / `next_backdrop()` | 背景を〜にする/次にする | 🅢🅣 |
| `change_size(n)` / `set_size(n)` | 大きさを変える/にする | 🅢 |
| `change_effect(effect, n)` / `set_effect(effect, n)` | 効果を〜ずつ変える/にする | 🅢🅣 |
| `clear_effects()` | 見た目の効果をなくす | 🅢🅣 |
| `go_to_layer("front"/"back")` | 最前面/最背面へ移動 | 🅢 |
| `change_layer("forward"/"backward", n)` | n 層手前/奥へ | 🅢 |

効果名(effect): `color` `fisheye` `whirl` `pixelate` `brightness` `ghost` `mosaic`

### 音(sound) 🅢🅣

`play_sound(name)` / `play_sound_until_done(name)` / `stop_all_sounds()` /
`change_volume(n)` / `set_volume(n)` / `change_sound_effect(effect, n)` / `set_sound_effect(effect, n)` / `clear_sound_effects()`
(音の効果: `pitch` `pan`)

### イベント・制御(event/control) 🅢🅣

`broadcast(msg)` / `broadcast_and_wait(msg)` / `wait(secs)` / `wait_until(cond)` /
`stop("all"/"this script"/"other scripts")` / `create_clone(target?)` / `delete_clone()` 🅢

### センシング(sensing)

| 関数 | Scratch ブロック | 対象 |
|---|---|---|
| `ask(question)` | と聞いて待つ | 🅢🅣 |
| `reset_timer()` | タイマーをリセット | 🅢🅣 |
| `touching(target)` → bool | に触れた?(target: "edge" / "mouse" / スプライト名) | 🅢 |
| `touching_color("#ff0000")` → bool | 色に触れた? | 🅢 |
| `color_touching_color(c1, c2)` → bool | 色が色に触れた? | 🅢 |
| `distance_to(target)` → float | までの距離 | 🅢 |
| `key_pressed(key)` → bool | キーが押された? | 🅢🅣 |
| `current(unit)` → float | 現在の〜(year/month/date/day of week/hour/minute/second) | 🅢🅣 |
| `days_since_2000` → float | 2000 年からの日数(プロパティ) | 🅢🅣 |

キー名: `space` `up arrow` `down arrow` `left arrow` `right arrow` `any` `a`〜`z` `0`〜`9`

### 演算(operator)

| 関数 | Scratch ブロック |
|---|---|
| `random(from, to)` | からまでの乱数(整数引数→int、それ以外→float) |
| `round(x)` | 四捨五入 |
| `abs(x)` `floor(x)` `ceil(x)` `sqrt(x)` | 絶対値/切り下げ/切り上げ/平方根 |
| `sin cos tan asin acos atan` | 三角関数(度単位) |
| `ln(x)` `log10(x)` `exp(x)` `pow10(x)` | 対数・指数 |
| `mod(a, b)` | 割り算の余り |
| `letter(i, text)` → str | i 番目の文字 |
| `join(a, b)` → str | 文字列の連結(`a + b` でも可) |
| `len(s)` → int / `len(list)` → int | 文字数 / リストの長さ |

四則演算・比較は演算子(`+ - * / % == < ...`)を使います。

### ペン(pen 拡張) 🅢

`pen_down()` / `pen_up()` / `stamp()` / `clear_pen()` 🅢🅣 /
`set_pen_color("#ff0000")` / `change_pen_param(param, n)` / `set_pen_param(param, n)` /
`change_pen_size(n)` / `set_pen_size(n)`
(ペンパラメータ: `color` `transparency` `brightness` `saturation`)

ペン系関数を使うと .sb3 の `extensions` に `pen` が自動登録されます。

---

## 11. プロパティ

読み取り専用の値です。自分のスプライト内では名前だけで参照でき、
**他のスプライトの値**は `スプライト名.プロパティ`、**ステージの値**は `stage.プロパティ` で参照します。

| プロパティ | 型 | Scratch ブロック | 対象 |
|---|---|---|---|
| `x` | float | x 座標 | 🅢 |
| `y` | float | y 座標 | 🅢 |
| `direction` | float | 向き | 🅢 |
| `size` | float | 大きさ | 🅢 |
| `costume_number` | int | コスチュームの番号 | 🅢 |
| `costume_name` | str | コスチュームの名前 | 🅢 |
| `volume` | float | 音量 | 🅢🅣 |
| `backdrop_number` | int | 背景の番号 | 🅢🅣 |
| `backdrop_name` | str | 背景の名前 | 🅢🅣 |
| `tempo` | float | テンポ(music 拡張) | 🅢🅣 |
| `mouse_x` | float | マウスの x 座標 | 🅢🅣 |
| `mouse_y` | float | マウスの y 座標 | 🅢🅣 |
| `mouse_down` | bool | マウスが押された? | 🅢🅣 |
| `timer` | float | タイマー | 🅢🅣 |
| `loudness` | float | 音量(マイク) | 🅢🅣 |
| `answer` | str | 答え | 🅢🅣 |
| `username` | str | ユーザー名 | 🅢🅣 |
| `days_since_2000` | float | 2000 年からの日数 | 🅢🅣 |
| `dragging` | bool | ドラッグ中? | 🅢 |

```scratchpy
sprite Cat:
    on flag:
        say(Dog.x)          # 他スプライトの x 座標(sensing_of)
        say(stage.tempo)    # ステージのテンポ
        if touching("edge"):
            set_x(0)
```

`Cat.x` のように他のスプライトを参照すると、Scratch の「〜の x 座標」(`sensing_of`)ブロックになります。参照できるプロパティは x, y, direction, size, volume, costume_number, costume_name, backdrop_number, backdrop_name, tempo の 10 種類 + そのスプライト(ステージ)の変数です。

---

## 12. 名前の解決順序と予約名

### 解決順序(式の中で名前を使ったとき)

1. カスタムブロックのパラメータ(def 内)
2. **同じスプライト**の変数・リスト(ローカル)
3. **ステージ**の変数・リスト(グローバル)
4. プロパティ(x, timer, answer など)

### 予約名(変数名・パラメータ名に使えない)

プロパティ名はすべて予約されています:

```
x y direction size costume_number costume_name volume backdrop_number
backdrop_name tempo mouse_x mouse_y mouse_down timer loudness answer
username days_since_2000 dragging
```

また、スプライト名/ステージ名と同じ名前の変数は「混乱の元」警告が出ます。

---

## 13. 診断メッセージ

すべての診断は日本語で、行・列番号付きです。

**エラー(例)** — .sb3 は生成されません:

- `変数 'x' が見つかりません` / `関数 'foobar' が見つかりません`
- `変数 'score' は int 型です。str 型の値は代入できません`
- `リスト 'items' を値として直接使えません (items[i] / len(items) / x in items の形で使ってください)`
- `プロパティ(読み取り専用)には代入できません。set_x() などの関数を使ってください`
- `引数(パラメータ)には代入できません。ローカル変数にコピーしてください`
- `ブロック 'f' の引数は 2 個ですが、1 個渡されています`
- `不明な設定項目 'foo'`
- `クラウド変数は int / float 型のみです`

**警告(例)** — 変換は行われます:

- `変数 'score' はステージのグローバル変数と同じ名前です。…`
- `値を返す式 'random(...)' の結果が使われていません`
- `current_costume=3 はコスチュームの範囲外です (0〜1)`
- `「on receive」のメッセージ名はリテラル文字列を推奨します`

---

## 14. 完全なサンプル

```scratchpy
# ───────── キャッチゲーム ─────────
stage:
    var score: int = 0 @show
    var "残り時間": int = 30 @show(large)
    list "取った果物": list[str] = [] @show
    costume backdrop1
    tempo: 120

sprite Apple:
    costume costume1
    size: 60
    draggable: false

    def reset_position():
        set_x(random(-200, 200))
        set_y(180)
        show()

    on flag:
        forever:
            reset_position()
            glide(random(1, 3), x, -170)

    on click:
        score += 1
        "取った果物".add("リンゴ")
        hide()

sprite Timer:
    costume costume1
    x: -200
    y: 150

    on flag:
        reset_timer()
        while timer < 30:
            "残り時間" = 30 - floor(timer)
            wait(0.1)
        broadcast("game over")

    on receive "game over":
        stop("all")
```

---

*この仕様は実装(`src/core/lang/`)と常に一致させています。差分を見つけた場合は実装が正です。*
