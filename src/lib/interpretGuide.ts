import type { TenStem, Element } from './saju';

// ── Archetype ─────────────────────────────────────────────────────────────────

export interface Archetype {
  hanja: string;
  name: string;
  tagline: string;
  keywords: [string, string];
  coreDrive: string;
  communication: string;
  stress: string;
}

export const ARCHETYPES: Record<TenStem, Archetype> = {
  'Yang Wood': {
    hanja:   '甲',
    name:    'The First Light',
    tagline: 'Already moving before the plan is done.',
    keywords: ['Moves first', 'Always in motion'],
    coreDrive:     'Growth-oriented pioneer; driven by principles and purpose; compelled to initiate and lead',
    communication: 'Direct and action-first; tends to propose before asking; moves conversations forward',
    stress:        'Confronts obstacles head-on; risks rigidity and snapping under sustained pressure',
  },
  'Yin Wood': {
    hanja:   '乙',
    name:    'The Quiet Climber',
    tagline: 'Finds a way around every wall.',
    keywords: ['Adapts fast', 'Finds a way'],
    coreDrive:     'Flexible survivor; grows through relationships and alliances; adaptive networker',
    communication: 'Gently indirect and mediating; suggests and adjusts rather than demands',
    stress:        'Tends to bend, depend on others, or go quiet rather than confront directly',
  },
  'Yang Fire': {
    hanja:   '丙',
    name:    'The Main Character',
    tagline: 'The room warms up when they walk in.',
    keywords: ['Big energy', 'Warms the room'],
    coreDrive:     'Open and expansive; natural performer; driven to radiate warmth and be seen',
    communication: 'Animated and inclusive; broad gestures, warm language, energizes the room',
    stress:        'Erupts when ignored or dismissed; recovers quickly once acknowledged',
  },
  'Yin Fire': {
    hanja:   '丁',
    name:    'The Slow Burn',
    tagline: 'Says little. Lands exactly.',
    keywords: ['Quiet depth', 'Precise words'],
    coreDrive:     'Perceptive and intimate; focuses deeply on one person; driven by insight over spectacle',
    communication: 'Quiet but precise; says little, lands exactly on the nerve when it matters',
    stress:        'Bottles feelings for a long time, then releases everything at once',
  },
  'Yang Earth': {
    hanja:   '戊',
    name:    'The Mountain',
    tagline: "Doesn't move. Doesn't need to.",
    keywords: ['Unmovable', 'Depth over chatter'],
    coreDrive:     'Immovable and trustworthy; values stability and reliability above novelty',
    communication: 'Minimal and conclusory; says only what matters; avoids small talk',
    stress:        'Holds position under pressure; but once the limit is crossed, collapses suddenly',
  },
  'Yin Earth': {
    hanja:   '己',
    name:    'The Gardener',
    tagline: 'Grows people without them noticing.',
    keywords: ['Grows people', 'Quietly practical'],
    coreDrive:     'Nurturing and practical; grows by enabling others; values usefulness over recognition',
    communication: 'Active listener; asks practical clarifying questions; prefers understanding to debating',
    stress:        'Endures silently while calculating; eventually turns cold and withdraws without warning',
  },
  'Yang Metal': {
    hanja:   '庚',
    name:    'The Straight Line',
    tagline: 'Means every word, every time.',
    keywords: ['Zero hedging', 'Means it'],
    coreDrive:     'Principled and decisive; operates in clear right/wrong; driven by justice and standards',
    communication: 'Blunt and unambiguous; dislikes hedging; says exactly what they mean',
    stress:        'Confronts injustice or dishonesty head-on; escalates quickly when principles are violated',
  },
  'Yin Metal': {
    hanja:   '辛',
    name:    'The Fine Edge',
    tagline: 'Notices everything. Forgets nothing.',
    keywords: ['Notices everything', 'High standards'],
    coreDrive:     'Refined and recognition-seeking; drawn to precision and beauty; driven by excellence',
    communication: 'Polished and exact; chooses words carefully; reads subtext and tone acutely',
    stress:        'Turns cutting when criticized; carries perceived slights for a long time',
  },
  'Yang Water': {
    hanja:   '壬',
    name:    'The Open Sea',
    tagline: 'Too big for small plans.',
    keywords: ['Big plans', 'No ceilings'],
    coreDrive:     'Grand-scale thinker; values freedom and possibility; driven by vision and scope',
    communication: 'Fluid and voluble; pivots topics with ease; sweeping and persuasive',
    stress:        'Becomes impulsive or scattered when confined; may flood or act erratically',
  },
  'Yin Water': {
    hanja:   '癸',
    name:    'The Still Water',
    tagline: 'Reads the room before entering it.',
    keywords: ['Steady', 'Still surface'],
    coreDrive:     'Quiet strategist; observes before moving; seeps into situations rather than charging',
    communication: 'Indirect by default; candid only in genuinely safe environments; reads people closely',
    stress:        'Withdraws into silence; avoids confrontation; may disappear rather than engage',
  },
};

