/**
 * ScratchPy 静的型チェッカ
 * -------------------------
 * - 変数・引数の型宣言と使用箇所の整合性チェック
 * - 組み込み関数の引数型・個数・メニュー値の検証
 * - 名前の解決(ローカル変数 / グローバル変数 / パラメータ / プロパティ / スプライト参照)
 * - 解決結果(Resolution)をエクスポート処理と共有
 *
 * エラーメッセージは全て日本語(学習者向け)。
 */

import {
  Program, SpriteDef, StageDef, VarDecl, ListDecl, EventDef, FuncDef, Stmt, Expr,
  SPType, PrimitiveTypeKind, Diagnostic, Loc, BodyItem, typeToString, T_INT, T_FLOAT, T_STR, T_BOOL, T_ANY, listOf,
  CommentStmt, PassStmt,
} from './ast';
import {
  BUILTINS, PROPERTIES, MENUS, SENSING_OF_PROPS, BuiltinDef, ParamSpec, TargetKind,
} from './builtins';

// ---------------------------------------------------------------------------
// 解決モデル
// ---------------------------------------------------------------------------
export type VarEntity = {
  entity: 'var';
  decl: VarDecl;
  owner: string;              // 宣言されているターゲット名
  scope: 'global' | 'local';  // stage 宣言 = global
};
export type ListEntity = {
  entity: 'list';
  decl: ListDecl;
  owner: string;
  scope: 'global' | 'local';
};
export type ParamEntity = { entity: 'param'; param: { name: string; paramType: SPType } };
export type PropertyEntity = { entity: 'property'; prop: string };

export type NameResolution = VarEntity | ListEntity | ParamEntity | PropertyEntity;

export interface ProjectContext {
  stageName: string;
  spriteNames: string[];
  stageVars: Map<string, VarEntity>;
  stageLists: Map<string, ListEntity>;
  spriteVars: Map<string, Map<string, VarEntity>>;
  spriteLists: Map<string, Map<string, ListEntity>>;
  spriteDefs: Map<string, Map<string, FuncDef>>;
  costumes: Map<string, string[]>;    // target名 → コスチューム名
  sounds: Map<string, string[]>;
}

export interface CheckResult {
  diagnostics: Diagnostic[];
  ok: boolean;                       // エラーなし
  ctx: ProjectContext;
  resolutions: Map<Expr, NameResolution>;
  usesPen: boolean;
  broadcasts: Set<string>;           // 使用されたメッセージ名(リテラル)
}

// ---------------------------------------------------------------------------
// 型ユーティリティ
// ---------------------------------------------------------------------------
export function isNum(t: SPType): boolean { return t.kind === 'int' || t.kind === 'float' || t.kind === 'any'; }
export function isBoolish(t: SPType): boolean { return t.kind === 'bool' || t.kind === 'any'; }

/** 代入互換: value の型を target の型に代入できるか */
export function assignable(target: SPType, value: SPType): boolean {
  if (target.kind === 'any' || value.kind === 'any') return true;
  if (target.kind === 'float' && value.kind === 'int') return true;
  if (target.kind === 'list' && value.kind === 'list') return assignable(target.of, value.of);
  if (target.kind === 'list' || value.kind === 'list') return false;
  return target.kind === value.kind;
}

function joinTypes(types: SPType[]): SPType {
  // 数値系の共通型を求める
  let hasInt = false, hasFloat = false, hasStr = false, hasBool = false, hasAny = false, list: SPType | null = null;
  for (const t of types) {
    switch (t.kind) {
      case 'int': hasInt = true; break;
      case 'float': hasFloat = true; break;
      case 'str': hasStr = true; break;
      case 'bool': hasBool = true; break;
      case 'any': hasAny = true; break;
      case 'list': list = t; break;
    }
  }
  if (hasAny) return T_ANY;
  if (list) return list;
  const kinds = [hasInt && 'int', hasFloat && 'float', hasStr && 'str', hasBool && 'bool'].filter(Boolean) as string[];
  if (kinds.length === 1) return { kind: kinds[0] as PrimitiveTypeKind };
  if (hasInt && hasFloat) return T_FLOAT;
  return T_ANY; // 混在(エラーは呼び出し側で報告済み)
}

// ---------------------------------------------------------------------------
// チェッカ本体
// ---------------------------------------------------------------------------
interface TargetScope {
  targetName: string;
  isStage: boolean;
  localVars: Map<string, VarEntity>;
  localLists: Map<string, ListEntity>;
  defs: Map<string, FuncDef>;
  params: Map<string, SPType> | null;  // def 内でのみ非 null
}

class Checker {
  diags: Diagnostic[] = [];
  resolutions = new Map<Expr, NameResolution>();
  broadcasts = new Set<string>();
  usesPen = false;
  ctx: ProjectContext;
  scope!: TargetScope;

  constructor(private program: Program) {
    const stageName = program.stage?.name ?? 'Stage';
    this.ctx = {
      stageName,
      spriteNames: program.sprites.map(s => s.name),
      stageVars: new Map(), stageLists: new Map(),
      spriteVars: new Map(), spriteLists: new Map(),
      spriteDefs: new Map(),
      costumes: new Map(), sounds: new Map(),
    };
  }

  private err(message: string, loc?: Loc, code = 'type') {
    this.diags.push({ severity: 'error', message, loc, code });
  }
  private warn(message: string, loc?: Loc) {
    this.diags.push({ severity: 'warning', message, loc, code: 'warn' });
  }

  run(): CheckResult {
    this.collectDeclarations();
    if (this.program.stage) this.checkTarget(this.program.stage);
    for (const sp of this.program.sprites) this.checkTarget(sp);
    this.diags.sort((a, b) => (a.loc?.line ?? 0) - (b.loc?.line ?? 0) || (a.loc?.col ?? 0) - (b.loc?.col ?? 0));
    return {
      diagnostics: this.diags,
      ok: !this.diags.some(d => d.severity === 'error'),
      ctx: this.ctx,
      resolutions: this.resolutions,
      usesPen: this.usesPen,
      broadcasts: this.broadcasts,
    };
  }

