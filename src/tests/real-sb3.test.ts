/**
 * 実物の .sb3 ファイル (scratch-vm / TurboWarp 公式テストフィクスチャ) を使った
 * インポート・ラウンドトリップテスト
 */
import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadSb3, saveSb3 } from '../core/sb3/zip';
import { importProject } from '../core/sb3/importer';
import { printProgram } from '../core/lang/printer';
import { analyzeText, textToSb3, sb3ToText } from '../core/api';
import { validateProject } from '../core/sb3/validate';
import { md5Bytes } from '../core/sb3/md5';
import { SB3Project } from '../core/sb3/model';

const DATA = join(dirname(fileURLToPath(import.meta.url)), 'testdata');
const files = readdirSync(DATA).filter(f => f.endsWith('.sb3'));

function readSb3(name: string): Uint8Array {
  return new Uint8Array(readFileSync(join(DATA, name)));
}

function countOpcodes(project: SB3Project): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const t of project.targets) {
    for (const b of Object.values(t.blocks ?? {})) {
      if (b.shadow) continue;
      counts[b.opcode] = (counts[b.opcode] ?? 0) + 1;
    }
  }
  return counts;
}

describe('実 .sb3 ファイル: 基本読み込み', () => {
  for (const f of files) {
    it(`${f}: zip 展開 → project.json パース → アセット MD5 一致`, () => {
      const { project, files: assets } = loadSb3(readSb3(f));
      expect(project.targets.length).toBeGreaterThan(0);
      expect(project.targets[0].isStage).toBe(true);
      // 全コスチューム/サウンドのアセットが実在し MD5 が一致
      for (const t of project.targets) {
        for (const c of t.costumes ?? []) {
          const bytes = assets.get(c.md5ext);
          expect(bytes, `${c.md5ext} が見つからない`).toBeTruthy();
          if (bytes) expect(md5Bytes(bytes)).toBe(c.assetId);
        }
        for (const s of t.sounds ?? []) {
          const bytes = assets.get(s.md5ext);
          if (bytes) expect(md5Bytes(bytes)).toBe(s.assetId);
        }
      }
    });
  }
});

describe('実 .sb3 ファイル: インポート → テキスト化', () => {
  for (const f of files) {
    it(`${f}: ScratchPy テキストに変換でき、再パース可能`, () => {
      const bytes = readSb3(f);
      const { project, files: assets } = loadSb3(bytes);
      const imp = importProject(project, assets);
      const text = printProgram(imp.program);
      expect(text.length).toBeGreaterThan(0);
      // 生成されたテキストは構文エラーなくパースできること
      const analysis = analyzeText(text);
      const parseErrors = analysis.diagnostics.filter(d => d.code === 'parse' || d.code === 'lex');
      expect(parseErrors, `構文エラー:\n${text}`).toEqual([]);
    });
  }
});

