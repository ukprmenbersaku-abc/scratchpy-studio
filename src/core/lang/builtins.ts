/**
 * ScratchPy 組み込み関数・プロパティ カタログ
 * ---------------------------------------------
 * 型チェッカとエクスポータが共有する「Scratch ブロック ⇔ ScratchPy 関数」の
 * 唯一の情報源(single source of truth)。
 *
 * paramType の 'menu:xxx' は文字列リテラルの許可値チェックを行うメニュー型。
 */

import { SPType, T_INT, T_FLOAT, T_STR, T_BOOL, T_ANY, listOf } from './ast';

export type TargetKind = 'sprite' | 'stage' | 'both';

export interface ParamSpec {
  name: string;
  type: string;            // 'int'|'float'|'number'|'str'|'bool'|'color'|'any'|'menu:xxx'|'index'
  optional?: boolean;
  doc?: string;
}

export interface BuiltinDef {
  name: string;
  callType: 'command' | 'reporter';
  target: TargetKind;
  /** 複数の引数形(オーバーロード)を許可する */
  overloads: ParamSpec[][];
  returns?: SPType;
  /** random のように引数型で戻り値型が変わる場合 */
  returnsFn?: (argTypes: SPType[]) => SPType;
  doc: string;             // 日本語の説明(Scratch ブロック名)
  scratchBlock: string;    // 対応する Scratch ブロックの説明
  opcode?: string;         // 主オペコード
}

// メニュー定義(文字列リテラルの許可値)
export const MENUS: Record<string, string[]> = {
  rotation_style: ['all around', 'left-right', "don't rotate"],
  effect: ['color', 'fisheye', 'whirl', 'pixelate', 'brightness', 'ghost', 'mosaic'],
  sound_effect: ['pitch', 'pan'],
  layer: ['front', 'back'],
  layer_dir: ['forward', 'backward'],
  stop: ['all', 'this script', 'other scripts'],
  key: [
    'space', 'up arrow', 'down arrow', 'left arrow', 'right arrow', 'any',
    ...'abcdefghijklmnopqrstuvwxyz'.split(''), ...'0123456789'.split(''),
  ],
  touch_target: ['edge', 'mouse'],           // + スプライト名(動的)
  goto_target: ['mouse', 'random'],          // + スプライト名 / ステージ(動的)
  sense_prop: ['x', 'y', 'direction', 'costume_number', 'costume_name', 'size', 'volume',
    'backdrop_number', 'backdrop_name', 'tempo'],
  current_unit: ['year', 'month', 'date', 'day of week', 'hour', 'minute', 'second'],
  pen_param: ['color', 'transparency', 'brightness', 'saturation'],
  clone_target: ['myself'],                  // + スプライト名(動的)
};

const num = (name: string): ParamSpec => ({ name, type: 'number' });
const str = (name: string): ParamSpec => ({ name, type: 'str' });
const menu = (name: string, m: string): ParamSpec => ({ name, type: `menu:${m}` });

export const BUILTINS: Record<string, BuiltinDef> = {};

function def(d: BuiltinDef) { BUILTINS[d.name] = d; }

