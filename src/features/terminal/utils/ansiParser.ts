// ANSI escape code parser for terminal PTY output.
// Converts raw ANSI-encoded strings into styled text segments
// suitable for rendering in React Native <Text> components.

export interface AnsiSegment {
  text: string;
  style: {
    color?: string;
    backgroundColor?: string;
    fontWeight?: 'bold' | 'normal';
    opacity?: number;
    fontStyle?: 'italic' | 'normal';
    textDecorationLine?: 'underline' | 'line-through' | 'none';
  };
}

// ---------------------------------------------------------------------------
// Standard 16 ANSI colors (dark terminal theme)
// ---------------------------------------------------------------------------

const STANDARD_COLORS: string[] = [
  '#000000', // 0 black
  '#cd3131', // 1 red
  '#0dbc79', // 2 green
  '#e5e510', // 3 yellow
  '#2472c8', // 4 blue
  '#bc3fbc', // 5 magenta
  '#11a8cd', // 6 cyan
  '#e5e5e5', // 7 white
];

const BRIGHT_COLORS: string[] = [
  '#666666', // 8  bright black
  '#f14c4c', // 9  bright red
  '#23d18b', // 10 bright green
  '#f5f543', // 11 bright yellow
  '#3b8eea', // 12 bright blue
  '#d670d6', // 13 bright magenta
  '#29b8db', // 14 bright cyan
  '#ffffff', // 15 bright white
];

// ---------------------------------------------------------------------------
// 256-color palette (indices 0-255)
// ---------------------------------------------------------------------------

let palette256: string[] | null = null;

function getPalette256(): string[] {
  if (palette256) return palette256;

  palette256 = new Array<string>(256);

  // 0-7: standard colors
  for (let i = 0; i < 8; i++) palette256[i] = STANDARD_COLORS[i];
  // 8-15: bright colors
  for (let i = 0; i < 8; i++) palette256[8 + i] = BRIGHT_COLORS[i];

  // 16-231: 6x6x6 color cube
  const levels = [0x00, 0x5f, 0x87, 0xaf, 0xd7, 0xff];
  for (let i = 0; i < 216; i++) {
    const r = levels[Math.floor(i / 36) % 6];
    const g = levels[Math.floor(i / 6) % 6];
    const b = levels[i % 6];
    palette256[16 + i] = `#${hex2(r)}${hex2(g)}${hex2(b)}`;
  }

  // 232-255: grayscale ramp
  for (let i = 0; i < 24; i++) {
    const v = 8 + i * 10;
    palette256[232 + i] = `#${hex2(v)}${hex2(v)}${hex2(v)}`;
  }

  return palette256;
}

function hex2(n: number): string {
  const s = n.toString(16);
  return s.length < 2 ? '0' + s : s;
}

// ---------------------------------------------------------------------------
// Style state tracked across SGR sequences
// ---------------------------------------------------------------------------

interface StyleState {
  fg: string | undefined;
  bg: string | undefined;
  bold: boolean;
  dim: boolean;
  italic: boolean;
  underline: boolean;
  strikethrough: boolean;
  inverse: boolean;
  hidden: boolean;
}

function defaultStyle(): StyleState {
  return {
    fg: undefined,
    bg: undefined,
    bold: false,
    dim: false,
    italic: false,
    underline: false,
    strikethrough: false,
    inverse: false,
    hidden: false,
  };
}

function styleToSegmentStyle(s: StyleState): AnsiSegment['style'] {
  const out: AnsiSegment['style'] = {};

  let fg = s.fg;
  let bg = s.bg;

  if (s.inverse) {
    const tmp = fg;
    fg = bg ?? '#000000';
    bg = tmp ?? '#e5e5e5';
  }

  if (s.hidden) {
    // Hidden text: make fg same as bg (or transparent)
    fg = bg ?? '#000000';
  }

  if (fg) out.color = fg;
  if (bg) out.backgroundColor = bg;
  if (s.bold) out.fontWeight = 'bold';
  if (s.dim) out.opacity = 0.5;
  if (s.italic) out.fontStyle = 'italic';
  if (s.underline) out.textDecorationLine = 'underline';
  else if (s.strikethrough) out.textDecorationLine = 'line-through';

  return out;
}

// ---------------------------------------------------------------------------
// SGR (Select Graphic Rendition) parameter handling
// ---------------------------------------------------------------------------