  // --- 宣言収集フェーズ ----------------------------------------------------
  private collectDeclarations(): void {
    const stage = this.program.stage;
    if (stage) {
      const { vars, lists, costumes, sounds } = this.collectTargetDecls(stage.body, this.ctx.stageName);
      this.ctx.stageVars = vars;
      this.ctx.stageLists = lists;
      this.ctx.costumes.set(this.ctx.stageName, costumes);
      this.ctx.sounds.set(this.ctx.stageName, sounds);
    } else {
      this.ctx.costumes.set(this.ctx.stageName, ['backdrop1']);
    }
    for (const sp of this.program.sprites) {
      const { vars, lists, defs, costumes, sounds } = this.collectTargetDecls(sp.body, sp.name);
      this.ctx.spriteVars.set(sp.name, vars);
      this.ctx.spriteLists.set(sp.name, lists);
      this.ctx.spriteDefs.set(sp.name, defs);
      this.ctx.costumes.set(sp.name, costumes);
      this.ctx.sounds.set(sp.name, sounds);
    }
  }

  private collectTargetDecls(body: BodyItem[], owner: string) {
    const vars = new Map<string, VarEntity>();
    const lists = new Map<string, ListEntity>();
    const defs = new Map<string, FuncDef>();
    const costumes: string[] = [];
    const sounds: string[] = [];
    const isStage = owner === this.ctx.stageName;
    for (const item of body) {
      if (!('decl' in item)) continue;
      if (item.decl === 'var') {
        if (vars.has(item.name)) this.err(`変数 '${item.name}' が同じスコープ内で二重宣言されています`, item.loc);
        const ent: VarEntity = { entity: 'var', decl: item, owner, scope: isStage ? 'global' : 'local' };
        vars.set(item.name, ent);
        if (isStage) {
          if (this.ctx.spriteNames.some(n => false)) { /* noop */ }
        }
      } else if (item.decl === 'list') {
        if (lists.has(item.name)) this.err(`リスト '${item.name}' が同じスコープ内で二重宣言されています`, item.loc);
        lists.set(item.name, { entity: 'list', decl: item, owner, scope: isStage ? 'global' : 'local' });
      } else if (item.decl === 'costume') {
        if (costumes.includes(item.name)) this.warn(`コスチューム名 '${item.name}' が重複しています`, item.loc);
        costumes.push(item.name);
      } else if (item.decl === 'sound') {
        sounds.push(item.name);
      } else if (item.decl === 'def') {
        if (defs.has(item.name)) this.err(`ブロック定義 '${item.name}' が重複しています`, item.loc);
        defs.set(item.name, item);
      }
    }
    return { vars, lists, defs, costumes, sounds };
  }

  // --- ターゲット単位のチェック -------------------------------------------
  private checkTarget(target: StageDef | SpriteDef): void {
    const isStage = target.decl === 'stage';
    const targetName = isStage ? this.ctx.stageName : (target as SpriteDef).name;
    this.scope = {
      targetName, isStage,
      localVars: isStage ? this.ctx.stageVars : this.ctx.spriteVars.get(targetName)!,
      localLists: isStage ? this.ctx.stageLists : this.ctx.spriteLists.get(targetName)!,
      defs: isStage ? new Map() : this.ctx.spriteDefs.get(targetName)!,
      params: null,
    };
    for (const item of target.body) {
      if (!('decl' in item)) continue;
      switch (item.decl) {
        case 'var': this.checkVarDecl(item, isStage); break;
        case 'list': this.checkListDecl(item, isStage); break;
        case 'config': this.checkConfig(item.key, item.value, isStage, item.loc); break;
        case 'event': this.checkEvent(item, isStage); break;
        case 'def': this.checkDef(item); break;
        default: break;
      }
    }
  }

  private checkVarDecl(v: VarDecl, isStage: boolean): void {
    this.checkNameAllowed(v.name, v.loc);
    if (v.cloud && !isStage === false) { /* cloud can be anywhere; Scratch only allows global numeric */ }
    if (v.cloud) {
      if (v.varType.kind !== 'int' && v.varType.kind !== 'float') {
        this.err('クラウド変数 (@cloud) は数値型 (int/float) のみ使用できます', v.loc);
      }
      if (!isStage) this.warn('クラウド変数は普通ステージ(グローバル)で宣言します', v.loc);
    }
    const initType = this.checkExpr(v.init);
    if (!assignable(v.varType, initType)) {
      this.err(`変数 '${v.name}' は ${typeToString(v.varType)} 型ですが、初期値の型は ${typeToString(initType)} です`, v.loc);
    }
    // グローバル変数とスプライト内同名変数のシャドーイング警告
    if (!isStage && this.ctx.stageVars.has(v.name)) {
      this.warn(`変数 '${v.name}' はステージのグローバル変数と同じ名前です。このスプライト内ではローカル変数が優先されます`, v.loc);
    }
  }

  private checkListDecl(l: ListDecl, isStage: boolean): void {
    this.checkNameAllowed(l.name, l.loc);
    const elemType = l.varType.kind === 'list' ? l.varType.of : T_ANY;
    for (const item of l.init) {
      const t = this.checkExpr(item);
      if (!assignable(elemType, t)) {
        this.err(`リスト '${l.name}' の要素型は ${typeToString(elemType)} ですが、${typeToString(t)} の値が入っています`, item.loc ?? l.loc);
      }
    }
    if (!isStage && this.ctx.stageLists.has(l.name)) {
      this.warn(`リスト '${l.name}' はステージのグローバルリストと同じ名前です`, l.loc);
    }
  }

  private checkNameAllowed(name: string, loc?: Loc): void {
    if (BUILTINS[name]) this.err(`'${name}' は組み込み関数名なので変数名に使えません`, loc);
    if (PROPERTIES[name]) this.err(`'${name}' は予約プロパティ名(「${PROPERTIES[name].doc}」)なので変数名に使えません`, loc);
    if (this.ctx.spriteNames.includes(name) || name === this.ctx.stageName) {
      this.warn(`'${name}' はスプライト/ステージ名と同じです。式の中で名前解決が優先されるため混乱の元になります`, loc);
    }
  }

