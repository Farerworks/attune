import type { Element, TenStem } from './saju';
import { getDailyPillars } from './saju';
import { DAY_NOTE_LOCALE } from './interpretGuide';

export type TodayTone = 'good' | 'soft' | 'neutral';

export interface TodayNote {
  tone: TodayTone;
  line: string;
  todayElement: Element;
  branch: string; // 오늘 일진의 지지 (DAY_NOTE_LOCALE 키와 동일)
  stem: TenStem; // 오늘 일진의 천간
}

// Mirrors interpretGuide.ts tables — do not modify saju logic here
const NURTURES: Record<Element, Element> = {
  wood: 'fire', fire: 'earth', earth: 'metal', metal: 'water', water: 'wood',
};

const CONTROLS: Record<Element, Element> = {
  wood: 'earth', earth: 'water', water: 'fire', fire: 'metal', metal: 'wood',
};

export type Relation =
  | 'same'
  | 'today_nurtures'    // t → person (person is receptive)
  | 'person_nurtures'   // person → t (person gives out, energy runs low)
  | 'today_controls'    // t controls person (person feels pressed)
  | 'person_controls';  // person controls t (person steers)

export function getRelation(t: Element, p: Element): Relation {
  if (t === p)             return 'same';
  if (NURTURES[t] === p)  return 'today_nurtures';
  if (NURTURES[p] === t)  return 'person_nurtures';
  if (CONTROLS[t] === p)  return 'today_controls';
  return 'person_controls';
}

// Deterministic variant picker — same seed always yields same variant, no Math.random
export function pickVariant(pool: string[], seed: string): string {
  let h = 5381;
  for (let i = 0; i < seed.length; i++) h = ((h << 5) + h + seed.charCodeAt(i)) >>> 0;
  return pool[h % pool.length];
}

export const TONE: Record<Relation, TodayTone> = {
  same:            'good',
  today_nurtures:  'good',
  person_nurtures: 'soft',
  today_controls:  'soft',
  person_controls: 'neutral',
};

// Fallback when no name is available — matches original single-line copy
export const THEM_NONAME: Record<Relation, string> = {
  same:            'Same wavelength today. Reach out.',
  today_nurtures:  "They're receptive today. Good day to reach out.",
  person_nurtures: 'Their energy runs low today. Be patient.',
  today_controls:  'They may feel pressed today. Keep it light.',
  person_controls: "They're steering today. Let them lead.",
};

// 3-variant pools for named people — {name} is replaced at call time
export const THEM_NAMED: Record<Relation, string[]> = {
  same: [
    'Same wavelength today. Reach out.',
    '{name} gets it today. Say the thing.',
    'You two are tuned to the same station today.',
  ],
  today_nurtures: [
    "{name}'s receptive today. Good day to reach out.",
    'Doors are open with {name} today.',
    'Today softens {name}. Lead with warmth.',
  ],
  person_nurtures: [
    "{name}'s energy runs low today. Be patient.",
    "{name}'s pouring out today. Bring, don't ask.",
    "Go gentle — {name}'s running on reserve today.",
  ],
  today_controls: [
    '{name} may feel pressed today. Keep it light.',
    'Heavy air around {name} today. No big asks.',
    'Today leans on {name}. Be the easy part.',
  ],
  person_controls: [
    "{name}'s steering today. Let them lead.",
    "{name}'s got the wheel today. Ride along.",
    "Today bends {name}'s way. Follow their tempo.",
  ],
};

// 3-variant pools for self (You tab)
export const ME: Record<Relation, string[]> = {
  same: [
    'The day runs on your frequency. Move like you mean it.',
    'Today matches your energy — momentum comes easy.',
    'A same-element day. Trust your first instinct.',
  ],
  today_nurtures: [
    'The day has your back. Ask, start, lean in.',
    'Tailwind day — support finds you if you let it.',
    'Energy flows toward you today. Receive it.',
  ],
  person_nurtures: [
    'Your energy wants out today — talk, make, show.',
    'An expression day. Say the thing, start the thing.',
    "Output day — you'll feel better after you've made something.",
  ],
  today_controls: [
    'The day pushes back a little. Go steady, not fast.',
    'A discipline day — structure beats spontaneity.',
    "Friction is the theme. Double-check, don't force.",
  ],
  person_controls: [
    'Today yields if you push first. Take the lead.',
    'A get-things-done day — the to-do list is yours.',
    "Momentum favors the one who starts. That's you.",
  ],
};

