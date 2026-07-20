import { describe, it, expect } from 'vitest';
import { parseBriefing, containsBannedPhrases, buildBriefingPrompt, type Briefing } from './briefing';
import type { SajuChart, Pillar, TenStem, TwelveBranch } from './saju';
import { LENS_FRAGMENTS, SIGNAL_FRAGMENTS, MIXED_SIGNAL_FRAGMENT, SINSAL_FRAGMENTS } from './promptFragments';

// ── Chart fixture builder (BRIEF-070) ───────────────────────────────────────

const STEM_HANJA: Record<TenStem, string> = {
  'Yang Wood': '甲', 'Yin Wood': '乙', 'Yang Fire': '丙', 'Yin Fire': '丁',
  'Yang Earth': '戊', 'Yin Earth': '己', 'Yang Metal': '庚', 'Yin Metal': '辛',
  'Yang Water': '壬', 'Yin Water': '癸',
};

const BRANCH_HANJA: Record<TwelveBranch, string> = {
  Rat: '子', Ox: '丑', Tiger: '寅', Rabbit: '卯', Dragon: '辰', Snake: '巳',
  Horse: '午', Goat: '未', Monkey: '申', Rooster: '酉', Dog: '戌', Pig: '亥',
};

function pillar(stem: TenStem, branch: TwelveBranch): Pillar {
  return { stem, branch, stemHanja: STEM_HANJA[stem], branchHanja: BRANCH_HANJA[branch] };
}

function makeChart(params: {
  dayStem: TenStem;
  year: TwelveBranch;
  month: TwelveBranch;
  day: TwelveBranch;
  hour?: TwelveBranch;
}): SajuChart {
  const { dayStem, year, month, day, hour } = params;
  const [polarity, elementWord] = dayStem.split(' ') as ['Yang' | 'Yin', string];
  return {
    pillars: {
      year: pillar('Yang Wood', year),
      month: pillar('Yang Wood', month),
      day: pillar(dayStem, day),
      hour: hour ? pillar('Yang Wood', hour) : null,
    },
    dayMaster: { stem: dayStem, element: elementWord.toLowerCase() as SajuChart['dayMaster']['element'], polarity },
    elements: { wood: 2, fire: 2, earth: 2, metal: 1, water: 1 },
    pillarsKnown: hour ? 8 : 6,
  };
}

function extractSection(prompt: string, header: string): string {
  const idx = prompt.indexOf(header);
  if (idx === -1) return '';
  const rest = prompt.slice(idx);
  const endIdx = rest.indexOf('\nOUTPUT INSTRUCTIONS');
  return endIdx === -1 ? rest : rest.slice(0, endIdx);
}

// ── Shared fixture ───────────────────────────────────────────────────────────

const VALID_BRIEFING: Briefing = {
  headline: 'Give her space before she commits.',
  theirProfile: {
    personality:   { takeaway: 'Thoughtful before speaking', detail: 'She tends to process internally before sharing her view. This is likely connected to her Water day branch.' },
    communication: { takeaway: 'Indirect but warm',          detail: 'She may prefer hints over declarations. Direct questions may feel abrupt to her.' },
    decisions:     { takeaway: 'Gut-led, not data-led',      detail: 'Her Metal day master tends toward instinctive conviction. Analysis is likely a secondary step.' },
    stress:        { takeaway: 'Withdraws when overloaded',  detail: 'Under pressure she is likely to pull back rather than confront. Give her room.' },
  },
  spectrums:   { communication: 35, decisions: 40, pace: 30, stress: 25 },
  mySpectrums: { communication: 60, decisions: 55, pace: 70, stress: 45 },
  dynamic: {
    resonance: 'slow-build',
    click: { takeaway: 'Both value loyalty',      detail: 'Shared Earth element suggests patience and reliability as common ground.' },
    clash: { takeaway: 'Pace mismatch is likely', detail: 'Your Yang Wood drive may feel pushy to her deliberate rhythm.' },
    watch: { takeaway: 'Watch your timing',       detail: 'Initiating when she is already in a reflective mood tends to backfire.' },
  },
  playbook: [
    { type: 'do',   tip: 'Let silences breathe',        why: 'She processes internally and silence signals safety.' },
    { type: 'dont', tip: 'Avoid surprise pressure',     why: 'It tends to trigger her withdrawal pattern.' },
    { type: 'do',   tip: 'Share your reasoning openly', why: 'It signals reliability to her Metal instincts.' },
  ],
};

const VALID_JSON = JSON.stringify(VALID_BRIEFING);

// ── parseBriefing ────────────────────────────────────────────────────────────

