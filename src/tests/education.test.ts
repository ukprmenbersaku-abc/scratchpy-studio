import { describe, it, expect } from 'vitest';
import { LESSONS, checkLesson } from '../education/lessons';
import { analyzeText, textToSb3, sb3ToText } from '../core/api';
import * as Blockly from 'blockly';
import { registerScratchPyBlocks } from '../app/blockly/defs';
import { astToWorkspace, workspaceToAst } from '../app/blockly/bridge';
import { printProgram } from '../core/lang/printer';

const answers = [
  (s:string)=>s.replace('こんにちは！','やあ！'),
  (s:string)=>s.replace('move(10)','move(30)'),
  (s:string)=>s.replace('repeat 2:', 'repeat 4:'),
  (s:string)=>s.replace('score += 0','score += 1'),
  (s:string)=>s.replace('score > 0','score > 5'),
  (s:string)=>s.replace('jump(10)','jump(20)'),
  (s:string)=>s.replace('            pass','            say("TRY")'),
  (s:string)=>s.replace('score = score + 1','score = score + 5 * 2'),
  (s:string)=>s.replace('move(10)','move(10)\n        turn_right(15)'),
  (s:string)=>s.replace('score < 3','score < 5').replace('score += 1','score += 2'),
  (s:string)=>s.replace('items.add("apple")','items.add("apple")\n        items.add("banana")'),
  (s:string)=>s.replace('if "apple" in items:','if "banana" in items:'),
  (s:string)=>s.replace('score >= 10:', 'score >= 10 and lives > 0:'),
  (s:string)=>s.replace('repeat 2:', 'repeat 3:').replace('score += 1','score += 2'),
];
registerScratchPyBlocks();
describe('Education レッスン', () => {
  for (const [i, lesson] of LESSONS.entries()) {
    it(`${lesson.title}: 課題、正解、Blockly往復と.sb3変換を検証`, () => {
      const start = analyzeText(lesson.starter);
      expect(start.diagnostics.filter(d=>d.severity==='error')).toEqual([]);
      expect(checkLesson(lesson, lesson.starter).ok).toBe(false);
      const answer = answers[i](lesson.starter);
      expect(checkLesson(lesson, answer)).toEqual({ok:true,message:'ミッションクリア！ できたね！'});
      const ws = new Blockly.Workspace(); astToWorkspace(ws, start.program!, start.checkResult?.resolutions);
      expect(printProgram(workspaceToAst(ws))).toBe(printProgram(start.program!)); ws.dispose();
      const out = textToSb3(answer); expect(out.bytes.length).toBeGreaterThan(100);
      expect(sb3ToText(out.bytes).program.sprites.length).toBeGreaterThan(0);
    });
  }
  it('コメントだけでは達成扱いにならない', () => {
    expect(checkLesson(LESSONS[1], LESSONS[1].starter + '\n# move(30)\n').ok).toBe(false);
  });
  it('構文エラーをクリアとして扱わない', () => {
    expect(checkLesson(LESSONS[0], 'sprite Cat:\n  say(').ok).toBe(false);
  });
});
