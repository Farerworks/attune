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

// ── Element insight (You tab) ─────────────────────────────────────────────────

export const ELEMENT_INSIGHT: Record<string, string> = {
  wood:  "Wood-led. You grow toward what you want — persistent, a little restless, always reaching.",
  fire:  "Fire-led. You bring the heat into a room — expressive, warm, quick to light up.",
  earth: "Earth-led. You're the steady ground others lean on — grounded, patient, hard to rush.",
  metal: "Metal-led. You cut to what's true — precise, principled, allergic to fluff.",
  water: "Water-led. You read the current before you move — perceptive, adaptive, deep beneath a calm surface.",
};

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
