/**
 * ScratchPy → Scratch 3.0 (.sb3 project.json) エクスポータ
 * ----------------------------------------------------------
 * AST をブロックグラフに変換し、完全な SB3Project を生成する。
 * アセット(画像/音)は AssetStore(インポート時に構築)から取得し、
 * 無い場合はデフォルトアセットを生成する。
 *
 * 生成される JSON のエンコーディングは Scratch Wiki / scratch-vm の
 * 実プロジェクトと同一の規則に従う:
 *   inputs: [1, shadow] / [2, block] / [3, block, obscuredShadow]
 *   リテラル: [4 数値][5 正数][6 正整数][7 整数][8 角度][9 色][10 文字列]
 *             [11 ブロードキャスト名,id][12 変数名,id][13 リスト名,id]
 */

import {
  Program, SpriteDef, VarDecl, ListDecl, EventDef, FuncDef, Stmt, Expr,
  Diagnostic, SPType, BodyItem, ConfigDecl,
} from '../lang/ast';
import { check, CheckResult, VarEntity, ListEntity, NameResolution } from '../lang/typechecker';
import { PROPERTIES, SENSING_OF_PROPS } from '../lang/builtins';
import {
  SB3Project, SB3Target, SB3Block, SB3Monitor, BlockInput, InputValue, BlockField,
} from './model';
import { md5Bytes } from './md5';
import { defaultSpriteCostume, defaultStageBackdrop, emptyWav, AssetFile } from './assets';

// ---------------------------------------------------------------------------
// アセットストア
// ---------------------------------------------------------------------------
export interface CostumeAsset {
  bytes: Uint8Array;
  dataFormat: 'svg' | 'png';
  rotationCenterX: number;
  rotationCenterY: number;
  bitmapResolution?: number;
}
export interface SoundAsset {
  bytes: Uint8Array;
  dataFormat: 'wav' | 'mp3';
  rate: number;
  sampleCount: number;
  format?: string;
}
export interface AssetStore {
  costumes: Map<string, CostumeAsset>; // key: `${target}\u0000${costumeName}`
  sounds: Map<string, SoundAsset>;     // key: `${target}\u0000${soundName}`
}
export function emptyAssetStore(): AssetStore {
  return { costumes: new Map(), sounds: new Map() };
}
export const assetKey = (target: string, name: string) => `${target}\u0000${name}`;

export interface ExportResult {
  project: SB3Project;
  /** md5ext → bytes (zip 化対象。project.json 自体は含まない) */
  assets: Map<string, Uint8Array>;
  diagnostics: Diagnostic[];
}

export class ExportError extends Error {
  diagnostics: Diagnostic[];
  constructor(diagnostics: Diagnostic[]) {
    super(`エクスポート失敗: ${diagnostics.map(d => d.message).join('; ')}`);
    this.diagnostics = diagnostics;
  }
}

// ---------------------------------------------------------------------------
// ブロックビルダー
// ---------------------------------------------------------------------------
class BlockBuilder {
  blocks: Record<string, SB3Block> = {};
  private counter = 0;
  constructor(private prefix: string) {}

  newId(): string {
    this.counter++;
    return `${this.prefix}_${this.counter.toString(36)}`;
  }

  add(opcode: string, opts: {
    inputs?: Record<string, BlockInput>;
    fields?: Record<string, BlockField>;
    mutation?: Record<string, unknown>;
    shadow?: boolean;
    topLevel?: boolean;
    x?: number; y?: number;
  } = {}): string {
    const id = this.newId();
    const b: SB3Block = {
      opcode,
      next: null,
      parent: null,
      inputs: opts.inputs ?? {},
      fields: opts.fields ?? {},
      shadow: opts.shadow ?? false,
      topLevel: opts.topLevel ?? false,
    };
    if (opts.topLevel) { b.x = opts.x ?? 0; b.y = opts.y ?? 0; }
    if (opts.mutation) {
      b.mutation = { tagName: 'mutation', children: [], ...opts.mutation } as SB3Block['mutation'];
    }
    this.blocks[id] = b;
    return id;
  }

  link(parentId: string, childId: string): void {
    this.blocks[parentId].next = childId;
    this.blocks[childId].parent = parentId;
  }

  /** input 内の実ブロックの parent を張る */
  adoptInputs(id: string, inputs: Record<string, BlockInput>): void {
    for (const inp of Object.values(inputs)) {
      const v = (inp as unknown[])[1];
      if (typeof v === 'string' && this.blocks[v] && !this.blocks[v].parent) {
        this.blocks[v].parent = id;
      }
    }
  }
}

/** コンパイル済み式のスロット表現 */
type Slot =
  | { kind: 'lit'; code: number; value: string }
  | { kind: 'block'; id: string }
  | { kind: 'var'; name: string; id: string }
  | { kind: 'list'; name: string; id: string }
  | { kind: 'empty' };

/** スロット → input JSON */
function inputOf(slot: Slot, defaultLit: [number, string] | null): BlockInput {
  switch (slot.kind) {
    case 'lit':
      return [1, [slot.code, slot.value]];
    case 'var':
      return [3, [12, slot.name, slot.id] as unknown as InputValue, defaultLit ?? [10, '']];
    case 'list':
      return [3, [13, slot.name, slot.id] as unknown as InputValue, defaultLit ?? [10, '']];
    case 'block':
      return [3, slot.id, defaultLit];
    case 'empty':
      return [1, defaultLit ?? [10, '']];
  }
}

/** ブール穴用 input ([2, block] 形式) */
function boolInput(slot: Slot): BlockInput {
  if (slot.kind === 'block') return [2, slot.id];
  if (slot.kind === 'lit') return [1, [slot.code, slot.value] as InputValue];
  if (slot.kind === 'var') return [3, [12, slot.name, slot.id] as unknown as InputValue, [10, '']];
  return [1, [10, '']];
}

// ---------------------------------------------------------------------------
// ターゲットコンテキスト
// ---------------------------------------------------------------------------
interface ProcInfo {
  proccode: string;
  argUids: string[];
  paramTypes: SPType[];
  warp: boolean;
}

interface TargetCtx {
  targetName: string;
  isStage: boolean;
  varIds: Map<string, string>;
  varEntities: Map<string, VarEntity>;
  listIds: Map<string, string>;
  listEntities: Map<string, ListEntity>;
  procs: Map<string, ProcInfo>;
  params: Map<string, { uid: string; paramType: SPType }>;
}

const MENU_INPUT_NAME: Record<string, string> = {
  motion_goto: 'TO',
  motion_glideto: 'TO',
  motion_pointtowards: 'TOWARDS',
  looks_switchcostumeto: 'COSTUME',
  looks_switchbackdropto: 'BACKDROP',
  sound_play: 'SOUND_MENU',
  sound_playuntildone: 'SOUND_MENU',
  control_create_clone_of: 'CLONE_OPTION',
  looks_changeeffectby: 'EFFECT',
  looks_seteffectto: 'EFFECT',
  sound_changeeffectby: 'EFFECT',
  sound_seteffectto: 'EFFECT',
  pen_changePenColorParamBy: 'COLOR_PARAM',
  pen_setPenColorParamTo: 'COLOR_PARAM',
};

const MATHOP: Record<string, string> = {
  abs: 'abs', floor: 'floor', ceil: 'ceiling', sqrt: 'sqrt',
  sin: 'sin', cos: 'cos', tan: 'tan', asin: 'asin', acos: 'acos', atan: 'atan',
  ln: 'ln', log10: 'log', pow10: '10 ^', exp: 'e ^',
};

const PEN_BUILTINS = new Set([
  'pen_down', 'pen_up', 'stamp', 'clear_pen', 'set_pen_color',
  'change_pen_param', 'set_pen_param', 'change_pen_size', 'set_pen_size',
]);

export function scratchKeyName(key: string): string {
  const specials = ['space', 'up arrow', 'down arrow', 'left arrow', 'right arrow', 'any'];
  if (specials.includes(key)) return key;
  return key.toLowerCase();
}

function gotoMenuValue(name: string): string {
  if (name === 'mouse') return '_mouse_';
  if (name === 'random') return '_random_';
  if (name === 'stage') return '_stage_';
  return name;
}

function touchMenuValue(name: string): string {
  if (name === 'mouse') return '_mouse_';
  if (name === 'edge') return '_edge_';
  return name;
}

function currentMenu(unit: string): string {
  const map: Record<string, string> = {
    year: 'YEAR', month: 'MONTH', date: 'DATE', 'day of week': 'DAYOFWEEK',
    hour: 'HOUR', minute: 'MINUTE', second: 'SECOND',
  };
  return map[unit] ?? unit.toUpperCase();
}