  private checkConfig(key: string, value: Expr, isStage: boolean, loc?: Loc): void {
    const numKeys = isStage ? ['tempo', 'video_transparency', 'volume', 'current_costume']
      : ['x', 'y', 'direction', 'size', 'volume', 'current_costume', 'layer_order'];
    const boolKeys = isStage ? [] : ['visible', 'draggable'];
    const strKeys: Record<string, string[]> = isStage
      ? { video_state: ['on', 'off', 'on-flipped'] }
      : { rotation_style: MENUS.rotation_style };
    if (numKeys.includes(key)) {
      const t = this.checkExpr(value);
      if (!isNum(t)) this.err(`設定 '${key}' には数値が必要です`, loc);
      if (key === 'current_costume' && t.kind === 'int') {
        const n = (value as { value?: number }).value;
        const costumes = this.ctx.costumes.get(this.scope.targetName) ?? [];
        if (typeof n === 'number' && costumes.length && (n < 0 || n >= costumes.length)) {
          this.warn(`current_costume=${n} はコスチュームの範囲外です (0〜${costumes.length - 1})`, loc);
        }
      }
    } else if (boolKeys.includes(key)) {
      const t = this.checkExpr(value);
      if (!isBoolish(t)) this.err(`設定 '${key}' には true/false が必要です`, loc);
    } else if (strKeys[key]) {
      const t = this.checkExpr(value);
      if (t.kind !== 'str' && t.kind !== 'any') this.err(`設定 '${key}' には文字列が必要です`, loc);
      if (value.type === 'str' && !strKeys[key].includes(value.value)) {
        this.err(`設定 '${key}' の値は ${strKeys[key].map(s => `"${s}"`).join(' / ')} のいずれかです`, loc);
      }
    } else if (key === 'tts_language') {
      this.checkExpr(value);
    } else {
      this.err(`不明な設定項目 '${key}'${isStage ? ' (ステージでは tempo/video_state/video_transparency/volume/current_costume/tts_language が使えます)' : ' (スプライトでは x/y/direction/size/visible/draggable/rotation_style/volume/current_costume/layer_order が使えます)'}`, loc);
      this.checkExpr(value);
    }
  }

  private checkEvent(e: EventDef, isStage: boolean): void {
    const hat = e.hat;
    switch (hat.hat) {
      case 'clone':
        if (isStage) this.err('「on clone」(クローンされたとき) はステージでは使えません', hat.loc ?? e.loc);
        break;
      case 'key': {
        const t = this.checkExpr(hat.key);
        if (t.kind !== 'str' && t.kind !== 'any') this.err('「on key」のキー名は文字列で指定してください', hat.loc);
        this.checkMenuValue(hat.key, MENUS.key, 'キー名', hat.loc);
        break;
      }
      case 'receive': {
        const t = this.checkExpr(hat.msg);
        if (t.kind !== 'str' && t.kind !== 'any') this.err('「on receive」のメッセージ名は文字列で指定してください', hat.loc);
        if (hat.msg.type === 'str') this.broadcasts.add(hat.msg.value);
        else this.warn('「on receive」のメッセージ名はリテラル文字列を推奨します(動的な名前は変換できません)', hat.loc);
        break;
      }
      case 'backdrop': {
        this.checkExpr(hat.name);
        this.checkCostumeName(hat.name, this.ctx.stageName, '背景名', hat.loc);
        break;
      }
      case 'greaterthan': {
        const t = this.checkExpr(hat.value);
        if (!isNum(t)) this.err(`「on ${hat.sensor} >」の比較値は数値です`, hat.loc);
        break;
      }
      default: break;
    }
    this.checkStmts(e.body);
  }

  private checkDef(d: FuncDef): void {
    if (BUILTINS[d.name]) this.err(`'${d.name}' は組み込み関数名と衝突します。別の名前にしてください`, d.loc);
    if (d.name.includes('%')) this.err("ブロック名に '%' は使えません(Scratch のプロシージャ形式と衝突するため)", d.loc);
    const names = new Set<string>();
    for (const p of d.params) {
      if (names.has(p.name)) this.err(`引数 '${p.name}' が重複しています`, p.loc);
      names.add(p.name);
      this.checkNameAllowed(p.name, p.loc);
    }
    const saved = this.scope.params;
    this.scope.params = new Map(d.params.map(p => [p.name, p.paramType]));
    this.checkStmts(d.body);
    this.scope.params = saved;
  }

  private checkStmts(stmts: Stmt[]): void {
    for (const s of stmts) this.checkStmt(s);
  }