// ── Element interaction tables ────────────────────────────────────────────────

// A → B : A nurtures B (상생)
const NURTURES: Record<Element, Element> = {
  wood: 'fire', fire: 'earth', earth: 'metal', metal: 'water', water: 'wood',
};

// A → B : A controls B (상극)
const CONTROLS: Record<Element, Element> = {
  wood: 'earth', earth: 'water', water: 'fire', fire: 'metal', metal: 'wood',
};

const STEM_TO_ELEMENT: Record<TenStem, Element> = {
  'Yang Wood': 'wood',  'Yin Wood': 'wood',
  'Yang Fire': 'fire',  'Yin Fire': 'fire',
  'Yang Earth': 'earth','Yin Earth': 'earth',
  'Yang Metal': 'metal','Yin Metal': 'metal',
  'Yang Water': 'water','Yin Water': 'water',
};

// ── Public helpers ─────────────────────────────────────────────────────────────

export function getArchetype(stem: TenStem): Archetype {
  return ARCHETYPES[stem];
}

/**
 * Calculates the element axis between two day masters and returns a
 * prompt-ready English description. All logic is deterministic.
 */
export function getElementRelationship(
  myDayMaster: TenStem,
  theirDayMaster: TenStem,
): string {
  const myEl    = STEM_TO_ELEMENT[myDayMaster];
  const theirEl = STEM_TO_ELEMENT[theirDayMaster];

  if (myDayMaster === theirDayMaster) {
    return (
      `Identical day master (${myDayMaster} / ${ARCHETYPES[myDayMaster].hanja} × ${ARCHETYPES[theirDayMaster].hanja}): ` +
      `mirror-image energy — instant mutual recognition, but latent competition over who sets the direction.`
    );
  }

  if (myEl === theirEl) {
    const myMode    = myDayMaster.startsWith('Yang') ? 'outward/assertive' : 'inward/adaptive';
    const theirMode = theirDayMaster.startsWith('Yang') ? 'outward/assertive' : 'inward/adaptive';
    return (
      `Same element (${myEl}), different polarity — you (${myDayMaster}) × them (${theirDayMaster}): ` +
      `shared core drive with contrasting expression styles. ` +
      `You express ${myEl} ${myMode}; they express it ${theirMode}. ` +
      `Expect deep mutual recognition undercut by rhythmic friction.`
    );
  }

  if (NURTURES[myEl] === theirEl) {
    return (
      `Your ${myEl} nurtures their ${theirEl} (상생 — generative axis). ` +
      `You naturally energize and support them; the risk is you deplete your own reserves over time.`
    );
  }

  if (NURTURES[theirEl] === myEl) {
    return (
      `Their ${theirEl} nurtures your ${myEl} (상생 — generative axis). ` +
      `They bring resources and activation energy to your dynamic; watch that it doesn't tip into over-reliance.`
    );
  }

  if (CONTROLS[myEl] === theirEl) {
    return (
      `Your ${myEl} controls their ${theirEl} (상극 — controlling axis). ` +
      `You may unconsciously challenge or disrupt their patterns; they could feel managed or pressured. ` +
      `Pace your directness carefully.`
    );
  }

  // CONTROLS[theirEl] === myEl (the only remaining case)
  return (
    `Their ${theirEl} controls your ${myEl} (상극 — controlling axis). ` +
    `They may unconsciously destabilize your natural patterns. ` +
    `This creates productive tension — or persistent friction if left unacknowledged.`
  );
}

