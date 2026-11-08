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

describe('クラウド変数の数値文字列', () => {
  it('実フィクスチャの100を数値型でインポートし、クラウドとして再エクスポートする', () => {
    const imported = sb3ToText(readSb3('cloud_variables_simple.sb3'));
    expect(imported.text).toMatch(/var firstCloud: int = 100 @cloud/);
    expect(analyzeText(imported.text).diagnostics.filter(d => d.severity === 'error')).toEqual([]);
    const out = textToSb3(imported.text, imported.assetStore);
    const variables = Object.values(out.project.targets.find(t => t.isStage)!.variables);
    expect(variables).toContainEqual(['☁ firstCloud', '100', true]);
    const roundtrip = sb3ToText(out.bytes);
    expect(roundtrip.text).toMatch(/var firstCloud: int = 100 @cloud/);
  });
  it('小数と負数を適切な数値型で読み込む', () => {
    const orig = loadSb3(readSb3('cloud_variables_simple.sb3')).project;
    const stage = orig.targets.find(t=>t.isStage)!;
    stage.variables = { a:['☁ decimal','-2.5',true], b:['☁ integer','-30',true], c:['☁ fraction','1e-2',true] };
    const imp = importProject(orig); const text = printProgram(imp.program);
    expect(text).toContain('var decimal: float = -2.5 @cloud');
    expect(text).toContain('var integer: int = -30 @cloud');
    expect(text).toContain('var fraction: float = 0.01 @cloud');
    expect(analyzeText(text).diagnostics.filter(d=>d.severity==='error')).toEqual([]);
    expect(imp.notes.join('\n')).toContain('正規化');
  });
  it('非数値や安全な整数範囲外は黙って壊さず、警告と型エラーにする', () => {
    const orig = loadSb3(readSb3('cloud_variables_simple.sb3')).project;
    orig.targets.find(t=>t.isStage)!.variables = { a:['☁ invalid','not-a-number',true], b:['☁ huge','9007199254740993',true] };
    const imp = importProject(orig); const text = printProgram(imp.program);
    expect(text).toContain('9007199254740993'); expect(text).toContain('not-a-number');
    expect(imp.notes.join('\n')).toContain('安全に数値へ変換できません');
    expect(analyzeText(text).diagnostics.filter(d=>d.severity==='error').length).toBeGreaterThan(0);
  });
});

describe('追加した Scratch ブロックの相互変換', () => {
  const code=`stage:
    costume backdrop1
    on flag:
        switch_backdrop_and_wait("backdrop1")
        set_tempo(90)
        change_tempo(5)
        set_instrument(1)
        set_midi_instrument(2)
        play_note(60, 0.25)
        rest_beats(0.5)
        play_drum(1, 0.25)
        play_midi_drum(2, 0.5)
`;
  it('背景切替待ちと全8種の音楽命令をエクスポートし再インポートする', () => {
    const out=textToSb3(code); const blocks=countOpcodes(out.project);
    for (const opcode of ['looks_switchbackdroptoandwait','music_setTempo','music_changeTempo','music_setInstrument','music_midiSetInstrument','music_playNoteForBeats','music_restForBeats','music_playDrumForBeats','music_midiPlayDrumForBeats']) expect(blocks[opcode],opcode).toBe(1);
    expect(out.project.extensions).toContain('music');
    const imported=sb3ToText(out.bytes);
    expect(imported.unsupportedOpcodes).toEqual({});
    const out2=textToSb3(imported.text,imported.assetStore);
    expect(countOpcodes(out2.project)).toEqual(blocks);
  });
  it('Scratchの楽器・ドラムのメニューshadowを数値として取り込む', () => {
    const out=textToSb3(code);const stage=out.project.targets[0];
    const drum=Object.values(stage.blocks).find(b=>b.opcode==='music_playDrumForBeats')!;
    stage.blocks.musicMenu={opcode:'music_menu_DRUM',next:null,parent:Object.entries(stage.blocks).find(([,v])=>v===drum)![0],inputs:{},fields:{DRUM:['4',null]},shadow:true,topLevel:false};
    drum.inputs.DRUM=[1,'musicMenu'];
    const imported=importProject(out.project);const text=printProgram(imported.program);
    expect(text).toContain('play_drum(4, 0.25)');expect(imported.unsupportedOpcodes).toEqual({});
    expect(analyzeText(text).diagnostics.filter(d=>d.severity==='error')).toEqual([]);
  });
});

describe('フィクスチャ全件の出力可否', () => {
  for(const f of files) it(`${f}: 構文・型検査を通して .sb3 を生成`, () => {
    const imported=sb3ToText(readSb3(f));
    expect(analyzeText(imported.text).diagnostics.filter(d=>d.severity==='error'), imported.text).toEqual([]);
    const out=textToSb3(imported.text,imported.assetStore);
    expect(out.bytes.length).toBeGreaterThan(0);
  });
  it('レポータを接続した動的メニューは黙って誤変換せず警告する', () => {
    const out=textToSb3('stage:\n    on flag:\n        switch_backdrop("backdrop1")\n');
    const stage=out.project.targets[0];
    const [blockId, block]=Object.entries(stage.blocks).find(([,b])=>b.opcode==='looks_switchbackdropto')!;
    const shadow=block.inputs.BACKDROP[1] as string;
    stage.blocks.expr={opcode:'operator_join',next:null,parent:blockId,inputs:{STRING1:[1,[10,'backdrop']],STRING2:[1,[10,'1']]},fields:{},shadow:false,topLevel:false};
    block.inputs.BACKDROP=[3,'expr',shadow];
    const imported=importProject(out.project);expect(imported.notes.join('\n')).toContain('動的な値');
    expect(imported.unsupportedOpcodes['looks_switchbackdropto(動的メニュー:BACKDROP)']).toBe(1);
  });
});

describe('Scratch リストの項目番号', () => {
  it('item_number と len のリスト引数を型検査し、項目番号ブロックを往復する', () => {
    const code=`stage:
    list items: list[str] = ["apple", "banana"]
    var position: int = 0
    on flag:
        position = item_number(items, "banana")
        position += len(items)
`;
    const first=textToSb3(code);expect(countOpcodes(first.project).data_itemnumoflist).toBe(1);
    const imp=sb3ToText(first.bytes);expect(imp.text).toContain('item_number(items, "banana")');
    const second=textToSb3(imp.text,imp.assetStore);expect(countOpcodes(second.project).data_itemnumoflist).toBe(1);
    expect(analyzeText(imp.text).diagnostics.filter(d=>d.severity==='error')).toEqual([]);
  });
});
