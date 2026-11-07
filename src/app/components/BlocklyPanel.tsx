import { useEffect, useRef, useState } from 'react';
import * as Blockly from 'blockly';
import { parseCollect } from '../../core/lang/parser';
import { check } from '../../core/lang/typechecker';
import { printProgram } from '../../core/lang/printer';
import { registerScratchPyBlocks, makeTheme, makeToolbox } from '../blockly/defs';
import { astToWorkspace, workspaceToAst, currentUserCallTypes } from '../blockly/bridge';
import { EN, t } from '../i18n';
import { IconZoomIn, IconZoomOut, IconZoomFit, IconRefresh, IconAlertTriangle, IconCheckCircle } from './Icons';

registerScratchPyBlocks();

interface Props {
  text: string;
  dark: boolean;
  active: boolean;
  onTextChange: (text: string) => void;
  onDirtyChange?: (dirty: boolean) => void;
  education?: boolean;
  readOnly?: boolean;
}

export function BlocklyPanel({ text, dark, active, onTextChange, onDirtyChange, education = false, readOnly = false }: Props) {
  const hostRef = useRef<HTMLDivElement>(null);
  const wsRef = useRef<Blockly.WorkspaceSvg | null>(null);
  const baseRef = useRef('');
  const dirtyRef = useRef(false);
  const safeRef = useRef(false);
  const [dirty, setDirty] = useState(false);
  const [safe, setSafe] = useState(false);
  const [message, setMessage] = useState('');
  const [conflict, setConflict] = useState(false);
  useEffect(() => { onDirtyChange?.(dirty); }, [dirty, onDirtyChange]);

  const load = (source: string, ws: Blockly.WorkspaceSvg) => {
    safeRef.current = false;
    setSafe(false);
    setMessage('');
    const parsed = parseCollect(source);
    if (!parsed.program || parsed.diagnostics.some(d => d.severity === 'error')) {
      setMessage(t('構文エラーがあるためブロックを読み込めません。コードを修正してから再読み込みしてください。', 'Cannot load blocks while the code has syntax errors. Fix them and reload.'));
      return;
    }
    try {
      Blockly.Events.disable();
      ws.clear();
      const cr = check(parsed.program);
      astToWorkspace(ws, parsed.program, cr.resolutions);
      const roundTrip = printProgram(workspaceToAst(ws));
      if (roundTrip !== printProgram(parsed.program)) {
        setMessage(t('このコードにはブロック編集で完全に保持できない構文があります。元のコードを保護するため、反映は無効です。', 'This code cannot be represented faithfully as blocks. Applying changes is disabled to protect the source.'));
      } else {
        safeRef.current = true;
        setSafe(true);
      }
      baseRef.current = source;
      dirtyRef.current = false;
      setDirty(false);
      setConflict(false);
      requestAnimationFrame(() => { Blockly.svgResize(ws); });
    } catch (ex) {
      setMessage(EN ? `Could not load blocks; the source was not changed. Details: ${(ex as Error).message}` : `ブロックを読み込めません: ${(ex as Error).message}。元のコードは変更されていません。`);
    } finally {
      Blockly.Events.enable();
    }
  };

  useEffect(() => {
    if (!hostRef.current) return;
    const ws = Blockly.inject(hostRef.current, {
      toolbox: readOnly ? undefined : makeToolbox(), readOnly, renderer: 'zelos', theme: makeTheme(false),
      grid: { spacing: 24, length: 2, colour: '#dfe3ef', snap: false },
      zoom: { controls: false, wheel: true, startScale: 0.85, minScale: 0.3, maxScale: 2, pinch: true },
      trashcan: !readOnly, sounds: false, move: { scrollbars: true, drag: true, wheel: false },
    });
    wsRef.current = ws;
    baseRef.current = '';
    dirtyRef.current = false;
    safeRef.current = false;
    ws.registerToolboxCategoryCallback('SP_USER', () => [
      { kind: 'block', type: 'sp_def' },
      ...currentUserCallTypes().map(type => ({ kind: 'block' as const, type })),
    ]);
    const listener = (e: Blockly.Events.Abstract) => {
      if (e.isUiEvent || !safeRef.current) return;
      dirtyRef.current = true;
      setDirty(true);
    };
    ws.addChangeListener(listener);
    const ro = new ResizeObserver(() => { if (wsRef.current) Blockly.svgResize(ws); });
    ro.observe(hostRef.current);
    return () => { ro.disconnect(); ws.removeChangeListener(listener); ws.dispose(); wsRef.current = null; };
  }, []);

  useEffect(() => { wsRef.current?.setTheme(makeTheme(dark)); }, [dark]);
  useEffect(() => {
    const ws = wsRef.current;
    if (!ws || !active) return;
    Blockly.svgResize(ws);
    if (text === baseRef.current) return;
    if (dirtyRef.current) {
      setConflict(true);
      setMessage(t('コードが別途変更されました。ブロックの内容を破棄する場合は「再読み込み」を押してください。', 'The code changed separately. Use Reload to discard your uncommitted block edits.'));
      return;
    }
    load(text, ws);
  }, [text, active]);

  const reload = () => {
    if (dirtyRef.current && !window.confirm(t('未反映のブロック編集を破棄してコードから再読み込みしますか？', 'Discard uncommitted block edits and reload from code?'))) return;
    if (wsRef.current) load(text, wsRef.current);
  };
  const apply = () => {
    const ws = wsRef.current;
    if (!ws || !safeRef.current || conflict || text !== baseRef.current) return;
    try {
      const top = ws.getTopBlocks(false);
      const loose = top.filter(b => !['sp_stage', 'sp_sprite', 'sp_comment'].includes(b.type));
      if (loose.length) {
        setMessage(t('未接続のブロックがあります。ステージまたはスプライト内につなぐか、削除してから反映してください。', 'Connect or delete the loose blocks before applying.'));
        return;
      }
      if (top.filter(b => b.type === 'sp_stage').length > 1) {
        setMessage(t('ステージは1つだけにしてください。', 'Only one stage is allowed.'));
        return;
      }
      const out = printProgram(workspaceToAst(ws));
      const parsed = parseCollect(out);
      if (!parsed.program || parsed.diagnostics.some(d => d.severity === 'error')) {
        setMessage(t('ブロックから有効なコードを生成できません。入力内容や接続を確認してください。', 'Could not generate valid code. Check block inputs and connections.'));
        return;
      }
      baseRef.current = out;
      dirtyRef.current = false;
      setDirty(false);
      setMessage(education ? t('ブロックの変更をコードに反映したよ。右のコードを見てみよう！', 'Block changes applied. Take a look at the code!') : t('ブロックの変更をコードに反映しました。診断タブで型を確認できます。', 'Changes applied to code. Check the Diagnostics tab for type errors.'));
      onTextChange(out);
    } catch (ex) {
      setMessage(EN ? `Could not apply changes. Details: ${(ex as Error).message}` : `反映できません: ${(ex as Error).message}`);
    }
  };

  return (
    <div className="blockly-host" data-theme={dark ? 'dark' : 'light'}>
      <div className="blockly-toolbar">
        <button className="btn btn-ghost btn-sm" aria-label={t('拡大', 'Zoom in')} title={t('拡大', 'Zoom in')} onClick={() => wsRef.current?.zoomCenter(1)}><IconZoomIn size={15} /></button>
        <button className="btn btn-ghost btn-sm" aria-label={t('縮小', 'Zoom out')} title={t('縮小', 'Zoom out')} onClick={() => wsRef.current?.zoomCenter(-1)}><IconZoomOut size={15} /></button>
        <button className="btn btn-ghost btn-sm" aria-label={t('全体を表示', 'Zoom to fit')} title={t('全体を表示', 'Zoom to fit')} onClick={() => wsRef.current?.zoomToFit()}><IconZoomFit size={15} /></button>
        {!readOnly && <button className="btn btn-ghost btn-sm" title={t('コードから再読み込み', 'Reload from code')} onClick={reload}><IconRefresh size={15} /> {t('再読み込み', 'Reload')}</button>}
        {!readOnly && <span className="blockly-hint">{dirty ? t('未反映の変更があります', 'You have uncommitted changes') : t('ドラッグしてブロックをつなごう', 'Drag and connect blocks')}</span>}
        {!readOnly && <button className="btn primary btn-sm" onClick={apply} disabled={!safe || conflict || !dirty}><IconCheckCircle size={15} /> {t('コードに反映', 'Apply to code')}</button>}
      </div>
      {message && <div className="blockly-message" role="status"><IconAlertTriangle size={15} /><span>{message}</span></div>}
      <div className="blockly-canvas" ref={hostRef} />
    </div>
  );
}
