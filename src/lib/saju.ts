import { Solar } from 'lunar-javascript';

export type TenStem =
  | 'Yang Wood' | 'Yin Wood'
  | 'Yang Fire' | 'Yin Fire'
  | 'Yang Earth' | 'Yin Earth'
  | 'Yang Metal' | 'Yin Metal'
  | 'Yang Water' | 'Yin Water';

export type TwelveBranch =
  | 'Rat' | 'Ox' | 'Tiger' | 'Rabbit' | 'Dragon' | 'Snake'
  | 'Horse' | 'Goat' | 'Monkey' | 'Rooster' | 'Dog' | 'Pig';

export type Element = 'wood' | 'fire' | 'earth' | 'metal' | 'water';

export interface Pillar {
  stem: TenStem;
  branch: TwelveBranch;
  stemHanja: string;
  branchHanja: string;
}

export interface SajuChart {
  pillars: {
    year: Pillar;
    month: Pillar;
    day: Pillar;
    hour: Pillar | null;
  };
  dayMaster: {
    stem: TenStem;
    element: Element;
    polarity: 'Yang' | 'Yin';
  };
  elements: {
    wood: number;
    fire: number;
    earth: number;
    metal: number;
    water: number;
  };
  pillarsKnown: 6 | 8;
}

export interface DailyPillar {
  date: string;
  stem: TenStem;
  branch: TwelveBranch;
  element: Element;
}

const STEM_MAP: Record<string, TenStem> = {
  '甲': 'Yang Wood', '乙': 'Yin Wood',
  '丙': 'Yang Fire', '丁': 'Yin Fire',
  '戊': 'Yang Earth', '己': 'Yin Earth',
  '庚': 'Yang Metal', '辛': 'Yin Metal',
  '壬': 'Yang Water', '癸': 'Yin Water',
};

const BRANCH_MAP: Record<string, TwelveBranch> = {
  '子': 'Rat', '丑': 'Ox', '寅': 'Tiger', '卯': 'Rabbit',
  '辰': 'Dragon', '巳': 'Snake', '午': 'Horse', '未': 'Goat',
  '申': 'Monkey', '酉': 'Rooster', '戌': 'Dog', '亥': 'Pig',
};

const STEM_ELEMENT: Record<string, Element> = {
  '甲': 'wood', '乙': 'wood',
  '丙': 'fire', '丁': 'fire',
  '戊': 'earth', '己': 'earth',
  '庚': 'metal', '辛': 'metal',
  '壬': 'water', '癸': 'water',
};

const BRANCH_ELEMENT: Record<string, Element> = {
  '子': 'water', '丑': 'earth', '寅': 'wood', '卯': 'wood',
  '辰': 'earth', '巳': 'fire', '午': 'fire', '未': 'earth',
  '申': 'metal', '酉': 'metal', '戌': 'earth', '亥': 'water',
};

function parsePillar(ganHanja: string, zhiHanja: string): Pillar {
  const stem = STEM_MAP[ganHanja];
  const branch = BRANCH_MAP[zhiHanja];
  if (!stem) throw new Error(`Unknown heavenly stem: ${ganHanja}`);
  if (!branch) throw new Error(`Unknown earthly branch: ${zhiHanja}`);
  return { stem, branch, stemHanja: ganHanja, branchHanja: zhiHanja };
}

function countElements(pillars: Pillar[]): SajuChart['elements'] {
  const counts = { wood: 0, fire: 0, earth: 0, metal: 0, water: 0 };
  for (const p of pillars) {
    counts[STEM_ELEMENT[p.stemHanja]]++;
    counts[BRANCH_ELEMENT[p.branchHanja]]++;
  }
  return counts;
}

export function calculateSaju(input: {
  date: string;
  time?: string;
  timezone?: string;
}): SajuChart {
  const [y, m, d] = input.date.split('-').map(Number);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let solar: any;
  let hasTime = false;

  if (input.time) {
    const [h, min] = input.time.split(':').map(Number);
    solar = Solar.fromYmdHms(y, m, d, h, min, 0);
    hasTime = true;
  } else {
    solar = Solar.fromYmd(y, m, d);
  }

  const ec = solar.getLunar().getEightChar();
  ec.setSect(2); // 야자시 분리(23시대=당일 일주+자시). 라이브러리 기본값 의존 제거 — ENGINE-CHECK.md

  const yearPillar = parsePillar(ec.getYearGan(), ec.getYearZhi());
  const monthPillar = parsePillar(ec.getMonthGan(), ec.getMonthZhi());
  const dayPillar = parsePillar(ec.getDayGan(), ec.getDayZhi());
  const hourPillar = hasTime ? parsePillar(ec.getTimeGan(), ec.getTimeZhi()) : null;

  const dayStemHanja = ec.getDayGan();
  const dayStem = STEM_MAP[dayStemHanja];
  const dayElement = STEM_ELEMENT[dayStemHanja];
  const polarity: 'Yang' | 'Yin' = dayStem.startsWith('Yang') ? 'Yang' : 'Yin';

  const activePillars = hourPillar
    ? [yearPillar, monthPillar, dayPillar, hourPillar]
    : [yearPillar, monthPillar, dayPillar];

  return {
    pillars: {
      year: yearPillar,
      month: monthPillar,
      day: dayPillar,
      hour: hourPillar,
    },
    dayMaster: {
      stem: dayStem,
      element: dayElement,
      polarity,
    },
    elements: countElements(activePillars),
    pillarsKnown: hasTime ? 8 : 6,
  };
}

export function getDailyPillars(startDate: string, days: number): DailyPillar[] {
  const [y, m, d] = startDate.split('-').map(Number);
  const result: DailyPillar[] = [];

  for (let i = 0; i < days; i++) {
    const dt = new Date(Date.UTC(y, m - 1, d + i));
    const year = dt.getUTCFullYear();
    const month = dt.getUTCMonth() + 1;
    const day = dt.getUTCDate();

    const solar = Solar.fromYmd(year, month, day);
    const ec = solar.getLunar().getEightChar();

    const stemHanja = ec.getDayGan();
    const branchHanja = ec.getDayZhi();
    const dateStr = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;

    result.push({
      date: dateStr,
      stem: STEM_MAP[stemHanja],
      branch: BRANCH_MAP[branchHanja],
      element: STEM_ELEMENT[stemHanja],
    });
  }

  return result;
}
