import { useEffect, useRef, useState } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import rehypeSlug from 'rehype-slug';
import { IconLogo, IconBook, IconArrowLeft, IconArrowRight, IconCode, IconPuzzle, IconBraces, IconBranch, IconFile, IconLightbulb, IconMoon, IconSun, IconSearch } from './Icons';
import language from '../../../docs/01-scratchpy-language.md?raw';
import format from '../../../docs/02-sb3-format-analysis.md?raw';
import mapping from '../../../docs/03-conversion-mapping.md?raw';
import architecture from '../../../docs/04-architecture.md?raw';
import usage from '../../../docs/05-usage-guide.md?raw';

export const GUIDE_DOCS = [
  { id: 'usage', file: '05-usage-guide.md', title: '使い方ガイド', label: 'はじめての方へ', description: 'ファイルの読み込みから書き出し、ブロック編集、よくある質問まで。', icon: IconLightbulb, content: usage },
  { id: 'language', file: '01-scratchpy-language.md', title: 'ScratchPy 言語仕様', label: '言語を学ぶ', description: '型、変数、イベント、組み込み関数など、ScratchPy の書き方。', icon: IconCode, content: language },
  { id: 'format', file: '02-sb3-format-analysis.md', title: '.sb3 ファイルの構造', label: 'Scratch を知る', description: 'project.json、ブロック、画像や音声など、Scratch の内部構造。', icon: IconFile, content: format },
  { id: 'mapping', file: '03-conversion-mapping.md', title: '変換の対応表', label: '変換を理解する', description: 'Scratch のブロックと ScratchPy コードの対応、変換時の注意点。', icon: IconBraces, content: mapping },
  { id: 'architecture', file: '04-architecture.md', title: 'アーキテクチャ', label: '開発者向け', description: '構成、データの流れ、設計判断、テストについて。', icon: IconBranch, content: architecture },
] as const;

export type GuideId = 'home' | (typeof GUIDE_DOCS)[number]['id'];
export function parseGuideHash(hash: string): GuideId | null {
  const match = /^#guide(?:\/([a-z]+))?\/?$/.exec(hash);
  if (!match) return null;
  const id = match[1] || 'home';
  return id === 'home' || GUIDE_DOCS.some(doc => doc.id === id) ? id as GuideId : 'home';
}

interface Props {
  page: GuideId;
  dark: boolean;
  onNavigate: (id: GuideId) => void;
  onClose: () => void;
  onToggleTheme: () => void;
}

