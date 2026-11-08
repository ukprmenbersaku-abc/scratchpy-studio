import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  analyzeText, sb3ToText, textToSb3, formatText,
  ExportError, Sb3ParseError, emptyAssetStore,
  type TextAnalysis, type AssetStore,
} from '../core/api';
import { SAMPLES } from '../core/samples';
import Editor, { EditorHandle } from './components/Editor';
import { BlocklyPanel } from './components/BlocklyPanel';
import DiagnosticsPanel from './components/DiagnosticsPanel';
import StructurePanel from './components/StructurePanel';
import JsonPanel from './components/JsonPanel';
import LogPanel, { LogEntry } from './components/LogPanel';
import StatusBar from './components/StatusBar';
import GuidePage, { parseGuideHash, type GuideId } from './components/GuidePage';
import EnglishGuide from './components/EnglishGuide';
import AgentPanel from './components/AgentPanel';
import EditionMenu from './components/EditionMenu';
import ScratchPlayer from './components/ScratchPlayer';
import { EN, t, sampleTitle, sampleDescription, localizeSample } from './i18n';
import {
  IconLogo, IconFolderOpen, IconDownload, IconWand, IconFilePlus,
  IconMoon, IconSun, IconCode, IconPuzzle, IconActivity, IconBranch,
  IconBraces, IconList, IconBook,
} from './components/Icons';

type TabId = 'diagnostics' | 'structure' | 'json' | 'log' | 'ai';
type EditorMode = 'code' | 'blocks';
type Theme = 'light' | 'dark';

let logSeq = 0;

