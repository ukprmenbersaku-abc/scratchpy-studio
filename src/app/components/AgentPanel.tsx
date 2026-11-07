import { useEffect, useRef, useState } from 'react';
import { EN, t } from '../i18n';
import type { AssetStore } from '../../core/api';
import { DEFAULT_MODELS, runAgent, type AgentEvent, type AgentResult, type Provider, type Turn } from '../ai/agent';
import { IconWand, IconCheckCircle, IconAlertTriangle, IconArrowRight, IconCode, IconRefresh } from './Icons';
import './agent.css';

type ChatMessage = {role:'user'|'assistant'|'error'; content:string};
type Proposal = {result:AgentResult; base:string; assets:AssetStore};
interface Props { text:string; assets:AssetStore; blockDirty:boolean; onApply:(code:string, kind:'apply'|'undo')=>void }
const label=(event:AgentEvent)=>event.kind==='request'?t(`AIに問い合わせ中（${event.attempt}/3）…`,`Contacting AI (${event.attempt}/3)…`):event.kind==='check'?t(`構文・型・.sb3を検査中（${event.attempt}/3）…`,`Checking syntax, types and .sb3 (${event.attempt}/3)…`):t(`エラーをAIに返して再修正中（${event.attempt}/3）…`,`Sending errors back for repair (${event.attempt}/3)…`);

