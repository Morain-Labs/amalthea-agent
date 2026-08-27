import { describe, expect, it } from 'vitest';
import { buildSystemInstruction } from './instruction';
import { INTERVIEW_QUESTIONS, missingInterviewAnswers } from './interview';
import type { Household } from './types';

const household: Household = {
  id: 'h-reyes',
  name: 'Reyes family',
  weeklyBudget: 120,
  members: [
    { id: 'm-dana', name: 'Dana', allergens: [] },
    { id: 'm-ellis', name: 'Ellis', age: 9, allergens: ['peanut'] },
  ],
};

describe('missingInterviewAnswers', () => {
  it('reports every question missing on a fresh household', () => {
    expect(missingInterviewAnswers({ answers: {} })).toHaveLength(INTERVIEW_QUESTIONS.length);
  });

  it('treats blank answers as missing', () => {
    const missing = missingInterviewAnswers({ answers: { 'busy-nights': '   ' } });
    expect(missing.map((question) => question.id)).toContain('busy-nights');
  });

  it('drops answered questions', () => {
    const missing = missingInterviewAnswers({
      answers: { 'busy-nights': 'thursday', 'anchor-meal': 'tacos on tuesday', mood: 'soup' },
    });
    expect(missing).toHaveLength(0);
  });
});

describe('buildSystemInstruction', () => {
  it('demands the interview before planning while questions are missing', () => {
    const instruction = buildSystemInstruction({
      household,
      preferences: { answers: {} },
      adjustments: [],
    });
    expect(instruction).toContain('INTERVIEW FIRST');
    expect(instruction).toContain('busy-nights');
    expect(instruction).toContain('set_preferences');
  });

  it('releases planning once the interview is complete', () => {
    const instruction = buildSystemInstruction({
      household,
      preferences: {
        answers: { 'busy-nights': 'none', 'anchor-meal': 'taco tuesday', mood: 'anything' },
      },
      adjustments: [],
    });
    expect(instruction).not.toContain('INTERVIEW FIRST');
    expect(instruction).toContain('interview is complete');
  });

  it('names the allergen line and keeps it assistive', () => {
    const instruction = buildSystemInstruction({
      household,
      preferences: { answers: {} },
      adjustments: [],
    });
    expect(instruction).toContain('peanut');
    expect(instruction).toMatch(/assistive filter/);
    expect(instruction).toMatch(/no health claims/);
  });

  it('carries recent saved adjustments into the context', () => {
    const instruction = buildSystemInstruction({
      household,
      preferences: { answers: {} },
      adjustments: [
        { id: 'a1', note: 'half the chili powder for June', createdAt: '2026-08-26' },
      ],
    });
    expect(instruction).toContain('half the chili powder for June');
  });
});
