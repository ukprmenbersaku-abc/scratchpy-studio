/**
 * Blockly ブロック定義・テーマ・ツールボックス
 * ScratchPy の全構文を Blockly ブロックとして定義する。
 * 組み込み関数(spb_*)は BUILTINS カタログから自動生成する。
 */
import * as Blockly from 'blockly';
import * as jaMsgs from 'blockly/msg/ja';
import * as enMsgs from 'blockly/msg/en';
import { EN } from '../i18n';
import { BUILTINS, MENUS, PROPERTIES, SENSING_OF_PROPS } from '../../core/lang/builtins';

export const COLORS: Record<string, string> = {
  motion: '#4C97FF',
  looks: '#9966FF',
  sound: '#CF63CF',
  events: '#FFBF00',
  control: '#FFAB19',
  sensing: '#5CB1D6',
  operators: '#59C059',
  variables: '#FF8C1A',
  lists: '#FF661A',
  myblocks: '#FF6680',
  pen: '#0FBD8C',
  stage: '#8A63D2',
  other: '#8A93B0',
};

export const catOfOpcode = (op?: string): string => {
  if (!op) return 'other';
  if (op.startsWith('motion_')) return 'motion';
  if (op.startsWith('looks_')) return 'looks';
  if (op.startsWith('sound_')) return 'sound';
  if (op.startsWith('event_')) return 'events';
  if (op.startsWith('control_')) return 'control';
  if (op.startsWith('sensing_')) return 'sensing';
  if (op.startsWith('operator_')) return 'operators';
  if (op.startsWith('pen_')) return 'pen';
  if (op.startsWith('procedures_')) return 'myblocks';
  if (op.includes('list') || op === 'data_addtolist' || op === 'data_insertatlist'
    || op === 'data_replaceitemoflist' || op === 'data_deleteoflist' || op === 'data_deletealloflist'
    || op === 'data_showlist' || op === 'data_hidelist' || op === 'data_itemoflist'
    || op === 'data_lengthoflist' || op === 'data_listcontainsitem') return 'lists';
  if (op.startsWith('data_')) return 'variables';
  return 'other';
};

// 英語メニュー値 → 日本語表示
export const MENU_JA: Record<string, string> = {
  all: 'すべて', 'this script': 'このスクリプト', 'other scripts': 'スプライトの他のスクリプト',
  front: '最前面', back: '最背面', forward: '手前', backward: '奥',
  'all around': '自由', 'left-right': '左右のみ', "don't rotate": '回転しない',
  color: '色', fisheye: '魚眼', whirl: '渦巻き', pixelate: 'ピクセル化',
  brightness: '明るさ', ghost: '幽霊', mosaic: 'モザイク',
  pitch: 'ピッチ', pan: '左右バランス',
  edge: '端', mouse: 'マウスのポインター', random: 'ランダムな場所', myself: '自分自身',
  space: 'スペース', 'up arrow': '上向き矢印', 'down arrow': '下向き矢印',
  'left arrow': '左向き矢印', 'right arrow': '右向き矢印', any: 'どれか',
  year: '年', month: '月', date: '日', 'day of week': '曜日',
  hour: '時', minute: '分', second: '秒',
  transparency: '透明度', saturation: '鮮やかさ',
};
export const menuJa = (v: string) => EN ? v : (MENU_JA[v] ?? v);
const clean = (doc: string) => doc.replace(/[「」]/g, '');

/** 組み込み関数の日本語ブロックラベル({n} = 引数スロット) */
export const LABELS: Record<string, string[]> = {
  move: ['{0} 歩動かす'],
  turn_right: ['{0} 度回す(時計回り)'], turn_left: ['{0} 度回す(反時計回り)'],
  goto: ['{0} へ行く', '{0} {1} へ行く'],
  glide: ['{0} 秒で {1} へ滑る', '{0} 秒で {1} {2} へ滑る'],
  point: ['{0} 度に向ける'], point_towards: ['{0} へ向ける'],
  change_x: ['x座標を {0} ずつ変える'], set_x: ['x座標を {0} にする'],
  change_y: ['y座標を {0} ずつ変える'], set_y: ['y座標を {0} にする'],
  bounce: ['もし端についたら、跳ね返る'],
  set_rotation_style: ['回転方法を {0} にする'],
  say: ['{0} と言う', '{0} と {1} 秒言う'],
  think: ['{0} と考える', '{0} と {1} 秒考える'],
  show: ['表示する'], hide: ['隠す'],
  switch_costume: ['コスチュームを {0} にする'], next_costume: ['次のコスチュームにする'],
  switch_backdrop: ['背景を {0} にする'], next_backdrop: ['次の背景にする'],
  change_size: ['大きさを {0} ずつ変える'], set_size: ['大きさを {0}% にする'],
  change_effect: ['{0} の効果を {1} ずつ変える'], set_effect: ['{0} の効果を {1} にする'],
  clear_effects: ['見た目の効果をなくす'],
  go_to_layer: ['{0} へ移動する'], change_layer: ['{0} に {1} 層ずらす'],
  play_sound: ['{0} の音を鳴らす'], play_sound_until_done: ['終わるまで {0} の音を鳴らす'],
  stop_all_sounds: ['すべての音を止める'],
  change_volume: ['音量を {0} ずつ変える'], set_volume: ['音量を {0}% にする'],
  change_sound_effect: ['音の {0} 効果を {1} ずつ変える'], set_sound_effect: ['音の {0} 効果を {1} にする'],
  clear_sound_effects: ['音の効果をなくす'],
  broadcast: ['{0} を送る'], broadcast_and_wait: ['{0} を送って待つ'],
  wait: ['{0} 秒待つ'], wait_until: ['{0} まで待つ'],
  stop: ['{0} を止める'],
  create_clone: ['自分自身のクローンを作る', '{0} のクローンを作る'],
  delete_clone: ['このクローンを削除する'],
  ask: ['{0} と聞いて待つ'], reset_timer: ['タイマーをリセット'],
  touching: ['{0} に触れた?'], touching_color: ['{0} 色に触れた?'],
  color_touching_color: ['{0} 色が {1} 色に触れた?'],
  distance_to: ['{0} までの距離'], key_pressed: ['{0} キーが押された?'],
  current: ['現在の {0}'], current_of: ['現在の {0}'],
  random: ['{0} から {1} までの乱数'], round: ['{0} を四捨五入'],
  abs: ['{0} の絶対値'], floor: ['{0} の切り下げ'], ceil: ['{0} の切り上げ'], sqrt: ['{0} の平方根'],
  sin: ['{0} の sin'], cos: ['{0} の cos'], tan: ['{0} の tan'],
  asin: ['{0} の asin'], acos: ['{0} の acos'], atan: ['{0} の atan'],
  ln: ['{0} の自然対数'], log10: ['{0} の常用対数'], exp: ['e ^ {0}'], pow10: ['10 ^ {0}'],
  mod: ['{0} ÷ {1} の余り'], letter: ['{1} の {0} 番目の文字'], join: ['{0} と {1}'],
  len: ['{0} の長さ'],
  pen_down: ['ペンを下ろす'], pen_up: ['ペンを上げる'], stamp: ['スタンプ'], clear_pen: ['全部消す'],
  set_pen_color: ['ペンの色を {0} にする'],
  change_pen_param: ['ペンの {0} を {1} ずつ変える'], set_pen_param: ['ペンの {0} を {1} にする'],
  change_pen_size: ['ペンの太さを {0} ずつ変える'], set_pen_size: ['ペンの太さを {0} にする'],
};