export default function AgentPanel({text,assets,blockDirty,onApply}:Props) {
  const [provider,setProvider]=useState<Provider>('gemini');
  const secureContext=typeof window==='undefined' || window.isSecureContext;
  const [key,setKey]=useState('');
  const [model,setModel]=useState(DEFAULT_MODELS.gemini);
  const [settings,setSettings]=useState(true);
  const [consent,setConsent]=useState(false);
  const [messages,setMessages]=useState<ChatMessage[]>([]);
  const [history,setHistory]=useState<Turn[]>([]);
  const [prompt,setPrompt]=useState('');
  const [running,setRunning]=useState(false);
  const [progress,setProgress]=useState('');
  const [proposal,setProposal]=useState<Proposal|null>(null);
  const [showCode,setShowCode]=useState(false);
  const [lastApplied,setLastApplied]=useState<{before:string;after:string;assets:AssetStore}|null>(null);
  const controller=useRef<AbortController|null>(null);
  const logRef=useRef<HTMLDivElement>(null);
  useEffect(()=>()=>{controller.current?.abort();},[]);
  useEffect(()=>{const el=logRef.current;if(el)el.scrollTop=el.scrollHeight;},[messages,progress,proposal]);
  const changeProvider=(value:Provider)=>{setProvider(value);setModel(DEFAULT_MODELS[value]);setKey('');setConsent(false);};
  const send=async()=>{
    const request=prompt.trim();
    if(!request || !key.trim() || !model.trim() || !consent || running || blockDirty || !secureContext)return;
    const savedKey=key.trim(); const base=text; const baseAssets=assets; const previous=history;
    // Do not display or transmit a key accidentally pasted into the request/project.
    if(request.includes(savedKey)||base.includes(savedKey)){setMessages(m=>[...m,{role:'error',content:t('APIキーがメッセージまたはコードに含まれています。取り除いてから送信してください。','Remove the API key from the message or code before sending.')}]);return;}
    const abort=new AbortController();controller.current=abort;setRunning(true);setProgress(t('準備中…','Preparing…'));setProposal(null);setShowCode(false);setPrompt('');setSettings(false);
    setMessages(m=>[...m,{role:'user',content:request}]);
    try{
      const result=await runAgent({provider,key:savedKey,model,prompt:request,source:base,assets:baseAssets,history:previous,signal:abort.signal,onEvent:e=>setProgress(label(e))});
      setMessages(m=>[...m,{role:'assistant',content:result.reply}]);
      setHistory(h=>[...h,{role:'user' as const,content:request},{role:'assistant' as const,content:result.reply}].slice(-8));
      if(result.code || !result.valid)setProposal({result,base,assets:baseAssets});
    }catch(e){const canceled=(e as Error).name==='AbortError'; const message=canceled?t('処理を中止しました。','Stopped.'):t(`接続または生成に失敗しました：${(e as Error).message}`,`Connection or generation failed: ${(e as Error).message}`);setMessages(m=>[...m,{role:'error',content:message.split(savedKey).join('[redacted]')}]);}
    finally{if(controller.current===abort)controller.current=null;setRunning(false);setProgress('');}
  };
  const clear=()=>{if(messages.length && !window.confirm(t('チャットと提案を消去しますか？エディターのコードは残ります。','Clear the chat and proposal? The editor code will stay.')))return;setMessages([]);setHistory([]);setProposal(null);setShowCode(false);};
  const canApply=!!proposal?.result.valid && !!proposal.result.code && proposal.base===text && proposal.assets===assets && !blockDirty && !running;
  return <div className="ai-panel">
    <div className="ai-titlebar"><div className="ai-title-icon"><IconWand size={18}/></div><div><strong>{t('AI プロジェクトアシスタント','AI Project Assistant')}</strong><span>{t('相談・作成・エラー修正','Discuss, build, and repair')}</span></div><button onClick={()=>setSettings(v=>!v)} aria-expanded={settings} className="ai-settings-toggle">{settings?t('設定を閉じる','Hide settings'):t('API設定','API settings')}</button></div>
    {settings && <div className="ai-config">
      <div className="ai-fields"><label>{t('プロバイダー','Provider')}<select value={provider} disabled={running} onChange={e=>changeProvider(e.target.value as Provider)}><option value="gemini">Google Gemini</option><option value="openai">OpenAI</option><option value="anthropic">Anthropic Claude</option></select></label><label>{t('モデルID（変更可）','Model ID (editable)')}<input value={model} disabled={running} onChange={e=>setModel(e.target.value)} spellCheck={false}/></label><label>API key<input value={key} type="password" autoComplete="off" disabled={running} onChange={e=>setKey(e.target.value)} placeholder={t('APIキーを入力','Enter your API key')} aria-label={t('APIキー','API key')}/></label></div>
      <div className="ai-privacy"><IconAlertTriangle size={16}/><p>{t('キーはこのページのメモリーだけに保持し、保存しません。ブラウザから各社に直接送信するため、端末・ブラウザ拡張機能などにキーが見える可能性があります。信頼できるサイトだけで使い、共有端末を避け、利用制限を設定してください。','The key stays in this page’s memory and is not saved. Requests go directly from your browser; your device and browser extensions may expose the key. Use only a trusted site, avoid shared devices, and restrict your key’s permissions and spending.')}</p></div>
      <label className="ai-consent"><input type="checkbox" checked={consent} disabled={running} onChange={e=>setConsent(e.target.checked)}/><span>{t('コード・会話・診断が選択した事業者に送信され、API利用料が発生し得ることを理解しました。','I understand that code, chat and diagnostics are sent to the selected provider and API usage may be billed.')}</span></label>
      <p className="ai-config-note">{t('画像・音声ファイル自体は送信しません。Anthropicの組織設定によってはブラウザからの直接接続が拒否されます。','Image and audio files are not sent. Some Anthropic organizations block direct browser requests.')}</p>
    </div>}
    <div className="ai-log" ref={logRef} role="log" aria-label={t('AIとの会話','AI conversation')} aria-live="polite">
      {messages.length===0 && <div className="ai-welcome"><span><IconWand size={22}/></span><h3>{t('作りたいものを話してみよう','What would you like to make?')}</h3><p>{t('「矢印キーで動くゲームを作って」「今のエラーを直して」など。現在のコードと診断を読み、必要なら最大2回まで自動で修正を試みます。','Try “make an arrow-key game” or “fix the errors”. The assistant reads the current code and diagnostics, and can attempt up to two automatic repairs.')}</p><div className="ai-chip-row"><button onClick={()=>setPrompt(t('矢印キーでキャラクターが動くようにして','Make the sprite move with the arrow keys'))}>{t('矢印キーで動かす','Move with arrow keys')}</button><button onClick={()=>setPrompt(t('現在のコードのエラーを直して、変更点を説明して','Fix the current code errors and explain the changes'))}>{t('エラーを直す','Fix the errors')}</button></div></div>}
      {messages.map((m,i)=><div key={i} className={`ai-message ${m.role}`}><div className="ai-message-label">{m.role==='user'?t('あなた','You'):m.role==='error'?t('お知らせ','Notice'):'AI'}</div><div className="ai-message-content">{m.role==='assistant' ? m.content.replace(/```(?:scratchpy|spy)\s*\r?\n[\s\S]*?```/gi,t('[コードの提案は下のプレビューに表示]','[Code proposal is shown in the preview below]')) : m.content}</div></div>)}
      {running && <div className="ai-progress" role="status"><span className="ai-spinner"/>{progress} <button onClick={()=>controller.current?.abort()}>{t('中止','Stop')}</button></div>}
      {proposal && <div className={`ai-proposal ${proposal.result.valid?'valid':'invalid'}`}>
        <div className="ai-proposal-title">{proposal.result.valid?<IconCheckCircle size={18}/>:<IconAlertTriangle size={18}/>}<strong>{proposal.result.valid?t('検査済みの提案','Validated proposal'):t('修正できなかった提案','Proposal still has errors')}</strong><span>{proposal.result.attempts} {t('回の問い合わせ','request(s)')}</span></div>
        <p>{proposal.result.valid?t('構文・型・.sb3構造を検査しました。実行テストはしていません。確認後に適用してください。','Syntax, types and .sb3 structure checked. This was not run in Scratch. Review before applying.'):t('自動修正後もエラーが残ったため、適用はできません。追加の指示を送ってください。','Errors remain after automatic repairs, so this proposal cannot be applied. Send another instruction.')}</p>
        {proposal.result.diagnostics.length>0 && <ul className="ai-diagnostics">{proposal.result.diagnostics.map((d,i)=><li key={i}>{d}</li>)}</ul>}
        {proposal.result.warnings.length>0 && <details className="ai-warnings"><summary>{t('警告を見る','Show warnings')} ({proposal.result.warnings.length})</summary><ul>{proposal.result.warnings.map((w,i)=><li key={i}>{w}</li>)}</ul></details>}
        {proposal.result.code && <><button className="ai-preview-toggle" onClick={()=>setShowCode(v=>!v)} aria-expanded={showCode}><IconCode size={15}/>{showCode?t('提案コードを閉じる','Hide proposed code'):t('提案コードを確認','Review proposed code')}</button>{showCode&&<pre className="ai-code-preview">{proposal.result.code}</pre>}
        {(proposal.base!==text || proposal.assets!==assets) && <p className="ai-stale">{t('生成後にプロジェクトが変更されたため適用できません。現在のコードで再度依頼してください。','The project changed since this proposal. Request a new proposal for the current code.')}</p>}{blockDirty && <p className="ai-stale">{t('未反映のブロック変更があります。先に反映または再読み込みしてください。','There are uncommitted block edits. Apply or reload them first.')}</p>}
        <button className="ai-apply" disabled={!canApply} onClick={()=>{if(canApply && proposal.result.code){onApply(proposal.result.code,'apply');setLastApplied({before:proposal.base,after:proposal.result.code,assets:proposal.assets});setProposal(null);setMessages(m=>[...m,{role:'assistant',content:t('提案をエディターに適用しました。Scratchで動作を確認してください。','Proposal applied to the editor. Check its behavior in Scratch.')}]);}}}><IconCheckCircle size={16}/>{t('エディターに適用','Apply to editor')}</button></>}
      </div>}
    </div>
    {lastApplied && <div className="ai-undo-row"><button disabled={running||blockDirty||text!==lastApplied.after||assets!==lastApplied.assets} onClick={()=>{if(!running&&!blockDirty&&text===lastApplied.after&&assets===lastApplied.assets){onApply(lastApplied.before,'undo');setLastApplied(null);setProposal(null);setMessages(m=>[...m,{role:'assistant',content:t('AIの適用前に戻しました。','Restored the code from before the AI change.')}]);}}}><IconRefresh size={14}/> {t('直前のAI適用を元に戻す','Undo last AI change')}</button>{(text!==lastApplied.after||assets!==lastApplied.assets||blockDirty)&&<span>{t('コードやブロックが変更されたため使用できません','Unavailable because the project or blocks changed')}</span>}</div>}
    {!secureContext && <div className="ai-block-warning">{t('安全でない接続ではAPIキーを送信できません。HTTPS または localhost で開いてください。','API keys cannot be sent from an insecure connection. Use HTTPS or localhost.')}</div>}
    {blockDirty && <div className="ai-block-warning">{t('未反映のブロック変更があります。送信前に「コードに反映」または「再読み込み」をしてください。','Block edits are uncommitted. Apply or reload them before sending.')}</div>}
    <div className="ai-compose"><textarea value={prompt} onChange={e=>setPrompt(e.target.value)} placeholder={t('作りたいものや修正したいことを入力…','Describe what to build or fix…')} aria-label={t('AIへのメッセージ','Message to AI')} disabled={running} onKeyDown={e=>{if((e.metaKey||e.ctrlKey)&&e.key==='Enter'){e.preventDefault();void send();}}}/><div><button className="ai-clear" disabled={running||!messages.length} onClick={clear}><IconRefresh size={14}/>{t('会話を消去','Clear chat')}</button><span>{t('Ctrl/⌘ + Enter で送信','Ctrl/⌘ + Enter to send')}</span><button className="ai-send" disabled={running||blockDirty||!secureContext||!prompt.trim()||!key.trim()||!model.trim()||!consent} onClick={()=>void send()}>{t('送信','Send')} <IconArrowRight size={16}/></button></div></div>
    <div className="ai-footer">{EN?'AI can make mistakes. No Scratch execution or external file edits are performed.':'AIは間違えることがあります。Scratchでの実行や外部ファイルの操作は行いません。'}</div>
  </div>;
}
