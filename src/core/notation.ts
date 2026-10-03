import type { Barline, DynamicSign, Issue, SlotKind } from './types.ts';

/**
 * Numbered-notation text shared by the melody and the left hand.
 *
 *   1-7        a note; "0" is a rest and "." holds the previous note
 *   ' and ,    raise or lower the note by an octave (may repeat)
 *   # and b    sharpen or flatten the note (written before the digit)
 *   ( … )      splits one beat (or one parent unit) evenly among its contents
 *   < … >      notes struck together, written as a vertical stack
 *   ~< … >     the same notes rolled: struck one after the other from the bottom
 *   [C]        a chord symbol that applies from the next note onward
 *   {mf}       a dynamic mark (pp p mp mf f ff); {<} and {>} start a hairpin
 *   ?          marks the preceding note as uncertain
 *   | || |: :| barlines
 */

/** A written tone before it is resolved against a key or a chord. */
export interface RawTone {
  degree: number;
  accidental: number;
  octave: number;
}

export interface RawSlot {
  kind: SlotKind;
  start: number;
  duration: number;
  beat: number;
  beams: number;
  tuplet?: number;
  tones: RawTone[];
  uncertain: boolean;
  /** True for stacked notes written with "~": a rolled chord. */
  rolled: boolean;
  column: number;
}

export interface RawChordMark {
  start: number;
  symbol: string;
  column: number;
}

export interface RawDynamicMark {
  start: number;
  sign: DynamicSign;
  column: number;
}

export interface RawMeasure {
  slots: RawSlot[];
  chords: RawChordMark[];
  dynamics: RawDynamicMark[];
  /** Sum of the written durations, in ticks. */
  length: number;
  barline: Barline;
  repeatStart: boolean;
  line: number;
  column: number;
}

export interface ParsedNotation {
  measures: RawMeasure[];
  issues: Issue[];
}

type Token =
  | { type: 'bar'; value: '|' | '||' | '|:' | ':|'; column: number }
  | { type: 'open'; column: number }
  | { type: 'close'; column: number }
  | { type: 'chord'; symbol: string; column: number }
  | { type: 'dynamic'; sign: DynamicSign; column: number }
  | {
      type: 'leaf';
      kind: SlotKind;
      tones: RawTone[];
      uncertain: boolean;
      rolled: boolean;
      column: number;
    };

interface LeafNode {
  type: 'leaf';
  kind: SlotKind;
  tones: RawTone[];
  uncertain: boolean;
  rolled: boolean;
  column: number;
  chords: { symbol: string; column: number }[];
  dynamics: { sign: DynamicSign; column: number }[];
}

interface GroupNode {
  type: 'group';
  children: Node[];
  column: number;
}

type Node = LeafNode | GroupNode;