function applySgr(params: number[], state: StyleState): void {
  let i = 0;
  while (i < params.length) {
    const p = params[i];

    switch (p) {
      // Reset
      case 0: {
        const d = defaultStyle();
        state.fg = d.fg;
        state.bg = d.bg;
        state.bold = d.bold;
        state.dim = d.dim;
        state.italic = d.italic;
        state.underline = d.underline;
        state.strikethrough = d.strikethrough;
        state.inverse = d.inverse;
        state.hidden = d.hidden;
        break;
      }

      // Attributes
      case 1:
        state.bold = true;
        break;
      case 2:
        state.dim = true;
        break;
      case 3:
        state.italic = true;
        break;
      case 4:
        state.underline = true;
        break;
      case 7:
        state.inverse = true;
        break;
      case 8:
        state.hidden = true;
        break;
      case 9:
        state.strikethrough = true;
        break;

      // Reset attributes
      case 21:
      case 22:
        state.bold = false;
        state.dim = false;
        break;
      case 23:
        state.italic = false;
        break;
      case 24:
        state.underline = false;
        break;
      case 27:
        state.inverse = false;
        break;
      case 28:
        state.hidden = false;
        break;
      case 29:
        state.strikethrough = false;
        break;

      // Standard foreground 30-37
      case 30:
      case 31:
      case 32:
      case 33:
      case 34:
      case 35:
      case 36:
      case 37:
        state.fg = STANDARD_COLORS[p - 30];
        break;

      // Extended foreground: 38;5;n or 38;2;r;g;b
      case 38: {
        const mode = params[i + 1];
        if (mode === 5 && i + 2 < params.length) {
          // 256-color
          const idx = params[i + 2];
          if (idx >= 0 && idx <= 255) state.fg = getPalette256()[idx];
          i += 2;
        } else if (mode === 2 && i + 4 < params.length) {
          // RGB
          const r = params[i + 2] & 0xff;
          const g = params[i + 3] & 0xff;
          const b = params[i + 4] & 0xff;
          state.fg = `#${hex2(r)}${hex2(g)}${hex2(b)}`;
          i += 4;
        } else {
          // Unknown sub-mode, skip what we can
          i += 1;
        }
        break;
      }

      // Default foreground
      case 39:
        state.fg = undefined;
        break;

      // Standard background 40-47
      case 40:
      case 41:
      case 42:
      case 43:
      case 44:
      case 45:
      case 46:
      case 47:
        state.bg = STANDARD_COLORS[p - 40];
        break;

      // Extended background: 48;5;n or 48;2;r;g;b
      case 48: {
        const mode = params[i + 1];
        if (mode === 5 && i + 2 < params.length) {
          const idx = params[i + 2];
          if (idx >= 0 && idx <= 255) state.bg = getPalette256()[idx];
          i += 2;
        } else if (mode === 2 && i + 4 < params.length) {
          const r = params[i + 2] & 0xff;
          const g = params[i + 3] & 0xff;
          const b = params[i + 4] & 0xff;
          state.bg = `#${hex2(r)}${hex2(g)}${hex2(b)}`;
          i += 4;
        } else {
          i += 1;
        }
        break;
      }

      // Default background
      case 49:
        state.bg = undefined;
        break;

      // Bright foreground 90-97
      case 90:
      case 91:
      case 92:
      case 93:
      case 94:
      case 95:
      case 96:
      case 97:
        state.fg = BRIGHT_COLORS[p - 90];
        break;

      // Bright background 100-107
      case 100:
      case 101:
      case 102:
      case 103:
      case 104:
      case 105:
      case 106:
      case 107:
        state.bg = BRIGHT_COLORS[p - 100];
        break;

      default:
        // Unknown SGR code, ignore
        break;
    }

    i++;
  }
}

// ---------------------------------------------------------------------------
// Main regex: matches ANSI escape sequences (CSI, OSC, and simple ESC codes)
// ---------------------------------------------------------------------------