function sanitizeId(s: string): string {
  return s.replace(/[^\w\u3040-\u30ff\u4e00-\u9faf]/g, '_').slice(0, 16) || 'x';
}

// ---------------------------------------------------------------------------
// エクスポータ本体
// ---------------------------------------------------------------------------
class Exporter {
  diagnostics: Diagnostic[] = [];
  assets = new Map<string, Uint8Array>();
  extensions = new Set<string>();
  monitors: SB3Monitor[] = [];
  broadcasts = new Map<string, string>();

  private varIdMap = new Map<VarEntity, string>();
  private listIdMap = new Map<ListEntity, string>();
  private usedIds = new Set<string>();
  private monitorY = 5;

  constructor(
    private program: Program,
    private cr: CheckResult,
    private store: AssetStore,
  ) {}

  private err(message: string, loc?: Expr['loc']): never {
    this.diagnostics.push({ severity: 'error', message, loc });
    throw new ExportError(this.diagnostics);
  }

  run(): ExportResult {
    for (const name of this.cr.broadcasts) {
      this.broadcasts.set(name, `broadcastMsgId-${name}`);
    }
    const stageTarget = this.buildStage();
    const spriteTargets = this.program.sprites.map((sp, i) => this.buildSprite(sp, i + 1));
    // ブロードキャストはステージに登録するのが Scratch の慣習
    stageTarget.broadcasts = {};
    for (const [bname, bid] of this.broadcasts) stageTarget.broadcasts[bid] = bname;

    const project: SB3Project = {
      targets: [stageTarget, ...spriteTargets],
      monitors: this.monitors,
      extensions: [...this.extensions],
      meta: {
        semver: '3.0.0',
        vm: '0.2.0',
        agent: 'ScratchPy Studio',
      },
    };
    return { project, assets: this.assets, diagnostics: this.diagnostics };
  }

  private broadcastId(name: string): string {
    let id = this.broadcasts.get(name);
    if (!id) { id = `broadcastMsgId-${name}`; this.broadcasts.set(name, id); }
    return id;
  }

  // --- id 生成(衝突回避付き・決定的) ---------------------------------------
  private varIdOf(ent: VarEntity): string {
    const cached = this.varIdMap.get(ent);
    if (cached) return cached;
    let base = `var_${sanitizeId(ent.owner)}_${sanitizeId(ent.decl.name)}`;
    let id = base; let n = 2;
    while (this.usedIds.has(id)) id = `${base}_${n++}`;
    this.usedIds.add(id);
    this.varIdMap.set(ent, id);
    return id;
  }
  private listIdOf(ent: ListEntity): string {
    const cached = this.listIdMap.get(ent);
    if (cached) return cached;
    let base = `list_${sanitizeId(ent.owner)}_${sanitizeId(ent.decl.name)}`;
    let id = base; let n = 2;
    while (this.usedIds.has(id)) id = `${base}_${n++}`;
    this.usedIds.add(id);
    this.listIdMap.set(ent, id);
    return id;
  }

  // --- ステージ ------------------------------------------------------------
  private buildStage(): SB3Target {
    const stage = this.program.stage;
    const name = this.cr.ctx.stageName;
    const target: SB3Target = {
      isStage: true,
      name,
      variables: {}, lists: {}, broadcasts: {},
      blocks: {}, comments: {},
      currentCostume: 0,
      costumes: [], sounds: [],
      volume: 100,
      layerOrder: 0,
      tempo: 60,
      videoTransparency: 50,
      videoState: 'on',
      textToSpeechLanguage: null,
    };

    const ctx = this.makeCtx(name, true);
    const costumes: string[] = [];
    const sounds: string[] = [];
    const events: EventDef[] = [];
    if (stage) {
      for (const item of stage.body) {
        if (!('decl' in item)) continue;
        if (item.decl === 'costume') costumes.push(item.name);
        else if (item.decl === 'sound') sounds.push(item.name);
        else if (item.decl === 'event') events.push(item);
        else if (item.decl === 'config') this.applyStageConfig(target, item);
      }
      this.emitDecls(stage.body, ctx, target, true);
    }
    if (costumes.length === 0) costumes.push('backdrop1');
    target.costumes = costumes.map(c => this.buildCostume(name, c, true));
    target.sounds = sounds.map(s => this.buildSound(name, s));
    target.currentCostume = Math.min(target.currentCostume, Math.max(0, target.costumes.length - 1));

    const bb = new BlockBuilder('st');
    events.forEach((e, i) => this.emitEvent(bb, ctx, e, i));
    target.blocks = bb.blocks;
    return target;
  }

  private applyStageConfig(target: SB3Target, c: ConfigDecl): void {
    const v = c.value;
    const num = (): number => (v.type === 'num' ? v.value : Number(this.literalValue(v)));
    switch (c.key) {
      case 'tempo': target.tempo = num(); break;
      case 'video_transparency': target.videoTransparency = num(); break;
      case 'video_state': target.videoState = this.literalValue(v) as SB3Target['videoState']; break;
      case 'volume': target.volume = num(); break;
      case 'current_costume': target.currentCostume = num(); break;
      case 'tts_language':
        target.textToSpeechLanguage = v.type === 'str' ? v.value : null; break;
      default: break;
    }
  }

  // --- スプライト ----------------------------------------------------------
  private buildSprite(sp: SpriteDef, order: number): SB3Target {
    const target: SB3Target = {
      isStage: false,
      name: sp.name,
      variables: {}, lists: {}, broadcasts: {},
      blocks: {}, comments: {},
      currentCostume: 0,
      costumes: [], sounds: [],
      volume: 100,
      layerOrder: order,
      visible: true,
      x: 0, y: 0,
      size: 100,
      direction: 90,
      draggable: false,
      rotationStyle: 'all around',
    };

    const ctx = this.makeCtx(sp.name, false);
    const costumes: string[] = [];
    const sounds: string[] = [];
    const events: EventDef[] = [];
    const defs: FuncDef[] = [];
    for (const item of sp.body) {
      if (!('decl' in item)) continue;
      if (item.decl === 'costume') costumes.push(item.name);
      else if (item.decl === 'sound') sounds.push(item.name);
      else if (item.decl === 'event') events.push(item);
      else if (item.decl === 'def') defs.push(item);
      else if (item.decl === 'config') this.applySpriteConfig(target, item);
    }
    this.emitDecls(sp.body, ctx, target, false);
    if (costumes.length === 0) costumes.push('costume1');
    target.costumes = costumes.map(c => this.buildCostume(sp.name, c, false));
    target.sounds = sounds.map(s => this.buildSound(sp.name, s));
    target.currentCostume = Math.min(target.currentCostume, Math.max(0, target.costumes.length - 1));

    for (const d of defs) {
      const argUids = d.params.map((_, i) => `proc_${sanitizeId(d.name)}_arg${i}`);
      const proccode = d.name + d.params.map(p => {
        const k = p.paramType.kind;
        // Scratch 3 のカスタムブロックは 丸い引数=%s / ブール引数=%b の2種
        return k === 'bool' ? ' %b' : ' %s';
      }).join('');
      ctx.procs.set(d.name, { proccode, argUids, paramTypes: d.params.map(p => p.paramType), warp: d.warp });
    }

    const bb = new BlockBuilder(`sp${order}`);
    let scriptIdx = 0;
    for (const d of defs) this.emitDef(bb, ctx, d, scriptIdx++);
    for (const e of events) this.emitEvent(bb, ctx, e, scriptIdx++);
    target.blocks = bb.blocks;
    return target;
  }

  private applySpriteConfig(target: SB3Target, c: ConfigDecl): void {
    const v = c.value;
    const num = (): number => (v.type === 'num' ? v.value : Number(this.literalValue(v)));
    switch (c.key) {
      case 'x': target.x = num(); break;
      case 'y': target.y = num(); break;
      case 'direction': target.direction = num(); break;
      case 'size': target.size = num(); break;
      case 'visible': target.visible = this.literalBool(v); break;
      case 'draggable': target.draggable = this.literalBool(v); break;
      case 'volume': target.volume = num(); break;
      case 'current_costume': target.currentCostume = num(); break;
      case 'layer_order': target.layerOrder = num(); break;
      case 'rotation_style': target.rotationStyle = this.literalValue(v) as SB3Target['rotationStyle']; break;
      default: break;
    }
  }

