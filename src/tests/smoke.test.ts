import { describe, it, expect } from 'vitest';
import { analyzeText, textToSb3, sb3ToText } from '../core/api';
import { SAMPLES } from '../core/samples';
import { validateProject } from '../core/sb3/validate';

describe('スモーク: サンプルプログラム', () => {
  for (const s of SAMPLES) {
    it(`${s.title} が型チェックを通過し、正しい project.json を生成する`, () => {
      const r = analyzeText(s.code);
      const errors = r.diagnostics.filter(d => d.severity === 'error');
      expect(errors, JSON.stringify(errors, null, 1)).toEqual([]);
      expect(r.project).toBeTruthy();
      const issues = validateProject(r.project!).filter(v => v.severity === 'error');
      expect(issues, JSON.stringify(issues, null, 1)).toEqual([]);
    });

    it(`${s.title} text→sb3→text→sb3→text が不動点に収束する`, () => {
      const out1 = textToSb3(s.code);
      const imp1 = sb3ToText(out1.bytes);
      // 変換結果も型エラーなしでパースできること
      const r1 = analyzeText(imp1.text);
      const errors1 = r1.diagnostics.filter(d => d.severity === 'error');
      expect(errors1, `再パース失敗:\n${imp1.text}\n${JSON.stringify(errors1, null, 1)}`).toEqual([]);
      // 2回目のラウンドトリップで完全に安定すること
      const out2 = textToSb3(imp1.text);
      const imp2 = sb3ToText(out2.bytes);
      if (imp1.text !== imp2.text) {
        // 差分を見やすく表示
        const a = imp1.text.split('\n');
        const b = imp2.text.split('\n');
        const diff: string[] = [];
        for (let i = 0; i < Math.max(a.length, b.length); i++) {
          if (a[i] !== b[i]) diff.push(`L${i + 1}:\n  1周目: ${a[i]}\n  2周目: ${b[i]}`);
        }
        expect(diff.join('\n')).toBe('(差分なし)');
      }
      expect(imp1.text).toBe(imp2.text);
    });
  }
});
