import { describe, it, expect } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import DiagnosticsPanel from '../app/components/DiagnosticsPanel';
import StructurePanel from '../app/components/StructurePanel';
import { analyzeText } from '../core/api';
import { SAMPLES } from '../core/samples';

describe('パネル (SSR)', () => {
  it('DiagnosticsPanel がエラー一覧を描画', () => {
    const analysis = analyzeText('stage:\n    var a: int = "x"\n');
    const html = renderToStaticMarkup(
      createElement(DiagnosticsPanel, { analysis, onJump: () => { } }),
    );
    expect(html).toContain('diag');
    expect(html).toContain('初期値の型');
  });

  it('StructurePanel がツリーを描画', () => {
    const analysis = analyzeText(SAMPLES[0].code);
    const html = renderToStaticMarkup(
      createElement(StructurePanel, { analysis }),
    );
    expect(html).toContain('tree');
    expect(html).toContain('スプライト');
  });
});
