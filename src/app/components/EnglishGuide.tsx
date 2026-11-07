import { useEffect, useRef, useState } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import rehypeSlug from 'rehype-slug';
import type { GuideId } from './GuidePage';
import { IconLogo, IconBook, IconArrowLeft, IconArrowRight, IconCode, IconPuzzle, IconBraces, IconBranch, IconFile, IconLightbulb, IconMoon, IconSun, IconSearch } from './Icons';
import usage from '../../../docs/en/usage.md?raw';
import language from '../../../docs/en/language.md?raw';
import format from '../../../docs/en/sb3.md?raw';
import mapping from '../../../docs/en/mapping.md?raw';
import architecture from '../../../docs/en/architecture.md?raw';

const docs = [
  {id:'usage', title:'Getting started', label:'START HERE', description:'Open projects, edit blocks and export to Scratch.', icon:IconLightbulb, content:usage},
  {id:'language', title:'ScratchPy language', label:'LEARN THE LANGUAGE', description:'Explore types, events, variables, loops and custom blocks.', icon:IconCode, content:language},
  {id:'format', title:'Inside an .sb3 file', label:'EXPLORE SCRATCH', description:'Understand targets, project.json, blocks and assets.', icon:IconFile, content:format},
  {id:'mapping', title:'Conversion mapping', label:'UNDERSTAND CONVERSION', description:'How ScratchPy maps to Scratch, and what may be lost.', icon:IconBraces, content:mapping},
  {id:'architecture', title:'Architecture', label:'FOR DEVELOPERS', description:'How the application and its components fit together.', icon:IconBranch, content:architecture},
] as const;
interface Props { page:GuideId; dark:boolean; onNavigate:(id:GuideId)=>void; onClose:()=>void; onToggleTheme:()=>void; }
export default function EnglishGuide({page,dark,onNavigate,onClose,onToggleTheme}:Props) {
  const [search,setSearch] = useState('');
  const scroller = useRef<HTMLElement>(null);
  const doc = docs.find(d=>d.id===page);
  const visible = docs.filter(d=>`${d.title} ${d.description} ${d.label}`.toLowerCase().includes(search.trim().toLowerCase()));
  useEffect(()=>{scroller.current?.scrollTo({top:0});},[page]);
  const follow = (href:string) => {
    if (href.startsWith('#')) { let id=href.slice(1); try {id=decodeURIComponent(id)} catch {/* invalid URI */} document.getElementById(id)?.scrollIntoView({behavior:'smooth'}); return true; }
    const path=href.split('#')[0].split('/').pop(); const target=docs.find(d=>`${d.id}.md`===path || (d.id==='format' && path==='sb3.md'));
    if(target){onNavigate(target.id);return true;} return false;
  };
  return <div className="guide-page">
    <header className="guide-topbar">
      <button className="guide-brand" onClick={()=>onNavigate('home')} aria-label="Guide home"><span className="guide-logo"><IconLogo size={21}/></span><span>ScratchPy <b>Guide</b></span></button>
      <span className="guide-top-label">Learn · Create · Explore</span><div className="spacer"/>
      <button className="guide-theme" onClick={onToggleTheme} aria-label={dark?'Switch to light mode':'Switch to dark mode'}>{dark?<IconSun size={17}/>:<IconMoon size={17}/>}</button>
      <button className="guide-back" onClick={onClose}><IconArrowLeft size={16}/> Back to editor</button>
    </header>
    <div className="guide-layout">
      <aside className="guide-sidebar" aria-label="Guide navigation">
        <div className="guide-sidebar-title">DOCUMENTATION</div>
        <label className="guide-search"><IconSearch size={16}/><span className="sr-only">Search guides</span><input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Search guides"/></label>
        <div className="guide-nav-label">GETTING STARTED</div>
        <button className={`guide-nav-item ${page==='home'?'is-active':''}`} aria-current={page==='home'?'page':undefined} onClick={()=>onNavigate('home')}><IconBook size={17}/><span>Guide home</span><IconArrowRight size={13}/></button>
        <div className="guide-nav-label">DOCUMENTATION</div><nav className="guide-nav">{visible.map(d=>{const Icon=d.icon;return <button key={d.id} className={`guide-nav-item ${page===d.id?'is-active':''}`} aria-current={page===d.id?'page':undefined} onClick={()=>onNavigate(d.id)}><Icon size={17}/><span>{d.title}</span></button>})}{!visible.length&&<p className="guide-no-results">No guides found.</p>}</nav>
        <div className="guide-sidebar-bottom"><span className="guide-sidebar-dot"/>Learn at your own pace.</div>
      </aside>
      <main className="guide-scroll" ref={scroller}>{doc?<div className="guide-document-wrap">
        <div className="guide-breadcrumb"><button onClick={()=>onNavigate('home')}>Guide</button><span>/</span><span>{doc.title}</span></div>
        <div className="guide-doc-meta"><span>{doc.label}</span><span>SCRATCHPY STUDIO</span></div>
        <article className="guide-article"><ReactMarkdown remarkPlugins={[remarkGfm]} rehypePlugins={[rehypeSlug]} components={{table:({children})=><div className="guide-table-wrap"><table>{children}</table></div>,a:({href,children})=><a href={href} onClick={e=>{if(href&&follow(href))e.preventDefault()}} {...(href?.startsWith('http')?{target:'_blank',rel:'noreferrer noopener'}:{})}>{children}</a>}}>{doc.content}</ReactMarkdown></article>
        <div className="guide-doc-footer"><span>Ready to keep exploring?</span><button onClick={()=>onNavigate('home')}>All guides <IconArrowRight size={15}/></button></div>
      </div>:<div className="guide-home">
        <div className="guide-breadcrumb"><span>Guide</span><span>/</span><span>Get started</span></div>
        <section className="guide-hero"><div className="guide-hero-copy"><div className="guide-eyebrow"><span/>SCRATCHPY STUDIO GUIDE</div><h1>From “how?”<br/><em>to “I did it!”</em></h1><p>From Scratch to the world of code.<br/>Explore, create, and learn at your own pace.</p><button className="guide-primary" onClick={()=>onNavigate('usage')}>Start with the basics <IconArrowRight size={17}/></button></div><div className="guide-hero-art" aria-hidden="true"><span className="guide-art-orbit orbit-one"/><span className="guide-art-orbit orbit-two"/><div className="guide-art-card art-purple"><IconCode size={25}/></div><div className="guide-art-card art-orange"><IconPuzzle size={31}/></div><div className="guide-art-card art-blue"><IconBook size={24}/></div><div className="guide-art-spark spark-one"/><div className="guide-art-spark spark-two"/></div></section>
        <section className="guide-section"><div className="guide-section-heading"><div><div className="guide-kicker">QUICK START</div><h2>Let's get started.</h2><p>Three simple steps to create with ScratchPy.</p></div><button onClick={()=>onNavigate('usage')}>Full guide <IconArrowRight size={15}/></button></div><div className="guide-steps">
          <div><span>01</span><IconFile size={22}/><h3>Open a project</h3><p>Choose a sample or load a Scratch .sb3 project.</p></div><div><span>02</span><IconPuzzle size={22}/><h3>Edit your code</h3><p>Edit text or blocks and check the diagnostics.</p></div><div><span>03</span><IconArrowRight size={22}/><h3>Return to Scratch</h3><p>Download your .sb3 and open it in Scratch.</p></div></div></section>
        <section className="guide-section guide-explore"><div className="guide-section-heading"><div><div className="guide-kicker">EXPLORE THE GUIDES</div><h2>Curious to learn more?</h2><p>Pick a topic and take the next step.</p></div></div><div className="guide-cards">{docs.map((d,i)=>{const Icon=d.icon;return <button key={d.id} className="guide-card" onClick={()=>onNavigate(d.id)}><span className={`guide-card-icon tone-${i}`}><Icon size={19}/></span><span className="guide-card-copy"><small>{d.label}</small><strong>{d.title}</strong><span>{d.description}</span></span><IconArrowRight size={17}/></button>})}</div></section>
        <div className="guide-note"><IconLightbulb size={20}/><div><strong>Editing with blocks?</strong><p>Click “Apply to code” after editing to update your ScratchPy source.</p></div><button onClick={()=>onNavigate('usage')}>Learn more <IconArrowRight size={14}/></button></div>
        <footer className="guide-footer">ScratchPy Studio <span>·</span> Make something wonderful.</footer>
      </div>}</main>
    </div>
  </div>;
}
