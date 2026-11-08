/**
 * Scratch 3.0 (.sb3 project.json) → ScratchPy AST インポータ
 * -------------------------------------------------------------
 * ブロックグラフを走査して AST を構築する。
 * - 変数の型は初期値と使用箇所から推論
 * - 非対応 opcode は RawUnsupportedStmt(コメント化)に変換し notes に記録
 * - アセットは AssetStore として保持(再エクスポート時に復元)
 */

import {
  Program, StageDef, SpriteDef, BodyItem, VarDecl, ListDecl, Stmt, Expr,
  EventDef, FuncDef, Hat, IfStmt, SPType, T_INT, T_FLOAT, T_STR, T_BOOL, T_ANY,
  listOf, ConfigDecl, MonitorMode, CommentStmt,
} from '../lang/ast';
import { KEYWORDS } from '../lang/lexer';
import { printStmts } from '../lang/printer';
import { SENSING_OF_PROPS } from '../lang/builtins';
import {
  SB3Project, SB3Target, SB3Block, SB3Monitor, BlockInput, InputValue,
} from './model';
import { AssetStore, emptyAssetStore, assetKey } from './exporter';

// ---------------------------------------------------------------------------
export interface ImportResult {
  program: Program;
  assetStore: AssetStore;
  notes: string[];
  unsupportedOpcodes: Record<string, number>;
}

const IDENT_RE = /^[\p{L}\p{Nl}_][\p{L}\p{Nl}\p{Mn}\p{Mc}\p{Nd}\p{Pc}_]*$/u;

function isIdent(name: string): boolean {
  return IDENT_RE.test(name) && !KEYWORDS.has(name);
}

function sanitizeIdent(name: string, used: Set<string>): string {
  let s = name.replace(/[^\p{L}\p{Nl}\p{Nd}\p{Pc}_]/gu, '_');
  if (!s || /^[\p{Nd}]/u.test(s)) s = '_' + s;
  if (KEYWORDS.has(s)) s = s + '_';
  let out = s; let n = 2;
  while (used.has(out)) out = `${s}_${n++}`;
  used.add(out);
  return out;
}

interface VarMeta {
  id: string; name: string; cloud: boolean; owner: string; isStage: boolean;
  numeric: boolean; hasDecimal: boolean; boolish: boolean;
}
interface ListMeta { id: string; name: string; owner: string; isStage: boolean; elemType: SPType }

// sensing_of PROPERTY → ScratchPy プロパティ名
const PROP_REVERSE: Record<string, string> = {};
for (const [k, v] of Object.entries(SENSING_OF_PROPS)) PROP_REVERSE[v] = k;

// メニュー値の逆変換
function unmenu(v: string): string {
  switch (v) {
    case '_mouse_': return 'mouse';
    case '_edge_': return 'edge';
    case '_random_': return 'random';
    case '_myself_': return 'myself';
    case '_stage_': return 'stage';
    default: return v;
  }
}

const MATHOP_REVERSE: Record<string, string> = {
  abs: 'abs', floor: 'floor', ceiling: 'ceil', sqrt: 'sqrt',
  sin: 'sin', cos: 'cos', tan: 'tan', asin: 'asin', acos: 'acos', atan: 'atan',
  ln: 'ln', log: 'log10', '10 ^': 'pow10', 'e ^': 'exp',
};

// レポータ opcode → ScratchPy プロパティ名(括弧なし)
const PROPERTY_OPCODES: Record<string, string> = {
  motion_xposition: 'x', motion_yposition: 'y', motion_direction: 'direction',
  looks_size: 'size', looks_costumenumber: 'costume_number', looks_costumename: 'costume_name',
  looks_backdropnumber: 'backdrop_number', looks_backdropname: 'backdrop_name',
  sound_volume: 'volume',
  sensing_mousex: 'mouse_x', sensing_mousey: 'mouse_y', sensing_mousedown: 'mouse_down',
  sensing_timer: 'timer', sensing_loudness: 'loudness', sensing_answer: 'answer',
  sensing_username: 'username', sensing_dayssince2000: 'days_since_2000',
  sensing_dragging: 'dragging',
  music_getTempo: 'tempo',
};

class Importer {
  notes: string[] = [];
  unsupported = new Map<string, number>();
  assetStore: AssetStore = emptyAssetStore();

  varMeta = new Map<string, VarMeta>();      // id → meta
  varMetaByName = new Map<string, VarMeta>(); // `${owner}\u0000${name}` → meta
  listMeta = new Map<string, ListMeta>();
  listMetaByName = new Map<string, ListMeta>();
  stageName = 'Stage';
  spriteNames = new Set<string>();
  spriteIdentNames = new Map<string, string>(); // 元の名前 → 識別子名
  /** procedure: `${target}\u0000${proccode}` → FuncDef 情報 */
  procNames = new Map<string, string>();
  /** 引数名のリネーム: `${target}\u0000${rawName}` → identifier */
  paramRenames = new Map<string, string>();

  private files: Map<string, Uint8Array> = new Map();

  importProject(project: SB3Project, files?: Map<string, Uint8Array>): ImportResult {
    if (files) this.files = files;
    if (!project || !Array.isArray(project.targets) || project.targets.length === 0) {
      throw new Error('project.json が不正です (targets がありません)');
    }
    const stage = project.targets.find(t => t.isStage);
    if (!stage) throw new Error('project.json にステージがありません');
    this.stageName = stage.name || 'Stage';

    // スプライト名の識別子化
    const usedNames = new Set<string>([this.stageName]);
    for (const t of project.targets) {
      if (t.isStage) continue;
      this.spriteNames.add(t.name);
      if (isIdent(t.name)) {
        this.spriteIdentNames.set(t.name, t.name);
        usedNames.add(t.name);
      }
    }
    for (const t of project.targets) {
      if (t.isStage) continue;
      if (!this.spriteIdentNames.has(t.name)) {
        const id = sanitizeIdent(t.name, usedNames);
        this.spriteIdentNames.set(t.name, id);
        this.notes.push(`スプライト名「${t.name}」を識別子「${id}」に変換しました(プロパティ参照を可能にするため)`);
      }
    }

    this.collectVarListMeta(project);
    this.analyzeVariableUsage(project);
    this.collectProcNames(project);
    this.importMonitors(project);

    const stageDef = this.importStage(stage);
    const sprites = project.targets.filter(t => !t.isStage).map((t, i) => this.importSprite(t, i));

    const program: Program = { type: 'program', stage: stageDef, sprites, comments: [] };

    // 未対応拡張の記録
    for (const ext of project.extensions ?? []) {
      if (ext !== 'pen' && ext !== 'music') {
        this.notes.push(`拡張機能「${ext}」のブロックはコメントとして保持されます(実行コードには変換されません)`);
      }
    }

    const unsupportedOpcodes: Record<string, number> = {};
    for (const [op, n] of this.unsupported) unsupportedOpcodes[op] = n;
    if (this.unsupported.size) {
      this.notes.push(`未対応ブロック: ${[...this.unsupported.entries()].map(([op, n]) => `${op}×${n}`).join(', ')} → コメント行に変換されました(再エクスポート時には失われます)`);
    }
    return { program, assetStore: this.assetStore, notes: this.notes, unsupportedOpcodes };
  }

  // --- メタ収集 --------------------------------------------------------------
  private collectVarListMeta(project: SB3Project): void {
    for (const t of project.targets) {
      for (const [id, entry] of Object.entries(t.variables ?? {})) {
        let name = String(entry[0]);
        const cloud = name.startsWith('☁ ') || entry[2] === true;
        if (name.startsWith('☁ ')) name = name.slice(2);
        const meta: VarMeta = {
          id, name, cloud, owner: t.name, isStage: t.isStage,
          numeric: cloud, hasDecimal: false, boolish: false,
        };
        this.varMeta.set(id, meta);
        this.varMetaByName.set(`${t.name}\u0000${name}`, meta);
      }
      for (const [id, entry] of Object.entries(t.lists ?? {})) {
        const items = (entry[1] ?? []) as (string | number)[];
        const allNum = items.length > 0 && items.every(v => typeof v === 'number');
        const elemType: SPType = allNum ? (items.every(v => Number.isInteger(v as number)) ? T_INT : T_FLOAT) : T_ANY;
        const meta: ListMeta = { id, name: String(entry[0]), owner: t.name, isStage: t.isStage, elemType };
        this.listMeta.set(id, meta);
        this.listMetaByName.set(`${t.name}\u0000${meta.name}`, meta);
      }
    }
  }