// English captions for blocks which have Scratch-style labels; unknown commands
// retain their readable function name and all argument sockets.
const EN_LABELS: Record<string, string[]> = {
  move: ['move {0} steps'], turn_right: ['turn clockwise {0} degrees'], turn_left: ['turn counterclockwise {0} degrees'],
  goto: ['go to {0}', 'go to x {0} y {1}'], glide: ['glide {0} seconds to {1}', 'glide {0} seconds to x {1} y {2}'],
  point: ['point in direction {0}'], point_towards: ['point towards {0}'], change_x: ['change x by {0}'], set_x: ['set x to {0}'], change_y: ['change y by {0}'], set_y: ['set y to {0}'],
  bounce: ['if on edge, bounce'], set_rotation_style: ['set rotation style {0}'],
  say: ['say {0}', 'say {0} for {1} seconds'], think: ['think {0}', 'think {0} for {1} seconds'], show: ['show'], hide: ['hide'],
  switch_costume: ['switch costume to {0}'], next_costume: ['next costume'], switch_backdrop: ['switch backdrop to {0}'], next_backdrop: ['next backdrop'],
  change_size: ['change size by {0}'], set_size: ['set size to {0}%'], change_effect: ['change {0} effect by {1}'], set_effect: ['set {0} effect to {1}'], clear_effects: ['clear visual effects'],
  play_sound: ['start sound {0}'], play_sound_until_done: ['play sound {0} until done'], stop_all_sounds: ['stop all sounds'],
  broadcast: ['broadcast {0}'], broadcast_and_wait: ['broadcast {0} and wait'], wait: ['wait {0} seconds'], wait_until: ['wait until {0}'], stop: ['stop {0}'],
  create_clone: ['create clone of myself', 'create clone of {0}'], delete_clone: ['delete this clone'], ask: ['ask {0} and wait'], reset_timer: ['reset timer'],
  touching: ['touching {0}?'], touching_color: ['touching color {0}?'], color_touching_color: ['color {0} touching {1}?'], distance_to: ['distance to {0}'], key_pressed: ['key {0} pressed?'],
  random: ['pick random {0} to {1}'], join: ['join {0} {1}'], len: ['length of {0}'], current: ['current {0}'], current_of: ['current {0}'],
};
const BLOCK_WORDS: Record<string,string> = {
  'ステージ':'stage','スプライト':'sprite','変数':'variable','最小':'min','最大':'max','クラウド':'cloud','リスト':'list',
  'コスチューム':'costume','音':'sound','pass (何もしない)':'pass (do nothing)','変換不可ブロック:':'unsupported block:',
  'flag が押されたとき':'when flag clicked','キーが押されたとき':'key pressed','このスプライトが押されたとき':'when this sprite clicked',
  'クローンされたとき':'when I start as a clone','メッセージ':'message','を受け取ったとき':'when received','が':'',
  'より大きくなったとき':'when greater than','背景が':'when backdrop','になったとき':'changes to',
  '定義':'define','ワープ(即時実行)':'run without screen refresh','の':'of','番目を':'item at',
  'にする':'set to','を':'','に追加する':'add to','番目に挿入する':'insert at','番目を削除する':'delete at',
  'のすべてを削除する':'delete all','ずっと':'forever','の間、繰り返す':'repeat while','番目':'item',
  'の長さ':'length of','に含まれる':'contains','かつ':'and','または':'or','ではない':'not',
  '(モニターなし)':'(no monitor)','表示':'show','大きく表示':'large','スライダー':'slider','非表示':'hide',
  'タイマー':'timer','音量(マイク)':'loudness','表示する':'show','隠す':'hide',
  'ステージ/スプライト':'Stage & sprites','イベント':'Events','制御':'Control','動き':'Motion','見た目':'Looks',
  '調べる':'Sensing','演算':'Operators','ペン':'Pen','マイブロック':'My blocks',
};
const word = (s: string) => EN ? (BLOCK_WORDS[s] ?? s) : s;