// CSI: \x1b[ ... (letter)
// OSC: \x1b] ... (BEL or ST)
// Simple: \x1b followed by single char (e.g. \x1b=, \x1b>, \x1b(B)
// Also match standalone \x1b at end of string
const ANSI_RE =
  /\x1b\[([?]?[0-9;]*)([A-Za-z@`hlm])|(?:\x1b\][^\x07\x1b]*(?:\x07|\x1b\\))|(?:\x1b[()][A-Za-z0-9])|(?:\x1b[A-Za-z0-9=><])|(?:\x1b$)/g;

// ---------------------------------------------------------------------------
// parseAnsi — flat list of styled segments
// ---------------------------------------------------------------------------

export function parseAnsi(raw: string): AnsiSegment[] {
  if (!raw) return [];

  const state = defaultStyle();
  const segments: AnsiSegment[] = [];
  let lastIndex = 0;

  ANSI_RE.lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = ANSI_RE.exec(raw)) !== null) {
    // Text before this escape sequence
    if (match.index > lastIndex) {
      const text = raw.slice(lastIndex, match.index);
      if (text) {
        segments.push({ text, style: styleToSegmentStyle(state) });
      }
    }
    lastIndex = ANSI_RE.lastIndex;

    // If this is a CSI sequence (has capture groups)
    const paramStr = match[1];
    const command = match[2];

    if (command) {
      // Only process SGR (m) commands for styling.
      // All other CSI commands (h/l for DEC modes, cursor movement,
      // erase, scroll, etc.) are silently stripped.
      if (command === 'm' && (!paramStr || !paramStr.startsWith('?'))) {
        if (!paramStr || paramStr === '') {
          applySgr([0], state);
        } else {
          const params = paramStr.split(';').map((s) => {
            const n = parseInt(s, 10);
            return isNaN(n) ? 0 : n;
          });
          applySgr(params, state);
        }
      }
    }
    // OSC sequences and simple escape codes are also silently stripped.
  }

  // Remaining text after last escape sequence
  if (lastIndex < raw.length) {
    const text = raw.slice(lastIndex);
    if (text) {
      segments.push({ text, style: styleToSegmentStyle(state) });
    }
  }

  return segments;
}

// ---------------------------------------------------------------------------
// parseAnsiLines — split into lines, handle \r\n and \r
// ---------------------------------------------------------------------------

export function parseAnsiLines(raw: string): AnsiSegment[][] {
  if (!raw) return [];

  // First, handle carriage returns at the raw string level.
  // \r\n → \n (standard line ending)
  // \r without \n → move cursor to start of line (overwrite)
  const normalized = handleCarriageReturns(raw);

  // Split into lines, then parse each line individually while carrying
  // style state across lines for correctness.
  const rawLines = normalized.split('\n');
  const result: AnsiSegment[][] = [];
  const state = defaultStyle();

  for (let li = 0; li < rawLines.length; li++) {
    const line = rawLines[li];
    if (line === '') {
      result.push([]);
      continue;
    }

    const segments: AnsiSegment[] = [];
    let lastIndex = 0;

    ANSI_RE.lastIndex = 0;
    let match: RegExpExecArray | null;

    while ((match = ANSI_RE.exec(line)) !== null) {
      if (match.index > lastIndex) {
        const text = line.slice(lastIndex, match.index);
        if (text) {
          segments.push({ text, style: styleToSegmentStyle(state) });
        }
      }
      lastIndex = ANSI_RE.lastIndex;

      const paramStr = match[1];
      const command = match[2];

      if (command === 'm' && (!paramStr || !paramStr.startsWith('?'))) {
        if (!paramStr || paramStr === '') {
          applySgr([0], state);
        } else {
          const params = paramStr.split(';').map((s) => {
            const n = parseInt(s, 10);
            return isNaN(n) ? 0 : n;
          });
          applySgr(params, state);
        }
      }
    }

    if (lastIndex < line.length) {
      const text = line.slice(lastIndex);
      if (text) {
        segments.push({ text, style: styleToSegmentStyle(state) });
      }
    }

    result.push(segments);
  }

  return result;
}

// ---------------------------------------------------------------------------
// Carriage return handling
// ---------------------------------------------------------------------------

function handleCarriageReturns(raw: string): string {
  // Fast path: no carriage returns at all
  if (raw.indexOf('\r') === -1) return raw;

  // Replace \r\n with \n first
  let s = raw.replace(/\r\n/g, '\n');

  // Fast path: no remaining \r
  if (s.indexOf('\r') === -1) return s;

  // Handle bare \r: split into lines, then for each line simulate
  // carriage return overwriting.
  const lines = s.split('\n');
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (line.indexOf('\r') === -1) continue;

    // Split by \r — each part overwrites from column 0
    const parts = line.split('\r');
    // Start with empty buffer, each part overwrites from position 0
    let buffer = '';
    for (let j = 0; j < parts.length; j++) {
      const part = parts[j];
      if (part === '') continue;
      if (part.length >= buffer.length) {
        buffer = part;
      } else {
        // Overwrite the beginning of buffer with part
        buffer = part + buffer.slice(part.length);
      }
    }
    lines[i] = buffer;
  }

  return lines.join('\n');
}