  /** 変数の使用箇所を走査し型を推論する */
  private analyzeVariableUsage(project: SB3Project): void {
    for (const t of project.targets) {
      for (const b of Object.values(t.blocks ?? {})) {
        // data_changevariableby → 数値使用
        if (b.opcode === 'data_changevariableby' && b.fields?.VARIABLE) {
          const id = String(b.fields.VARIABLE[1] ?? '');
          const meta = this.varMeta.get(id) ?? this.findVarAnywhere(String(b.fields.VARIABLE[0] ?? ''));
          if (meta) meta.numeric = true;
        }
        // 数値系の入力穴に変数リテラルが差し込まれているか
        const numericInputs = new Set([
          'STEPS', 'DEGREES', 'X', 'Y', 'DX', 'DY', 'SECS', 'DURATION', 'TIMES', 'SIZE',
          'CHANGE', 'VALUE_NUM', 'NUM', 'FROM', 'TO', 'OPERAND_NUM', 'NUM1', 'NUM2',
          'DIRECTION', 'VOLUME', 'LETTER', 'INDEX',
        ]);
        // 演算ブロックの NUM1/NUM2 は数値文脈
        for (const [inputName, input] of Object.entries(b.inputs ?? {})) {
          const lit = this.extractLiteral(input);
          if (lit && Array.isArray(lit) && lit[0] === 12) {
            const meta = this.varMeta.get(String(lit[2]));
            if (meta) {
              const isNumericSlot =
                numericInputs.has(inputName) ||
                ['operator_add', 'operator_subtract', 'operator_multiply', 'operator_divide', 'operator_mod', 'operator_round', 'operator_mathop', 'operator_random', 'operator_gt', 'operator_lt'].includes(b.opcode) ||
                b.opcode.startsWith('motion_') || b.opcode.startsWith('looks_change') ||
                b.opcode.startsWith('looks_set') || b.opcode.startsWith('sound_change') ||
                b.opcode.startsWith('sound_set') || b.opcode.startsWith('pen_') ||
                b.opcode === 'control_wait' || b.opcode === 'control_repeat' ||
                b.opcode === 'event_whengreaterthan';
              if (isNumericSlot) meta.numeric = true;
            }
          }
        }
      }
    }
    // 初期値による推論
    for (const t of project.targets) {
      for (const [id, entry] of Object.entries(t.variables ?? {})) {
        const meta = this.varMeta.get(id);
        if (!meta) continue;
        const v = entry[1];
        if (typeof v === 'number') { meta.numeric = true; if (!Number.isInteger(v)) meta.hasDecimal = true; }
        else if (typeof v === 'boolean') { meta.boolish = true; }
        else if (typeof v === 'string') {
          if (/^[-+]?(\d+\.?\d*|\.\d+)([eE][-+]?\d+)?$/.test(v.trim()) && Number.isFinite(Number(v)) && !Number.isInteger(Number(v))) { meta.hasDecimal = true; }
        }
      }
    }
  }

  private findVarAnywhere(name: string): VarMeta | undefined {
    for (const [, m] of this.varMetaByName) {
      if (m.name === name.replace(/^☁ /, '')) return m;
    }
    return undefined;
  }

  private varType(meta: VarMeta): SPType {
    if (meta.boolish && !meta.numeric) return T_BOOL;
    if (meta.numeric) return meta.hasDecimal ? T_FLOAT : T_INT;
    return T_STR;
  }

  private importMonitors(project: SB3Project): void {
    // 変数/リストモニターは各 VarMeta/ListMeta に記録(宣言時に使用)
    this.monitorByVarId = new Map();
    this.monitorByListId = new Map();
    const ignoredMonitorOpcodes = new Set<string>();
    for (const m of project.monitors ?? []) {
      if (m.opcode === 'data_variable' && this.varMeta.has(m.id)) {
        this.monitorByVarId.set(m.id, m);
      } else if (m.opcode === 'data_listcontents' && this.listMeta.has(m.id)) {
        this.monitorByListId.set(m.id, m);
      } else {
        ignoredMonitorOpcodes.add(m.opcode);
      }
    }
    if (ignoredMonitorOpcodes.size) {
      this.notes.push(`値モニター(${[...ignoredMonitorOpcodes].join(', ')})は変換対象外のため無視しました`);
    }
  }
  monitorByVarId = new Map<string, SB3Monitor>();
  monitorByListId = new Map<string, SB3Monitor>();

  private collectProcNames(project: SB3Project): void {
    for (const t of project.targets) {
      const used = new Set<string>();
      for (const b of Object.values(t.blocks ?? {})) {
        if (b.opcode === 'procedures_prototype' && b.mutation) {
          const proccode = String(b.mutation.proccode ?? '');
          const defName = this.procBaseName(proccode, used);
          this.procNames.set(`${t.name}\u0000${proccode}`, defName);
        }
      }
    }
  }

  private procBaseName(proccode: string, used: Set<string>): string {
    // ラベル部分を除去してベース名を作る: "say %s %n times" → "say"
    const base = proccode.split('%')[0].trim() || proccode.replace(/%[sbn]/g, '').trim() || 'block';
    if (isIdent(base)) {
      let out = base; let n = 2;
      while (used.has(out)) out = `${base}_${n++}`;
      used.add(out);
      return out;
    }
    return sanitizeIdent(base, used);
  }

  // --- ステージ/スプライト ----------------------------------------------------
  private importStage(t: SB3Target): StageDef {
    const body: BodyItem[] = [];
    const nameIsDefault = t.name === 'Stage';
    const stage: StageDef = {
      decl: 'stage',
      name: nameIsDefault ? undefined : t.name,
      quoted: !nameIsDefault,
      body,
    };
    this.pushConfigs(body, t, true);
    this.pushVarsLists(body, t);
    this.pushAssets(body, t);
    this.pushScripts(body, t);
    return stage;
  }

  private importSprite(t: SB3Target, index: number): SpriteDef {
    const ident = this.spriteIdentNames.get(t.name) ?? t.name;
    const body: BodyItem[] = [];
    const sp: SpriteDef = {
      decl: 'sprite',
      name: ident,
      quoted: !isIdent(ident),
      body,
    };
    this.pushConfigs(body, t, false, index + 1);
    this.pushVarsLists(body, t);
    this.pushAssets(body, t);
    this.pushScripts(body, t);
    return sp;
  }

  private pushConfigs(body: BodyItem[], t: SB3Target, isStage: boolean, expectedOrder = 0): void {
    const cfg = (key: string, value: Expr): void => { body.push({ decl: 'config', key, value } as ConfigDecl); };
    if (isStage) {
      if (t.tempo !== undefined && t.tempo !== 60) cfg('tempo', num(t.tempo));
      if (t.videoState !== undefined && t.videoState !== 'on') cfg('video_state', str(t.videoState));
      if (t.videoTransparency !== undefined && t.videoTransparency !== 50) cfg('video_transparency', num(t.videoTransparency));
      if (t.volume !== undefined && t.volume !== 100) cfg('volume', num(t.volume));
      if (t.currentCostume !== 0) cfg('current_costume', num(t.currentCostume));
      if (t.textToSpeechLanguage) cfg('tts_language', str(t.textToSpeechLanguage));
    } else {
      if (t.x !== 0) cfg('x', num(t.x!));
      if (t.y !== 0) cfg('y', num(t.y!));
      if (t.direction !== undefined && t.direction !== 90) cfg('direction', num(t.direction));
      if (t.size !== undefined && t.size !== 100) cfg('size', num(t.size));
      if (t.visible === false) cfg('visible', bool(false));
      if (t.draggable === true) cfg('draggable', bool(true));
      if (t.rotationStyle !== undefined && t.rotationStyle !== 'all around') cfg('rotation_style', str(t.rotationStyle));
      if (t.volume !== undefined && t.volume !== 100) cfg('volume', num(t.volume));
      if (t.currentCostume !== 0) cfg('current_costume', num(t.currentCostume));
      if (t.layerOrder !== undefined && t.layerOrder !== expectedOrder) cfg('layer_order', num(t.layerOrder));
    }
  }

