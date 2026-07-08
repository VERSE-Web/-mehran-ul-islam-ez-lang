#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const { parse } = require('./parser');
const { Interpreter } = require('./interpreter');

function main() {
  const file = process.argv[2];
  if (!file) {
    console.error('Usage: ez <file.ez>');
    process.exit(1);
  }
  const fullPath = path.resolve(process.cwd(), file);
  let src;
  try {
    src = fs.readFileSync(fullPath, 'utf8');
  } catch (err) {
    console.error(`Ez: cannot open ${file}`);
    process.exit(1);
  }

  try {
    const program = parse(src);
    const interp = new Interpreter();
    interp.run(program);
  } catch (err) {
    console.error(err.message || String(err));
    process.exit(1);
  }
}

main();