  private checkStmt(s: Stmt): void {
    switch (s.type) {
      case 'assign': this.checkAssign(s.target, s.value, s.loc); break;
      case 'augassign': {
        const res = this.resolveAssignableName(s.target, s.loc);
        const vt = this.checkExpr(s.value);
        if (res) {
          if (res.entity === 'param') {
            this.err('引数(パラメータ)には代入できません', s.loc);
          } else if (res.entity === 'var') {
            const declType = res.decl.varType;
            if (declType.kind === 'str' || declType.kind === 'bool' || declType.kind === 'list') {
              this.err(`+= / -= は数値型の変数のみ使用できます ('${res.decl.name}' は ${typeToString(declType)} 型)`, s.loc);
            }
            if (!isNum(vt)) this.err(`+= / -= の右辺は数値です (実際: ${typeToString(vt)})`, s.loc);
          } else {
            this.err('この対象には += / -= できません', s.loc);
          }
        }
        break;
      }
      case 'exprstmt': {
        const t = this.checkExpr(s.expr);
        if (s.expr.type === 'call') {
          const b = BUILTINS[s.expr.callee];
          if (b && b.callType === 'reporter' && s.expr.callee !== 'len') {
            this.warn(`値を返す式 '${s.expr.callee}(...)' の結果が使われていません`, s.loc);
          }
          if (!b && !this.scope.defs.has(s.expr.callee) && !s.expr.method
            && !['var', 'list'].includes(s.expr.callee)) {
            // 未定義関数は checkExpr 側で報告済み
          }
        } else if (t.kind !== 'any') {
          this.warn('この式は値を返しますが、文としては何も行いません', s.loc);
        }
        break;
      }
      case 'listmethod': this.checkListMethod(s.list, s.method, s.args, s.loc); break;
      case 'wait': {
        const t = this.checkExpr(s.secs);
        if (!isNum(t)) this.err('wait() の引数は秒数(数値)です', s.loc);
        break;
      }
      case 'repeat': {
        const t = this.checkExpr(s.count);
        if (!isNum(t)) this.err('repeat の回数は数値です', s.loc);
        if (t.kind === 'float') this.warn('repeat の回数に小数を指定すると切り捨てられます', s.loc);
        this.checkStmts(s.body);
        break;
      }
      case 'forever': this.checkStmts(s.body); break;
      case 'while': {
        const t = this.checkExpr(s.cond);
        if (!isBoolish(t)) this.err(`while の条件は bool 型です (実際: ${typeToString(t)})`, s.loc);
        this.checkStmts(s.body);
        break;
      }
      case 'if': {
        s.branches.forEach((b, i) => {
          if (b.cond) {
            const t = this.checkExpr(b.cond);
            if (!isBoolish(t)) this.err(`${i === 0 ? 'if' : 'elif'} の条件は bool 型です (実際: ${typeToString(t)})`, b.loc ?? s.loc);
          }
          this.checkStmts(b.body);
        });
        break;
      }
      case 'stop': break; // パーサでリテラル固定
      case 'broadcast': {
        const t = this.checkExpr(s.msg);
        if (t.kind !== 'str' && t.kind !== 'any') this.err('broadcast のメッセージは文字列です', s.loc);
        if (s.msg.type === 'str') this.broadcasts.add(s.msg.value);
        break;
      }
      case 'clone': {
        if (this.scope.isStage) this.err('クローン操作はステージでは使えません', s.loc);
        if (s.action === 'create' && s.target) {
          const t = this.checkExpr(s.target);
          if (t.kind !== 'str' && t.kind !== 'any') this.err('create_clone() の対象は文字列(スプライト名または "myself")です', s.loc);
          if (s.target.type === 'str') {
            const v = s.target.value;
            if (v !== 'myself' && !this.ctx.spriteNames.includes(v)) {
              this.err(`スプライト '${v}' が見つかりません (create_clone の対象)`, s.loc);
            }
          }
        }
        break;
      }
      case 'ask': {
        const t = this.checkExpr(s.question);
        if (t.kind !== 'str' && t.kind !== 'any') this.err('ask() の質問は文字列です', s.loc);
        break;
      }
      case 'resettimer': break;
      case 'showmonitor': {
        const name = s.name.type === 'name' ? s.name.name : s.name.name;
        const v = this.lookupVar(name);
        const l = this.lookupList(name);
        if (!v && !l) this.err(`変数/リスト '${name}' が見つかりません (${s.show ? 'show' : 'hide'} の対象)`, s.loc);
        if (s.name.type === 'name') this.resolutions.set(s.name, (v ?? l)!);
        break;
      }
      case 'pass': case 'comment': case 'unsupported': break;
    }
  }

  private resolveAssignableName(target: Expr, loc?: Loc): NameResolution | null {
    if (target.type === 'name') {
      const r = this.lookupName(target.name);
      if (!r) { this.err(`変数 '${target.name}' が見つかりません(代入前に var で宣言してください)`, loc); return null; }
      this.resolutions.set(target, r);
      return r;
    }
    if (target.type === 'varref') {
      const v = this.lookupVar(target.name);
      if (!v) { this.err(`変数 '${target.name}' が見つかりません`, loc); return null; }
      this.resolutions.set(target, v);
      return v;
    }
    return null;
  }

  private checkAssign(target: Expr, value: Expr, loc?: Loc): void {
    if (target.type === 'index') {
      const objType = this.checkExpr(target.obj);
      const idxType = this.checkExpr(target.index);
      if (objType.kind === 'list') {
        const okIdx = idxType.kind === 'int' || idxType.kind === 'any' ||
          (target.index.type === 'str' && ['last', 'random'].includes(target.index.value));
        if (!okIdx) this.err('リストの添字は整数 (または "last" / "random") です', loc);
        const vt = this.checkExpr(value);
        if (!assignable(objType.of, vt)) {
          this.err(`リストの要素型は ${typeToString(objType.of)} ですが、${typeToString(vt)} を代入しようとしています`, loc);
        }
      } else if (objType.kind === 'str' || objType.kind === 'any') {
        this.err('文字列の要素への代入はできません(文字列は変更不可)', loc);
        this.checkExpr(value);
      } else {
        this.err('添字代入できるのはリストだけです', loc);
        this.checkExpr(value);
      }
      return;
    }
    const res = this.resolveAssignableName(target, loc);
    const vt = this.checkExpr(value);
    if (res && res.entity === 'var') {
      if (!assignable(res.decl.varType, vt)) {
        this.err(`変数 '${res.decl.name}' は ${typeToString(res.decl.varType)} 型です。${typeToString(vt)} 型の値は代入できません`, loc);
      }
    } else if (res && res.entity === 'param') {
      this.err('引数(パラメータ)には代入できません。ローカル変数にコピーしてください', loc);
    } else if (res && res.entity === 'list') {
      this.err(`'${res.decl.name}' はリストです。リスト全体への代入はできません (items[i] = x / items.add(x) を使用)`, loc);
    } else if (res && res.entity === 'property') {
      this.err('プロパティ(読み取り専用)には代入できません。set_x() などの関数を使ってください', loc);
    }
  }

