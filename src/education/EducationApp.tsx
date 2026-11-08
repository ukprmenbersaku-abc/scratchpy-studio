import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { analyzeText, emptyAssetStore, sb3ToText, textToSb3, type AssetStore } from '../core/api';
import Editor, { type EditorHandle } from '../app/components/Editor';
import { BlocklyPanel } from '../app/components/BlocklyPanel';
import LecturePage from './LecturePage';
import EditionMenu from '../app/components/EditionMenu';
import EducationAssistant from './EducationAssistant';
import ScratchPlayer from '../app/components/ScratchPlayer';
import { EN, t } from '../app/i18n';
import { IconLogo, IconBook, IconCode, IconPuzzle, IconChevronRight, IconCheckCircle, IconLightbulb, IconDownload, IconFolderOpen, IconRefresh, IconArrowRight, IconXCircle } from '../app/components/Icons';
import { LESSONS, EN_LESSONS, type LessonId } from './lessons';

const lessons = EN ? EN_LESSONS : LESSONS;
const KEY = EN ? 'scratchpy-education-en-v1' : 'scratchpy-education-v1';
type Saved = {completed: LessonId[]; drafts: Partial<Record<LessonId, string>>};
function readSaved(): Saved {
  try { const d = JSON.parse(localStorage.getItem(KEY) || '{}'); return {completed:Array.isArray(d.completed) ? d.completed.filter((id:unknown) => lessons.some(l=>l.id===id)) : [], drafts:d.drafts && typeof d.drafts==='object' ? d.drafts : {}}; }
  catch { return {completed:[], drafts:{}}; }
}
const starter = `stage:\n    pass\n\nsprite Cat:\n    costume costume1\n    on flag:\n        say("${EN ? 'Hello!' : 'こんにちは！'}")\n`;
function Buddy({small=false}:{small?:boolean}) {
  return <svg className={small ? 'edu-buddy small' : 'edu-buddy'} viewBox="0 0 180 160" fill="none" aria-hidden="true">
    <ellipse cx="93" cy="144" rx="61" ry="9" fill="#d2dcff" opacity=".55"/>
    <path d="M36 60 28 28c-2-8 2-11 8-7l24 15c19-8 42-8 60 0l24-15c6-4 10-1 8 7l-8 32" fill="#ffc87a" stroke="#d38a3e" strokeWidth="4" strokeLinejoin="round"/>
    <path d="M146 86c0 31-24 49-56 49S34 117 34 86 58 37 90 37s56 18 56 49Z" fill="#ffbd6a" stroke="#d38a3e" strokeWidth="4"/>
    <path d="M48 86c0-23 19-38 42-38s42 15 42 38-19 38-42 38-42-15-42-38Z" fill="#fff4e2"/>
    <ellipse cx="72" cy="79" rx="5" ry="7" fill="#544439"/><ellipse cx="108" cy="79" rx="5" ry="7" fill="#544439"/>
    <path d="M83 93c3 3 5 3 7 0 2 3 4 3 7 0M90 89v4" stroke="#9e6649" strokeWidth="3" strokeLinecap="round"/>
    <circle cx="61" cy="94" r="6" fill="#ffb1a5" opacity=".7"/><circle cx="119" cy="94" r="6" fill="#ffb1a5" opacity=".7"/>
    <path d="M24 119 9 128M156 119l15 9" stroke="#ffbd6a" strokeWidth="7" strokeLinecap="round"/>
    <path d="m143 9 2 5 5 2-5 2-2 5-2-5-5-2 5-2 2-5Z" fill="#ffd65d"/>
  </svg>;
}

