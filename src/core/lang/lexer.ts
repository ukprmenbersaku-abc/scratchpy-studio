/**
 * ScratchPy レキサ(字句解析器)
 * -----------------------------
 * Python 風のインデント構文を INDENT / DEDENT トークンに変換する。
 * 識別子は Unicode 文字(日本語変数名など)を許可する。
 */

export type TokenKind =
  | 'ident' | 'number' | 'string' | 'kw' | 'op' | 'punct'
  | 'newline' | 'indent' | 'dedent' | 'comment' | 'eof';

export interface Token {
  kind: TokenKind;
  value: string;        // 文字列トークンではデコード後の値
  raw: string;          // 原文
  line: number;         // 1-based
  col: number;          // 1-based
  endCol: number;
}

export const KEYWORDS = new Set([
  'stage', 'sprite', 'var', 'list', 'costume', 'sound',
  'on', 'flag', 'key', 'click', 'clone', 'receive', 'backdrop',
  'timer', 'loudness',
  'def', 'warp',
  'if', 'elif', 'else', 'while', 'repeat', 'forever',
  'and', 'or', 'not', 'in',
  'true', 'false', 'pass',
  'int', 'float', 'str', 'bool', 'any',
  'stop', 'broadcast', 'wait',
]);

// 演算子・区切り記号(長いもの優先)
const OPS = ['+=', '-=', '==', '!=', '<=', '>=', '<', '>', '=', '+', '-', '*', '/', '%',
  '(', ')', '[', ']', '{', '}', ',', ':', '.', '@'];

const IDENT_START = /[\p{L}\p{Nl}_]/u;
const IDENT_PART = /[\p{L}\p{Nl}\p{Mn}\p{Mc}\p{Nd}\p{Pc}_‿]/u;

export class LexError extends Error {
  line: number; col: number;
  constructor(message: string, line: number, col: number) {
    super(message);
    this.line = line; this.col = col;
  }
}

function isIdentStart(ch: string): boolean { return IDENT_START.test(ch); }
function isIdentPart(ch: string): boolean { return IDENT_PART.test(ch); }
function isDigit(ch: string): boolean { return ch >= '0' && ch <= '9'; }

/**
 * ソース文字列をトークン列に変換する。
 * コメントは既定では捨てるが、keepComments=true で 'comment' トークンとして残す。
 */
