import { describe, it, expect, vi } from 'vitest';
import { askEducationAssistant, EDUCATION_PROMPT, type EducationRequest } from '../education/educationAssistant';
import type { Provider } from '../app/ai/agent';

const base:EducationRequest={provider:'openai',key:'private-key-unique',model:'example-model',question:'Explain loops',language:'en',lessonTitle:'Loops',goal:'Repeat four times',phase:'practice',shareCode:false,code:'UNIQUE_PROJECT_CONTENT_873',diagnostics:['UNIQUE_DIAGNOSTIC_873'],history:[],signal:new AbortController().signal};
function mockProvider(provider:Provider,text='Try thinking about the repeat count.') {
  const json=provider==='openai'?{status:'completed',output:[{content:[{type:'output_text',text}]}]}:provider==='gemini'?{candidates:[{finishReason:'STOP',content:{parts:[{text}]}}]}:{content:[{type:'text',text}],stop_reason:'end_turn'};
  return vi.fn(async()=>new Response(JSON.stringify(json),{status:200})) as unknown as typeof fetch;
}
describe('Education AI learning support',()=>{
 for(const provider of ['openai','gemini','anthropic'] as const) it(`${provider}: uses tutor instructions, not Studio project-agent instructions`,async()=>{
  const fetcher=mockProvider(provider);const result=await askEducationAssistant({...base,provider,fetcher});expect(result).toContain('repeat count');const request=(fetcher as any).mock.calls[0][1];const payload=JSON.stringify(JSON.parse(request.body));
  expect(payload).toContain('friendly ScratchPy learning guide');expect(payload).toContain('rather than giving a complete solution');expect(payload).toContain('ScratchPy 言語仕様書');expect(payload).toContain('Repeat four times');expect(payload).not.toContain('UNIQUE_PROJECT_CONTENT_873');expect(payload).not.toContain('UNIQUE_DIAGNOSTIC_873');expect(payload).not.toContain(base.key);
 });
 it('sends code and diagnostics only after opt-in',async()=>{const fetcher=mockProvider('openai');await askEducationAssistant({...base,shareCode:true,fetcher});const body=(fetcher as any).mock.calls[0][1].body;expect(body).toContain(base.code);expect(body).toContain(base.diagnostics[0]);});
 it('blocks a key pasted into messages, shared code or diagnostics before making a request',async()=>{const fetcher=mockProvider('openai');for(const change of [{question:base.key},{shareCode:true,code:base.key},{shareCode:true,diagnostics:[base.key]}])await expect(askEducationAssistant({...base,...change,fetcher})).rejects.toThrow('API key');expect(fetcher).not.toHaveBeenCalled();});
 it('drops unsafe previous exchanges and sends only bounded recent pairs',async()=>{const fetcher=mockProvider('openai');const history=[{role:'user' as const,content:'old '+base.key},{role:'assistant' as const,content:'response'},{role:'user' as const,content:'question2'},{role:'assistant' as const,content:'answer2'}];await askEducationAssistant({...base,history,fetcher});const body=(fetcher as any).mock.calls[0][1].body;expect(body).not.toContain(base.key);expect(body).toContain('question2');});
 it('redacts echoed credentials',async()=>{expect(await askEducationAssistant({...base,fetcher:mockProvider('openai',`Oops ${base.key}`)})).toBe('Oops [redacted]');});
 it('enforces message and optional code limits',async()=>{const fetcher=mockProvider('openai');await expect(askEducationAssistant({...base,question:'a'.repeat(4001),fetcher})).rejects.toThrow('too long');await expect(askEducationAssistant({...base,shareCode:true,code:'a'.repeat(40001),fetcher})).rejects.toThrow('too long');expect(fetcher).not.toHaveBeenCalled();});
 it('gives child-safe guidance and warns it cannot modify code',()=>{expect(EDUCATION_PROMPT).toContain('trusted adult');expect(EDUCATION_PROMPT).toContain('cannot modify the project');expect(EDUCATION_PROMPT).toContain('not Python');});
});
