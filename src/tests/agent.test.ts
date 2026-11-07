import { describe,it,expect,vi } from 'vitest';
import {requestModel,runAgent,extractProject,SYSTEM_PROMPT,MAX_ATTEMPTS,inspectCandidate,type Provider} from '../app/ai/agent';
import {emptyAssetStore} from '../core/api';
const good='stage:\n    pass\n\nsprite Cat:\n    costume costume1\n    on flag:\n        say("Hello!")\n';
const bad='stage:\n    var score: int = "wrong"\n';
const fenced=(code:string)=>`Here is the project.\n\`\`\`scratchpy\n${code}\`\`\``;
const response=(provider:Provider,text:string)=>provider==='openai'?{status:'completed',output:[{type:'reasoning',content:[]},{type:'message',content:[{type:'output_text',text}]}]}:provider==='gemini'?{candidates:[{finishReason:'STOP',content:{parts:[{text}]}}]}:{content:[{type:'text',text}],stop_reason:'end_turn'};
const makeFetch=(provider:Provider,replies:string[])=>vi.fn(async()=>new Response(JSON.stringify(response(provider,replies.shift()!)),{status:200,headers:{'content-type':'application/json'}})) as unknown as typeof fetch;
const base={provider:'openai' as const,key:'secret-key-test',model:'gpt-4.1-mini',prompt:'Fix the code',source:bad,assets:emptyAssetStore(),history:[],signal:new AbortController().signal};

describe('AI provider adapters and repair loop',()=>{
  for(const provider of ['openai','gemini','anthropic'] as const){
    it(`${provider}: correct endpoint, credentials, context and system instruction`,async()=>{
      const f=makeFetch(provider,['Hello']);
      const out=await requestModel(provider,'secret-key-test','test-model',[{role:'user',content:'request'}],new AbortController().signal,f);
      expect(out).toBe('Hello');const [url,init]=(f as any).mock.calls[0];const data=JSON.parse(init.body);
      expect(url).toMatch(provider==='openai'?/api\.openai\.com\/v1\/responses/:provider==='gemini'?/generativelanguage\.googleapis\.com/:/api\.anthropic\.com\/v1\/messages/);
      expect(JSON.stringify(data)).toContain('ScratchPy');expect(JSON.stringify(data)).toContain('request');expect(JSON.stringify(data)).not.toContain('secret-key-test');
      if(provider==='openai'){expect(init.headers.Authorization).toBe('Bearer secret-key-test');expect(data.store).toBe(false);}
      if(provider==='gemini')expect(init.headers['x-goog-api-key']).toBe('secret-key-test');
      if(provider==='anthropic'){expect(init.headers['x-api-key']).toBe('secret-key-test');expect(init.headers['anthropic-dangerous-direct-browser-access']).toBe('true');}
    });
  }
  it('includes the real language reference and requires an explicit code block',()=>{
    expect(SYSTEM_PROMPT).toContain('ScratchPy 言語仕様書');expect(extractProject(fenced(good))).toBe(good);expect(extractProject('```python\nprint(1)\n```')).toBeNull();expect(extractProject(fenced(good)+'\n'+fenced(good))).toBeNull();
  });
  it('automatically feeds local diagnostics back and validates the repaired proposal',async()=>{
    const f=makeFetch('openai',[fenced(bad),fenced(good)]);const events:string[]=[];
    const result=await runAgent({...base,fetcher:f,onEvent:e=>events.push(e.kind)});
    expect(result.valid).toBe(true);expect(result.code).toBe(good);expect(result.attempts).toBe(2);expect(events).toEqual(['request','check','repair','request','check']);
    const call=(f as any).mock.calls[1][1];const payload=JSON.parse(call.body);expect(JSON.stringify(payload.input)).toContain('Diagnostics:');expect(JSON.stringify(payload.input)).toContain('score');expect(inspectCandidate(result.code!,emptyAssetStore()).errors).toEqual([]);
  });
  it('stops after the bounded retries and never marks an invalid proposal as valid',async()=>{
    const f=makeFetch('openai',Array(MAX_ATTEMPTS).fill(fenced(bad)));const result=await runAgent({...base,fetcher:f});
    expect(result.valid).toBe(false);expect(result.attempts).toBe(3);expect(result.diagnostics.length).toBeGreaterThan(0);expect((f as any).mock.calls.length).toBe(3);
  });
  it('retries incomplete code fences instead of treating them as an answer',async()=>{
    const f=makeFetch('openai',['```scratchpy\nstage:',fenced(good)]);const r=await runAgent({...base,fetcher:f});expect(r.valid).toBe(true);expect(r.attempts).toBe(2);
  });
  it('keeps a normal discussion as a response without creating a project',async()=>{
    const f=makeFetch('openai',['What should the game do?']);const r=await runAgent({...base,fetcher:f});expect(r.code).toBeNull();expect(r.valid).toBe(true);expect(r.attempts).toBe(1);
  });
  it('refuses to send a credential accidentally embedded in the project or prompt',async()=>{
    const f=makeFetch('openai',[]);await expect(runAgent({...base,prompt:'secret-key-test',fetcher:f})).rejects.toThrow('Remove the API key');expect(f).not.toHaveBeenCalled();
  });
  it('redacts credentials from provider errors and output',async()=>{
    const f=vi.fn(async()=>new Response(JSON.stringify({error:{message:'invalid secret-key-test'}}),{status:401})) as unknown as typeof fetch;
    await expect(requestModel('openai','secret-key-test','test-model',[],new AbortController().signal,f)).rejects.toThrow('invalid [redacted]');
    const output=await requestModel('openai','secret-key-test','test-model',[],new AbortController().signal,makeFetch('openai',['echo secret-key-test']));expect(output).toBe('echo [redacted]');
  });
  it('accepts long responses without accidental truncation',async()=>{
    const output='x'.repeat(1500);expect(await requestModel('openai','test-key','test-model',[],new AbortController().signal,makeFetch('openai',[output]))).toBe(output);
  });
  it('stops immediately when cancelled',async()=>{
    const abort=new AbortController();abort.abort();const f=makeFetch('openai',[]);await expect(runAgent({...base,signal:abort.signal,fetcher:f})).rejects.toMatchObject({name:'AbortError'});expect(f).not.toHaveBeenCalled();
  });
});
