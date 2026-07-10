import { describe, it, expect } from 'vitest';
import { parseBriefing, containsBannedPhrases, type Briefing } from './briefing';

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
});
