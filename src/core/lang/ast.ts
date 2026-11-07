/**
 * ScratchPy 抽象構文木 (AST) 定義
 * --------------------------------
 * ScratchPy は「Python 風 + 静的型付け」の Scratch 相互変換用テキスト言語。
 * この AST が パーサ / 型チェッカ / プリンタ / sb3 エクスポータ / sb3 インポータ
 * の全てが共有する中間表現となる。
 */

// ---------------------------------------------------------------------------
// 型システム
// ---------------------------------------------------------------------------
export type PrimitiveTypeKind = 'int' | 'float' | 'str' | 'bool' | 'any';

export type SPType =
  | { kind: PrimitiveTypeKind }
  | { kind: 'list'; of: SPType };

export const T_INT: SPType = { kind: 'int' };
export const T_FLOAT: SPType = { kind: 'float' };
export const T_STR: SPType = { kind: 'str' };
export const T_BOOL: SPType = { kind: 'bool' };
export const T_ANY: SPType = { kind: 'any' };
export const listOf = (of: SPType): SPType => ({ kind: 'list', of });

export function typeToString(t: SPType): string {
  if (t.kind === 'list') return `list[${typeToString(t.of)}]`;
  return t.kind;
}

// ---------------------------------------------------------------------------
// 位置情報 / 診断
// ---------------------------------------------------------------------------
export interface Loc {
  line: number;   // 1-based
  col: number;    // 1-based
  endLine?: number;
  endCol?: number;
}

export type Severity = 'error' | 'warning' | 'info';

export interface Diagnostic {
  severity: Severity;
  message: string;   // 日本語メッセージ
  loc?: Loc;
  code?: string;
}

// ---------------------------------------------------------------------------
// 式 (Expression)
// ---------------------------------------------------------------------------
export type Expr =
  | NumLit
  | StrLit
  | BoolLit
  | ColorLit
  | NameExpr
  | UnaryExpr
  | BinaryExpr
  | CallExpr
  | IndexExpr
  | PropExpr
  | ListLitExpr
  | VarRefExpr   // var("特殊 名前")
  | ListRefExpr; // list("特殊 名前")

export interface NumLit { type: 'num'; value: number; loc?: Loc; spType: SPType } // int or float
export interface StrLit { type: 'str'; value: string; loc?: Loc; spType: SPType }
export interface BoolLit { type: 'bool'; value: boolean; loc?: Loc; spType: SPType }
export interface ColorLit { type: 'color'; value: string; loc?: Loc; spType: SPType } // "#rrggbb"
export interface NameExpr { type: 'name'; name: string; loc?: Loc; spType?: SPType }
export interface UnaryExpr { type: 'unary'; op: '-' | 'not'; operand: Expr; loc?: Loc; spType?: SPType }
export type BinOp = '+' | '-' | '*' | '/' | '%' | '==' | '!=' | '<' | '<=' | '>' | '>=' | 'and' | 'or' | 'in';
export interface BinaryExpr { type: 'binary'; op: BinOp; left: Expr; right: Expr; loc?: Loc; spType?: SPType }
export interface CallExpr {
  type: 'call';
  callee: string;
  args: Expr[];
  /** メソッド呼び出し形式 obj.name(args) の場合、obj とメソッド名 */
  method?: { obj: Expr; name: string };
  loc?: Loc;
  spType?: SPType;
}
export interface IndexExpr { type: 'index'; obj: Expr; index: Expr; loc?: Loc; spType?: SPType }
export interface PropExpr { type: 'prop'; obj: Expr; prop: string; loc?: Loc; spType?: SPType }
export interface ListLitExpr { type: 'listlit'; items: Expr[]; loc?: Loc; spType?: SPType }
/** 引用符付き変数名を値として参照: var("my var") */
export interface VarRefExpr { type: 'varref'; name: string; loc?: Loc; spType?: SPType }
/** 引用符付きリスト名を値として参照: list("my list") */
export interface ListRefExpr { type: 'listref'; name: string; loc?: Loc; spType?: SPType }

// ---------------------------------------------------------------------------
// 文 (Statement)
// ---------------------------------------------------------------------------
export type Stmt =
  | AssignStmt
  | AugAssignStmt
  | ExprStmt
  | ListMethodStmt
  | WaitStmt
  | RepeatStmt
  | ForeverStmt
  | WhileStmt
  | IfStmt
  | StopStmt
  | BroadcastStmt
  | CloneStmt
  | AskStmt
  | ResetTimerStmt
  | ShowMonitorStmt
  | PassStmt
  | CommentStmt
  | RawUnsupportedStmt;

