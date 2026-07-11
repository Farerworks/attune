import type { Element } from './saju';
import { getDailyPillars } from './saju';

export type TodayTone = 'good' | 'soft' | 'neutral';

export interface TodayNote {
  tone: TodayTone;
  line: string;
  todayElement: Element;
}

// Mirrors interpretGuide.ts tables — do not modify saju logic here
const NURTURES: Record<Element, Element> = {
  wood: 'fire', fire: 'earth', earth: 'metal', metal: 'water', water: 'wood',
};

const CONTROLS: Record<Element, Element> = {
  wood: 'earth', earth: 'water', water: 'fire', fire: 'metal', metal: 'wood',
};

type Relation =
  | 'same'
  | 'today_nurtures'    // t → person (person is receptive)
  | 'person_nurtures'   // person → t (person gives out, energy runs low)
  | 'today_controls'    // t controls person (person feels pressed)
  | 'person_controls';  // person controls t (person steers)

function getRelation(t: Element, p: Element): Relation {
  if (t === p)             return 'same';
  if (NURTURES[t] === p)  return 'today_nurtures';
  if (NURTURES[p] === t)  return 'person_nurtures';
  if (CONTROLS[t] === p)  return 'today_controls';
  return 'person_controls';
}

const THEM_COPY: Record<Relation, { tone: TodayTone; line: string }> = {
  same:            { tone: 'good',    line: 'Same wavelength today. Reach out.' },
  today_nurtures:  { tone: 'good',    line: "They're receptive today. Good day to reach out." },
  person_nurtures: { tone: 'soft',    line: 'Their energy runs low today. Be patient.' },
  today_controls:  { tone: 'soft',    line: 'They may feel pressed today. Keep it light.' },
  person_controls: { tone: 'neutral', line: "They're steering today. Let them lead." },
};

const ME_COPY: Record<Relation, { tone: TodayTone; line: string }> = {
  same:            { tone: 'good',    line: "You're in your element today." },
  today_nurtures:  { tone: 'good',    line: 'Tailwind day. Start the thing.' },
  person_nurtures: { tone: 'soft',    line: 'Giving-out day. Guard your energy.' },
  today_controls:  { tone: 'soft',    line: 'Friction day. Move slower.' },
  person_controls: { tone: 'neutral', line: 'You set the pace today.' },
};

export function localDateStr(d?: Date): string {
  const date = d ?? new Date();
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

/**
 * Returns a one-line coaching note based on the relationship between
 * today's daily pillar element and the given person/self element.
 *
 * @param personElement  Day-master element of the target ('them' = other person, 'me' = self)
 * @param mode           'them' for People cards, 'me' for You tab
 * @param date           Optional YYYY-MM-DD override; defaults to today (for testing)
 */
export function getTodayNote(
  personElement: Element,
  mode: 'them' | 'me',
  date?: string,
): TodayNote {
  const dateStr = date ?? localDateStr();
  const [pillar] = getDailyPillars(dateStr, 1);
  const t = pillar.element;
  const rel = getRelation(t, personElement);
  const { tone, line } = mode === 'them' ? THEM_COPY[rel] : ME_COPY[rel];
  return { tone, line, todayElement: t };
}