export function tokenize(src: string, keepComments = false): Token[] {
  const tokens: Token[] = [];
  const lines = src.split('\n');
  const indentStack = [0];
  let parenDepth = 0;

  for (let lineIdx = 0; lineIdx < lines.length; lineIdx++) {
    const line = lines[lineIdx].replace(/\r$/, '');
    const lineNo = lineIdx + 1;

    // 行頭インデント処理(括弧内でない場合のみ)
    if (parenDepth === 0) {
      let indent = 0;
      let i = 0;
      while (i < line.length) {
        if (line[i] === ' ') { indent++; i++; }
        else if (line[i] === '\t') { indent += 8 - (indent % 8); i++; }
        else break;
      }
      const rest = line.slice(i);
      const blank = rest.length === 0 || rest.startsWith('#');
      if (!blank) {
        const top = indentStack[indentStack.length - 1];
        if (indent > top) {
          indentStack.push(indent);
          tokens.push({ kind: 'indent', value: '', raw: '', line: lineNo, col: 1, endCol: indent + 1 });
        } else {
          while (indent < indentStack[indentStack.length - 1]) {
            indentStack.pop();
            tokens.push({ kind: 'dedent', value: '', raw: '', line: lineNo, col: 1, endCol: 1 });
          }
          if (indent !== indentStack[indentStack.length - 1]) {
            throw new LexError('インデントが揃っていません', lineNo, 1);
          }
        }
      }
      if (blank) {
        // コメントのみの行: インデント構造には影響させず、コメントトークンだけ残す
        if (keepComments && parenDepth === 0 && rest.startsWith('#')) {
          tokens.push({
            kind: 'comment', value: rest.slice(1), raw: rest,
            line: lineNo, col: i + 1, endCol: line.length + 1,
          });
        }
        continue;
      }
    }

    // 行本体のスキャン
    let col = 0;
    const emit = (kind: TokenKind, value: string, raw: string, startCol: number) => {
      tokens.push({ kind, value, raw, line: lineNo, col: startCol + 1, endCol: col + 1 });
    };
    while (col < line.length) {
      const startCol = col;
      const ch = line[col];
      if (ch === ' ' || ch === '\t') { col++; continue; }
      if (ch === '#') {
        const text = line.slice(col + 1);
        if (keepComments) emit('comment', text, line.slice(col), startCol);
        col = line.length;
        continue;
      }
      if (ch === '"' || ch === "'") {
        const quote = ch;
        let val = '';
        col++;
        let closed = false;
        while (col < line.length) {
          const c = line[col];
          if (c === '\\' && col + 1 < line.length) {
            const n = line[col + 1];
            val += n === 'n' ? '\n' : n === 't' ? '\t' : n === '\\' ? '\\' : n === quote ? quote : '\\' + n;
            col += 2;
            continue;
          }
          if (c === quote) { closed = true; col++; break; }
          val += c;
          col++;
        }
        if (!closed) throw new LexError('文字列が閉じられていません', lineNo, startCol + 1);
        emit('string', val, line.slice(startCol, col), startCol);
        continue;
      }
      if (isDigit(ch) || (ch === '.' && isDigit(line[col + 1] ?? ''))) {
        let num = '';
        while (col < line.length && /[0-9._]/.test(line[col])) {
          if (line[col] !== '_') num += line[col];
          col++;
        }
        if (!/^-?[\d.]+$/.test(num)) throw new LexError(`不正な数値: ${num}`, lineNo, startCol + 1);
        emit('number', num, line.slice(startCol, col), startCol);
        continue;
      }
      if (isIdentStart(ch)) {
        let id = '';
        while (col < line.length && isIdentPart(line[col])) { id += line[col]; col++; }
        emit(KEYWORDS.has(id) ? 'kw' : 'ident', id, id, startCol);
        continue;
      }
      // 記号
      const two = line.slice(col, col + 2);
      if (two.length === 2 && OPS.includes(two)) {
        if (two === '(' || two === '[') parenDepth++;
        if (two === ')' || two === ']') parenDepth = Math.max(0, parenDepth - 1);
        emit('op', two, two, startCol); col += 2; continue;
      }
      const one = line[col];
      if (OPS.includes(one)) {
        if (one === '(' || one === '[') parenDepth++;
        if (one === ')' || one === ']') parenDepth = Math.max(0, parenDepth - 1);
        const kind = '()[]{},:.@'.includes(one) ? 'punct' : 'op';
        emit(kind, one, one, startCol); col++; continue;
      }
      throw new LexError(`予期しない文字: '${one}'`, lineNo, startCol + 1);
    }
    if (parenDepth === 0) {
      emit('newline', '\\n', '\\n', line.length);
    }
  }

  // 残ったインデントを閉じる
  while (indentStack.length > 1) {
    indentStack.pop();
    tokens.push({ kind: 'dedent', value: '', raw: '', line: lines.length + 1, col: 1, endCol: 1 });
  }
  tokens.push({ kind: 'eof', value: '', raw: '', line: lines.length + 1, col: 1, endCol: 1 });
  return tokens;
}

/** ハイライト用にトークン単位で CSS クラス名を返す */
export function tokenCssClass(t: Token): string {
  switch (t.kind) {
    case 'kw': return 'tok-kw';
    case 'string': return 'tok-str';
    case 'number': return 'tok-num';
    case 'comment': return 'tok-com';
    case 'ident': return 'tok-ident';
    case 'op': return 'tok-op';
    case 'punct': return 'tok-punct';
    default: return '';
  }
}
