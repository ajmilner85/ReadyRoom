/**
 * Streaming parser for Tacview ACMI 2.x text (file or real-time telemetry stream).
 *
 * Line grammar (ACMI 2.2):
 *   FileType=text/acmi/tacview      header line (no object id)
 *   #12.34                          time frame, seconds after ReferenceTime
 *   0,Key=Value,...                 global properties
 *   1a2b,T=...,Key=Value,...        object update (hex id)
 *   -1a2b                           object removed
 *   // comment
 * A trailing backslash continues the line (multi-line text); "\," escapes a comma in a value.
 */

export type AcmiEvent =
  | { kind: 'header'; key: string; value: string }
  | { kind: 'time'; t: number }
  | { kind: 'update'; id: string; props: Record<string, string> }
  | { kind: 'remove'; id: string };

const HEX_ID = /^[0-9a-fA-F]+$/;

export class AcmiLineParser {
  private carry = '';
  private continued = '';
  private first = true;
  private readonly onEvent: (ev: AcmiEvent) => void;

  constructor(onEvent: (ev: AcmiEvent) => void) {
    this.onEvent = onEvent;
  }

  /** Feed decoded text; partial trailing lines are buffered until the next push. */
  push(text: string): void {
    const data = this.carry + text;
    let start = 0;
    let nl = data.indexOf('\n', start);
    while (nl !== -1) {
      this.line(data.slice(start, nl));
      start = nl + 1;
      nl = data.indexOf('\n', start);
    }
    this.carry = data.slice(start);
  }

  /** Flush any buffered final line (end of file). */
  end(): void {
    if (this.carry) this.line(this.carry);
    this.carry = '';
    if (this.continued) this.parse(this.continued);
    this.continued = '';
  }

  private line(raw: string): void {
    let line = raw.endsWith('\r') ? raw.slice(0, -1) : raw;
    if (this.first) {
      if (line.charCodeAt(0) === 0xfeff) line = line.slice(1);
      this.first = false;
    }
    if (endsWithUnescapedBackslash(line)) {
      this.continued += line.slice(0, -1) + '\n';
      return;
    }
    if (this.continued) {
      line = this.continued + line;
      this.continued = '';
    }
    this.parse(line);
  }

  private parse(line: string): void {
    if (!line || line.startsWith('//')) return;
    const c = line.charCodeAt(0);
    if (c === 35 /* # */) {
      const t = Number(line.slice(1));
      if (Number.isFinite(t)) this.onEvent({ kind: 'time', t });
      return;
    }
    if (c === 45 /* - */) {
      const id = line.slice(1).trim();
      if (HEX_ID.test(id)) this.onEvent({ kind: 'remove', id: id.toLowerCase() });
      return;
    }
    const comma = line.indexOf(',');
    const head = comma === -1 ? line : line.slice(0, comma);
    if (comma === -1 || !HEX_ID.test(head)) {
      const eq = line.indexOf('=');
      if (eq > 0) this.onEvent({ kind: 'header', key: line.slice(0, eq), value: line.slice(eq + 1) });
      return;
    }
    this.onEvent({ kind: 'update', id: head.toLowerCase(), props: splitProps(line, comma + 1) });
  }
}

function endsWithUnescapedBackslash(s: string): boolean {
  let n = 0;
  for (let i = s.length - 1; i >= 0 && s.charCodeAt(i) === 92; i--) n++;
  return n % 2 === 1;
}

/** Split "K=V,K=V" honouring "\," escapes; values are unescaped. */
export function splitProps(line: string, from = 0): Record<string, string> {
  const props: Record<string, string> = {};
  let cur = '';
  const flush = () => {
    const eq = cur.indexOf('=');
    if (eq > 0) props[cur.slice(0, eq)] = cur.slice(eq + 1);
    cur = '';
  };
  for (let i = from; i < line.length; i++) {
    const ch = line[i];
    if (ch === '\\' && i + 1 < line.length) {
      cur += line[++i];
    } else if (ch === ',') {
      flush();
    } else {
      cur += ch;
    }
  }
  flush();
  return props;
}
