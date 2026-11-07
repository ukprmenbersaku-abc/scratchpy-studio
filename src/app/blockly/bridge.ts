/**
 * bridge.ts — ScratchPy AST ⇔ Blockly ワークスペース 双方向変換
 *
 *  astToWorkspace(ws, program, resolutions)  : コード → ブロック
 *  workspaceToAst(ws)                        : ブロック → コード(AST)
 *
 * AST の生成には loc を付けない(printer は loc 不要)。
 * 生成された AST は printProgram で正準形テキストになり、既存の
 * パーサ/型チェッカ/エクスポータのパイプラインにそのまま乗る。
 */
import * as Blockly from 'blockly';
import type {
  Program, StageDef, SpriteDef, BodyItem, Stmt, Expr, Hat, FuncDef, EventDef,
  VarDecl, ListDecl, SPType, FuncParam, IfBranch,
} from '../../core/lang/ast';
import { T_INT, T_FLOAT, T_STR, T_BOOL, T_ANY, listOf } from '../../core/lang/ast';
import type { NameResolution } from '../../core/lang/typechecker';
import { BUILTINS } from '../../core/lang/builtins';
import { printExpr, printStmts } from '../../core/lang/printer';

// --- AST ヘルパ -------------------------------------------------------------

const num = (value: number): Expr => ({ type: 'num', value, spType: Number.isInteger(value) ? T_INT : T_FLOAT });
const str = (value: string): Expr => ({ type: 'str', value, spType: T_STR });
const bool = (value: boolean): Expr => ({ type: 'bool', value, spType: T_BOOL });
const name = (n: string): Extract<Expr, { type: 'name' }> => ({ type: 'name', name: n });
const call = (callee: string, args: Expr[]): Expr => ({ type: 'call', callee, args });

const typeFromName = (t: string): SPType => {
  switch (t) {
    case 'int': return T_INT;
    case 'float': return T_FLOAT;
    case 'str': return T_STR;
    case 'bool': return T_BOOL;
    default: return T_ANY;
  }
};

const typeToToken = (t: SPType): string => {
  if (t.kind === 'list') return `list[${t.of.kind === 'list' ? 'any' : t.of.kind}]`;
  return t.kind;
};

// --- ユーザー定義ブロック(呼び出し)の動的登録 --------------------------------

let userCallSeq = 0;
const userCallTypes = new Map<string, { defName: string; paramCount: number }>();

export function currentUserCallTypes(): string[] {
  return [...userCallTypes.keys()];
}

function registerUserCallType(defName: string, params: FuncParam[]): string {
  const type = `spu_${++userCallSeq}`;
  userCallTypes.set(type, { defName, paramCount: params.length });
  Blockly.Blocks[type] = {
    init(this: Blockly.Block) {
      this.setColour('#FF6680');
      this.setInputsInline(true);
      const row = this.appendDummyInput();
      row.appendField(defName);
      params.forEach((p, i) => {
        this.appendValueInput(`ARG${i}`).setCheck(p.paramType.kind === 'bool' ? ['Boolean'] : null);
      });
      this.setPreviousStatement(true, null);
      this.setNextStatement(true, null);
      this.setTooltip(`カスタムブロック「${defName}」を呼び出します`);
    },
  };
  return type;
}

// SVG ワークスペースでは作成直後に SVG を初期化する。
function newBlock(ws: Blockly.Workspace, type: string): Blockly.Block {
  const b = ws.newBlock(type);
  if (ws instanceof Blockly.WorkspaceSvg) (b as Blockly.BlockSvg).initSvg();
  return b;
}

// --- ヘルパ: 接続 ------------------------------------------------------------

function inputTarget(b: Blockly.Block, inputName: string): Blockly.Block | null {
  return b.getInputTargetBlock(inputName);
}

function connectChain(input: Blockly.Input, blocks: Blockly.Block[]): void {
  let prev: Blockly.Block | null = null;
  for (const blk of blocks) {
    if (prev) {
      prev.nextConnection?.connect(blk.previousConnection!);
    } else {
      input.connection!.connect(blk.previousConnection!);
    }
    prev = blk;
  }
}

function stmtChain(ws: Blockly.Workspace, stmts: Stmt[], ctx: BuildCtx): Blockly.Block[] {
  return stmts.map(s => stmtToBlock(ws, s, ctx)).filter(Boolean) as Blockly.Block[];
}

interface BuildCtx {
  resolutions?: Map<Expr, NameResolution>;
  userCallTypeOf: Map<string, string>; // defName → block type(最初の一致)
}

// --- AST → Blockly -----------------------------------------------------------

