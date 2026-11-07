/**
 * ScratchPy プリンタ: AST → canonical なソーステキスト
 * ----------------------------------------------------
 * インポータ(.sb3 → AST)の出力や「整形」機能に使う。
 * 同じ AST から常に同じテキストが生成される(冪等)ことを保証する。
 */

import {
  Program, SpriteDef, StageDef, BodyItem, VarDecl, ListDecl, Stmt, Expr,
  EventDef, FuncDef, Hat, IfStmt, typeToString, ConfigDecl, CostumeDecl,
  SoundDecl, CommentStmt, PassStmt,
} from './ast';

const INDENT = '    ';

export function printProgram(program: Program): string {
  const out: string[] = [];
  for (const c of program.comments) out.push(`#${c.text}`);
  if (program.comments.length && (program.stage || program.sprites.length)) out.push('');
  if (program.stage) {
    out.push(...printStage(program.stage));
    if (program.sprites.length) out.push('');
  }
  program.sprites.forEach((sp, i) => {
    out.push(...printSprite(sp));
    if (i < program.sprites.length - 1) out.push('');
  });
  out.push('');
  return out.join('\n');
}

function nameOrQuoted(name: string, quoted: boolean): string {
  if (quoted) return JSON.stringify(name);
  return name;
}

function needsQuote(name: string): boolean {
  return !/^[\p{L}\p{Nl}_][\p{L}\p{Nl}\p{Mn}\p{Mc}\p{Nd}\p{Pc}_]*$/u.test(name);
}

function displayName(name: string, quoted: boolean): string {
  return needsQuote(name) ? JSON.stringify(name) : (quoted ? name : name);
}

function printStage(stage: StageDef): string[] {
  const out = [stage.name ? `stage ${displayName(stage.name, stage.quoted ?? false)}:` : 'stage:'];
  const body = printBody(stage.body, 1);
  out.push(...(body.length ? body : [INDENT + 'pass']));
  return out;
}

function printSprite(sp: SpriteDef): string[] {
  const out = [`sprite ${displayName(sp.name, sp.quoted)}:`];
  const body = printBody(sp.body, 1);
  out.push(...(body.length ? body : [INDENT + 'pass']));
  return out;
}

function printBody(body: BodyItem[], depth: number): string[] {
  const out: string[] = [];
  const pad = INDENT.repeat(depth);
  const hasDecl = (b: BodyItem): b is Exclude<BodyItem, CommentStmt | PassStmt> => 'decl' in b;
  const declOf = (b: BodyItem): string | null => (hasDecl(b) ? b.decl : null);
  // 順序: comment → config → var/list → costume/sound → def → event (読みやすさ重視の canonical 順)
  const configs = body.filter(b => declOf(b) === 'config') as ConfigDecl[];
  const vars = body.filter(b => declOf(b) === 'var' || declOf(b) === 'list') as (VarDecl | ListDecl)[];
  const assets = body.filter(b => declOf(b) === 'costume' || declOf(b) === 'sound') as (CostumeDecl | SoundDecl)[];
  const defs = body.filter(b => declOf(b) === 'def') as FuncDef[];
  const events = body.filter(b => declOf(b) === 'event') as EventDef[];
  const comments = body.filter((b): b is CommentStmt => !hasDecl(b) && b.type === 'comment');

  for (const c of comments) out.push(pad + '#' + c.text);
  for (const c of configs) out.push(pad + `${c.key}: ${printExpr(c.value)}`);
  for (const v of vars) out.push(pad + printVarDecl(v));
  for (const a of assets) out.push(pad + `${a.decl} ${displayName(a.name, false)}`);
  let first = true;
  for (const d of defs) {
    if (!first) out.push('');
    first = false;
    out.push(...printDef(d, depth));
  }
  first = defs.length === 0 && (configs.length + vars.length + assets.length + comments.length) === 0;
  for (const e of events) {
    if (!first) out.push('');
    first = false;
    out.push(...printEvent(e, depth));
  }
  // 実行可能要素がコメントだけの本体も pass を補って再パース可能にする
  if (!configs.length && !vars.length && !assets.length && !defs.length && !events.length) {
    out.push(pad + 'pass');
  }
  return out;
}