  private literalValue(e: Expr): string {
    switch (e.type) {
      case 'num': return String(e.value);
      case 'str': case 'color': return e.value;
      case 'bool': return e.value ? 'true' : 'false';
      case 'unary':
        if (e.op === '-' && e.operand.type === 'num') return String(-e.operand.value);
        break;
      default: break;
    }
    this.err(`この位置にはリテラル(数値・文字列・true/false)のみ指定できます`, e.loc);
  }
  private literalBool(e: Expr): boolean {
    if (e.type === 'bool') return e.value;
    return this.literalValue(e) === 'true';
  }

  // --- 変数・リスト・モニター ----------------------------------------------
  private makeCtx(targetName: string, isStage: boolean): TargetCtx {
    const ctx: TargetCtx = {
      targetName, isStage,
      varIds: new Map(), varEntities: new Map(),
      listIds: new Map(), listEntities: new Map(),
      procs: new Map(), params: new Map(),
    };
    if (!isStage) {
      for (const [name, ent] of this.cr.ctx.stageVars) {
        ctx.varEntities.set(name, ent);
        ctx.varIds.set(name, this.varIdOf(ent));
      }
      for (const [name, ent] of this.cr.ctx.stageLists) {
        ctx.listEntities.set(name, ent);
        ctx.listIds.set(name, this.listIdOf(ent));
      }
    }
    return ctx;
  }

  private emitDecls(body: BodyItem[], ctx: TargetCtx, target: SB3Target, isStage: boolean): void {
    for (const item of body) {
      if (!('decl' in item)) continue;
      if (item.decl === 'var') {
        const v = item;
        const ent: VarEntity = { entity: 'var', decl: v, owner: ctx.targetName, scope: isStage ? 'global' : 'local' };
        // チェッカが作ったエンティティと同一視するため名前キーで共有
        const existing = isStage ? this.cr.ctx.stageVars.get(v.name) : this.cr.ctx.spriteVars.get(ctx.targetName)?.get(v.name);
        const entity = existing ?? ent;
        const id = this.varIdOf(entity);
        ctx.varEntities.set(v.name, entity);
        ctx.varIds.set(v.name, id);
        const storedName = (v.cloud ? '☁ ' : '') + v.name;
        const value = this.initValue(v.init);
        target.variables[id] = v.cloud
          ? [storedName, String(value), true]
          : [storedName, value as string | number];
        if (v.monitor) {
          this.monitors.push({
            id,
            mode: v.monitor.mode === 'list' ? 'default' : v.monitor.mode,
            opcode: 'data_variable',
            params: { VARIABLE: storedName },
            spriteName: isStage ? null : ctx.targetName,
            value,
            width: 0, height: 0,
            x: 5, y: this.monitorY,
            visible: v.monitor.visible,
            ...(v.monitor.mode === 'slider' ? {
              sliderMin: v.monitor.min ?? 0, sliderMax: v.monitor.max ?? 100,
              min: v.monitor.min ?? 0, max: v.monitor.max ?? 100,
              isDiscrete: true,
            } : {}),
          });
          this.monitorY += 55;
        }
      } else if (item.decl === 'list') {
        const l = item;
        const ent: ListEntity = { entity: 'list', decl: l, owner: ctx.targetName, scope: isStage ? 'global' : 'local' };
        const existing = isStage ? this.cr.ctx.stageLists.get(l.name) : this.cr.ctx.spriteLists.get(ctx.targetName)?.get(l.name);
        const entity = existing ?? ent;
        const id = this.listIdOf(entity);
        ctx.listEntities.set(l.name, entity);
        ctx.listIds.set(l.name, id);
        target.lists[id] = [l.name, l.init.map(i => this.initValue(i) as string | number)];
        if (l.monitor) {
          this.monitors.push({
            id, mode: 'list', opcode: 'data_listcontents',
            params: { LIST: l.name },
            spriteName: isStage ? null : ctx.targetName,
            value: [], width: 210, height: 46, x: 300, y: 5,
            visible: l.monitor.visible,
          });
        }
      }
    }
  }

  private initValue(e: Expr): string | number | boolean {
    switch (e.type) {
      case 'num': return e.value;
      case 'str': return e.value;
      case 'color': return e.value;
      case 'bool': return e.value;
      case 'unary':
        if (e.op === '-' && e.operand.type === 'num') return -e.operand.value;
        break;
      default: break;
    }
    this.err(`変数の初期値はリテラル(数値・文字列・true/false)のみ対応しています`, e.loc);
  }

  // --- コスチューム/サウンド ------------------------------------------------
  private buildCostume(targetName: string, costumeName: string, isStage: boolean) {
    const stored = this.store.costumes.get(assetKey(targetName, costumeName));
    let bytes: Uint8Array; let dataFormat: 'svg' | 'png';
    let rcx: number; let rcy: number; let bitmapResolution: number | undefined;
    if (stored) {
      bytes = stored.bytes; dataFormat = stored.dataFormat;
      rcx = stored.rotationCenterX; rcy = stored.rotationCenterY;
      bitmapResolution = stored.bitmapResolution;
    } else {
      const d: AssetFile = isStage ? defaultStageBackdrop() : defaultSpriteCostume();
      bytes = d.bytes; dataFormat = 'svg';
      rcx = isStage ? 240 : 48; rcy = isStage ? 180 : 50;
    }
    const md5 = md5Bytes(bytes);
    this.assets.set(`${md5}.${dataFormat}`, bytes);
    return {
      name: costumeName,
      ...(bitmapResolution !== undefined && bitmapResolution !== 1 ? { bitmapResolution } : {}),
      dataFormat,
      assetId: md5,
      md5ext: `${md5}.${dataFormat}`,
      rotationCenterX: rcx,
      rotationCenterY: rcy,
    };
  }

  private buildSound(targetName: string, soundName: string) {
    const stored = this.store.sounds.get(assetKey(targetName, soundName));
    let bytes: Uint8Array; let dataFormat: 'wav' | 'mp3';
    let rate = 22050; let sampleCount = 0; let format = '';
    if (stored) {
      bytes = stored.bytes; dataFormat = stored.dataFormat;
      rate = stored.rate; sampleCount = stored.sampleCount; format = stored.format ?? '';
    } else {
      const d = emptyWav();
      bytes = d.bytes; dataFormat = 'wav';
    }
    const md5 = md5Bytes(bytes);
    this.assets.set(`${md5}.${dataFormat}`, bytes);
    return { name: soundName, assetId: md5, dataFormat, format, rate, sampleCount, md5ext: `${md5}.${dataFormat}` };
  }

  // --- イベント/定義 ---------------------------------------------------------
  private scriptPos(i: number): { x: number; y: number } {
    const col = i % 4;
    const row = Math.floor(i / 4);
    return { x: 60 + col * 330, y: 60 + row * 430 };
  }

  private emitEvent(bb: BlockBuilder, ctx: TargetCtx, e: EventDef, scriptIdx: number): void {
    const { x, y } = this.scriptPos(scriptIdx);
    let hatId: string;
    const hat = e.hat;
    switch (hat.hat) {
      case 'flag': hatId = bb.add('event_whenflagclicked', { topLevel: true, x, y }); break;
      case 'click': hatId = bb.add('event_whenthisspriteclicked', { topLevel: true, x, y }); break;
      case 'clone': hatId = bb.add('event_whenstartasclone', { topLevel: true, x, y }); break;
      case 'key': {
        if (hat.key.type !== 'str') this.err('on key のキー名は文字列リテラルで指定してください', hat.key.loc);
        hatId = bb.add('event_whenkeypressed', { topLevel: true, x, y, fields: { KEY_OPTION: [scratchKeyName(hat.key.value), null] } });
        break;
      }
      case 'receive': {
        if (hat.msg.type !== 'str') this.err('on receive のメッセージ名は文字列リテラルで指定してください', hat.msg.loc);
        const name = hat.msg.value;
        const id = this.broadcastId(name);
        hatId = bb.add('event_whenbroadcastreceived', {
          topLevel: true, x, y,
          fields: { BROADCAST_OPTION: [name, id] },
        });
        break;
      }
      case 'greaterthan': {
        const slot = this.compileExpr(bb, ctx, hat.value);
        hatId = bb.add('event_whengreaterthan', {
          topLevel: true, x, y,
          inputs: { VALUE: inputOf(slot, [4, '10']) },
          fields: { WHENGREATTHANMENU: [hat.sensor === 'timer' ? 'TIMER' : 'LOUDNESS', null] },
        });
        bb.adoptInputs(hatId, { VALUE: inputOf(slot, [4, '10']) });
        break;
      }
      case 'backdrop': {
        if (hat.name.type !== 'str') this.err('on backdrop の背景名は文字列リテラルで指定してください', hat.name.loc);
        hatId = bb.add('event_whenbackdropswitchesto', { topLevel: true, x, y, fields: { BACKDROP: [hat.name.value, null] } });
        break;
      }
    }
    const savedParams = ctx.params;
    ctx.params = new Map();
    const bodyId = this.compileStmts(bb, ctx, e.body);
    if (bodyId) bb.link(hatId, bodyId);
    ctx.params = savedParams;
  }

