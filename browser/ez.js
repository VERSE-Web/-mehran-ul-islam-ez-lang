/* ============================================================
   Ez for the browser.
   Drop this file into a page with <script src="ez.js"></script>,
   then write your Ez code in <script type="text/ez">...</script>
   tags (inline) or <script type="text/ez" src="app.ez"></script>
   (external file), just like you would with a normal JS <script>.

   In the browser:
     print.console(x)   -> console.log
     print.alert(x)     -> window.alert (a real popup)
     input.from("id")   -> document.getElementById("id").value
     get(url)            -> real HTTP GET (blocking, via sync XHR),
                             returns { ok, status, text, data }
   ============================================================ */
(function (global) {
  'use strict';

  /* ---------------- Lexer ---------------- */
  const KEYWORDS = new Set([
    'let', 'function', 'if', 'else', 'while', 'for', 'return',
    'true', 'false', 'null'
  ]);

  function tokenize(src) {
    const tokens = [];
    let i = 0, line = 1;
    const n = src.length;
    const peek = (off = 0) => src[i + off];

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
        if (KEYWORDS.has(word)) tokens.push({ type: word.toUpperCase(), value: word, line });
        else tokens.push({ type: 'IDENT', value: word, line });
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
      if (single[c]) { tokens.push({ type: single[c], value: c, line }); i++; continue; }

      throw new Error(`Ez: unexpected character '${c}' on line ${line}`);
    }

    tokens.push({ type: 'EOF', value: null, line });
    return tokens;
  }

  /* ---------------- Parser ---------------- */
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
      if (!check('RPAREN')) { do { args.push(parseExpr()); } while (match('COMMA')); }
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
        if (!check('RBRACKET')) { do { items.push(parseExpr()); } while (match('COMMA')); }
        expect('RBRACKET', ']');
        return { type: 'Array', items };
      }
      if (check('LPAREN')) { advance(); const e = parseExpr(); expect('RPAREN', ')'); return e; }
      if (check('IDENT')) { const t = advance(); return { type: 'Ident', name: t.value }; }
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
        if (match('ELSE')) elseBranch = check('IF') ? parseStatement() : parseBlock();
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

  /* ---------------- Interpreter ---------------- */
  class ReturnSignal { constructor(value) { this.value = value; } }
  class EzFunction {
    constructor(name, params, body) { this.name = name; this.params = params; this.body = body; }
  }
  class Env {
    constructor(parent = null) { this.vars = new Map(); this.parent = parent; }
    define(name, value) { this.vars.set(name, value); }
    get(name) {
      let e = this;
      while (e) { if (e.vars.has(name)) return e.vars.get(name); e = e.parent; }
      throw new Error(`Ez: undefined variable '${name}'`);
    }
    has(name) { let e = this; while (e) { if (e.vars.has(name)) return true; e = e.parent; } return false; }
    set(name, value) {
      let e = this;
      while (e) { if (e.vars.has(name)) { e.vars.set(name, value); return true; } e = e.parent; }
      return false;
    }
  }

  function isTruthy(v) {
    if (v === null || v === undefined) return false;
    if (typeof v === 'boolean') return v;
    if (typeof v === 'number') return v !== 0;
    if (typeof v === 'string') return v.length > 0;
    if (Array.isArray(v)) return v.length > 0;
    if (v instanceof Map) return v.size > 0;
    return true;
  }

  function ezToDisplayString(v) {
    if (v === null || v === undefined) return 'null';
    if (typeof v === 'boolean') return v ? 'true' : 'false';
    if (typeof v === 'number') return String(v);
    if (typeof v === 'string') return v;
    if (Array.isArray(v)) return '[' + v.map(ezToDisplayString).join(', ') + ']';
    if (v instanceof Map) {
      const parts = [];
      for (const [k, val] of v.entries()) parts.push(`${k}: ${ezToDisplayString(val)}`);
      return '{' + parts.join(', ') + '}';
    }
    if (v instanceof EzFunction) return `<function ${v.name}>`;
    return String(v);
  }

  function ezEquals(a, b) {
    if (a === null && b === null) return true;
    if (typeof a !== typeof b) return false;
    if (Array.isArray(a) && Array.isArray(b)) {
      if (a.length !== b.length) return false;
      return a.every((v, i) => ezEquals(v, b[i]));
    }
    return a === b;
  }

  function jsonToEz(value) {
    if (value === null || value === undefined) return null;
    if (Array.isArray(value)) return value.map(jsonToEz);
    if (typeof value === 'object') {
      const m = new Map();
      for (const k of Object.keys(value)) m.set(k, jsonToEz(value[k]));
      return m;
    }
    return value;
  }

  class Interpreter {
    constructor() { this.global = new Env(); }

    run(program) {
      for (const stmt of program.body) {
        if (stmt.type === 'ExprStmt' && stmt.expr.type === 'Ident') {
          const val = this.global.has(stmt.expr.name) ? this.global.get(stmt.expr.name) : undefined;
          if (val instanceof EzFunction) { this.callFunction(val, []); continue; }
        }
        this.execStmt(stmt, this.global);
      }
    }

    execBlock(block, parentEnv, isFunctionBody = false) {
      const env = isFunctionBody ? parentEnv : new Env(parentEnv);
      for (const stmt of block.body) {
        const sig = this.execStmt(stmt, env);
        if (sig instanceof ReturnSignal) return sig;
      }
      return null;
    }

    execStmt(node, env) {
      switch (node.type) {
        case 'Let': env.define(node.name, this.evalExpr(node.value, env)); return null;
        case 'ExprStmt': this.evalExpr(node.expr, env); return null;
        case 'If':
          if (isTruthy(this.evalExpr(node.cond, env))) return this.execBlock(node.thenBranch, env);
          if (node.elseBranch) {
            if (node.elseBranch.type === 'Block') return this.execBlock(node.elseBranch, env);
            return this.execStmt(node.elseBranch, env);
          }
          return null;
        case 'While': {
          while (isTruthy(this.evalExpr(node.cond, env))) {
            const sig = this.execBlock(node.body, env);
            if (sig instanceof ReturnSignal) return sig;
          }
          return null;
        }
        case 'For': {
          const forEnv = new Env(env);
          this.execStmt(node.init, forEnv);
          while (isTruthy(this.evalExpr(node.cond, forEnv))) {
            const sig = this.execBlock(node.body, forEnv);
            if (sig instanceof ReturnSignal) return sig;
            this.evalExpr(node.post, forEnv);
          }
          return null;
        }
        case 'Return': return new ReturnSignal(node.value ? this.evalExpr(node.value, env) : null);
        case 'Block': return this.execBlock(node, env);
        case 'FuncDef': {
          const fn = new EzFunction(node.name, node.params, node.body);
          this.global.define(node.name, fn);
          return null;
        }
        default: this.evalExpr(node, env); return null;
      }
    }

    callFunction(fn, args) {
      const fnEnv = new Env(this.global);
      fn.params.forEach((p, i) => fnEnv.define(p, i < args.length ? args[i] : null));
      const sig = this.execBlock(fn.body, fnEnv, true);
      return sig instanceof ReturnSignal ? sig.value : null;
    }

    evalExpr(node, env) {
      switch (node.type) {
        case 'Num': return node.value;
        case 'Str': return node.value;
        case 'Bool': return node.value;
        case 'Null': return null;
        case 'Ident': return env.get(node.name);
        case 'Array': return node.items.map((it) => this.evalExpr(it, env));
        case 'Index': {
          const base = this.evalExpr(node.object, env);
          const idx = this.evalExpr(node.index, env);
          if (Array.isArray(base)) return base[idx] ?? null;
          if (base instanceof Map) return base.has(String(idx)) ? base.get(String(idx)) : null;
          return null;
        }
        case 'Member': {
          const base = this.evalExpr(node.object, env);
          if (base instanceof Map) return base.has(node.prop) ? base.get(node.prop) : null;
          return null;
        }
        case 'Call': {
          if (node.object.type === 'Ident') {
            const objName = node.object.name;
            if (objName === 'print' && !env.has('print')) {
              const args = node.args.map((a) => this.evalExpr(a, env));
              if (node.prop === 'console') { console.log(...args.map(ezToDisplayString)); return null; }
              if (node.prop === 'alert') { global.alert(args.map(ezToDisplayString).join(' ')); return null; }
              throw new Error(`Ez: unknown print.${node.prop}`);
            }
            if (objName === 'input' && node.prop === 'from' && !env.has('input')) {
              const args = node.args.map((a) => this.evalExpr(a, env));
              const id = args[0];
              const el = global.document.getElementById(id);
              if (!el) throw new Error(`Ez: input.from("${id}") - no element with that id found on the page`);
              return el.value !== undefined ? el.value : el.textContent;
            }
          }
          throw new Error(`Ez: unknown method '${node.prop}'`);
        }
        case 'Invoke': {
          if (node.callee.type === 'Ident' && node.callee.name === 'get' && !env.has('get')) {
            const args = node.args.map((a) => this.evalExpr(a, env));
            return httpGetSync(args[0]);
          }
          const fn = this.evalExpr(node.callee, env);
          if (!(fn instanceof EzFunction)) throw new Error('Ez: attempted to call a non-function');
          const args = node.args.map((a) => this.evalExpr(a, env));
          return this.callFunction(fn, args);
        }
        case 'Unop': {
          const v = this.evalExpr(node.expr, env);
          if (node.op === 'NOT') return !isTruthy(v);
          if (node.op === 'MINUS') return -Number(v);
          return null;
        }
        case 'Binop': {
          if (node.op === 'AND') {
            const l = this.evalExpr(node.left, env);
            if (!isTruthy(l)) return false;
            return isTruthy(this.evalExpr(node.right, env));
          }
          if (node.op === 'OR') {
            const l = this.evalExpr(node.left, env);
            if (isTruthy(l)) return true;
            return isTruthy(this.evalExpr(node.right, env));
          }
          const l = this.evalExpr(node.left, env);
          const r = this.evalExpr(node.right, env);
          if (node.op === 'PLUS' && (typeof l === 'string' || typeof r === 'string')) {
            return ezToDisplayString(l) + ezToDisplayString(r);
          }
          if (node.op === 'EQ') return ezEquals(l, r);
          if (node.op === 'NEQ') return !ezEquals(l, r);
          const a = Number(l), b = Number(r);
          switch (node.op) {
            case 'PLUS': return a + b;
            case 'MINUS': return a - b;
            case 'STAR': return a * b;
            case 'SLASH': return a / b;
            case 'PERCENT': return a % b;
            case 'LT': return a < b;
            case 'GT': return a > b;
            case 'LE': return a <= b;
            case 'GE': return a >= b;
            default: return null;
          }
        }
        case 'Assign': {
          const v = this.evalExpr(node.value, env);
          if (!env.set(node.name, v)) env.define(node.name, v);
          return v;
        }
        case 'IndexAssign': {
          const base = this.evalExpr(node.object, env);
          const idx = this.evalExpr(node.index, env);
          const v = this.evalExpr(node.value, env);
          if (Array.isArray(base)) { while (base.length <= idx) base.push(null); base[idx] = v; }
          else if (base instanceof Map) base.set(String(idx), v);
          return v;
        }
        case 'MemberAssign': {
          const base = this.evalExpr(node.object, env);
          const v = this.evalExpr(node.value, env);
          if (base instanceof Map) base.set(node.prop, v);
          return v;
        }
        default: throw new Error(`Ez: cannot evaluate node type ${node.type}`);
      }
    }
  }

  function httpGetSync(url) {
    // Real network call, made to look blocking/synchronous the way the rest
    // of Ez behaves (no async/await in the language). Uses the deprecated
    // synchronous XMLHttpRequest mode -- fine for small demo/learning use,
    // but it freezes the page while the request is in flight, so don't lean
    // on this for anything performance sensitive.
    const result = new Map();
    try {
      const xhr = new global.XMLHttpRequest();
      xhr.open('GET', url, false); // false = synchronous
      xhr.send(null);
      const text = xhr.responseText || '';
      result.set('ok', xhr.status >= 200 && xhr.status < 300);
      result.set('status', xhr.status);
      result.set('text', text);
      try { result.set('data', jsonToEz(JSON.parse(text))); } catch (_) { result.set('data', null); }
    } catch (err) {
      result.set('ok', false);
      result.set('status', 0);
      result.set('text', '');
      result.set('data', null);
      result.set('error', String(err.message || err));
    }
    return result;
  }

  /* ---------------- Page loader ----------------
     Scans <script type="text/ez"> tags (inline or with src=) and runs them
     in document order, same way the browser handles normal <script> tags. */
  function runSource(src, interp) {
    const program = parse(src);
    interp.run(program);
  }

  function loadAndRunScripts() {
    const pageInterp = new Interpreter(); // shared globals across all text/ez tags, like real <script> tags
    const scripts = global.document.querySelectorAll('script[type="text/ez"]');
    scripts.forEach((tag) => {
      try {
        if (tag.src) {
          const xhr = new global.XMLHttpRequest();
          xhr.open('GET', tag.src, false);
          xhr.send(null);
          runSource(xhr.responseText, pageInterp);
        } else {
          runSource(tag.textContent, pageInterp);
        }
      } catch (err) {
        console.error('[Ez error]', err.message || err);
      }
    });

    // Bridge so HTML can call Ez functions, e.g. <button onclick="EzRuntime.call('greet')">
    global.EzRuntime = {
      call(name, ...args) {
        const fn = pageInterp.global.has(name) ? pageInterp.global.get(name) : undefined;
        if (!(fn instanceof EzFunction)) throw new Error(`Ez: no function named '${name}' is defined`);
        return pageInterp.callFunction(fn, args);
      }
    };
  }

  if (global.document) {
    if (global.document.readyState === 'loading') {
      global.document.addEventListener('DOMContentLoaded', loadAndRunScripts);
    } else {
      loadAndRunScripts();
    }
  }

  global.Ez = {
    tokenize,
    parse,
    Interpreter,
    run(src) {
      const interp = new Interpreter();
      runSource(src, interp);
      return interp;
    }
  };
})(typeof window !== 'undefined' ? window : globalThis);
