import { afterEach, describe, expect, it, vi } from 'vitest';
import { describeProviderError, ProviderHttpError, requestModel, runAgent, type RetryInfo } from '../app/ai/agent';
import { askEducationAssistant } from '../education/educationAssistant';
import { emptyAssetStore } from '../core/api';
const ok=()=>new Response(JSON.stringify({candidates:[{finishReason:'STOP',content:{parts:[{text:'Hello!'}]}}]}),{status:200});
const unavailable=(headers:Record<string,string>={})=>new Response(JSON.stringify({error:{message:'high demand: secret-key'}}),{status:503,headers});
const signal=()=>new AbortController().signal;
afterEach(()=>{vi.useRealTimers();vi.restoreAllMocks();});
describe('Gemini temporary service overload',()=>{
  it('retries a 503 with bounded exponential backoff, then succeeds with the same request',async()=>{
    vi.useFakeTimers();vi.spyOn(Math,'random').mockReturnValue(0);
    const f=vi.fn().mockResolvedValueOnce(unavailable()).mockResolvedValueOnce(unavailable()).mockResolvedValueOnce(ok());
    const retries:RetryInfo[]=[];
    const promise=requestModel('gemini','secret-key','gemini-test',[{role:'user',content:'hello'}],signal(),f,undefined,x=>retries.push(x));
    await vi.runAllTimersAsync();expect(await promise).toBe('Hello!');
    expect(retries.map(x=>x.waitMs)).toEqual([1000,2000]);expect(f).toHaveBeenCalledTimes(3);
    expect(f.mock.calls[0][1].body).toEqual(f.mock.calls[2][1].body);
  });
  it('stops after two retries, redacts keys, and provides actionable localized guidance',async()=>{
    vi.useFakeTimers();vi.spyOn(Math,'random').mockReturnValue(0);
    const f=vi.fn(async()=>unavailable());
    const promise=requestModel('gemini','secret-key','gemini-test',[],signal(),f);
    const outcome=promise.catch(e=>e);
    await vi.runAllTimersAsync();const error=await outcome;
    expect(f).toHaveBeenCalledTimes(3);expect(error).toBeInstanceOf(ProviderHttpError);
    expect(error.message).not.toContain('secret-key');expect(error.message).toContain('[redacted]');
    expect(describeProviderError(error,'ja')).toContain('混雑');expect(describeProviderError(error,'en')).toContain('another available model');
  });
  it('retries non-JSON 503 responses and stops without retrying 400, 429 or other providers',async()=>{
    vi.useFakeTimers();vi.spyOn(Math,'random').mockReturnValue(0);
    const f=vi.fn().mockResolvedValueOnce(new Response('oops',{status:503})).mockResolvedValueOnce(ok());
    const pending=requestModel('gemini','secret-key','model',[],signal(),f);await vi.runAllTimersAsync();expect(await pending).toBe('Hello!');
    for(const [provider,status] of [['gemini',400],['gemini',429],['openai',503]] as const){
      const fetcher=vi.fn(async()=>new Response('{}',{status}));
      await expect(requestModel(provider,'secret-key','model',[],signal(),fetcher)).rejects.toMatchObject({status});expect(fetcher).toHaveBeenCalledTimes(1);
    }
  });
  it('respects a short Retry-After, and stops instead of retrying sooner than a long one',async()=>{
    vi.useFakeTimers();vi.spyOn(Math,'random').mockReturnValue(0);
    const retry=vi.fn().mockResolvedValueOnce(unavailable({'retry-after':'5'})).mockResolvedValueOnce(ok());const reports:RetryInfo[]=[];
    const pending=requestModel('gemini','secret-key','model',[],signal(),retry,undefined,x=>reports.push(x));
    await vi.runAllTimersAsync();expect(await pending).toBe('Hello!');expect(reports[0].waitMs).toBe(5000);
    const long=vi.fn(async()=>unavailable({'retry-after':'120'}));await expect(requestModel('gemini','secret-key','model',[],signal(),long)).rejects.toMatchObject({status:503});expect(long).toHaveBeenCalledTimes(1);
  });
  it('cancels during retry waiting without another request',async()=>{
    vi.useFakeTimers();const abort=new AbortController();const f=vi.fn(async()=>unavailable());
    const pending=requestModel('gemini','secret-key','model',[],abort.signal,f,undefined,()=>abort.abort());
    await expect(pending).rejects.toMatchObject({name:'AbortError'});expect(f).toHaveBeenCalledTimes(1);expect(vi.getTimerCount()).toBe(0);
  });
  it('reports retries through the Studio agent',async()=>{
    vi.useFakeTimers();vi.spyOn(Math,'random').mockReturnValue(0);const f=vi.fn().mockResolvedValueOnce(unavailable()).mockResolvedValueOnce(ok());const events:string[]=[];
    const pending=runAgent({provider:'gemini',key:'secret-key',model:'model',prompt:'hello',source:'stage:\n    pass\n',assets:emptyAssetStore(),history:[],signal:signal(),fetcher:f,onEvent:e=>events.push(e.kind)});
    await vi.runAllTimersAsync();expect((await pending).reply).toBe('Hello!');expect(events).toEqual(['request','retry']);
  });
  it('reports retries through Education without sending unshared code',async()=>{
    vi.useFakeTimers();vi.spyOn(Math,'random').mockReturnValue(0);const f=vi.fn().mockResolvedValueOnce(unavailable()).mockResolvedValueOnce(ok());const retries:RetryInfo[]=[];
    const pending=askEducationAssistant({provider:'gemini',key:'secret-key',model:'model',question:'help',language:'en',lessonTitle:'First',goal:'Say',phase:'practice',shareCode:false,code:'private-code',diagnostics:[],history:[],signal:signal(),fetcher:f,onRetry:x=>retries.push(x)});
    await vi.runAllTimersAsync();expect(await pending).toBe('Hello!');expect(retries).toHaveLength(1);expect(f.mock.calls[1][1].body).not.toContain('private-code');
  });
});
