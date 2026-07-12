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

export type Relation =
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

// Deterministic variant picker — same seed always yields same variant, no Math.random
function pickVariant(pool: string[], seed: string): string {
  let h = 5381;
  for (let i = 0; i < seed.length; i++) h = ((h << 5) + h + seed.charCodeAt(i)) >>> 0;
  return pool[h % pool.length];
}

const TONE: Record<Relation, TodayTone> = {
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
    "You're in your element today.",
    'Today speaks your language.',
    'Home turf today. Trust your instincts.',
  ],
  today_nurtures: [
    'Tailwind day. Start the thing.',
    "Today's feeding you. Spend it.",
    'Green lights today — move.',
  ],
  person_nurtures: [
    'Giving-out day. Guard your energy.',
    "You're the generous one today. Save a slice for yourself.",
    "Don't overpour today.",
  ],
  today_controls: [
    'Friction day. Move slower.',
    'Today pushes back. Push less.',
    'Sharp edges today. Take the long way.',
  ],
  person_controls: [
    'You set the pace today.',
    'Yours to steer today.',
    'Today waits on you. Call it.',
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
): TodayNote {
  const dateStr = date ?? localDateStr();
  const [pillar] = getDailyPillars(dateStr, 1);
  const t = pillar.element;
  const rel = getRelation(t, personElement);
  const tone = TONE[rel];
  let line: string;
  if (mode === 'me') {
    line = pickVariant(ME[rel], `${dateStr}|me|${rel}`);
  } else if (name && name.trim()) {
    line = pickVariant(THEM_NAMED[rel], `${dateStr}|them|${rel}|${name}`).split('{name}').join(name);
  } else {
    line = THEM_NONAME[rel];
  }
  return { tone, line, todayElement: t };
}
