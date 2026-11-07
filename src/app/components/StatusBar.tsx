import type { TextAnalysis, AssetStore } from '../../core/api';
import { IconFile } from './Icons';
import { EN, t } from '../i18n';

interface Props {
  analysis: TextAnalysis | null;
  cursor: { line: number; col: number };
  fileName: string;
  assetStore: AssetStore;
  errors: number;
  warnings: number;
}

export default function StatusBar({ analysis, cursor, fileName, assetStore, errors, warnings }: Props) {
  const s = analysis?.stats;
  const state = errors > 0 ? 'err' : warnings > 0 ? 'warn' : 'ok';
  const stateLabel = errors > 0 ? (EN ? `${errors} errors` : `${errors} 件のエラー`) : warnings > 0 ? (EN ? `${warnings} warnings` : `${warnings} 件の警告`) : t('問題なし', 'No issues');
  const assets = assetStore.costumes.size + assetStore.sounds.size;
  return (
    <div className="statusbar">
      <span>
        <span className={`dot ${state}`} />
        <b>{stateLabel}</b>
      </span>
      {s && (
        <span>
          {t('スプライト', 'Sprites')} <b>{s.sprites}</b> / {t('スクリプト', 'Scripts')} <b>{s.scripts}</b> / {t('変数', 'Variables')} <b>{s.vars}</b> / {t('リスト', 'Lists')} <b>{s.lists}</b> / {t('定義', 'Definitions')} <b>{s.defs}</b> / {t('ブロック', 'Blocks')} <b>{s.blocks}</b>
        </span>
      )}
      {assets > 0 && <span>{t('アセット', 'Assets')} <b>{assets}</b></span>}
      <div className="spacer" />
      {fileName && <span className="mono file-chip"><IconFile size={13} /> {fileName}</span>}
      <span className="mono">{t('行', 'Line')} {cursor.line}, {t('列', 'Col')} {cursor.col}</span>
    </div>
  );
}