// --- 動き (motion) ---------------------------------------------------------
def({ name: 'move', callType: 'command', target: 'sprite', overloads: [[num('steps')]], doc: '「(steps) 歩動かす」', scratchBlock: 'motion_movesteps', opcode: 'motion_movesteps' });
def({ name: 'turn_right', callType: 'command', target: 'sprite', overloads: [[num('degrees')]], doc: '「(degrees) 度回す(時計回り)」', scratchBlock: 'motion_turnright', opcode: 'motion_turnright' });
def({ name: 'turn_left', callType: 'command', target: 'sprite', overloads: [[num('degrees')]], doc: '「(degrees) 度回す(反時計回り)」', scratchBlock: 'motion_turnleft', opcode: 'motion_turnleft' });
def({ name: 'goto', callType: 'command', target: 'sprite', overloads: [[num('x'), num('y')], [{ name: 'target', type: 'menu:goto_target' }]], doc: '「(x,y) へ行く」/「(target) へ行く」', scratchBlock: 'motion_gotoxy / motion_goto', opcode: 'motion_gotoxy' });
def({ name: 'glide', callType: 'command', target: 'sprite', overloads: [[num('secs'), num('x'), num('y')], [num('secs'), { name: 'target', type: 'menu:goto_target' }]], doc: '「(secs) 秒で (x,y) へ滑る」', scratchBlock: 'motion_glidesecstoxy / motion_glideto', opcode: 'motion_glidesecstoxy' });
def({ name: 'point', callType: 'command', target: 'sprite', overloads: [[num('direction')]], doc: '「(direction) 度に向ける」', scratchBlock: 'motion_pointindirection', opcode: 'motion_pointindirection' });
def({ name: 'point_towards', callType: 'command', target: 'sprite', overloads: [[{ name: 'target', type: 'menu:goto_target' }]], doc: '「(target) へ向ける」', scratchBlock: 'motion_pointtowards', opcode: 'motion_pointtowards' });
def({ name: 'change_x', callType: 'command', target: 'sprite', overloads: [[num('dx')]], doc: '「x座標を (dx) ずつ変える」', scratchBlock: 'motion_changexby', opcode: 'motion_changexby' });
def({ name: 'set_x', callType: 'command', target: 'sprite', overloads: [[num('x')]], doc: '「x座標を (x) にする」', scratchBlock: 'motion_setx', opcode: 'motion_setx' });
def({ name: 'change_y', callType: 'command', target: 'sprite', overloads: [[num('dy')]], doc: '「y座標を (dy) ずつ変える」', scratchBlock: 'motion_changeyby', opcode: 'motion_changeyby' });
def({ name: 'set_y', callType: 'command', target: 'sprite', overloads: [[num('y')]], doc: '「y座標を (y) にする」', scratchBlock: 'motion_sety', opcode: 'motion_sety' });
def({ name: 'bounce', callType: 'command', target: 'sprite', overloads: [[]], doc: '「もし端についたら、跳ね返る」', scratchBlock: 'motion_ifonedgebounce', opcode: 'motion_ifonedgebounce' });
def({ name: 'set_rotation_style', callType: 'command', target: 'sprite', overloads: [[menu('style', 'rotation_style')]], doc: '「回転方法を (style) にする」', scratchBlock: 'motion_setrotationstyle', opcode: 'motion_setrotationstyle' });

// --- 見た目 (looks) --------------------------------------------------------
def({ name: 'say', callType: 'command', target: 'sprite', overloads: [[str('message')], [str('message'), num('secs')]], doc: '「(message) と言う」/「(message) と (secs) 秒言う」', scratchBlock: 'looks_say / looks_sayforsecs', opcode: 'looks_say' });
def({ name: 'think', callType: 'command', target: 'sprite', overloads: [[str('message')], [str('message'), num('secs')]], doc: '「(message) と考える」', scratchBlock: 'looks_think / looks_thinkforsecs', opcode: 'looks_think' });
def({ name: 'show', callType: 'command', target: 'sprite', overloads: [[], [{ name: 'x', type: 'varname' }]], doc: '「表示する」/ 変数・リストモニターを表示', scratchBlock: 'looks_show / data_showvariable', opcode: 'looks_show' });
def({ name: 'hide', callType: 'command', target: 'sprite', overloads: [[], [{ name: 'x', type: 'varname' }]], doc: '「隠す」/ 変数・リストモニターを隠す', scratchBlock: 'looks_hide / data_hidevariable', opcode: 'looks_hide' });
def({ name: 'switch_costume', callType: 'command', target: 'sprite', overloads: [[str('name')]], doc: '「コスチュームを (name) にする」', scratchBlock: 'looks_switchcostumeto', opcode: 'looks_switchcostumeto' });
def({ name: 'next_costume', callType: 'command', target: 'sprite', overloads: [[]], doc: '「次のコスチュームにする」', scratchBlock: 'looks_nextcostume', opcode: 'looks_nextcostume' });
def({ name: 'switch_backdrop', callType: 'command', target: 'both', overloads: [[str('name')]], doc: '「背景を (name) にする」', scratchBlock: 'looks_switchbackdropto', opcode: 'looks_switchbackdropto' });
def({ name: 'next_backdrop', callType: 'command', target: 'both', overloads: [[]], doc: '「次の背景にする」', scratchBlock: 'looks_nextbackdrop', opcode: 'looks_nextbackdrop' });
def({ name: 'change_size', callType: 'command', target: 'sprite', overloads: [[num('change')]], doc: '「大きさを (change) ずつ変える」', scratchBlock: 'looks_changesizeby', opcode: 'looks_changesizeby' });
def({ name: 'set_size', callType: 'command', target: 'sprite', overloads: [[num('size')]], doc: '「大きさを (size)% にする」', scratchBlock: 'looks_setsizeto', opcode: 'looks_setsizeto' });
def({ name: 'change_effect', callType: 'command', target: 'both', overloads: [[menu('effect', 'effect'), num('change')]], doc: '「(effect) の効果を (change) ずつ変える」', scratchBlock: 'looks_changeeffectby', opcode: 'looks_changeeffectby' });
def({ name: 'set_effect', callType: 'command', target: 'both', overloads: [[menu('effect', 'effect'), num('value')]], doc: '「(effect) の効果を (value) にする」', scratchBlock: 'looks_seteffectto', opcode: 'looks_seteffectto' });
def({ name: 'clear_effects', callType: 'command', target: 'both', overloads: [[]], doc: '「見た目の効果をなくす」', scratchBlock: 'looks_cleargraphiceffects', opcode: 'looks_cleargraphiceffects' });
def({ name: 'go_to_layer', callType: 'command', target: 'sprite', overloads: [[menu('where', 'layer')]], doc: '「(front/back) へ移動する」', scratchBlock: 'looks_gotofrontback', opcode: 'looks_gotofrontback' });
def({ name: 'change_layer', callType: 'command', target: 'sprite', overloads: [[menu('dir', 'layer_dir'), num('num')]], doc: '「(num) 層 (forward/backward) する」', scratchBlock: 'looks_goforwardbackwardby', opcode: 'looks_goforwardbackwardby' });