  private pushVarsLists(body: BodyItem[], t: SB3Target): void {
    for (const [id, entry] of Object.entries(t.variables ?? {})) {
      const meta = this.varMeta.get(id)!;
      let vtype = this.varType(meta);
      const raw = entry[1];
      let init: Expr;
      if (typeof raw === 'boolean') init = bool(raw);
      else if (typeof raw === 'number') init = num(raw);
      else {
        const s = String(raw);
        if (vtype.kind === 'int' || vtype.kind === 'float') {
          const trimmed = s.trim();
          if ((trimmed === '' || /^[-+]?(\d+\.?\d*|\.\d+)([eE][-+]?\d+)?$/.test(trimmed)) && Number.isFinite(Number(trimmed)) && (!meta.cloud || !Number.isInteger(Number(trimmed)) || Number.isSafeInteger(Number(trimmed)))) {
            init = num(Number(trimmed));
            if (meta.cloud && s !== String(Number(trimmed))) this.notes.push(`クラウド変数「${meta.name}」の初期値「${s}」は数値として「${Number(trimmed)}」に正規化されます`);
          } else {
            // 数値として使われているが今は文字列を保持 → 静的型では any に広げる
            init = str(s);
            vtype = T_ANY;
            if (meta.cloud) this.notes.push(`クラウド変数「${meta.name}」の初期値は安全に数値へ変換できません。元の値を保持するため、書き出し前に修正が必要です`);
          }
        } else {
          init = str(s);
        }
      }
      const decl: VarDecl = {
        decl: 'var', name: meta.name, quoted: !isIdent(meta.name),
        varType: vtype, init, cloud: meta.cloud,
      };
      const mon = this.monitorByVarId.get(id);
      if (mon) {
        const mode = (mon.mode === 'list' ? 'default' : mon.mode) as MonitorMode;
        decl.monitor = {
          mode,
          visible: mon.visible,
          ...(mode === 'slider' ? {
            min: (mon.sliderMin ?? mon.min ?? 0) as number,
            max: (mon.sliderMax ?? mon.max ?? 100) as number,
          } : {}),
        };
      }
      body.push(decl);
    }
    for (const [id, entry] of Object.entries(t.lists ?? {})) {
      const meta = this.listMeta.get(id)!;
      const items = (entry[1] ?? []) as (string | number)[];
      const init: Expr[] = items.map(v => (typeof v === 'number' ? num(v) : typeof v === 'boolean' ? bool(v) : str(String(v))));
      // 要素型推論
      let elem: SPType = meta.elemType ?? T_ANY;
      const allNum = items.length > 0 && items.every(v => typeof v === 'number');
      const allInt = allNum && items.every(v => Number.isInteger(v as number));
      const allStr = items.length > 0 && items.every(v => typeof v === 'string');
      if (allInt) elem = T_INT;
      else if (allNum) elem = T_FLOAT;
      else if (allStr) elem = T_STR;
      else if (items.length === 0) elem = meta?.elemType ?? T_ANY;
      meta.elemType = elem;
      const decl: ListDecl = {
        decl: 'list', name: meta.name, quoted: !isIdent(meta.name),
        varType: listOf(elem), init,
      };
      const mon = this.monitorByListId.get(id);
      if (mon) decl.monitor = { mode: 'list', visible: mon.visible };
      body.push(decl);
    }
  }

  private pushAssets(body: BodyItem[], t: SB3Target): void {
    for (const c of t.costumes ?? []) {
      body.push({ decl: 'costume', name: c.name });
      const bytes = this.files.get(c.md5ext);
      if (bytes) {
        this.assetStore.costumes.set(assetKey(t.name, c.name), {
          bytes,
          dataFormat: c.dataFormat === 'png' ? 'png' : 'svg',
          rotationCenterX: c.rotationCenterX ?? (t.isStage ? 240 : 48),
          rotationCenterY: c.rotationCenterY ?? (t.isStage ? 180 : 50),
          bitmapResolution: c.bitmapResolution,
        });
      } else {
        this.notes.push(`コスチューム「${c.name}」(${t.name}) の実ファイル ${c.md5ext} が zip 内に見つかりませんでした。再エクスポート時はデフォルト画像になります`);
      }
    }
    for (const s of t.sounds ?? []) {
      body.push({ decl: 'sound', name: s.name });
      const bytes = this.files.get(s.md5ext);
      if (bytes) {
        this.assetStore.sounds.set(assetKey(t.name, s.name), {
          bytes,
          dataFormat: s.dataFormat === 'mp3' ? 'mp3' : 'wav',
          rate: s.rate ?? 22050,
          sampleCount: s.sampleCount ?? 0,
          format: s.format ?? '',
        });
      } else {
        this.notes.push(`音「${s.name}」(${t.name}) の実ファイル ${s.md5ext} が zip 内に見つかりませんでした。再エクスポート時は無音になります`);
      }
    }
  }

  // --- スクリプト --------------------------------------------------------------
  private pushScripts(body: BodyItem[], t: SB3Target): void {
    this.currentTarget = t;
    this.currentTargetBlocks = t.blocks ?? {};
    const blocks = t.blocks ?? {};
    if (Object.keys(blocks).length && t.comments && Object.keys(t.comments).length) {
      this.notes.push(`${t.name}: Scratch のコメントブロック(${Object.keys(t.comments).length}個)はテキストのコメントとしては復元されません`);
    }
    const tops = Object.entries(blocks).filter(([, b]) => b.topLevel && !b.shadow);
    // y → x の順にソートして見た目順に近い出力にする
    tops.sort((a, b2) => (a[1].y ?? 0) - (b2[1].y ?? 0) || (a[1].x ?? 0) - (b2[1].x ?? 0));
    for (const [id, b] of tops) {
      if (b.opcode === 'procedures_definition') {
        const d = this.importProcedure(t, id, b);
        if (d) body.push(d);
        continue;
      }
      const hat = this.importHat(b);
      if (hat) {
        const stmts = this.importChain(t, blocks, b.next);
        body.push({ decl: 'event', hat, body: stmts.length ? stmts : [{ type: 'pass' }] } as EventDef);
        continue;
      }
      if (isReporterish(b.opcode)) {
        this.notes.push(`${t.name}: 孤立したレポータブロック「${b.opcode}」(値を返すだけのブロック)は無視しました`);
        continue;
      }
      // 孤立したコマンドブロック(実行されない) → 中身を完全にコメントで残す
      const orphan = this.importChain(t, blocks, id);
      for (const s of orphan) {
        const lines = printStmts([s], 0);
        for (let li = 0; li < lines.length; li++) {
          body.push({
            type: 'comment',
            text: (li === 0 ? ' [孤立ブロック・実行されません] ' : '   ') + lines[li].trim(),
          } as CommentStmt);
        }
      }
      this.notes.push(`${t.name}: ハットブロックなしの孤立したスクリプト(${b.opcode})はコメント化しました`);
    }
  }

  private importHat(b: SB3Block): Hat | null {
    switch (b.opcode) {
      case 'event_whenflagclicked': return { hat: 'flag' };
      case 'event_whenthisspriteclicked': return { hat: 'click' };
      case 'event_whenstartasclone':
      case 'control_start_as_clone': return { hat: 'clone' };
      case 'event_whenkeypressed':
        return { hat: 'key', key: str(String(b.fields?.KEY_OPTION?.[0] ?? 'space')) };
      case 'event_whenbroadcastreceived':
        return { hat: 'receive', msg: str(String(b.fields?.BROADCAST_OPTION?.[0] ?? '')) };
      case 'event_whenbackdropswitchesto':
        return { hat: 'backdrop', name: str(String(b.fields?.BACKDROP?.[0] ?? '')) };
      case 'event_whengreaterthan': {
        const sensor = String(b.fields?.WHENGREATTHANMENU?.[0] ?? 'TIMER') === 'LOUDNESS' ? 'loudness' : 'timer';
        const value = this.inputExpr(b.inputs?.VALUE, 'num');
        return { hat: 'greaterthan', sensor, value };
      }
      default: return null;
    }
  }