  private emitDef(bb: BlockBuilder, ctx: TargetCtx, d: FuncDef, scriptIdx: number): void {
    const { x, y } = this.scriptPos(scriptIdx);
    const info = ctx.procs.get(d.name)!;
    const defId = bb.add('procedures_definition', { topLevel: true, x, y });
    const protoId = bb.add('procedures_prototype', {
      shadow: true,
      mutation: {
        proccode: info.proccode,
        argumentids: JSON.stringify(info.argUids),
        argumentnames: JSON.stringify(d.params.map(p => p.name)),
        argumentdefaults: JSON.stringify(d.params.map(p => (p.paramType.kind === 'bool' ? 'false' : ''))),
        warp: d.warp ? 'true' : 'false',
      },
    });
    bb.blocks[defId].inputs.custom_block = [1, protoId];
    bb.blocks[protoId].parent = defId;
    const paramMap = new Map<string, { uid: string; paramType: SPType }>();
    d.params.forEach((p, i) => {
      const isBool = p.paramType.kind === 'bool';
      const repId = bb.add(isBool ? 'argument_reporter_boolean' : 'argument_reporter_string_number', {
        shadow: true,
        fields: { VALUE: [p.name, null] },
      });
      bb.blocks[protoId].inputs[info.argUids[i]] = [1, repId];
      bb.blocks[repId].parent = protoId;
      paramMap.set(p.name, { uid: info.argUids[i], paramType: p.paramType });
    });
    const savedParams = ctx.params;
    ctx.params = paramMap;
    const bodyId = this.compileStmts(bb, ctx, d.body);
    if (bodyId) bb.link(defId, bodyId);
    ctx.params = savedParams;
  }

  // --- 文のコンパイル --------------------------------------------------------
  private compileStmts(bb: BlockBuilder, ctx: TargetCtx, stmts: Stmt[]): string | null {
    let first: string | null = null;
    let last: string | null = null;
    for (const s of stmts) {
      const r = this.compileStmt(bb, ctx, s);
      if (!r) continue;
      if (!first) first = r.first;
      if (last) bb.link(last, r.first);
      last = r.last;
    }
    return first;
  }

  private compileStmt(bb: BlockBuilder, ctx: TargetCtx, s: Stmt): { first: string; last: string } | null {
    switch (s.type) {
      case 'comment':
      case 'pass':
      case 'unsupported':
        return null;
      case 'assign': return this.compileAssign(bb, ctx, s);
      case 'augassign': {
        const ent = this.resolveVarEntity(ctx, s.target);
        const slot = this.compileExpr(bb, ctx, s.value);
        const inputs = { VALUE: inputOf(slot, [4, '1']) };
        const id = bb.add('data_changevariableby', {
          inputs,
          fields: { VARIABLE: this.varField(ent) },
        });
        bb.adoptInputs(id, inputs);
        return { first: id, last: id };
      }
      case 'exprstmt': return this.compileCommandCall(bb, ctx, s.expr, s.loc);
      case 'listmethod': return this.compileListMethod(bb, ctx, s);
      case 'wait': {
        const slot = this.compileExpr(bb, ctx, s.secs);
        const inputs = { DURATION: inputOf(slot, [5, '1']) };
        const id = bb.add('control_wait', { inputs });
        bb.adoptInputs(id, inputs);
        return { first: id, last: id };
      }
      case 'repeat': {
        const slot = this.compileExpr(bb, ctx, s.count);
        const inputs = { TIMES: inputOf(slot, [6, '10']) };
        const id = bb.add('control_repeat', { inputs });
        bb.adoptInputs(id, inputs);
        const bodyId = this.compileStmts(bb, ctx, s.body);
        if (bodyId) { bb.blocks[id].inputs.SUBSTACK = [2, bodyId]; bb.blocks[bodyId].parent = id; }
        return { first: id, last: id };
      }
      case 'forever': {
        const id = bb.add('control_forever', {});
        const bodyId = this.compileStmts(bb, ctx, s.body);
        if (bodyId) { bb.blocks[id].inputs.SUBSTACK = [2, bodyId]; bb.blocks[bodyId].parent = id; }
        return { first: id, last: id };
      }
      case 'while': {
        const condSlot = this.compileExpr(bb, ctx, { type: 'unary', op: 'not', operand: s.cond, loc: s.loc });
        const condInput = boolInput(condSlot);
        const id = bb.add('control_repeat_until', { inputs: { CONDITION: condInput } });
        if (condSlot.kind === 'block') bb.blocks[condSlot.id].parent = id;
        const bodyId = this.compileStmts(bb, ctx, s.body);
        if (bodyId) { bb.blocks[id].inputs.SUBSTACK = [2, bodyId]; bb.blocks[bodyId].parent = id; }
        return { first: id, last: id };
      }
      case 'if': return this.compileIf(bb, ctx, s);
      case 'stop': {
        const what = s.what === 'other scripts' ? 'other scripts in sprite' : s.what;
        const id = bb.add('control_stop', {
          fields: { STOP_OPTION: [what, null] },
          mutation: { hasnext: s.what === 'other scripts' ? 'true' : 'false' },
        });
        return { first: id, last: id };
      }
      case 'broadcast': {
        const slot = this.compileExpr(bb, ctx, s.msg);
        let input: BlockInput;
        if (slot.kind === 'lit') {
          input = [1, [11, slot.value, this.broadcastId(slot.value)] as unknown as InputValue];
        } else if (slot.kind === 'block') {
          input = [3, slot.id, [11, 'message1', this.broadcastId('message1')] as unknown as InputValue];
        } else {
          input = [1, [11, 'message1', this.broadcastId('message1')] as unknown as InputValue];
        }
        const id = bb.add(s.wait ? 'event_broadcastandwait' : 'event_broadcast', { inputs: { BROADCAST_INPUT: input } });
        bb.adoptInputs(id, { BROADCAST_INPUT: input });
        return { first: id, last: id };
      }
      case 'clone': {
        if (s.action === 'delete') {
          const id = bb.add('control_delete_this_clone', {});
          return { first: id, last: id };
        }
        let targetName = '_self_';
        if (s.target) {
          if (s.target.type !== 'str') this.err('create_clone() の対象は文字列リテラル(スプライト名 または "myself")で指定してください', s.target.loc);
          targetName = s.target.value === 'myself' ? '_self_' : s.target.value;
        }
        const menuId = bb.add('control_create_clone_of_menu', { shadow: true, fields: { clone_option: [targetName, null] } });
        const id = bb.add('control_create_clone_of', { inputs: { CLONE_OPTION: [1, menuId] } });
        bb.blocks[menuId].parent = id;
        return { first: id, last: id };
      }
      case 'ask': {
        const slot = this.compileExpr(bb, ctx, s.question);
        const inputs = { QUESTION: inputOf(slot, [10, "What's your name?"]) };
        const id = bb.add('sensing_askandwait', { inputs });
        bb.adoptInputs(id, inputs);
        return { first: id, last: id };
      }
      case 'resettimer': {
        const id = bb.add('sensing_resettimer', {});
        return { first: id, last: id };
      }
      case 'showmonitor': {
        const name = s.name.name;
        const vEnt = ctx.varEntities.get(name);
        const lEnt = ctx.listEntities.get(name);
        let id: string;
        if (vEnt) {
          id = bb.add(s.show ? 'data_showvariable' : 'data_hidevariable', { fields: { VARIABLE: this.varField(vEnt) } });
        } else if (lEnt) {
          id = bb.add(s.show ? 'data_showlist' : 'data_hidelist', { fields: { LIST: [lEnt.decl.name, this.listIdOf(lEnt)] } });
        } else {
          return this.err(`変数/リスト '${name}' が見つかりません`, s.loc);
        }
        return { first: id, last: id };
      }
    }
  }

  private varField(ent: VarEntity): BlockField {
    const name = (ent.decl.cloud ? '☁ ' : '') + ent.decl.name;
    return [name, this.varIdOf(ent)];
  }

  private resolveVarEntity(ctx: TargetCtx, target: Expr): VarEntity {
    const name = target.type === 'name' || target.type === 'varref' ? target.name : null;
    if (!name) this.err('代入対象が不正です', target.loc);
    const res = this.cr.resolutions.get(target);
    if (res && res.entity === 'var') return res;
    const ent = ctx.varEntities.get(name!);
    if (!ent) this.err(`変数 '${name}' が見つかりません`, target.loc);
    return ent!;
  }

