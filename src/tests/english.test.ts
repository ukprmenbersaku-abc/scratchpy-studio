import { describe, it, expect } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import EnglishGuide from '../app/components/EnglishGuide';
import { EN, localizeSample } from '../app/i18n';
import { SAMPLES } from '../core/samples';
import { analyzeText } from '../core/api';

const render = (page: 'home' | 'usage' | 'language' | 'format' | 'mapping' | 'architecture') => renderToStaticMarkup(createElement(EnglishGuide, {page, dark:false, onClose:()=>{}, onNavigate:()=>{}, onToggleTheme:()=>{}}));
describe('English edition', () => {
  it('has an English guide and all five sections', () => {
    expect(render('home')).toContain('Start with the basics');
    for (const page of ['usage','language','format','mapping','architecture'] as const) expect(render(page)).toContain('<article');
  });
  it('preserves sample validity in the selected language', () => {
    for (const sample of SAMPLES) {
      const result = analyzeText(localizeSample(sample.code));
      expect(result.diagnostics.filter(d=>d.severity === 'error')).toEqual([]);
    }
  });
  it('chooses the language from the server environment', () => {
    expect(EN).toBe(import.meta.env.VITE_APP_LANGUAGE === 'en');
    expect(localizeSample(SAMPLES[0].code)).toContain(EN ? 'Hello, ScratchPy!' : 'こんにちは、ScratchPy!');
  });
});
