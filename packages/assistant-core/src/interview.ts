import type { Preferences } from './types';

/**
 * The interview: what the assistant must know before it plans. Questions are
 * stable ids so persisted answers survive across sessions, and the missing
 * set is computed deterministically, never guessed by the model.
 */
export interface InterviewQuestion {
  id: string;
  question: string;
}

export const INTERVIEW_QUESTIONS: readonly InterviewQuestion[] = [
  {
    id: 'busy-nights',
    question: 'Which nights are busy this week, where nobody has time to cook?',
  },
  {
    id: 'anchor-meal',
    question: 'Any fixed meals this week, like a taco night, and which night?',
  },
  {
    id: 'mood',
    question: 'Anything the family is in the mood for, or tired of, this week?',
  },
];

export function missingInterviewAnswers(preferences: Preferences): InterviewQuestion[] {
  return INTERVIEW_QUESTIONS.filter((question) => {
    const answer = preferences.answers[question.id];
    return answer === undefined || answer.trim() === '';
  });
}