export function astToWorkspace(
  ws: Blockly.Workspace,
  program: Program,
  resolutions?: Map<Expr, NameResolution>,
): void {
  // 動的なユーザー呼び出しブロックを登録
  userCallTypes.clear();
  userCallSeq = 0;
  const userCallTypeOf = new Map<string, string>();
  const defs: FuncDef[] = [];
  const collectDefs = (body: BodyItem[]) => {
    for (const item of body) {
      if ('decl' in item && item.decl === 'def') defs.push(item as FuncDef);
    }
  };
  if (program.stage) collectDefs(program.stage.body);
  program.sprites.forEach(s => collectDefs(s.body));
  for (const d of defs) {
    if (!userCallTypeOf.has(d.name)) {
      userCallTypeOf.set(d.name, registerUserCallType(d.name, d.params));
    }
  }
  const ctx: BuildCtx = { resolutions, userCallTypeOf };

  let y = 20;
  const place = (b: Blockly.Block, x: number) => {
    if (ws instanceof Blockly.WorkspaceSvg) {
      const descendants = b.getDescendants(false).reverse();
      for (const child of descendants) (child as Blockly.BlockSvg).render();
    }
    b.moveBy(x, y);
    const hw = (b as Blockly.BlockSvg).getHeightWidth?.();
    y += (hw?.height ?? 180) + 40;
  };

  // トップレベルコメント
  for (const c of program.comments ?? []) {
    const b = newBlock(ws, 'sp_comment');
    b.setFieldValue(c.text.trim(), 'TEXT');
    place(b, 20);
  }

  // 全ターゲットの名前を先に登録し、別スプライト参照のメニューを正しく復元。
  const targets: (StageDef | SpriteDef)[] = [
    ...(program.stage ? [program.stage] : []), ...program.sprites,
  ];
  const blocks = targets.map(t => {
    const b = newBlock(ws, t.decl === 'stage' ? 'sp_stage' : 'sp_sprite');
    b.setFieldValue(t.name ?? '', 'NAME');
    return b;
  });
  targets.forEach((t, i) => {
    const items = bodyBlocks(ws, t.body, ctx);
    if (items.length) connectChain(blocks[i].getInput('BODY')!, items);
    place(blocks[i], 20);
  });
}

function bodyBlocks(ws: Blockly.Workspace, body: BodyItem[], ctx: BuildCtx): Blockly.Block[] {
  const out: Blockly.Block[] = [];
  for (const item of body) {
    if (!('decl' in item)) {
      if (item.type === 'comment') {
        const b = newBlock(ws, 'sp_comment');
        b.setFieldValue(item.text.trim(), 'TEXT');
        out.push(b);
      } else if (item.type === 'pass') {
        out.push(newBlock(ws, 'sp_pass'));
      }
      continue;
    }
    switch (item.decl) {
      case 'var': {
        const v = item as VarDecl;
        const b = newBlock(ws, 'sp_var');
        b.setFieldValue(v.name, 'NAME');
        b.setFieldValue(v.varType.kind === 'list' ? 'any' : v.varType.kind, 'TYPE');
        const init = exprToBlock(ws, v.init, ctx);
        if (init) b.getInput('INIT')!.connection!.connect(init.outputConnection!);
        if (!v.monitor) b.setFieldValue('', 'MON');
        else if (!v.monitor.visible) b.setFieldValue('hide', 'MON');
        else if (v.monitor.mode === 'slider') {
          b.setFieldValue('slider', 'MON');
          b.setFieldValue(String(v.monitor.min ?? 0), 'SLMIN');
          b.setFieldValue(String(v.monitor.max ?? 100), 'SLMAX');
        } else if (v.monitor.mode === 'large') b.setFieldValue('large', 'MON');
        else b.setFieldValue('show', 'MON');
        b.setFieldValue(v.cloud ? 'TRUE' : 'FALSE', 'CLOUD');
        out.push(b);
        break;
      }
      case 'list': {
        const l = item as ListDecl;
        const b = newBlock(ws, 'sp_list');
        b.setFieldValue(l.name, 'NAME');
        b.setFieldValue(l.varType.kind === 'list' ? (l.varType.of.kind === 'list' ? 'any' : l.varType.of.kind) : 'any', 'ELEM');
        if (l.init.length) {
          const lit = newBlock(ws, 'lists_create_with');
          try {
            (lit as unknown as { loadExtraState(s: unknown): void }).loadExtraState({ itemCount: l.init.length });
          } catch { /* fallback: 既定の3項目 */ }
          l.init.forEach((it, i) => {
            const ib = exprToBlock(ws, it, ctx);
            const inp = lit.getInput(`ADD${i}`);
            if (ib && inp?.connection) inp.connection.connect(ib.outputConnection!);
          });
          b.getInput('INIT')!.connection!.connect(lit.outputConnection!);
        }
        b.setFieldValue(l.monitor ? (l.monitor.visible ? 'show' : 'hide') : '', 'MON');
        out.push(b);
        break;
      }
      case 'costume': {
        const b = newBlock(ws, 'sp_costume');
        b.setFieldValue(item.name, 'NAME');
        out.push(b);
        break;
      }
      case 'sound': {
        const b = newBlock(ws, 'sp_sound');
        b.setFieldValue(item.name, 'NAME');
        out.push(b);
        break;
      }
      case 'config': {
        const b = newBlock(ws, 'sp_config');
        b.setFieldValue(item.key, 'KEY');
        const vb = exprToBlock(ws, item.value, ctx);
        if (vb) b.getInput('VALUE')!.connection!.connect(vb.outputConnection!);
        out.push(b);
        break;
      }
      case 'def': {
        const d = item as FuncDef;
        const b = newBlock(ws, 'sp_def');
        b.setFieldValue(d.name, 'NAME');
        b.setFieldValue(d.params.map(p => `${p.name}: ${typeToToken(p.paramType)}`).join(', '), 'PARAMS');
        b.setFieldValue(d.warp ? 'TRUE' : 'FALSE', 'WARP');
        const items = stmtChain(ws, d.body, ctx);
        if (items.length) connectChain(b.getInput('DO')!, items);
        out.push(b);
        break;
      }
      case 'event': {
        const e = item as EventDef;
        const b = hatToBlock(ws, e.hat, ctx);
        const items = stmtChain(ws, e.body, ctx);
        if (items.length) connectChain(b.getInput('DO')!, items);
        out.push(b);
        break;
      }
    }
  }
  return out;
}