  private importProcedure(t: SB3Target, defId: string, b: SB3Block): FuncDef | null {
    const protoInput = b.inputs?.custom_block;
    const protoId = typeof protoInput?.[1] === 'string' ? protoInput[1] : null;
    const proto = protoId ? t.blocks[protoId] : null;
    if (!proto || !proto.mutation) {
      this.noteUnsupported(t.name, 'procedures_definition(malformed)');
      return null;
    }
    const proccode = String(proto.mutation.proccode ?? '');
    const used = new Set<string>();
    const defName = this.procNames.get(`${t.name}\u0000${proccode}`) ?? this.procBaseName(proccode, used);
    let argIds: string[] = [];
    let argNames: string[] = [];
    try { argIds = JSON.parse(String(proto.mutation.argumentids ?? '[]')); } catch { /* noop */ }
    try { argNames = JSON.parse(String(proto.mutation.argumentnames ?? '[]')); } catch { /* noop */ }
    const warp = proto.mutation.warp === 'true' || proto.mutation.warp === true;
    const params = argIds.map((uid, i) => {
      const rawName = argNames[i] ?? `arg${i + 1}`;
      const repInput = proto.inputs?.[uid];
      const repId = typeof repInput?.[1] === 'string' ? repInput[1] : null;
      const rep = repId ? t.blocks[repId] : null;
      const isBool = rep?.opcode === 'argument_reporter_boolean';
      const name = isIdent(rawName) ? rawName : sanitizeIdent(rawName, used);
      if (name !== rawName) {
        this.notes.push(`${t.name}: ブロック「${defName}」の引数名「${rawName}」を「${name}」に変換しました`);
      }
      this.paramRenames.set(`${t.name}\u0000${rawName}`, name);
      return { name, paramType: isBool ? T_BOOL : T_ANY };
    });
    if (proccode.split('%').length - 1 !== argIds.length || /%[^sbn]/.test(proccode.replace(/%%/g, ''))) {
      this.notes.push(`${t.name}: プロシージャ「${proccode}」のラベルテキストは簡略化されました (ScratchPy名: ${defName})`);
    } else if (proccode.includes('%')) {
      this.notes.push(`${t.name}: プロシージャ「${proccode}」→ def ${defName}(...) に変換 (ラベル文字列は省略されます)`);
    }
    const bodyStmts = this.importChain(t, t.blocks, b.next);
    return {
      decl: 'def', name: defName, params, warp,
      body: bodyStmts.length ? bodyStmts : [{ type: 'pass' }],
    };
  }

  /** next チェーンをたどって文のリストを作る */
  private importChain(t: SB3Target, blocks: Record<string, SB3Block>, startId: string | null): Stmt[] {
    const out: Stmt[] = [];
    let id = startId;
    const guard = new Set<string>();
    while (id && !guard.has(id)) {
      guard.add(id);
      const b = blocks[id];
      if (!b) break;
      const stmt = this.importStmt(t, blocks, id, b);
      if (stmt) out.push(stmt);
      id = b.next;
    }
    return out;
  }

  private substack(t: SB3Target, blocks: Record<string, SB3Block>, b: SB3Block, name: string): Stmt[] {
    const input = b.inputs?.[name];
    const firstId = typeof input?.[1] === 'string' ? input[1] : null;
    const stmts = this.importChain(t, blocks, firstId);
    return stmts.length ? stmts : [{ type: 'pass' }];
  }

