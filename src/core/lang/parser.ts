/**
 * ScratchPy パーサ(構文解析器)
 * -----------------------------
 * トークン列 → AST。Python 風のインデント構文を解析する。
 * エラーは ParseError(行・列・日本語メッセージ)として報告し、
 * 可能な限り回復して複数のエラーを収集する(parseProgramCollective)。
 */

import {
  Program, StageDef, SpriteDef, BodyItem, VarDecl, ListDecl, CostumeDecl,
  SoundDecl, ConfigDecl, EventDef, FuncDef, FuncParam, Hat, Stmt, Expr,
  IfStmt, IfBranch, SPType, Loc, Diagnostic, listOf, CommentStmt,
} from './ast';
import { Token, tokenize, LexError } from './lexer';
import { PrimitiveTypeKind } from './ast';

export class ParseError extends Error {
  line: number; col: number;
  constructor(message: string, line: number, col: number) {
    super(message);
    this.line = line; this.col = col;
  }
}

const TYPE_KEYWORDS = new Set(['int', 'float', 'str', 'bool', 'any']);

export class Parser {
  private toks: Token[];
  private pos = 0;

  constructor(tokens: Token[]) {
    this.toks = tokens;
  }

  // --- トークンユーティリティ -------------------------------------------
  private peek(offset = 0): Token { return this.toks[Math.min(this.pos + offset, this.toks.length - 1)]; }
  private next(): Token { return this.toks[this.pos++]; }
  private at(kind: string, value?: string): boolean {
    const t = this.peek();
    return t.kind === kind && (value === undefined || t.value === value);
  }
  private atKw(...kws: string[]): boolean {
    const t = this.peek();
    return t.kind === 'kw' && kws.includes(t.value);
  }
  private atOp(...ops: string[]): boolean {
    const t = this.peek();
    return (t.kind === 'op' || t.kind === 'punct') && ops.includes(t.value);
  }
  private expect(kind: string, value?: string): Token {
    const t = this.peek();
    if (t.kind !== kind || (value !== undefined && t.value !== value)) {
      throw new ParseError(
        `'${value ?? kind}' が必要です (実際: ${t.raw || t.kind})`, t.line, t.col);
    }
    return this.next();
  }
  private skipNewlines(): CommentStmt[] {
    const comments: CommentStmt[] = [];
    for (;;) {
      const t = this.peek();
      if (t.kind === 'newline') { this.pos++; continue; }
      if (t.kind === 'comment') {
        this.pos++;
        comments.push({ type: 'comment', text: t.value, loc: { line: t.line, col: t.col } });
        continue;
      }
      break;
    }
    return comments;
  }
  private loc(t: Token): Loc { return { line: t.line, col: t.col, endCol: t.endCol }; }

  // --- プログラム全体 ----------------------------------------------------
  parseProgram(): Program {
    const program: Program = { type: 'program', sprites: [], comments: [] };
    program.comments.push(...this.skipNewlines());
    while (!this.at('eof')) {
      if (this.atKw('stage')) {
        program.stage = this.parseStage();
      } else if (this.atKw('sprite')) {
        program.sprites.push(this.parseSprite());
      } else {
        const t = this.peek();
        throw new ParseError(
          `トップレベルには 'stage:' または 'sprite 名前:' しか書けません (実際: ${t.raw || t.kind})`,
          t.line, t.col);
      }
      program.comments.push(...this.skipNewlines());
    }
    return program;
  }

  private parseStage(): StageDef {
    const t = this.expect('kw', 'stage');
    const stage: StageDef = { decl: 'stage', body: [], loc: this.loc(t) };
    if (this.at('ident') || this.at('string')) {
      const n = this.next();
      stage.name = n.value;
      stage.quoted = n.kind === 'string';
    }
    this.expect('punct', ':');
    stage.body = [...this.enterBlock(), ...this.parseBody(true)];
    return stage;
  }

