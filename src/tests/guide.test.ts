import { describe, it, expect } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import GuidePage, { GUIDE_DOCS, parseGuideHash, type GuideId } from '../app/components/GuidePage';

const render = (page: GuideId) => renderToStaticMarkup(createElement(GuidePage, {
  page, dark: false, onNavigate: () => {}, onClose: () => {}, onToggleTheme: () => {},
}));

describe('説明ページ', () => {
  it('トップページに使い方と全資料への入口がある', () => {
    const html = render('home');
    expect(html).toContain('使い方から読んでみる');
    for (const doc of GUIDE_DOCS) expect(html).toContain(doc.title);
  });
  it('Markdown の見出し・表・リンクを表示する', () => {
    const html = render('usage');
    expect(html).toContain('ScratchPy Studio 使い方ガイド');
    expect(html).toContain('<table>');
    expect(html).toContain('コードに反映');
    expect(html).toContain('id="3-クイックスタート3-分"');
  });
  for (const doc of GUIDE_DOCS) {
    it(`${doc.title} の本文を表示`, () => {
      expect(render(doc.id)).toContain('<article');
      expect(doc.content.length).toBeGreaterThan(1000);
    });
  }
  it('URL のガイド位置を解決する', () => {
    expect(parseGuideHash('#guide/usage')).toBe('usage');
    expect(parseGuideHash('#guide')).toBe('home');
    expect(parseGuideHash('#guide/unknown')).toBe('home');
    expect(parseGuideHash('')).toBeNull();
  });
});