function hatToBlock(ws: Blockly.Workspace, hat: Hat, ctx: BuildCtx): Blockly.Block {
  switch (hat.hat) {
    case 'flag': return newBlock(ws, 'sp_on_flag');
    case 'click': return newBlock(ws, 'sp_on_click');
    case 'clone': return newBlock(ws, 'sp_on_clone');
    case 'key': {
      const b = newBlock(ws, 'sp_on_key');
      b.setFieldValue(hat.key.type === 'str' ? hat.key.value : 'space', 'KEY');
      return b;
    }
    case 'receive': {
      const b = newBlock(ws, 'sp_on_receive');
      const mb = exprToBlock(ws, hat.msg, ctx);
      if (mb) b.getInput('MSG')!.connection!.connect(mb.outputConnection!);
      return b;
    }
    case 'greaterthan': {
      const b = newBlock(ws, 'sp_on_greater');
      b.setFieldValue(hat.sensor, 'SENSOR');
      const vb = exprToBlock(ws, hat.value, ctx);
      if (vb) b.getInput('VALUE')!.connection!.connect(vb.outputConnection!);
      return b;
    }
    case 'backdrop': {
      const b = newBlock(ws, 'sp_on_backdrop');
      const nb = exprToBlock(ws, hat.name, ctx);
      if (nb) b.getInput('NAME')!.connection!.connect(nb.outputConnection!);
      return b;
    }
  }
}

function stmtToBlock(ws: Blockly.Workspace, s: Stmt, ctx: BuildCtx): Blockly.Block | null {
  switch (s.type) {
    case 'comment': {
      const b = newBlock(ws, 'sp_comment');
      b.setFieldValue(s.text.trim(), 'TEXT');
      return b;
    }
    case 'pass': return newBlock(ws, 'sp_pass');
    case 'unsupported': {
      const b = newBlock(ws, 'sp_unsupported');
      b.setFieldValue(s.opcode, 'OPCODE');
      return b;
    }
    case 'assign': {
      if (s.target.type === 'index') {
        const b = newBlock(ws, 'sp_replace');
        b.setFieldValue(targetListName(s.target.obj), 'LIST');
        connect(b, 'INDEX', exprToBlock(ws, s.target.index, ctx));
        connect(b, 'VALUE', exprToBlock(ws, s.value, ctx));
        return b;
      }
      const b = newBlock(ws, 'sp_assign');
      b.setFieldValue(targetName(s.target), 'NAME');
      connect(b, 'VALUE', exprToBlock(ws, s.value, ctx));
      return b;
    }
    case 'augassign': {
      const b = newBlock(ws, 'sp_augassign');
      b.setFieldValue(targetName(s.target), 'NAME');
      b.setFieldValue(s.op, 'OP');
      connect(b, 'VALUE', exprToBlock(ws, s.value, ctx));
      return b;
    }
    case 'listmethod': {
      const listName = targetName(s.list);
      if (s.method === 'clear') {
        const b = newBlock(ws, 'sp_list_clear');
        b.setFieldValue(listName, 'LIST');
        return b;
      }
      if (s.method === 'add') {
        const b = newBlock(ws, 'sp_list_add');
        b.setFieldValue(listName, 'LIST');
        connect(b, 'ITEM', exprToBlock(ws, s.args[0], ctx));
        return b;
      }
      if (s.method === 'insert') {
        const b = newBlock(ws, 'sp_list_insert');
        b.setFieldValue(listName, 'LIST');
        connect(b, 'INDEX', exprToBlock(ws, s.args[0], ctx));
        connect(b, 'ITEM', exprToBlock(ws, s.args[1], ctx));
        return b;
      }
      const b = newBlock(ws, 'sp_list_delete');
      b.setFieldValue(listName, 'LIST');
      connect(b, 'INDEX', exprToBlock(ws, s.args[0], ctx));
      return b;
    }
    case 'if': {
      const b = newBlock(ws, 'controls_if');
      const elseifCount = Math.max(0, s.branches.length - (s.branches.some(br => !br.cond) ? 2 : 1));
      const hasElse = s.branches.some(br => !br.cond);
      applyIfMutation(b, elseifCount, hasElse);
      s.branches.forEach((br, i) => {
        if (br.cond) {
          connect(b, `IF${i}`, exprToBlock(ws, br.cond, ctx));
          const items = stmtChain(ws, br.body, ctx);
          if (items.length) connectChain(b.getInput(`DO${i}`)!, items);
        } else {
          const items = stmtChain(ws, br.body, ctx);
          const el = b.getInput('ELSE');
          if (el && items.length) connectChain(el, items);
        }
      });
      return b;
    }
    case 'repeat': {
      const b = newBlock(ws, 'controls_repeat_ext');
      connect(b, 'TIMES', exprToBlock(ws, s.count, ctx));
      const items = stmtChain(ws, s.body, ctx);
      if (items.length) connectChain(b.getInput('DO')!, items);
      return b;
    }
    case 'forever': {
      const b = newBlock(ws, 'sp_forever');
      const items = stmtChain(ws, s.body, ctx);
      if (items.length) connectChain(b.getInput('DO')!, items);
      return b;
    }
    case 'while': {
      const b = newBlock(ws, 'sp_while');
      connect(b, 'COND', exprToBlock(ws, s.cond, ctx));
      const items = stmtChain(ws, s.body, ctx);
      if (items.length) connectChain(b.getInput('DO')!, items);
      return b;
    }
    case 'wait': {
      const b = newBlock(ws, 'spb_wait_1');
      connect(b, 'ARG0', exprToBlock(ws, s.secs, ctx));
      return b;
    }
    case 'stop': {
      const b = newBlock(ws, 'spb_stop_1');
      b.setFieldValue(s.what, 'F0');
      return b;
    }
    case 'broadcast': {
      const b = newBlock(ws, s.wait ? 'spb_broadcast_and_wait_1' : 'spb_broadcast_1');
      connect(b, 'ARG0', exprToBlock(ws, s.msg, ctx));
      return b;
    }
    case 'clone': {
      if (s.action === 'delete') return newBlock(ws, 'spb_delete_clone_0');
      if (!s.target) return newBlock(ws, 'spb_create_clone_0');
      const b = newBlock(ws, 'spb_create_clone_1');
      fillBuiltinArgs(ws, b, 'create_clone', [s.target], ctx);
      return b;
    }
    case 'ask': {
      const b = newBlock(ws, 'spb_ask_1');
      connect(b, 'ARG0', exprToBlock(ws, s.question, ctx));
      return b;
    }
    case 'resettimer':
      return newBlock(ws, 'spb_reset_timer_0');
    case 'showmonitor': {
      const b = newBlock(ws, 'sp_showmonitor');
      b.setFieldValue(s.show ? 'show' : 'hide', 'MODE');
      b.setFieldValue(targetName(s.name), 'NAME');
      return b;
    }
    case 'exprstmt': {
      const e = s.expr;
      if (e.type === 'call') {
        const ub = ctx.userCallTypeOf.get(e.callee);
        if (ub) {
          const b = newBlock(ws, ub);
          e.args.forEach((a, i) => connect(b, `ARG${i}`, exprToBlock(ws, a, ctx)));
          return b;
        }
        const t = builtinBlockType(e.callee, e.args.length);
        if (t) {
          const b = newBlock(ws, t);
          fillBuiltinArgs(ws, b, e.callee, e.args, ctx);
          return b;
        }
      }
      // 未知の呼び出し・式 → コメントブロックで可視化(ロストを防ぐ)
      return fallbackComment(ws, s);
    }
  }
}