const NOTE_PATTERN = /^([#b]?)([1-7])([',]*)(\??)/;
const DYNAMIC_SIGNS: readonly string[] = ['pp', 'p', 'mp', 'mf', 'f', 'ff', '<', '>'];

function parseTone(match: RegExpExecArray): RawTone {
  const accidental = match[1] === '#' ? 1 : match[1] === 'b' ? -1 : 0;
  let octave = 0;
  for (const mark of match[3]) octave += mark === "'" ? 1 : -1;
  return { degree: Number(match[2]), accidental, octave };
}

function tokenize(text: string, line: number, issues: Issue[]): Token[] {
  const tokens: Token[] = [];
  let index = 0;
  // Set by "~" for the stack that follows it.
  let rolled = false;

  const fail = (message: string, column: number) => {
    issues.push({ severity: 'error', message, line, column });
  };

  while (index < text.length) {
    const char = text[index];
    const column = index + 1;
    const rest = text.slice(index);

    if (/\s/.test(char)) {
      index += 1;
    } else if (rest.startsWith('||')) {
      tokens.push({ type: 'bar', value: '||', column });
      index += 2;
    } else if (rest.startsWith('|:')) {
      tokens.push({ type: 'bar', value: '|:', column });
      index += 2;
    } else if (rest.startsWith(':|')) {
      tokens.push({ type: 'bar', value: ':|', column });
      index += 2;
    } else if (char === '|') {
      tokens.push({ type: 'bar', value: '|', column });
      index += 1;
    } else if (char === '(') {
      tokens.push({ type: 'open', column });
      index += 1;
    } else if (char === ')') {
      tokens.push({ type: 'close', column });
      index += 1;
    } else if (char === '[') {
      const end = text.indexOf(']', index);
      if (end === -1) {
        fail('Chord symbol is missing its closing "]".', column);
        break;
      }
      tokens.push({ type: 'chord', symbol: text.slice(index + 1, end).trim(), column });
      index = end + 1;
    } else if (char === '{') {
      const end = text.indexOf('}', index);
      if (end === -1) {
        fail('Dynamic mark is missing its closing "}".', column);
        break;
      }
      const sign = text.slice(index + 1, end).trim();
      if (DYNAMIC_SIGNS.includes(sign)) {
        tokens.push({ type: 'dynamic', sign: sign as DynamicSign, column });
      } else {
        fail(`"{${sign}}" is not a dynamic mark; use pp, p, mp, mf, f, ff, < or >.`, column);
      }
      index = end + 1;
    } else if (char === '~') {
      if (text[index + 1] === '<') rolled = true;
      else fail('"~" rolls a chord and must be followed by stacked notes: ~<1 3 5>.', column);
      index += 1;
    } else if (char === '<') {
      const end = text.indexOf('>', index);
      if (end === -1) {
        fail('Stacked notes are missing their closing ">".', column);
        break;
      }
      const tones: RawTone[] = [];
      let uncertain = false;
      for (const part of text
        .slice(index + 1, end)
        .trim()
        .split(/\s+/)) {
        const match = NOTE_PATTERN.exec(part);
        if (!match || match[0].length !== part.length) {
          fail(`"${part}" is not a note that can be stacked.`, column);
          continue;
        }
        tones.push(parseTone(match));
        if (match[4] === '?') uncertain = true;
      }
      if (tones.length > 0) {
        tokens.push({ type: 'leaf', kind: 'note', tones, uncertain, rolled, column });
      }
      rolled = false;
      index = end + 1;
    } else if (char === '.') {
      tokens.push({
        type: 'leaf',
        kind: 'hold',
        tones: [],
        uncertain: false,
        rolled: false,
        column,
      });
      index += 1;
    } else if (char === '0') {
      const uncertain = text[index + 1] === '?';
      tokens.push({ type: 'leaf', kind: 'rest', tones: [], uncertain, rolled: false, column });
      index += uncertain ? 2 : 1;
    } else {
      const match = NOTE_PATTERN.exec(rest);
      if (match) {
        tokens.push({
          type: 'leaf',
          kind: 'note',
          tones: [parseTone(match)],
          uncertain: match[4] === '?',
          rolled: false,
          column,
        });
        index += match[0].length;
      } else {
        fail(`Unexpected character "${char}".`, column);
        index += 1;
      }
    }
  }
  return tokens;
}

function isPowerOfTwo(value: number): boolean {
  return value > 0 && (value & (value - 1)) === 0;
}

/** Lays the nodes of one measure out in time and flattens them into slots. */
function layOut(
  nodes: Node[],
  beat: number,
  line: number,
  issues: Issue[],
): Pick<RawMeasure, 'slots' | 'chords' | 'dynamics' | 'length'> {
  const slots: RawSlot[] = [];
  const chords: RawChordMark[] = [];
  const dynamics: RawDynamicMark[] = [];

  const place = (
    node: Node,
    start: number,
    duration: number,
    beatIndex: number,
    tuplet?: number,
  ) => {
    if (node.type === 'leaf') {
      for (const chord of node.chords) {
        chords.push({ start, symbol: chord.symbol, column: chord.column });
      }
      for (const dynamic of node.dynamics) {
        dynamics.push({ start, sign: dynamic.sign, column: dynamic.column });
      }
      const beams = duration >= beat ? 0 : Math.floor(Math.log2(beat / duration) + 1e-9);
      slots.push({
        kind: node.kind,
        start,
        duration,
        beat: beatIndex,
        beams,
        tuplet,
        tones: node.tones,
        uncertain: node.uncertain,
        rolled: node.rolled,
        column: node.column,
      });
      return;
    }

    const count = node.children.length;
    if (count === 0) {
      issues.push({ severity: 'error', message: 'Empty group "( )".', line, column: node.column });
      return;
    }
    const share = duration / count;
    if (!Number.isInteger(share)) {
      issues.push({
        severity: 'error',
        message: `A group of ${count} cannot be divided evenly at this level.`,
        line,
        column: node.column,
      });
    }
    const childTuplet = isPowerOfTwo(count) ? tuplet : count;
    node.children.forEach((child, childIndex) => {
      place(
        child,
        start + Math.round(share * childIndex),
        Math.round(share),
        beatIndex,
        childTuplet,
      );
    });
  };

  nodes.forEach((node, index) => place(node, index * beat, beat, index));
  return { slots, chords, dynamics, length: nodes.length * beat };
}

/**
 * Parses one line of notation into measures. `beat` is the length of one beat
 * in ticks; every top-level symbol lasts exactly one beat.
 */
export function parseNotationLine(text: string, beat: number, line: number): ParsedNotation {
  const issues: Issue[] = [];
  const tokens = tokenize(text, line, issues);
  const measures: RawMeasure[] = [];

  let nodes: Node[] = [];
  let stack: GroupNode[] = [];
  let pendingChords: { symbol: string; column: number }[] = [];
  let pendingDynamics: { sign: DynamicSign; column: number }[] = [];
  let measureColumn = 1;
  let repeatStart = false;

  const closeMeasure = (barline: Barline, column: number) => {
    if (stack.length > 0) {
      issues.push({ severity: 'error', message: 'Group "(" is not closed.', line, column });
      stack = [];
    }
    if (pendingChords.length > 0) {
      issues.push({
        severity: 'error',
        message: `Chord [${pendingChords[0].symbol}] is not followed by a note.`,
        line,
        column: pendingChords[0].column,
      });
      pendingChords = [];
    }
    if (pendingDynamics.length > 0) {
      issues.push({
        severity: 'error',
        message: `Dynamic mark {${pendingDynamics[0].sign}} is not followed by a note.`,
        line,
        column: pendingDynamics[0].column,
      });
      pendingDynamics = [];
    }
    if (nodes.length > 0) {
      measures.push({
        ...layOut(nodes, beat, line, issues),
        barline,
        repeatStart,
        line,
        column: measureColumn,
      });
      repeatStart = false;
    }
    nodes = [];
  };

  for (const token of tokens) {
    const target = stack.length > 0 ? stack[stack.length - 1].children : nodes;
    switch (token.type) {
      case 'bar': {
        const barline: Barline =
          token.value === '||' ? 'final' : token.value === ':|' ? 'repeat-end' : 'single';
        closeMeasure(barline, token.column);
        if (token.value === '|:') repeatStart = true;
        measureColumn = token.column + token.value.length;
        break;
      }
      case 'open': {
        const group: GroupNode = { type: 'group', children: [], column: token.column };
        target.push(group);
        stack.push(group);
        break;
      }
      case 'close':
        if (stack.length === 0) {
          issues.push({
            severity: 'error',
            message: 'Unexpected ")" without a matching "(".',
            line,
            column: token.column,
          });
        } else {
          stack.pop();
        }
        break;
      case 'chord':
        pendingChords.push({ symbol: token.symbol, column: token.column });
        break;
      case 'dynamic':
        pendingDynamics.push({ sign: token.sign, column: token.column });
        break;
      case 'leaf':
        target.push({
          type: 'leaf',
          kind: token.kind,
          tones: token.tones,
          uncertain: token.uncertain,
          rolled: token.rolled,
          column: token.column,
          chords: pendingChords,
          dynamics: pendingDynamics,
        });
        pendingChords = [];
        pendingDynamics = [];
        break;
    }
  }
  // A line may end without a closing barline.
  closeMeasure('single', text.length + 1);

  return { measures, issues };
}
