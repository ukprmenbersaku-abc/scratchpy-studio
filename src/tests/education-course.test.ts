import {describe,it,expect} from 'vitest';
import {LESSONS,EN_LESSONS,checkLesson} from '../education/lessons';
import {LECTURES} from '../education/lectures';
import {PYTHON_STEPS} from '../education/pythonSteps';
import {analyzeText} from '../core/api';

describe('14-lesson course',()=>{
 it('preserves original IDs and has a complete bilingual lecture for every lesson',()=>{
  expect(LESSONS).toHaveLength(14);expect(EN_LESSONS.map(l=>l.id)).toEqual(LESSONS.map(l=>l.id));
  expect(LESSONS.slice(0,6).map(l=>l.id)).toEqual(['hello','move','repeat','variable','condition','custom']);
  expect(new Set(LESSONS.map(l=>l.id)).size).toBe(14);
  for(const lesson of LESSONS){for(const lang of ['ja','en'] as const){const lecture=LECTURES[lesson.id][lang];expect(lecture.intro).toBeTruthy();expect(lecture.points).toHaveLength(3);expect(lecture.scratchpy).toBeTruthy();expect(lecture.python).toBeTruthy();expect(lecture.bridge).toBeTruthy();expect(lecture.question).toBeTruthy();}}
 });
 it('has bilingual Python reasoning questions with valid answer positions for the advanced half',()=>{
  for(const lesson of LESSONS.slice(6)){const step=PYTHON_STEPS[lesson.id];expect(step).toBeDefined();for(const lang of ['ja','en'] as const){const q=step![lang];expect(q.options.length).toBeGreaterThan(1);expect(q.answer).toBeGreaterThanOrEqual(0);expect(q.answer).toBeLessThan(q.options.length);expect(q.code).toBeTruthy();expect(q.explanation).toBeTruthy();}}
 });
 it('does not pass the final project without every required stage',()=>{
  const l=LESSONS[13];const base=l.starter.replace('repeat 2:','repeat 3:').replace('score += 1','score += 2');
  expect(checkLesson(l,base).ok).toBe(true);
  for(const wrong of [base.replace('score = 0','score = 2'),base.replace('repeat 3:','repeat 2:'),base.replace('score += 2','score += 1'),base.replace('score >= 6','score >= 7'),base.replace('say("TRY")','pass')]){
    expect(analyzeText(wrong).diagnostics.filter(d=>d.severity==='error')).toEqual([]);
    expect(checkLesson(l,wrong).ok).toBe(false);
  }
 });
});