function fallbackComment(ws: Blockly.Workspace, s: Stmt): Blockly.Block {
  const b = newBlock(ws, 'sp_comment');
  let text = '';
  try {
    text = printStmts([s], 0).join(' ').trim();
  } catch { text = s.type; }
  b.setFieldValue(text || s.type, 'TEXT');
  return b;
}

function connect(b: Blockly.Block, inputName: string, target: Blockly.Block | null): void {
  if (!target) return;
  const inp = b.getInput(inputName);
  if (inp?.connection && target.outputConnection) {
    inp.connection.connect(target.outputConnection);
  }
}

function targetName(e: Expr): string {
  if (e.type === 'name' || e.type === 'varref' || e.type === 'listref') return e.name;
  return '';
}
function targetListName(e: Expr): string { return targetName(e); }

function builtinBlockType(callee: string, argCount: number): string | null {
  const b = BUILTINS[callee];
  if (!b) return null;
  const type = `spb_${callee}_${argCount}`;
  return Blockly.Blocks[type] ? type : null;
}

function fillBuiltinArgs(ws: Blockly.Workspace, b: Blockly.Block, callee: string, args: Expr[], ctx: BuildCtx): void {
  const def = BUILTINS[callee];
  const overload = def?.overloads.find(ov => ov.length === args.length) ?? def?.overloads[0] ?? [];
  args.forEach((a, i) => {
    const spec = overload[i];
    const ptype = spec?.type ?? 'any';
    if (ptype.startsWith('menu:') || ptype === 'color') {
      // フィールド: 文字列リテラルなら値をセット
      if (a.type === 'str') b.setFieldValue(a.value, `F${i}`);
      else if (a.type === 'color') b.setFieldValue(a.value, `F${i}`);
    } else {
      connect(b, `ARG${i}`, exprToBlock(ws, a, ctx));
    }
  });
}