export default function App() {
  const [text, setText] = useState<string>(localizeSample(SAMPLES[0].code));
  const [fileName, setFileName] = useState<string>('');
  const [originalSb3, setOriginalSb3] = useState<Uint8Array|null>(null);
  const [importNotes, setImportNotes] = useState<string[]>([]);
  const [assetStore, setAssetStore] = useState<AssetStore>(emptyAssetStore);
  const [analysis, setAnalysis] = useState<TextAnalysis | null>(null);
  const [analyzing, setAnalyzing] = useState(false);
  const [tab, setTab] = useState<TabId>('diagnostics');
  const [log, setLog] = useState<LogEntry[]>([]);
  const [dragging, setDragging] = useState(false);
  const [cursor, setCursor] = useState({ line: 1, col: 1 });
  const [busy, setBusy] = useState(false);
  const [guide, setGuide] = useState<GuideId | null>(() => parseGuideHash(window.location.hash));
  const [mode, setMode] = useState<EditorMode>('code');
  const [blocksOpened, setBlocksOpened] = useState(false);
  const [blockDirty, setBlockDirty] = useState(false);
  const [aiOpened, setAiOpened] = useState(false);
  const [theme, setTheme] = useState<Theme>(() => {
    try {
      const saved = localStorage.getItem('sp-theme');
      if (saved === 'dark' || saved === 'light') return saved;
    } catch { /* private mode etc. */ }
    return 'light';
  });
  const editorRef = useRef<EditorHandle>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const dragCount = useRef(0);

  useEffect(() => {
    const onHashChange = () => setGuide(parseGuideHash(window.location.hash));
    window.addEventListener('hashchange', onHashChange);
    return () => window.removeEventListener('hashchange', onHashChange);
  }, []);
  const openGuide = (id: GuideId) => { window.location.hash = `guide/${id}`; setGuide(id); };
  const closeGuide = () => {
    history.pushState(null, '', window.location.pathname + window.location.search);
    setGuide(null);
    requestAnimationFrame(() => window.dispatchEvent(new Event('resize')));
  };

  useEffect(() => { document.documentElement.lang = EN ? 'en' : 'ja'; document.title = EN ? 'ScratchPy Studio — Scratch and ScratchPy converter' : 'ScratchPy Studio — .sb3 ⇔ ScratchPy 相互変換'; }, []);

  // テーマ適用
  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    try { localStorage.setItem('sp-theme', theme); } catch { /* ignore */ }
  }, [theme]);

  const addLog = useCallback((kind: LogEntry['kind'], title: string, details?: string[]) => {
    setLog(prev => [{
      id: ++logSeq,
      time: new Date().toLocaleTimeString('ja-JP'),
      kind, title, details,
    }, ...prev].slice(0, 200));
  }, []);

  // ---- テキスト解析(デバウンス) ----
  useEffect(() => {
    setAnalyzing(true);
    const t = setTimeout(() => {
      try {
        setAnalysis(analyzeText(text));
      } catch (e) {
        setAnalysis(null);
      } finally {
        setAnalyzing(false);
      }
    }, 300);
    return () => clearTimeout(t);
  }, [text]);

  // ---- .sb3 読み込み ----
  const loadSb3Bytes = useCallback(async (bytes: Uint8Array, name: string) => {
    setBusy(true);
    try {
      const imp = sb3ToText(bytes);
      setText(imp.text);
      setAssetStore(imp.assetStore);
      setFileName(name);
      setOriginalSb3(bytes.slice());
      setImportNotes(imp.notes);
      const details: string[] = [];
      details.push(`${t('スプライト数', 'Sprites')}: ${imp.project.targets.length - 1} / ${t('ブロック数', 'Blocks')}: ${imp.project.targets.reduce((n, t) => n + Object.keys(t.blocks ?? {}).length, 0)}`);
      for (const n of imp.notes) details.push(n);
      const unsup = Object.entries(imp.unsupportedOpcodes);
      if (unsup.length) details.push(`${t('未対応 opcode', 'Unsupported opcodes')}: ${unsup.map(([o, c]) => `${o}×${c}`).join(', ')}`);
      addLog(imp.notes.length ? 'warn' : 'ok', EN ? `Loaded ${name} (.sb3 → ScratchPy)` : `「${name}」を読み込みました (.sb3 → ScratchPy)`, details);
      setTab(imp.notes.length ? 'log' : 'diagnostics');
    } catch (e) {
      const msg = e instanceof Sb3ParseError || e instanceof Error ? e.message : String(e);
      addLog('error', EN ? `Could not load ${name}` : `「${name}」の読み込みに失敗しました`, [msg]);
      setTab('log');
    } finally {
      setBusy(false);
    }
  }, [addLog]);

  const onOpenFile = useCallback(() => fileRef.current?.click(), []);

  const onFileChange = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    e.target.value = '';
    if (!f) return;
    await loadSb3Bytes(new Uint8Array(await f.arrayBuffer()), f.name);
  }, [loadSb3Bytes]);

  // ---- .sb3 書き出し ----
  const onDownload = useCallback(() => {
    if (blockDirty) { addLog('warn', t('未反映のブロック変更があります。先にコードに反映してください。','Apply your block changes before downloading.')); setTab('log'); return; }
    if (importNotes.length && !window.confirm(t('読み込んだ作品に変換時の警告があります。未対応ブロックや情報が書き出し時に失われる可能性があります。元の.sb3を残したうえで続けますか？','The imported project has conversion warnings. Unsupported blocks or data may be lost. Keep the original .sb3 and continue?'))) return;
    setBusy(true);
    try {
      const out = textToSb3(text, assetStore);
      const blob = new Blob([out.bytes as unknown as ArrayBuffer], { type: 'application/octet-stream' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      const base = fileName.replace(/\.sb3$/i, '') || 'project';
      a.href = url;
      a.download = `${base}.sb3`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 5000);
      const blockCount = out.project.targets.reduce((n, t) => n + Object.keys(t.blocks ?? {}).length, 0);
      addLog('ok', EN ? `Downloaded ${base}.sb3 (ScratchPy → .sb3)` : `「${base}.sb3」をダウンロードしました (ScratchPy → .sb3)`, [
        `${t('サイズ', 'Size')}: ${(out.bytes.length / 1024).toFixed(1)} KB / ${t('ブロック数', 'Blocks')}: ${blockCount}`,
        ...out.diagnostics.map(d => d.message),
        ...out.validation.filter(v => v.severity === 'warning').map(v => `[検証警告] ${v.path}: ${v.message}`),
      ]);
      setTab('log');
    } catch (e) {
      if (e instanceof ExportError) {
        addLog('error', t('.sb3 の生成に失敗しました(エラーを修正してください)', 'Could not create .sb3; fix the errors first.'), e.diagnostics.map(d => `${d.loc ? `${d.loc.line}行目: ` : ''}${d.message}`));
        setTab('log');
      } else {
        addLog('error', t('.sb3 の生成に失敗しました', 'Could not create .sb3'), [(e as Error).message]);
        setTab('log');
      }
    } finally {
      setBusy(false);
    }
  }, [text, assetStore, fileName, addLog, importNotes, blockDirty]);

  // ---- 整形 ----
  const onFormat = useCallback(() => {
    const out = formatText(text);
    if (out.diagnostics.some(d => d.severity === 'error')) {
      addLog('warn', t('整形できませんでした(構文エラーを先に修正してください)', 'Could not format. Fix syntax errors first.'));
      setTab('diagnostics');
      return;
    }
    setText(out.text);
    addLog('info', t('コードを整形しました', 'Code formatted.'));
  }, [text, addLog]);

  // ---- サンプル ----
  const onLoadSample = useCallback((id: string) => {
    const s = SAMPLES.find(x => x.id === id);
    if (!s) return;
    setText(localizeSample(s.code));
    setAssetStore(emptyAssetStore());
    setFileName('');
    setOriginalSb3(null);
    setImportNotes([]);
    addLog('info', EN ? `Loaded sample: ${sampleTitle[s.id] ?? s.title}` : `サンプル「${s.title}」を読み込みました`, [EN ? sampleDescription[s.id] ?? s.description : s.description]);
  }, [addLog]);

  const onNew = useCallback(() => {
    setText(EN ? 'stage:\n    pass\n\nsprite Cat:\n    costume costume1\n\n    on flag:\n        say("Hello!")\n' : 'stage:\n    pass\n\nsprite Cat:\n    costume costume1\n\n    on flag:\n        say("こんにちは!")\n');
    setAssetStore(emptyAssetStore());
    setFileName('');
    setOriginalSb3(null);
    setImportNotes([]);
  }, []);

  // ---- ドラッグ&ドロップ ----
  useEffect(() => {
    const onDragEnter = (e: DragEvent) => {
      if (!e.dataTransfer?.types.includes('Files')) return;
      dragCount.current++;
      setDragging(true);
    };
    const onDragLeave = () => {
      dragCount.current = Math.max(0, dragCount.current - 1);
      if (dragCount.current === 0) setDragging(false);
    };
    const onDragOver = (e: DragEvent) => { e.preventDefault(); };
    const onDrop = async (e: DragEvent) => {
      e.preventDefault();
      dragCount.current = 0;
      setDragging(false);
      const f = e.dataTransfer?.files?.[0];
      if (!f) return;
      if (!/\.sb3$/i.test(f.name)) {
        addLog('error', t('ドロップされたファイルは .sb3 ではありません', 'The dropped file is not an .sb3 file.'), [f.name]);
        return;
      }
      await loadSb3Bytes(new Uint8Array(await f.arrayBuffer()), f.name);
    };
    window.addEventListener('dragenter', onDragEnter);
    window.addEventListener('dragleave', onDragLeave);
    window.addEventListener('dragover', onDragOver);
    window.addEventListener('drop', onDrop);
    return () => {
      window.removeEventListener('dragenter', onDragEnter);
      window.removeEventListener('dragleave', onDragLeave);
      window.removeEventListener('dragover', onDragOver);
      window.removeEventListener('drop', onDrop);
    };
  }, [loadSb3Bytes, addLog]);

  const jumpToLine = useCallback((line: number) => {
    // ブロック表示中はクリックでコード表示に切り替えてからジャンプ
    setMode(m => {
      if (m === 'blocks') {
        requestAnimationFrame(() => requestAnimationFrame(() => editorRef.current?.jumpTo(line)));
        return 'code';
      }
      editorRef.current?.jumpTo(line);
      return m;
    });
  }, []);

  const errors = useMemo(() => analysis?.diagnostics.filter(d => d.severity === 'error') ?? [], [analysis]);
  const warnings = useMemo(() => analysis?.diagnostics.filter(d => d.severity === 'warning') ?? [], [analysis]);

  return (
    <div className="app">
      <div className="editor-shell" hidden={guide !== null}>
      {/* ツールバー */}
      <div className="toolbar">
        <div className="brand">
          <div className="logo"><IconLogo size={22} /></div>
          <div>
            ScratchPy Studio
            <small>{t('.sb3 ⇔ ScratchPy 相互変換', '.sb3 ⇔ ScratchPy converter')}</small>
          </div>
        </div>
        <button className="btn" onClick={onOpenFile} disabled={busy}><IconFolderOpen size={15} /> {t('.sb3 を開く', 'Open .sb3')}</button>
        <button className="btn primary" onClick={onDownload} disabled={busy || errors.length > 0}>
          <IconDownload size={15} /> {t('.sb3 をダウンロード', 'Download .sb3')}
        </button>
        <button className="btn" onClick={onFormat} disabled={busy}><IconWand size={15} /> {t('整形', 'Format')}</button>
        <button className="btn" onClick={onNew} disabled={busy}><IconFilePlus size={15} /> {t('新規', 'New')}</button>
        <div className="spacer" />
        <EditionMenu />
        <button className="btn guide-entry" onClick={() => openGuide('home')}><IconBook size={15} /> {t('使い方・説明', 'Guide')}</button>
        <select
          className="sample-select"
          value=""
          onChange={e => { if (e.target.value) onLoadSample(e.target.value); }}
          disabled={busy}
          title={t('サンプルプログラムを読み込む', 'Load a sample program')}
        >
          <option value="" disabled>{t('サンプル…', 'Samples…')}</option>
          {SAMPLES.map(s => (
            <option key={s.id} value={s.id}>{EN ? sampleTitle[s.id] ?? s.title : s.title}</option>
          ))}
        </select>
        <button
          className="btn icon"
          onClick={() => setTheme(t => (t === 'light' ? 'dark' : 'light'))}
          title={theme === 'light' ? t('ダークモードに切り替え', 'Switch to dark mode') : t('ライトモードに切り替え', 'Switch to light mode')}
          aria-label={theme === 'light' ? t('ダークモードに切り替え', 'Switch to dark mode') : t('ライトモードに切り替え', 'Switch to light mode')}
        >
          {theme === 'light' ? <IconMoon size={17} /> : <IconSun size={17} />}
        </button>
        <input ref={fileRef} type="file" accept=".sb3,application/octet-stream" style={{ display: 'none' }} onChange={onFileChange} />
      </div>

      {/* メイン */}
      <div className="main">
        <div className="editor-pane">
          <div className="panel" style={{ flex: 1 }}>
            <div className="panel-title">
              <div className="segmented">
                <button className={`seg ${mode === 'code' ? 'active' : ''}`} onClick={() => setMode('code')} title={t('テキストで編集', 'Edit text')}>
                  <IconCode size={14} /> {t('コード', 'Code')}
                </button>
                <button className={`seg ${mode === 'blocks' ? 'active' : ''}`} onClick={() => { setBlocksOpened(true); setMode('blocks'); }} title={t('Blockly ブロックで編集', 'Edit Blockly blocks')}>
                  <IconPuzzle size={14} /> {t('ブロック', 'Blocks')}
                </button>
              </div>
              {fileName && <span style={{ color: 'var(--accent2)', fontWeight: 600 }}>— {fileName}</span>}
              <div style={{ flex: 1 }} />
              {analyzing && <span className="pulse">{t('解析中…', 'Analyzing…')}</span>}
            </div>
            {mode === 'code' && (
              <Editor
                ref={editorRef}
                value={text}
                onChange={setText}
                onCursor={setCursor}
                dragging={dragging}
              />
            )}
            {blocksOpened && <div className="blocks-container" style={{ display: mode === 'blocks' ? 'flex' : 'none' }}>
              <BlocklyPanel text={text} dark={theme === 'dark'} active={mode === 'blocks'} onTextChange={setText} onDirtyChange={setBlockDirty} />
            </div>}
          </div>
        </div>

        <div className="side-pane">
          <ScratchPlayer text={text} assets={assetStore} blockDirty={blockDirty} original={originalSb3} hasConversionWarnings={importNotes.length>0}/>
          <div className="tabs">
            <button className={`tab ai-tab ${tab === 'ai' ? 'active' : ''}`} onClick={() => { setAiOpened(true); setTab('ai'); }}><IconWand size={14} /> {t('AIアシスタント','AI Assistant')}</button>
            <button className={`tab ${tab === 'diagnostics' ? 'active' : ''}`} onClick={() => setTab('diagnostics')}>
              <IconActivity size={14} /> {t('診断', 'Diagnostics')}
              {errors.length > 0 && <span className="badge">{errors.length}</span>}
              {errors.length === 0 && warnings.length > 0 && <span className="badge warn">{warnings.length}</span>}
            </button>
            <button className={`tab ${tab === 'structure' ? 'active' : ''}`} onClick={() => setTab('structure')}><IconBranch size={14} /> {t('構造', 'Structure')}</button>
            <button className={`tab ${tab === 'json' ? 'active' : ''}`} onClick={() => setTab('json')}><IconBraces size={14} /> JSON</button>
            <button className={`tab ${tab === 'log' ? 'active' : ''}`} onClick={() => setTab('log')}>
              <IconList size={14} /> {t('ログ', 'Log')}
              {log.length > 0 && <span className="badge" style={{ background: 'var(--muted)' }}>{log.length}</span>}
            </button>
          </div>
          <div className="panel tab-body">
            {aiOpened && <div className="ai-container" style={{display:tab==='ai'?'flex':'none'}}><AgentPanel text={text} assets={assetStore} blockDirty={blockDirty} onApply={(code,kind)=>{setText(code);setMode('code');addLog('info',kind==='apply'?t('AIの提案を適用しました。Scratchで動作を確認してください。','AI proposal applied. Verify the result in Scratch.'):t('AI適用前のコードに戻しました。','Restored code from before the AI change.'));}}/></div>}
            {tab === 'diagnostics' && (
              <DiagnosticsPanel analysis={analysis} onJump={jumpToLine} />
            )}
            {tab === 'structure' && (
              <StructurePanel analysis={analysis} />
            )}
            {tab === 'json' && (
              <JsonPanel analysis={analysis} />
            )}
            {tab === 'log' && (
              <LogPanel entries={log} onClear={() => setLog([])} />
            )}
          </div>
        </div>
      </div>

      <StatusBar analysis={analysis} cursor={cursor} fileName={fileName} assetStore={assetStore} errors={errors.length} warnings={warnings.length} />
      </div>
      {guide && (EN ? <EnglishGuide page={guide} dark={theme === 'dark'} onNavigate={openGuide} onClose={closeGuide} onToggleTheme={() => setTheme(t => t === 'light' ? 'dark' : 'light')} /> : <GuidePage page={guide} dark={theme === 'dark'} onNavigate={openGuide} onClose={closeGuide} onToggleTheme={() => setTheme(t => t === 'light' ? 'dark' : 'light')} />)}
    </div>
  );
}
