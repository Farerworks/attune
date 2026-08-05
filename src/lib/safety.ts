/**
 * Safety branch — routing state machine + static contact DB + copy constants.
 * Source of truth: SAFETY-SPEC.md (v1.1, 2026-08-05, 본부). This module is pure
 * logic/data only — no LLM calls, no UI. See BRIEF-095.
 *
 * Numbers, URLs, and copy strings below are transcribed verbatim from
 * SAFETY-SPEC.md §5/§7 — do not edit without a spec update + new BRIEF.
 */

// ── A. Static emergency contact DB (SAFETY-SPEC §7) ───────────────────────────

export type SafetyCountry = 'KR' | 'US';
export type SafetySituation = 'immediate' | 'suicide' | 'violence';
export type SafetyChannel = 'call' | 'text' | 'chat' | 'web';

export interface SafetyContact {
  country: SafetyCountry;
  situation: SafetySituation;
  channel: SafetyChannel;
  value: string;
  textCode?: string;
  labelKo: string;
  labelEn: string;
  hours: string;
  sourceUrl: string;
  verifiedAt: '2026-08-05';
}

const VERIFIED_AT = '2026-08-05';

export const SAFETY_CONTACTS: SafetyContact[] = [
  // ── KR ──────────────────────────────────────────────────────────────────
  {
    country: 'KR', situation: 'immediate', channel: 'call', value: '112',
    labelKo: '즉각 위험·범죄', labelEn: 'Immediate danger / crime in progress',
    hours: '24/7',
    // No individual source URL is given in SAFETY-SPEC §7 for this row — flagged in BRIEF-095 report.
    sourceUrl: '',
    verifiedAt: VERIFIED_AT,
  },
  {
    country: 'KR', situation: 'immediate', channel: 'call', value: '119',
    labelKo: '응급의료·자해 실행', labelEn: 'Medical emergency / self-harm in progress',
    hours: '24/7',
    sourceUrl: '',
    verifiedAt: VERIFIED_AT,
  },
  {
    country: 'KR', situation: 'suicide', channel: 'call', value: '109',
    labelKo: '자살·자해', labelEn: 'Suicide / self-harm',
    hours: '24/7 (2024년 1393 등 통합 — 구번호 미탑재)',
    sourceUrl: '',
    verifiedAt: VERIFIED_AT,
  },
  {
    country: 'KR', situation: 'violence', channel: 'call', value: '1366',
    labelKo: '관계폭력·데이트폭력·스토킹', labelEn: 'Relationship violence, dating violence, stalking',
    hours: '24/7',
    sourceUrl: '',
    verifiedAt: VERIFIED_AT,
  },
  {
    country: 'KR', situation: 'violence', channel: 'web', value: 'women1366.kr',
    labelKo: '관계폭력(채팅)', labelEn: 'Relationship violence (chat)',
    hours: '24시간',
    sourceUrl: 'https://women1366.kr',
    verifiedAt: VERIFIED_AT,
  },
  // ── US ──────────────────────────────────────────────────────────────────
  {
    country: 'US', situation: 'immediate', channel: 'call', value: '911',
    labelKo: '즉각 위험', labelEn: 'Immediate danger',
    hours: '24/7',
    sourceUrl: '',
    verifiedAt: VERIFIED_AT,
  },
  {
    country: 'US', situation: 'suicide', channel: 'call', value: '988',
    labelKo: '자살·자해·정신건강 위기', labelEn: 'Suicide, self-harm, mental health crisis',
    hours: '24/7',
    sourceUrl: '',
    verifiedAt: VERIFIED_AT,
  },
  {
    country: 'US', situation: 'suicide', channel: 'text', value: '988',
    labelKo: '자살·자해·정신건강 위기', labelEn: 'Suicide, self-harm, mental health crisis',
    hours: '24/7',
    sourceUrl: '',
    verifiedAt: VERIFIED_AT,
  },
  {
    country: 'US', situation: 'suicide', channel: 'web', value: '988lifeline.org',
    labelKo: '자살·자해·정신건강 위기', labelEn: 'Suicide, self-harm, mental health crisis',
    hours: '24/7',
    sourceUrl: 'https://988lifeline.org',
    verifiedAt: VERIFIED_AT,
  },
  {
    country: 'US', situation: 'violence', channel: 'call', value: '800-799-7233',
    labelKo: '관계폭력', labelEn: 'Relationship violence',
    hours: '24/7',
    sourceUrl: '',
    verifiedAt: VERIFIED_AT,
  },
  {
    country: 'US', situation: 'violence', channel: 'text', value: '88788', textCode: 'START',
    labelKo: '관계폭력', labelEn: 'Relationship violence',
    hours: '24/7',
    sourceUrl: '',
    verifiedAt: VERIFIED_AT,
  },
  {
    country: 'US', situation: 'violence', channel: 'web', value: 'thehotline.org',
    labelKo: '관계폭력', labelEn: 'Relationship violence',
    hours: '24/7',
    sourceUrl: 'https://thehotline.org',
    verifiedAt: VERIFIED_AT,
  },
  {
    country: 'US', situation: 'violence', channel: 'call', value: '866-331-9474',
    labelKo: '데이트폭력(청년)', labelEn: 'Dating violence (youth)',
    hours: '24/7',
    sourceUrl: '',
    verifiedAt: VERIFIED_AT,
  },
  {
    country: 'US', situation: 'violence', channel: 'text', value: '22522', textCode: 'LOVEIS',
    labelKo: '데이트폭력(청년)', labelEn: 'Dating violence (youth)',
    hours: '24/7',
    sourceUrl: '',
    verifiedAt: VERIFIED_AT,
  },
  {
    country: 'US', situation: 'violence', channel: 'web', value: 'loveisrespect.org',
    labelKo: '데이트폭력(청년)', labelEn: 'Dating violence (youth)',
    hours: '24/7',
    sourceUrl: 'https://loveisrespect.org',
    verifiedAt: VERIFIED_AT,
  },
];

