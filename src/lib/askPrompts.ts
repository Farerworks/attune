import { localDateStr } from './today';

// ── Prompt pools — verbatim, do not edit wording ───────────────────────────────

export const PERSON_EN: string[] = [
  'How will they react if I say…',
  'Will they say yes to…',
  'When should I bring it up?',
  'How do I smooth things over after a fight?',
  'How do I bring up something hard?',
  'How should I say sorry to them?',
  'What kind of gift would land with them?',
  'How do I say no without hurting them?',
  'Are they warming up to me?',
  'How do I keep the conversation going?',
];

export const PERSON_KO: string[] = [
  '이 말 하면 어떤 반응일까…',
  '이거 부탁하면 들어줄까…',
  '언제 꺼내는 게 좋을까?',
  '다투고 나서 어떻게 풀지?',
  '어려운 얘기, 어떻게 꺼내지?',
  '사과는 어떻게 하는 게 좋을까?',
  '어떤 선물이 통할까?',
  '상처 안 주고 거절하려면?',
  '요즘 나한테 마음이 열리고 있는 걸까?',
  '대화를 어떻게 이어가지?',
];

export const GENERAL_EN: string[] = [
  'What should I focus on this week?',
  'Is today good for a big ask?',
  'Why do I keep hesitating on this?',
  'How do I recharge today?',
  "What's my pattern in conflicts?",
];

export const GENERAL_KO: string[] = [
  '이번 주는 뭐에 집중하면 좋을까?',
  '오늘 큰 부탁 해도 괜찮은 날일까?',
  '왜 자꾸 망설이게 될까?',
  '오늘은 어떻게 충전하지?',
  '나는 갈등 상황에서 어떤 패턴일까?',
];

// Same DJB2 algorithm as today.ts's pickVariant — duplicated here (not exported
// there) since we need the raw hash for a rotation start index, not just a pick.
function djb2Hash(seed: string): number {
  let h = 5381;
  for (let i = 0; i < seed.length; i++) h = ((h << 5) + h + seed.charCodeAt(i)) >>> 0;
  return h;
}

/** person -> 4 prompts, general -> 3 prompts. Deterministic, consecutive wrap-around from a daily-rotating start index. */
export function getQuickPrompts(kind: 'person' | 'general', korean: boolean, date?: string): string[] {
  const dateStr = date ?? localDateStr();
  const pool = kind === 'person' ? (korean ? PERSON_KO : PERSON_EN) : (korean ? GENERAL_KO : GENERAL_EN);
  const count = kind === 'person' ? 4 : 3;
  const startIdx = djb2Hash(`${dateStr}|prompts|${kind}`) % pool.length;
  const result: string[] = [];
  for (let i = 0; i < count; i++) {
    result.push(pool[(startIdx + i) % pool.length]);
  }
  return result;
}