function printVarDecl(v: VarDecl | ListDecl): string {
  if (v.decl === 'var') {
    let s = `var ${displayName(v.name, v.quoted)}: ${typeToString(v.varType)} = ${printExpr(v.init)}`;
    if (v.cloud) s += ' @cloud';
    if (v.monitor) {
      if (v.monitor.visible) {
        if (v.monitor.mode === 'slider') s += ` @show(slider, ${v.monitor.min ?? 0}, ${v.monitor.max ?? 100})`;
        else if (v.monitor.mode !== 'default') s += ` @show(${v.monitor.mode})`;
        else s += ' @show';
      } else {
        s += ' @hide';
      }
    }
    return s;
  } else {
    let s = `list ${displayName(v.name, v.quoted)}: ${typeToString(v.varType)} = [${v.init.map(printExpr).join(', ')}]`;
    if (v.monitor) s += v.monitor.visible ? ' @show' : ' @hide';
    return s;
  }
}

function printDef(d: FuncDef, depth: number): string[] {
  const pad = INDENT.repeat(depth);
  const out: string[] = [];
  if (d.warp) out.push(pad + '@warp');
  const params = d.params.map(p => `${p.name}: ${typeToString(p.paramType)}`).join(', ');
  out.push(pad + `def ${d.name}(${params}):`);
  const body = printStmts(d.body, depth + 1);
  out.push(...(body.length ? body : [INDENT.repeat(depth + 1) + 'pass']));
  return out;
}

function printEvent(e: EventDef, depth: number): string[] {
  const pad = INDENT.repeat(depth);
  const out = [pad + printHat(e.hat) + ':'];
  const body = printStmts(e.body, depth + 1);
  out.push(...(body.length ? body : [INDENT.repeat(depth + 1) + 'pass']));
  return out;
}

export function printHat(hat: Hat): string {
  switch (hat.hat) {
    case 'flag': return 'on flag';
    case 'key': return `on key ${printExpr(hat.key)}`;
    case 'click': return 'on click';
    case 'clone': return 'on clone';
    case 'receive': return `on receive ${printExpr(hat.msg)}`;
    case 'greaterthan': return `on ${hat.sensor} > ${printExpr(hat.value)}`;
    case 'backdrop': return `on backdrop ${printExpr(hat.name)}`;
  }
}

export function printStmts(stmts: Stmt[], depth: number): string[] {
  const pad = INDENT.repeat(depth);
  const out: string[] = [];
  for (const s of stmts) out.push(...printStmt(s, depth, pad));
  // コメントだけの本体は再パースできない(インデントが無くなる)ため pass を補う
  const hasExec = stmts.some(s => s.type !== 'comment' && s.type !== 'unsupported');
  if (!hasExec) out.push(pad + 'pass');
  return out;
}