  private compileAssign(bb: BlockBuilder, ctx: TargetCtx, s: Extract<Stmt, { type: 'assign' }>): { first: string; last: string } {
    const slot = this.compileExpr(bb, ctx, s.value);
    if (s.target.type === 'index') {
      const listName = s.target.obj.type === 'name' ? s.target.obj.name
        : s.target.obj.type === 'listref' ? s.target.obj.name : null;
      if (!listName) this.err('添字代入の対象はリスト名のみ対応しています', s.loc);
      const listEnt = ctx.listEntities.get(listName!);
      if (!listEnt) this.err(`リスト '${listName}' が見つかりません`, s.loc);
      const idxSlot = this.compileIndexExpr(bb, ctx, s.target.index);
      const inputs = { INDEX: inputOf(idxSlot, [7, '1']), ITEM: inputOf(slot, [10, 'thing']) };
      const id = bb.add('data_replaceitemoflist', {
        inputs,
        fields: { LIST: [listName!, this.listIdOf(listEnt!)] },
      });
      bb.adoptInputs(id, inputs);
      return { first: id, last: id };
    }
    const ent = this.resolveVarEntity(ctx, s.target);
    const inputs = { VALUE: inputOf(slot, [10, '0']) };
    const id = bb.add('data_setvariableto', {
      inputs,
      fields: { VARIABLE: this.varField(ent) },
    });
    bb.adoptInputs(id, inputs);
    return { first: id, last: id };
  }

  private compileListMethod(bb: BlockBuilder, ctx: TargetCtx, s: Extract<Stmt, { type: 'listmethod' }>): { first: string; last: string } {
    const name = s.list.name;
    const ent = ctx.listEntities.get(name);
    if (!ent) this.err(`リスト '${name}' が見つかりません`, s.loc);
    const listField: BlockField = [name, this.listIdOf(ent)];
    switch (s.method) {
      case 'add': {
        const slot = this.compileExpr(bb, ctx, s.args[0]);
        const inputs = { ITEM: inputOf(slot, [10, 'thing']) };
        const b = bb.add('data_addtolist', { inputs, fields: { LIST: listField } });
        bb.adoptInputs(b, inputs);
        return { first: b, last: b };
      }
      case 'insert': {
        const idx = this.compileIndexExpr(bb, ctx, s.args[0]);
        const slot = this.compileExpr(bb, ctx, s.args[1]);
        const inputs = { INDEX: inputOf(idx, [7, '1']), ITEM: inputOf(slot, [10, 'thing']) };
        const b = bb.add('data_insertatlist', { inputs, fields: { LIST: listField } });
        bb.adoptInputs(b, inputs);
        return { first: b, last: b };
      }
      case 'delete': {
        const arg = s.args[0];
        if (arg && arg.type === 'str' && arg.value === 'all') {
          const b = bb.add('data_deletealloflist', { fields: { LIST: listField } });
          return { first: b, last: b };
        }
        const idx = this.compileIndexExpr(bb, ctx, arg);
        const inputs = { INDEX: inputOf(idx, [7, '1']) };
        const b = bb.add('data_deleteoflist', { inputs, fields: { LIST: listField } });
        bb.adoptInputs(b, inputs);
        return { first: b, last: b };
      }
      case 'clear': {
        const b = bb.add('data_deletealloflist', { fields: { LIST: listField } });
        return { first: b, last: b };
      }
    }
  }

  private compileIf(bb: BlockBuilder, ctx: TargetCtx, s: Extract<Stmt, { type: 'if' }>): { first: string; last: string } {
    const build = (i: number): string | null => {
      if (i >= s.branches.length) return null;
      const b = s.branches[i];
      if (!b.cond) {
        return this.compileStmts(bb, ctx, b.body);
      }
      const condSlot = this.compileExpr(bb, ctx, b.cond);
      const bodyId = this.compileStmts(bb, ctx, b.body);
      const elseId = build(i + 1);
      const inputs: Record<string, BlockInput> = { CONDITION: boolInput(condSlot) };
      if (bodyId) inputs.SUBSTACK = [2, bodyId];
      if (elseId) inputs.SUBSTACK2 = [2, elseId];
      const id = bb.add(elseId ? 'control_if_else' : 'control_if', { inputs });
      if (condSlot.kind === 'block') bb.blocks[condSlot.id].parent = id;
      if (bodyId) bb.blocks[bodyId].parent = id;
      if (elseId) bb.blocks[elseId].parent = id;
      return id;
    };
    const first = build(0);
    if (!first) this.err('if 文を変換できません', s.loc);
    return { first: first!, last: first! };
  }

  // --- コマンド呼び出し(式文) ------------------------------------------------
  private compileCommandCall(bb: BlockBuilder, ctx: TargetCtx, expr: Expr, loc?: Expr['loc']): { first: string; last: string } | null {
    if (expr.type !== 'call') {
      this.err('文として実行できるのは関数呼び出しだけです', loc);
    }
    const call = expr as Extract<Expr, { type: 'call' }>;
    const name = call.callee;

    // ユーザー定義ブロック
    const proc = ctx.procs.get(name);
    if (proc) {
      const inputs: Record<string, BlockInput> = {};
      call.args.forEach((a, i) => {
        const slot = this.compileExpr(bb, ctx, a);
        const uid = proc.argUids[i];
        const pt = proc.paramTypes[i];
        const isNumParam = pt && (pt.kind === 'int' || pt.kind === 'float');
        if (slot.kind === 'block') {
          inputs[uid] = [3, slot.id, [10, '']];
        } else if (slot.kind === 'lit') {
          inputs[uid] = [1, [isNumParam && slot.code === 10 ? 4 : slot.code, slot.value]];
        } else if (slot.kind === 'var') {
          inputs[uid] = [3, [12, slot.name, slot.id] as unknown as InputValue, [10, '']];
        } else if (slot.kind === 'list') {
          inputs[uid] = [3, [13, slot.name, slot.id] as unknown as InputValue, [10, '']];
        } else {
          inputs[uid] = [1, [10, '']];
        }
      });
      const id = bb.add('procedures_call', {
        inputs,
        mutation: {
          proccode: proc.proccode,
          argumentids: JSON.stringify(proc.argUids),
          warp: proc.warp ? 'true' : 'false',
        },
      });
      bb.adoptInputs(id, inputs);
      return { first: id, last: id };
    }

    // show()/hide() 0引数 → スプライト表示/非表示
    if ((name === 'show' || name === 'hide') && call.args.length === 0) {
      const id = bb.add(name === 'show' ? 'looks_show' : 'looks_hide', {});
      return { first: id, last: id };
    }
    // broadcast_and_wait はパーサで BroadcastStmt になるが、防御的に
    if (name === 'broadcast' || name === 'broadcast_and_wait') {
      const slot = this.compileExpr(bb, ctx, call.args[0]);
      const input: BlockInput = slot.kind === 'lit'
        ? [1, [11, slot.value, this.broadcastId(slot.value)] as unknown as InputValue]
        : [1, [11, 'message1', this.broadcastId('message1')] as unknown as InputValue];
      const id = bb.add(name === 'broadcast' ? 'event_broadcast' : 'event_broadcastandwait', { inputs: { BROADCAST_INPUT: input } });
      return { first: id, last: id };
    }

    if (PEN_BUILTINS.has(name)) this.extensions.add('pen');

    const r = this.compileBuiltin(bb, ctx, name, call.args, loc);
    if (!r) {
      this.err(`'${name}' をコマンド(文)として実行できません`, loc);
    }
    return r;
  }