// --- 音 (sound) ------------------------------------------------------------
def({ name: 'play_sound', callType: 'command', target: 'both', overloads: [[str('name')]], doc: '「(name) の音を鳴らす」', scratchBlock: 'sound_play', opcode: 'sound_play' });
def({ name: 'play_sound_until_done', callType: 'command', target: 'both', overloads: [[str('name')]], doc: '「終わるまで (name) の音を鳴らす」', scratchBlock: 'sound_playuntildone', opcode: 'sound_playuntildone' });
def({ name: 'stop_all_sounds', callType: 'command', target: 'both', overloads: [[]], doc: '「すべての音を止める」', scratchBlock: 'sound_stopallsounds', opcode: 'sound_stopallsounds' });
def({ name: 'change_volume', callType: 'command', target: 'both', overloads: [[num('change')]], doc: '「音量を (change) ずつ変える」', scratchBlock: 'sound_changevolumeby', opcode: 'sound_changevolumeby' });
def({ name: 'set_volume', callType: 'command', target: 'both', overloads: [[num('volume')]], doc: '「音量を (volume)% にする」', scratchBlock: 'sound_setvolumeto', opcode: 'sound_setvolumeto' });
def({ name: 'change_sound_effect', callType: 'command', target: 'both', overloads: [[menu('effect', 'sound_effect'), num('change')]], doc: '「音の (effect) 効果を (change) ずつ変える」', scratchBlock: 'sound_changeeffectby', opcode: 'sound_changeeffectby' });
def({ name: 'set_sound_effect', callType: 'command', target: 'both', overloads: [[menu('effect', 'sound_effect'), num('value')]], doc: '「音の (effect) 効果を (value) にする」', scratchBlock: 'sound_seteffectto', opcode: 'sound_seteffectto' });
def({ name: 'clear_sound_effects', callType: 'command', target: 'both', overloads: [[]], doc: '「音の効果をなくす」', scratchBlock: 'sound_cleareffects', opcode: 'sound_cleareffects' });

// --- イベント (event) ------------------------------------------------------
def({ name: 'broadcast', callType: 'command', target: 'both', overloads: [[str('message')]], doc: '「(message) を送る」', scratchBlock: 'event_broadcast', opcode: 'event_broadcast' });
def({ name: 'broadcast_and_wait', callType: 'command', target: 'both', overloads: [[str('message')]], doc: '「(message) を送って待つ」', scratchBlock: 'event_broadcastandwait', opcode: 'event_broadcastandwait' });