export interface AssignStmt { type: 'assign'; target: NameExpr | VarRefExpr | IndexExpr | PropExpr; value: Expr; loc?: Loc }
export interface AugAssignStmt { type: 'augassign'; op: '+=' | '-='; target: NameExpr | VarRefExpr; value: Expr; loc?: Loc }
export interface ExprStmt { type: 'exprstmt'; expr: Expr; loc?: Loc }
/** items.add(x) / items.insert(i,x) / items.delete(i) / items.clear() */
export interface ListMethodStmt {
  type: 'listmethod';
  list: NameExpr | ListRefExpr;
  method: 'add' | 'insert' | 'delete' | 'clear';
  args: Expr[];
  loc?: Loc;
}
export interface WaitStmt { type: 'wait'; secs: Expr; loc?: Loc }
export interface RepeatStmt { type: 'repeat'; count: Expr; body: Stmt[]; loc?: Loc }
export interface ForeverStmt { type: 'forever'; body: Stmt[]; loc?: Loc }
export interface WhileStmt { type: 'while'; cond: Expr; body: Stmt[]; loc?: Loc }
export interface IfBranch { cond?: Expr; body: Stmt[]; loc?: Loc }
export interface IfStmt { type: 'if'; branches: IfBranch[]; loc?: Loc }
export interface StopStmt { type: 'stop'; what: 'all' | 'this script' | 'other scripts'; loc?: Loc }
export interface BroadcastStmt { type: 'broadcast'; msg: Expr; wait: boolean; loc?: Loc }
export interface CloneStmt { type: 'clone'; action: 'create' | 'delete'; target?: Expr; loc?: Loc }
export interface AskStmt { type: 'ask'; question: Expr; loc?: Loc }
export interface ResetTimerStmt { type: 'resettimer'; loc?: Loc }
/** show(x) / hide(x) — 変数・リストのモニタ表示 */
export interface ShowMonitorStmt { type: 'showmonitor'; name: NameExpr | VarRefExpr | ListRefExpr; show: boolean; loc?: Loc }
export interface PassStmt { type: 'pass'; loc?: Loc }
export interface CommentStmt { type: 'comment'; text: string; loc?: Loc }
/** 変換できなかった Scratch ブロック(情報保持用・再エクスポート時はコメント化) */
export interface RawUnsupportedStmt {
  type: 'unsupported';
  opcode: string;
  json: string; // 元ブロックの JSON 文字列(参考情報)
  loc?: Loc;
}

// ---------------------------------------------------------------------------
// 宣言
// ---------------------------------------------------------------------------
export type MonitorMode = 'default' | 'large' | 'slider' | 'list';

export interface VarDecl {
  decl: 'var';
  name: string;         // 表示名(引用符は外した形)
  quoted: boolean;      // 元が "..." 引用だったか
  varType: SPType;
  init: Expr;
  cloud: boolean;
  monitor?: { mode: MonitorMode; min?: number; max?: number; visible: boolean };
  loc?: Loc;
}

export interface ListDecl {
  decl: 'list';
  name: string;
  quoted: boolean;
  varType: SPType;      // list[T]
  init: Expr[];
  monitor?: { mode: 'list'; visible: boolean };
  loc?: Loc;
}

export interface CostumeDecl { decl: 'costume'; name: string; loc?: Loc }
export interface SoundDecl { decl: 'sound'; name: string; loc?: Loc }
export interface ConfigDecl { decl: 'config'; key: string; value: Expr; loc?: Loc }

/** イベントハット */
export type Hat =
  | { hat: 'flag'; loc?: Loc }
  | { hat: 'key'; key: Expr; loc?: Loc }
  | { hat: 'click'; loc?: Loc }
  | { hat: 'clone'; loc?: Loc }
  | { hat: 'receive'; msg: Expr; loc?: Loc }
  | { hat: 'greaterthan'; sensor: 'timer' | 'loudness'; value: Expr; loc?: Loc }
  | { hat: 'backdrop'; name: Expr; loc?: Loc };

export interface EventDef {
  decl: 'event';
  hat: Hat;
  body: Stmt[];
  loc?: Loc;
}

export interface FuncParam { name: string; paramType: SPType; loc?: Loc }

export interface FuncDef {
  decl: 'def';
  name: string;
  params: FuncParam[];
  warp: boolean;
  body: Stmt[];
  loc?: Loc;
}

export type BodyItem =
  | VarDecl | ListDecl | CostumeDecl | SoundDecl | ConfigDecl
  | EventDef | FuncDef | CommentStmt | PassStmt;

export interface SpriteDef {
  decl: 'sprite';
  name: string;
  quoted: boolean;
  body: BodyItem[];
  loc?: Loc;
}

export interface StageDef {
  decl: 'stage';
  /** ステージ名(省略時 "Stage")。日本語 Scratch では "ステージ" になることがある */
  name?: string;
  quoted?: boolean;
  body: BodyItem[];
  loc?: Loc;
}

export interface Program {
  type: 'program';
  stage?: StageDef;
  sprites: SpriteDef[];
  comments: CommentStmt[]; // ファイル冒頭のコメント等
}

// ---------------------------------------------------------------------------
// ヘルパ
// ---------------------------------------------------------------------------
export function isSupportedStmtForBody(item: BodyItem): boolean {
  return true;
}

export function hatToString(hat: Hat): string {
  switch (hat.hat) {
    case 'flag': return 'on flag';
    case 'key': return `on key ${exprToSource(hat.key)}`;
    case 'click': return 'on click';
    case 'clone': return 'on clone';
    case 'receive': return `on receive ${exprToSource(hat.msg)}`;
    case 'greaterthan': return `on ${hat.sensor} > ${exprToSource(hat.value)}`;
    case 'backdrop': return `on backdrop ${exprToSource(hat.name)}`;
  }
}

/** 式を canonical なソース文字列に戻す(軽い表示用) */
export function exprToSource(e: Expr): string {
  switch (e.type) {
    case 'num': return String(e.value);
    case 'str': return JSON.stringify(e.value);
    case 'bool': return e.value ? 'true' : 'false';
    case 'color': return `"${e.value}"`;
    case 'name': return e.name;
    case 'varref': return `var(${JSON.stringify(e.name)})`;
    case 'listref': return `list(${JSON.stringify(e.name)})`;
    case 'unary': return e.op === 'not' ? `not ${exprToSource(e.operand)}` : `-${exprToSource(e.operand)}`;
    case 'binary': return `${exprToSource(e.left)} ${e.op} ${exprToSource(e.right)}`;
    case 'call': return `${e.callee}(${e.args.map(exprToSource).join(', ')})`;
    case 'index': return `${exprToSource(e.obj)}[${exprToSource(e.index)}]`;
    case 'prop': return `${exprToSource(e.obj)}.${e.prop}`;
    case 'listlit': return `[${e.items.map(exprToSource).join(', ')}]`;
  }
}
