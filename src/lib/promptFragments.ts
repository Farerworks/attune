import type { TenGodGroup } from './tenGods';
import type { PairRelation } from './branchRelations';
import type { Sinsal } from './sinsal';

export const LENS_FRAGMENTS: Record<TenGodGroup, string> = {
  mirror: 'They meet the user as an equal current — same energy, same wavelength. Kinship and rivalry share a wall here: they understand the user fast, and can compete with them just as fast.',
  spark: "They draw the user's expression out. Around them the user talks more, makes more, plays more — and can overspend themselves without noticing.",
  anchor: 'They are the flow the user instinctively takes charge of — something to build, provide for, make real. Satisfying, and quietly demanding.',
  compass: 'They set a bar. Around them the user sits straighter — respect and pressure arrive together, and both are real.',
  root: 'They replenish the user. Being near them feels like being backed — comfort that can shade into leaning too much.',
};

export const SIGNAL_FRAGMENTS: Record<PairRelation, string> = {
  yukhap: 'A natural pull — these two ease toward each other without effort.',
  yukchung: 'Strong charge — energizing at best, combustible when tired. Name the trigger, not a verdict.',
  hyeong: "Recurring tension in one specific area — the same knot tends to come back until it's handled deliberately.",
  jahyeong: 'Self-directed friction on one side — pressure they put on themselves that can spill into the pair.',
  pa: 'Minor static — small crossed wires, easily fixed when noticed early.',
  hae: 'Minor static — small crossed wires, easily fixed when noticed early.',
};

export const MIXED_SIGNAL_FRAGMENT =
  "Closeness and friction live in the same spot: they pull close easily, and small sparks fly exactly where they're closest. Frame it as intimacy's texture, not a flaw.";

export const SINSAL_FRAGMENTS: Record<Sinsal, string> = {
  cheoneul: 'Help tends to find them — doors open through people.',
  munchang: "A learner's mind — words and ideas are their element.",
  dohwa: 'Attention follows them without being asked.',
  yeokma: 'Movement feeds them — new places, new ground.',
  hwagae: 'A rich inner room — they create best alone.',
};

export const SINSAL_PRIORITY: Sinsal[] = ['cheoneul', 'munchang', 'dohwa', 'yeokma', 'hwagae'];

export const LENS_INSTRUCTION =
  'Use this as insight into how they arrive in the user\'s life. Never name the category or use internal labels in your output.';
export const SIGNALS_INSTRUCTION =
  "Translate into relationship texture in the 'Your dynamic' section. Never use technical or ominous terms (clash, punishment, harm). No doom.";
export const SINSAL_INSTRUCTION =
  "At most one light touch in 'Their profile'. Flavor, never evidence. Paraphrase — never output internal names.";