const slotCount = (t: string) => {
  let max = -1;
  for (const m of t.matchAll(/\{(\d+)\}/g)) max = Math.max(max, Number(m[1]));
  return max + 1;
};

// ラベルが未定義の関数も、すべての引数を失わず表示する。
function templatesFor(name: string, b: (typeof BUILTINS)[string]): string[] {
  const labels = (EN ? EN_LABELS[name] : LABELS[name]) ?? [];
  return [...new Set(b.overloads.map(ov => ov.length))].map(n =>
    labels.find(t => slotCount(t) === n)
      ?? `${name}${Array.from({length: n}, (_, i) => ` {${i}}`).join('')}`);
}

type B = Blockly.Block;
type Input = Blockly.Input;

const dynSprites = (block: B | null, extra: string[] = []): (() => [string, string][]) => () => {
  const opts: [string, string][] = extra.map(e => [menuJa(e) === e ? e : menuJa(e), e]);
  const ws = block?.workspace;
  if (ws) {
    for (const b of ws.getAllBlocks(false)) {
      if (b.type === 'sp_sprite') {
        const n = b.getFieldValue('NAME');
        if (n) opts.push([n, n]);
      }
    }
  }
  return opts.length ? opts : [['—', '']];
};

const inputCheckForParam = (type: string): string[] | null => {
  if (type === 'bool') return ['Boolean'];
  if (type === 'number' || type === 'int' || type === 'float') return ['Number'];
  if (type === 'str') return ['String', 'Number', 'Boolean']; // Scratch の %s は何でも受け付ける
  if (type === 'index') return ['Number', 'String'];
  return null;
};

const outputCheckFor = (returns?: { kind: string }): string[] | null => {
  if (!returns) return null;
  if (returns.kind === 'bool') return ['Boolean'];
  if (returns.kind === 'int' || returns.kind === 'float') return ['Number'];
  if (returns.kind === 'str') return ['String'];
  return null;
};

let registered = false;

