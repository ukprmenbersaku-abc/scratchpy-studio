import { describe, it, expect } from 'vitest';
import * as Blockly from 'blockly';
import { registerScratchPyBlocks } from '../app/blockly/defs';
import { astToWorkspace, workspaceToAst } from '../app/blockly/bridge';
import { analyzeText } from '../core/api';
import { printProgram } from '../core/lang/printer';
import { SAMPLES } from '../core/samples';
registerScratchPyBlocks();
describe('Blockly 変換', () => {
 for (const sample of SAMPLES) it(sample.title, () => {
   const a = analyzeText(sample.code);
   expect(a.program).not.toBeNull();
   const ws = new Blockly.Workspace();
   astToWorkspace(ws, a.program!, a.checkResult?.resolutions);
   const out = printProgram(workspaceToAst(ws));
   const next = analyzeText(out);
   expect(next.diagnostics.filter(d => d.severity === 'error').map(d => d.message)).toEqual([]);
   expect(out).toBe(printProgram(a.program!));
   ws.dispose();
 });
});

describe('Blockly 安全性', () => {
 it('変数値を編集した結果がコードに反映される', () => {
  const a = analyzeText(SAMPLES[0].code); const ws = new Blockly.Workspace();
  astToWorkspace(ws, a.program!, a.checkResult?.resolutions);
  const direction = ws.getAllBlocks(false).find(b => b.type === 'sp_config' && b.getFieldValue('KEY') === 'direction')!;
  direction.getInputTargetBlock('VALUE')!.setFieldValue('25', 'NUM');
  expect(printProgram(workspaceToAst(ws))).toContain('direction: 25');
  ws.dispose();
 });
 it('ターゲット直下の不正な文は黙って消さずエラーにする', () => {
  const ws = new Blockly.Workspace(); const sprite = ws.newBlock('sp_sprite');
  const stmt = ws.newBlock('sp_assign'); sprite.getInput('BODY')!.connection!.connect(stmt.previousConnection!);
  expect(() => workspaceToAst(ws)).toThrow('直下には置けません'); ws.dispose();
 });
});
