# Scratch .sb3 ファイル形式 完全構造解析

この文書は、Scratch 3 のプロジェクトファイル(.sb3)の構造を、
実在のプロジェクトファイル(公式 scratch-vm / TurboWarp のテストフィクスチャ)と
scratch-vm 本体の解析に基づいて記述したものです。
ScratchPy Studio の変換器(`src/core/sb3/`)はこの仕様に基づいて実装されています。

---

## 目次

1. [.sb3 = ZIP コンテナ](#1-sb3--zip-コンテナ)
2. [project.json トップレベル](#2-projectjson-トップレベル)
3. [ターゲット(ステージ/スプライト)](#3-ターゲットステージスプライト)
4. [variables / lists / broadcasts](#4-variables--lists--broadcasts)
5. [blocks — ブロック辞書](#5-blocks--ブロック辞書)
6. [inputs — 入力配列の符号化](#6-inputs--入力配列の符号化)
7. [fields — フィールド](#7-fields--フィールド)
8. [mutation — 特殊な付加情報](#8-mutation--特殊な付加情報)
9. [costumes / sounds — アセット](#9-costumes--sounds--アセット)
10. [monitors — 変数モニター](#10-monitors--変数モニター)
11. [extensions / meta](#11-extensions--meta)
12. [comments(Scratch のコメント)](#12-comments)
13. [実行モデルと座標系](#13-実行モデルと座標系)
14. [実装上の注意(クセ・落とし穴)](#14-実装上の注意クセ落とし穴)

---

## 1. .sb3 = ZIP コンテナ

.sb3 は**ただの ZIP ファイル**です(拡張子を変えれば解凍できます)。中身は:

```
project.json              ← プロジェクト全体(1 個・必須)
cd21514d0531fdffb22204e0ec5ed84a.svg   ← アセット(0 個以上)
51a8f2f0d0d65ba8b2d0f0d67e0d2a02.wav
...
```

- アセットのファイル名は **`<md5ハッシュ>.<拡張子>`**(md5ext)。
  ファイル内容の MD5 がそのまま名前になるため、同じ画像は 1 つだけ保存されます(重複排除)。
- 拡張子は画像が `.svg` / `.png` / `.jpg` / `.jpeg` / `.gif`、音が `.wav` / `.mp3`。
- project.json 内の `md5ext` フィールドがファイルを指します。

---

## 2. project.json トップレベル

```json
{
  "targets":   [ ステージ, スプライト1, ... ],
  "monitors":  [ モニター, ... ],
  "extensions": [ "pen", "music" ],
  "meta": {
    "semver": "3.0.0",
    "vm": "0.2.0",
    "agent": "..."
  }
}
```

| キー | 型 | 説明 |
|---|---|---|
| `targets` | Target[] | **先頭が必ずステージ**、以降がスプライト。描画順は layerOrder 参照 |
| `monitors` | Monitor[] | 変数・リスト・値のモニター(§10) |
| `extensions` | string[] | 使用する拡張機能 ID(pen, music, videoSensing, text2speech, translate 等) |
| `meta.semver` | string | ファイル形式バージョン。常に `"3.0.0"` |
| `meta.vm` | string | 保存した scratch-vm のバージョン |
| `meta.agent` | string | 保存したアプリケーション名 |

---

## 3. ターゲット(ステージ/スプライト)

### ステージ

```json
{
  "isStage": true,
  "name": "Stage",
  "variables": { ... },
  "lists": { ... },
  "broadcasts": { ... },
  "blocks": { ... },
  "comments": { ... },
  "currentCostume": 0,
  "costumes": [ ... ],
  "sounds": [ ... ],
  "volume": 100,
  "layerOrder": 0,
  "tempo": 60,
  "videoTransparency": 50,
  "videoState": "on",
  "textToSpeechLanguage": null
}
```

### スプライト

```json
{
  "isStage": false,
  "name": "Sprite1",
  "variables": { ... }, "lists": { ... }, "broadcasts": { ... },
  "blocks": { ... }, "comments": { ... },
  "currentCostume": 0,
  "costumes": [ ... ], "sounds": [ ... ],
  "volume": 100,
  "layerOrder": 1,
  "visible": true,
  "x": 0, "y": 0,
  "size": 100,
  "direction": 90,
  "draggable": false,
  "rotationStyle": "all around"
}
```

| フィールド | 既定値 | 説明 |
|---|---|---|
| `isStage` | — | ステージか。**targets[0].isStage === true** が正 |
| `name` | — | 表示名(日本語可: "ステージ") |
| `volume` | 100 | 音量 % |
| `layerOrder` | — | 重なり順。ステージは 0、スプライトは 1 からの**連番**(保存時に必ず振り直される) |
| `visible` | true | 表示状態(スプライトのみ) |
| `x`, `y` | 0 | 座標。範囲は約 ±240/±180 だがはみ出しも保存される |
| `size` | 100 | 大きさ % |
| `direction` | 90 | 向き(度。90=右、-90/270=左、0=上、180=下) |
| `draggable` | false | ドラッグ可否 |
| `rotationStyle` | "all around" | "all around" / "left-right" / "don't rotate" |
| `tempo` | 60 | music 拡張のテンポ |
| `videoState` | "on" | "on" / "off" / "on-flipped"(videoSensing 拡張) |
| `videoTransparency` | 50 | 0(不透明)〜100(透明) |
| `textToSpeechLanguage` | null | 例 "ja"(text2speech 拡張) |

---

## 4. variables / lists / broadcasts

### variables — 変数辞書

```json
"variables": {
  "変数ID": ["変数名", 値],
  "cloudVarId": ["☁ ハイスコア", "0", true]
}
```

- キーは**プロジェクト内で一意な ID 文字列**(Scratch エディタは UUID 風、数値風など任意)。
- 値は 3 要素タプル `[名前, 現在値, クラウド?]`。
  - 現在値: 数値・文字列・真偽値。**数値でも文字列で保存されることがある**(例 `"0"`)。
  - 3 番目の `true` は**クラウド変数**の印(省略 = false)。
  - クラウド変数の**名前には必ず `"☁ "`(U+2601 + 空白)プレフィックス**が付く。値は数値として扱われるが文字列で保存されるのが普通。
- ステージの変数 = グローバル(「すべてのスプライト用」)、スプライトの変数 = ローカル(「このスプライトのみ」)。
- **同じ名前の変数がステージとスプライトの両方にあってもよい**(ID で区別される)。

### lists — リスト辞書

```json
"lists": {
  "リストID": ["リスト名", ["要素1", 2, true]]
}
```

- 要素は文字列/数値/真偽値の配列。要素型は自由(動的)。

### broadcasts — メッセージ辞書

```json
"broadcasts": {
  "メッセージID": "メッセージ名"
}
```

- variables と違い**タプルではなく単純な文字列**。
- 通常は**ステージの broadcasts にだけ**全メッセージが登録されます(スプライト側は空 `{}`)。
- メッセージ名に `<`, `&`, 空白などの特殊文字が含まれてもそのまま保存されます(例 `"< perfect"`, `"a&b"`)。

---

## 5. blocks — ブロック辞書

ターゲットの全ブロックを**フラットな辞書**として保持します(ツリーではない!)。

```json
"blocks": {
  "ブロックID": {
    "opcode": "event_whenflagclicked",
    "next": "次のブロックID または null",
    "parent": "親ブロックID または null",
    "inputs": { ... },
    "fields": { ... },
    "shadow": false,
    "topLevel": true,
    "x": 100, "y": 50
  }
}
```

| フィールド | 説明 |
|---|---|
| `opcode` | ブロックの種類(例 `motion_movesteps`)。拡張は `pen_penDown` のように `拡張ID_名前` |
| `next` | 次に実行されるブロックの ID(スタック)。C 型ブロックの「中にはいる」部分ではない |
| `parent` | 親ブロック ID(スタックの前のブロック、または埋め込まれ先のレポータ/シャドウの親) |
| `inputs` | 値の差し込み口(§6) |
| `fields` | ドロップダウンなどの選択値(§7) |
| `shadow` | シャドウブロック(=引数の既定値スロット。単独では実行されない) |
| `topLevel` | スクリプトの先頭か。**true のときだけ `x`, `y` を持つ**(エディタ上の位置) |
| `mutation` | カスタムブロック・「〜を止める」などの追加情報(§8) |

**実行の単位**: `topLevel: true` かつ `shadow: false` のブロックが「スクリプトの先頭」。
`next` をたどって順に実行されます。C 型ブロック(control_forever 等)は
`inputs.SUBSTACK` で本体を、`next` で後続を持つ**二重の連鎖**です。

```json
"control_forever": {
  "opcode": "control_forever",
  "inputs": { "SUBSTACK": [2, "本体の先頭ブロックID"] },
  "next": null, ...
}
```

- `control_if_else` は `SUBSTACK`(もし〜なら)と `SUBSTACK2`(でなければ)の 2 つ。
- トップレベルなのに**ハットブロックでないスクリプト**(孤立ブロック)も保存できます(実行されない)。
- **値を返すだけのブロック**(レポータ)がトップレベルに置かれていることもあります(実行されず、VM は無視)。

---

## 6. inputs — 入力配列の符号化

各入力は `[モード, 内容...]` の配列です。**この符号化が .sb3 で最も複雑な部分**です。

### 6.1 モード(先頭要素)

| モード | 形 | 意味 |
|---|---|---|
| 1 | `[1, X]` | シャドウ(既定値スロット)のみ。X はリテラル配列かシャドウブロック ID |
| 2 | `[2, blockId]` | 実ブロックが接続されていて、シャドウ**がない** |
| 3 | `[3, blockId, X]` | 実ブロックが接続され、シャドウが**隠れている**(obscured)。X は隠れたシャドウ |

```json
// motion_movesteps の STEPS 入力
"STEPS": [1, [4, "10"]]                  // 既定の 10(シャドウのリテラル)
"STEPS": [1, "シャドウブロックID"]         // メニューシャドウ(§7.2)
"STEPS": [3, "変数ブロックID", [4, "10"]] // 変数を接続(元のシャドウ 10 が隠れている)
"STEPS": [2, "変数ブロックID"]            // 変数を接続(シャドウがない口)
```

### 6.2 リテラル配列(シャドウの中の即値)

`[コード, 値]` または `[コード, 値, 追加]`:

| コード | 意味 | 例 |
|---|---|---|
| 4 | 数値(任意) | `[4, "10"]`, `[4, "-3.5"]` |
| 5 | 正の数 | `[5, "10"]` |
| 6 | 正の整数 | `[6, "10"]` |
| 7 | 整数 | `[7, "10"]` |
| 8 | 角度 | `[8, "90"]` |
| 9 | 色 | `[9, "#ff0000"]`(#rrggbb 文字列) |
| 10 | 文字列 | `[10, "こんにちは"]` |
| 11 | ブロードキャスト | `[11, "メッセージ名", "メッセージID"]` |
| 12 | 変数 | `[12, "変数名", "変数ID"]` |
| 13 | リスト | `[13, "リスト名", "リストID"]` |

- 値は**原則すべて文字列**で保存されます(`[4, "10"]` であって `[4, 10]` ではない)。
  ただしファイルによっては数値型で保存されている例もあり、読み込み側は両方許容すべきです。
- 12/13 の ID は §4 の辞書のキーと一致する必要があります。
- 11 の ID は broadcasts 辞書のキーと一致する必要があります。
- **空文字列の扱い**: 数値スロットに `[4, ""]` があると VM は 0 として扱います。
  文字列スロットの `[10, ""]` は空文字列です。

### 6.3 特殊な入力

- `event_broadcast` の `BROADCAST_INPUT`: `[1, [11, "名前", "ID"]]`
- `data_setvariableto` の `VALUE`: `[1, [10, "0"]]`(文字列として値をセット)
- `control_stop` の `SUBSTACK` 相当はなく、選択は fields + mutation(§8.3)
- `sensing_of` の `OBJECT`: メニューシャドウ `sensing_of_object_menu` が入る
- リストの添字には `[6, "last"]` `[6, "random"]` `[6, "all"]`(deletealloflist 系)のような**文字列の特殊値**が入ることがある

---

## 7. fields — フィールド

ドロップダウンの**選択結果**などは inputs ではなく fields に入ります。

```json
"fields": {
  "VARIABLE": ["変数名", "変数ID"],      // data_showvariable など
  "LIST": ["リスト名", "リストID"],       // data_addtolist など
  "KEY_OPTION": ["space"],              // event_whenkeypressed のメニュー
  "PROPERTY": ["x position", null],     // sensing_of のプロパティ
  "FRONT_BACK": ["front"],              // looks_gotofrontback
  "STOP_OPTION": ["all"],               // control_stop
  "COLOR_PARAM": ["color"]              // pen_changePenColorParamBy
}
```

- 形は `[値]` または `[値, null]` または `[値, ID]`(変数/リスト参照)。
- **メニューシャドウブロック**(§6.1 の `[1, "ID"]`)と fields はセットで使われます:
  ドロップダウンは「シャドウブロック(メニュー)」+「そのブロックの fields」で表現されます。

### 7.2 メニューシャドウブロック

```json
"motion_turnright の DIRECTION 入力": [1, "メニューシャドウID"]

"メニューシャドウID": {
  "opcode": "motion_turnright_menu_dire...",  // 実際は motion_turnright_menu_directions など
  "shadow": true,
  "parent": "motion_turnright の ID",
  "fields": { "DIRECTIONS": ["90"] }
}
```

命名規則: **`<opcode>_menu_<フィールド名>`**(例 `sensing_touchingobject_menu_TOUCHINGOBJECTMENU`、pen 拡張は `pen_menu_colorParam`)。

主要なメニューフィールド名(実装で確認済み):

| opcode | 入力名 | メニューシャドウのフィールド |
|---|---|---|
| motion_goto | TO | `motion_goto_menu`(フィールドなし・値のみ) |
| motion_pointtowards | TOWARDS | 同上 |
| looks_gotofrontback | FRONT_BACK | FRONT_BACK |
| looks_goforwardbackwardby | FORWARD_BACKWARD | FORWARD_BACKWARD |
| looks_switchcostumeto | COSTUME | COSTUME |
| looks_switchbackdropto | BACKDROP | BACKDROP |
| looks_seteffectto / changeeffectby | EFFECT | EFFECT |
| sound_play | SOUND_MENU | SOUND_MENU |
| sensing_touchingobject | TOUCHINGOBJECT | TOUCHINGOBJECTMENU |
| sensing_distanceto | DISTANCETOMENU | DISTANCETOMENU |
| sensing_keypressed | KEY_OPTION | KEY_OPTION |
| sensing_of | PROPERTY + OBJECT | PROPERTY / sensing_of_object_menu |
| control_create_clone_of | CLONE_OPTION | CLONE_OPTION |
| control_stop | STOP_OPTION | STOP_OPTION(mutation も付く) |
| event_whenkeypressed | KEY_OPTION | KEY_OPTION |
| pen_setPenColorParamTo 等 | COLOR_PARAM | pen_menu_colorParam → COLOR_PARAM |

### 7.3 sensing_of の PROPERTY 値(英語固定)

```
x position, y position, direction, costume #, costume name,
size, volume, backdrop #, backdrop name, tempo
```

プロジェクトの表示言語が日本語でも**この英語文字列で保存されます**。

---

## 8. mutation — 特殊な付加情報

`mutation` を持つブロックは 3 種類だけです。

### 8.1 procedures_prototype(カスタムブロックの定義ヘッダ)

```json
"mutation": {
  "tagName": "mutation",
  "children": [],
  "proccode": "ジャンプする %s 回 %b なら叫ぶ",
  "argumentids": "[\"argUid1\",\"argUid2\"]",
  "argumentnames": "[\"回数\",\"叫ぶ\"]",
  "argumentdefaults": "[\"\",\"false\"]",
  "warp": "false"
}
```

- `proccode`: 表示テキスト。引数の位置に `%s`(文字列/数値)・`%b`(真偽)・`%m.menu`(メニュー)が入る。
- `argumentids` / `argumentnames` / `argumentdefaults` は **JSON 文字列**(配列をさらに文字列化したもの。二重エンコード)。
- `%s` の既定値は `""`、`%b` の既定値は `"false"`。
- `warp`: `"true"` / `"false"` の**文字列**。
- prototype ブロックは `shadow: true` で、`procedures_definition` の `custom_block` 入力に `[1, prototypeId]` として接続される。
- 引数の受け口は prototype の `inputs` に `{argUid: [1, "引数レポータのID"]}`。
  引数レポータは `argument_reporter_string_number`(%s)または `argument_reporter_boolean`(%b)で、
  `shadow: true`、`fields: {"VALUE": ["引数名", null]}`。

### 8.2 procedures_definition / procedures_call

```json
// 定義(トップレベル・ハット扱い)
"procedures_definition": {
  "topLevel": true,
  "inputs": { "custom_block": [1, "prototypeId"] },
  "next": "本体の先頭ID"
}

// 呼び出し
"procedures_call": {
  "mutation": {
    "tagName": "mutation",
    "children": [],
    "proccode": "ジャンプする %s 回 %b なら叫ぶ",
    "argumentids": "[\"argUid1\",\"argUid2\"]",
    "warp": "false"
  },
  "inputs": {
    "argUid1": [3, "接続されたレポータID", [10, ""]],
    "argUid2": [1, [10, ""]]
  }
}
```

- call の mutation には argumentnames / argumentdefaults が**ない**(ids のみ)。
- 引数の値: リテラルなら `[1, [10, "値"]]`、ブロック接続なら `[3, ブロックID, [10, ""]]`。
- **proccode + argumentids の組が定義と呼び出しを結びつける**(ID 参照ではない!)。
  同じ proccode の定義が複数あると曖昧になる(エディタは許さない)。

### 8.3 control_stop(〜を止める)

```json
"mutation": {
  "tagName": "mutation", "children": [],
  "hasnext": "false"
}
```

- `fields.STOP_OPTION`: `"all"` / `"this script"` / `"other scripts in sprite"`
- `hasnext`: **"other scripts in sprite" のときだけ `"true"`**(このブロックの後に続くブロックを持てる)。
  "all" と "this script" は `"false"`(後続を持てない=スクリプト末尾固定)。

---

## 9. costumes / sounds — アセット

### costume

```json
{
  "name": "costume1",
  "bitmapResolution": 1,        // ビットマップ(png/jpg)のみ。2 = 表示サイズの2倍で保存
  "dataFormat": "svg",          // svg / png / jpg / jpeg / gif
  "assetId": "cd21514d0531fdffb22204e0ec5ed84a",  // MD5(拡張子なし)
  "md5ext": "cd21514d0531fdffb22204e0ec5ed84a.svg", // ZIP 内のファイル名
  "rotationCenterX": 48,
  "rotationCenterY": 50
}
```

- **SVG コスチュームには `bitmapResolution` が付かないことがある**(= 1 扱い)。
- ビットマップは Scratch 3 では常に 2 倍解像度で保存される(`bitmapResolution: 2`)。
- `rotationCenterX/Y` が回転中心(スプライトの「真ん中」)。

### sound

```json
{
  "name": "Meow",
  "assetId": "83a9787d4cb6f3b7632b4ddfebf74367",
  "dataFormat": "wav",
  "md5ext": "83a9787d4cb6f3b7632b4ddfebf74367.wav",
  "sampleCount": 1123,
  "rate": 22050
}
```

- `sampleCount` / `rate` は**読み込み時に無視される**(実測値で上書きされる)ので不正確でも動く。

---

## 10. monitors — 変数モニター

プロジェクトのトップレベル `monitors` 配列に置かれます(ターゲットではない!)。

### 変数モニター

```json
{
  "id": "変数ID",               // §4 の variables のキーと一致
  "mode": "slider",            // default / large / slider (変数のみ)
  "opcode": "data_variable",
  "params": { "VARIABLE": "変数名" },
  "spriteName": null,           // ローカル変数ならスプライト名
  "value": 0,                   // 現在値(variables と同期)
  "width": null, "height": null,
  "x": 5, "y": 5,               // 画面上の位置(list 以外)
  "visible": true,
  "sliderMin": 0,               // mode=slider のとき
  "sliderMax": 100,
  "isDiscrete": true            // スライダーが整数刻みか
}
```

### リストモニター

```json
{
  "id": "リストID",
  "mode": "list",
  "opcode": "data_listcontents",
  "params": { "LIST": "リスト名" },
  "spriteName": null,
  "value": [ ... ],            // 要素配列
  "width": 100, "height": 200, // リストはサイズを持つ
  "x": 5, "y": 5,
  "visible": false
}
```

### 値モニター(レポータの表示)

```json
{
  "id": "sensing_timer",        // opcode がそのまま ID
  "mode": "default",
  "opcode": "sensing_timer",
  "params": {},
  "spriteName": null,
  "value": 0.5,
  "x": 5, "y": 5, "visible": false
}
```

- `visible: false` のモニターも配列に含まれます(位置を覚えておくため)。
- **モニターがなくても変数は存在します**(モニター = 表示設定にすぎない)。
- 旧形式では `min` / `max`(sliderMin/sliderMax の前身)が使われているファイルもあります。

---

## 11. extensions / meta

```json
"extensions": ["pen", "music"],
"meta": { "semver": "3.0.0", "vm": "0.2.0", "agent": "ScratchPy Studio" }
```

拡張 ID(主なものとブロック接頭辞):

| ID | ブロック接頭辞 | 内容 |
|---|---|---|
| `pen` | `pen_` | ペン |
| `music` | `music_` | 音楽(楽器・ドラム) |
| `videoSensing` | `videoSensing_` | ビデオモーション |
| `text2speech` | `text2speech_` | 読み上げ |
| `translate` | `translate_` | 翻訳 |

**拡張ブロックを 1 つでも使うなら、必ず `extensions` 配列に登録が必要**です
(登録がないと VM がブロックを読み飛ばします)。

---

## 12. comments

Scratch エディタの「コメント」機能(ブロックに紐づく吹き出し)は
ターゲットの `comments` 辞書に保存されます:

```json
"comments": {
  "commentId": {
    "blockId": "紐づくブロックID または null",
    "x": 10, "y": 10,
    "width": 200, "height": 200,
    "minimized": false,
    "text": "コメント本文"
  }
}
```

コードブロックとは独立した「紙のメモ」であり、実行には影響しません。

---

## 13. 実行モデルと座標系

- 座標: 画面中心が (0, 0)、右が +x、上が +y。舞台は 480×360(x: -240〜240, y: -180〜180)。
- direction: 90 = 右向き、0 = 上、180/-180 = 下、-90/270 = 左。**時計回りに増加**。
- スクリプトは `topLevel` ブロックから始まり `next` をたどる。
  C 型ブロックは `inputs.SUBSTACK`(と `SUBSTACK2`)で入れ子になる。
- ハットブロック(event_* など)以外のトップレベルスクリプトは**実行されない**(孤立ブロック)。
- トップレベルのレポータ(値ブロック単体)も実行されない。

---

## 14. 実装上の注意(クセ・落とし穴)

実際にファイルを解析して確認した注意点:

1. **入力の二重エンコード**: procedures の mutation 内配列は JSON 文字列(`"[\"uid\"]"`)。
   パース時に `JSON.parse` が必要。
2. **broadcasts だけタプルではない**: variables/lists は `[名前, 値]` だが broadcasts は `id → 名前` の単純マップ。
3. **クラウド変数の名前**: 必ず `"☁ "`(U+2601+空白)で始まる。表示名からこの部分を剥がすとユーザー名になる。
4. **数値が文字列で入る**: `[4, "10"]`、変数値 `"0"`、monitor value など。型を寛容に扱うこと。
5. **`layerOrder` は保存時に振り直される**: Scratch エディタは targets の順序と layerOrder を常に一致させる。
6. **メニューシャドウの opcode 命名**: `<ブロックopcode>_menu_<入力名>` が基本だが、
   pen 拡張だけは `pen_menu_colorParam` という**例外**がある。
7. **proccode による結合**: procedures_call は定義を ID ではなく proccode+argumentids で参照する。
   プロジェクト内に同じ proccode の定義が 2 つあると呼び出しが壊れる。
8. **control_stop の hasnext**: "other scripts in sprite" だけが後続ブロックを持てる。
   mutation を書き忘れると VM の読み込みで警告/不具合。
9. **shadow ブロックの parent/topLevel**: shadow は必ず親を持ち `topLevel: false`。
   shadow に x/y は付かない。
10. **monitors.id = variables のキー**: 変数モニターの id は変数 ID そのもの(別の採番体系ではない)。
11. **空入力 `[1, [10, ""]]`**: 引数なしの procedures_call や未入力の口は空文字列で保存される。
    数値スロットの空文字は実行時 0 になる。
12. **`meta.semver` は "3.0.0" 固定**: 将来の互換性のためにあるが、現在これ以外の値は存在しない。

---

## 参考

- Scratch Wiki: [Scratch File Format](https://en.scratch-wiki.info/wiki/Scratch_File_Format)
- scratch-vm 本体: https://github.com/scratchfoundation/scratch-vm
  - ブロック定義: `src/blocks/scratch3_*.js`
  - 拡張定義: `src/extensions/scratch3_*/index.js`
- 本リポジトリの解析用フィクスチャ: `research/*.sb3`(scratch-vm / TurboWarp 公式テストより)