export function registerScratchPyBlocks(): void {
  if (registered) return;
  registered = true;

  // 日本語ロケール
  try {
    Blockly.setLocale((EN ? enMsgs : jaMsgs) as unknown as Record<string, string>);
  } catch { /* headless etc. */ }

  // ---------- 自動生成: 組み込み関数 ----------
  for (const [name, b] of Object.entries(BUILTINS)) {
    const tpls = templatesFor(name, b);
    for (const tpl of tpls) {
      const arity = slotCount(tpl);
      const overload = b.overloads.find(ov => ov.length === arity) ?? b.overloads[0] ?? [];
      const cat = catOfOpcode(b.opcode);
      const type = `spb_${name}_${arity}`;
      Blockly.Blocks[type] = {
        init(this: B) {
          this.setColour(COLORS[cat] ?? COLORS.other);
          this.setInputsInline(true);
          let cur: Input | null = null;
          const ensureDummy = (): Input => {
            if (!cur || cur.type === Blockly.inputs.inputTypes.VALUE) cur = this.appendDummyInput();
            return cur;
          };
          const parts = tpl.split(/\{(\d+)\}/g);
          parts.forEach((part, pi) => {
            if (pi % 2 === 0) {
              if (part) ensureDummy().appendField(part);
              return;
            }
            const ai = Number(part);
            const spec = overload[ai];
            const ptype = spec?.type ?? 'any';
            if (ptype.startsWith('menu:')) {
              const menuKey = ptype.slice(5);
              const values = MENUS[menuKey] ?? [];
              const dynamic = ['goto_target', 'touch_target', 'clone_target'].includes(menuKey);
              const opts: [string, string][] = values.map(v => [menuJa(v), v]);
              const extra = menuKey === 'goto_target' ? ['mouse', 'random'] : menuKey === 'touch_target' ? ['edge', 'mouse'] : ['myself'];
              const field = dynamic && values.length === 0
                ? new Blockly.FieldDropdown(dynSprites(this, extra))
                : new Blockly.FieldDropdown(() => {
                  const base = values.map(v => [menuJa(v), v] as [string, string]);
                  if (dynamic) {
                    const ws = this.workspace;
                    if (ws) for (const blk of ws.getAllBlocks(false)) {
                      if (blk.type === 'sp_sprite') {
                        const n = blk.getFieldValue('NAME');
                        if (n && !base.some(o => o[1] === n)) base.push([n, n]);
                      }
                    }
                  }
                  return base.length ? base : opts;
                });
              ensureDummy().appendField(field, `F${ai}`);
            } else if (ptype === 'color') {
              ensureDummy().appendField(new Blockly.FieldTextInput('#ff0000'), `F${ai}`);
            } else {
              cur = this.appendValueInput(`ARG${ai}`).setCheck(inputCheckForParam(ptype));
            }
          });
          if (b.callType === 'reporter') {
            this.setOutput(true, outputCheckFor(b.returns) ?? null);
          } else {
            this.setPreviousStatement(true, null);
            this.setNextStatement(true, null);
          }
          const tip = EN ? `${name} (${b.scratchBlock})` : clean(b.doc) + (b.scratchBlock ? ` (${b.scratchBlock})` : '');
          this.setTooltip(tip);
        },
      };
    }
  }

  // ---------- ターゲット ----------
  Blockly.Blocks['sp_stage'] = {
    init(this: B) {
      this.setColour(COLORS.stage);
      this.appendDummyInput().appendField(word('ステージ')).appendField(new Blockly.FieldTextInput(''), 'NAME');
      this.appendStatementInput('BODY').setCheck(['BODY']);
      (this as unknown as { setHat?: (h: string) => void }).setHat?.('cap');
      this.setTooltip(EN ? '' : 'ステージ(背景・グローバル変数)');
    },
  };
  Blockly.Blocks['sp_sprite'] = {
    init(this: B) {
      this.setColour('#4C97FF');
      this.appendDummyInput().appendField(word('スプライト')).appendField(new Blockly.FieldTextInput('Sprite1'), 'NAME');
      this.appendStatementInput('BODY').setCheck(['BODY']);
      (this as unknown as { setHat?: (h: string) => void }).setHat?.('cap');
      this.setTooltip(EN ? '' : 'スプライト(キャラクター)');
    },
  };

  // ---------- 宣言 ----------
  const TYPE_OPTS: [string, string][] = [['int', 'int'], ['float', 'float'], ['str', 'str'], ['bool', 'bool'], ['any', 'any']];
  Blockly.Blocks['sp_var'] = {
    init(this: B) {
      this.setColour(COLORS.variables);
      this.setInputsInline(true);
      this.appendDummyInput()
        .appendField(word('変数')).appendField(new Blockly.FieldTextInput('score'), 'NAME')
        .appendField(':').appendField(new Blockly.FieldDropdown(TYPE_OPTS), 'TYPE')
        .appendField('=');
      this.appendValueInput('INIT').setCheck(null);
      this.appendDummyInput()
        .appendField(new Blockly.FieldDropdown([
          [word('(モニターなし)'), ''], [word('表示'), 'show'], [word('大きく表示'), 'large'],
          [word('スライダー'), 'slider'], [word('非表示'), 'hide'],
        ]), 'MON')
        .appendField(word('最小')).appendField(new Blockly.FieldNumber(0), 'SLMIN')
        .appendField(word('最大')).appendField(new Blockly.FieldNumber(100), 'SLMAX')
        .appendField(new Blockly.FieldCheckbox(false), 'CLOUD').appendField(word('クラウド'));
      this.setPreviousStatement(true, ['BODY']);
      this.setNextStatement(true, ['BODY']);
      this.setTooltip(EN ? '' : '変数を宣言します(型つき)');
    },
  };
  Blockly.Blocks['sp_list'] = {
    init(this: B) {
      this.setColour(COLORS.lists);
      this.setInputsInline(true);
      this.appendDummyInput()
        .appendField(word('リスト')).appendField(new Blockly.FieldTextInput('items'), 'NAME')
        .appendField(': list[').appendField(new Blockly.FieldDropdown(TYPE_OPTS), 'ELEM')
        .appendField('] =');
      this.appendValueInput('INIT').setCheck(null);
      this.appendDummyInput().appendField(new Blockly.FieldDropdown([[word('(モニターなし)'), ''], [word('表示'), 'show'], [word('非表示'), 'hide']]), 'MON');
      this.setPreviousStatement(true, ['BODY']);
      this.setNextStatement(true, ['BODY']);
      this.setTooltip(EN ? '' : 'リストを宣言します');
    },
  };
  Blockly.Blocks['sp_costume'] = {
    init(this: B) {
      this.setColour(COLORS.looks);
      this.appendDummyInput().appendField(word('コスチューム')).appendField(new Blockly.FieldTextInput('costume1'), 'NAME');
      this.setPreviousStatement(true, ['BODY']);
      this.setNextStatement(true, ['BODY']);
    },
  };
  Blockly.Blocks['sp_sound'] = {
    init(this: B) {
      this.setColour(COLORS.sound);
      this.appendDummyInput().appendField(word('音')).appendField(new Blockly.FieldTextInput('meow'), 'NAME');
      this.setPreviousStatement(true, ['BODY']);
      this.setNextStatement(true, ['BODY']);
    },
  };
  const CONFIG_KEYS: [string, string][] = [
    ['x', 'x'], ['y', 'y'], ['direction', 'direction'], ['size', 'size'],
    ['visible', 'visible'], ['draggable', 'draggable'], ['rotation_style', 'rotation_style'],
    ['volume', 'volume'], ['current_costume', 'current_costume'], ['layer_order', 'layer_order'],
    ['tempo', 'tempo'], ['video_state', 'video_state'], ['video_transparency', 'video_transparency'],
    ['tts_language', 'tts_language'],
  ];
  Blockly.Blocks['sp_config'] = {
    init(this: B) {
      this.setColour('#6FB3D2');
      this.setInputsInline(true);
      this.appendDummyInput().appendField(new Blockly.FieldDropdown(CONFIG_KEYS), 'KEY').appendField(':');
      this.appendValueInput('VALUE').setCheck(null);
      this.setPreviousStatement(true, ['BODY']);
      this.setNextStatement(true, ['BODY']);
      this.setTooltip(EN ? '' : 'スプライト/ステージの初期設定');
    },
  };
  Blockly.Blocks['sp_comment'] = {
    init(this: B) {
      this.setColour(COLORS.other);
      this.appendDummyInput().appendField('#').appendField(new Blockly.FieldTextInput(EN ? 'note' : 'メモ'), 'TEXT');
      this.setPreviousStatement(true, ['BODY', 'STMT']);
      this.setNextStatement(true, ['BODY', 'STMT']);
    },
  };
  Blockly.Blocks['sp_pass'] = {
    init(this: B) {
      this.setColour(COLORS.other);
      this.appendDummyInput().appendField(word('pass (何もしない)'));
      this.setPreviousStatement(true, ['BODY', 'STMT']);
      this.setNextStatement(true, ['BODY', 'STMT']);
    },
  };
  Blockly.Blocks['sp_unsupported'] = {
    init(this: B) {
      this.setColour('#D64545');
      this.appendDummyInput().appendField(word('変換不可ブロック:')).appendField(new Blockly.FieldTextInput('unknown'), 'OPCODE');
      this.setPreviousStatement(true, ['BODY', 'STMT']);
      this.setNextStatement(true, ['BODY', 'STMT']);
      this.setTooltip(EN ? '' : '元の .sb3 にあった、ScratchPy に対応しないブロック');
    },
  };

  // ---------- イベント(ハット) ----------
  const hat = (type: string, build: (b: B) => void) => {
    Blockly.Blocks[type] = {
      init(this: B) {
        this.setColour(COLORS.events);
        this.setInputsInline(true);
        build(this);
        this.appendStatementInput('DO').setCheck(['STMT']);
        (this as unknown as { setHat?: (h: string) => void }).setHat?.('cap');
        this.setPreviousStatement(true, ['BODY']);
        this.setNextStatement(true, ['BODY']);
      },
    };
  };
  hat('sp_on_flag', b => { b.appendDummyInput().appendField(word('flag が押されたとき')); });
  hat('sp_on_key', b => {
    b.appendDummyInput()
      .appendField(new Blockly.FieldDropdown(MENUS.key.map(k => [menuJa(k), k])), 'KEY')
      .appendField(word('キーが押されたとき'));
  });
  hat('sp_on_click', b => { b.appendDummyInput().appendField(word('このスプライトが押されたとき')); });
  hat('sp_on_clone', b => { b.appendDummyInput().appendField(word('クローンされたとき')); });
  hat('sp_on_receive', b => {
    b.appendValueInput('MSG').setCheck(['String']).appendField(word('メッセージ'));
    b.appendDummyInput().appendField(word('を受け取ったとき'));
  });
  hat('sp_on_greater', b => {
    b.appendDummyInput().appendField(new Blockly.FieldDropdown([[word('タイマー'), 'timer'], [word('音量(マイク)'), 'loudness']]), 'SENSOR');
    b.appendValueInput('VALUE').setCheck(['Number']).appendField(word('が'));
    b.appendDummyInput().appendField(word('より大きくなったとき'));
  });
  hat('sp_on_backdrop', b => {
    b.appendDummyInput().appendField(word('背景が'));
    b.appendValueInput('NAME').setCheck(['String']);
    b.appendDummyInput().appendField(word('になったとき'));
  });

  // ---------- カスタムブロック定義 ----------
  Blockly.Blocks['sp_def'] = {
    init(this: B) {
      this.setColour(COLORS.myblocks);
      this.setInputsInline(true);
      this.appendDummyInput()
        .appendField(word('定義'))
        .appendField(new Blockly.FieldTextInput('my_block'), 'NAME')
        .appendField('(')
        .appendField(new Blockly.FieldTextInput(''), 'PARAMS')
        .appendField(')');
      this.appendDummyInput()
        .appendField(new Blockly.FieldCheckbox(false), 'WARP').appendField(word('ワープ(即時実行)'));
      this.appendStatementInput('DO').setCheck(['STMT']);
      (this as unknown as { setHat?: (h: string) => void }).setHat?.('cap');
      this.setPreviousStatement(true, ['BODY']);
      this.setNextStatement(true, ['BODY']);
      this.setTooltip(EN ? '' : '引数は「名前: 型, 名前: 型」の形で書きます(例: power: int, shout: bool)');
    },
  };

  // ---------- 文 ----------
  Blockly.Blocks['sp_assign'] = {
    init(this: B) {
      this.setColour(COLORS.variables);
      this.setInputsInline(true);
      this.appendDummyInput().appendField(new Blockly.FieldTextInput('score'), 'NAME').appendField('=');
      this.appendValueInput('VALUE').setCheck(null);
      this.setPreviousStatement(true, null);
      this.setNextStatement(true, null);
    },
  };
  Blockly.Blocks['sp_augassign'] = {
    init(this: B) {
      this.setColour(COLORS.variables);
      this.setInputsInline(true);
      this.appendDummyInput()
        .appendField(new Blockly.FieldTextInput('score'), 'NAME')
        .appendField(new Blockly.FieldDropdown([['+=', '+='], ['−=', '-=']]), 'OP');
      this.appendValueInput('VALUE').setCheck(null);
      this.setPreviousStatement(true, null);
      this.setNextStatement(true, null);
    },
  };
  Blockly.Blocks['sp_replace'] = {
    init(this: B) {
      this.setColour(COLORS.lists);
      this.setInputsInline(true);
      this.appendDummyInput().appendField(new Blockly.FieldTextInput('items'), 'LIST').appendField(word('の'));
      this.appendValueInput('INDEX').setCheck(['Number', 'String']).appendField(word('番目を'));
      this.appendValueInput('VALUE').setCheck(null).appendField(word('にする'));
      this.setPreviousStatement(true, null);
      this.setNextStatement(true, null);
    },
  };
  Blockly.Blocks['sp_list_add'] = {
    init(this: B) {
      this.setColour(COLORS.lists);
      this.setInputsInline(true);
      this.appendValueInput('ITEM').setCheck(null);
      this.appendDummyInput().appendField(word('を')).appendField(new Blockly.FieldTextInput('items'), 'LIST').appendField(word('に追加する'));
      this.setPreviousStatement(true, null);
      this.setNextStatement(true, null);
    },
  };
  Blockly.Blocks['sp_list_insert'] = {
    init(this: B) {
      this.setColour(COLORS.lists);
      this.setInputsInline(true);
      this.appendValueInput('ITEM').setCheck(null);
      this.appendDummyInput().appendField(word('を')).appendField(new Blockly.FieldTextInput('items'), 'LIST').appendField(word('の'));
      this.appendValueInput('INDEX').setCheck(['Number', 'String']).appendField(word('番目に挿入する'));
      this.setPreviousStatement(true, null);
      this.setNextStatement(true, null);
    },
  };
  Blockly.Blocks['sp_list_delete'] = {
    init(this: B) {
      this.setColour(COLORS.lists);
      this.setInputsInline(true);
      this.appendDummyInput().appendField(new Blockly.FieldTextInput('items'), 'LIST').appendField(word('の'));
      this.appendValueInput('INDEX').setCheck(['Number', 'String']).appendField(word('番目を削除する'));
      this.setPreviousStatement(true, null);
      this.setNextStatement(true, null);
    },
  };
  Blockly.Blocks['sp_list_clear'] = {
    init(this: B) {
      this.setColour(COLORS.lists);
      this.appendDummyInput().appendField(new Blockly.FieldTextInput('items'), 'LIST').appendField(word('のすべてを削除する'));
      this.setPreviousStatement(true, null);
      this.setNextStatement(true, null);
    },
  };
  Blockly.Blocks['sp_showmonitor'] = {
    init(this: B) {
      this.setColour(COLORS.variables);
      this.appendDummyInput()
        .appendField(new Blockly.FieldDropdown([[word('表示する'), 'show'], [word('隠す'), 'hide']]), 'MODE')
        .appendField(new Blockly.FieldTextInput('score'), 'NAME');
      this.setPreviousStatement(true, null);
      this.setNextStatement(true, null);
      this.setTooltip(EN ? '' : '変数・リストのモニターを表示/非表示');
    },
  };
  Blockly.Blocks['sp_forever'] = {
    init(this: B) {
      this.setColour(COLORS.control);
      this.appendDummyInput().appendField(word('ずっと'));
      this.appendStatementInput('DO').setCheck(['STMT']);
      this.setPreviousStatement(true, null);
      this.setNextStatement(true, null);
    },
  };
  Blockly.Blocks['sp_while'] = {
    init(this: B) {
      this.setColour(COLORS.control);
      this.setInputsInline(true);
      this.appendValueInput('COND').setCheck(['Boolean']).appendField('');
      this.appendDummyInput().appendField(word('の間、繰り返す'));
      this.appendStatementInput('DO').setCheck(['STMT']);
      this.setPreviousStatement(true, null);
      this.setNextStatement(true, null);
    },
  };

  // ---------- 式(レポータ) ----------
  Blockly.Blocks['sp_name'] = {
    init(this: B) {
      this.setColour(COLORS.variables);
      this.appendDummyInput().appendField(new Blockly.FieldTextInput('score'), 'NAME');
      this.setOutput(true, null);
      this.setTooltip(EN ? '' : '変数・リスト・スプライトの名前');
    },
  };
  const propOptions = () => Object.keys(PROPERTIES).map(k => [EN ? k : clean(PROPERTIES[k].doc), k] as [string, string]);
  Blockly.Blocks['sp_prop'] = {
    init(this: B) {
      const field = new Blockly.FieldDropdown(propOptions, (v) => {
        const p = PROPERTIES[String(v)];
        if (p) (this as B).setColour(COLORS[catOfOpcode(p.opcode)] ?? COLORS.sensing);
        return undefined;
      });
      this.setColour(COLORS[catOfOpcode(PROPERTIES[String(field.getValue())]?.opcode) ?? 'sensing']);
      this.appendDummyInput().appendField(field, 'PROP');
      this.setOutput(true, null);
      this.setTooltip(EN ? '' : '自分のスプライト/ステージのプロパティ(読み取り専用)');
    },
  };
  Blockly.Blocks['sp_prop_of'] = {
    init(this: B) {
      this.setColour(COLORS.sensing);
      this.setInputsInline(true);
      this.appendDummyInput().appendField(new Blockly.FieldDropdown(dynSprites(this, ['stage'])), 'TARGET');
      this.appendDummyInput()
        .appendField(word('の'))
        .appendField(new Blockly.FieldDropdown(Object.keys(SENSING_OF_PROPS).map(k => [EN ? k : clean(PROPERTIES[k]?.doc ?? k), k])), 'PROP');
      this.setOutput(true, null);
      this.setTooltip(EN ? '' : '他のスプライトの値');
    },
  };
  Blockly.Blocks['sp_index'] = {
    init(this: B) {
      this.setColour(COLORS.lists);
      this.setInputsInline(true);
      this.appendDummyInput().appendField(new Blockly.FieldTextInput('items'), 'LIST').appendField(word('の'));
      this.appendValueInput('INDEX').setCheck(['Number', 'String']).appendField(word('番目'));
      this.setOutput(true, null);
    },
  };
  Blockly.Blocks['sp_len'] = {
    init(this: B) {
      this.setColour(COLORS.operators);
      this.appendValueInput('VALUE').setCheck(null).appendField('');
      this.appendDummyInput().appendField(word('の長さ'));
      this.setOutput(true, ['Number']);
      this.setTooltip(EN ? '' : '文字数 / リストの要素数');
    },
  };
  Blockly.Blocks['sp_in'] = {
    init(this: B) {
      this.setColour(COLORS.lists);
      this.setInputsInline(true);
      this.appendValueInput('ITEM').setCheck(null);
      this.appendDummyInput().appendField(word('が')).appendField(new Blockly.FieldTextInput('items'), 'LIST').appendField(word('に含まれる'));
      this.setOutput(true, ['Boolean']);
    },
  };
  const binOp = (type: string, sym: string, out: string[] | null) => {
    Blockly.Blocks[type] = {
      init(this: B) {
        this.setColour(COLORS.operators);
        this.setInputsInline(true);
        this.appendValueInput('A').setCheck(null);
        this.appendDummyInput().appendField(sym);
        this.appendValueInput('B').setCheck(null);
        this.setOutput(true, out);
      },
    };
  };
  binOp('sp_add', '+', null);
  binOp('sp_sub', '−', ['Number']);
  binOp('sp_mul', '×', ['Number']);
  binOp('sp_div', '÷', ['Number']);
  binOp('sp_mod', '%', ['Number']);
  Blockly.Blocks['sp_cmp'] = {
    init(this: B) {
      this.setColour(COLORS.operators);
      this.setInputsInline(true);
      this.appendValueInput('A').setCheck(null);
      this.appendDummyInput().appendField(new Blockly.FieldDropdown([
        ['=', '=='], ['≠', '!='], ['<', '<'], ['≤', '<='], ['>', '>'], ['≥', '>='],
      ]), 'OP');
      this.appendValueInput('B').setCheck(null);
      this.setOutput(true, ['Boolean']);
    },
  };
  Blockly.Blocks['sp_and'] = {
    init(this: B) {
      this.setColour(COLORS.operators);
      this.setInputsInline(true);
      this.appendValueInput('A').setCheck(['Boolean']);
      this.appendDummyInput().appendField(word('かつ'));
      this.appendValueInput('B').setCheck(['Boolean']);
      this.setOutput(true, ['Boolean']);
    },
  };
  Blockly.Blocks['sp_or'] = {
    init(this: B) {
      this.setColour(COLORS.operators);
      this.setInputsInline(true);
      this.appendValueInput('A').setCheck(['Boolean']);
      this.appendDummyInput().appendField(word('または'));
      this.appendValueInput('B').setCheck(['Boolean']);
      this.setOutput(true, ['Boolean']);
    },
  };
  Blockly.Blocks['sp_not'] = {
    init(this: B) {
      this.setColour(COLORS.operators);
      this.appendValueInput('A').setCheck(['Boolean']).appendField('');
      this.appendDummyInput().appendField(word('ではない'));
      this.setOutput(true, ['Boolean']);
    },
  };
  Blockly.Blocks['sp_neg'] = {
    init(this: B) {
      this.setColour(COLORS.operators);
      this.appendValueInput('A').setCheck(['Number']).appendField('-');
      this.setOutput(true, ['Number']);
    },
  };
}

