import { useEffect, useRef, useState } from 'react';
import { EN, t } from '../app/i18n';
import { DEFAULT_MODELS, describeProviderError, type Provider, type Turn } from '../app/ai/agent';
import { IconWand, IconArrowRight } from '../app/components/Icons';
import { askEducationAssistant } from './educationAssistant';
import './education-assistant.css';

type Message={role:'user'|'assistant'|'error'; content:string};
interface Props { code:string; diagnostics:string[]; blockDirty:boolean; lessonTitle:string; goal:string; phase:'learn'|'practice'|'free' }
export default function EducationAssistant({code,diagnostics,blockDirty,lessonTitle,goal,phase}:Props) {
  const [provider,setProvider]=useState<Provider>('gemini');
  const [model,setModel]=useState(DEFAULT_MODELS.gemini);
  const [key,setKey]=useState('');
  const [consent,setConsent]=useState(false);
  const [connected,setConnected]=useState(false);
  const [shareCode,setShareCode]=useState(false);
  const [question,setQuestion]=useState('');
  const [messages,setMessages]=useState<Message[]>([]);
  const [history,setHistory]=useState<Turn[]>([]);
  const [running,setRunning]=useState(false);
  const [progress,setProgress]=useState('');
  const abortRef=useRef<AbortController|null>(null);
  const logRef=useRef<HTMLDivElement>(null);
  const secure=typeof window==='undefined'||window.isSecureContext;
  useEffect(()=>()=>{abortRef.current?.abort();},[]);
  useEffect(()=>{if(logRef.current) logRef.current.scrollTop=logRef.current.scrollHeight;},[messages,running]);
  const reset=()=>{abortRef.current?.abort();setConnected(false);setKey('');setConsent(false);setMessages([]);setHistory([]);setQuestion('');setShareCode(false);};
  const send=async()=>{
    const q=question.trim(), activeKey=key.trim();
    if(!connected||!consent||!secure||!activeKey||!q||running||(shareCode&&blockDirty))return;
    if(q.includes(activeKey) || (shareCode&&(code.includes(activeKey)||diagnostics.some(d=>d.includes(activeKey))))){setMessages(m=>[...m,{role:'error',content:t('APIキーを質問やコードから消してね。','Remove the API key from your question or code.')}]);return;}
    const controller=new AbortController();abortRef.current=controller;setRunning(true);setProgress(t('考え中…','Thinking…'));setQuestion('');setMessages(m=>[...m,{role:'user',content:q}]);
    try{
      const reply=await askEducationAssistant({provider,key:activeKey,model,question:q,language:EN?'en':'ja',lessonTitle,goal,phase,shareCode,code,diagnostics,history,signal:controller.signal,onRetry:info=>setProgress(t(`Geminiが混雑中。約${Math.ceil(info.waitMs/1000)}秒後に再試行（${info.retry}/2）…`,`Gemini is busy. Retrying in about ${Math.ceil(info.waitMs/1000)}s (${info.retry}/2)…`))});
      if(controller.signal.aborted)return;
      setMessages(m=>[...m,{role:'assistant',content:reply}]);setHistory(h=>[...h,{role:'user' as const,content:q},{role:'assistant' as const,content:reply}].slice(-6));
    }catch(e){setQuestion(q);if(controller.signal.aborted){setMessages(m=>[...m,{role:'error',content:t('送信を中止したよ。','Request stopped.')}]);}else{const msg=describeProviderError(e,EN?'en':'ja').split(activeKey).join('[redacted]');setMessages(m=>[...m,{role:'error',content:t(`接続できなかったよ：${msg}`,`Could not connect: ${msg}`)}]);}}
    finally{if(abortRef.current===controller)abortRef.current=null;setRunning(false);setProgress('');}
  };
  return <section className="edu-ai" aria-label={t('AI学習サポート','AI learning support')}>
    <div className="edu-ai-head"><span><IconWand size={20}/></span><div><strong>{t('AI学習サポート','AI learning support')}</strong><small>{t('わからないことを聞いてみよう','Ask when you need a hand')}</small></div><i>{connected?t('準備OK','READY'):'AI'}</i></div>
    {!connected ? <div className="edu-ai-setup">
      <p>{t('保護者・先生と一緒に設定してね。質問に合わせてヒントをくれるよ。','Set this up with a parent or teacher. Ask for a hint whenever you need one.')}</p>
      <label>{t('AIサービス','AI service')}<select value={provider} onChange={e=>{const p=e.target.value as Provider;setProvider(p);setModel(DEFAULT_MODELS[p]);setKey('');setConsent(false);}}><option value="gemini">Google Gemini</option><option value="openai">OpenAI</option><option value="anthropic">Anthropic Claude</option></select></label>
      <label>{t('モデルID','Model ID')}<input value={model} onChange={e=>setModel(e.target.value)} spellCheck={false}/></label>
      <label>{t('APIキー','API key')}<input type="password" autoComplete="off" value={key} onChange={e=>setKey(e.target.value)} placeholder={t('保護者・先生が入力','Ask an adult to enter it')}/></label>
      <div className="edu-ai-privacy">{t('会話、レッスン情報、言語仕様は選んだAI事業者に送信され、料金がかかる場合があります。コードは自分で許可したときだけ送ります。名前・住所などの個人情報は入力しないでね。AIの答えはまちがうことがあります。Geminiの混雑時には自動で再送するため、追加の通信・料金が発生する場合があります。','Chat, lesson details and language reference are sent to the selected provider; charges may apply. Code is sent only if you opt in. Do not enter personal details. AI answers can be wrong. Gemini overload retries may cause additional requests or charges.')}</div>
      <div className="edu-ai-privacy">{t('キーは保存せず、この画面のメモリーだけで使用。端末や拡張機能から見える可能性があります。サービスの年齢条件と保護者の同意を確認してね。','The key stays in page memory, but may be visible to the device or extensions. Check the provider’s age rules and obtain parental consent where required.')}</div>
      <label className="edu-ai-check"><input type="checkbox" checked={consent} onChange={e=>setConsent(e.target.checked)}/><span>{t('送信・料金・年齢条件を保護者または先生と確認しました','I reviewed data sharing, costs and age rules with a parent or teacher')}</span></label>
      {!secure&&<p role="alert">{t('安全な接続（HTTPSまたはlocalhost）で開いてね。','Open this page over HTTPS or localhost.')}</p>}
      <button className="edu-ai-start" disabled={!key.trim()||!model.trim()||!consent||!secure} onClick={()=>setConnected(true)}>{t('チャットをはじめる','Start chat')} <IconArrowRight size={15}/></button>
    </div> : <>
      <div className="edu-ai-connected"><span>{provider==='gemini'?'Gemini':provider==='openai'?'OpenAI':'Claude'}</span><button disabled={running} onClick={reset}>{t('設定を変更・キーを消去','Change settings / clear key')}</button></div>
      <div className="edu-ai-log" ref={logRef} role="log" aria-live="polite" aria-label={t('AIとのチャット','AI chat')}>
        {!messages.length&&<div className="edu-ai-welcome">{t('こんにちは！ わからないことを聞いてね。答えをうのみにせず、先生や保護者にも相談しよう。','Hello! Ask me for a hint. Check my answers and ask a parent or teacher too.')}</div>}
        {messages.map((m,i)=><div key={i} className={`edu-ai-msg ${m.role}`}><b>{m.role==='user'?t('あなた','You'):m.role==='error'?t('お知らせ','Notice'):'AI'}</b><div>{m.content}</div></div>)}
        {running&&<div className="edu-ai-wait" role="status">{progress} <button onClick={()=>abortRef.current?.abort()}>{t('中止','Stop')}</button></div>}
      </div>
      <label className="edu-ai-check edu-ai-share"><input type="checkbox" checked={shareCode} disabled={running} onChange={e=>{setShareCode(e.target.checked);setHistory([]);}}/><span>{t('今のコードとエラーも送る','Also send current code and errors')}</span></label>
      {shareCode&&blockDirty&&<p className="edu-ai-warning" role="status">{t('ブロックの変更を先に「コードに反映」してね。','Apply your block changes to the code first.')}</p>}
      <label className="edu-ai-input"><span>{t('質問','Your question')}</span><textarea value={question} onChange={e=>setQuestion(e.target.value)} maxLength={4000} rows={3} disabled={running} placeholder={t('例：くりかえしって何？','Example: What is a loop?')}/></label>
      <div className="edu-ai-actions"><button disabled={running||!messages.length} onClick={()=>{setMessages([]);setHistory([]);}}>{t('会話を消す','Clear chat')}</button><button className="edu-ai-send" disabled={running||!question.trim()||(shareCode&&blockDirty)} onClick={send}>{t('送信','Send')} <IconArrowRight size={14}/></button></div>
      <p className="edu-ai-foot">{t('AIは作品を変更しません。コード送信設定を変えると、AIに渡す会話履歴はリセットされます。','AI cannot edit your project. Changing code sharing resets the history sent to AI.')}</p>
    </>}
  </section>;
}