  private checkListMethod(listExpr: Expr, method: string, args: Expr[], loc?: Loc): void {
    let listName: string;
    if (listExpr.type === 'name') listName = listExpr.name;
    else if (listExpr.type === 'listref') listName = listExpr.name;
    else { this.err('リストメソッドはリストに対してのみ呼び出せます', loc); return; }
    const l = this.lookupList(listName);
    if (!l) {
      // 変数に対してメソッド呼び出し → 明確なエラー
      const v = this.lookupVar(listName);
      if (v) this.err(`'${listName}' はリストではなく変数です (.${method}() は使えません)`, loc);
      else this.err(`リスト '${listName}' が見つかりません(list 宣言が必要です)`, loc);
      return;
    }
    this.resolutions.set(listExpr, l);
    const elemType = l.decl.varType.kind === 'list' ? l.decl.varType.of : T_ANY;
    switch (method) {
      case 'add': {
        if (args.length !== 1) { this.err('add() の引数は1個です', loc); break; }
        const t = this.checkExpr(args[0]);
        if (!assignable(elemType, t)) this.err(`リスト '${listName}' の要素型は ${typeToString(elemType)} です。${typeToString(t)} は追加できません`, loc);
        break;
      }
      case 'insert': {
        if (args.length !== 2) { this.err('insert() の引数は (位置, 値) の2個です', loc); break; }
        const it = this.checkExpr(args[0]);
        if (!this.isIndexType(it, args[0])) this.err('insert() の位置は整数 (または "last" / "random") です', loc);
        const t = this.checkExpr(args[1]);
        if (!assignable(elemType, t)) this.err(`リスト '${listName}' の要素型は ${typeToString(elemType)} です。${typeToString(t)} は挿入できません`, loc);
        break;
      }
      case 'delete': {
        if (args.length !== 1) { this.err('delete() の引数は1個です', loc); break; }
        const it = this.checkExpr(args[0]);
        if (!this.isIndexType(it, args[0])) this.err('delete() の位置は整数 (または "last" / "all" / "random") です', loc);
        if (args[0].type === 'str' && args[0].value === 'all') {
          this.warn('delete("all") よりも clear() の使用を推奨します', loc);
        }
        break;
      }
      case 'clear': {
        if (args.length !== 0) this.err('clear() に引数はいりません', loc);
        break;
      }
    }
  }

  private isIndexType(t: SPType, e: Expr): boolean {
    if (t.kind === 'int' || t.kind === 'any') return true;
    if (e.type === 'str' && ['last', 'random', 'all'].includes(e.value)) return true;
    return false;
  }

  // --- 式チェック(型を返し AST に注釈する) --------------------------------
  checkExpr(e: Expr): SPType {
    const t = this.computeType(e);
    (e as { spType?: SPType }).spType = t;
    return t;
  }

  private computeType(e: Expr): SPType {
    switch (e.type) {
      case 'num': case 'str': case 'bool': case 'color': return e.spType!;
      case 'listlit': {
        const ts = e.items.map(i => this.checkExpr(i));
        return listOf(ts.length ? joinTypes(ts) : T_ANY);
      }
      case 'name': return this.checkName(e);
      case 'varref': {
        const v = this.lookupVar(e.name);
        if (!v) this.err(`変数 '${e.name}' が見つかりません`, e.loc);
        else this.resolutions.set(e, v);
        return v ? v.decl.varType : T_ANY;
      }
      case 'listref': {
        const l = this.lookupList(e.name);
        if (!l) this.err(`リスト '${e.name}' が見つかりません`, e.loc);
        else this.resolutions.set(e, l);
        return l ? l.decl.varType : listOf(T_ANY);
      }
      case 'unary': {
        const t = this.checkExpr(e.operand);
        if (e.op === 'not') {
          if (!isBoolish(t)) this.err(`not の対象は bool 型です (実際: ${typeToString(t)})`, e.loc);
          return T_BOOL;
        }
        if (!isNum(t)) this.err(`単項 - は数値にのみ使えます (実際: ${typeToString(t)})`, e.loc);
        return t;
      }
      case 'binary': return this.checkBinary(e);
      case 'index': {
        // リスト名に対する添字: リスト解決を直接行う(「リストは値に使えない」エラーを経由しない)
        if (e.obj.type === 'name' || e.obj.type === 'listref') {
          const l = this.lookupList(e.obj.name);
          if (l) {
            this.resolutions.set(e.obj, l);
            (e.obj as { spType?: SPType }).spType = l.decl.varType;
            const idxType = this.checkExpr(e.index);
            if (!this.isIndexType(idxType, e.index)) this.err('リストの添字は整数 (または "last" / "random") です', e.loc);
            return l.decl.varType.kind === 'list' ? l.decl.varType.of : T_ANY;
          }
        }
        const objType = this.checkExpr(e.obj);
        const idxType = this.checkExpr(e.index);
        if (objType.kind === 'list') {
          if (!this.isIndexType(idxType, e.index)) this.err('リストの添字は整数 (または "last" / "random") です', e.loc);
          return objType.of;
        }
        if (objType.kind === 'str' || objType.kind === 'any') {
          if (!this.isIndexType(idxType, e.index)) this.err('文字の位置は整数です', e.loc);
          return T_STR; // letter of
        }
        this.err('添字アクセス [ ] はリストと文字列のみ使用できます', e.loc);
        return T_ANY;
      }
      case 'prop': return this.checkProp(e);
      case 'call': return this.checkCall(e);
    }
  }