function LearnGuide({onClose}:{onClose:()=>void}) {
  const steps = [
    [t('モードをえらぼう','Choose a mode'),t('レッスンではおだいをクリア。エディターでは、ブロックとコードを自由に作れるよ。','Complete missions in Lessons, or build freely with blocks and code in the Editor.')],
    [t('レッスンに挑戦','Try a lesson'),t('先に講習を読んで「課題にすすむ」を押そう。コードを書きかえてチェック！ ブロックは見るだけだよ。','Read the lesson first, then select “Go to the challenge”. Edit the code and check your answer; blocks are read-only.')],
    [t('困ったらヒント','Need a hint?'),t('ヒントやコードの解説を読んでみよう。エラーが出ても、何度でもやり直せるよ。','Open the hint and code note. If you make a mistake, you can always try again.')],
    [t('エディターで作ろう','Create in the Editor'),t('ブロックをつないで「コードに反映」を押そう。コードも直接編集できるよ。','Connect blocks and select “Apply to code”. You can also edit the code directly.')],
    [t('Scratchで動かそう','Run it in Scratch'),t('画面の「実行」で試せるよ。保存した .sb3 を Scratch で開くこともできるよ。','Use Run to try your project here, or download an .sb3 file and open it in Scratch.')],
    [t('保存について','Saving your work'),t('レッスンの進捗とコードはこのブラウザに保存。エディターの作品・画像・音はページを閉じると消えるので、.sb3を保存してね。','Lesson progress and code are saved in this browser. Editor projects and imported assets are temporary: save an .sb3 file before leaving.')],
  ];
  return <div className="edu-guide" role="dialog" aria-modal="true" aria-label={t('使い方ガイド','How to use')}><div className="edu-guide-card">
    <div className="edu-guide-head"><div><span className="edu-kicker">SCRATCHPY GUIDE</span><h2>{t('使い方ガイド','Your quick guide')}</h2><p>{t('ブロックからコードへ、少しずつ。','From blocks to code, one step at a time.')}</p></div><button className="edu-icon-btn" onClick={onClose} aria-label={t('ガイドを閉じる','Close guide')}><IconXCircle size={24}/></button></div>
    <div className="edu-guide-grid">{steps.map(([heading,desc],i)=><section key={heading}><span className="edu-guide-num">0{i+1}</span><h3>{heading}</h3><p>{desc}</p></section>)}</div>
    <button className="edu-primary" onClick={onClose}>{t('わかった！','Got it!')} <IconArrowRight size={17}/></button>
  </div></div>;
}