// ── Day-animal notes ─────────────────────────────────────────────────────────

export const DAY_NOTES: Record<string, string> = {
  Rat:     "Rat day — quick eyes, quicker footwork.",
  Ox:      "Ox day — steady underneath, slow to bend.",
  Tiger:   "Tiger day — moves first, explains later.",
  Rabbit:  "Rabbit day — soft touch, careful steps.",
  Dragon:  "Dragon day — carries weather wherever they go.",
  Snake:   "Snake day — says less, sees more.",
  Horse:   "Horse day — built for open road, hates idling.",
  Goat:    "Goat day — keeps the warm corner of the room.",
  Monkey:  "Monkey day — finds the side door every time.",
  Rooster: "Rooster day — notices the crooked picture frame.",
  Dog:     "Dog day — loyal past the point of reason.",
  Pig:     "Pig day — an open door and a full table.",
};

// ── Korean locale — archetype names/taglines ──────────────────────────────────

export const ARCHETYPE_LOCALE: Record<string, { name_ko: string; kw_ko: [string,string]; tagline_en: [string,string,string]; tagline_ko: [string,string,string] }> = {
  'Yang Wood': { name_ko:'첫 새벽', kw_ko:['먼저 움직임','늘 나아감'],
    tagline_en:['Already moving before the plan is done.','Starts first, figures it out on the way.',"Can't sit still when there's ground to break."],
    tagline_ko:['계획이 서기도 전에 벌써 움직여요.','일단 시작하고, 가면서 답을 찾아요.','새로 낼 길이 보이면 가만 못 있어요.'] },
  'Yin Wood': { name_ko:'담쟁이', kw_ko:['빠른 적응','길을 찾음'],
    tagline_en:['Finds a way around every wall.','Bends where others break.','Quietly gets there, wall or no wall.'],
    tagline_ko:['벽마다 돌아가는 길을 기어이 찾아내요.','남들 부러질 자리에서 유연하게 휘어요.','막혀도 조용히 결국 다다라요.'] },
  'Yang Fire': { name_ko:'주인공', kw_ko:['큰 에너지','자리를 데움'],
    tagline_en:['The room warms up when they walk in.','Pulls the whole room into their orbit.','Runs warm, and everyone feels it.'],
    tagline_ko:['그 사람이 들어오면 자리가 환해져요.','어느새 사람들을 자기 쪽으로 끌어와요.','온기가 넘쳐서 옆 사람까지 데워요.'] },
  'Yin Fire': { name_ko:'은근한 불', kw_ko:['조용한 깊이','정확한 말'],
    tagline_en:['Says little. Lands exactly.','Quiet on the surface, deep underneath.','Waits, then says the one thing that counts.'],
    tagline_ko:['말은 적어도, 한마디가 정확히 꽂혀요.','겉은 잔잔해도 속이 깊어요.','묵묵히 있다가 핵심만 딱 짚어요.'] },
  'Yang Earth': { name_ko:'큰 산', kw_ko:['흔들림 없음','잔말 없는 깊이'],
    tagline_en:["Doesn't move. Doesn't need to.",'The one everyone leans on.','Stays put while the weather passes.'],
    tagline_ko:['굳이 안 움직여요. 그럴 필요가 없거든요.','다들 기대는 그 한 사람이에요.','비바람 지나갈 때까지 그 자리에 있어요.'] },
  'Yin Earth': { name_ko:'정원사', kw_ko:['사람을 키움','조용한 실속'],
    tagline_en:['Grows people without them noticing.','Helps quietly, takes no credit.','Tends to others before themselves.'],
    tagline_ko:['티 안 나게 사람을 키워요.','조용히 돕고, 생색은 안 내요.','자기보다 남을 먼저 챙겨요.'] },
  'Yang Metal': { name_ko:'곧은 사람', kw_ko:['에두르지 않음','말한 대로'],
    tagline_en:['Means every word, every time.','No hedging, no games.',"Says it straight, even when it's hard."],
    tagline_ko:['말한 건 언제나 그대로예요.','에두르지 않고, 돌려 말하지 않아요.','불편한 말도 곧게 해요.'] },
  'Yin Metal': { name_ko:'예리한 날', kw_ko:['다 알아챔','높은 기준'],
    tagline_en:['Notices everything. Forgets nothing.','Reads the tone before the words.','High standards, sharp eye.'],
    tagline_ko:['다 알아채고, 하나도 안 잊어요.','말보다 분위기를 먼저 읽어요.','기준이 높고, 눈이 예리해요.'] },
  'Yang Water': { name_ko:'넓은 바다', kw_ko:['큰 그림','한계 없음'],
    tagline_en:['Too big for small plans.','Thinks in horizons, not steps.','Hates a ceiling, loves a wide open.'],
    tagline_ko:['작은 그림엔 담기지 않아요.','한 걸음이 아니라 지평선을 봐요.','천장은 답답해하고, 탁 트인 걸 좋아해요.'] },
  'Yin Water': { name_ko:'잔잔한 물', kw_ko:['잔잔함','고요한 표면'],
    tagline_en:['Reads the room before entering it.','Calm on top, current underneath.','Watches first, moves once it\'s safe.'],
    tagline_ko:['들어서기 전에 분위기부터 읽어요.','겉은 고요해도 속엔 흐름이 있어요.','먼저 지켜보고, 편해지면 움직여요.'] },
};