describe('parseBriefing', () => {
  it('parses valid JSON and returns a Briefing object', () => {
    const result = parseBriefing(VALID_JSON);
    expect(result.headline).toBe(VALID_BRIEFING.headline);
    expect(result.dynamic.resonance).toBe('slow-build');
    expect(result.playbook).toHaveLength(3);
  });

  it('throws when a required top-level field is missing', () => {
    const broken = JSON.stringify({ ...VALID_BRIEFING, headline: undefined });
    expect(() => parseBriefing(broken)).toThrow();
  });

  it('throws when a nested required field is missing', () => {
    const broken = JSON.stringify({
      ...VALID_BRIEFING,
      theirProfile: { ...VALID_BRIEFING.theirProfile, personality: { takeaway: 'x' } },
    });
    expect(() => parseBriefing(broken)).toThrow();
  });

  it('throws on non-JSON input', () => {
    expect(() => parseBriefing('Here is your result! Great question.')).toThrow(
      /not valid JSON/i,
    );
  });

  it('extracts JSON from markdown code fence (chatty LLM)', () => {
    const chatty = `Sure! Here is the analysis:\n\`\`\`json\n${VALID_JSON}\n\`\`\`\nHope that helps!`;
    const result = parseBriefing(chatty);
    expect(result.headline).toBe(VALID_BRIEFING.headline);
  });

  it('rejects an invalid resonance value', () => {
    const broken = JSON.stringify({
      ...VALID_BRIEFING,
      dynamic: { ...VALID_BRIEFING.dynamic, resonance: 'explosive-chemistry' },
    });
    expect(() => parseBriefing(broken)).toThrow();
  });

  it('rejects spectrums outside 0–100', () => {
    const broken = JSON.stringify({
      ...VALID_BRIEFING,
      spectrums: { ...VALID_BRIEFING.spectrums, communication: 150 },
    });
    expect(() => parseBriefing(broken)).toThrow();
  });
});

// ── containsBannedPhrases ────────────────────────────────────────────────────

describe('containsBannedPhrases', () => {
  it('returns empty array for a clean briefing', () => {
    expect(containsBannedPhrases(VALID_BRIEFING)).toEqual([]);
  });

  it('detects "weakness" in a detail field', () => {
    const dirty: Briefing = {
      ...VALID_BRIEFING,
      theirProfile: {
        ...VALID_BRIEFING.theirProfile,
        stress: { takeaway: 'Sensitive', detail: 'Her main weakness is overthinking.' },
      },
    };
    expect(containsBannedPhrases(dirty)).toContain('weakness');
  });

  it('detects "manipulate" case-insensitively', () => {
    const dirty: Briefing = {
      ...VALID_BRIEFING,
      playbook: [
        ...VALID_BRIEFING.playbook,
        { type: 'do', tip: 'Try to Manipulate the timing', why: 'Works.' },
      ],
    };
    expect(containsBannedPhrases(dirty)).toContain('manipulate');
  });

  it('detects "leverage against" as a phrase', () => {
    const dirty: Briefing = {
      ...VALID_BRIEFING,
      dynamic: {
        ...VALID_BRIEFING.dynamic,
        clash: { takeaway: 'Use it', detail: 'You can leverage against her pace.' },
      },
    };
    expect(containsBannedPhrases(dirty)).toContain('leverage against');
  });

  it('returns all matched banned phrases', () => {
    const dirty: Briefing = {
      ...VALID_BRIEFING,
      headline: 'Exploit her weakness.',
    };
    const found = containsBannedPhrases(dirty);
    expect(found).toContain('exploit');
    expect(found).toContain('weakness');
  });

  it('detects "The Spotlight" leaking into a free-text field', () => {
    const dirty: Briefing = {
      ...VALID_BRIEFING,
      theirProfile: {
        ...VALID_BRIEFING.theirProfile,
        personality: { takeaway: 'The Spotlight energy', detail: VALID_BRIEFING.theirProfile.personality.detail },
      },
    };
    expect(containsBannedPhrases(dirty)).toContain('The Spotlight');
  });
});

// ── buildBriefingPrompt: backend insight blocks (BRIEF-070) ────────────────

describe('buildBriefingPrompt — RELATION LENS block', () => {
  it('甲(me) x 丙(them) -> contains the spark fragment only, not the other 4', () => {
    const me = makeChart({ dayStem: 'Yang Wood', year: 'Rat', month: 'Dragon', day: 'Monkey' });
    const them = makeChart({ dayStem: 'Yang Fire', year: 'Ox', month: 'Snake', day: 'Rooster' });
    const prompt = buildBriefingPrompt(me, them, 'friend', 'test situation');

    expect(prompt).toContain(LENS_FRAGMENTS.spark);
    expect(prompt).not.toContain(LENS_FRAGMENTS.mirror);
    expect(prompt).not.toContain(LENS_FRAGMENTS.anchor);
    expect(prompt).not.toContain(LENS_FRAGMENTS.compass);
    expect(prompt).not.toContain(LENS_FRAGMENTS.root);
  });
});

