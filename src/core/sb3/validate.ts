/**
 * project.json 構造バリデータ
 * -----------------------------
 * エクスポート結果(または読み込んだ .sb3)が Scratch の期待する
 * 不変条件を満たしているかを検証する。テストと UI の両方から使う。
 */

import { SB3Project, SB3Target, SB3Block, HAT_OPCODES, isReporterOpcode } from './model';
import { md5Bytes } from './md5';

export interface ValidationIssue {
  severity: 'error' | 'warning';
  path: string;
  message: string;
}

export function validateProject(project: SB3Project, assets?: Map<string, Uint8Array>): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  const err = (path: string, message: string) => issues.push({ severity: 'error', path, message });
  const warn = (path: string, message: string) => issues.push({ severity: 'warning', path, message });

  if (!project || typeof project !== 'object') { err('$', 'プロジェクトがオブジェクトではありません'); return issues; }
  if (!Array.isArray(project.targets) || project.targets.length === 0) {
    err('$.targets', 'targets が空です'); return issues;
  }
  const stages = project.targets.filter(t => t.isStage);
  if (stages.length !== 1) err('$.targets', `ステージはちょうど1つ必要です (実際: ${stages.length})`);
  if (project.targets[0]?.isStage !== true) warn('$.targets[0]', '最初のターゲットはステージであるべきです');

  const targetNames = new Set<string>();
  project.targets.forEach((t, ti) => {
    const tp = `$.targets[${ti}]`;
    if (targetNames.has(t.name)) err(`${tp}.name`, `ターゲット名「${t.name}」が重複しています`);
    targetNames.add(t.name);
    if (!t.name) err(`${tp}.name`, 'ターゲット名が空です');
    validateTarget(t, tp, issues, project, assets);
  });

  // モニター
  for (const [mi, m] of (project.monitors ?? []).entries()) {
    if (!m.id) err(`$.monitors[${mi}]`, 'モニターに id がありません');
    if (!['default', 'large', 'slider', 'list'].includes(m.mode)) {
      err(`$.monitors[${mi}].mode`, `不明なモニターモード: ${m.mode}`);
    }
  }
  return issues;
}