  // --- 式のコンパイル --------------------------------------------------------
  compileExpr(bb: BlockBuilder, ctx: TargetCtx, e: Expr): Slot {
    switch (e.type) {
      case 'num': return { kind: 'lit', code: 4, value: String(e.value) };
      case 'str': return { kind: 'lit', code: 10, value: e.value };
      case 'color': return { kind: 'lit', code: 9, value: e.value };
      case 'bool': return this.compileBoolLitBlock(bb, e.value);
      case 'name': {
        const res = this.cr.resolutions.get(e) ?? this.fallbackResolve(ctx, e.name);
        if (!res) this.err(`'${e.name}' を解決できません`, e.loc);
        switch (res!.entity) {
          case 'var': {
            const storedName = (res!.decl.cloud ? '☁ ' : '') + res!.decl.name;
            return { kind: 'var', name: storedName, id: this.varIdOf(res!) };
          }
          case 'param': {
            const p = ctx.params.get(e.name);
            if (!p) this.err(`引数 '${e.name}' はブロック定義(def)内でのみ使えます`, e.loc);
            const isBool = p!.paramType.kind === 'bool';
            const id = bb.add(isBool ? 'argument_reporter_boolean' : 'argument_reporter_string_number', {
              fields: { VALUE: [e.name, null] },
            });
            return { kind: 'block', id };
          }
          case 'property': {
            const pd = PROPERTIES[res!.prop];
            if (pd.opcode.startsWith('music_')) this.extensions.add('music');
            const id = bb.add(pd.opcode, {});
            return { kind: 'block', id };
          }
          case 'list':
            return this.err(`リスト '${e.name}' は値として直接使用できません(${e.name}[i] や len(${e.name}) を使ってください)`, e.loc);
        }
        break;
      }
      case 'varref': {
        const ent = ctx.varEntities.get(e.name);
        if (!ent) this.err(`変数 '${e.name}' が見つかりません`, e.loc);
        return { kind: 'var', name: (ent!.decl.cloud ? '☁ ' : '') + ent!.decl.name, id: this.varIdOf(ent!) };
      }
      case 'listref': {
        const ent = ctx.listEntities.get(e.name);
        if (!ent) this.err(`リスト '${e.name}' が見つかりません`, e.loc);
        return { kind: 'list', name: e.name, id: this.listIdOf(ent!) };
      }
      case 'unary': {
        if (e.op === '-' && e.operand.type === 'num') return { kind: 'lit', code: 4, value: String(-e.operand.value) };
        if (e.op === '-') {
          const slot = this.compileExpr(bb, ctx, e.operand);
          const inputs = { NUM1: inputOf({ kind: 'lit', code: 4, value: '0' }, [4, '']), NUM2: inputOf(slot, [4, '']) };
          const id = bb.add('operator_subtract', { inputs });
          bb.adoptInputs(id, inputs);
          return { kind: 'block', id };
        }
        const slot = this.compileExpr(bb, ctx, e.operand);
        const input = boolInput(slot);
        const id = bb.add('operator_not', { inputs: { OPERAND: input } });
        if (slot.kind === 'block') bb.blocks[slot.id].parent = id;
        return { kind: 'block', id };
      }
      case 'binary': return this.compileBinary(bb, ctx, e);
      case 'index': {
        const objType = (e.obj as { spType?: SPType }).spType;
        if (objType?.kind === 'str' || e.obj.type === 'str') {
          const strSlot = this.compileExpr(bb, ctx, e.obj);
          const idxSlot = this.compileIndexExpr(bb, ctx, e.index);
          const inputs = { LETTER: inputOf(idxSlot, [6, '1']), STRING: inputOf(strSlot, [10, '']) };
          const id = bb.add('operator_letter_of', { inputs });
          bb.adoptInputs(id, inputs);
          return { kind: 'block', id };
        }
        const objName = e.obj.type === 'name' ? e.obj.name : e.obj.type === 'listref' ? e.obj.name : null;
        if (objName) {
          const listEnt = ctx.listEntities.get(objName);
          if (listEnt) {
            const idxSlot = this.compileIndexExpr(bb, ctx, e.index);
            const inputs = { INDEX: inputOf(idxSlot, [7, '1']) };
            const id = bb.add('data_itemoflist', { inputs, fields: { LIST: [objName, this.listIdOf(listEnt)] } });
            bb.adoptInputs(id, inputs);
            return { kind: 'block', id };
          }
        }
        this.err('添字アクセス [ ] の対象はリストか文字列のみ変換できます', e.loc);
        break;
      }
      case 'prop': return this.compileProp(bb, ctx, e);
      case 'call': {
        const name0 = call_expr_name(e);
        if (e.method) this.err(`'${name0}' は値を返しません(文として使用してください)`, e.loc);
        if (name0 === 'len') {
          const arg = e.args[0];
          const t = (arg as { spType?: SPType }).spType;
          const argName = arg.type === 'name' ? arg.name : arg.type === 'listref' ? arg.name : null;
          const listEnt = argName ? ctx.listEntities.get(argName) : undefined;
          if (t?.kind === 'list' || listEnt) {
            if (!listEnt) this.err('len() の対象リストを解決できません', arg.loc);
            const id = bb.add('data_lengthoflist', { fields: { LIST: [argName!, this.listIdOf(listEnt!)] } });
            return { kind: 'block', id };
          }
          const argSlot = this.compileExpr(bb, ctx, arg);
          const inputs = { STRING: inputOf(argSlot, [10, '']) };
          const id = bb.add('operator_length', { inputs });
          bb.adoptInputs(id, inputs);
          return { kind: 'block', id };
        }
        if (name0 === 'var' && e.args[0]?.type === 'str') {
          const ent = ctx.varEntities.get(e.args[0].value);
          if (!ent) this.err(`変数 '${e.args[0].value}' が見つかりません`, e.loc);
          return { kind: 'var', name: (ent!.decl.cloud ? '☁ ' : '') + ent!.decl.name, id: this.varIdOf(ent!) };
        }
        if (name0 === 'list' && e.args[0]?.type === 'str') {
          const ent = ctx.listEntities.get(e.args[0].value);
          if (!ent) this.err(`リスト '${e.args[0].value}' が見つかりません`, e.loc);
          return { kind: 'list', name: e.args[0].value, id: this.listIdOf(ent!) };
        }
        if (ctx.procs.has(name0)) this.err(`ブロック '${name0}' は値を返しません(文として使用してください)`, e.loc);
        const rep = this.compileReporter(bb, ctx, name0, e.args, e.loc);
        if (rep) return rep;
        this.err(`'${name0}' は値を返す式としては使えません(コマンドは文の位置に書いてください)`, e.loc);
        break;
      }
      case 'listlit':
        this.err('リストリテラル [ ] は var/list の初期値としてのみ使用できます', e.loc);
    }
    return this.err(`式を変換できません (${(e as Expr).type})`, (e as Expr).loc);
  }

  private fallbackResolve(ctx: TargetCtx, name: string): NameResolution | null {
    const par = ctx.params.get(name);
    if (par) return { entity: 'param', param: { name, paramType: par.paramType } };
    const v = ctx.varEntities.get(name);
    if (v) return v;
    const l = ctx.listEntities.get(name);
    if (l) return l;
    const p = PROPERTIES[name];
    if (p) return { entity: 'property', prop: name };
    return null;
  }

  private compileBoolLitBlock(bb: BlockBuilder, value: boolean): Slot {
    const id = bb.add('operator_equals', {
      inputs: {
        OPERAND1: [1, [10, '1']],
        OPERAND2: [1, [10, value ? '1' : '2']],
      },
    });
    return { kind: 'block', id };
  }

