import { useMemo } from 'react';
import type { TextAnalysis } from '../../core/api';
import { IconAlertTriangle } from './Icons';
import { t } from '../i18n';

interface Props {
  analysis: TextAnalysis | null;
}

export default function JsonPanel({ analysis }: Props) {
  const json = useMemo(() => {
    if (!analysis?.project) return null;
    try {
      return JSON.stringify(analysis.project, null, 2);
    } catch {
      return null;
    }
  }, [analysis]);

  if (!json) {
    const hasErrors = analysis && analysis.diagnostics.some(d => d.severity === 'error');
    return (
      <div className="panel-body">
        <div className="empty-note">
          {hasErrors
            ? <><IconAlertTriangle size={16} style={{ color: 'var(--warn)' }} /> {t('エラーがあるため project.json は生成されません', 'project.json cannot be generated while errors remain.')}<br />{t('「診断」タブでエラーを修正してください', 'Fix errors in the Diagnostics tab.')}</>
            : <>{t('project.json のプレビューがここに表示されます', 'The project.json preview appears here.')}</>}
        </div>
      </div>
    );
  }
  return (
    <div className="panel-body">
      <pre className="json">{json}</pre>
    </div>
  );
}