  // --- 文変換 ------------------------------------------------------------------
  private importStmt(t: SB3Target, blocks: Record<string, SB3Block>, id: string, b: SB3Block): Stmt | null {
    const call = (name: string, args: Expr[]): Stmt => ({ type: 'exprstmt', expr: { type: 'call', callee: name, args } });
    switch (b.opcode) {
      // --- motion ---
      case 'motion_movesteps': return call('move', [this.inputExpr(b.inputs?.STEPS, 'num')]);
      case 'motion_turnright': return call('turn_right', [this.inputExpr(b.inputs?.DEGREES, 'num')]);
      case 'motion_turnleft': return call('turn_left', [this.inputExpr(b.inputs?.DEGREES, 'num')]);
      case 'motion_gotoxy': return call('goto', [this.inputExpr(b.inputs?.X, 'num'), this.inputExpr(b.inputs?.Y, 'num')]);
      case 'motion_goto': return call('goto', [this.menuExpr(t, b, 'TO', 'motion_goto_menu')]);
      case 'motion_glidesecstoxy': return call('glide', [this.inputExpr(b.inputs?.SECS, 'num'), this.inputExpr(b.inputs?.X, 'num'), this.inputExpr(b.inputs?.Y, 'num')]);
      case 'motion_glideto': return call('glide', [this.inputExpr(b.inputs?.SECS, 'num'), this.menuExpr(t, b, 'TO', 'motion_goto_menu')]);
      case 'motion_pointindirection': return call('point', [this.inputExpr(b.inputs?.DIRECTION, 'num')]);
      case 'motion_pointtowards': return call('point_towards', [this.menuExpr(t, b, 'TOWARDS', 'motion_pointtowards_menu')]);
      case 'motion_changexby': return call('change_x', [this.inputExpr(b.inputs?.X, 'num')]);
      case 'motion_setx': return call('set_x', [this.inputExpr(b.inputs?.X, 'num')]);
      case 'motion_changeyby': return call('change_y', [this.inputExpr(b.inputs?.Y, 'num')]);
      case 'motion_sety': return call('set_y', [this.inputExpr(b.inputs?.Y, 'num')]);
      case 'motion_ifonedgebounce': return call('bounce', []);
      case 'motion_setrotationstyle': return call('set_rotation_style', [str(String(b.fields?.STYLE?.[0] ?? 'all around'))]);
      // --- looks ---
      case 'looks_say': return call('say', [this.inputExpr(b.inputs?.MESSAGE, 'str')]);
      case 'looks_sayforsecs': return call('say', [this.inputExpr(b.inputs?.MESSAGE, 'str'), this.inputExpr(b.inputs?.SECS, 'num')]);
      case 'looks_think': return call('think', [this.inputExpr(b.inputs?.MESSAGE, 'str')]);
      case 'looks_thinkforsecs': return call('think', [this.inputExpr(b.inputs?.MESSAGE, 'str'), this.inputExpr(b.inputs?.SECS, 'num')]);
      case 'looks_show': return call('show', []);
      case 'looks_hide': return call('hide', []);
      case 'looks_switchcostumeto': return call('switch_costume', [this.menuExpr(t, b, 'COSTUME', 'looks_costume')]);
      case 'looks_nextcostume': return call('next_costume', []);
      case 'looks_switchbackdropto': return call('switch_backdrop', [this.menuExpr(t, b, 'BACKDROP', 'looks_backdrops')]);
      case 'looks_switchbackdroptoandwait': return call('switch_backdrop_and_wait', [this.menuExpr(t, b, 'BACKDROP', 'looks_backdrops')]);
      case 'looks_nextbackdrop': return call('next_backdrop', []);
      case 'looks_changesizeby': return call('change_size', [this.inputExpr(b.inputs?.CHANGE, 'num')]);
      case 'looks_setsizeto': return call('set_size', [this.inputExpr(b.inputs?.SIZE, 'num')]);
      case 'looks_changeeffectby': return call('change_effect', [str(String(this.menuFieldValue(t, b, 'EFFECT', 'looks_effect_menu')).toLowerCase()), this.inputExpr(b.inputs?.CHANGE, 'num')]);
      case 'looks_seteffectto': return call('set_effect', [str(String(this.menuFieldValue(t, b, 'EFFECT', 'looks_effect_menu')).toLowerCase()), this.inputExpr(b.inputs?.VALUE, 'num')]);
      case 'looks_cleargraphiceffects': return call('clear_effects', []);
      case 'looks_gotofrontback': return call('go_to_layer', [str(String(b.fields?.FRONT_BACK?.[0] ?? 'front'))]);
      case 'looks_goforwardbackwardby': return call('change_layer', [str(String(b.fields?.FORWARD_BACKWARD?.[0] ?? 'forward')), this.inputExpr(b.inputs?.NUM, 'num')]);
      // --- sound ---
      case 'sound_play': return call('play_sound', [this.menuExpr(t, b, 'SOUND_MENU', 'sound_sounds_menu')]);
      case 'sound_playuntildone': return call('play_sound_until_done', [this.menuExpr(t, b, 'SOUND_MENU', 'sound_sounds_menu')]);
      case 'sound_stopallsounds': return call('stop_all_sounds', []);
      case 'sound_changevolumeby': return call('change_volume', [this.inputExpr(b.inputs?.VOLUME, 'num')]);
      case 'sound_setvolumeto': return call('set_volume', [this.inputExpr(b.inputs?.VOLUME, 'num')]);
      case 'sound_changeeffectby': return call('change_sound_effect', [str(String(this.menuFieldValue(t, b, 'EFFECT', 'sound_effectsmenu')).toLowerCase()), this.inputExpr(b.inputs?.VALUE, 'num')]);
      case 'sound_seteffectto': return call('set_sound_effect', [str(String(this.menuFieldValue(t, b, 'EFFECT', 'sound_effectsmenu')).toLowerCase()), this.inputExpr(b.inputs?.VALUE, 'num')]);
      case 'sound_cleareffects': return call('clear_sound_effects', []);
      // --- event ---
      case 'event_broadcast': return { type: 'broadcast', msg: this.broadcastExpr(b.inputs?.BROADCAST_INPUT), wait: false };
      case 'event_broadcastandwait': return { type: 'broadcast', msg: this.broadcastExpr(b.inputs?.BROADCAST_INPUT), wait: true };
      // --- control ---
      case 'control_wait': return { type: 'wait', secs: this.inputExpr(b.inputs?.DURATION, 'num') };
      case 'control_wait_until': return call('wait_until', [this.boolExpr(b.inputs?.CONDITION)]);
      case 'control_repeat': return { type: 'repeat', count: this.inputExpr(b.inputs?.TIMES, 'num'), body: this.substack(t, blocks, b, 'SUBSTACK') };
      case 'control_forever': return { type: 'forever', body: this.substack(t, blocks, b, 'SUBSTACK') };
      case 'control_if': {
        const branches = [{ cond: this.boolExpr(b.inputs?.CONDITION), body: this.substack(t, blocks, b, 'SUBSTACK') }];
        return { type: 'if', branches } as IfStmt;
      }
      case 'control_if_else': {
        return { type: 'if', branches: this.flattenIfElse(t, blocks, b) } as IfStmt;
      }
      case 'control_repeat_until': {
        const cond = this.boolExpr(b.inputs?.CONDITION);
        // not X → while X (二重否定の解消)
        const unwrapped = cond.type === 'unary' && cond.op === 'not' ? cond.operand : { type: 'unary', op: 'not', operand: cond } as Expr;
        return { type: 'while', cond: unwrapped, body: this.substack(t, blocks, b, 'SUBSTACK') };
      }
      case 'control_stop': {
        const opt = String(b.fields?.STOP_OPTION?.[0] ?? 'all');
        const what = opt === 'other scripts in sprite' ? 'other scripts' : opt;
        if (!['all', 'this script', 'other scripts'].includes(what)) {
          this.noteUnsupported(t.name, `control_stop(${opt})`);
          return null;
        }
        return { type: 'stop', what: what as 'all' };
      }
      case 'control_create_clone_of': return { type: 'clone', action: 'create', target: this.cloneTargetExpr(t, b) };
      case 'control_delete_this_clone': return { type: 'clone', action: 'delete' };
      // --- sensing ---
      case 'sensing_askandwait': return { type: 'ask', question: this.inputExpr(b.inputs?.QUESTION, 'str') };
      case 'sensing_resettimer': return call('reset_timer', []);
      case 'sensing_setdragmode': return call('set_drag_mode', [str(String(b.fields?.DRAG_MODE?.[0] ?? 'sync'))]);
      // --- data ---
      case 'data_setvariableto': {
        const target = this.varTargetExpr(t, b.fields?.VARIABLE);
        const meta = this.varMetaByIdField(t, b.fields?.VARIABLE);
        let slotType: 'num' | 'str' = 'str';
        if (meta && (meta.numeric || meta.boolish)) slotType = 'num';
        let value = this.inputExpr(b.inputs?.VALUE, slotType);
        if (meta?.boolish && value.type === 'str' && (value.value === 'true' || value.value === 'false')) {
          value = bool(value.value === 'true');
        }
        return { type: 'assign', target: target as never, value };
      }
      case 'data_changevariableby': {
        const target = this.varTargetExpr(t, b.fields?.VARIABLE);
        return { type: 'augassign', op: '+=', target: target as never, value: this.inputExpr(b.inputs?.VALUE, 'num') };
      }
      case 'data_showvariable': return { type: 'showmonitor', name: this.varTargetExpr(t, b.fields?.VARIABLE) as never, show: true };
      case 'data_hidevariable': return { type: 'showmonitor', name: this.varTargetExpr(t, b.fields?.VARIABLE) as never, show: false };
      case 'data_showlist': return { type: 'showmonitor', name: this.listTargetExpr(t, b.fields?.LIST) as never, show: true };
      case 'data_hidelist': return { type: 'showmonitor', name: this.listTargetExpr(t, b.fields?.LIST) as never, show: false };
      case 'data_addtolist':
        return { type: 'listmethod', list: this.listTargetExpr(t, b.fields?.LIST) as never, method: 'add', args: [this.inputExpr(b.inputs?.ITEM, this.listSlotType(t, b.fields?.LIST))] };
      case 'data_insertatlist':
        return { type: 'listmethod', list: this.listTargetExpr(t, b.fields?.LIST) as never, method: 'insert', args: [this.indexExpr(b.inputs?.INDEX), this.inputExpr(b.inputs?.ITEM, this.listSlotType(t, b.fields?.LIST))] };
      case 'data_deleteoflist': {
        const idx = this.indexExpr(b.inputs?.INDEX);
        if (idx.type === 'str' && idx.value === 'all') {
          return { type: 'listmethod', list: this.listTargetExpr(t, b.fields?.LIST) as never, method: 'clear', args: [] };
        }
        return { type: 'listmethod', list: this.listTargetExpr(t, b.fields?.LIST) as never, method: 'delete', args: [idx] };
      }
      case 'data_deletealloflist':
        return { type: 'listmethod', list: this.listTargetExpr(t, b.fields?.LIST) as never, method: 'clear', args: [] };
      case 'data_replaceitemoflist':
        return {
          type: 'assign',
          target: { type: 'index', obj: this.listTargetExpr(t, b.fields?.LIST), index: this.indexExpr(b.inputs?.INDEX) } as never,
          value: this.inputExpr(b.inputs?.ITEM, this.listSlotType(t, b.fields?.LIST)),
        };
      // --- music extension ---
      case 'music_playDrumForBeats': return call('play_drum', [this.inputExpr(b.inputs?.DRUM, 'num'), this.inputExpr(b.inputs?.BEATS, 'num')]);
      case 'music_midiPlayDrumForBeats': return call('play_midi_drum', [this.inputExpr(b.inputs?.DRUM, 'num'), this.inputExpr(b.inputs?.BEATS, 'num')]);
      case 'music_restForBeats': return call('rest_beats', [this.inputExpr(b.inputs?.BEATS, 'num')]);
      case 'music_playNoteForBeats': return call('play_note', [this.inputExpr(b.inputs?.NOTE, 'num'), this.inputExpr(b.inputs?.BEATS, 'num')]);
      case 'music_setInstrument': return call('set_instrument', [this.inputExpr(b.inputs?.INSTRUMENT, 'num')]);
      case 'music_midiSetInstrument': return call('set_midi_instrument', [this.inputExpr(b.inputs?.INSTRUMENT, 'num')]);
      case 'music_setTempo': return call('set_tempo', [this.inputExpr(b.inputs?.TEMPO, 'num')]);
      case 'music_changeTempo': return call('change_tempo', [this.inputExpr(b.inputs?.TEMPO, 'num')]);
      // --- pen ---
      case 'pen_penDown': return call('pen_down', []);
      case 'pen_penUp': return call('pen_up', []);
      case 'pen_stamp': return call('stamp', []);
      case 'pen_clear': return call('clear_pen', []);
      case 'pen_setPenColorToColor': return call('set_pen_color', [this.colorInputExpr(b.inputs?.COLOR)]);
      case 'pen_changePenColorParamBy': return call('change_pen_param', [str(String(this.menuFieldValue(t, b, 'COLOR_PARAM', 'pen_menu_colorParam')).toLowerCase()), this.inputExpr(b.inputs?.VALUE, 'num')]);
      case 'pen_setPenColorParamTo': return call('set_pen_param', [str(String(this.menuFieldValue(t, b, 'COLOR_PARAM', 'pen_menu_colorParam')).toLowerCase()), this.inputExpr(b.inputs?.VALUE, 'num')]);
      case 'pen_changePenSizeBy': return call('change_pen_size', [this.inputExpr(b.inputs?.SIZE, 'num')]);
      case 'pen_setPenSizeTo': return call('set_pen_size', [this.inputExpr(b.inputs?.SIZE, 'num')]);
      // --- procedures ---
      case 'procedures_call': return this.importProcCall(t, b);
      default: {
        this.noteUnsupported(t.name, b.opcode);
        return { type: 'unsupported', opcode: b.opcode, json: JSON.stringify(b).slice(0, 400) };
      }
    }
  }