// --- 制御 (control) --------------------------------------------------------
def({ name: 'wait', callType: 'command', target: 'both', overloads: [[num('secs')]], doc: '「(secs) 秒待つ」', scratchBlock: 'control_wait', opcode: 'control_wait' });
def({ name: 'wait_until', callType: 'command', target: 'both', overloads: [[{ name: 'cond', type: 'bool' }]], doc: '「(cond) まで待つ」', scratchBlock: 'control_wait_until', opcode: 'control_wait_until' });
def({ name: 'stop', callType: 'command', target: 'both', overloads: [[menu('what', 'stop')]], doc: '「(all/this script/other scripts) を止める」', scratchBlock: 'control_stop', opcode: 'control_stop' });
def({ name: 'create_clone', callType: 'command', target: 'sprite', overloads: [[], [{ name: 'target', type: 'menu:clone_target' }]], doc: '「(target) のクローンを作る」', scratchBlock: 'control_create_clone_of', opcode: 'control_create_clone_of' });
def({ name: 'delete_clone', callType: 'command', target: 'sprite', overloads: [[]], doc: '「このクローンを削除する」', scratchBlock: 'control_delete_this_clone', opcode: 'control_delete_this_clone' });

// --- 調べる (sensing) ------------------------------------------------------
def({ name: 'ask', callType: 'command', target: 'both', overloads: [[str('question')]], doc: '「(question) と聞いて待つ」', scratchBlock: 'sensing_askandwait', opcode: 'sensing_askandwait' });
def({ name: 'reset_timer', callType: 'command', target: 'both', overloads: [[]], doc: '「タイマーをリセット」', scratchBlock: 'sensing_resettimer', opcode: 'sensing_resettimer' });
def({ name: 'touching', callType: 'reporter', target: 'sprite', overloads: [[{ name: 'target', type: 'menu:touch_target' }]], returns: T_BOOL, doc: '「(target) に触れた?」', scratchBlock: 'sensing_touchingobject', opcode: 'sensing_touchingobject' });
def({ name: 'touching_color', callType: 'reporter', target: 'sprite', overloads: [[{ name: 'color', type: 'color' }]], returns: T_BOOL, doc: '「(color) 色に触れた?」', scratchBlock: 'sensing_touchingcolor', opcode: 'sensing_touchingcolor' });
def({ name: 'color_touching_color', callType: 'reporter', target: 'sprite', overloads: [[{ name: 'c1', type: 'color' }, { name: 'c2', type: 'color' }]], returns: T_BOOL, doc: '「自スプライトの (c1) 色が背景の (c2) 色に触れた?」', scratchBlock: 'sensing_coloristouchingcolor', opcode: 'sensing_coloristouchingcolor' });
def({ name: 'distance_to', callType: 'reporter', target: 'sprite', overloads: [[{ name: 'target', type: 'menu:goto_target' }]], returns: T_FLOAT, doc: '「(target) までの距離」', scratchBlock: 'sensing_distanceto', opcode: 'sensing_distanceto' });
def({ name: 'key_pressed', callType: 'reporter', target: 'both', overloads: [[menu('key', 'key')]], returns: T_BOOL, doc: '「(key) キーが押された?」', scratchBlock: 'sensing_keypressed', opcode: 'sensing_keypressed' });
def({ name: 'current', callType: 'reporter', target: 'both', overloads: [[menu('unit', 'current_unit')]], returns: T_FLOAT, doc: '「現在の (year/month/...)」', scratchBlock: 'sensing_current', opcode: 'sensing_current' });
def({ name: 'current_of', callType: 'reporter', target: 'both', overloads: [[menu('unit', 'current_unit')]], returns: T_FLOAT, doc: 'current の別名', scratchBlock: 'sensing_current', opcode: 'sensing_current' });

