import { computeSurveyScore, formatAreaScore, formatScore, letterGrade } from '@/lib/surveyScore';

describe('computeSurveyScore', () => {
  it('matches the instrument service formula for scored items', () => {
    const score = computeSurveyScore(
      [{ questionId: 'q1', type: 'score', maxPoints: 2, weight: 1, area: 'GT' }],
      [{ questionId: 'q1', value: 2 }]
    );
    expect(score.letter).toBe('A');
    expect(score.total).toBe(2);
    expect(score.maxTotal).toBe(2);
    expect(score.percent).toBe(100);
    expect(score.byArea?.GT).toEqual({ total: 2, maxTotal: 2 });
  });

  it('excludes non-scored questions from area totals', () => {
    const score = computeSurveyScore(
      [
        { questionId: 'q1', type: 'score', maxPoints: 2, weight: 1, area: 'GT' },
        { questionId: 'q2', type: 'yes_no', area: 'GT' },
        { questionId: 'q3', type: 'text', area: 'GT' },
      ],
      [
        { questionId: 'q1', value: 1 },
        { questionId: 'q2', value: 'Yes' },
        { questionId: 'q3', value: 'hello' },
      ]
    );
    expect(score.total).toBe(1);
    expect(score.maxTotal).toBe(2);
    expect(score.percent).toBe(50);
    expect(score.letter).toBe('C');
    expect(score.byArea?.GT).toEqual({ total: 1, maxTotal: 2 });
  });

  it('applies weight to earned points and cap', () => {
    const score = computeSurveyScore(
      [{ questionId: 'q1', type: 'score', maxPoints: 2, weight: 3, area: 'GT' }],
      [{ questionId: 'q1', value: 2 }]
    );
    expect(score.total).toBe(6);
    expect(score.maxTotal).toBe(6);
  });
});

describe('formatScore', () => {
  it('matches the view/compare display', () => {
    expect(formatScore({ letter: 'A', percent: 100, total: 2, maxTotal: 2 })).toBe('A · 100% · 2/2');
    expect(formatScore(undefined)).toBe('—');
    expect(formatAreaScore({ letter: '', percent: 0, total: 0, maxTotal: 0 })).toBe('—');
  });

  it('uses the same letter thresholds as the API', () => {
    expect(letterGrade(80)).toBe('A');
    expect(letterGrade(60)).toBe('B');
    expect(letterGrade(40)).toBe('C');
    expect(letterGrade(20)).toBe('D');
    expect(letterGrade(19.9)).toBe('E');
  });
});