  private parseSprite(): SpriteDef {
    const t = this.expect('kw', 'sprite');
    let name: string; let quoted = false;
    if (this.at('ident')) { name = this.next().value; }
    else if (this.at('string')) { name = this.next().value; quoted = true; }
    else {
      const b = this.peek();
      throw new ParseError(`スプライト名が必要です (実際: ${b.raw || b.kind})`, b.line, b.col);
    }
    const sp: SpriteDef = { decl: 'sprite', name, quoted, body: [], loc: this.loc(t) };
    this.expect('punct', ':');
    sp.body = [...this.enterBlock(), ...this.parseBody(false)];
    return sp;
  }

  private enterBlock(): CommentStmt[] {
    // NEWLINE* INDENT — INDENT 前に吸い込んだコメントはブロック先頭のコメントとして返す
    const pre = this.skipNewlines();
    if (!this.at('indent')) {
      const t = this.peek();
      throw new ParseError('ブロックの開始にはインデントが必要です', t.line, t.col);
    }
    this.next();
    return pre;
  }

  // --- 本体(宣言・イベント・def) -----------------------------------------
  private parseBody(isStage: boolean): BodyItem[] {
    const items: BodyItem[] = [];
    for (;;) {
      items.push(...this.skipNewlines());
      if (this.at('dedent')) { this.next(); break; }
      if (this.at('eof')) break;
      items.push(this.parseBodyItem(isStage));
    }
    return items;
  }

  private parseBodyItem(isStage: boolean): BodyItem {
    const t = this.peek();
    if (t.kind === 'kw') {
      switch (t.value) {
        case 'var': return this.parseVarDecl();
        case 'list': return this.parseListDecl();
        case 'costume': return this.parseCostumeDecl();
        case 'sound': return this.parseSoundDecl();
        case 'on': return this.parseEvent();
        case 'def': return this.parseDef(false);
        case 'pass': { this.next(); return { type: 'pass', loc: this.loc(t) }; }
        default: break;
      }
    }
    if (this.at('punct', '@')) {
      // @warp のみのデコレータ → def が続く
      this.next();
      const nameTok = this.peek();
      if ((nameTok.kind === 'ident' || nameTok.kind === 'kw') && nameTok.value === 'warp') {
        this.next();
        this.skipNewlines();
        return this.parseDef(true);
      }
      throw new ParseError(`不明なデコレータ @${nameTok.value}`, nameTok.line, nameTok.col);
    }
    if (t.kind === 'ident') {
      // config: key: expr
      return this.parseConfigDecl();
    }
    throw new ParseError(`ここに '${t.raw || t.kind}' は書けません`, t.line, t.col);
  }

  private parseConfigDecl(): ConfigDecl {
    const t = this.expect('ident');
    this.expect('punct', ':');
    const value = this.parseExpr();
    return { decl: 'config', key: t.value, value, loc: this.loc(t) };
  }

  private parseVarDecl(): VarDecl {
    const t = this.expect('kw', 'var');
    let name: string; let quoted = false;
    if (this.at('ident')) name = this.next().value;
    else if (this.at('string')) { name = this.next().value; quoted = true; }
    else {
      const b = this.peek();
      throw new ParseError('変数名が必要です', b.line, b.col);
    }
    this.expect('punct', ':');
    const varType = this.parseType();
    this.expect('op', '=');
    const init = this.parseExpr();
    const decl: VarDecl = { decl: 'var', name, quoted, varType, init, cloud: false, loc: this.loc(t) };
    this.parseAnnotations(decl);
    return decl;
  }

  private parseListDecl(): ListDecl {
    const t = this.expect('kw', 'list');
    let name: string; let quoted = false;
    if (this.at('ident')) name = this.next().value;
    else if (this.at('string')) { name = this.next().value; quoted = true; }
    else {
      const b = this.peek();
      throw new ParseError('リスト名が必要です', b.line, b.col);
    }
    this.expect('punct', ':');
    this.expect('kw', 'list');
    this.expect('punct', '[');
    const of = this.parseType();
    this.expect('punct', ']');
    this.expect('op', '=');
    let items: Expr[] = [];
    if (this.at('punct', '[')) {
      this.next();
      if (!this.at('punct', ']')) {
        items.push(this.parseExpr());
        while (this.at('punct', ',')) { this.next(); items.push(this.parseExpr()); }
      }
      this.expect('punct', ']');
    } else {
      const b = this.peek();
      throw new ParseError('リストの初期値は [ ... ] 形式で書いてください', b.line, b.col);
    }
    const decl: ListDecl = { decl: 'list', name, quoted, varType: listOf(of), init: items, loc: this.loc(t) };
    this.parseAnnotations(decl);
    return decl;
  }