/** Country not in the DB (v1 = KR/US only) -> empty array. Never guess. */
export function getSafetyContacts(country: string, situation: SafetySituation): SafetyContact[] {
  if (country !== 'KR' && country !== 'US') return [];
  return SAFETY_CONTACTS.filter(c => c.country === country && c.situation === situation);
}

// ── B. Trigger dictionary (conservative, v1 — SAFETY-SPEC §1.2, §4) ───────────
// Expanding this dictionary requires 본부 approval — do not add keywords ad hoc.

export type SafetyTriggerCategory = 'self' | 'other' | 'narrow';

const SELF_KEYWORDS = [
  '죽고 싶', '죽겠', '자해', '사라지고 싶', '끝내고 싶',
  'kill myself', 'want to die', 'hurt myself', 'end it all', 'suicide',
];

const OTHER_KEYWORDS = [
  '죽여버리', '죽이고 싶', '해쳐버리', '해치고 싶',
  'kill him', 'kill her', 'kill them', 'hurt them', 'make them pay',
];

const NARROW_KEYWORDS = [
  '미치겠', '미쳐버리', 'going crazy', 'losing my mind',
];

function normalizeSafetyText(text: string): string {
  return text.toLowerCase().replace(/\s+/g, ' ').trim();
}

/** Substring match on normalized (lowercased, whitespace-collapsed) text. Priority: self > other > narrow. */
export function detectSafetyTrigger(text: string): SafetyTriggerCategory | null {
  const normalized = normalizeSafetyText(text);
  if (SELF_KEYWORDS.some(k => normalized.includes(normalizeSafetyText(k)))) return 'self';
  if (OTHER_KEYWORDS.some(k => normalized.includes(normalizeSafetyText(k)))) return 'other';
  if (NARROW_KEYWORDS.some(k => normalized.includes(normalizeSafetyText(k)))) return 'narrow';
  return null;
}

export interface SafetyDetectionResult {
  trigger: SafetyTriggerCategory | null;
  /** True if the same trigger category appears 2+ times within the passed window. */
  repeated: boolean;
}

/**
 * v1: checks the LAST utterance in `texts` for a trigger. `texts` is expected to be
 * a window of the last 2-4 utterances (caller's responsibility to slice it) — the
 * window itself is only used here to detect repetition of the same category, not to
 * change what counts as a trigger match.
 */
export function detectWithContext(texts: string[]): SafetyDetectionResult {
  if (texts.length === 0) return { trigger: null, repeated: false };

  const last = texts[texts.length - 1];
  const trigger = detectSafetyTrigger(last);
  if (trigger === null) return { trigger: null, repeated: false };

  const sameCategoryCount = texts.filter(t => detectSafetyTrigger(t) === trigger).length;
  return { trigger, repeated: sameCategoryCount >= 2 };
}

// ── C. Routing state machine (pure functions — SAFETY-SPEC §2, BRIEF-095 §1-C) ─

export type SafetyState = 'S0' | 'S1_SELF' | 'S1_OTHER' | 'S1_NARROW' | 'S1_NO' | 'S2' | 'S3';

/** The 3 S1 sub-states each present a 4-choice confirmation screen. */
export type SafetyAwaitingAnswerState = 'S1_SELF' | 'S1_OTHER' | 'S1_NARROW';
export type SafetyChoiceIndex = 0 | 1 | 2 | 3;

export function enterSafetyState(trigger: SafetyTriggerCategory): SafetyAwaitingAnswerState {
  switch (trigger) {
    case 'self': return 'S1_SELF';
    case 'other': return 'S1_OTHER';
    case 'narrow': return 'S1_NARROW';
  }
}