function exprToBlock(ws: Blockly.Workspace, e: Expr, ctx: BuildCtx): Blockly.Block | null {
  switch (e.type) {
    case 'num': {
      const b = newBlock(ws, 'math_number');
      b.setFieldValue(String(e.value), 'NUM');
      return b;
    }
    case 'str':
    case 'color': {
      const b = newBlock(ws, 'text');
      b.setFieldValue(e.value, 'TEXT');
      return b;
    }
    case 'bool': {
      const b = newBlock(ws, 'logic_boolean');
      b.setFieldValue(e.value ? 'TRUE' : 'FALSE', 'BOOL');
      return b;
    }
    case 'listlit': {
      const b = newBlock(ws, 'lists_create_with');
      try {
        (b as unknown as { loadExtraState(s: unknown): void }).loadExtraState({ itemCount: e.items.length });
      } catch { /* ignore */ }
      e.items.forEach((it, i) => connect(b, `ADD${i}`, exprToBlock(ws, it, ctx)));
      return b;
    }
    case 'name': {
      const r = ctx.resolutions?.get(e);
      if (r?.entity === 'property') {
        const b = newBlock(ws, 'sp_prop');
        b.setFieldValue(r.prop, 'PROP');
        return b;
      }
      const b = newBlock(ws, 'sp_name');
      b.setFieldValue(e.name, 'NAME');
      return b;
    }
    case 'varref':
    case 'listref': {
      const b = newBlock(ws, 'sp_name');
      b.setFieldValue(e.name, 'NAME');
      return b;
    }
    case 'prop': {
      const b = newBlock(ws, 'sp_prop_of');
      b.setFieldValue(e.obj.type === 'name' ? e.obj.name : '', 'TARGET');
      b.setFieldValue(e.prop, 'PROP');
      return b;
    }
    case 'index': {
      const b = newBlock(ws, 'sp_index');
      b.setFieldValue(targetListName(e.obj), 'LIST');
      connect(b, 'INDEX', exprToBlock(ws, e.index, ctx));
      return b;
    }
    case 'unary': {
      const b = newBlock(ws, e.op === 'not' ? 'sp_not' : 'sp_neg');
      connect(b, 'A', exprToBlock(ws, e.operand, ctx));
      return b;
    }
    case 'binary': {
      const opMap: Record<string, string> = { '+': 'sp_add', '-': 'sp_sub', '*': 'sp_mul', '/': 'sp_div', '%': 'sp_mod' };
      if (e.op === 'in') {
        const b = newBlock(ws, 'sp_in');
        connect(b, 'ITEM', exprToBlock(ws, e.left, ctx));
        b.setFieldValue(targetListName(e.right), 'LIST');
        return b;
      }
      if (opMap[e.op]) {
        const b = newBlock(ws, opMap[e.op]);
        connect(b, 'A', exprToBlock(ws, e.left, ctx));
        connect(b, 'B', exprToBlock(ws, e.right, ctx));
        return b;
      }
      // 比較 / and / or
      const type = ['==', '!=', '<', '<=', '>', '>='].includes(e.op) ? 'sp_cmp' : e.op === 'and' ? 'sp_and' : 'sp_or';
      const b = newBlock(ws, type);
      connect(b, 'A', exprToBlock(ws, e.left, ctx));
      if (type === 'sp_cmp') b.setFieldValue(e.op, 'OP');
      connect(b, 'B', exprToBlock(ws, e.right, ctx));
      return b;
    }
    case 'call': {
      if (e.callee === 'len') {
        const b = newBlock(ws, 'sp_len');
        connect(b, 'VALUE', exprToBlock(ws, e.args[0], ctx));
        return b;
      }
      const ub = ctx.userCallTypeOf.get(e.callee);
      if (ub) {
        const b = newBlock(ws, ub);
        e.args.forEach((a, i) => connect(b, `ARG${i}`, exprToBlock(ws, a, ctx)));
        return b;
      }
      const t = builtinBlockType(e.callee, e.args.length);
      if (t) {
        const b = newBlock(ws, t);
        fillBuiltinArgs(ws, b, e.callee, e.args, ctx);
        return b;
      }
      // 未知 → テキストブロックで式を保存
      const b = newBlock(ws, 'text');
      try {
        b.setFieldValue(printExpr(e), 'TEXT');
      } catch { b.setFieldValue(e.callee, 'TEXT'); }
      return b;
    }
  }
}

function applyIfMutation(b: Blockly.Block, elseifCount: number, hasElse: boolean): void {
  if (elseifCount === 0 && !hasElse) return;
  try {
    const xml = Blockly.utils.xml.createElement('mutation');
    if (elseifCount > 0) xml.setAttribute('elseif', String(elseifCount));
    if (hasElse) xml.setAttribute('else', '1');
    const fn = (b as unknown as { domToMutation?: (x: Element) => void }).domToMutation;
    fn?.call(b, xml as unknown as Element);
  } catch { /* mutation 不可なら素の if */ }
}

// --- Blockly → AST -----------------------------------------------------------

export function workspaceToAst(ws: Blockly.Workspace): Program {
  const program: Program = { type: 'program', sprites: [], comments: [] };
  const tops = ws.getTopBlocks(true);
  for (const b of tops) {
    if (b.type === 'sp_stage') {
      if (program.stage) throw new Error('ステージは1つだけにしてください');
      program.stage = blockToStage(b);
    } else if (b.type === 'sp_sprite') {
      program.sprites.push(blockToSprite(b));
    } else if (b.type === 'sp_comment') {
      if (b.getNextBlock()) throw new Error('トップレベルのコメントには他のブロックをつなげられません');
      program.comments.push({ type: 'comment', text: ' ' + (b.getFieldValue('TEXT') ?? '').trim() });
    } else {
      throw new Error('未接続のブロックをターゲット内につなぐか削除してください');
    }
  }
  return program;
}

function blockToStage(b: Blockly.Block): StageDef {
  const nameVal = (b.getFieldValue('NAME') ?? '').trim();
  return {
    decl: 'stage',
    ...(nameVal ? { name: nameVal } : {}),
    body: inputBody(b, 'BODY'),
  };
}