  private parseAnnotations(decl: VarDecl | ListDecl): void {
    while (this.at('punct', '@')) {
      this.next();
      const a = this.peek();
      if (a.kind !== 'ident') throw new ParseError('アノテーション名が必要です', a.line, a.col);
      this.next();
      const aname = a.value;
      const args: (string | number)[] = [];
      if (this.at('punct', '(')) {
        this.next();
        if (!this.at('punct', ')')) {
          for (;;) {
            const v = this.peek();
            if (v.kind === 'number') args.push(parseFloat(v.value));
            else if (v.kind === 'string') args.push(v.value);
            else if (v.kind === 'ident' || v.kind === 'kw') args.push(v.value);
            else throw new ParseError('アノテーション引数が不正です', v.line, v.col);
            this.next();
            if (this.at('punct', ',')) { this.next(); continue; }
            break;
          }
        }
        this.expect('punct', ')');
      }
      if (aname === 'show') {
        if (decl.decl === 'list') {
          decl.monitor = { mode: 'list', visible: true };
        } else {
          const mode = (args[0] as string) ?? 'default';
          if (!['default', 'large', 'slider'].includes(mode)) {
            throw new ParseError(`@show の表示モードは default / large / slider のいずれかです (実際: ${mode})`, a.line, a.col);
          }
          if (mode === 'slider') {
            const min = typeof args[1] === 'number' ? args[1] : 0;
            const max = typeof args[2] === 'number' ? args[2] : 100;
            decl.monitor = { mode: 'slider', min, max, visible: true };
          } else {
            decl.monitor = { mode: mode as 'default' | 'large', visible: true };
          }
        }
      } else if (aname === 'hide') {
        if (decl.decl === 'list') decl.monitor = { mode: 'list', visible: false };
        else decl.monitor = { mode: 'default', visible: false };
      } else if (aname === 'cloud') {
        if (decl.decl !== 'var') throw new ParseError('@cloud は var にのみ使えます', a.line, a.col);
        decl.cloud = true;
      } else {
        throw new ParseError(`不明なアノテーション @${aname} (使用可能: @show @hide @cloud)`, a.line, a.col);
      }
    }
  }

  private parseCostumeDecl(): CostumeDecl {
    const t = this.expect('kw', 'costume');
    const n = this.peek();
    if (n.kind !== 'ident' && n.kind !== 'string' && n.kind !== 'number') {
      throw new ParseError('コスチューム名が必要です', n.line, n.col);
    }
    this.next();
    return { decl: 'costume', name: n.value, loc: this.loc(t) };
  }

  private parseSoundDecl(): SoundDecl {
    const t = this.expect('kw', 'sound');
    const n = this.peek();
    if (n.kind !== 'ident' && n.kind !== 'string' && n.kind !== 'number') {
      throw new ParseError('音の名前が必要です', n.line, n.col);
    }
    this.next();
    return { decl: 'sound', name: n.value, loc: this.loc(t) };
  }

  private parseType(): SPType {
    const t = this.peek();
    if (t.kind === 'kw' && t.value === 'list') {
      this.next();
      this.expect('punct', '[');
      const of = this.parseType();
      this.expect('punct', ']');
      return listOf(of);
    }
    if (t.kind === 'kw' && TYPE_KEYWORDS.has(t.value)) {
      this.next();
      return { kind: t.value as PrimitiveTypeKind };
    }
    throw new ParseError(`型名が必要です (int/float/str/bool/any/list[T]) (実際: ${t.raw || t.kind})`, t.line, t.col);
  }

