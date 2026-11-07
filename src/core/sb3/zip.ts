/**
 * .sb3 (ZIP) の読み書き — fflate 使用
 */

import { unzipSync, zipSync, strToU8, strFromU8 } from 'fflate';
import { SB3Project } from './model';

export interface Sb3Contents {
  project: SB3Project;
  /** ファイル名(md5ext) → バイナリ */
  files: Map<string, Uint8Array>;
  fileNames: string[];
}

export class Sb3ParseError extends Error {}

/** .sb3 バイト列 → project.json + アセット */
export function loadSb3(bytes: Uint8Array): Sb3Contents {
  let unzipped: Record<string, Uint8Array>;
  try {
    unzipped = unzipSync(bytes);
  } catch (e) {
    throw new Sb3ParseError('.sb3 ファイルの展開に失敗しました (ZIP 形式が壊れているか、.sb3 ファイルではありません)');
  }
  const names = Object.keys(unzipped);
  const projectJsonName = names.find(n => n === 'project.json')
    ?? names.find(n => n.endsWith('project.json'))
    ?? names.find(n => n.endsWith('.json'));
  if (!projectJsonName) {
    throw new Sb3ParseError('zip 内に project.json が見つかりません (.sb3 ファイルですか?)');
  }
  let project: SB3Project;
  try {
    project = JSON.parse(strFromU8(unzipped[projectJsonName]));
  } catch (e) {
    throw new Sb3ParseError('project.json の JSON 解析に失敗しました');
  }
  const files = new Map<string, Uint8Array>();
  for (const n of names) {
    if (n !== projectJsonName) files.set(n, unzipped[n]);
  }
  return { project, files, fileNames: names };
}

/** project.json + アセット → .sb3 バイト列 */
export function saveSb3(project: SB3Project, assets: Map<string, Uint8Array>): Uint8Array {
  const data: Record<string, Uint8Array> = {};
  data['project.json'] = strToU8(JSON.stringify(project));
  for (const [name, bytes] of assets) {
    data[name] = bytes;
  }
  return zipSync(data, { level: 6 });
}