export default function GuidePage({ page, dark, onNavigate, onClose, onToggleTheme }: Props) {
  const [search, setSearch] = useState('');
  const scrollRef = useRef<HTMLElement>(null);
  const pendingAnchor = useRef<string | null>(null);
  const doc = GUIDE_DOCS.find(item => item.id === page);
  const filtered = GUIDE_DOCS.filter(item => `${item.title} ${item.description} ${item.label}`.toLowerCase().includes(search.trim().toLowerCase()));

  useEffect(() => {
    const anchor = pendingAnchor.current;
    pendingAnchor.current = null;
    if (anchor) {
      requestAnimationFrame(() => document.getElementById(anchor)?.scrollIntoView({ block: 'start' }));
    } else scrollRef.current?.scrollTo({ top: 0 });
  }, [page]);

  const findAnchor = (anchor: string) => {
    const exact = document.getElementById(anchor);
    if (exact) return exact;
    // 元の Markdown には短縮された章リンクもあるため、章番号で補完する。
    const chapter = /^(\d+)-/.exec(anchor)?.[1];
    return chapter ? Array.from(document.querySelectorAll('.guide-article h2[id]')).find(el => el.id.startsWith(`${chapter}-`)) : undefined;
  };
  const followLink = (href: string) => {
    if (href.startsWith('#')) {
      let anchor = href.slice(1);
      try { anchor = decodeURIComponent(anchor); } catch { /* use raw anchor */ }
      findAnchor(anchor)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      return true;
    }
    const [path, fragment] = href.split('#');
    const target = GUIDE_DOCS.find(item => path.split('/').pop() === item.file);
    if (target) {
      if (fragment) {
        try { pendingAnchor.current = decodeURIComponent(fragment); } catch { pendingAnchor.current = fragment; }
      }
      if (page === target.id && pendingAnchor.current) {
        document.getElementById(pendingAnchor.current)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
        pendingAnchor.current = null;
      } else onNavigate(target.id);
      return true;
    }
    return false;
  };

  return (
    <div className="guide-page">
      <header className="guide-topbar">
        <button className="guide-brand" onClick={() => onNavigate('home')} aria-label="ガイドのトップへ">
          <span className="guide-logo"><IconLogo size={21} /></span>
          <span>ScratchPy <b>ガイド</b></span>
        </button>
        <span className="guide-top-label">学ぶ · 作る · 広げる</span>
        <div className="spacer" />
        <button className="guide-theme" onClick={onToggleTheme} aria-label={dark ? 'ライトモードに切り替え' : 'ダークモードに切り替え'} title="テーマを切り替え">
          {dark ? <IconSun size={17} /> : <IconMoon size={17} />}
        </button>
        <button className="guide-back" onClick={onClose}><IconArrowLeft size={16} /> エディタに戻る</button>
      </header>
      <div className="guide-layout">
        <aside className="guide-sidebar" aria-label="ガイドのナビゲーション">
          <div className="guide-sidebar-title">DOCUMENTATION <span>／ 説明書</span></div>
          <label className="guide-search"><IconSearch size={16} /><span className="sr-only">ガイドを探す</span><input value={search} onChange={e => setSearch(e.target.value)} placeholder="ガイドを探す" /></label>
          <div className="guide-nav-label">はじめに</div>
          <button className={`guide-nav-item ${page === 'home' ? 'is-active' : ''}`} onClick={() => onNavigate('home')} aria-current={page === 'home' ? 'page' : undefined}><IconBook size={17} /><span>ガイドのトップ</span><IconArrowRight size={13} /></button>
          <div className="guide-nav-label">ドキュメント</div>
          <nav className="guide-nav">
            {filtered.map(item => {
              const Icon = item.icon;
              return <button key={item.id} className={`guide-nav-item ${page === item.id ? 'is-active' : ''}`} onClick={() => onNavigate(item.id)} aria-current={page === item.id ? 'page' : undefined}><Icon size={17} /><span>{item.title}</span></button>;
            })}
            {!filtered.length && <p className="guide-no-results">該当するガイドがありません。</p>}
          </nav>
          <div className="guide-sidebar-bottom"><span className="guide-sidebar-dot" /> あなたのペースで、少しずつ。</div>
        </aside>
        <main className="guide-scroll" ref={scrollRef}>
          {doc ? (
            <div className="guide-document-wrap">
              <div className="guide-breadcrumb"><button onClick={() => onNavigate('home')}>ガイド</button><span>/</span><span>{doc.title}</span></div>
              <div className="guide-doc-meta"><span>{doc.label}</span><span>SCRATCHPY STUDIO</span></div>
              <article className="guide-article">
                <ReactMarkdown remarkPlugins={[remarkGfm]} rehypePlugins={[rehypeSlug]} components={{
                  table: ({ children }) => <div className="guide-table-wrap"><table>{children}</table></div>,
                  a: ({ href, children }) => <a href={href} onClick={e => { if (href && followLink(href)) e.preventDefault(); }} {...(href?.startsWith('http') ? { target: '_blank', rel: 'noreferrer noopener' } : {})}>{children}</a>,
                }}>{doc.content}</ReactMarkdown>
              </article>
              <div className="guide-doc-footer"><span>知りたいことは見つかりましたか？</span><button onClick={() => onNavigate('home')}>ガイド一覧へ <IconArrowRight size={15} /></button></div>
            </div>
          ) : (
            <div className="guide-home">
              <div className="guide-breadcrumb"><span>ガイド</span><span>/</span><span>はじめに</span></div>
              <section className="guide-hero">
                <div className="guide-hero-copy">
                  <div className="guide-eyebrow"><span /> SCRATCHPY STUDIO GUIDE</div>
                  <h1>「わからない」を、<br /><em>「できた！」</em>に。</h1>
                  <p>Scratch からコードの世界へ。<br />あなたのペースで、楽しく学んでいきましょう。</p>
                  <button className="guide-primary" onClick={() => onNavigate('usage')}>使い方から読んでみる <IconArrowRight size={17} /></button>
                </div>
                <div className="guide-hero-art" aria-hidden="true">
                  <span className="guide-art-orbit orbit-one" /><span className="guide-art-orbit orbit-two" />
                  <div className="guide-art-card art-purple"><IconCode size={25} /></div>
                  <div className="guide-art-card art-orange"><IconPuzzle size={31} /></div>
                  <div className="guide-art-card art-blue"><IconBook size={24} /></div>
                  <div className="guide-art-spark spark-one" /><div className="guide-art-spark spark-two" />
                </div>
              </section>
              <section className="guide-section">
                <div className="guide-section-heading"><div><div className="guide-kicker">QUICK START</div><h2>まずは、ここから。</h2><p>3つのステップで ScratchPy を始めよう。</p></div><button onClick={() => onNavigate('usage')}>詳しい使い方 <IconArrowRight size={15} /></button></div>
                <div className="guide-steps">
                  <div><span>01</span><IconFolder /><h3>プロジェクトを開く</h3><p>サンプルを選ぶか、Scratch の .sb3 ファイルを読み込みます。</p></div>
                  <div><span>02</span><IconPuzzle size={22} /><h3>コードを編集する</h3><p>テキストやブロックでプログラムを編集し、診断を確認します。</p></div>
                  <div><span>03</span><IconDownloadMini /><h3>Scratch に戻す</h3><p>.sb3 をダウンロードして、Scratch で開いてみましょう。</p></div>
                </div>
              </section>
              <section className="guide-section guide-explore">
                <div className="guide-section-heading"><div><div className="guide-kicker">EXPLORE THE GUIDES</div><h2>もっと、知りたい。</h2><p>気になるトピックを選んで、学びを深めましょう。</p></div></div>
                <div className="guide-cards">
                  {GUIDE_DOCS.map((item, i) => { const Icon = item.icon; return <button key={item.id} className="guide-card" onClick={() => onNavigate(item.id)}><span className={`guide-card-icon tone-${i}`}><Icon size={19} /></span><span className="guide-card-copy"><small>{item.label}</small><strong>{item.title}</strong><span>{item.description}</span></span><IconArrowRight size={17} /></button>; })}
                </div>
              </section>
              <div className="guide-note"><IconLightbulb size={20} /><div><strong>ブロック編集を使うときは</strong><p>編集後に「コードに反映」を押すと、変更が ScratchPy コードに反映されます。</p></div><button onClick={() => onNavigate('usage')}>詳しく見る <IconArrowRight size={14} /></button></div>
              <footer className="guide-footer">ScratchPy Studio <span>·</span> 自分のペースで、つくる楽しさを。</footer>
            </div>
          )}
        </main>
      </div>
    </div>
  );
}

function IconFolder() { return <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M3 6a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" /></svg>; }
function IconDownloadMini() { return <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M12 3v12m-4-4 4 4 4-4M4 17v3h16v-3" /></svg>; }