// ── Korean locale — day-animal notes ──────────────────────────────────────────

export const DAY_NOTE_LOCALE: Record<string, { emoji: string; en: [string,string,string]; ko: [string,string,string] }> = {
  Rat: { emoji:'🐭',
    en:['A rat\'s quick read — catches on fast, moves faster.','A rat\'s instinct — senses the room, sidesteps trouble.','A rat\'s reflexes — grabs the moment before it passes.'],
    ko:['쥐의 기민함 — 상황을 빨리 읽고, 몸도 가볍게 움직여요.','쥐의 눈치 — 분위기 파악이 빠르고 손해 볼 자리를 피해요.','쥐의 순발력 — 순간의 틈을 빠르게 잡아채요.'] },
  Ox: { emoji:'🐮',
    en:['An ox\'s quiet strength — solid inside, hard to budge.','An ox\'s steadiness — sets a course and holds it.','An ox\'s patience — never rushed, always moving.'],
    ko:['소의 뚝심 — 속이 단단해서 좀처럼 안 흔들려요.','소의 우직함 — 한번 정하면 묵묵히 끝까지 가요.','소의 인내 — 서두르지 않고 제 속도로 밀고 가요.'] },
  Tiger: { emoji:'🐯',
    en:['A tiger\'s nerve — acts first, explains later.','A tiger\'s drive — charges in without flinching.','A tiger\'s boldness — bigger the stakes, calmer the nerve.'],
    ko:['호랑이의 배짱 — 재고 따지기 전에 먼저 나서요.','호랑이의 기세 — 밀어붙일 땐 거침이 없어요.','호랑이의 대범함 — 큰 판일수록 겁을 안 내요.'] },
  Rabbit: { emoji:'🐰',
    en:['A rabbit\'s soft caution — warm, but steps carefully.','A rabbit\'s care — catches the smallest shift in mood.','A rabbit\'s ease — smooths the edges, puts people at rest.'],
    ko:['토끼의 조심성 — 다정하게 다가가되, 한 발씩 신중하게.','토끼의 섬세함 — 작은 기색까지 살뜰히 살펴요.','토끼의 부드러움 — 모난 데 없이 사람을 편하게 해요.'] },
  Dragon: { emoji:'🐲',
    en:['A dragon\'s presence — shifts the mood of any room.','A dragon\'s pull — eyes turn without them trying.','A dragon\'s scale — thinks bigger than the room.'],
    ko:['용의 존재감 — 어디에 있든 분위기를 끌고 가요.','용의 카리스마 — 가만있어도 시선이 모여요.','용의 스케일 — 생각도 판도 남들보다 크게 잡아요.'] },
  Snake: { emoji:'🐍',
    en:['A snake\'s read — says little, sees plenty.','A snake\'s insight — reads what\'s under the surface.','A snake\'s patience — waits for the right moment, never forces it.'],
    ko:['뱀의 촉 — 말은 아껴도 웬만한 건 다 꿰고 있어요.','뱀의 통찰 — 겉만 보고도 속을 짚어내요.','뱀의 신중함 — 서두르지 않고 때를 기다려요.'] },
  Horse: { emoji:'🐴',
    en:['A horse\'s restlessness — alive on the open road, restless standing still.','A horse\'s freedom — hates a leash, always moving forward.','A horse\'s momentum — once it runs, it doesn\'t stop easily.'],
    ko:['말의 들썩임 — 탁 트인 길에서 살아나고, 멈춰 있는 걸 못 견뎌요.','말의 자유로움 — 얽매이는 걸 싫어하고 늘 나아가요.','말의 추진력 — 한번 달리면 좀처럼 안 멈춰요.'] },
  Goat: { emoji:'🐑',
    en:['A goat\'s warmth — holds the coziest corner of the room.','A goat\'s softness — makes room for the difficult ones.','A goat\'s gentleness — easy to be around, easy to trust.'],
    ko:['양의 온기 — 어느 자리든 가장 포근한 구석을 지켜요.','양의 포용 — 모난 사람도 넉넉히 품어줘요.','양의 다정함 — 곁에 있으면 마음이 놓여요.'] },
  Monkey: { emoji:'🐵',
    en:['A monkey\'s cleverness — always finds another way in.','A monkey\'s wit — sharpest when things get tricky.','A monkey\'s flexibility — bends to whatever the moment needs.'],
    ko:['원숭이의 재치 — 막히면 늘 다른 길을 찾아내요.','원숭이의 기지 — 곤란한 순간에 오히려 빛나요.','원숭이의 융통성 — 상황에 맞춰 유연하게 굴러가요.'] },
  Rooster: { emoji:'🐔',
    en:['A rooster\'s sharp eye — catches the one thing out of place.','A rooster\'s precision — won\'t let the small stuff slide.','A rooster\'s polish — keeps it sharp, inside and out.'],
    ko:['닭의 눈썰미 — 어긋난 것 하나를 귀신같이 잡아내요.','닭의 꼼꼼함 — 사소한 것도 그냥 못 넘어가요.','닭의 자기관리 — 안팎으로 반듯하게 챙겨요.'] },
  Dog: { emoji:'🐶',
    en:['A dog\'s loyalty — stays long after it stops making sense.','A dog\'s devotion — trusts all the way once it\'s given.','A dog\'s heart — gives it fully, holds nothing back.'],
    ko:['개의 의리 — 손해를 봐도 끝까지 곁을 지켜요.','개의 충직함 — 한번 믿으면 끝까지 믿어요.','개의 진심 — 재지 않고 마음을 다 줘요.'] },
  Pig: { emoji:'🐷',
    en:['A pig\'s generosity — door always open, table always full.','A pig\'s ease — doesn\'t sweat the small stuff.','A pig\'s warmth — loves to give, gives a lot.'],
    ko:['돼지의 넉넉함 — 문도 마음도 늘 활짝 열어둬요.','돼지의 여유 — 웬만한 건 크게 개의치 않아요.','돼지의 정 — 챙겨주는 걸 좋아하고 인심이 후해요.'] },
};