// choiceIndex -> next state, per SAFETY-SPEC §2/§5 mapping (BRIEF-095 §1-C — literal, do not re-derive).
const ROUTING: Record<SafetyAwaitingAnswerState, Record<SafetyChoiceIndex, SafetyState>> = {
  // 0=관용 1=생각 있음 2=위험 가능 3=답하기 어려워요 ("답하기 어려워요"는 절대 'S1_NO'로 처리하지 않는다 -> S2)
  S1_SELF:   { 0: 'S1_NO', 1: 'S2', 2: 'S3', 3: 'S2' },
  S1_OTHER:  { 0: 'S1_NO', 1: 'S2', 2: 'S3', 3: 'S2' },
  // 0/1=S0 복귀(재진입 문장 경유, S1_NO) 2=자해 계열로 좁혀짐(5-1) 3=타해 계열로 좁혀짐(5-2)
  S1_NARROW: { 0: 'S1_NO', 1: 'S1_NO', 2: 'S1_SELF', 3: 'S1_OTHER' },
};

export function routeSafetyAnswer(state: SafetyAwaitingAnswerState, choiceIndex: SafetyChoiceIndex): SafetyState {
  return ROUTING[state][choiceIndex];
}

// ── D. Copy constants (verbatim from SAFETY-SPEC §5 / §5-EN — do not edit wording) ─

export const SAFETY_COPY_KO = {
  confirmSelf: {
    question: '안전을 위해 한 가지만 확인할게요. 지금 실제로 죽고 싶거나 자신을 해칠 생각이 있나요?',
    choices: [
      '아니요, 힘들다는 표현이었어요',
      '그런 생각이 조금 있어요',
      '지금 위험할 수 있어요',
      '답하기 어려워요',
    ] as const,
  },
  confirmOther: {
    question: '화가 많이 났다는 표현인지, 실제로 그 사람을 해칠 생각이나 계획이 있는지 확인해야 해요. 지금 실제로 해칠 생각이나 계획이 있나요?',
    choices: [
      '아니요, 화를 강조한 표현이에요',
      '생각은 들지만 계획은 없어요',
      '구체적인 계획이 있거나 곧 행동할 수 있어요',
      '답하기 어려워요',
    ] as const,
  },
  narrowDown: {
    question: "'미치겠다'고 느낄 만큼 힘든 상황인 것 같아요. 지금 가장 가까운 건 어느 쪽인가요?",
    choices: [
      '너무 답답하고 화가 나요',
      '불안해서 견디기 어려워요',
      '나를 해칠까 봐 걱정돼요',
      '다른 사람을 해칠까 봐 걱정돼요',
    ] as const,
  },
  reentry: '알려줘서 고마워요. 지금은 실제로 해칠 생각은 없고, 그만큼 답답하다는 뜻으로 이해했어요. 그럼 무엇이 가장 버거웠는지부터 볼게요.',
  imminenceSelf: '지금 곧 자신을 해칠 가능성이 있거나, 오늘 이미 자신을 해치기 위한 행동을 했나요?',
  imminenceOther: '지금 그 사람을 해칠 가능성이 있거나, 구체적으로 행동할 준비를 하고 있나요?',
  stopNotice: '이 이야기는 Attune이 다룰 수 있는 범위를 벗어나요. 관계 조언은 여기서 멈출게요. 지금 도움이 될 수 있는 곳을 알려드릴게요.',
} as const;

export const SAFETY_COPY_EN = {
  confirmSelf: {
    question: 'I want to check one thing to keep you safe. Are you actually having thoughts of wanting to die or hurting yourself right now?',
    choices: [
      "No — I meant I'm having a hard time",
      "I've been having some thoughts like that",
      'I might be in danger right now',
      "It's hard to answer",
    ] as const,
  },
  confirmOther: {
    question: "I need to check whether that was venting, or whether you're actually thinking about hurting them. Do you have any actual thought or plan of hurting them right now?",
    choices: [
      'No — I was venting',
      'Thoughts, but no plan',
      'I have a concrete plan or might act soon',
      "It's hard to answer",
    ] as const,
  },
  narrowDown: {
    question: 'It sounds like things feel overwhelming right now. Which is closest?',
    choices: [
      "I'm frustrated and angry",
      "I'm anxious and it's hard to bear",
      "I'm worried I might hurt myself",
      "I'm worried I might hurt someone",
    ] as const,
  },
  reentry: "Thank you for telling me. I understand you're not actually thinking of harm — it's how heavy this feels. Let's start with what's been weighing on you most.",
  imminenceSelf: 'Is there a chance you might hurt yourself very soon, or have you already done something today to hurt yourself?',
  imminenceOther: 'Is there a chance you might hurt them soon, or are you preparing to act on it?',
  stopNotice: "This is beyond what Attune can help with. I'll pause the relationship advice here. Here's where you can get real support right now.",
} as const;