describe('buildBriefingPrompt — INTERACTION SIGNALS block', () => {
  it('present: Ox(mine) x Horse(theirs) as the only cross-branch relation -> hae fragment, no yukchung/hyeong', () => {
    const me = makeChart({ dayStem: 'Yang Wood', year: 'Ox', month: 'Snake', day: 'Snake' });
    const them = makeChart({ dayStem: 'Yang Fire', year: 'Horse', month: 'Rabbit', day: 'Rooster' });
    const prompt = buildBriefingPrompt(me, them, 'friend', 'test situation');

    expect(prompt).toContain('INTERACTION SIGNALS');
    expect(prompt).toContain(SIGNAL_FRAGMENTS.hae);
    expect(prompt).not.toContain(SIGNAL_FRAGMENTS.yukchung);
    expect(prompt).not.toContain(SIGNAL_FRAGMENTS.hyeong);
  });

  it('absent: zero cross-branch relations -> block is entirely absent', () => {
    const me = makeChart({ dayStem: 'Yang Wood', year: 'Snake', month: 'Snake', day: 'Snake' });
    const them = makeChart({ dayStem: 'Yang Fire', year: 'Rooster', month: 'Rooster', day: 'Rooster' });
    const prompt = buildBriefingPrompt(me, them, 'friend', 'test situation');

    expect(prompt).not.toContain('INTERACTION SIGNALS');
  });

  it('mixed: my branches include Tiger, their branches include Pig -> MIXED_SIGNAL_FRAGMENT present (인해 = 합+파)', () => {
    const me = makeChart({ dayStem: 'Yang Wood', year: 'Tiger', month: 'Tiger', day: 'Tiger' });
    const them = makeChart({ dayStem: 'Yang Fire', year: 'Pig', month: 'Pig', day: 'Pig' });
    const prompt = buildBriefingPrompt(me, them, 'friend', 'test situation');

    expect(prompt).toContain(MIXED_SIGNAL_FRAGMENT);
  });
});

describe('buildBriefingPrompt — hour-unknown exclusion', () => {
  it('them.pillarsKnown === 6 -> their hour branch is excluded from signals/sinsal input', () => {
    const me = makeChart({ dayStem: 'Yang Fire', year: 'Snake', month: 'Snake', day: 'Snake' });
    const themWithHour = makeChart({ dayStem: 'Yang Wood', year: 'Dragon', month: 'Rabbit', day: 'Monkey', hour: 'Ox' });
    const themNoHour = makeChart({ dayStem: 'Yang Wood', year: 'Dragon', month: 'Rabbit', day: 'Monkey' });

    const withHourPrompt = buildBriefingPrompt(me, themWithHour, 'friend', 'test situation');
    const noHourPrompt = buildBriefingPrompt(me, themNoHour, 'friend', 'test situation');

    expect(themNoHour.pillarsKnown).toBe(6);
    expect(withHourPrompt).toContain(SINSAL_FRAGMENTS.cheoneul);
    expect(noHourPrompt).not.toContain(SINSAL_FRAGMENTS.cheoneul);
  });
});

describe('buildBriefingPrompt — THEIR UNDERCURRENTS block', () => {
  it('3+ sinsal detected -> prompt contains exactly 2 fragments, in SINSAL_PRIORITY order', () => {
    const me = makeChart({ dayStem: 'Yang Fire', year: 'Rooster', month: 'Rooster', day: 'Rooster' });
    const them = makeChart({ dayStem: 'Yang Wood', year: 'Ox', month: 'Snake', day: 'Goat' });
    const prompt = buildBriefingPrompt(me, them, 'friend', 'test situation');

    expect(prompt).toContain(SINSAL_FRAGMENTS.cheoneul);
    expect(prompt).toContain(SINSAL_FRAGMENTS.munchang);
    expect(prompt).not.toContain(SINSAL_FRAGMENTS.yeokma);

    const section = extractSection(prompt, '=== THEIR UNDERCURRENTS');
    const bulletCount = section.split('\n').filter(line => line.startsWith('- ')).length;
    expect(bulletCount).toBe(2);
  });
});

describe('buildBriefingPrompt — label non-leakage', () => {
  it('none of the 10 internal label strings ever appear in the assembled prompt', () => {
    const me = makeChart({ dayStem: 'Yang Wood', year: 'Ox', month: 'Snake', day: 'Goat', hour: 'Rat' });
    const them = makeChart({ dayStem: 'Yang Fire', year: 'Tiger', month: 'Pig', day: 'Dragon', hour: 'Dog' });
    const prompt = buildBriefingPrompt(me, them, 'friend', 'test situation');

    const labels = [
      'The Mirror', 'The Spark', 'The Anchor', 'The Compass', 'The Root',
      'The Tailwind', 'The Quill', 'The Spotlight', 'The Horizon', 'The Deep Forest',
    ];
    for (const label of labels) expect(prompt).not.toContain(label);
  });
});
