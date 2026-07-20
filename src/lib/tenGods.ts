import type { TenStem, TwelveBranch } from './saju';

export type TenGod =
  | 'bigyeon' | 'geopjae'      // 비견·겁재
  | 'siksin' | 'sanggwan'      // 식신·상관
  | 'pyeonjae' | 'jeongjae'    // 편재·정재
  | 'pyeongwan' | 'jeonggwan'  // 편관·정관
  | 'pyeonin' | 'jeongin';     // 편인·정인

export type TenGodGroup = 'mirror' | 'spark' | 'anchor' | 'compass' | 'root';

type Element = 'wood' | 'fire' | 'earth' | 'metal' | 'water';
type Polarity = 'Yang' | 'Yin';

// Mirrors saju.ts's element cycles (same source values, kept local — no cross-file coupling for a pure calc module).
const NURTURES: Record<Element, Element> = {
  wood: 'fire', fire: 'earth', earth: 'metal', metal: 'water', water: 'wood',
};
const CONTROLS: Record<Element, Element> = {
  wood: 'earth', earth: 'water', water: 'fire', fire: 'metal', metal: 'wood',
};

function parseStem(stem: TenStem): { element: Element; polarity: Polarity } {
  const [polarity, elementName] = stem.split(' ') as [Polarity, string];
  return { element: elementName.toLowerCase() as Element, polarity };
}

type Relation = 'same' | 'generates' | 'controls' | 'controlledBy' | 'generatedBy';

/** Relation of otherElement to dayElement, from the day master's point of view. */
function classifyRelation(dayElement: Element, otherElement: Element): Relation {
  if (dayElement === otherElement) return 'same';
  if (NURTURES[dayElement] === otherElement) return 'generates';       // day master generates other
  if (CONTROLS[dayElement] === otherElement) return 'controls';        // day master controls other
  if (CONTROLS[otherElement] === dayElement) return 'controlledBy';    // other controls day master
  return 'generatedBy';                                                // only remaining case: other generates day master
}

const GROUP_BY_TEN_GOD: Record<TenGod, TenGodGroup> = {
  bigyeon: 'mirror',  geopjae: 'mirror',
  siksin: 'spark',    sanggwan: 'spark',
  pyeonjae: 'anchor', jeongjae: 'anchor',
  pyeongwan: 'compass', jeonggwan: 'compass',
  pyeonin: 'root',    jeongin: 'root',
};

const GROUP_LABELS: Record<TenGodGroup, string> = {
  mirror: 'The Mirror',
  spark: 'The Spark',
  anchor: 'The Anchor',
  compass: 'The Compass',
  root: 'The Root',
};

const BRANCH_MAIN_STEM: Record<TwelveBranch, TenStem> = {
  Rat: 'Yin Water',
  Ox: 'Yin Earth',
  Tiger: 'Yang Wood',
  Rabbit: 'Yin Wood',
  Dragon: 'Yang Earth',
  Snake: 'Yang Fire',
  Horse: 'Yin Fire',
  Goat: 'Yin Earth',
  Monkey: 'Yang Metal',
  Rooster: 'Yin Metal',
  Dog: 'Yang Earth',
  Pig: 'Yang Water',
};

/** Ten God of otherStem, viewed from dayStem (day master). */
export function getTenGod(dayStem: TenStem, otherStem: TenStem): TenGod {
  const day = parseStem(dayStem);
  const other = parseStem(otherStem);
  const samePolarity = day.polarity === other.polarity;
  const relation = classifyRelation(day.element, other.element);

  switch (relation) {
    case 'same':         return samePolarity ? 'bigyeon' : 'geopjae';
    case 'generates':    return samePolarity ? 'siksin' : 'sanggwan';
    case 'controls':     return samePolarity ? 'pyeonjae' : 'jeongjae';
    case 'controlledBy': return samePolarity ? 'pyeongwan' : 'jeonggwan';
    case 'generatedBy':  return samePolarity ? 'pyeonin' : 'jeongin';
  }
}

export function getTenGodGroup(g: TenGod): TenGodGroup {
  return GROUP_BY_TEN_GOD[g];
}

export function getGroupLabel(g: TenGodGroup): string {
  return GROUP_LABELS[g];
}

/** The branch's dominant hidden stem (본기/main qi). */
export function getBranchMainStem(branch: TwelveBranch): TenStem {
  return BRANCH_MAIN_STEM[branch];
}

export function relationLens(
  myDayStem: TenStem,
  theirDayStem: TenStem,
): { tenGod: TenGod; group: TenGodGroup; label: string } {
  const tenGod = getTenGod(myDayStem, theirDayStem);
  const group = getTenGodGroup(tenGod);
  const label = getGroupLabel(group);
  return { tenGod, group, label };
}
