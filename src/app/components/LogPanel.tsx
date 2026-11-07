import { EN, t } from '../i18n';

export interface LogEntry {
  id: number;
  time: string;
  kind: 'ok' | 'info' | 'warn' | 'error';
  title: string;
  details?: string[];
}

interface Props {
  entries: LogEntry[];
  onClear(): void;
}

const TAG_LABEL: Record<LogEntry['kind'], string> = {
  ok: t('完了','Done'),
  info: t('情報','Info'),
  warn: t('注意','Warning'),
  error: t('エラー','Error'),
};

export default function LogPanel({ entries, onClear }: Props) {
  return (
    <div className="panel-body">
      {entries.length > 0 && (
        <div style={{ padding: '8px 10px 0', textAlign: 'right' }}>
          <button className="btn" style={{ padding: '3px 10px', fontSize: 12 }} onClick={onClear}>{t('ログをクリア', 'Clear log')}</button>
        </div>
      )}
      {entries.length === 0 ? (
        <div className="empty-note">
          {t('変換・読み込みの履歴がここに表示されます', 'Import and export history appears here.')}<br />
          {t('.sb3 を開く / ダウンロードすると記録されます', 'Open or download an .sb3 file to see activity.')}
        </div>
      ) : (
        <div className="log-list">
          {EN && <p className="english-note">Detailed conversion notes may appear in Japanese.</p>}
          {entries.map(e => (
            <div key={e.id} className="log-entry">
              <div className="head">
                <span className={`tag tag-${e.kind}`}>{TAG_LABEL[e.kind]}</span>
                <span>{e.time}</span>
              </div>
              <div style={{ fontWeight: 600 }}>{e.title}</div>
              {e.details && e.details.length > 0 && (
                <ul style={{ margin: '4px 0 0', paddingLeft: 18, color: 'var(--muted)' }}>
                  {e.details.map((d, i) => <li key={i}>{d}</li>)}
                </ul>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