function blockToSprite(b: Blockly.Block): SpriteDef {
  return {
    decl: 'sprite',
    name: (b.getFieldValue('NAME') ?? 'Sprite1').trim() || 'Sprite1',
    quoted: false,
    body: inputBody(b, 'BODY'),
  };
}

function inputBody(b: Blockly.Block, inputName: string): BodyItem[] {
  const items: BodyItem[] = [];
  let cur = inputTarget(b, inputName);
  while (cur) {
    const item = blockToBodyItem(cur);
    if (item) items.push(item);
    cur = cur.getNextBlock();
  }
  return items.length ? items : [{ type: 'pass' }];
}

function blockToBodyItem(b: Blockly.Block): BodyItem | null {
  switch (b.type) {
    case 'sp_comment':
      return { type: 'comment', text: ' ' + (b.getFieldValue('TEXT') ?? '') };
    case 'sp_pass':
      return { type: 'pass' };
    case 'sp_unsupported':
      throw new Error('未対応ブロックはターゲット直下に置けません');
    case 'sp_var': {
      const mon = b.getFieldValue('MON') ?? '';
      const decl: VarDecl = {
        decl: 'var',
        name: (b.getFieldValue('NAME') ?? '').trim(),
        quoted: false,
        varType: typeFromName(b.getFieldValue('TYPE') ?? 'any'),
        init: inputExpr(b, 'INIT'),
        cloud: b.getFieldValue('CLOUD') === 'TRUE',
      };
      if (mon === 'show') decl.monitor = { mode: 'default', visible: true };
      else if (mon === 'large') decl.monitor = { mode: 'large', visible: true };
      else if (mon === 'slider') decl.monitor = {
        mode: 'slider', visible: true,
        min: Number(b.getFieldValue('SLMIN') ?? 0),
        max: Number(b.getFieldValue('SLMAX') ?? 100),
      };
      else if (mon === 'hide') decl.monitor = { mode: 'default', visible: false };
      return decl;
    }
    case 'sp_list': {
      const mon = b.getFieldValue('MON') ?? '';
      const initBlock = inputTarget(b, 'INIT');
      const init = initBlock ? listLitFromBlock(initBlock) : [];
      return {
        decl: 'list',
        name: (b.getFieldValue('NAME') ?? '').trim(),
        quoted: false,
        varType: listOf(typeFromName(b.getFieldValue('ELEM') ?? 'any')),
        init,
        ...(mon === 'show' ? { monitor: { mode: 'list' as const, visible: true } }
          : mon === 'hide' ? { monitor: { mode: 'list' as const, visible: false } } : {}),
      } satisfies ListDecl;
    }
    case 'sp_costume':
      return { decl: 'costume', name: b.getFieldValue('NAME') ?? '' };
    case 'sp_sound':
      return { decl: 'sound', name: b.getFieldValue('NAME') ?? '' };
    case 'sp_config':
      return { decl: 'config', key: b.getFieldValue('KEY') ?? 'x', value: inputExpr(b, 'VALUE') };
    case 'sp_def': {
      const params = parseParamsText(b.getFieldValue('PARAMS') ?? '');
      return {
        decl: 'def',
        name: (b.getFieldValue('NAME') ?? '').trim(),
        params,
        warp: b.getFieldValue('WARP') === 'TRUE',
        body: inputStmts(b, 'DO'),
      } satisfies FuncDef;
    }
    case 'sp_on_flag': return event(b, { hat: 'flag' });
    case 'sp_on_click': return event(b, { hat: 'click' });
    case 'sp_on_clone': return event(b, { hat: 'clone' });
    case 'sp_on_key': return event(b, { hat: 'key', key: str(b.getFieldValue('KEY') ?? 'space') });
    case 'sp_on_receive': return event(b, { hat: 'receive', msg: inputExpr(b, 'MSG') });
    case 'sp_on_greater': return event(b, {
      hat: 'greaterthan',
      sensor: (b.getFieldValue('SENSOR') ?? 'timer') as 'timer' | 'loudness',
      value: inputExpr(b, 'VALUE'),
    });
    case 'sp_on_backdrop': return event(b, { hat: 'backdrop', name: inputExpr(b, 'NAME') });
    default:
      throw new Error(`「${b.type}」はステージやスプライトの直下には置けません。イベントの中につないでください。`);
  }
}

function event(b: Blockly.Block, hat: Hat): EventDef {
  return { decl: 'event', hat, body: inputStmts(b, 'DO') };
}

function inputStmts(b: Blockly.Block, inputName: string): Stmt[] {
  const stmts: Stmt[] = [];
  let cur = inputTarget(b, inputName);
  while (cur) {
    stmts.push(blockToStmt(cur));
    cur = cur.getNextBlock();
  }
  return stmts.length ? stmts : [{ type: 'pass' }];
}

function parseParamsText(text: string): FuncParam[] {
  if (!text.trim()) return [];
  return text.split(',').map(p => p.trim()).filter(Boolean).map(p => {
    const m = /^([^:]+):(.+)$/.exec(p);
    if (m) {
      const t = m[2].trim();
      const pt = t.startsWith('list[') ? listOf(typeFromName(t.slice(5, -1))) : typeFromName(t);
      return { name: m[1].trim(), paramType: pt };
    }
    return { name: p, paramType: T_ANY };
  });
}

