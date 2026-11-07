/**
 * Scratch 3.0 (.sb3) project.json データモデル
 * ----------------------------------------------
 * .sb3 = ZIP アーカイブ:
 *   - project.json  … プロジェクト全体の構造(このファイルの型で表現)
 *   - <md5>.svg / <md5>.png …  costume(画像)アセット
 *   - <md5>.wav / <md5>.mp3 … sound(音声)アセット
 *
 * blocks は「ブロックグラフ」: 各ブロックが id をキーに持ち、
 * next/parent で連結、inputs で子ブロックやリテラルを参照する。
 */

// --- 入力(input)のリテラルエンコーディング --------------------------------
export const enum LiteralKind {
  MathNumber = 4,          // 数値
  MathPositiveNumber = 5,  // 正の数
  MathInteger = 6,         // 整数
  MathAngle = 8,           // 角度
  Color = 9,               // 色 "#rrggbb"
  Text = 10,               // 文字列
  Broadcast = 11,          // [11, name, id]
  Variable = 12,           // [12, name, id]
  List = 13,               // [13, name, id]
}

/** input の値: ブロックID(string) | リテラル配列 | [shadowed] */
export type InputValue =
  | string                                     // サブスタック/ブロック参照
  | [number, string | number]                  // リテラル [kind, value]
  | [number, string, string]                   // broadcast/variable/list [kind, name, id]
  | [1 | 2 | 3, string | InputValue]           // [mode, value]
  | [3, string | InputValue, InputValue | null]; // [3, block, shadow]

export type BlockInput =
  | [1, InputValue]                    // shadow のみ(リテラル or shadow ブロック)
  | [2, string]                        // 実ブロックのみ(shadow なし: SUBSTACK 等)
  | [3, string | InputValue, InputValue | null]; // 実ブロック + shadow

export type BlockField = [string | number, string | null] | [string | number, string | null, boolean?];
export type FieldLike = [string | number, string | null, ...unknown[]];

export interface BlockMutation {
  tagName: 'mutation';
  children: unknown[];
  [key: string]: unknown; // proccode, argumentids, argumentnames, argumentdefaults, warp, hasnext …
}

export interface SB3Block {
  opcode: string;
  next: string | null;
  parent: string | null;
  inputs: Record<string, BlockInput>;
  fields: Record<string, BlockField>;
  shadow: boolean;
  topLevel: boolean;
  x?: number;
  y?: number;
  mutation?: BlockMutation;
}

export interface SB3Costume {
  name: string;
  bitmapResolution?: number;
  dataFormat: 'svg' | 'png';
  assetId: string;          // md5 (拡張子なし)
  md5ext: string;           // md5 + '.' + dataFormat
  rotationCenterX: number;
  rotationCenterY: number;
}

export interface SB3Sound {
  name: string;
  assetId: string;
  dataFormat: 'wav' | 'mp3';
  format?: string;          // '' | 'adpcm'
  rate: number;
  sampleCount: number;
  md5ext: string;
}

export interface SB3Target {
  isStage: boolean;
  name: string;
  variables: Record<string, [string, string | number, boolean?]>;   // id → [name, value, isCloud?]
  lists: Record<string, [string, (string | number | boolean)[]]>;    // id → [name, items]
  broadcasts: Record<string, string>;                            // id → name
  blocks: Record<string, SB3Block>;
  comments?: Record<string, SB3Comment>;
  currentCostume: number;
  costumes: SB3Costume[];
  sounds: SB3Sound[];
  volume: number;
  layerOrder: number;
  // stage のみ
  tempo?: number;
  videoTransparency?: number;
  videoState?: 'on' | 'off' | 'on-flipped';
  textToSpeechLanguage?: string | null;
  // sprite のみ
  visible?: boolean;
  x?: number;
  y?: number;
  size?: number;
  direction?: number;
  draggable?: boolean;
  rotationStyle?: 'all around' | 'left-right' | "don't rotate";
}

export interface SB3Comment {
  blockId?: string | null;
  x?: number; y?: number;
  width?: number; height?: number;
  minimized?: boolean;
  text: string;
}

export interface SB3Monitor {
  id: string;
  mode: 'default' | 'large' | 'slider' | 'list';
  opcode: string;           // data_variable / data_listcontents / motion_xposition …
  params: Record<string, string>;
  spriteName: string | null;
  value: unknown;
  width?: number; height?: number;
  x?: number; y?: number;
  visible: boolean;
  min?: number; max?: number;   // slider
  sliderMin?: number; sliderMax?: number;
  isDiscrete?: boolean;
}

export interface SB3Project {
  targets: SB3Target[];
  monitors: SB3Monitor[];
  extensions: string[];
  meta: {
    semver: string;
    vm: string;
    agent: string;
  };
}

// --- ハットブロック一覧(スクリプトの先頭になる opcode) ---------------------
export const HAT_OPCODES = new Set([
  'event_whenflagclicked',
  'event_whenkeypressed',
  'event_whenthisspriteclicked',
  'event_whenbackdropswitchesto',
  'event_whengreaterthan',
  'event_whenbroadcastreceived',
  'event_whenstartasclone',
  'control_start_as_clone',   // 旧形式(互換)
  'procedures_definition',
]);

/** ブロックが値を返すレポータかどうかの簡易判定(opcode 命名規則 + 既知リスト) */
export const KNOWN_REPORTERS = new Set([
  'motion_xposition', 'motion_yposition', 'motion_direction',
  'looks_size', 'looks_costumenumber', 'looks_costumename',
  'looks_backdropnumber', 'looks_backdropname',
  'sound_volume',
  'sensing_touchingobject', 'sensing_touchingcolor', 'sensing_coloristouchingcolor',
  'sensing_distanceto', 'sensing_answer', 'sensing_keypressed', 'sensing_mousedown',
  'sensing_mousex', 'sensing_mousey', 'sensing_setdragmode',
  'sensing_loudness', 'sensing_timer', 'sensing_of', 'sensing_current',
  'sensing_dayssince2000', 'sensing_username', 'sensing_dragging',
  'operator_add', 'operator_subtract', 'operator_multiply', 'operator_divide',
  'operator_random', 'operator_gt', 'operator_lt', 'operator_equals',
  'operator_and', 'operator_or', 'operator_not', 'operator_join',
  'operator_letter_of', 'operator_length', 'operator_contains',
  'operator_mod', 'operator_round', 'operator_mathop',
  'data_itemoflist', 'data_lengthoflist', 'data_listcontainsitem',
  'argument_reporter_string_number', 'argument_reporter_boolean',
]);

export function isReporterOpcode(op: string): boolean {
  return KNOWN_REPORTERS.has(op);
}