// --- 演算 (operator) -------------------------------------------------------
def({
  name: 'random', callType: 'reporter', target: 'both',
  overloads: [[num('from'), num('to')]],
  returnsFn: (ts) => (ts.every(t => t.kind === 'int') ? T_INT : T_FLOAT),
  doc: '「(from) から (to) までの乱数」', scratchBlock: 'operator_random', opcode: 'operator_random',
});
def({ name: 'round', callType: 'reporter', target: 'both', overloads: [[num('x')]], returns: T_INT, doc: '「(x) を四捨五入」', scratchBlock: 'operator_round', opcode: 'operator_round' });
const mathOps: [string, string, string][] = [
  ['abs', 'abs', '「(x) の絶対値」'],
  ['floor', 'floor', '「(x) の切り下げ」'],
  ['ceil', 'ceiling', '「(x) の切り上げ」'],
  ['sqrt', 'sqrt', '「(x) の平方根」'],
  ['sin', 'sin', '「sin(x)」(度)'],
  ['cos', 'cos', '「cos(x)」(度)'],
  ['tan', 'tan', '「tan(x)」(度)'],
  ['asin', 'asin', '「asin(x)」(度)'],
  ['acos', 'acos', '「acos(x)」(度)'],
  ['atan', 'atan', '「atan(x)」(度)'],
  ['ln', 'ln', '「ln(x) 自然対数」'],
  ['log10', 'log', '「log(x) 常用対数」'],
  ['pow10', '10 ^', '「10 ^ (x)」'],
  ['exp', 'e ^', '「e ^ (x)」'],
];
for (const [fname, mop, docja] of mathOps) {
  def({
    name: fname, callType: 'reporter', target: 'both', overloads: [[num('x')]],
    returns: fname === 'abs' ? T_ANY : T_FLOAT, doc: docja, scratchBlock: `operator_mathop[${mop}]`, opcode: 'operator_mathop',
  });
  (BUILTINS[fname] as BuiltinDef & { mathop?: string }).mathop = mop;
}
def({ name: 'mod', callType: 'reporter', target: 'both', overloads: [[num('a'), num('b')]], returnsFn: (ts) => (ts.every(t => t.kind === 'int') ? T_INT : T_FLOAT), doc: '「(a) を (b) で割った余り」', scratchBlock: 'operator_mod', opcode: 'operator_mod' });
def({ name: 'letter', callType: 'reporter', target: 'both', overloads: [[num('index'), str('text')]], returns: T_STR, doc: '「(text) の (index) 番目の文字」', scratchBlock: 'operator_letter_of', opcode: 'operator_letter_of' });
def({ name: 'join', callType: 'reporter', target: 'both', overloads: [[str('a'), str('b')]], returns: T_STR, doc: '「(a) と (b)」(文字列連結)', scratchBlock: 'operator_join', opcode: 'operator_join' });

// --- ペン (pen 拡張) -------------------------------------------------------
def({ name: 'pen_down', callType: 'command', target: 'sprite', overloads: [[]], doc: '「ペンを下ろす」', scratchBlock: 'pen_penDown', opcode: 'pen_penDown' });
def({ name: 'pen_up', callType: 'command', target: 'sprite', overloads: [[]], doc: '「ペンを上げる」', scratchBlock: 'pen_penUp', opcode: 'pen_penUp' });
def({ name: 'stamp', callType: 'command', target: 'sprite', overloads: [[]], doc: '「スタンプ」', scratchBlock: 'pen_stamp', opcode: 'pen_stamp' });
def({ name: 'clear_pen', callType: 'command', target: 'both', overloads: [[]], doc: '「全部消す」', scratchBlock: 'pen_clear', opcode: 'pen_clear' });
def({ name: 'set_pen_color', callType: 'command', target: 'sprite', overloads: [[{ name: 'color', type: 'color' }]], doc: '「ペンの色を (color) にする」', scratchBlock: 'pen_setPenColorToColor', opcode: 'pen_setPenColorToColor' });
def({ name: 'change_pen_param', callType: 'command', target: 'sprite', overloads: [[menu('param', 'pen_param'), num('value')]], doc: '「ペンの (param) を (value) ずつ変える」', scratchBlock: 'pen_changePenColorParamBy', opcode: 'pen_changePenColorParamBy' });
def({ name: 'set_pen_param', callType: 'command', target: 'sprite', overloads: [[menu('param', 'pen_param'), num('value')]], doc: '「ペンの (param) を (value) にする」', scratchBlock: 'pen_setPenColorParamTo', opcode: 'pen_setPenColorParamTo' });
def({ name: 'change_pen_size', callType: 'command', target: 'sprite', overloads: [[num('size')]], doc: '「ペンの太さを (size) ずつ変える」', scratchBlock: 'pen_changePenSizeBy', opcode: 'pen_changePenSizeBy' });
def({ name: 'set_pen_size', callType: 'command', target: 'sprite', overloads: [[num('size')]], doc: '「ペンの太さを (size) にする」', scratchBlock: 'pen_setPenSizeTo', opcode: 'pen_setPenSizeTo' });

