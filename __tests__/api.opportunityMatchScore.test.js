/**
 * @jest-environment node
 */

const {
  extractJson,
  simulateGrade,
  populationScore,
  gradeUpliftScore,
  overallScore,
  buildDimensions,
} = require('../api/services/opportunityMatchScore');
const { SCORE_WEIGHTS } = require('../api/constants/opportunityMatch');
const { buildJsonContext } = require('../api/services/jsonContext');

describe('opportunityMatchScore', () => {
  it('extracts JSON from fenced or raw text', () => {
    expect(extractJson('```json\n{"counties":[]}\n```')).toEqual({ counties: [] });
    expect(extractJson('Here you go:\n{"ok":true}')).toEqual({ ok: true });
    expect(extractJson({ counties: [{ countyId: '1' }] })).toEqual({
      counties: [{ countyId: '1' }],
    });
    expect(
      extractJson({
        result: { counties: [{ countyId: '1' }] },
        response_format: 'json',
      })
    ).toEqual({ counties: [{ countyId: '1' }] });
  });

  it('rejects empty or non-JSON analysis text', () => {
    expect(() => extractJson('')).toThrow(/empty/i);
    expect(() => extractJson('no json here')).toThrow(/did not contain JSON/i);
  });

  it('simulates grade uplift when closing a gap', () => {
    const items = [
      { questionId: 'a', type: 'score', area: 'MC', maxPoints: 2, weight: 1 },
      { questionId: 'b', type: 'score', area: 'MC', maxPoints: 2, weight: 1 },
    ];
    const answers = [
      { questionId: 'a', value: 0 },
      { questionId: 'b', value: 2 },
    ];
    const { before, after } = simulateGrade(items, answers, [{ questionId: 'a', proposedScore: 2 }]);
    expect(before.percent).toBe(50);
    expect(before.letter).toBe('C');
    expect(after.percent).toBe(100);
    expect(after.letter).toBe('A');
  });

  it('builds a 0-100 overall score from weighted dimensions', () => {
    expect(populationScore(100000)).toBeGreaterThan(populationScore(1000));
    expect(gradeUpliftScore(40, 80)).toBe(10);
    const dims = buildDimensions({
      gradeBefore: { letter: 'C', percent: 40 },
      gradeAfter: { letter: 'A', percent: 80 },
      matchedEntries: [{ technicalPriority: 8, governmentPriority: 7 }],
      population: 500000,
      gdp: 100,
      maxGdp: 100,
      risk: { hidroRisk: 8, disasterRate: 8, endangeredPeople: 2000 },
      aiDimensions: {
        biome: { score: 9, note: 'Amazon' },
        region: { score: 8, note: 'North' },
        riskReduction: { score: 9, note: 'Flood' },
      },
    });
    const overall = overallScore(dims);
    expect(overall).toBeGreaterThan(50);
    expect(overall).toBeLessThanOrEqual(100);
    expect(Object.values(SCORE_WEIGHTS).reduce((sum, n) => sum + n, 0)).toBe(100);
  });
});

describe('jsonContext', () => {
  it('builds a pretty-printed JSON buffer', () => {
    const buf = buildJsonContext({ hello: 'world' });
    expect(Buffer.isBuffer(buf)).toBe(true);
    expect(JSON.parse(buf.toString('utf8'))).toEqual({ hello: 'world' });
  });
});