  private checkBinary(e: Extract<Expr, { type: 'binary' }>): SPType {
    const op = e.op;
    // in 演算子: 右辺はリスト名/文字列(リストは「値」として扱わない)
    if (op === 'in') {
      const lt = this.checkExpr(e.left);
      if (e.right.type === 'name' || e.right.type === 'listref') {
        const l = this.lookupList(e.right.name);
        if (l) {
          this.resolutions.set(e.right, l);
          (e.right as { spType?: SPType }).spType = l.decl.varType;
          const elem = l.decl.varType.kind === 'list' ? l.decl.varType.of : T_ANY;
          if (!assignable(elem, lt)) {
            this.err(`in の左辺(${typeToString(lt)})はリスト要素型(${typeToString(elem)})と一致しません`, e.loc);
          }
          return T_BOOL;
        }
      }
      const rt = this.checkExpr(e.right);
      if (rt.kind === 'str' || rt.kind === 'any') {
        if (lt.kind !== 'str' && lt.kind !== 'any') this.err('文字列に対する in の左辺は文字列です', e.loc);
        return T_BOOL;
      }
      if (rt.kind === 'list') {
        if (!assignable(rt.of, lt)) this.err(`in の左辺(${typeToString(lt)})はリスト要素型(${typeToString(rt.of)})と一致しません`, e.loc);
        return T_BOOL;
      }
      this.err('in 演算子の右辺はリストまたは文字列です', e.loc);
      return T_BOOL;
    }
    const lt = this.checkExpr(e.left);
    const rt = this.checkExpr(e.right);
    if (op === 'and' || op === 'or') {
      if (!isBoolish(lt)) this.err(`${op} の左辺は bool 型です (実際: ${typeToString(lt)})`, e.loc);
      if (!isBoolish(rt)) this.err(`${op} の右辺は bool 型です (実際: ${typeToString(rt)})`, e.loc);
      return T_BOOL;
    }
    if (['==', '!='].includes(op)) {
      const bothList = lt.kind === 'list' || rt.kind === 'list';
      if (bothList) this.err('リスト同士の比較 (== / !=) はできません', e.loc);
      return T_BOOL;
    }
    if (['<', '<=', '>', '>='].includes(op)) {
      if (!isNum(lt) || !isNum(rt)) {
        // Scratch では文字列比較も可能だが、教育的に数値のみ許可し警告
        if ((lt.kind === 'str' || lt.kind === 'any') && (rt.kind === 'str' || rt.kind === 'any')) {
          this.warn('文字列同士の大小比較はScratchでは辞書順ではありません。等価比較 (==) を推奨します', e.loc);
          return T_BOOL;
        }
        this.err(`比較演算子 ${op} は数値同士でのみ使えます (実際: ${typeToString(lt)} ${op} ${typeToString(rt)})`, e.loc);
      }
      return T_BOOL;
    }
    // 算術
    if (op === '+') {
      if (lt.kind === 'str' || rt.kind === 'str') {
        if (lt.kind === 'str' && rt.kind === 'str') return T_STR;
        if (lt.kind === 'any' || rt.kind === 'any') return T_ANY;
        this.err(`+ による数値(${typeToString(lt.kind === 'str' ? rt : lt)})と文字列の混合はできません。文字列連結なら両方 str にしてください`, e.loc);
        return T_ANY;
      }
      if (!isNum(lt) || !isNum(rt)) { this.err(`+ は数値同士または文字列同士でのみ使えます (実際: ${typeToString(lt)} + ${typeToString(rt)})`, e.loc); return T_ANY; }
      return lt.kind === 'int' && rt.kind === 'int' ? T_INT : T_FLOAT;
    }
    if (op === '-' || op === '*') {
      if (!isNum(lt) || !isNum(rt)) { this.err(`${op} は数値同士でのみ使えます (実際: ${typeToString(lt)} ${op} ${typeToString(rt)})`, e.loc); return T_ANY; }
      return lt.kind === 'int' && rt.kind === 'int' ? T_INT : T_FLOAT;
    }
    if (op === '/') {
      if (!isNum(lt) || !isNum(rt)) { this.err(`/ は数値同士でのみ使えます`, e.loc); return T_ANY; }
      return T_FLOAT; // Python 風の真の除算
    }
    if (op === '%') {
      if (!isNum(lt) || !isNum(rt)) { this.err(`% は数値同士でのみ使えます`, e.loc); return T_ANY; }
      return lt.kind === 'int' && rt.kind === 'int' ? T_INT : T_FLOAT;
    }
    return T_ANY;
  }

  private checkName(e: Extract<Expr, { type: 'name' }>): SPType {
    const r = this.lookupName(e.name);
    if (!r) {
      if (this.ctx.spriteNames.includes(e.name) || e.name === this.ctx.stageName) {
        this.err(`'${e.name}' はスプライト/ステージ名です。値として使うには '${e.name}.x' のようにプロパティを参照してください`, e.loc);
      } else {
        this.err(`'${e.name}' が見つかりません(変数・パラメータ・プロパティのいずれでもありません)`, e.loc);
      }
      return T_ANY;
    }
    this.resolutions.set(e, r);
    switch (r.entity) {
      case 'var': return r.decl.varType;
      case 'param': return r.param.paramType;
      case 'property': return PROPERTIES[r.prop].returns;
      case 'list':
        this.err(`リスト '${e.name}' を値として直接使うことはできません。${e.name}[i] や len(${e.name}) を使ってください`, e.loc);
        return r.decl.varType;
    }
  }

  lookupName(name: string): NameResolution | null {
    if (this.scope.params?.has(name)) {
      return { entity: 'param', param: { name, paramType: this.scope.params.get(name)! } };
    }
    const lv = this.scope.localVars.get(name);
    if (lv) return lv;
    const ll = this.scope.localLists.get(name);
    if (ll) return ll;
    if (!this.scope.isStage) {
      const gv = this.ctx.stageVars.get(name);
      if (gv) return gv;
      const gl = this.ctx.stageLists.get(name);
      if (gl) return gl;
    }
    const p = PROPERTIES[name];
    if (p) {
      const ok = p.target === 'both' || (this.scope.isStage ? p.target === 'stage' : p.target === 'sprite');
      if (ok) return { entity: 'property', prop: name };
      // ステージで x など → 未定義扱い
    }
    return null;
  }

  private lookupVar(name: string): VarEntity | null {
    const r = this.lookupName(name);
    return r && r.entity === 'var' ? r : (this.ctx.stageVars.get(name) ?? null);
  }
  private lookupList(name: string): ListEntity | null {
    const local = this.scope.localLists.get(name);
    if (local) return local;
    if (!this.scope.isStage) {
      const g = this.ctx.stageLists.get(name);
      if (g) return g;
    }
    return null;
  }

  private checkProp(e: Extract<Expr, { type: 'prop' }>): SPType {
    if (e.obj.type !== 'name') {
      this.err('プロパティアクセスは「スプライト名.プロパティ」の形でのみ使えます', e.loc);
      this.checkExpr(e.obj);
      return T_ANY;
    }
    const objName = e.obj.name;
    // 参照先ターゲット: スプライト名 or ステージ名 / 'stage'
    const isStageRef = objName === this.ctx.stageName || objName === 'stage';
    const isSpriteRef = this.ctx.spriteNames.includes(objName);
    if (!isStageRef && !isSpriteRef) {
      // 自分自身のプロパティ? (例: 式内で obj.prop かつ obj が変数) → エラー
      this.err(`'${objName}' はスプライト名でもステージ名でもありません。他のスプライトの値は「スプライト名.プロパティ名」で参照します`, e.loc);
      return T_ANY;
    }
    const refTarget = isStageRef ? this.ctx.stageName : objName;
    // プロパティ
    if (SENSING_OF_PROPS[e.prop]) {
      const pdef = PROPERTIES[e.prop];
      const stageOnly = pdef?.target === 'stage';
      if (stageOnly && !isStageRef) {
        this.err(`'${e.prop}' はステージのみが持つプロパティです (${refTarget} にはありません)`, e.loc);
      }
      if (!stageOnly && isStageRef && pdef?.target === 'sprite') {
        this.err(`'${e.prop}' はスプライトのプロパティです。ステージにはありません`, e.loc);
      }
      return pdef?.returns ?? T_ANY;
    }
    // そのターゲットの変数/リスト
    const vars = isStageRef ? this.ctx.stageVars : this.ctx.spriteVars.get(refTarget);
    const v = vars?.get(e.prop);
    if (v) return v.decl.varType;
    const lists = isStageRef ? this.ctx.stageLists : this.ctx.spriteLists.get(refTarget);
    const l = lists?.get(e.prop);
    if (l) {
      this.err(`'${refTarget}.${e.prop}' はリストです。リストは他のスプライトから直接参照できません`, e.loc);
      return l.decl.varType;
    }
    // ステージ参照でグローバル変数にない場合 & スプライト参照 → グローバル変数も探す
    if (!isStageRef) {
      const gv = this.ctx.stageVars.get(e.prop);
      if (gv) return gv.decl.varType;
    }
    this.err(`'${refTarget}' にプロパティ/変数 '${e.prop}' はありません (使用可能: ${Object.keys(SENSING_OF_PROPS).join(', ')}, 変数名)`, e.loc);
    return T_ANY;
  }