  private compileBinary(bb: BlockBuilder, ctx: TargetCtx, e: Extract<Expr, { type: 'binary' }>): Slot {
    const op = e.op;
    // in 演算子: 右辺がリストの場合は fields 参照(右辺を値としてコンパイルしない)
    if (op === 'in') {
      const rightName = e.right.type === 'name' ? e.right.name : e.right.type === 'listref' ? e.right.name : null;
      const listEnt = rightName ? ctx.listEntities.get(rightName) : undefined;
      const l0 = this.compileExpr(bb, ctx, e.left);
      if (listEnt) {
        const inputs = { ITEM: inputOf(l0, [10, 'thing']) };
        const id = bb.add('data_listcontainsitem', { inputs, fields: { LIST: [rightName!, this.listIdOf(listEnt)] } });
        bb.adoptInputs(id, inputs);
        return { kind: 'block', id };
      }
      const r0 = this.compileExpr(bb, ctx, e.right);
      const inputs = { STRING1: inputOf(r0, [10, '']), STRING2: inputOf(l0, [10, '']) };
      const id = bb.add('operator_contains', { inputs });
      bb.adoptInputs(id, inputs);
      return { kind: 'block', id };
    }
    const l = this.compileExpr(bb, ctx, e.left);
    const r = this.compileExpr(bb, ctx, e.right);
    let id: string;
    const bin = (opcode: string, in1: BlockInput, in2: BlockInput, n1 = 'NUM1', n2 = 'NUM2'): string => {
      const inputs: Record<string, BlockInput> = { [n1]: in1, [n2]: in2 };
      const bid = bb.add(opcode, { inputs });
      bb.adoptInputs(bid, inputs);
      return bid;
    };
    switch (op) {
      case '+': {
        const lt = (e.left as { spType?: SPType }).spType;
        const rt = (e.right as { spType?: SPType }).spType;
        if (lt?.kind === 'str' || rt?.kind === 'str') {
          id = bin('operator_join', inputOf(l, [10, '']), inputOf(r, [10, '']), 'STRING1', 'STRING2');
        } else {
          id = bin('operator_add', inputOf(l, [4, '']), inputOf(r, [4, '']));
        }
        break;
      }
      case '-': id = bin('operator_subtract', inputOf(l, [4, '']), inputOf(r, [4, ''])); break;
      case '*': id = bin('operator_multiply', inputOf(l, [4, '']), inputOf(r, [4, ''])); break;
      case '/': id = bin('operator_divide', inputOf(l, [4, '']), inputOf(r, [4, ''])); break;
      case '%': id = bin('operator_mod', inputOf(l, [4, '']), inputOf(r, [4, ''])); break;
      case '==': id = bin('operator_equals', inputOf(l, [10, '']), inputOf(r, [10, '']), 'OPERAND1', 'OPERAND2'); break;
      case '!=': {
        const eq = bin('operator_equals', inputOf(l, [10, '']), inputOf(r, [10, '']), 'OPERAND1', 'OPERAND2');
        id = bb.add('operator_not', { inputs: { OPERAND: [2, eq] } });
        bb.blocks[eq].parent = id;
        return { kind: 'block', id };
      }
      case '<': id = bin('operator_lt', inputOf(l, [10, '']), inputOf(r, [10, '']), 'OPERAND1', 'OPERAND2'); break;
      case '>': id = bin('operator_gt', inputOf(l, [10, '']), inputOf(r, [10, '']), 'OPERAND1', 'OPERAND2'); break;
      case '<=': {
        const gt = bin('operator_gt', inputOf(l, [10, '']), inputOf(r, [10, '']), 'OPERAND1', 'OPERAND2');
        id = bb.add('operator_not', { inputs: { OPERAND: [2, gt] } });
        bb.blocks[gt].parent = id;
        return { kind: 'block', id };
      }
      case '>=': {
        const lt = bin('operator_lt', inputOf(l, [10, '']), inputOf(r, [10, '']), 'OPERAND1', 'OPERAND2');
        id = bb.add('operator_not', { inputs: { OPERAND: [2, lt] } });
        bb.blocks[lt].parent = id;
        return { kind: 'block', id };
      }
      case 'and': id = bin('operator_and', boolInput(l), boolInput(r), 'OPERAND1', 'OPERAND2'); break;
      case 'or': id = bin('operator_or', boolInput(l), boolInput(r), 'OPERAND1', 'OPERAND2'); break;
      default:
        this.err(`演算子 '${op}' は変換できません`, e.loc);
    }
    return { kind: 'block', id: id! };
  }

  private compileProp(bb: BlockBuilder, ctx: TargetCtx, e: Extract<Expr, { type: 'prop' }>): Slot {
    if (e.obj.type !== 'name') this.err('プロパティ参照は「スプライト名.プロパティ」形式のみ変換できます', e.loc);
    const objName = (e.obj as { name: string }).name;
    const isStageRef = objName === this.cr.ctx.stageName || objName === 'stage';
    if (!isStageRef && !this.cr.ctx.spriteNames.includes(objName)) {
      this.err(`'${objName}' はスプライト名ではありません`, e.loc);
    }
    const propName = SENSING_OF_PROPS[e.prop];
    let property = propName ?? null;
    if (!property) {
      const vars = isStageRef ? this.cr.ctx.stageVars : this.cr.ctx.spriteVars.get(objName);
      if (vars?.has(e.prop)) property = e.prop;
      else if (!isStageRef && this.cr.ctx.stageVars.has(e.prop)) property = e.prop;
    }
    if (!property) this.err(`'${objName}.${e.prop}' を変換できません`, e.loc);
    if (property === 'tempo') this.extensions.add('music');
    const menuId = bb.add('sensing_of_object_menu', {
      shadow: true,
      fields: { OBJECT: [isStageRef ? '_stage_' : objName, null] },
    });
    const id = bb.add('sensing_of', {
      inputs: { OBJECT: [1, menuId] },
      fields: { PROPERTY: [property!, null] },
    });
    bb.blocks[menuId].parent = id;
    return { kind: 'block', id };
  }

  private compileIndexExpr(bb: BlockBuilder, ctx: TargetCtx, e: Expr): Slot {
    if (e.type === 'str' && ['last', 'random', 'all'].includes(e.value)) {
      return { kind: 'lit', code: 7, value: e.value };
    }
    if (e.type === 'num') {
      return { kind: 'lit', code: 7, value: String(Math.trunc(e.value)) };
    }
    return this.compileExpr(bb, ctx, e);
  }