  private flattenIfElse(t: SB3Target, blocks: Record<string, SB3Block>, b: SB3Block): IfStmt['branches'] {
    const branches: IfStmt['branches'] = [];
    let cur: SB3Block | null = b;
    while (cur && cur.opcode === 'control_if_else') {
      branches.push({ cond: this.boolExpr(cur.inputs?.CONDITION), body: this.substack(t, blocks, cur, 'SUBSTACK') });
      const elseInput: unknown[] | undefined = cur.inputs?.SUBSTACK2 as unknown[] | undefined;
      const elseId: string | null = typeof elseInput?.[1] === 'string' ? elseInput[1] : null;
      const elseBlock: SB3Block | null = elseId ? blocks[elseId] : null;
      if (elseBlock && (elseBlock.opcode === 'control_if_else' || elseBlock.opcode === 'control_if') && elseBlock.next === null) {
        if (elseBlock.opcode === 'control_if') {
          branches.push({ cond: this.boolExpr(elseBlock.inputs?.CONDITION), body: this.substack(t, blocks, elseBlock, 'SUBSTACK') });
          cur = null;
        } else {
          cur = elseBlock;
        }
      } else {
        if (elseId) branches.push({ body: this.substack(t, blocks, cur, 'SUBSTACK2') });
        cur = null;
      }
    }
    if (branches.length === 0) {
      branches.push({ cond: this.boolExpr(b.inputs?.CONDITION), body: this.substack(t, blocks, b, 'SUBSTACK') });
    }
    return branches;
  }

  private importProcCall(t: SB3Target, b: SB3Block): Stmt | null {
    const proccode = String(b.mutation?.proccode ?? '');
    const defName = this.procNames.get(`${t.name}\u0000${proccode}`);
    if (!defName) {
      this.notes.push(`${t.name}: 定義のないカスタムブロック「${proccode}」の呼び出しをコメント化しました`);
      return { type: 'comment', text: ` [定義なしカスタムブロック] ${proccode}` };
    }
    let argIds: string[] = [];
    try { argIds = JSON.parse(String(b.mutation?.argumentids ?? '[]')); } catch { /* noop */ }
    const args = argIds.map(uid => {
      const input = b.inputs?.[uid];
      if (!input) return str('');
      return this.inputExpr(input, 'any');
    });
    return { type: 'exprstmt', expr: { type: 'call', callee: defName, args } };
  }

  /**
   * operator_not のピープホール最適化:
   * Scratch には >=, <=, != ブロックがないため、エクスポータは
   * not(lt) → >=, not(gt) → <=, not(equals) → != として出力する。
   * インポート時にこれを元の形へ戻す。
   * また not(equals("1","1")) / not(equals("1","2")) は bool リテラルエンコーディング。
   */
  private importNot(b: SB3Block): Expr {
    const input: unknown[] | undefined = b.inputs?.OPERAND as unknown[] | undefined;
    const innerId = input && typeof input[1] === 'string' ? input[1] as string : null;
    const inner = innerId ? this.findBlock(innerId) : null;
    if (inner) {
      const l = inner.inputs?.OPERAND1;
      const r = inner.inputs?.OPERAND2;
      if (inner.opcode === 'operator_lt' && l && r) {
        return bin('>=', this.inputExpr(l as BlockInput, 'str'), this.inputExpr(r as BlockInput, 'str'));
      }
      if (inner.opcode === 'operator_gt' && l && r) {
        return bin('<=', this.inputExpr(l as BlockInput, 'str'), this.inputExpr(r as BlockInput, 'str'));
      }
      if (inner.opcode === 'operator_equals' && l && r) {
        return bin('!=', this.inputExpr(l as BlockInput, 'str'), this.inputExpr(r as BlockInput, 'str'));
      }
      if (inner.opcode === 'operator_not') {
        return this.boolExpr(inner.inputs?.CONDITION ?? (inner.inputs?.OPERAND as BlockInput | undefined));
      }
    }
    return { type: 'unary', op: 'not', operand: this.boolExpr(b.inputs?.OPERAND) } as Expr;
  }

  // --- 式変換 ------------------------------------------------------------------
  private extractLiteral(input: BlockInput | undefined): InputValue | null {
    if (!input) return null;
    const v = input[1] as InputValue;
    if (Array.isArray(v)) return v as InputValue;
    return null;
  }

  /** input → 式。slotType: num(数値穴)/str(文字列穴)/any */
  private inputExpr(input: BlockInput | undefined, slotType: 'num' | 'str' | 'any'): Expr {
    if (!input) return slotType === 'num' ? num(0) : str('');
    const mode = input[0];
    const val = input[1] as InputValue;
    // ブロック参照
    if (typeof val === 'string') {
      return this.blockExprById(val, slotType);
    }
    if (Array.isArray(val)) {
      return this.literalExpr(val as [number, ...unknown[]], slotType);
    }
    return str('');
  }

  private literalExpr(lit: [number, ...unknown[]], slotType: 'num' | 'str' | 'any'): Expr {
    const kind = lit[0];
    switch (kind) {
      case 4: case 5: case 6: case 7: case 8: {
        const n = parseFloat(String(lit[1]));
        return Number.isNaN(n) ? str(String(lit[1])) : numLit(n);
      }
      case 9:
        return { type: 'color', value: String(lit[1]).toLowerCase(), spType: T_STR };
      case 10: {
        const s = String(lit[1]);
        if (slotType === 'num') {
          const n = parseFloat(s);
          if (!Number.isNaN(n) && /^-?[\d.]+$/.test(s.trim())) return numLit(n);
          if (s === '') return num(0);
          return str(s); // 数値穴の非数値テキスト(型エラーとして表面化させる)
        }
        if (slotType === 'any' && /^-?\d+(\.\d+)?$/.test(s.trim())) {
          // any 穴(プロシージャ引数など): 数値らしいものは数値に
          return numLit(parseFloat(s));
        }
        return str(s);
      }
      case 11: return str(String(lit[1])); // broadcast (名前)
      case 12: return this.varRefByName(String(lit[1]));
      case 13: return this.listRefByName(String(lit[1]));
      default: return str(String(lit[1]));
    }
  }

  private blockExprById(id: string, slotType: 'num' | 'str' | 'any'): Expr {
    const b = this.findBlock(id);
    if (!b) return str('');
    return this.blockExpr(b, slotType);
  }

  private allBlocks: Map<string, { block: SB3Block; target: SB3Target }> | null = null;
  private currentTargetBlocks: Record<string, SB3Block> = {};
  private currentTarget: SB3Target | null = null;

  private findBlock(id: string): SB3Block | null {
    return this.currentTargetBlocks[id] ?? null;
  }

