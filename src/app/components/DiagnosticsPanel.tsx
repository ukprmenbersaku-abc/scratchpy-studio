import { EN, t } from '../i18n';
import type { TextAnalysis } from '../../core/api';
import { IconCheckCircle, IconXCircle, IconAlertTriangle, IconInfo } from './Icons';

interface Props {
  analysis: TextAnalysis | null;
  onJump(line: number): void;
}

export default function DiagnosticsPanel({ analysis, onJump }: Props) {
  if (!analysis) {
    return <div className="panel-body"><div className="empty-note">{t('解析結果がありません', 'No analysis available.')}</div></div>;
  }
  const diags = analysis.diagnostics;
  if (diags.length === 0) {
    return (
      <div className="panel-body">
        <div className="ok-note">
          <IconCheckCircle size={20} style={{ color: 'var(--ok)' }} /> {t('エラー・警告はありません', 'No errors or warnings')}<br />
          <span style={{ fontWeight: 400, color: 'var(--muted)' }}>
            {t('このコードは .sb3 として書き出せます', 'This code is ready to export as .sb3.')}
          </span>
        </div>
      </div>
    );
  }
  return (
    <div className="panel-body">
      {EN && <p className="english-note">Detailed diagnostics are currently provided in Japanese.</p>}
      <div className="diag-list">
        {diags.map((d, i) => (
          <div
            key={i}
            className={`diag ${d.severity}`}
            onClick={() => d.loc && onJump(d.loc.line)}
            title={t('クリックで該当行へ移動', 'Click to jump to this line')}
          >
            <div className="icon">
              {d.severity === 'error' ? <IconXCircle size={14} />
                : d.severity === 'warning' ? <IconAlertTriangle size={14} />
                : <IconInfo size={14} />}
            </div>
            <div className="msg">{d.message}</div>
            {d.loc && <div className="pos">{d.loc.line}:{d.loc.col}</div>}
          </div>
        ))}
      </div>
    </div>
  );
}
