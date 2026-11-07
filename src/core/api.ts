/**
 * ScratchPy Studio コア API (ファサード)
 * ----------------------------------------
 * UI とテストはここを通じて変換機能を使う。
 *
 *  - analyzeText(src)        : テキスト → 診断 + AST (+ エクスポート結果)
 *  - textToSb3(src, store)   : テキスト → .sb3 バイト列
 *  - sb3ToText(bytes)        : .sb3 バイト列 → テキスト + アセットストア + notes
 *  - roundTripSb3(bytes)     : .sb3 → テキスト → .sb3 (テスト用)
 */

import { Program, Diagnostic } from './lang/ast';
import { parse, parseCollect } from './lang/parser';
import { check, CheckResult } from './lang/typechecker';
import { printProgram } from './lang/printer';
import { exportProgram, ExportResult, ExportError, AssetStore, emptyAssetStore } from './sb3/exporter';
import { importProject, ImportResult } from './sb3/importer';
import { loadSb3, saveSb3, Sb3ParseError } from './sb3/zip';
import { validateProject, ValidationIssue } from './sb3/validate';
import { SB3Project } from './sb3/model';

export type { Program, Diagnostic, CheckResult, AssetStore, ExportResult as _ER, SB3Project, ValidationIssue };
export { ExportError, Sb3ParseError, emptyAssetStore };

export interface TextAnalysis {
  program: Program | null;
  diagnostics: Diagnostic[];
  checkResult: CheckResult | null;
  /** 型エラーがなければ生成された project.json(プレビュー用) */
  project: SB3Project | null;
  exportDiagnostics: Diagnostic[];
  validation: ValidationIssue[];
  /** 統計 */
  stats: {
    sprites: number;
    scripts: number;
    vars: number;
    lists: number;
    defs: number;
    blocks: number;
  };
}

/** テキストを解析 → 診断 + (可能なら) project.json 生成 */
export function analyzeText(src: string): TextAnalysis {
  const { program, diagnostics } = parseCollect(src);
  const result: TextAnalysis = {
    program, diagnostics, checkResult: null,
    project: null, exportDiagnostics: [], validation: [],
    stats: { sprites: 0, scripts: 0, vars: 0, lists: 0, defs: 0, blocks: 0 },
  };
  if (!program) return result;

  const cr = check(program);
  result.checkResult = cr;
  result.diagnostics = [...diagnostics, ...cr.diagnostics];

  // 統計
  result.stats.sprites = program.sprites.length;
  const countBody = (body: { decl?: string; type?: string }[]) => {
    for (const item of body) {
      if (item.decl === 'event') result.stats.scripts++;
      else if (item.decl === 'def') result.stats.defs++;
      else if (item.decl === 'var') result.stats.vars++;
      else if (item.decl === 'list') result.stats.lists++;
    }
  };
  if (program.stage) countBody(program.stage.body);
  program.sprites.forEach(s => countBody(s.body));

  if (cr.ok) {
    try {
      const exp = exportProgram(program, emptyAssetStore(), cr);
      result.project = exp.project;
      result.exportDiagnostics = exp.diagnostics;
      result.diagnostics = [...result.diagnostics, ...exp.diagnostics];
      result.validation = validateProject(exp.project);
      let blocks = 0;
      for (const t of exp.project.targets) blocks += Object.keys(t.blocks ?? {}).length;
      result.stats.blocks = blocks;
    } catch (e) {
      if (e instanceof ExportError) {
        result.exportDiagnostics = e.diagnostics;
        result.diagnostics = [...result.diagnostics, ...e.diagnostics];
      } else {
        result.diagnostics.push({ severity: 'error', message: `エクスポート中に内部エラー: ${(e as Error).message}`, code: 'internal' });
      }
    }
  }
  return result;
}

/** テキスト → .sb3 バイト列 */
export function textToSb3(src: string, store: AssetStore = emptyAssetStore()): { bytes: Uint8Array; project: SB3Project; assets: Map<string, Uint8Array>; diagnostics: Diagnostic[]; validation: ValidationIssue[] } {
  const program = parse(src);
  const cr = check(program);
  const errors = cr.diagnostics.filter(d => d.severity === 'error');
  if (errors.length) throw new ExportError(errors);
  const exp = exportProgram(program, store, cr);
  const validation = validateProject(exp.project, exp.assets);
  const hardErrors = validation.filter(v => v.severity === 'error');
  if (hardErrors.length) {
    throw new ExportError(hardErrors.map(v => ({ severity: 'error' as const, message: `[構造検証] ${v.path}: ${v.message}` })));
  }
  const bytes = saveSb3(exp.project, exp.assets);
  return { bytes, project: exp.project, assets: exp.assets, diagnostics: exp.diagnostics, validation };
}

export interface Sb3ImportResult {
  text: string;
  program: Program;
  assetStore: AssetStore;
  notes: string[];
  unsupportedOpcodes: Record<string, number>;
  project: SB3Project;
}

/** .sb3 バイト列 → ScratchPy テキスト */
export function sb3ToText(bytes: Uint8Array): Sb3ImportResult {
  const { project, files } = loadSb3(bytes);
  const imp: ImportResult = importProject(project, files);
  const text = printProgram(imp.program);
  return {
    text,
    program: imp.program,
    assetStore: imp.assetStore,
    notes: imp.notes,
    unsupportedOpcodes: imp.unsupportedOpcodes,
    project,
  };
}

/** テキスト → 整形(canonical 化) */
export function formatText(src: string): { text: string; diagnostics: Diagnostic[] } {
  const { program, diagnostics } = parseCollect(src);
  if (!program || diagnostics.some(d => d.severity === 'error')) {
    return { text: src, diagnostics };
  }
  return { text: printProgram(program), diagnostics };
}

/** .sb3 → テキスト → .sb3 のラウンドトリップ(テスト用) */
export function roundTripSb3(bytes: Uint8Array): {
  text: string;
  bytes2: Uint8Array;
  project2: SB3Project;
  notes: string[];
  validation: ValidationIssue[];
} {
  const imp = sb3ToText(bytes);
  const out = textToSb3(imp.text, imp.assetStore);
  return { text: imp.text, bytes2: out.bytes, project2: out.project, notes: imp.notes, validation: out.validation };
}

/** テキスト → sb3 → テキスト のラウンドトリップ(テスト用) */
export function roundTripText(src: string): { text1: string; text2: string; notes: string[] } {
  const out = textToSb3(src);
  const imp = sb3ToText(out.bytes);
  return { text1: src, text2: imp.text, notes: imp.notes };
}

export { parse, parseCollect, check, printProgram, exportProgram, importProject, loadSb3, saveSb3, validateProject };