// --- プロパティ(括弧なしレポータ) -----------------------------------------
export interface PropertyDef {
  name: string;
  target: TargetKind;
  returns: SPType;
  opcode: string;
  doc: string;
}

export const PROPERTIES: Record<string, PropertyDef> = {};
function prop(p: PropertyDef) { PROPERTIES[p.name] = p; }

prop({ name: 'x', target: 'sprite', returns: T_FLOAT, opcode: 'motion_xposition', doc: '「x座標」' });
prop({ name: 'y', target: 'sprite', returns: T_FLOAT, opcode: 'motion_yposition', doc: '「y座標」' });
prop({ name: 'direction', target: 'sprite', returns: T_FLOAT, opcode: 'motion_direction', doc: '「向き」' });
prop({ name: 'size', target: 'sprite', returns: T_FLOAT, opcode: 'looks_size', doc: '「大きさ」' });
prop({ name: 'costume_number', target: 'sprite', returns: T_INT, opcode: 'looks_costumenumber', doc: '「コスチュームの番号」' });
prop({ name: 'costume_name', target: 'sprite', returns: T_STR, opcode: 'looks_costumename', doc: '「コスチュームの名前」' });
prop({ name: 'volume', target: 'both', returns: T_FLOAT, opcode: 'sound_volume', doc: '「音量」' });
prop({ name: 'backdrop_number', target: 'stage', returns: T_INT, opcode: 'looks_backdropnumber', doc: '「背景の番号」' });
prop({ name: 'backdrop_name', target: 'stage', returns: T_STR, opcode: 'looks_backdropname', doc: '「背景の名前」' });
prop({ name: 'tempo', target: 'stage', returns: T_FLOAT, opcode: 'music_getTempo', doc: '「テンポ」(music 拡張)' });
prop({ name: 'mouse_x', target: 'both', returns: T_FLOAT, opcode: 'sensing_mousex', doc: '「マウスのx座標」' });
prop({ name: 'mouse_y', target: 'both', returns: T_FLOAT, opcode: 'sensing_mousey', doc: '「マウスのy座標」' });
prop({ name: 'mouse_down', target: 'both', returns: T_BOOL, opcode: 'sensing_mousedown', doc: '「マウスが押された?」' });
prop({ name: 'timer', target: 'both', returns: T_FLOAT, opcode: 'sensing_timer', doc: '「タイマー」' });
prop({ name: 'loudness', target: 'both', returns: T_FLOAT, opcode: 'sensing_loudness', doc: '「音量(マイク)」' });
prop({ name: 'answer', target: 'both', returns: T_STR, opcode: 'sensing_answer', doc: '「答え」' });
prop({ name: 'username', target: 'both', returns: T_STR, opcode: 'sensing_username', doc: '「ユーザー名」' });
prop({ name: 'days_since_2000', target: 'both', returns: T_FLOAT, opcode: 'sensing_dayssince2000', doc: '「2000年からの日数」' });
prop({ name: 'dragging', target: 'sprite', returns: T_BOOL, opcode: 'sensing_dragging', doc: '「ドラッグ中?」' });

// --- 予約プロパティ名(変数名に使用不可) ------------------------------------
export const RESERVED_NAMES = new Set(Object.keys(PROPERTIES));

// sensing_of (スプライトのプロパティ参照 Cat.x) で使える Scratch 上のプロパティ名
export const SENSING_OF_PROPS: Record<string, string> = {
  x: 'x position', y: 'y position', direction: 'direction', size: 'size',
  volume: 'volume', costume_number: 'costume #', costume_name: 'costume name',
  backdrop_number: 'backdrop #', backdrop_name: 'backdrop name', tempo: 'tempo',
};

// len() は str / list の両方に使える(オーバーロード解決は型チェッカ側)
export const LEN_NAME = 'len';