describe('実 .sb3 ファイル: ラウンドトリップ (sb3→text→sb3)', () => {
  // 対応済み opcode のみが含まれるフィクスチャで厳密検証
  const strictFiles = ['default.sb3', 'edge-triggered-hat.sb3', 'tw-loop.sb3', 'draggable.sb3', 'comments.sb3'];
  for (const f of strictFiles) {
    it(`${f}: 変換後の project.json が構造的に妥当`, () => {
      const bytes = readSb3(f);
      const imp = sb3ToText(bytes);
      let out;
      try {
        out = textToSb3(imp.text, imp.assetStore);
      } catch (e) {
        throw new Error(`再エクスポート失敗: ${(e as Error).message}\n--- text ---\n${imp.text}`);
      }
      const issues = validateProject(out.project, out.assets).filter(v => v.severity === 'error');
      expect(issues, JSON.stringify(issues, null, 1)).toEqual([]);
    });
  }

  it('edge-triggered-hat.sb3: opcode が保存される (event_whengreaterthan + motion_movesteps)', () => {
    const bytes = readSb3('edge-triggered-hat.sb3');
    const imp = sb3ToText(bytes);
    const out = textToSb3(imp.text, imp.assetStore);
    const before = countOpcodes(imp.project);
    const after = countOpcodes(out.project);
    expect(after['event_whengreaterthan']).toBe(before['event_whengreaterthan']);
    expect(after['motion_movesteps']).toBe(before['motion_movesteps']);
  });

  it('tw-loop.sb3: プロシージャ定義が保存される', () => {
    const bytes = readSb3('tw-loop.sb3');
    const imp = sb3ToText(bytes);
    expect(imp.text).toContain('def ');
    const out = textToSb3(imp.text, imp.assetStore);
    const before = countOpcodes(imp.project);
    const after = countOpcodes(out.project);
    expect(after['procedures_definition']).toBe(before['procedures_definition']);
    // 元の procedures_call は未対応拡張 loopsAndThings_loop の中にあったため失われる(notes に記録)
    expect(imp.notes.join('\n')).toContain('loopsAndThings');
  });

  it('合成プログラム: def + 呼び出しが procedures_call として保存される', () => {
    const out = textToSb3(`sprite Cat:
    def jump(times: int, shout: bool):
        repeat times:
            change_y(10)
        if shout:
            say("jump!")

    on flag:
        jump(3, true)
        jump(1, false)
`);
    const after = countOpcodes(out.project);
    expect(after['procedures_definition']).toBe(1);
    expect(after['procedures_call']).toBe(2);
    // mutation の proccode と引数
    const proto = Object.values(out.project.targets[1].blocks).find(b => b.opcode === 'procedures_prototype')!;
    expect(proto.mutation!.proccode).toBe('jump %s %b');
    expect(JSON.parse(proto.mutation!.argumentnames as string)).toEqual(['times', 'shout']);
    const calls = Object.values(out.project.targets[1].blocks).filter(b => b.opcode === 'procedures_call');
    expect(calls.every(c => c.mutation!.proccode === 'jump %s %b')).toBe(true);
  });

  it('broadcast_special_chars.sb3: 特殊文字入りブロードキャスト名が保存される', () => {
    const bytes = readSb3('broadcast_special_chars.sb3');
    const imp = sb3ToText(bytes);
    // 元プロジェクトのブロードキャストブロックは孤立しているためコメント化されるが、名前は完全に残る
    expect(imp.text).toContain('< perfect');
    expect(imp.text).toContain('a&b');
    // 特殊文字入りブロードキャスト名の登録・エクスポートは合成プログラムで確認
    const out = textToSb3(`stage:
    on flag:
        broadcast("< perfect")
        broadcast("a&b")
`);
    const names = Object.values(out.project.targets[0].broadcasts);
    expect(names).toContain('< perfect');
    expect(names).toContain('a&b');
  });

  it('variable_characters.sb3: 特殊文字入り変数名が引用符形式で保存される', () => {
    const bytes = readSb3('variable_characters.sb3');
    const imp = sb3ToText(bytes);
    const out = textToSb3(imp.text, imp.assetStore);
    // 元の変数名がすべて復元される
    const beforeNames = new Set<string>();
    for (const t of imp.project.targets) {
      for (const [, v] of Object.entries(t.variables)) beforeNames.add(String(v[0]));
    }
    const afterNames = new Set<string>();
    for (const t of out.project.targets) {
      for (const [, v] of Object.entries(t.variables)) afterNames.add(String(v[0]));
    }
    for (const n of beforeNames) expect(afterNames, `${n} が失われた`).toContain(n);
  });

  it('monitors.sb3: 変数モニターの可視状態が @show として保存される', () => {
    const bytes = readSb3('monitors.sb3');
    const imp = sb3ToText(bytes);
    expect(imp.text).toMatch(/@show|@hide/);
    const out = textToSb3(imp.text, imp.assetStore);
    expect(out.project.monitors.length).toBeGreaterThan(0);
  });

  it('default.sb3: アセット(猫SVG/背景/Meow音)がバイト単位で保存される', () => {
    const bytes = readSb3('default.sb3');
    const { project, files: origAssets } = loadSb3(bytes);
    const imp = sb3ToText(bytes);
    const out = textToSb3(imp.text, imp.assetStore);
    // 元のコスチューム md5ext が新しい zip にも含まれる
    for (const t of project.targets) {
      for (const c of t.costumes) {
        expect(out.assets.has(c.md5ext), `${c.md5ext} が再エクスポートに含まれない`).toBe(true);
        const orig = origAssets.get(c.md5ext)!;
        expect(md5Bytes(out.assets.get(c.md5ext)!)).toBe(md5Bytes(orig));
      }
      for (const s of t.sounds) {
        expect(out.assets.has(s.md5ext), `${s.md5ext} が再エクスポートに含まれない`).toBe(true);
      }
    }
  });

  it('生成した .sb3 は再度読み込める (saveSb3 → loadSb3)', () => {
    const bytes = readSb3('default.sb3');
    const imp = sb3ToText(bytes);
    const out = textToSb3(imp.text, imp.assetStore);
    const reloaded = loadSb3(out.bytes);
    expect(reloaded.project.targets.length).toBe(out.project.targets.length);
    expect(reloaded.files.size).toBe(out.assets.size);
  });
});