function listLitFromBlock(b: Blockly.Block): Expr[] {
  if (b.type !== 'lists_create_with') throw new Error('リストの初期値にはリスト作成ブロックを使ってください');
  const items: Expr[] = [];
  let i = 0;
  for (;;) {
    const inp = b.getInput(`ADD${i}`);
    if (!inp) break;
    const t = inp.connection!.targetBlock();
    items.push(t ? blockToExpr(t) : str(''));
    i++;
  }
  return items;
}

function blockToStmt(b: Blockly.Block): Stmt {
  switch (b.type) {
    case 'sp_comment':
      return { type: 'comment', text: ' ' + (b.getFieldValue('TEXT') ?? '') };
    case 'sp_pass':
      return { type: 'pass' };
    case 'sp_unsupported':
      return { type: 'unsupported', opcode: b.getFieldValue('OPCODE') ?? 'unknown', json: '' };
    case 'sp_assign':
      return { type: 'assign', target: name(b.getFieldValue('NAME') ?? ''), value: inputExpr(b, 'VALUE') };
    case 'sp_augassign':
      return {
        type: 'augassign',
        op: (b.getFieldValue('OP') ?? '+=') as '+=' | '-=',
        target: name(b.getFieldValue('NAME') ?? ''),
        value: inputExpr(b, 'VALUE'),
      };
    case 'sp_replace':
      return {
        type: 'assign',
        target: { type: 'index', obj: name(b.getFieldValue('LIST') ?? ''), index: inputExpr(b, 'INDEX') },
        value: inputExpr(b, 'VALUE'),
      };
    case 'sp_list_add':
      return { type: 'listmethod', list: name(b.getFieldValue('LIST') ?? ''), method: 'add', args: [inputExpr(b, 'ITEM')] };
    case 'sp_list_insert':
      return { type: 'listmethod', list: name(b.getFieldValue('LIST') ?? ''), method: 'insert', args: [inputExpr(b, 'INDEX'), inputExpr(b, 'ITEM')] };
    case 'sp_list_delete':
      return { type: 'listmethod', list: name(b.getFieldValue('LIST') ?? ''), method: 'delete', args: [inputExpr(b, 'INDEX')] };
    case 'sp_list_clear':
      return { type: 'listmethod', list: name(b.getFieldValue('LIST') ?? ''), method: 'clear', args: [] };
    case 'sp_showmonitor':
      return {
        type: 'showmonitor',
        name: name(b.getFieldValue('NAME') ?? ''),
        show: b.getFieldValue('MODE') === 'show',
      };
    case 'controls_if': {
      const elseifCount: number = (b as unknown as { elseifCount_?: number }).elseifCount_ ?? 0;
      const elseCount: number = (b as unknown as { elseCount_?: number }).elseCount_ ?? 0;
      const branches: IfBranch[] = [];
      for (let i = 0; i <= elseifCount; i++) {
        branches.push({ cond: inputExpr(b, `IF${i}`), body: inputStmtsOrEmpty(b, `DO${i}`) });
      }
      if (elseCount > 0) {
        branches.push({ body: inputStmtsOrEmpty(b, 'ELSE') });
      }
      return { type: 'if', branches };
    }
    case 'controls_repeat_ext':
      return { type: 'repeat', count: inputExpr(b, 'TIMES'), body: inputStmtsOrEmpty(b, 'DO') };
    case 'sp_forever':
      return { type: 'forever', body: inputStmtsOrEmpty(b, 'DO') };
    case 'sp_while':
      return { type: 'while', cond: inputExpr(b, 'COND'), body: inputStmtsOrEmpty(b, 'DO') };
    case 'spb_wait_1':
      return { type: 'wait', secs: inputExpr(b, 'ARG0') };
    case 'spb_stop_1':
      return { type: 'stop', what: (b.getFieldValue('F0') || 'all') as 'all' | 'this script' | 'other scripts' };
    case 'spb_broadcast_1':
      return { type: 'broadcast', msg: inputExpr(b, 'ARG0'), wait: false };
    case 'spb_broadcast_and_wait_1':
      return { type: 'broadcast', msg: inputExpr(b, 'ARG0'), wait: true };
    case 'spb_create_clone_0':
      return { type: 'clone', action: 'create' };
    case 'spb_create_clone_1':
      return { type: 'clone', action: 'create', target: builtinArgs(b, 'create_clone', 1)[0] };
    case 'spb_delete_clone_0':
      return { type: 'clone', action: 'delete' };
    case 'spb_ask_1':
      return { type: 'ask', question: inputExpr(b, 'ARG0') };
    case 'spb_reset_timer_0':
      return { type: 'resettimer' };
    default: {
      // ユーザー定義呼び出し
      const u = userCallTypes.get(b.type);
      if (u) {
        const args: Expr[] = [];
        for (let i = 0; i < u.paramCount; i++) args.push(inputExpr(b, `ARG${i}`));
        return { type: 'exprstmt', expr: call(u.defName, args) };
      }
      // 組み込み呼び出し spb_<name>_<arity>
      const m = /^spb_(.+)_(\d+)$/.exec(b.type);
      if (m && BUILTINS[m[1]]) {
        const args = builtinArgs(b, m[1], Number(m[2]));
        return { type: 'exprstmt', expr: call(m[1], args) };
      }
      // レポータを文として使用
      const e = blockToExpr(b);
      return { type: 'exprstmt', expr: e };
    }
  }
}