  private blockExpr(b: SB3Block, slotType: 'num' | 'str' | 'any'): Expr {
    const call = (name: string, args: Expr[]): Expr => ({ type: 'call', callee: name, args, spType: undefined });
    switch (b.opcode) {
      // 数値/文字列 shadow メニュー → リテラル
      case 'math_number': return num(parseFloat(String(this.shadowFieldOrInput(b))) || 0);
      case 'math_positive_number': case 'math_whole_number': case 'math_integer': case 'math_angle':
        return numLit(parseFloat(String(this.shadowFieldOrInput(b))) || 0);
      case 'text': return str(String(this.shadowFieldOrInput(b)));
      case 'music_menu_DRUM': case 'music_menu_INSTRUMENT': return numLit(Number(this.shadowFieldOrInput(b)) || 0);
      // プロパティ系
      default: break;
    }
    if (PROPERTY_OPCODES[b.opcode]) return { type: 'name', name: PROPERTY_OPCODES[b.opcode] };
    switch (b.opcode) {
      // --- operator ---
      case 'operator_add': return bin('+', this.inputExpr(b.inputs?.NUM1, 'num'), this.inputExpr(b.inputs?.NUM2, 'num'));
      case 'operator_subtract': return bin('-', this.inputExpr(b.inputs?.NUM1, 'num'), this.inputExpr(b.inputs?.NUM2, 'num'));
      case 'operator_multiply': return bin('*', this.inputExpr(b.inputs?.NUM1, 'num'), this.inputExpr(b.inputs?.NUM2, 'num'));
      case 'operator_divide': return bin('/', this.inputExpr(b.inputs?.NUM1, 'num'), this.inputExpr(b.inputs?.NUM2, 'num'));
      case 'operator_mod': return call('mod', [this.inputExpr(b.inputs?.NUM1, 'num'), this.inputExpr(b.inputs?.NUM2, 'num')]);
      case 'operator_random': return call('random', [this.inputExpr(b.inputs?.FROM, 'num'), this.inputExpr(b.inputs?.TO, 'num')]);
      case 'operator_round': return call('round', [this.inputExpr(b.inputs?.NUM, 'num')]);
      case 'operator_mathop': {
        const op = String(b.fields?.OPERATOR?.[0] ?? 'abs');
        const fn = MATHOP_REVERSE[op];
        if (!fn) { this.noteUnsupported(this.currentTarget?.name ?? '', `operator_mathop(${op})`); return num(0); }
        return call(fn, [this.inputExpr(b.inputs?.OPERATOR ?? b.inputs?.NUM, 'num')]);
      }
      case 'operator_equals': {
        // bool リテラルのエンコーディング ("1"=="1" → true, "1"=="2" → false) を認識
        const l1 = b.inputs?.OPERAND1 as unknown[] | undefined;
        const r1 = b.inputs?.OPERAND2 as unknown[] | undefined;
        const litVal = (inp: unknown[] | undefined): string | null => {
          if (inp && Array.isArray(inp[1]) && (inp[1] as unknown[])[0] === 10) return String((inp[1] as unknown[])[1]);
          return null;
        };
        const lv = litVal(l1); const rv = litVal(r1);
        if (lv === '1' && (rv === '1' || rv === '2')) return bool(rv === '1');
        return bin('==', this.inputExpr(b.inputs?.OPERAND1, 'str'), this.inputExpr(b.inputs?.OPERAND2, 'str'));
      }
      case 'operator_lt': return bin('<', this.inputExpr(b.inputs?.OPERAND1, 'str'), this.inputExpr(b.inputs?.OPERAND2, 'str'));
      case 'operator_gt': return bin('>', this.inputExpr(b.inputs?.OPERAND1, 'str'), this.inputExpr(b.inputs?.OPERAND2, 'str'));
      case 'operator_and': return bin('and', this.boolExpr(b.inputs?.OPERAND1), this.boolExpr(b.inputs?.OPERAND2));
      case 'operator_or': return bin('or', this.boolExpr(b.inputs?.OPERAND1), this.boolExpr(b.inputs?.OPERAND2));
      case 'operator_not': return this.importNot(b);
      case 'operator_join': return call('join', [this.inputExpr(b.inputs?.STRING1, 'str'), this.inputExpr(b.inputs?.STRING2, 'str')]);
      case 'operator_letter_of': return call('letter', [this.inputExpr(b.inputs?.LETTER, 'num'), this.inputExpr(b.inputs?.STRING, 'str')]);
      case 'operator_length': return call('len', [this.inputExpr(b.inputs?.STRING, 'str')]);
      case 'operator_contains': return bin('in', this.inputExpr(b.inputs?.STRING2, 'str'), this.inputExpr(b.inputs?.STRING1, 'str'));
      // --- data ---
      case 'data_itemoflist': {
        const listExpr = this.listTargetExpr(this.currentTarget!, b.fields?.LIST);
        return { type: 'index', obj: listExpr, index: this.indexExpr(b.inputs?.INDEX) } as Expr;
      }
      case 'data_lengthoflist': return call('len', [this.listTargetExpr(this.currentTarget!, b.fields?.LIST)]);
      case 'data_itemnumoflist': return call('item_number', [this.listTargetExpr(this.currentTarget!, b.fields?.LIST), this.inputExpr(b.inputs?.ITEM, 'any')]);
      case 'data_listcontainsitem':
        return bin('in', this.inputExpr(b.inputs?.ITEM, 'str'), this.listTargetExpr(this.currentTarget!, b.fields?.LIST));
      // --- sensing ---
      case 'sensing_keypressed': return call('key_pressed', [this.menuStr(b, 'KEY_OPTION', 'sensing_keyoptions')]);
      case 'sensing_touchingobject': return call('touching', [this.menuStrMapped(b, 'TOUCHINGOBJECTMENU', 'sensing_touchingobjectmenu')]);
      case 'sensing_touchingcolor': return call('touching_color', [this.colorInputExpr(b.inputs?.COLOR)]);
      case 'sensing_coloristouchingcolor': return call('color_touching_color', [this.colorInputExpr(b.inputs?.COLOR), this.colorInputExpr(b.inputs?.COLOR2)]);
      case 'sensing_distanceto': return call('distance_to', [this.menuStrMapped(b, 'DISTANCETOMENU', 'sensing_distancetomenu')]);
      case 'sensing_of': return this.importSensingOf(b);
      case 'sensing_current': {
        const menu = String(b.fields?.CURRENTMENU?.[0] ?? 'YEAR').toLowerCase();
        const unit = menu === 'dayofweek' ? 'day of week' : menu;
        return call('current', [str(unit)]);
      }
      // --- procedures ---
      case 'argument_reporter_string_number':
      case 'argument_reporter_boolean': {
        const pname = String(b.fields?.VALUE?.[0] ?? '');
        if (isIdent(pname)) return { type: 'name', name: pname };
        const renamed = this.currentTarget ? this.paramRenames.get(`${this.currentTarget.name}\u0000${pname}`) : undefined;
        if (renamed) return { type: 'name', name: renamed };
        return this.fallbackParam(pname);
      }
      default: {
        this.noteUnsupported(this.currentTarget?.name ?? '', `${b.opcode}(レポータ)`);
        return slotType === 'num' ? num(0) : str('');
      }
    }
  }

  private fallbackParam(pname: string): Expr {
    // 識別子化できない引数名 → 注釈して var() 風の回避(型は any)
    this.notes.push(`識別子化できない引数名「${pname}」を検出しました。sanitize して参照します`);
    return { type: 'name', name: sanitizeIdent(pname, new Set()) };
  }

  private importSensingOf(b: SB3Block): Expr {
    const prop = String(b.fields?.PROPERTY?.[0] ?? '');
    const objectMenu = this.menuStrRaw(b, 'OBJECT', 'sensing_of_object_menu');
    const pyProp = PROP_REVERSE[prop] ?? prop;
    let objName: string;
    if (objectMenu === '_stage_') objName = 'stage';
    else {
      const ident = this.spriteIdentNames.get(objectMenu);
      objName = ident ?? objectMenu;
    }
    if (!isIdent(objName)) {
      this.notes.push(`sensing_of の対象「${objectMenu}」を参照できません(名前が識別子化できないため)`);
      return str('');
    }
    if (!isIdent(pyProp)) {
      // 変数名が識別子でない → prop アクセス不可
      this.notes.push(`「${objectMenu} の ${prop}」参照はプロパティ名が識別子化できないため var() 形式にできません。0 を返します`);
      return num(0);
    }
    return { type: 'prop', obj: { type: 'name', name: objName } as Expr, prop: pyProp } as Expr;
  }

  private shadowFieldOrInput(b: SB3Block): string | number {
    // shadow ブロック (math_number 等) は inputs に NUM/TEXT 等を持つ場合と fields の場合がある
    for (const inp of Object.values(b.inputs ?? {})) {
      const v = inp?.[1];
      if (Array.isArray(v)) return String((v as unknown[])[1] ?? '');
      if (typeof v === 'string') {
        const sub = this.findBlock(v);
        if (sub) return this.shadowFieldOrInput(sub);
      }
    }
    for (const f of Object.values(b.fields ?? {})) {
      return String(f[0] ?? '');
    }
    return '';
  }

  private boolExpr(input: BlockInput | undefined): Expr {
    if (!input) return { type: 'bool', value: false, spType: T_BOOL };
    const val = input[1] as InputValue;
    if (typeof val === 'string') {
      const b = this.findBlock(val);
      if (b) return this.blockExpr(b, 'any');
      return { type: 'bool', value: false, spType: T_BOOL };
    }
    if (Array.isArray(val)) {
      const lit = val as [number, ...unknown[]];
      if (lit[0] === 12) return this.varRefByName(String(lit[1]));
      // ブール穴のリテラル (true/false 文字列)
      const s = String(lit[1]).toLowerCase();
      if (s === 'true' || s === 'false') return { type: 'bool', value: s === 'true', spType: T_BOOL };
      return this.literalExpr(lit, 'any');
    }
    return { type: 'bool', value: false, spType: T_BOOL };
  }