  private parseDef(warp: boolean): FuncDef {
    const t = this.expect('kw', 'def');
    const nameTok = this.peek();
    if (nameTok.kind !== 'ident') throw new ParseError('ブロック(関数)名が必要です', nameTok.line, nameTok.col);
    this.next();
    const params: FuncParam[] = [];
    this.expect('punct', '(');
    if (!this.at('punct', ')')) {
      for (;;) {
        const pn = this.peek();
        if (pn.kind !== 'ident') throw new ParseError('引数名が必要です', pn.line, pn.col);
        this.next();
        this.expect('punct', ':');
        const pt = this.parseType();
        params.push({ name: pn.value, paramType: pt, loc: this.loc(pn) });
        if (this.at('punct', ',')) { this.next(); continue; }
        break;
      }
    }
    this.expect('punct', ')');
    this.expect('punct', ':');
    const body = [...this.enterBlock(), ...this.parseStmtList()];
    return { decl: 'def', name: nameTok.value, params, warp, body, loc: this.loc(t) };
  }

  private parseEvent(): EventDef {
    const t = this.expect('kw', 'on');
    const hat = this.parseHat(t);
    this.expect('punct', ':');
    const body = [...this.enterBlock(), ...this.parseStmtList()];
    return { decl: 'event', hat, body, loc: this.loc(t) };
  }

  private parseHat(t: Token): Hat {
    const h = this.peek();
    if (h.kind !== 'kw') throw new ParseError(`'on' の後にイベント種類が必要です (実際: ${h.raw || h.kind})`, h.line, h.col);
    this.next();
    switch (h.value) {
      case 'flag': return { hat: 'flag', loc: this.loc(t) };
      case 'click': return { hat: 'click', loc: this.loc(t) };
      case 'clone': return { hat: 'clone', loc: this.loc(t) };
      case 'key': {
        const key = this.parseExpr();
        return { hat: 'key', key, loc: this.loc(t) };
      }
      case 'receive': {
        const msg = this.parseExpr();
        return { hat: 'receive', msg, loc: this.loc(t) };
      }
      case 'backdrop': {
        const name = this.parseExpr();
        return { hat: 'backdrop', name, loc: this.loc(t) };
      }
      case 'timer':
      case 'loudness': {
        if (!this.atOp('>')) {
          const b = this.peek();
          throw new ParseError(`'on ${h.value}' の後には '> 値' が必要です`, b.line, b.col);
        }
        this.next();
        const value = this.parseExpr();
        return { hat: 'greaterthan', sensor: h.value, value, loc: this.loc(t) };
      }
      default:
        throw new ParseError(`不明なイベント '${h.value}' (使用可能: flag/key/click/clone/receive/timer/loudness/backdrop)`, h.line, h.col);
    }
  }

  // --- 文リスト / 文 ------------------------------------------------------
  private parseStmtList(): Stmt[] {
    const stmts: Stmt[] = [];
    for (;;) {
      stmts.push(...this.skipNewlines());
      if (this.at('dedent')) { this.next(); break; }
      if (this.at('eof')) break;
      stmts.push(this.parseStmt());
    }
    return stmts;
  }