export default function EducationApp() {
  const [saved,setSaved]=useState<Saved>(readSaved);
  const [current,setCurrent]=useState<LessonId|'free'>('hello');
  const [lastLesson,setLastLesson]=useState<LessonId>('hello');
  const [phase,setPhase]=useState<'learn'|'practice'>('learn');
  const lesson=lessons.find(l=>l.id===current);
  const index=lessons.findIndex(l=>l.id===current);
  const [text,setTextState]=useState(()=>readSaved().drafts.hello ?? lessons[0].starter);
  const [assets,setAssets]=useState<AssetStore>(emptyAssetStore);
  const [fileName,setFileName]=useState('');
  const [freeCode,setFreeCode]=useState(starter);
  const [freeAssets,setFreeAssets]=useState<AssetStore>(emptyAssetStore);
  const [freeFileName,setFreeFileName]=useState('');
  const [freeOriginal,setFreeOriginal]=useState<Uint8Array|null>(null);
  const [freeImportNotes,setFreeImportNotes]=useState<string[]>([]);
  const [blockDirty,setBlockDirty]=useState(false);
  const [hint,setHint]=useState(false);
  const [guide,setGuide]=useState(false);
  const [feedback,setFeedback]=useState<{ok:boolean;message:string}|null>(null);
  const [notice,setNotice]=useState('');
  const [cursor,setCursor]=useState({line:1,col:1});
  const [workspaceKey,setWorkspaceKey]=useState(0);
  const editorRef=useRef<EditorHandle>(null);
  const mainRef=useRef<HTMLElement>(null);
  const layoutRef=useRef<HTMLDivElement>(null);
  const supportRef=useRef<HTMLElement>(null);
  const fileRef=useRef<HTMLInputElement>(null);
  const analysis=useMemo(()=>analyzeText(text),[text]);
  const errors=analysis.diagnostics.filter(d=>d.severity==='error');
  useEffect(()=>{document.documentElement.lang=EN?'en':'ja';document.title=EN?'ScratchPy Education — From blocks to code':'ScratchPy Education — ブロックからコードへ';document.documentElement.dataset.theme='light';},[]);
  useEffect(()=>{try{localStorage.setItem(KEY,JSON.stringify(saved));}catch{/* unavailable */}},[saved]);
  useEffect(()=>{ mainRef.current?.scrollTo({top:0}); layoutRef.current?.scrollTo({top:0}); },[current,phase]);
  const updateText=useCallback((value:string)=>{setTextState(value);setFeedback(null);if(current==='free')setFreeCode(value);else setSaved(prev=>({...prev,drafts:{...prev.drafts,[current]:value}}));},[current]);
  const switchTo=(id:LessonId|'free')=>{
    if(id===current)return;
    if(blockDirty&&!window.confirm(t('未反映のブロック変更をすてて移動しますか？','Discard uncommitted block edits and switch?')))return;
    setCurrent(id);if(id!=='free'){setLastLesson(id);setPhase('learn');}setHint(false);setFeedback(null);setNotice('');setBlockDirty(false);setWorkspaceKey(k=>k+1);
    if(id==='free'){setTextState(freeCode);setAssets(freeAssets);setFileName(freeFileName);}
    else{const next=lessons.find(l=>l.id===id)!;setTextState(saved.drafts[id] ?? next.starter);setAssets(emptyAssetStore());setFileName('');}
  };
  const reset=()=>{
    if(!window.confirm(t('いまのコードとブロックをはじめの状態にもどしますか？','Reset this workspace to its starting state?')))return;
    updateText(lesson?.starter ?? starter);setBlockDirty(false);setWorkspaceKey(k=>k+1);setFeedback(null);setNotice(t('はじめの状態にもどしたよ。','Workspace reset.'));
    if(!lesson){setAssets(emptyAssetStore());setFreeAssets(emptyAssetStore());setFileName('');setFreeFileName('');setFreeOriginal(null);setFreeImportNotes([]);}
  };
  const check=()=>{
    if(!lesson)return;
    const error=analysis.diagnostics.find(d=>d.severity==='error');
    const ok=!!analysis.program&&!error&&lesson.check(analysis.program);
    const message=error?t(`まずはコードを直そう：${error.message}`,`Fix the code first. Details (Japanese): ${error.message}`):!analysis.program?t('コードを読み取れなかったよ。','Could not read the code.'):ok?t('ミッションクリア！ できたね！','Mission complete! Great work!'):t('おしい！ おだいをもう一度読んで、コードをたしかめよう。','Not quite yet! Read the mission again and check your code.');
    setFeedback({ok,message});if(ok)setSaved(prev=>prev.completed.includes(lesson.id)?prev:{...prev,completed:[...prev.completed,lesson.id]});
  };
  const download=()=>{
    if(blockDirty){setNotice(t('先にブロックの「コードに反映」を押してね。','Apply your block changes to the code first.'));return;}
    if(!lesson && freeImportNotes.length && !window.confirm(t('変換時に警告があったため、元の作品の一部が失われるかもしれません。元の.sb3を残して保存しますか？','Conversion warnings indicate some data may be lost. Keep the original .sb3 and continue?')))return;
    try{const result=textToSb3(text,assets);const url=URL.createObjectURL(new Blob([result.bytes as unknown as ArrayBuffer],{type:'application/octet-stream'}));const a=document.createElement('a');a.href=url;a.download=fileName||`scratchpy-${current}.sb3`;a.click();setTimeout(()=>URL.revokeObjectURL(url),5000);setNotice(t('保存したファイルをScratchの「ファイル → コンピューターから読み込む」で開いてね。','Open the downloaded file in Scratch: File → Load from your computer.'));}
    catch(e){setNotice(t(`ファイルを作れなかったよ。コードをたしかめてね。${(e as Error).message}`,`Could not create the file. Check your code. Details: ${(e as Error).message}`));}
  };
  const upload=async(event:React.ChangeEvent<HTMLInputElement>)=>{
    const file=event.target.files?.[0];event.target.value='';if(!file)return;
    if((blockDirty||freeCode!==starter||!!freeFileName)&&!window.confirm(t('エディターの今の作品と未反映のブロックを置きかえてファイルをひらきますか？ 必要なら先に .sb3 で保存してね。','Replace the current editor project and uncommitted blocks? Save an .sb3 first if you need it.')))return;
    try{const bytes=new Uint8Array(await file.arrayBuffer());const imported=sb3ToText(bytes);setFreeOriginal(bytes.slice());setFreeImportNotes(imported.notes);setCurrent('free');setTextState(imported.text);setFreeCode(imported.text);setAssets(imported.assetStore);setFreeAssets(imported.assetStore);setFileName(file.name);setFreeFileName(file.name);setBlockDirty(false);setWorkspaceKey(k=>k+1);setFeedback(null);setHint(false);
      setNotice(imported.notes.length?t(`読み込んだよ。変換できなかった部分があるかも。元のファイルを残してね。 ${imported.notes.join(' / ')}`,`Opened with conversion warnings; keep the original file. Details (Japanese): ${imported.notes.join(' / ')}`):t('エディターに読み込んだよ。画像や音を残すには.sb3を保存してね。','Opened in the editor. Save an .sb3 to keep your images and sounds.'));
    }catch(e){setNotice(t(`読み込めなかったよ：${(e as Error).message}`,`Could not open the file: ${(e as Error).message}`));}
  };
  const mode=lesson?'lesson':'editor';
  return <div className={`education edu-mode-${mode}`}>
    <header className="edu-header">
      <div className="edu-brand"><span className="edu-brand-logo"><IconLogo size={25}/></span><div><strong>ScratchPy</strong><span>EDUCATION</span></div></div>
      <div className="edu-header-divider"/><span className="edu-header-tagline">{t('ブロックから、コードの世界へ。','From blocks to code.')}</span>
      <div className="edu-header-spacer"/><button className="edu-head-button edu-ai-jump" onClick={()=>supportRef.current?.scrollIntoView({behavior:'smooth',block:'start'})}>{t('AI相談','AI help')}</button><EditionMenu/><span className="edu-language">{EN?'EN':'日本語'}</span>
      <button className="edu-head-button" onClick={()=>setGuide(true)}><IconBook size={17}/> {t('使い方','Guide')}</button>
      <button className="edu-head-button" onClick={()=>fileRef.current?.click()}><IconFolderOpen size={17}/> {t('ひらく','Open')}</button>
      <input ref={fileRef} type="file" accept=".sb3,application/octet-stream" hidden onChange={upload}/>
      <button className="edu-download" onClick={download}><IconDownload size={17}/> {t('.sb3を保存','Save .sb3')}</button>
    </header>
    <div className="edu-navigation">
      <div className="edu-mode-tabs" role="group" aria-label={t('モードを選ぶ','Choose a mode')}>
        <button className={lesson?'active':''} aria-pressed={!!lesson} onClick={()=>switchTo(lastLesson)}><IconBook size={17}/>{t('レッスン','Lessons')}</button>
        <button className={!lesson?'active':''} aria-pressed={!lesson} onClick={()=>switchTo('free')}><IconPuzzle size={18}/>{t('エディター','Editor')}</button>
      </div>
      <div className="edu-navigation-copy">{lesson?t('講習を読んで、課題にチャレンジ！','Learn first, then take the challenge!'):t('自由につくって、Scratchで動かそう！','Build freely, then run it in Scratch!')}</div>
      <button className="edu-guide-link" onClick={()=>setGuide(true)}><IconLightbulb size={16}/> {t('はじめての方へ','Getting started')}</button>
    </div>
    {lesson && <div className="edu-progressbar"><div><strong>{t('レッスンの進みぐあい','Your lesson progress')}</strong><span>{saved.completed.length} / {lessons.length} {t('クリア','completed')}</span></div><div className="edu-progress-track" role="progressbar" aria-label={t('レッスンの進みぐあい','Lesson progress')} aria-valuenow={saved.completed.length} aria-valuemin={0} aria-valuemax={lessons.length}><div style={{width:`${saved.completed.length/lessons.length*100}%`}}/></div><span className="edu-progress-caption">{t('ひとつずつ、ステップアップ！','One step at a time!')}</span></div>}
    <div className="edu-layout" ref={layoutRef}>
      {lesson && <aside className="edu-sidebar"><div className="edu-side-heading"><div><span className="edu-kicker">LEARNING PATH</span><h2>{t('レッスン','Lessons')}</h2></div><span>{lessons.length} {t('ステップ','steps')}</span></div><p className="edu-side-desc">{t('すきなレッスンをえらぼう','Choose a lesson to get started')}</p><nav className="edu-lesson-list" aria-label={t('レッスン一覧','Lesson list')}>{lessons.map((l,i)=><button key={l.id} className={`edu-lesson ${l.id===current?'active':''}`} aria-current={l.id===current?'step':undefined} onClick={()=>switchTo(l.id)}><span className="edu-lesson-num" style={{'--lesson-color':l.color} as React.CSSProperties}>{saved.completed.includes(l.id)?<IconCheckCircle size={18}/>:String(i+1).padStart(2,'0')}</span><span className="edu-lesson-name"><strong>{l.title}</strong><small>{l.subtitle}</small></span><IconChevronRight size={16}/></button>)}</nav><div className="edu-side-bottom"><div className="edu-side-promo"><IconPuzzle size={21}/><div><strong>{t('もっと作りたい？','Ready to create?')}</strong><small>{t('エディターで自由につくろう','Try the free editor')}</small></div><button onClick={()=>switchTo('free')} aria-label={t('エディターを開く','Open editor')}><IconArrowRight size={17}/></button></div></div></aside>}
      <main className="edu-main" ref={mainRef}>
        <div className="edu-page-top"><div><div className="edu-page-eyebrow">{lesson?`LESSON ${String(index+1).padStart(2,'0')} / ${String(lessons.length).padStart(2,'0')}`:'CREATIVE SPACE'}</div><h1>{lesson?lesson.title:t('エディター','Editor')}</h1><p>{lesson?phase==='learn'?t('まずは講習で学ぼう。','Start by learning the idea.'):t('おだいを読んで、コードを書きかえてみよう。','Read the mission, then change the code.') : t('ブロックとコードを使って、自由に作品をつくろう。','Create your own project with blocks and code.')}</p></div>{(!lesson || phase==='practice') && <button className="edu-reset" onClick={reset}><IconRefresh size={16}/> {t('はじめにもどす','Reset')}</button>}</div>
        {lesson && <div className="edu-lesson-steps" aria-label={t('レッスンの流れ','Lesson steps')}><span className={phase==='learn'?'active':'done'}><b>1</b>{t('講習','Learn')}</span><i/><span className={phase==='practice'?'active':''}><b>2</b>{t('課題','Challenge')}</span>{phase==='practice'&&<button onClick={()=>{setPhase('learn');setHint(false);}}><IconBook size={15}/> {t('講習にもどる','Review lesson')}</button>}</div>}
        {lesson && phase==='learn' && <div className="edu-lecture-player"><ScratchPlayer text={text} assets={assets} blockDirty={blockDirty}/></div>}
        {lesson && phase==='learn' ? <LecturePage key={lesson.id} lesson={lesson} index={index} onPractice={()=>setPhase('practice')}/> : <>
        {lesson && <section className="edu-mission" aria-label={t('おだい','Mission')}><div className="edu-mission-icon"><IconCheckCircle size={22}/></div><div className="edu-mission-text"><span>{t('きょうのおだい','YOUR MISSION')}</span><strong>{lesson.goal}</strong></div><button className="edu-mobile-hint" aria-expanded={hint} onClick={()=>setHint(h=>!h)}><IconLightbulb size={16}/>{t('ヒント','Hint')}</button><button className="edu-primary edu-check" onClick={check}>{t('こたえをチェック','Check answer')} <IconArrowRight size={17}/></button></section>}
        {lesson && hint && <div className="edu-mobile-hint-text">{lesson.hint}</div>}
        {feedback && <div role="status" className={`edu-feedback ${feedback.ok?'success':'retry'}`}><span>{feedback.message}</span>{feedback.ok && index<lessons.length-1 && <button onClick={()=>switchTo(lessons[index+1].id)}>{t('つぎのレッスンへ','Next lesson')} <IconArrowRight size={16}/></button>}</div>}
        {notice && <div className="edu-notice" role="status">{notice}<button onClick={()=>setNotice('')} aria-label={t('おしらせを閉じる','Dismiss notice')}>×</button></div>}
        <div className="edu-workspace">
          <section className="edu-work-card edu-block-card"><div className="edu-card-head"><span className="edu-card-icon purple"><IconPuzzle size={20}/></span><div><h2>{t('ブロック','Blocks')}</h2><p>{lesson?t('コードから自動で表示・見るだけ','A read-only view of your code'):t('ドラッグして組み立てよう','Drag and connect blocks')}</p></div><span className="edu-card-label">{lesson?t('見るだけ','VIEW ONLY'):'BLOCKS'}</span></div><BlocklyPanel key={workspaceKey} education readOnly={!!lesson} text={text} dark={false} active={true} onTextChange={updateText} onDirtyChange={setBlockDirty}/></section>
          <section className="edu-work-card edu-code-card"><div className="edu-card-head"><span className="edu-card-icon blue"><IconCode size={20}/></span><div><h2>{t('コード','Code')}</h2><p>{lesson?t('ここを書きかえて、おだいに挑戦','Edit here to solve the mission'):t('コードを直接編集できるよ','You can edit the code directly')}</p></div><span className="edu-card-label">SCRATCHPY</span></div><div className="edu-editor"><Editor ref={editorRef} value={text} onChange={updateText} onCursor={setCursor} dragging={false}/></div><div className="edu-code-status"><span className={`edu-code-dot ${errors.length?'bad':''}`}/>{errors.length?t(`${errors.length}件のエラー` ,`${errors.length} error(s)`):t('コードをチェック済み','Code checked')}<span className="edu-code-pos">{t(`${cursor.line} 行目`,`Line ${cursor.line}`)}</span></div></section>
          <div className="edu-runtime-card"><ScratchPlayer text={text} assets={assets} blockDirty={blockDirty} original={lesson ? null : freeOriginal} hasConversionWarnings={!lesson && freeImportNotes.length>0}/></div>
        </div>
        <div className="edu-tip-strip"><IconLightbulb size={19}/><p>{lesson?t('コードの形をチェックします（実行はしません）。ブロックは参考として表示されます。','Checks inspect code structure; they do not run the project. Blocks are shown for reference.'):t('ブロックを変えたら「コードに反映」。コードとブロックを見比べてみよう。','After editing blocks, select “Apply to code” and compare the two views.')}</p></div>
        <p className="edu-save-note">{lesson?t('レッスンのコードとクリア状況は、このブラウザに保存されます。','Lesson code and progress are saved in this browser.'):t('エディターの作品は一時保存です。大切な作品は .sb3 で保存しよう。','Editor projects are temporary. Save your work as an .sb3 file.')}</p>
        </>}
      </main>
      <aside className="edu-coach" ref={supportRef}>
        <EducationAssistant code={text} diagnostics={errors.map(d=>`${d.loc ? `${d.loc.line}: ` : ''}${d.message}`)} blockDirty={blockDirty} lessonTitle={lesson?.title ?? t('自由エディター','Free editor')} goal={lesson?.goal ?? ''} phase={lesson ? phase : 'free'}/>
        {lesson && phase==='learn' ? <><div className="edu-coach-title"><span className="edu-kicker">YOUR LEARNING GUIDE</span><h2>{t('学習の進めかた','How to learn')}</h2></div><div className="edu-buddy-card"><div><strong>{t('まずは読んでみよう！','Let’s learn first!')}</strong><p>{t('ポイントとコードの例を読んだら、下のボタンから課題へ進もう。','Read the key points and examples, then use the button below to start the challenge.')}</p></div><Buddy/></div><div className="edu-editor-steps"><div><b>1</b><span>{t('講習でポイントを知る','Learn the key ideas')}</span></div><div><b>2</b><span>{t('コードを編集して挑戦','Edit the code and try')}</span></div><div><b>3</b><span>{t('こたえをチェック','Check your answer')}</span></div></div><div className="edu-concept"><h3>{t('Python とのちがい','About Python')}</h3><p>{t('ScratchPy は Python 風の別の言語です。Python の参考例は比較用で、ここでは実行できません。','ScratchPy is a separate Python-like language. Python examples are for comparison and cannot run here.')}</p></div></> : lesson ? <><div className="edu-coach-title"><span className="edu-kicker">YOUR LEARNING GUIDE</span><h2>{t('こまったときは','Your learning guide')}</h2></div><div className="edu-buddy-card"><div><strong>{t('いっしょにやってみよう！','Let’s learn together!')}</strong><p>{t('おだいを読んで、右のコードをかえてみよう。','Read the mission and try editing the code.')}</p></div><Buddy/></div><div className="edu-hint-card"><button onClick={()=>setHint(h=>!h)} aria-expanded={hint}><span className="edu-hint-icon"><IconLightbulb size={20}/></span><span><strong>{t('ヒントを見る','Show a hint')}</strong><small>{t('わからないときはここ！','A little help when you need it')}</small></span><IconChevronRight size={17}/></button>{hint&&<p>{lesson.hint}</p>}</div><div className="edu-concept"><span className="edu-kicker">CODE NOTE</span><h3>{t('コードのひみつ','Code explained')} <span>{lesson.concept}</span></h3><p>{lesson.explanation}</p><pre>{lesson.example}</pre></div></> : <><div className="edu-coach-title"><span className="edu-kicker">CREATIVE SPACE</span><h2>{t('つくりかた','Make something!')}</h2></div><div className="edu-buddy-card"><div><strong>{t('自由につくろう！','Make it your own!')}</strong><p>{t('ブロックをつないで、コードの変化を見てみよう。','Connect blocks and see how the code changes.')}</p></div><Buddy/></div><div className="edu-editor-steps"><div><b>1</b><span>{t('ブロックをつなぐ','Connect blocks')}</span></div><div><b>2</b><span>{t('「コードに反映」を押す','Select “Apply to code”')}</span></div><div><b>3</b><span>{t('.sb3を保存してScratchで開く','Save .sb3 and open in Scratch')}</span></div></div><button className="edu-outline" onClick={()=>setGuide(true)}><IconBook size={17}/> {t('使い方を見る','Open the guide')}</button><div className="edu-concept"><h3>{t('Scratchで動かそう','Run it in Scratch')}</h3><p>{t('「実行」で作品を試そう。保存した .sb3 をScratchで動かすこともできるよ。','Use Run to try your project, or save an .sb3 and open it in Scratch.')}</p></div></>}
        {(!lesson || phase==='practice') && errors.length>0 && <div className="edu-errors"><strong>{t('コードを見直そう','Check your code')}</strong>{EN&&<p>Detailed diagnostics are in Japanese.</p>}{errors.slice(0,3).map((d,i)=><button key={i} onClick={()=>d.loc&&editorRef.current?.jumpTo(d.loc.line)}>{d.loc&&t(`${d.loc.line}行目：`,`Line ${d.loc.line}: `)}{d.message}</button>)}</div>}
      </aside>
    </div>
    {guide&&<LearnGuide onClose={()=>setGuide(false)}/>}
  </div>;
}