  private checkCall(e: Extract<Expr, { type: 'call' }>): SPType {
    // メソッド呼び出し形式 → リストメソッドは文専用
    if (e.method) {
      this.err(`'${e.callee}' は値を返しません(文としてのみ使用できます)`, e.loc);
      e.args.forEach(a => this.checkExpr(a));
      return T_ANY;
    }
    const name = e.callee;
    // ユーザー定義ブロック
    const userDef = this.scope.defs.get(name);
    if (userDef) {
      if (e.args.length !== userDef.params.length) {
        this.err(`ブロック '${name}' の引数は ${userDef.params.length} 個ですが、${e.args.length} 個渡されています`, e.loc);
      }
      userDef.params.forEach((p, i) => {
        if (i < e.args.length) {
          const t = this.checkExpr(e.args[i]);
          // Scratch の %s 引数は数値・真偽も文字列として受け付ける(暗黙の文字列化)
          const strCoerce = p.paramType.kind === 'str' &&
            (t.kind === 'int' || t.kind === 'float' || t.kind === 'bool');
          if (!assignable(p.paramType, t) && !strCoerce) {
            this.err(`ブロック '${name}' の引数 '${p.name}' は ${typeToString(p.paramType)} 型です。${typeToString(t)} は渡せません`, e.args[i].loc ?? e.loc);
          }
        }
      });
      return T_ANY; // ScratchPy のカスタムブロックは値を返さない(コマンド)
    }
    // var() / list() 参照
    if (name === 'var') {
      if (e.args.length !== 1 || e.args[0].type !== 'str') {
        this.err('var("変数名") の形で使ってください', e.loc);
        e.args.forEach(a => this.checkExpr(a));
        return T_ANY;
      }
      const v = this.lookupVar(e.args[0].value);
      if (!v) this.err(`変数 '${e.args[0].value}' が見つかりません`, e.loc);
      return T_ANY;
    }
    if (name === 'list') {
      if (e.args.length !== 1 || e.args[0].type !== 'str') {
        this.err('list("リスト名") の形で使ってください', e.loc);
        e.args.forEach(a => this.checkExpr(a));
        return listOf(T_ANY);
      }
      const l = this.lookupList(e.args[0].value);
      if (!l) this.err(`リスト '${e.args[0].value}' が見つかりません`, e.loc);
      return listOf(T_ANY);
    }
    // show(x)/hide(x): x は変数/リスト名でなければならない
    if ((name === 'show' || name === 'hide') && e.args.length === 1) {
      const a = e.args[0];
      const nm = a.type === 'name' ? a.name : a.type === 'varref' ? a.name : a.type === 'listref' ? a.name : null;
      if (!nm || (!this.lookupVar(nm) && !this.lookupList(nm))) {
        this.err(`${name}(...) の引数は変数名またはリスト名です (スプライト自体の表示/非表示は引数なしの ${name}() を使ってください)`, e.loc);
      }
      return T_ANY;
    }
    // len() オーバーロード
    if (name === 'len') {
      if (e.args.length !== 1) { this.err('len() の引数は1個です', e.loc); return T_INT; }
      const arg=e.args[0];
      const list=(arg.type==='name'||arg.type==='listref') ? this.lookupList(arg.name) : null;
      if (list) { this.resolutions.set(arg,list); (arg as {spType?:SPType}).spType=list.decl.varType; }
      const t = list ? list.decl.varType : this.checkExpr(arg);
      if (t.kind !== 'str' && t.kind !== 'list' && t.kind !== 'any') {
        this.err(`len() は文字列またはリストに使えます (実際: ${typeToString(t)})`, e.loc);
      }
      return T_INT;
    }
    if (name === 'item_number') {
      if (e.args.length !== 2) { this.err('item_number() はリストと項目の2引数が必要です', e.loc); return T_INT; }
      const arg=e.args[0];
      const list=(arg.type==='name'||arg.type==='listref') ? this.lookupList(arg.name) : null;
      if (!list) this.err('item_number() の第1引数はリスト名です',arg.loc);
      else { this.resolutions.set(arg,list); (arg as {spType?:SPType}).spType=list.decl.varType; }
      this.checkExpr(e.args[1]);
      return T_INT;
    }
    const b = BUILTINS[name];
    if (!b) {
      this.err(`関数 '${name}' が見つかりません(ユーザー定義ブロックは def で宣言が必要です)`, e.loc);
      e.args.forEach(a => this.checkExpr(a));
      return T_ANY;
    }
    // ターゲット制約
    const targetOk = b.target === 'both' || (this.scope.isStage ? b.target === 'stage' : b.target === 'sprite');
    if (!targetOk) {
      this.err(`'${name}' は${b.target === 'sprite' ? 'スプライト専用です(ステージでは使えません)' : 'ステージ専用です'}`, e.loc);
    }
    if (name.startsWith('pen_') || ['stamp', 'clear_pen', 'set_pen_color', 'change_pen_param', 'set_pen_param', 'change_pen_size', 'set_pen_size'].includes(name)) {
      this.usesPen = true;
    }
    // オーバーロード解決
    const argTypes = e.args.map(a => this.checkExpr(a));
    const matched = this.matchOverload(b, e, argTypes);
    if (matched === null) return b.callType === 'reporter' ? (b.returns ?? T_ANY) : T_ANY;
    if (b.returnsFn) return b.returnsFn(argTypes);
    if (b.returns) {
      // abs は int → int
      if (name === 'abs') return argTypes[0]?.kind === 'int' ? T_INT : T_FLOAT;
      return b.returns;
    }
    return T_ANY; // command
  }