  private parseStmt(): Stmt {
    const t = this.peek();
    if (t.kind === 'kw') {
      switch (t.value) {
        case 'if': return this.parseIf();
        case 'while': {
          this.next();
          const cond = this.parseExpr();
          this.expect('punct', ':');
          const body = [...this.enterBlock(), ...this.parseStmtList()];
          return { type: 'while', cond, body, loc: this.loc(t) };
        }
        case 'repeat': {
          this.next();
          const count = this.parseExpr();
          this.expect('punct', ':');
          const body = [...this.enterBlock(), ...this.parseStmtList()];
          return { type: 'repeat', count, body, loc: this.loc(t) };
        }
        case 'forever': {
          this.next();
          this.expect('punct', ':');
          const body = [...this.enterBlock(), ...this.parseStmtList()];
          return { type: 'forever', body, loc: this.loc(t) };
        }
        case 'pass': {
          this.next();
          return { type: 'pass', loc: this.loc(t) };
        }
        case 'wait': {
          this.next();
          this.expect('punct', '(');
          const secs = this.parseExpr();
          this.expect('punct', ')');
          return { type: 'wait', secs, loc: this.loc(t) };
        }
        case 'stop': {
          this.next();
          this.expect('punct', '(');
          const what = this.parseExpr();
          this.expect('punct', ')');
          if (what.type !== 'str' || !['all', 'this script', 'other scripts'].includes(what.value)) {
            throw new ParseError('stop() の引数は "all" / "this script" / "other scripts" のいずれかの文字列です', what.loc?.line ?? t.line, what.loc?.col ?? t.col);
          }
          return { type: 'stop', what: what.value as 'all' | 'this script' | 'other scripts', loc: this.loc(t) };
        }
        case 'broadcast': {
          this.next();
          this.expect('punct', '(');
          const msg = this.parseExpr();
          this.expect('punct', ')');
          return { type: 'broadcast', msg, wait: false, loc: this.loc(t) };
        }
        default: break;
      }
    }
    // 式から始まる文: 代入 / 拡張代入 / 式文
    const expr = this.parseExpr();
    if (this.atOp('=')) {
      this.next();
      const value = this.parseExpr();
      if (expr.type !== 'name' && expr.type !== 'varref' && expr.type !== 'index' && expr.type !== 'prop') {
        throw new ParseError('代入の左辺には変数・リスト要素・プロパティしか書けません', t.line, t.col);
      }
      return { type: 'assign', target: expr as never, value, loc: this.loc(t) };
    }
    if (this.atOp('+=') || this.atOp('-=')) {
      const op = this.next().value as '+=' | '-=';
      const value = this.parseExpr();
      if (expr.type !== 'name' && expr.type !== 'varref') {
        throw new ParseError('+= / -= の左辺には変数しか書けません', t.line, t.col);
      }
      return { type: 'augassign', op, target: expr as never, value, loc: this.loc(t) };
    }
    // リストメソッド文 items.add(x)
    if (expr.type === 'call' && expr.method) {
      const m = expr.method;
      if (m.obj.type === 'name' || m.obj.type === 'listref') {
        const method = m.name;
        if (['add', 'insert', 'delete', 'clear'].includes(method)) {
          return {
            type: 'listmethod',
            list: m.obj as never,
            method: method as 'add' | 'insert' | 'delete' | 'clear',
            args: expr.args,
            loc: this.loc(t),
          };
        }
      }
    }
    // 特別なコマンド呼び出し → 専用 Stmt ノードへの変換
    if (expr.type === 'call' && !expr.method) {
      const c = expr;
      const loc = this.loc(t);
      switch (c.callee) {
        case 'broadcast_and_wait':
          if (c.args.length === 1) return { type: 'broadcast', msg: c.args[0], wait: true, loc };
          break;
        case 'create_clone':
          if (c.args.length <= 1) return { type: 'clone', action: 'create', target: c.args[0], loc };
          break;
        case 'delete_clone':
          if (c.args.length === 0) return { type: 'clone', action: 'delete', loc };
          break;
        case 'ask':
          if (c.args.length === 1) return { type: 'ask', question: c.args[0], loc };
          break;
        case 'reset_timer':
          if (c.args.length === 0) return { type: 'resettimer', loc };
          break;
        case 'show':
        case 'hide': {
          const a = c.args[0];
          if (c.args.length === 1 && (a.type === 'name' || a.type === 'varref' || a.type === 'listref')) {
            return { type: 'showmonitor', name: a as never, show: c.callee === 'show', loc };
          }
          break;
        }
        default: break;
      }
    }
    return { type: 'exprstmt', expr, loc: this.loc(t) };
  }

  private parseIf(): IfStmt {
    const t = this.expect('kw', 'if');
    const branches: IfBranch[] = [];
    let cond = this.parseExpr();
    this.expect('punct', ':');
    let body = [...this.enterBlock(), ...this.parseStmtList()];
    branches.push({ cond, body, loc: this.loc(t) });
    for (;;) {
      const save = this.pos;
      const comments = this.skipNewlines();
      if (this.atKw('elif')) {
        this.next();
        const c = this.parseExpr();
        this.expect('punct', ':');
        const b = [...this.enterBlock(), ...this.parseStmtList()];
        branches.push({ cond: c, body: b });
        continue;
      }
      if (this.atKw('else')) {
        this.next();
        this.expect('punct', ':');
        const b = [...this.enterBlock(), ...this.parseStmtList()];
        branches.push({ body: b });
        continue;
      }
      // elif/else ではない → 収集したコメントを戻す
      this.pos = save;
      break;
    }
    return { type: 'if', branches, loc: this.loc(t) };
  }

