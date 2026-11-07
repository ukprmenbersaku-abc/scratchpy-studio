import {describe,it,expect} from 'vitest';
import {EN_LESSONS} from '../education/lessons';
import {analyzeText,textToSb3,sb3ToText} from '../core/api';
import * as Blockly from 'blockly';
import {registerScratchPyBlocks} from '../app/blockly/defs';
import {astToWorkspace,workspaceToAst} from '../app/blockly/bridge';
import {printProgram} from '../core/lang/printer';
const changes=[['Hello!','Hi!'],['move(10)','move(30)'],['repeat 2:','repeat 4:'],['score += 0','score += 1'],['score > 0','score > 5'],['jump(10)','jump(20)'],['            pass','            say("TRY")'],['score = score + 1','score = score + 5 * 2'],['move(10)','move(10)\n        turn_right(15)'],['score < 3','score < 5'],['items.add("apple")','items.add("apple")\n        items.add("banana")'],['if "apple" in items:','if "banana" in items:'],['score >= 10:', 'score >= 10 and lives > 0:'],['repeat 2:', 'repeat 3:']];
registerScratchPyBlocks();
describe('English Education missions',()=>{
 for(const [i,l] of EN_LESSONS.entries()) it(`${l.title}: valid, incomplete, solvable and round-trippable`,()=>{
  const start=analyzeText(l.starter);expect(start.diagnostics.filter(d=>d.severity==='error')).toEqual([]);expect(l.check(start.program!)).toBe(false);
  let text=l.starter.replace(...changes[i] as [string,string]); if(i===9 || i===13) text=text.replace('score += 1','score += 2');const answer=analyzeText(text);expect(answer.diagnostics.filter(d=>d.severity==='error')).toEqual([]);expect(l.check(answer.program!)).toBe(true);
  const ws=new Blockly.Workspace();astToWorkspace(ws,start.program!,start.checkResult?.resolutions);expect(printProgram(workspaceToAst(ws))).toBe(printProgram(start.program!));ws.dispose();
  expect(sb3ToText(textToSb3(text).bytes).program.sprites.length).toBeGreaterThan(0);
 });
});