// ---------- テーマ ----------
export function makeTheme(dark: boolean): Blockly.Theme {
  return Blockly.Theme.defineTheme(dark ? 'scratchpy-dark' : 'scratchpy-light', {
    name: dark ? 'scratchpy-dark' : 'scratchpy-light',
    base: Blockly.Themes.Classic,
    blockStyles: {
      logic_blocks: { colourPrimary: COLORS.control, colourSecondary: '#FFC65C', colourTertiary: '#DB8E00' },
      loop_blocks: { colourPrimary: COLORS.control, colourSecondary: '#FFC65C', colourTertiary: '#DB8E00' },
      math_blocks: { colourPrimary: COLORS.operators, colourSecondary: '#79E079', colourTertiary: '#3D993D' },
      text_blocks: { colourPrimary: COLORS.operators, colourSecondary: '#79E079', colourTertiary: '#3D993D' },
      list_blocks: { colourPrimary: COLORS.lists, colourSecondary: '#FF8A4C', colourTertiary: '#CC4E00' },
      variable_blocks: { colourPrimary: COLORS.variables, colourSecondary: '#FFA54C', colourTertiary: '#DB7000' },
      procedure_blocks: { colourPrimary: COLORS.myblocks, colourSecondary: '#FF8FA0', colourTertiary: '#CC3E55' },
      colour_blocks: { colourPrimary: COLORS.operators, colourSecondary: '#79E079', colourTertiary: '#3D993D' },
    },
    componentStyles: dark ? {
      workspaceBackgroundColour: '#10132a',
      toolboxBackgroundColour: 'rgba(18,21,40,0.92)',
      toolboxForegroundColour: '#dfe3f5',
      flyoutBackgroundColour: '#1a1e36',
      flyoutForegroundColour: '#dfe3f5',
      flyoutOpacity: 0.96,
      scrollbarColour: '#3a4066',
      insertionMarkerColour: '#ffffff',
      insertionMarkerOpacity: 0.35,
      markerColour: '#8A93B0',
      cursorColour: '#dfe3f5',
    } : {
      workspaceBackgroundColour: '#f7f8fd',
      toolboxBackgroundColour: 'rgba(255,255,255,0.88)',
      toolboxForegroundColour: '#3a405c',
      flyoutBackgroundColour: '#eceffa',
      flyoutForegroundColour: '#3a405c',
      flyoutOpacity: 0.96,
      scrollbarColour: '#c3c9dd',
      insertionMarkerColour: '#333333',
      insertionMarkerOpacity: 0.3,
      markerColour: '#8A93B0',
      cursorColour: '#3a405c',
    },
    fontStyle: {
      family: '"Hiragino Kaku Gothic ProN","Noto Sans JP","Yu Gothic UI",system-ui,sans-serif',
      weight: '600',
      size: 12,
    },
  });
}