// Korean pool — same variant indices as ME (seed keeps them aligned)
export const ME_KO: Record<Relation, string[]> = {
  same: [
    '오늘은 내 기운과 같은 결이에요. 평소 속도 그대로 밀고 가요.',
    '기운이 나랑 닮은 날 — 시작이 가볍게 붙어요.',
    '첫 감이 잘 맞는 날이에요. 재지 말고 움직여요.',
  ],
  today_nurtures: [
    '기운이 나를 밀어주는 날이에요. 부탁도 시작도 잘 붙어요.',
    '순풍이 부는 날 — 오늘은 기대도 괜찮아요.',
    '받는 날이에요. 도움도 기회도 마다하지 말아요.',
  ],
  person_nurtures: [
    '기운이 밖으로 나가고 싶어 하는 날 — 말하고, 만들고, 보여줘요.',
    '표현이 잘 풀리는 날이에요. 미뤄둔 말을 꺼내봐요.',
    '뭐라도 만들어야 개운한 날이에요.',
  ],
  today_controls: [
    '살짝 맞바람이 부는 날이에요. 빠르게 말고 단단하게 가요.',
    '격식이 이기는 날 — 즉흥보다 순서대로.',
    '억지로 밀면 삐끗해요. 한 번 더 확인하고 가요.',
  ],
  person_controls: [
    '먼저 움직이면 풀리는 날이에요. 주도권을 잡아요.',
    '해치우기 좋은 날 — 밀린 일부터 잡아요.',
    '시작하는 사람이 이기는 날인데, 오늘은 그게 나예요.',
  ],
};

export function localDateStr(d?: Date): string {
  const date = d ?? new Date();
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

/**
 * Returns a one-line coaching note based on the relationship between
 * today's daily pillar element and the given person/self element.
 *
 * @param personElement  Day-master element of the target
 * @param mode           'them' for People cards, 'me' for You tab
 * @param date           Optional YYYY-MM-DD override; defaults to today (for testing)
 * @param name           Optional person name for personalized copy (them mode only)
 */
export function getTodayNote(
  personElement: Element,
  mode: 'them' | 'me',
  date?: string,
  name?: string,
  korean?: boolean,
): TodayNote {
  const dateStr = date ?? localDateStr();
  const [pillar] = getDailyPillars(dateStr, 1);
  const t = pillar.element;
  const rel = getRelation(t, personElement);
  const tone = TONE[rel];
  let line: string;
  if (mode === 'me') {
    line = pickVariant((korean ? ME_KO : ME)[rel], `${dateStr}|me|${rel}`);
  } else if (name && name.trim()) {
    line = pickVariant(THEM_NAMED[rel], `${dateStr}|them|${rel}|${name}`).split('{name}').join(name);
  } else {
    line = THEM_NONAME[rel];
  }
  return { tone, line, todayElement: t, branch: pillar.branch, stem: pillar.stem };
}

// ── Shared "my today card" data (You tab + People tab) ─────────────────────────

/** Formats today's date for the Today card label — shared so both tabs match. */
export function todayDateLabel(korean: boolean, d?: Date): string {
  const now = d ?? new Date();
  if (korean) return `${now.getMonth() + 1}월 ${now.getDate()}일`;
  const months = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];
  return `${months[now.getMonth()]} ${now.getDate()}`;
}

export interface MyTodayCardData {
  note: TodayNote;
  emoji?: string;
  dateLabel: string;
}

/** Computes the self ('me') Today card data — used by both You tab and People tab. */
export function getMyTodayCard(element: Element, korean: boolean, date?: string): MyTodayCardData {
  const note = getTodayNote(element, 'me', date, undefined, korean);
  return {
    note,
    emoji: DAY_NOTE_LOCALE[note.branch]?.emoji,
    dateLabel: todayDateLabel(korean),
  };
}