// ── Element insight (You tab) ─────────────────────────────────────────────────

export const ELEMENT_INSIGHT: Record<string, string> = {
  wood:  "Wood-led. You grow toward what you want — persistent, a little restless, always reaching.",
  fire:  "Fire-led. You bring the heat into a room — expressive, warm, quick to light up.",
  earth: "Earth-led. You're the steady ground others lean on — grounded, patient, hard to rush.",
  metal: "Metal-led. You cut to what's true — precise, principled, allergic to fluff.",
  water: "Water-led. You read the current before you move — perceptive, adaptive, deep beneath a calm surface.",
};

// ── Locale voice modules ──────────────────────────────────────────────────────

export const LOCALE_VOICE: Record<string, string> = {
  Korean: `KOREAN VOICE — applies ONLY when the output language is Korean. Ignore for English/other languages.
Goal: sound like a perceptive Korean friend who knows 사주 — never a translated English text. Re-express ideas in natural Korean; never map English sentence structure word-for-word.
1) Register: warm 해요체. Omit the 2nd-person subject entirely (never '당신'; avoid '그/그녀' as subject). Refer to the other person by name. Endings: …해요 / …하는 편이에요 / …거든요.
2) Saju-native vocabulary (use instead of literal translations):
   - '기운' for element/energy: "수(水) 기운을 타고났어요" (NOT "물이 이끄는").
   - '~하는 편이에요' / '성향이에요' for tendencies.
   - '결' for nature/fit: "결이 잘 맞아요", "부딪히는 지점".
   - Element first mention with hanja: 목(木)·화(火)·토(土)·금(金)·수(水).
3) De-translate metaphors: "reads the room" → "자리에 들어서기 전에 분위기부터 살펴요" (not "방을 읽어요"). "X — but Y" → "겉은 X한데 속은 Y".
4) Archetype names stay in English (brand); attach particles naturally: "The Still Water는…", "The Straight Line 같은 사람은…". Never translate them.
5) Details still need one concrete observable scene, phrased in Korean idiom.
6) Headline: keep the existing format rule as-is; do not restyle here.
7) Gold-standard Korean examples (match this texture):
   - personality takeaway: "겉은 잔잔한데 속은 쉽게 안 꺾여요."
   - communication detail: "사람 많은 자리에선 정면으로 안 부딪치고 말수부터 줄어요. 편해지면 슬쩍 떠보듯 얘기 꺼내고요."
   - element line: "수(水) 기운을 타고났어요. 나서기 전에 흐름부터 읽는 편이라 눈치 빠르고 속이 깊어요."
   - playbook do: "둘이 있을 때 편하게 물어보기 — 사람들 앞에선 예의로 얼버무리거든요."`,
};

