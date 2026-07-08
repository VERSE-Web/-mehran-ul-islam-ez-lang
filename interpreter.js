'use strict';
// Ez language interpreter

const fs = require('fs');

// Reads a single line from stdin synchronously without needing a TTY-backed
// library. Works both when run interactively and when input is piped in.
function readLineSync() {
  const bufSize = 1;
  const buf = Buffer.alloc(bufSize);
  let line = '';
  for (;;) {
    let bytesRead;
    try {
      bytesRead = fs.readSync(0, buf, 0, bufSize, null);
    } catch (err) {
      if (err.code === 'EAGAIN') continue;
      if (err.code === 'EOF') break;
      throw err;
    }
    if (bytesRead === 0) break;
    const ch = buf.toString('utf8', 0, bytesRead);
    if (ch === '\n') break;
    if (ch !== '\r') line += ch;
  }
  return line;
}

class ReturnSignal {
  constructor(value) { this.value = value; }
}

class EzFunction {
  constructor(name, params, body) {
    this.name = name;
    this.params = params;
    this.body = body;
  }
}

class Env {
  constructor(parent = null) {
    this.vars = new Map();
    this.parent = parent;
  }
  define(name, value) { this.vars.set(name, value); }
  get(name) {
    let e = this;
    while (e) {
      if (e.vars.has(name)) return e.vars.get(name);
      e = e.parent;
    }
    throw new Error(`Ez: undefined variable '${name}'`);
  }
  has(name) {
    let e = this;
    while (e) { if (e.vars.has(name)) return true; e = e.parent; }
    return false;
  }
  set(name, value) {
    let e = this;
    while (e) {
      if (e.vars.has(name)) { e.vars.set(name, value); return true; }
      e = e.parent;
    }
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

function jsonToEz(value) {
  if (value === null || value === undefined) return null;
  if (Array.isArray(value)) return value.map(jsonToEz);
  if (typeof value === 'object') {
    const m = new Map();
    for (const k of Object.keys(value)) m.set(k, jsonToEz(value[k]));
    return m;
  }
  return value; // string, number, boolean
}

class Interpreter {
  constructor() {
    this.global = new Env();
  }

  run(program) {
    for (const stmt of program.body) {
      // bare identifier statement calling a zero-arg function, e.g. `Hello`
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
      case 'Let':
        env.define(node.name, this.evalExpr(node.value, env));
        return null;
      case 'ExprStmt':
        this.evalExpr(node.expr, env);
        return null;
      case 'If': {
        if (isTruthy(this.evalExpr(node.cond, env))) {
          return this.execBlock(node.thenBranch, env);
        } else if (node.elseBranch) {
          if (node.elseBranch.type === 'Block') return this.execBlock(node.elseBranch, env);
          return this.execStmt(node.elseBranch, env);
        }
        return null;
      }
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
      case 'Return':
        return new ReturnSignal(node.value ? this.evalExpr(node.value, env) : null);
      case 'Block':
        return this.execBlock(node, env);
      case 'FuncDef': {
        const fn = new EzFunction(node.name, node.params, node.body);
        this.global.define(node.name, fn);
        return null;
      }
      default:
        this.evalExpr(node, env);
        return null;
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
        // namespaced built-ins: print.console(...), print.alert(...), input.from(...)
        if (node.object.type === 'Ident') {
          const objName = node.object.name;
          if (objName === 'print' && !env.has('print')) {
            const args = node.args.map((a) => this.evalExpr(a, env));
            if (node.prop === 'console') {
              console.log(args.map(ezToDisplayString).join(' '));
              return null;
            }
            if (node.prop === 'alert') {
              console.error('[ALERT] ' + args.map(ezToDisplayString).join(' '));
              return null;
            }
            throw new Error(`Ez: unknown print.${node.prop}`);
          }
          if (objName === 'input' && node.prop === 'from' && !env.has('input')) {
            const args = node.args.map((a) => this.evalExpr(a, env));
            const label = typeof args[0] === 'string' ? args[0] : 'input';
            process.stdout.write(`${label}: `);
            return readLineSync();
          }
        }
        throw new Error(`Ez: unknown method '${node.prop}'`);
      }
      case 'Invoke': {
        // built-in get(url) -- synchronous-looking HTTP GET (uses a blocking wrapper)
        if (node.callee.type === 'Ident' && node.callee.name === 'get' && !env.has('get')) {
          const args = node.args.map((a) => this.evalExpr(a, env));
          const url = args[0];
          return this.httpGetSync(url);
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
        if (Array.isArray(base)) {
          while (base.length <= idx) base.push(null);
          base[idx] = v;
        } else if (base instanceof Map) {
          base.set(String(idx), v);
        }
        return v;
      }
      case 'MemberAssign': {
        const base = this.evalExpr(node.object, env);
        const v = this.evalExpr(node.value, env);
        if (base instanceof Map) base.set(node.prop, v);
        return v;
      }
      default:
        throw new Error(`Ez: cannot evaluate node type ${node.type}`);
    }
  }

  httpGetSync(url) {
    // Node has no built-in blocking fetch; we spawn a sync child process to keep
    // the Ez language's semantics simple (get(url).data works with no async/await).
    const { execFileSync } = require('child_process');
    const helper = require('path').join(__dirname, 'http-get-helper.js');
    try {
      const out = execFileSync(process.execPath, [helper, url], { encoding: 'utf8', maxBuffer: 1024 * 1024 * 32 });
      const parsed = JSON.parse(out);
      const m = new Map();
      m.set('ok', parsed.ok);
      m.set('status', parsed.status);
      m.set('text', parsed.text);
      let data = null;
      try { data = jsonToEz(JSON.parse(parsed.text)); } catch (_) { data = null; }
      m.set('data', data);
      return m;
    } catch (err) {
      const m = new Map();
      m.set('ok', false);
      m.set('status', 0);
      m.set('text', '');
      m.set('data', null);
      m.set('error', String(err.message || err));
      return m;
    }
  }
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

module.exports = { Interpreter, EzFunction, Env };