  private colorInputExpr(input: BlockInput | undefined): Expr {
    if (!input) return { type: 'color', value: '#ff0000', spType: T_STR };
    const val = input[1] as InputValue;
    if (Array.isArray(val) && val[0] === 9) {
      return { type: 'color', value: String(val[1]).toLowerCase(), spType: T_STR };
    }
    const e = this.inputExpr(input, 'str');
    if (e.type === 'str' && /^#[0-9a-fA-F]{6}$/.test(e.value)) {
      return { type: 'color', value: e.value.toLowerCase(), spType: T_STR };
    }
    return e;
  }

  private indexExpr(input: BlockInput | undefined): Expr {
    if (!input) return num(1);
    const val = input[1] as InputValue;
    if (typeof val === 'string') {
      const b = this.findBlock(val);
      if (b) return this.blockExpr(b, 'num');
      return num(1);
    }
    if (Array.isArray(val)) {
      const lit = val as [number, ...unknown[]];
      const s = String(lit[1]);
      if (['last', 'random', 'all'].includes(s)) return str(s);
      if ([4, 5, 6, 7, 8, 10].includes(lit[0])) {
        const n = parseFloat(s);
        if (!Number.isNaN(n)) return numLit(n);
        return str(s);
      }
      if (lit[0] === 12) return this.varRefByName(s);
    }
    return num(1);
  }

  private broadcastExpr(input: BlockInput | undefined): Expr {
    if (!input) return str('message1');
    const val = input[1] as InputValue;
    if (Array.isArray(val) && val[0] === 11) return str(String(val[1]));
    if (typeof val === 'string') {
      const b = this.findBlock(val);
      if (b) return this.blockExpr(b, 'str');
    }
    // [3, blockId, [11,...]]
    if (typeof val === 'string') return str('message1');
    const third = (input as unknown[])[2];
    if (Array.isArray(third) && (third as unknown[])[0] === 11) {
      // ダイナミックブロードキャスト
      const shadowName = String((third as unknown[])[1]);
      const first = (input as unknown[])[1];
      if (typeof first === 'string') {
        const b = this.findBlock(first);
        if (b) return this.blockExpr(b, 'str');
      }
      return str(shadowName);
    }
    return str('message1');
  }

  /** メニュー shadow から表示用文字列(逆変換済み) */
  private menuExpr(t: SB3Target, b: SB3Block, inputName: string, menuOpcode: string): Expr {
    const raw = this.menuStrRaw(b, inputName, menuOpcode);
    return str(unmenu(raw));
  }
  private menuStr(b: SB3Block, inputName: string, menuOpcode: string): Expr {
    return str(this.menuStrRaw(b, inputName, menuOpcode));
  }
  private menuStrMapped(b: SB3Block, inputName: string, menuOpcode: string): Expr {
    return str(unmenu(this.menuStrRaw(b, inputName, menuOpcode)));
  }
  private menuFieldValue(t: SB3Target, b: SB3Block, inputName: string, menuOpcode: string): string {
    return this.menuStrRaw(b, inputName, menuOpcode);
  }

  private menuStrRaw(b: SB3Block, inputName: string, menuOpcode: string): string {
    const input = b.inputs?.[inputName];
    if (input) {
      const val = input[1] as InputValue;
      if (typeof val === 'string') {
        const menu = this.findBlock(val);
        if (menu && (menu.opcode === menuOpcode || menu.shadow)) {
          for (const f of Object.values(menu.fields ?? {})) return String(f[0] ?? '');
        } else if (menu) {
          this.noteUnsupported(this.currentTarget?.name ?? '', `${b.opcode}(動的メニュー:${inputName})`);
          this.notes.push(`${b.opcode} の ${inputName} は動的な値を使っています。ScratchPyでは未対応のため、元の .sb3 を保存してください`);
        }
      } else if (Array.isArray(val)) {
        if (val[0] === 12 || val[0] === 13) {
          this.noteUnsupported(this.currentTarget?.name ?? '', `${b.opcode}(動的メニュー:${inputName})`);
          this.notes.push(`${b.opcode} の ${inputName} は変数を使っています。ScratchPyでは未対応のため、元の .sb3 を保存してください`);
        } else return String((val as unknown[])[1] ?? '');
      }
      // ダイナミック(レポータ差し込み) → shadow から
      const shadow = (input as unknown[])[2];
      if (typeof shadow === 'string') {
        const menu = this.findBlock(shadow);
        if (menu) for (const f of Object.values(menu.fields ?? {})) return String(f[0] ?? '');
      } else if (Array.isArray(shadow)) {
        return String((shadow as unknown[])[1] ?? '');
      }
    }
    for (const f of Object.values(b.fields ?? {})) return String(f[0] ?? '');
    return '';
  }

  private cloneTargetExpr(t: SB3Target, b: SB3Block): Expr | undefined {
    const raw = this.menuStrRaw(b, 'CLONE_OPTION', 'control_create_clone_of_menu');
    if (raw === '_self_' || raw === '') return undefined;
    return str(unmenu(raw));
  }

  private varMetaByIdField(t: SB3Target, field: [string | number, string | null, ...unknown[]] | undefined): VarMeta | undefined {
    const name = String(field?.[0] ?? '');
    const id = String(field?.[1] ?? '');
    return this.varMeta.get(id) ?? this.varMetaByName.get(`${t.name}\u0000${name.replace(/^☁ /, '')}`)
      ?? this.varMetaByName.get(`${this.stageName}\u0000${name.replace(/^☁ /, '')}`);
  }

  private listSlotType(t: SB3Target, field: [string | number, string | null, ...unknown[]] | undefined): 'num' | 'str' {
    const name = String(field?.[0] ?? '');
    const id = String(field?.[1] ?? '');
    const meta = this.listMeta.get(id) ?? this.listMetaByName.get(`${t.name}\u0000${name}`) ?? this.listMetaByName.get(`${this.stageName}\u0000${name}`);
    if (meta && (meta.elemType.kind === 'int' || meta.elemType.kind === 'float')) return 'num';
    return 'str';
  }

  private varTargetExpr(t: SB3Target, field: [string | number, string | null, ...unknown[]] | undefined): Expr {
    const meta = this.varMetaByIdField(t, field);
    const name = String(field?.[0] ?? '');
    const clean = meta ? meta.name : name.replace(/^☁ /, '');
    return this.varRefByName(clean);
  }

  private varRefByName(name: string): Expr {
    const clean = name.replace(/^☁ /, '');
    return isIdent(clean)
      ? { type: 'name', name: clean }
      : { type: 'varref', name: clean } as Expr;
  }

  private listTargetExpr(t: SB3Target, field: [string | number, string | null, ...unknown[]] | undefined): Expr {
    const name = String(field?.[0] ?? '');
    return isIdent(name) ? { type: 'name', name } : ({ type: 'listref', name } as Expr);
  }
  private listRefByName(name: string): Expr {
    return isIdent(name) ? { type: 'name', name } : ({ type: 'listref', name } as Expr);
  }

  private noteUnsupported(targetName: string, opcode: string): void {
    this.unsupported.set(opcode, (this.unsupported.get(opcode) ?? 0) + 1);
  }
}

// --- リテラルヘルパ -----------------------------------------------------------
function num(n: number): Expr { return numLit(n); }
function numLit(n: number): Expr {
  return { type: 'num', value: n, spType: { kind: Number.isInteger(n) ? 'int' : 'float' } };
}
function str(s: string): Expr { return { type: 'str', value: s, spType: T_STR }; }
function bool(v: boolean): Expr { return { type: 'bool', value: v, spType: T_BOOL }; }
function bin(op: string, l: Expr, r: Expr): Expr {
  return { type: 'binary', op: op as never, left: l, right: r };
}
function isReporterish(op: string): boolean {
  return PROPERTY_OPCODES[op] !== undefined || op.startsWith('operator_') || op.startsWith('argument_reporter')
    || ['data_itemoflist', 'data_lengthoflist', 'data_listcontainsitem', 'sensing_of', 'sensing_keypressed',
      'sensing_touchingobject', 'sensing_touchingcolor', 'sensing_coloristouchingcolor', 'sensing_distanceto',
      'sensing_current', 'math_number', 'text'].includes(op)
    || /_menu$/.test(op) || op === 'looks_costume' || op === 'looks_backdrops' || op === 'sound_sounds_menu'
    || op === 'sensing_keyoptions' || op === 'sensing_of_object_menu';
}


// ---------------------------------------------------------------------------
// 公開 API
// ---------------------------------------------------------------------------
export function importProject(project: SB3Project, files?: Map<string, Uint8Array>): ImportResult {
  return new Importer().importProject(project, files);
}
