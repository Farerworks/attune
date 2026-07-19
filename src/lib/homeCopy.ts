import type { Element } from './saju';
import { getDailyPillars } from './saju';
import { pickVariant, localDateStr, type Relation, type TodayTone } from './today';

// ── Relation logic — mirrors today.ts's private getRelation/TONE ──────────────
// (today.ts doesn't export these; duplicated here rather than widening that
// file's public surface, per this BRIEF's 3-file limit. Same source values.)

const NURTURES: Record<Element, Element> = {
  wood: 'fire', fire: 'earth', earth: 'metal', metal: 'water', water: 'wood',
};

const CONTROLS: Record<Element, Element> = {
  wood: 'earth', earth: 'water', water: 'fire', fire: 'metal', metal: 'wood',
};

function getRelation(t: Element, p: Element): Relation {
  if (t === p)            return 'same';
  if (NURTURES[t] === p)  return 'today_nurtures';
  if (NURTURES[p] === t)  return 'person_nurtures';
  if (CONTROLS[t] === p)  return 'today_controls';
  return 'person_controls';
}

const TONE: Record<Relation, TodayTone> = {
  same:            'good',
  today_nurtures:  'good',
  person_nurtures: 'soft',
  today_controls:  'soft',
  person_controls: 'neutral',
};

// ── Do / Don't pools — verbatim from COPY-HOME.md, do not edit wording ────────

export const DO_EN: Record<Relation, string[]> = {
  same:            ['Say the thing.', 'Make the first move.', 'Trust your first read.', 'Lead with yourself today.'],
  today_nurtures:  ['Start the thing.', 'Make the big ask.', 'Send the message you drafted.', 'Set the date.'],
  person_nurtures: ['Guard your hours.', 'Keep one no ready.', 'Choose who gets you today.', 'Rest before you give.'],
  today_controls:  ['Move slower.', 'Read it twice, send it once.', 'Keep plans light.', 'Let small things slide.'],
  person_controls: ['Set the pace.', 'Name what you want.', 'Pick the time yourself.', 'Steer the plan.'],
};

export const DONT_EN: Record<Relation, string[]> = {
  same:            ['Wait for permission.', 'Overthink the opener.', 'Second-guess your gut.', 'Sit on good news.'],
  today_nurtures:  ['Save it for later.', 'Play it small.', 'Hedge the ask.', 'Put off the call.'],
  person_nurtures: ['Pour for everyone.', 'Promise new favors.', 'Add one more yes.', 'Skip the break.'],
  today_controls:  ['Force the answer.', 'Pick the fight.', 'Push the point.', 'Rush the reply.'],
  person_controls: ['Wait to be asked.', 'Follow by default.', 'Water it down.', 'Leave it unsaid.'],
};

export const DO_KO: Record<Relation, string[]> = {
  same:            ['먼저 말 걸어봐요.', '오늘은 내가 먼저.', '처음 든 감을 믿어요.', '좋은 소식은 바로 전해요.'],
  today_nurtures:  ['오늘 시작해요.', '큰 부탁은 오늘 해요.', '미뤄둔 연락을 보내요.', '약속을 잡아요.'],
  person_nurtures: ['내 시간부터 챙겨요.', '거절 하나는 준비해둬요.', '오늘 줄 사람을 골라요.', '쉬고 나서 챙겨요.'],
  today_controls:  ['오늘은 천천히 가요.', '보내기 전에 두 번 읽어요.', '일정은 가볍게 잡아요.', '작은 건 흘려보내요.'],
  person_controls: ['속도는 내가 정해요.', '원하는 걸 말해요.', '시간은 내가 골라요.', '계획을 이끌어요.'],
};

export const DONT_KO: Record<Relation, string[]> = {
  same:            ['눈치 보며 기다리기.', '첫마디 너무 재기.', '감 의심하기.', '좋은 말 아껴두기.'],
  today_nurtures:  ['내일로 미루기.', '괜히 작게 굴기.', '빙 돌려 말하기.', '전화 미루기.'],
  person_nurtures: ['모두에게 다 주기.', '새 부탁 떠안기.', '하나 더 승낙하기.', '쉬는 시간 건너뛰기.'],
  today_controls:  ['답을 몰아붙이기.', '굳이 싸움 걸기.', '끝까지 고집 세우기.', '답장 서두르기.'],
  person_controls: ['불러주길 기다리기.', '그냥 따라가기.', '하고 싶은 말 물 타기.', '말 삼키기.'],
};

// ── Selection ────────────────────────────────────────────────────────────────

function pickTwoDistinct(pool: string[], seed0: string, seed1: string): [string, string] {
  const a = pickVariant(pool, seed0);
  let b = pickVariant(pool, seed1);
  if (b === a) {
    const idx = pool.indexOf(b);
    b = pool[(idx + 1) % pool.length];
  }
  return [a, b];
}

export interface DailyDoDont {
  dos: [string, string];
  donts: [string, string];
}

/** Today's Do 2 + Don't 2, deterministic from date × relation. */
export function getDailyDoDont(myElement: Element, korean: boolean, date?: string): DailyDoDont {
  const dateStr = date ?? localDateStr();
  const [pillar] = getDailyPillars(dateStr, 1);
  const rel = getRelation(pillar.element, myElement);
  const doPool = (korean ? DO_KO : DO_EN)[rel];
  const dontPool = (korean ? DONT_KO : DONT_EN)[rel];
  return {
    dos: pickTwoDistinct(doPool, `${dateStr}|do|${rel}|0`, `${dateStr}|do|${rel}|1`),
    donts: pickTwoDistinct(dontPool, `${dateStr}|dont|${rel}|0`, `${dateStr}|dont|${rel}|1`),
  };
}

// ── 14-day flow strip ──────────────────────────────────────────────────────────

const WEEKDAY_EN = ['S', 'M', 'T', 'W', 'T', 'F', 'S']; // Date#getDay(): 0=Sun..6=Sat
const WEEKDAY_KO = ['일', '월', '화', '수', '목', '금', '토'];

export interface FlowDay {
  date: string; // YYYY-MM-DD
  weekdayLabel: string;
  dayNumber: number;
  tone: TodayTone;
  rel: Relation;
}

/** 14 days starting today (or an override start date), each with its element-relation tone. */
export function getFlowDays(myElement: Element, korean: boolean, startDate?: string): FlowDay[] {
  const start = startDate ?? localDateStr();
  const pillars = getDailyPillars(start, 14);
  return pillars.map(p => {
    const d = new Date(`${p.date}T00:00:00`);
    const rel = getRelation(p.element, myElement);
    return {
      date: p.date,
      weekdayLabel: (korean ? WEEKDAY_KO : WEEKDAY_EN)[d.getDay()],
      dayNumber: d.getDate(),
      tone: TONE[rel],
      rel,
    };
  });
}