function validateTarget(
  t: SB3Target, tp: string, issues: ValidationIssue[],
  project: SB3Project, assets?: Map<string, Uint8Array>,
): void {
  const err = (path: string, message: string) => issues.push({ severity: 'error', path, message });
  const warn = (path: string, message: string) => issues.push({ severity: 'warning', path, message });

  // コスチューム/サウンド
  if (!Array.isArray(t.costumes) || t.costumes.length === 0) err(`${tp}.costumes`, 'コスチュームが1つもありません');
  if (t.currentCostume < 0 || t.currentCostume >= (t.costumes?.length ?? 0)) {
    err(`${tp}.currentCostume`, `currentCostume=${t.currentCostume} が範囲外です`);
  }
  for (const [ci, c] of (t.costumes ?? []).entries()) {
    const cp = `${tp}.costumes[${ci}]`;
    if (!c.assetId || !c.md5ext) err(cp, 'assetId/md5ext がありません');
    if (c.assetId && c.md5ext && !c.md5ext.startsWith(c.assetId)) {
      err(`${cp}.md5ext`, 'md5ext が assetId と一致しません');
    }
    if (assets && c.md5ext) {
      const bytes = assets.get(c.md5ext);
      if (!bytes) err(`${cp}.md5ext`, `アセットファイル ${c.md5ext} が zip に含まれていません`);
      else {
        const md5 = md5Bytes(bytes);
        if (md5 !== c.assetId) err(`${cp}.assetId`, `アセットの MD5 が一致しません (期待: ${c.assetId}, 実際: ${md5})`);
      }
    }
  }
  for (const [si, s] of (t.sounds ?? []).entries()) {
    const sp = `${tp}.sounds[${si}]`;
    if (assets && s.md5ext && !assets.has(s.md5ext)) err(sp, `アセットファイル ${s.md5ext} が zip に含まれていません`);
  }

  // ブロックグラフ
  const blocks = t.blocks ?? {};
  const ids = new Set(Object.keys(blocks));
  for (const [id, b] of Object.entries(blocks)) {
    const bp = `${tp}.blocks.${id}`;
    if (!b.opcode) { err(bp, 'opcode がありません'); continue; }
    // next/parent の実在
    if (b.next !== null && b.next !== undefined && !ids.has(b.next)) {
      err(`${bp}.next`, `next=${b.next} が存在しないブロックを指しています`);
    }
    if (b.parent !== null && b.parent !== undefined && !ids.has(b.parent)) {
      err(`${bp}.parent`, `parent=${b.parent} が存在しません`);
    }
    // next の親は自分
    if (b.next && blocks[b.next] && blocks[b.next].parent !== id) {
      err(`${bp}.next`, `next ブロックの parent が ${id} になっていません (実際: ${blocks[b.next].parent})`);
    }
    // topLevel 整合
    if (b.topLevel && b.parent) err(bp, 'topLevel なのに parent があります');
    if (!b.topLevel && !b.parent && !b.shadow) warn(bp, 'topLevel=false なのに parent がありません');
    if (b.topLevel && (b.x === undefined || b.y === undefined)) warn(bp, 'topLevel ブロックに x/y がありません');
    // shadow ブロックは topLevel になれない
    if (b.shadow && b.topLevel) err(bp, 'shadow ブロックが topLevel です');

    // inputs の参照
    for (const [iname, input] of Object.entries(b.inputs ?? {})) {
      const ip = `${bp}.inputs.${iname}`;
      if (!Array.isArray(input)) { err(ip, 'input が配列ではありません'); continue; }
      const mode = input[0];
      if (![1, 2, 3].includes(mode)) { err(ip, `input モードが不正: ${mode}`); continue; }
      checkInputValue(input[1], ip, ids, blocks, err);
      if (mode === 3) {
        checkInputValue((input as unknown[])[2], `${ip}(shadow)`, ids, blocks, err);
      }
      if (mode === 2 && input[1] && typeof input[1] === 'string' && blocks[input[1] as string]) {
        if (blocks[input[1] as string].parent !== id) {
          err(ip, `サブスタック先頭ブロックの parent が ${id} ではありません`);
        }
      }
      if (typeof input[1] === 'string' && blocks[input[1]] && mode !== 2) {
        // shadow/実ブロック参照 → parent はこのブロック
        if (!blocks[input[1]].parent) err(ip, `入力ブロック ${input[1]} の parent が設定されていません`);
      }
    }
    // 変数/リスト field の id 整合
    for (const [fname, f] of Object.entries(b.fields ?? {})) {
      if ((fname === 'VARIABLE') && f[1]) {
        if (!findVarInProject(project, String(f[1]))) {
          err(`${bp}.fields.${fname}`, `変数 id ${f[1]} (name=${f[0]}) がプロジェクト内に登録されていません`);
        }
      }
      if ((fname === 'LIST') && f[1]) {
        if (!findListInProject(project, String(f[1]))) {
          err(`${bp}.fields.${fname}`, `リスト id ${f[1]} がプロジェクト内に登録されていません`);
        }
      }
      if (fname === 'BROADCAST_OPTION' && f[1]) {
        if (!findBroadcastInProject(project, String(f[1]))) {
          err(`${bp}.fields.${fname}`, `ブロードキャスト id ${f[1]} が登録されていません`);
        }
      }
    }
    // mutation
    if (b.opcode === 'procedures_prototype' || b.opcode === 'procedures_call') {
      if (!b.mutation) err(bp, 'procedures に mutation がありません');
      else {
        if (typeof b.mutation.proccode !== 'string') err(`${bp}.mutation`, 'proccode がありません');
        if (typeof b.mutation.argumentids !== 'string') err(`${bp}.mutation`, 'argumentids がありません(文字列化JSON)');
      }
    }
    if (b.opcode === 'control_stop' && !b.mutation) warn(bp, 'control_stop に mutation(hasnext) がありません');
  }

  // ハットから到達できない非 shadow ブロックの検出(警告)
  const reachable = new Set<string>();
  const walk = (id: string | null | undefined) => {
    if (!id || reachable.has(id) || !blocks[id]) return;
    reachable.add(id);
    const b = blocks[id];
    walk(b.next);
    for (const input of Object.values(b.inputs ?? {})) {
      const v = input?.[1];
      if (typeof v === 'string') walk(v);
    }
  };
  for (const [id, b] of Object.entries(blocks)) {
    if (b.topLevel) walk(id);
  }
  for (const [id, b] of Object.entries(blocks)) {
    if (!reachable.has(id) && !b.shadow) {
      // shadow メニューは input 参照から到達しているはず
      warn(`${tp}.blocks.${id}`, `ブロック(${b.opcode})がどのスクリプトからも到達できません`);
    }
  }
}

function checkInputValue(
  v: unknown, path: string, ids: Set<string>, blocks: Record<string, SB3Block>,
  err: (p: string, m: string) => void,
): void {
  if (v === null || v === undefined) return; // obscured shadow なしは許容
  if (typeof v === 'string') {
    if (!ids.has(v)) err(path, `入力値が存在しないブロック id を指しています: ${v}`);
    return;
  }
  if (Array.isArray(v)) {
    const kind = v[0];
    if (![4, 5, 6, 7, 8, 9, 10, 11, 12, 13].includes(kind)) {
      err(path, `リテラルの種類が不正: ${kind}`);
      return;
    }
    if ([11, 12, 13].includes(kind) && v.length < 3) {
      err(path, `リテラル [${kind}] には name と id が必要です`);
    }
    return;
  }
  err(path, '入力値の型が不正です');
}

function findVarInProject(project: SB3Project, id: string): boolean {
  return project.targets.some(t => id in (t.variables ?? {}));
}
function findListInProject(project: SB3Project, id: string): boolean {
  return project.targets.some(t => id in (t.lists ?? {}));
}
function findBroadcastInProject(project: SB3Project, id: string): boolean {
  return project.targets.some(t => id in (t.broadcasts ?? {}));
}