function printStmt(s: Stmt, depth: number, pad: string): string[] {
  switch (s.type) {
    case 'comment': return [pad + '#' + s.text];
    case 'pass': return [pad + 'pass'];
    case 'unsupported': return [pad + `# [変換不可ブロック] opcode=${s.opcode} (このブロックは .sb3 再出力時に失われます)`];
    case 'assign': return [pad + `${printAssignTarget(s.target)} = ${printExpr(s.value)}`];
    case 'augassign': return [pad + `${printAssignTarget(s.target)} ${s.op} ${printExpr(s.value)}`];
    case 'exprstmt': return [pad + printExpr(s.expr)];
    case 'listmethod': {
      const listName = s.list.type === 'name' ? s.list.name : `list(${JSON.stringify(s.list.name)})`;
      return [pad + `${listName}.${s.method}(${s.args.map(printExpr).join(', ')})`];
    }
    case 'wait': return [pad + `wait(${printExpr(s.secs)})`];
    case 'repeat': {
      const out = [pad + `repeat ${printExpr(s.count)}:`];
      const body = printStmts(s.body, depth + 1);
      out.push(...(body.length ? body : [INDENT.repeat(depth + 1) + 'pass']));
      return out;
    }
    case 'forever': {
      const out = [pad + 'forever:'];
      const body = printStmts(s.body, depth + 1);
      out.push(...(body.length ? body : [INDENT.repeat(depth + 1) + 'pass']));
      return out;
    }
    case 'while': {
      const out = [pad + `while ${printExpr(s.cond)}:`];
      const body = printStmts(s.body, depth + 1);
      out.push(...(body.length ? body : [INDENT.repeat(depth + 1) + 'pass']));
      return out;
    }
    case 'if': {
      const out: string[] = [];
      s.branches.forEach((b, i) => {
        const head = i === 0 ? 'if' : b.cond ? 'elif' : 'else';
        out.push(pad + (b.cond ? `${head} ${printExpr(b.cond)}:` : `${head}:`));
        const body = printStmts(b.body, depth + 1);
        out.push(...(body.length ? body : [INDENT.repeat(depth + 1) + 'pass']));
      });
      return out;
    }
    case 'stop': return [pad + `stop(${JSON.stringify(s.what)})`];
    case 'broadcast': return [pad + `${s.wait ? 'broadcast_and_wait' : 'broadcast'}(${printExpr(s.msg)})`];
    case 'clone':
      if (s.action === 'delete') return [pad + 'delete_clone()'];
      return [pad + (s.target ? `create_clone(${printExpr(s.target)})` : 'create_clone()')];
    case 'ask': return [pad + `ask(${printExpr(s.question)})`];
    case 'resettimer': return [pad + 'reset_timer()'];
    case 'showmonitor': {
      const n = s.name.type === 'name' ? s.name.name : (s.name.type === 'varref' ? `var(${JSON.stringify(s.name.name)})` : `list(${JSON.stringify(s.name.name)})`);
      return [pad + `${s.show ? 'show' : 'hide'}(${n})`];
    }
  }
}

function printAssignTarget(t: Expr): string { return printExpr(t); }

export function printExpr(e: Expr): string {
  switch (e.type) {
    case 'num': return formatNumber(e.value);
    case 'str': return quoteStr(e.value);
    case 'color': return `"${e.value}"`;
    case 'bool': return e.value ? 'true' : 'false';
    case 'name': return e.name;
    case 'varref': return `var(${quoteStr(e.name)})`;
    case 'listref': return `list(${quoteStr(e.name)})`;
    case 'unary': {
      const inner = printExpr(e.operand);
      return e.op === 'not' ? `not ${parenIfNeeded(e.operand, inner)}` : `-${parenIfNeeded(e.operand, inner)}`;
    }
    case 'binary': {
      const l = printExpr(e.left); const r = printExpr(e.right);
      const lp = prec(e.left) < precOf(e.op) ? `(${l})` : l;
      const rp = prec(e.right) <= precOf(e.op) && e.right.type === 'binary' ? `(${r})` : r;
      const joiner = ['and', 'or', 'in'].includes(e.op) ? ` ${e.op} ` : ` ${e.op} `;
      return `${lp}${joiner}${rp}`;
    }
    case 'call': {
      const args = e.args.map(printExpr).join(', ');
      return `${e.callee}(${args})`;
    }
    case 'index': return `${printExpr(e.obj)}[${printExpr(e.index)}]`;
    case 'prop': return `${printExpr(e.obj)}.${e.prop}`;
    case 'listlit': return `[${e.items.map(printExpr).join(', ')}]`;
  }
}

function precOf(op: string): number {
  if (op === 'or') return 1;
  if (op === 'and') return 2;
  if (['==', '!=', '<', '<=', '>', '>=', 'in'].includes(op)) return 3;
  if (op === '+' || op === '-') return 4;
  if (op === '*' || op === '/' || op === '%') return 5;
  return 6;
}
function prec(e: Expr): number {
  return e.type === 'binary' ? precOf(e.op) : e.type === 'unary' ? 5.5 : 7;
}
function parenIfNeeded(e: Expr, inner: string): string {
  return e.type === 'binary' ? `(${inner})` : inner;
}

function formatNumber(n: number): string {
  if (Number.isInteger(n) && Math.abs(n) < 1e15) return String(n);
  // Scratch 互換: 小数はそのまま
  const s = String(n);
  return s;
}

function quoteStr(s: string): string {
  return JSON.stringify(s);
}