  /** オーバーロード照合 + 引数の型/メニューチェック。エラーを報告し、成功時は paramSpecs を返す */
  private matchOverload(b: BuiltinDef, e: Extract<Expr, { type: 'call' }>, argTypes: SPType[]): ParamSpec[] | null {
    const candidates = b.overloads.filter(o => {
      const min = o.filter(p => !p.optional).length;
      return e.args.length >= min && e.args.length <= o.length;
    });
    if (candidates.length === 0) {
      const arities = b.overloads.map(o => o.length).join(' または ');
      this.err(`'${b.calleeName ?? b.name}' の引数個数が合いません (${arities} 個必要、実際 ${e.args.length} 個)`, e.loc);
      return null;
    }
    // 型が最も合う候補を選ぶ
    let best: { spec: ParamSpec[]; score: number } | null = null;
    for (const spec of candidates) {
      let score = 0; let ok = true;
      for (let i = 0; i < e.args.length; i++) {
        const p = spec[i];
        if (!p) { ok = false; break; }
        if (this.paramAccepts(p, argTypes[i], e.args[i])) score += 2;
        else if (argTypes[i].kind === 'any' || this.paramTypeOf(p).kind === 'any') score += 1;
        else { ok = false; break; }
      }
      if (ok && (!best || score > best.score)) best = { spec, score };
    }
    if (!best) {
      const desc = candidates.map(o => `(${o.map(p => `${p.name}: ${p.type}`).join(', ')})`).join(' / ');
      this.err(`'${b.name}' の引数の型が合いません。期待される形: ${desc} / 実際の型: (${argTypes.map(typeToString).join(', ')})`, e.loc);
      return null;
    }
    // メニュー値・動的セットの検証
    best.spec.forEach((p, i) => {
      if (i >= e.args.length) return;
      if (p.type.startsWith('menu:')) {
        this.checkMenuParam(b, p, e.args[i], i, e.loc);
      }
    });
    return best.spec;
  }

  private paramTypeOf(p: ParamSpec): SPType {
    switch (p.type) {
      case 'int': return T_INT;
      case 'float': return T_FLOAT;
      case 'number': return T_FLOAT;
      case 'str': return T_STR;
      case 'bool': return T_BOOL;
      case 'color': return T_STR;
      case 'index': return T_INT;
      default: return T_ANY;
    }
  }

  private paramAccepts(p: ParamSpec, t: SPType, arg: Expr): boolean {
    switch (p.type) {
      case 'int': return t.kind === 'int' || t.kind === 'any';
      case 'float':
      case 'number': return isNum(t);
      case 'str': return t.kind === 'str' || t.kind === 'any' || t.kind === 'int' || t.kind === 'float' || t.kind === 'bool'; // Scratch は数値を文字列に自動変換する
      case 'bool': return isBoolish(t);
      case 'color': return t.kind === 'str' || t.kind === 'any';
      case 'index': return t.kind === 'int' || t.kind === 'any' || (arg.type === 'str' && ['last', 'random', 'all'].includes(arg.value));
      case 'varname': return true; // show/hide のオーバーロード解決用
      default:
        if (p.type.startsWith('menu:')) return t.kind === 'str' || t.kind === 'any';
        return true;
    }
  }

  private checkMenuParam(b: BuiltinDef, p: ParamSpec, arg: Expr, idx: number, loc?: Loc): void {
    const menuName = p.type.slice('menu:'.length);
    const base = MENUS[menuName] ?? [];
    // 動的要素を付加
    let allowed = [...base];
    if (menuName === 'touch_target' || menuName === 'goto_target' || menuName === 'clone_target') {
      allowed = allowed.concat(this.ctx.spriteNames);
      if (menuName === 'goto_target') allowed.push(this.ctx.stageName);
    }
    this.checkMenuValue(arg, allowed, `${b.name}() の引数 ${idx + 1} (${p.name})`, arg.loc ?? loc);
  }

  private checkMenuValue(arg: Expr, allowed: string[], what: string, loc?: Loc): void {
    if (arg.type === 'str') {
      if (!allowed.includes(arg.value)) {
        this.err(`${what} に "${arg.value}" は使えません。使用可能: ${allowed.slice(0, 12).map(s => `"${s}"`).join(', ')}${allowed.length > 12 ? ', …' : ''}`, loc);
      }
    } else if (arg.type !== 'name' && arg.type !== 'call' && arg.type !== 'varref' && arg.type !== 'prop' && arg.type !== 'index' && arg.type !== 'binary' && arg.type !== 'num') {
      // リテラルでない式(実行時に決まる値)は許容
    } else if (arg.type === 'num') {
      this.err(`${what} は文字列で指定してください`, loc);
    }
  }

  private checkCostumeName(arg: Expr, targetName: string, what: string, loc?: Loc): void {
    if (arg.type === 'str') {
      const names = this.ctx.costumes.get(targetName) ?? [];
      if (names.length && !names.includes(arg.value)) {
        this.warn(`${what} "${arg.value}" が見つかりません。使用可能: ${names.map(s => `"${s}"`).join(', ')}`, loc);
      }
    }
  }
}

// BuiltinDef に表示用の calleeName を足す(型拡張せず string でアクセス)
declare module './builtins' {
  interface BuiltinDef { calleeName?: string }
}

/** プログラムを型チェックする */
export function check(program: Program): CheckResult {
  return new Checker(program).run();
}

/** 参照スプライトのコスチューム/サウンド名検証ヘルパ(エクスポータでも使用) */
export function checkSoundName(ctx: ProjectContext, target: string, name: string): boolean {
  const sounds = ctx.sounds.get(target) ?? [];
  return sounds.length === 0 || sounds.includes(name);
}