  // --- 式(precedence climbing) -------------------------------------------
  parseExpr(): Expr { return this.parseOr(); }

  private parseOr(): Expr {
    let left = this.parseAnd();
    while (this.atKw('or')) {
      const t = this.next();
      const right = this.parseAnd();
      left = { type: 'binary', op: 'or', left, right, loc: this.loc(t) };
    }
    return left;
  }
  private parseAnd(): Expr {
    let left = this.parseNot();
    while (this.atKw('and')) {
      const t = this.next();
      const right = this.parseNot();
      left = { type: 'binary', op: 'and', left, right, loc: this.loc(t) };
    }
    return left;
  }
  private parseNot(): Expr {
    if (this.atKw('not')) {
      const t = this.next();
      const operand = this.parseNot();
      return { type: 'unary', op: 'not', operand, loc: this.loc(t) };
    }
    return this.parseComparison();
  }
  private parseComparison(): Expr {
    let left = this.parseAdditive();
    for (;;) {
      if (this.atOp('==', '!=', '<', '<=', '>', '>=')) {
        const t = this.next();
        const right = this.parseAdditive();
        left = { type: 'binary', op: t.value as never, left, right, loc: this.loc(t) };
      } else if (this.atKw('in')) {
        const t = this.next();
        const right = this.parseAdditive();
        left = { type: 'binary', op: 'in', left, right, loc: this.loc(t) };
      } else break;
    }
    return left;
  }
  private parseAdditive(): Expr {
    let left = this.parseMultiplicative();
    while (this.atOp('+', '-')) {
      const t = this.next();
      const right = this.parseMultiplicative();
      left = { type: 'binary', op: t.value as never, left, right, loc: this.loc(t) };
    }
    return left;
  }
  private parseMultiplicative(): Expr {
    let left = this.parseUnary();
    while (this.atOp('*', '/', '%')) {
      const t = this.next();
      const right = this.parseUnary();
      left = { type: 'binary', op: t.value as never, left, right, loc: this.loc(t) };
    }
    return left;
  }
  private parseUnary(): Expr {
    if (this.atOp('-')) {
      const t = this.next();
      const operand = this.parseUnary();
      return { type: 'unary', op: '-', operand, loc: this.loc(t) };
    }
    return this.parsePostfix();
  }
  private parsePostfix(): Expr {
    let expr = this.parsePrimary();
    for (;;) {
      if (this.at('punct', '(')) {
        // 呼び出し
        if (expr.type !== 'name' && expr.type !== 'prop') {
          const t = this.peek();
          throw new ParseError('関数呼び出しの形が不正です', t.line, t.col);
        }
        const t = this.next();
        const args: Expr[] = [];
        if (!this.at('punct', ')')) {
          args.push(this.parseExpr());
          while (this.at('punct', ',')) { this.next(); args.push(this.parseExpr()); }
        }
        this.expect('punct', ')');
        if (expr.type === 'prop') {
          const objName = expr.obj.type === 'name' ? expr.obj.name
            : expr.obj.type === 'listref' ? `list(${JSON.stringify(expr.obj.name)})`
            : expr.obj.type === 'varref' ? `var(${JSON.stringify(expr.obj.name)})`
            : null;
          if (!objName) throw new ParseError('メソッド呼び出しの対象が不正です', t.line, t.col);
          expr = {
            type: 'call', callee: `${objName}.${expr.prop}`, args,
            method: { obj: expr.obj, name: expr.prop }, loc: this.loc(t),
          } as never;
        } else {
          expr = { type: 'call', callee: (expr as { name: string }).name, args, loc: this.loc(t) };
        }
        continue;
      }
      if (this.at('punct', '[')) {
        const t = this.next();
        const index = this.parseExpr();
        this.expect('punct', ']');
        expr = { type: 'index', obj: expr, index, loc: this.loc(t) };
        continue;
      }
      if (this.at('punct', '.')) {
        this.next();
        const pn = this.peek();
        if (pn.kind !== 'ident' && pn.kind !== 'kw') {
          throw new ParseError("'.' の後にはプロパティ名が必要です", pn.line, pn.col);
        }
        this.next();
        expr = { type: 'prop', obj: expr, prop: pn.value, loc: this.loc(pn) };
        continue;
      }
      break;
    }
    return expr;
  }

