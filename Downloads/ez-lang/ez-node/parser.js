'use strict';
// Ez language parser (recursive descent) -> AST

const { tokenize } = require('./lexer');

function parse(src) {
  const tokens = tokenize(src);
  let pos = 0;

  const peek = () => tokens[pos];
  const check = (type) => peek().type === type;
  const advance = () => tokens[pos++];
  const match = (type) => (check(type) ? (advance(), true) : false);
  const expect = (type, what) => {
    if (!check(type)) throw new Error(`Ez: expected ${what} on line ${peek().line}, got ${peek().type}`);
    return advance();
  };

  function parseArgList() {
    const args = [];
    if (!check('RPAREN')) {
      do { args.push(parseExpr()); } while (match('COMMA'));
    }
    return args;
  }

  function parsePrimary() {
    if (check('NUM')) { const t = advance(); return { type: 'Num', value: t.value }; }
    if (check('STR')) { const t = advance(); return { type: 'Str', value: t.value }; }
    if (check('TRUE')) { advance(); return { type: 'Bool', value: true }; }
    if (check('FALSE')) { advance(); return { type: 'Bool', value: false }; }
    if (check('NULL')) { advance(); return { type: 'Null' }; }
    if (check('LBRACKET')) {
      advance();
      const items = [];
      if (!check('RBRACKET')) {
        do { items.push(parseExpr()); } while (match('COMMA'));
      }
      expect('RBRACKET', ']');
      return { type: 'Array', items };
    }
    if (check('LPAREN')) {
      advance();
      const e = parseExpr();
      expect('RPAREN', ')');
      return e;
    }
    if (check('IDENT')) {
      const t = advance();
      return { type: 'Ident', name: t.value };
    }
    throw new Error(`Ez: unexpected token '${peek().type}' on line ${peek().line}`);
  }

  function parsePostfix() {
    let n = parsePrimary();
    for (;;) {
      if (match('DOT')) {
        if (!check('IDENT')) throw new Error(`Ez: expected property name on line ${peek().line}`);
        const prop = advance().value;
        if (check('LPAREN')) {
          advance();
          const args = parseArgList();
          expect('RPAREN', ')');
          n = { type: 'Call', object: n, prop, args };
        } else {
          n = { type: 'Member', object: n, prop };
        }
      } else if (match('LBRACKET')) {
        const idx = parseExpr();
        expect('RBRACKET', ']');
        n = { type: 'Index', object: n, index: idx };
      } else if (check('LPAREN')) {
        advance();
        const args = parseArgList();
        expect('RPAREN', ')');
        n = { type: 'Invoke', callee: n, args };
      } else break;
    }
    return n;
  }

  function parseUnary() {
    if (check('NOT') || check('MINUS')) {
      const op = advance().type;
      return { type: 'Unop', op, expr: parseUnary() };
    }
    return parsePostfix();
  }

  const LEVELS = [
    ['STAR', 'SLASH', 'PERCENT'],
    ['PLUS', 'MINUS'],
    ['LT', 'GT', 'LE', 'GE'],
    ['EQ', 'NEQ'],
    ['AND'],
    ['OR'],
  ];

  function parseBinopLevel(level) {
    if (level >= LEVELS.length) return parseUnary();
    let left = parseBinopLevel(level + 1);
    while (LEVELS[level].includes(peek().type)) {
      const op = advance().type;
      const right = parseBinopLevel(level + 1);
      left = { type: 'Binop', op, left, right };
    }
    return left;
  }

  function parseAssign() {
    const left = parseBinopLevel(0);
    if (check('ASSIGN')) {
      advance();
      const right = parseAssign();
      if (left.type === 'Ident') return { type: 'Assign', name: left.name, value: right };
      if (left.type === 'Index') return { type: 'IndexAssign', object: left.object, index: left.index, value: right };
      if (left.type === 'Member') return { type: 'MemberAssign', object: left.object, prop: left.prop, value: right };
      throw new Error(`Ez: invalid assignment target on line ${peek().line}`);
    }
    return left;
  }

  function parseExpr() { return parseAssign(); }

  function parseBlock() {
    expect('LBRACE', '{');
    const body = [];
    while (!check('RBRACE') && !check('EOF')) body.push(parseStatement());
    expect('RBRACE', '}');
    return { type: 'Block', body };
  }

  function parseStatement() {
    if (check('LET')) {
      advance();
      const name = expect('IDENT', 'identifier').value;
      expect('ASSIGN', '=');
      const value = parseExpr();
      match('SEMI');
      return { type: 'Let', name, value };
    }
    if (check('FUNCTION')) {
      advance();
      let name;
      if (check('STR')) name = advance().value;
      else name = expect('IDENT', 'function name').value;
      const params = [];
      if (match('LPAREN')) {
        if (!check('RPAREN')) {
          do { params.push(expect('IDENT', 'parameter name').value); } while (match('COMMA'));
        }
        expect('RPAREN', ')');
      }
      expect('ASSIGN', '=');
      const body = parseBlock();
      return { type: 'FuncDef', name, params, body };
    }
    if (check('IF')) {
      advance();
      expect('LPAREN', '(');
      const cond = parseExpr();
      expect('RPAREN', ')');
      const thenBranch = parseBlock();
      let elseBranch = null;
      if (match('ELSE')) {
        elseBranch = check('IF') ? parseStatement() : parseBlock();
      }
      return { type: 'If', cond, thenBranch, elseBranch };
    }
    if (check('WHILE')) {
      advance();
      expect('LPAREN', '(');
      const cond = parseExpr();
      expect('RPAREN', ')');
      const body = parseBlock();
      return { type: 'While', cond, body };
    }
    if (check('FOR')) {
      advance();
      expect('LPAREN', '(');
      const init = parseStatement();
      const cond = parseExpr();
      expect('SEMI', ';');
      const post = parseExpr();
      expect('RPAREN', ')');
      const body = parseBlock();
      return { type: 'For', init, cond, post, body };
    }
    if (check('RETURN')) {
      advance();
      let value = null;
      if (!check('SEMI') && !check('RBRACE')) value = parseExpr();
      match('SEMI');
      return { type: 'Return', value };
    }
    if (check('LBRACE')) return parseBlock();

    const expr = parseExpr();
    match('SEMI');
    return { type: 'ExprStmt', expr };
  }

  const program = [];
  while (!check('EOF')) program.push(parseStatement());
  return { type: 'Program', body: program };
}

module.exports = { parse };
