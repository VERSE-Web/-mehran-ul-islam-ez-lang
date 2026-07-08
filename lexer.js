'use strict';
// Ez language lexer

const KEYWORDS = new Set([
  'let', 'function', 'if', 'else', 'while', 'for', 'return',
  'true', 'false', 'null'
]);

function tokenize(src) {
  const tokens = [];
  let i = 0, line = 1;
  const n = src.length;

  function peek(off = 0) { return src[i + off]; }

  while (i < n) {
    const c = src[i];

    if (c === ' ' || c === '\t' || c === '\r') { i++; continue; }
    if (c === '\n') { i++; line++; continue; }
    if (c === '/' && peek(1) === '/') { while (i < n && src[i] !== '\n') i++; continue; }
    if (c === '#') { while (i < n && src[i] !== '\n') i++; continue; }

    if (/[0-9]/.test(c)) {
      let start = i;
      while (i < n && /[0-9]/.test(src[i])) i++;
      if (src[i] === '.' && /[0-9]/.test(src[i + 1])) {
        i++;
        while (i < n && /[0-9]/.test(src[i])) i++;
      }
      tokens.push({ type: 'NUM', value: parseFloat(src.slice(start, i)), line });
      continue;
    }

    if (c === '"' || c === "'") {
      const quote = c;
      i++;
      let start = i;
      while (i < n && src[i] !== quote) i++;
      const text = src.slice(start, i);
      if (src[i] === quote) i++;
      tokens.push({ type: 'STR', value: text, line });
      continue;
    }

    if (/[A-Za-z_]/.test(c)) {
      let start = i;
      while (i < n && /[A-Za-z0-9_]/.test(src[i])) i++;
      const word = src.slice(start, i);
      if (KEYWORDS.has(word)) {
        tokens.push({ type: word.toUpperCase(), value: word, line });
      } else {
        tokens.push({ type: 'IDENT', value: word, line });
      }
      continue;
    }

    const two = src.slice(i, i + 2);
    if (['==', '!=', '<=', '>=', '&&', '||'].includes(two)) {
      const map = { '==': 'EQ', '!=': 'NEQ', '<=': 'LE', '>=': 'GE', '&&': 'AND', '||': 'OR' };
      tokens.push({ type: map[two], value: two, line });
      i += 2;
      continue;
    }

    const single = {
      '{': 'LBRACE', '}': 'RBRACE', '(': 'LPAREN', ')': 'RPAREN',
      '[': 'LBRACKET', ']': 'RBRACKET', ';': 'SEMI', ',': 'COMMA',
      '.': 'DOT', '=': 'ASSIGN', '<': 'LT', '>': 'GT', '+': 'PLUS',
      '-': 'MINUS', '*': 'STAR', '/': 'SLASH', '%': 'PERCENT', '!': 'NOT'
    };
    if (single[c]) {
      tokens.push({ type: single[c], value: c, line });
      i++;
      continue;
    }

    throw new Error(`Ez: unexpected character '${c}' on line ${line}`);
  }

  tokens.push({ type: 'EOF', value: null, line });
  return tokens;
}

module.exports = { tokenize };