  private parsePrimary(): Expr {
    const t = this.peek();
    if (t.kind === 'number') {
      this.next();
      const isFloat = t.value.includes('.');
      return {
        type: 'num', value: parseFloat(t.value),
        spType: { kind: isFloat ? 'float' : 'int' }, loc: this.loc(t),
      };
    }
    if (t.kind === 'string') {
      this.next();
      const isColor = /^#[0-9a-fA-F]{6}$/.test(t.value);
      return isColor
        ? { type: 'color', value: t.value.toLowerCase(), spType: { kind: 'str' }, loc: this.loc(t) }
        : { type: 'str', value: t.value, spType: { kind: 'str' }, loc: this.loc(t) };
    }
    if (t.kind === 'kw' && (t.value === 'true' || t.value === 'false')) {
      this.next();
      return { type: 'bool', value: t.value === 'true', spType: { kind: 'bool' }, loc: this.loc(t) };
    }
    if (t.kind === 'kw' && (t.value === 'var' || t.value === 'list') && this.peek(1).kind === 'punct' && this.peek(1).value === '(') {
      this.next(); this.next();
      const n = this.peek();
      if (n.kind !== 'string') throw new ParseError(`${t.value}("名前") の形では名前は文字列で書いてください`, n.line, n.col);
      this.next();
      this.expect('punct', ')');
      return t.value === 'var'
        ? { type: 'varref', name: n.value, loc: this.loc(t) }
        : { type: 'listref', name: n.value, loc: this.loc(t) };
    }
    if (t.kind === 'ident') {
      this.next();
      return { type: 'name', name: t.value, loc: this.loc(t) };
    }
    if (this.at('punct', '(')) {
      this.next();
      const e = this.parseExpr();
      this.expect('punct', ')');
      return e;
    }
    if (this.at('punct', '[')) {
      this.next();
      const items: Expr[] = [];
      if (!this.at('punct', ']')) {
        items.push(this.parseExpr());
        while (this.at('punct', ',')) { this.next(); items.push(this.parseExpr()); }
      }
      this.expect('punct', ']');
      return { type: 'listlit', items, loc: this.loc(t) };
    }
    throw new ParseError(`式が必要です (実際: ${t.raw || t.kind})`, t.line, t.col);
  }
}

/** パースして Program を返す。失敗時は ParseError を throw。 */
export function parse(src: string): Program {
  const tokens = tokenize(src, true);
  const parser = new Parser(tokens);
  return parser.parseProgram();
}

/**
 * パースして診断情報を収集する(例外を投げない)。
 * 最初の構文エラーまでを AST として返しつつ diagnostics にエラーを積む。
 */
export function parseCollect(src: string): { program: Program | null; diagnostics: Diagnostic[] } {
  const diagnostics: Diagnostic[] = [];
  let tokens: Token[];
  try {
    tokens = tokenize(src, true);
  } catch (e) {
    if (e instanceof LexError) {
      diagnostics.push({ severity: 'error', message: e.message, loc: { line: e.line, col: e.col }, code: 'lex' });
      return { program: null, diagnostics };
    }
    throw e;
  }
  try {
    const program = new Parser(tokens).parseProgram();
    return { program, diagnostics };
  } catch (e) {
    if (e instanceof ParseError) {
      diagnostics.push({ severity: 'error', message: e.message, loc: { line: e.line, col: e.col }, code: 'parse' });
      return { program: null, diagnostics };
    }
    throw e;
  }
}