  // --- 組み込みコマンド -------------------------------------------------------
  private compileBuiltin(bb: BlockBuilder, ctx: TargetCtx, name: string, args: Expr[], loc?: Expr['loc']): { first: string; last: string } | null {
    const A = (i: number): Slot => (args[i] ? this.compileExpr(bb, ctx, args[i]) : { kind: 'empty' });
    const S = (i: number): string => {
      const a = args[i];
      if (a && (a.type === 'str' || a.type === 'color')) return a.value;
      return this.err(`${name}() の引数${i + 1}は文字列リテラルが必要です`, a?.loc ?? loc);
    };
    const one = (opcode: string, inputs: Record<string, BlockInput> = {}, fields?: Record<string, BlockField>): { first: string; last: string } => {
      const id = bb.add(opcode, { inputs, fields });
      bb.adoptInputs(id, inputs);
      return { first: id, last: id };
    };
    const menuIn = (opcode: string, menuOpcode: string, fieldName: string, value: string, extraInputs?: Record<string, BlockInput>): { first: string; last: string } => {
      const menuId = bb.add(menuOpcode, { shadow: true, fields: { [fieldName]: [value, null] } });
      const inputName = MENU_INPUT_NAME[opcode];
      const inputs: Record<string, BlockInput> = { ...(extraInputs ?? {}), [inputName]: [1, menuId] };
      const id = bb.add(opcode, { inputs });
      bb.blocks[menuId].parent = id;
      bb.adoptInputs(id, extraInputs ?? {});
      return { first: id, last: id };
    };

    switch (name) {
      // --- motion ---
      case 'move': return one('motion_movesteps', { STEPS: inputOf(A(0), [4, '10']) });
      case 'turn_right': return one('motion_turnright', { DEGREES: inputOf(A(0), [4, '15']) });
      case 'turn_left': return one('motion_turnleft', { DEGREES: inputOf(A(0), [4, '15']) });
      case 'goto':
        if (args.length === 2) return one('motion_gotoxy', { X: inputOf(A(0), [4, '0']), Y: inputOf(A(1), [4, '0']) });
        return menuIn('motion_goto', 'motion_goto_menu', 'TO', gotoMenuValue(S(0)));
      case 'glide':
        if (args.length === 3) return one('motion_glidesecstoxy', { SECS: inputOf(A(0), [4, '1']), X: inputOf(A(1), [4, '0']), Y: inputOf(A(2), [4, '0']) });
        return menuIn('motion_glideto', 'motion_goto_menu', 'TO', gotoMenuValue(S(1)), { SECS: inputOf(A(0), [4, '1']) });
      case 'point': return one('motion_pointindirection', { DIRECTION: inputOf(A(0), [8, '90']) });
      case 'point_towards': return menuIn('motion_pointtowards', 'motion_pointtowards_menu', 'TOWARDS', gotoMenuValue(S(0)));
      case 'change_x': return one('motion_changexby', { X: inputOf(A(0), [4, '10']) });
      case 'set_x': return one('motion_setx', { X: inputOf(A(0), [4, '0']) });
      case 'change_y': return one('motion_changeyby', { Y: inputOf(A(0), [4, '10']) });
      case 'set_y': return one('motion_sety', { Y: inputOf(A(0), [4, '0']) });
      case 'bounce': return one('motion_ifonedgebounce', {});
      case 'set_rotation_style': return one('motion_setrotationstyle', {}, { STYLE: [S(0), null] });
      // --- looks ---
      case 'say':
        return args.length >= 2
          ? one('looks_sayforsecs', { MESSAGE: inputOf(A(0), [10, 'Hello!']), SECS: inputOf(A(1), [4, '2']) })
          : one('looks_say', { MESSAGE: inputOf(A(0), [10, 'Hello!']) });
      case 'think':
        return args.length >= 2
          ? one('looks_thinkforsecs', { MESSAGE: inputOf(A(0), [10, 'Hmm...']), SECS: inputOf(A(1), [4, '2']) })
          : one('looks_think', { MESSAGE: inputOf(A(0), [10, 'Hmm...']) });
      case 'switch_costume': return menuIn('looks_switchcostumeto', 'looks_costume', 'COSTUME', S(0));
      case 'next_costume': return one('looks_nextcostume', {});
      case 'switch_backdrop': return menuIn('looks_switchbackdropto', 'looks_backdrops', 'BACKDROP', S(0));
      case 'next_backdrop': return one('looks_nextbackdrop', {});
      case 'change_size': return one('looks_changesizeby', { CHANGE: inputOf(A(0), [4, '10']) });
      case 'set_size': return one('looks_setsizeto', { SIZE: inputOf(A(0), [4, '100']) });
      case 'change_effect': return menuIn('looks_changeeffectby', 'looks_effect_menu', 'EFFECT', S(0).toUpperCase(), { CHANGE: inputOf(A(1), [4, '25']) });
      case 'set_effect': return menuIn('looks_seteffectto', 'looks_effect_menu', 'EFFECT', S(0).toUpperCase(), { VALUE: inputOf(A(1), [4, '0']) });
      case 'clear_effects': return one('looks_cleargraphiceffects', {});
      case 'go_to_layer': return one('looks_gotofrontback', {}, { FRONT_BACK: [S(0), null] });
      case 'change_layer': return one('looks_goforwardbackwardby', { NUM: inputOf(A(1), [4, '1']) }, { FORWARD_BACKWARD: [S(0), null] });
      // --- sound ---
      case 'play_sound': return menuIn('sound_play', 'sound_sounds_menu', 'SOUND_MENU', S(0));
      case 'play_sound_until_done': return menuIn('sound_playuntildone', 'sound_sounds_menu', 'SOUND_MENU', S(0));
      case 'stop_all_sounds': return one('sound_stopallsounds', {});
      case 'change_volume': return one('sound_changevolumeby', { VOLUME: inputOf(A(0), [4, '-10']) });
      case 'set_volume': return one('sound_setvolumeto', { VOLUME: inputOf(A(0), [4, '100']) });
      case 'change_sound_effect': return menuIn('sound_changeeffectby', 'sound_effectsmenu', 'EFFECT', S(0).toUpperCase(), { VALUE: inputOf(A(1), [4, '10']) });
      case 'set_sound_effect': return menuIn('sound_seteffectto', 'sound_effectsmenu', 'EFFECT', S(0).toUpperCase(), { VALUE: inputOf(A(1), [4, '100']) });
      case 'clear_sound_effects': return one('sound_cleareffects', {});
      case 'wait_until': {
        const slot = this.compileExpr(bb, ctx, args[0]);
        const input = boolInput(slot);
        const id = bb.add('control_wait_until', { inputs: { CONDITION: input } });
        if (slot.kind === 'block') bb.blocks[slot.id].parent = id;
        return { first: id, last: id };
      }
      // --- sensing ---
      case 'reset_timer': return one('sensing_resettimer', {});
      case 'set_drag_mode': return one('sensing_setdragmode', {}, { DRAG_MODE: [S(0), null] });
      // --- events(防御的) ---
      case 'create_clone': {
        let targetName = '_self_';
        if (args[0]) {
          const v = S(0);
          targetName = v === 'myself' ? '_self_' : v;
        }
        const menuId = bb.add('control_create_clone_of_menu', { shadow: true, fields: { clone_option: [targetName, null] } });
        const id = bb.add('control_create_clone_of', { inputs: { CLONE_OPTION: [1, menuId] } });
        bb.blocks[menuId].parent = id;
        return { first: id, last: id };
      }
      case 'delete_clone': return one('control_delete_this_clone', {});
      case 'ask': return one('sensing_askandwait', { QUESTION: inputOf(A(0), [10, "What's your name?"]) });
      // --- pen ---
      case 'pen_down': return one('pen_penDown', {});
      case 'pen_up': return one('pen_penUp', {});
      case 'stamp': return one('pen_stamp', {});
      case 'clear_pen': return one('pen_clear', {});
      case 'set_pen_color': return one('pen_setPenColorToColor', { COLOR: [1, [9, S(0)]] });
      case 'change_pen_param': return menuIn('pen_changePenColorParamBy', 'pen_menu_colorParam', 'COLOR_PARAM', S(0), { VALUE: inputOf(A(1), [4, '10']) });
      case 'set_pen_param': return menuIn('pen_setPenColorParamTo', 'pen_menu_colorParam', 'COLOR_PARAM', S(0), { VALUE: inputOf(A(1), [4, '50']) });
      case 'change_pen_size': return one('pen_changePenSizeBy', { SIZE: inputOf(A(0), [4, '1']) });
      case 'set_pen_size': return one('pen_setPenSizeTo', { SIZE: inputOf(A(0), [4, '1']) });
      default:
        return null;
    }
  }

  // --- 組み込みレポータ -------------------------------------------------------
  private compileReporter(bb: BlockBuilder, ctx: TargetCtx, name: string, args: Expr[], loc?: Expr['loc']): Slot | null {
    const A = (i: number): Slot => (args[i] ? this.compileExpr(bb, ctx, args[i]) : { kind: 'empty' });
    const S = (i: number): string => {
      const a = args[i];
      if (a && (a.type === 'str' || a.type === 'color')) return a.value;
      return this.err(`${name}() の引数${i + 1}は文字列リテラルが必要です`, a?.loc ?? loc);
    };
    const rep = (opcode: string, inputs: Record<string, BlockInput> = {}, fields?: Record<string, BlockField>): Slot => {
      const id = bb.add(opcode, { inputs, fields });
      bb.adoptInputs(id, inputs);
      return { kind: 'block', id };
    };
    switch (name) {
      case 'random': return rep('operator_random', { FROM: inputOf(A(0), [4, '1']), TO: inputOf(A(1), [4, '10']) });
      case 'round': return rep('operator_round', { NUM: inputOf(A(0), [4, '']) });
      case 'mod': return rep('operator_mod', { NUM1: inputOf(A(0), [4, '']), NUM2: inputOf(A(1), [4, '']) });
      case 'letter': return rep('operator_letter_of', { LETTER: inputOf(A(0), [6, '1']), STRING: inputOf(A(1), [10, '']) });
      case 'join': return rep('operator_join', { STRING1: inputOf(A(0), [10, '']), STRING2: inputOf(A(1), [10, '']) });
      case 'abs': case 'floor': case 'ceil': case 'sqrt': case 'sin': case 'cos': case 'tan':
      case 'asin': case 'acos': case 'atan': case 'ln': case 'log10': case 'pow10': case 'exp': {
        const mop = MATHOP[name];
        return rep('operator_mathop', { NUM: inputOf(A(0), [4, '']) }, { OPERATOR: [mop, null] });
      }
      case 'key_pressed': {
        const menuId = bb.add('sensing_keyoptions', { shadow: true, fields: { KEY_OPTION: [scratchKeyName(S(0)), null] } });
        const id = bb.add('sensing_keypressed', { inputs: { KEY_OPTION: [1, menuId] } });
        bb.blocks[menuId].parent = id;
        return { kind: 'block', id };
      }
      case 'touching': {
        const menuId = bb.add('sensing_touchingobjectmenu', { shadow: true, fields: { TOUCHINGOBJECTMENU: [touchMenuValue(S(0)), null] } });
        const id = bb.add('sensing_touchingobject', { inputs: { TOUCHINGOBJECTMENU: [1, menuId] } });
        bb.blocks[menuId].parent = id;
        return { kind: 'block', id };
      }
      case 'touching_color': return rep('sensing_touchingcolor', { COLOR: [1, [9, S(0)]] });
      case 'color_touching_color': return rep('sensing_coloristouchingcolor', { COLOR: [1, [9, S(0)]], COLOR2: [1, [9, S(1)]] });
      case 'distance_to': {
        const menuId = bb.add('sensing_distancetomenu', { shadow: true, fields: { DISTANCETOMENU: [gotoMenuValue(S(0)), null] } });
        const id = bb.add('sensing_distanceto', { inputs: { DISTANCETOMENU: [1, menuId] } });
        bb.blocks[menuId].parent = id;
        return { kind: 'block', id };
      }
      case 'current': case 'current_of':
        return rep('sensing_current', {}, { CURRENTMENU: [currentMenu(S(0)), null] });
      default: return null;
    }
  }
}

function call_expr_name(e: Extract<Expr, { type: 'call' }>): string { return e.callee; }

// ---------------------------------------------------------------------------
// 公開 API
// ---------------------------------------------------------------------------
export function exportProgram(
  program: Program,
  store: AssetStore = emptyAssetStore(),
  checkResult?: CheckResult,
): ExportResult {
  const cr = checkResult ?? check(program);
  const errors = cr.diagnostics.filter(d => d.severity === 'error');
  if (errors.length) throw new ExportError(errors);
  const exporter = new Exporter(program, cr, store);
  return exporter.run();
}