export function localeVoiceBlock(): string {
  return Object.values(LOCALE_VOICE).join('\n\n');
}

// ── Copy style rules (included in full every prompt) ─────────────────────────

export const COPY_STYLE_RULES = `\
COPY STYLE RULES — apply to every field, non-negotiable

1. HEADLINE FORMAT
   "<Name>, before <key event extracted from situation>."
   Extract the concrete event from the situation text (e.g. "Friday" → "Mia, before Friday.").
   If no specific event is identifiable, use: "<Name>, decoded."
   Headline must NOT be an advice statement. It sets the stage, it does not give instructions.

2. PERSONALITY TAKEAWAY — contrast structure required
   Required formats:
     "X — but Y"
     "X surface, Y underneath"
   Forbidden: adjective lists alone (e.g. "warm, curious, independent" is rejected).
   Banned adjectives (cannot be used as the sole or primary descriptor): warm, kind, nice, grounded, authentic, genuine, independent.

3. DETAIL FIELDS — observable behavior required
   Every detail field must contain at least one observable behavior scene, e.g.:
     "When challenged in front of others, she tends to go quiet rather than push back."
     "In low-stakes conversations she floats ideas as questions — 'What if we…?' — before committing."
   Trait labels alone ("she is empathetic") without a scene are not enough.

4. PLAYBOOK — situation specificity required
   At least 2 tips must directly reference concrete elements from the situation text
   (e.g. the day of the week, the class setting, the specific ask being made).

5. GOLD STANDARD EXAMPLES
   personality takeaway → "A quiet strategist — soft surface, firm underneath."
   communication detail → "She floats hints before saying things plainly. If she teases you in class, that's a green light."
   playbook item        → { type: "do", tip: "Ask her one-on-one, not in front of classmates", why: "Public spotlight triggers her polite-deflect mode." }`;