// ---------- ツールボックス ----------
type ToolboxBlock = { kind: 'block'; type: string };
type ToolboxCat = { kind: 'category'; name: string; colour?: string; contents: (ToolboxBlock | { kind: 'label'; text: string })[]; custom?: never } | { kind: 'category'; name: string; colour?: string; custom: string };

function autoTypes(cat: string): ToolboxBlock[] {
  const out: ToolboxBlock[] = [];
  for (const [name, b] of Object.entries(BUILTINS)) {
    const c = catOfOpcode(b.opcode);
    const mapped = c === 'events' ? 'control' : c;
    if (mapped !== cat) continue;
    const tpls = templatesFor(name, b);
    for (const tpl of tpls) out.push({ kind: 'block', type: `spb_${name}_${slotCount(tpl)}` });
  }
  return out;
}

export function makeToolbox(): Blockly.utils.toolbox.ToolboxDefinition {
  const cats: ToolboxCat[] = [
    {
      kind: 'category', name: word('ステージ/スプライト'), colour: COLORS.stage,
      contents: [
        { kind: 'block', type: 'sp_stage' },
        { kind: 'block', type: 'sp_sprite' },
        { kind: 'block', type: 'sp_costume' },
        { kind: 'block', type: 'sp_sound' },
        { kind: 'block', type: 'sp_config' },
        { kind: 'block', type: 'sp_comment' },
        { kind: 'block', type: 'sp_pass' },
      ],
    },
    {
      kind: 'category', name: word('イベント'), colour: COLORS.events,
      contents: [
        { kind: 'block', type: 'sp_on_flag' },
        { kind: 'block', type: 'sp_on_key' },
        { kind: 'block', type: 'sp_on_click' },
        { kind: 'block', type: 'sp_on_clone' },
        { kind: 'block', type: 'sp_on_receive' },
        { kind: 'block', type: 'sp_on_greater' },
        { kind: 'block', type: 'sp_on_backdrop' },
      ],
    },
    {
      kind: 'category', name: word('制御'), colour: COLORS.control,
      contents: [
        { kind: 'block', type: 'controls_if' },
        { kind: 'block', type: 'controls_repeat_ext' },
        { kind: 'block', type: 'sp_forever' },
        { kind: 'block', type: 'sp_while' },
        ...autoTypes('control'),
      ],
    },
    { kind: 'category', name: word('動き'), colour: COLORS.motion, contents: autoTypes('motion') },
    { kind: 'category', name: word('見た目'), colour: COLORS.looks, contents: [...autoTypes('looks'), { kind: 'block', type: 'spb_show_0' }, { kind: 'block', type: 'spb_hide_0' }] },
    { kind: 'category', name: EN ? 'Sound' : '音', colour: COLORS.sound, contents: autoTypes('sound') },
    {
      kind: 'category', name: word('調べる'), colour: COLORS.sensing,
      contents: [{ kind: 'block', type: 'sp_prop' }, { kind: 'block', type: 'sp_prop_of' }, ...autoTypes('sensing')],
    },
    {
      kind: 'category', name: word('演算'), colour: COLORS.operators,
      contents: [
        { kind: 'block', type: 'math_number' },
        { kind: 'block', type: 'text' },
        { kind: 'block', type: 'logic_boolean' },
        { kind: 'block', type: 'sp_add' }, { kind: 'block', type: 'sp_sub' },
        { kind: 'block', type: 'sp_mul' }, { kind: 'block', type: 'sp_div' },
        { kind: 'block', type: 'sp_mod' }, { kind: 'block', type: 'sp_cmp' },
        { kind: 'block', type: 'sp_and' }, { kind: 'block', type: 'sp_or' },
        { kind: 'block', type: 'sp_not' }, { kind: 'block', type: 'sp_neg' },
        { kind: 'block', type: 'sp_len' },
        ...autoTypes('operators'),
      ],
    },
    { kind: 'category', name: word('ペン'), colour: COLORS.pen, contents: autoTypes('pen') },
    {
      kind: 'category', name: EN ? 'Variables' : '変数', colour: COLORS.variables,
      contents: [
        { kind: 'block', type: 'sp_var' },
        { kind: 'block', type: 'sp_assign' },
        { kind: 'block', type: 'sp_augassign' },
        { kind: 'block', type: 'sp_name' },
        { kind: 'block', type: 'sp_showmonitor' },
      ],
    },
    {
      kind: 'category', name: EN ? 'Lists' : 'リスト', colour: COLORS.lists,
      contents: [
        { kind: 'block', type: 'sp_list' },
        { kind: 'block', type: 'lists_create_with' },
        { kind: 'block', type: 'sp_list_add' },
        { kind: 'block', type: 'sp_list_insert' },
        { kind: 'block', type: 'sp_list_delete' },
        { kind: 'block', type: 'sp_list_clear' },
        { kind: 'block', type: 'sp_replace' },
        { kind: 'block', type: 'sp_index' },
        { kind: 'block', type: 'sp_in' },
        { kind: 'block', type: 'sp_len' },
      ],
    },
    { kind: 'category', name: word('マイブロック'), colour: COLORS.myblocks, custom: 'SP_USER' } as ToolboxCat,
  ];
  return { kind: 'categoryToolbox', contents: cats as never };
}

/** マイブロックカテゴリ(動的): 定義済みカスタムブロックを並べる */
export function registerUserCategory(
  ws: Blockly.WorkspaceSvg | Blockly.Workspace,
  types: () => string[],
): void {
  (ws as Blockly.WorkspaceSvg).registerToolboxCategoryCallback?.('SP_USER', () => {
    const list = types();
    const contents: { kind: 'block'; type: string }[] = list.map(t => ({ kind: 'block', type: t }));
    if (!contents.length) {
      return [{ kind: 'label' as const, text: '「定義」ブロックを作ると\nここに並びます' }];
    }
    return contents;
  });
}