function inputStmtsOrEmpty(b: Blockly.Block, inputName: string): Stmt[] {
  const stmts: Stmt[] = [];
  let cur = inputTarget(b, inputName);
  while (cur) {
    stmts.push(blockToStmt(cur));
    cur = cur.getNextBlock();
  }
  return stmts.length ? stmts : [{ type: 'pass' }];
}

function builtinArgs(b: Blockly.Block, callee: string, arity: number): Expr[] {
  const def = BUILTINS[callee];
  const overload = def?.overloads.find(ov => ov.length === arity) ?? def?.overloads[0] ?? [];
  const args: Expr[] = [];
  for (let i = 0; i < arity; i++) {
    const ptype = overload[i]?.type ?? 'any';
    if (ptype.startsWith('menu:')) {
      args.push(str(b.getFieldValue(`F${i}`) ?? ''));
    } else if (ptype === 'color') {
      const v = b.getFieldValue(`F${i}`) ?? '#ff0000';
      args.push(/^#[0-9a-fA-F]{6}$/.test(v)
        ? { type: 'color', value: v.toLowerCase(), spType: T_STR }
        : str(v));
    } else {
      args.push(inputExpr(b, `ARG${i}`));
    }
  }
  return args;
}

/** 未接続入力の既定値(Scratch 準拠: 数値=0 / 文字列="" / 真偽=false) */
function emptyDefault(input: Blockly.Input): Expr {
  const checks = input.connection!.getCheck();
  if (checks?.length === 1 && checks[0] === 'Boolean') return bool(false);
  if (checks?.includes('Number') && !checks.includes('String')) return num(0);
  return str('');
}

function inputExpr(b: Blockly.Block, inputName: string): Expr {
  const inp = b.getInput(inputName);
  if (!inp) return str('');
  const t = inp.connection!.targetBlock();
  return t ? blockToExpr(t) : emptyDefault(inp);
}

function blockToExpr(b: Blockly.Block): Expr {
  switch (b.type) {
    case 'math_number': {
      const v = parseFloat(b.getFieldValue('NUM') ?? '0');
      return num(Number.isFinite(v) ? v : 0);
    }
    case 'math_angle': {
      const v = parseFloat(b.getFieldValue('ANGLE') ?? '90');
      return num(Number.isFinite(v) ? v : 0);
    }
    case 'text':
      return str(b.getFieldValue('TEXT') ?? '');
    case 'logic_boolean':
      return bool(b.getFieldValue('BOOL') === 'TRUE');
    case 'lists_create_with':
      return { type: 'listlit', items: listLitFromBlock(b) };
    case 'sp_name':
      return name(b.getFieldValue('NAME') ?? '');
    case 'sp_prop':
      return name(b.getFieldValue('PROP') ?? 'x');
    case 'sp_prop_of':
      return { type: 'prop', obj: name(b.getFieldValue('TARGET') ?? 'stage'), prop: b.getFieldValue('PROP') ?? 'x' };
    case 'sp_index':
      return { type: 'index', obj: name(b.getFieldValue('LIST') ?? ''), index: inputExpr(b, 'INDEX') };
    case 'sp_len':
      return call('len', [inputExpr(b, 'VALUE')]);
    case 'sp_in':
      return { type: 'binary', op: 'in', left: inputExpr(b, 'ITEM'), right: name(b.getFieldValue('LIST') ?? '') };
    case 'sp_add': return { type: 'binary', op: '+', left: inputExpr(b, 'A'), right: inputExpr(b, 'B') };
    case 'sp_sub': return { type: 'binary', op: '-', left: inputExpr(b, 'A'), right: inputExpr(b, 'B') };
    case 'sp_mul': return { type: 'binary', op: '*', left: inputExpr(b, 'A'), right: inputExpr(b, 'B') };
    case 'sp_div': return { type: 'binary', op: '/', left: inputExpr(b, 'A'), right: inputExpr(b, 'B') };
    case 'sp_mod': return { type: 'binary', op: '%', left: inputExpr(b, 'A'), right: inputExpr(b, 'B') };
    case 'sp_cmp':
      return {
        type: 'binary',
        op: (b.getFieldValue('OP') ?? '==') as '==',
        left: inputExpr(b, 'A'),
        right: inputExpr(b, 'B'),
      };
    case 'sp_and': return { type: 'binary', op: 'and', left: inputExpr(b, 'A'), right: inputExpr(b, 'B') };
    case 'sp_or': return { type: 'binary', op: 'or', left: inputExpr(b, 'A'), right: inputExpr(b, 'B') };
    case 'sp_not': return { type: 'unary', op: 'not', operand: inputExpr(b, 'A') };
    case 'sp_neg': return { type: 'unary', op: '-', operand: inputExpr(b, 'A') };
    default: {
      const u = userCallTypes.get(b.type);
      if (u) {
        const args: Expr[] = [];
        for (let i = 0; i < u.paramCount; i++) args.push(inputExpr(b, `ARG${i}`));
        return call(u.defName, args);
      }
      const m = /^spb_(.+)_(\d+)$/.exec(b.type);
      if (m && BUILTINS[m[1]]) return call(m[1], builtinArgs(b, m[1], Number(m[2])));
      throw new Error(`式ブロック「${b.type}」はコードに変換できません`);
    }
  }
}
