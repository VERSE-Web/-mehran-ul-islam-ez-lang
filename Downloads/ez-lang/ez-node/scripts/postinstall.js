'use strict';
// Runs automatically after `npm install` (see package.json "postinstall").
// Copies the browser build (browser/ez.js) into the root of whichever
// project just installed this package, so it's ready to drop into an HTML
// page immediately -- no manual copying needed.

const fs = require('fs');
const path = require('path');

function main() {
  // INIT_CWD is set by npm to the directory the user actually ran
  // `npm install` from -- NOT this package's own folder inside node_modules.
  const targetDir = process.env.INIT_CWD || process.cwd();

  // Guard against copying onto ourselves when this script runs during our
  // own local development (e.g. `npm install` inside this repo itself).
  const packageRoot = path.resolve(__dirname, '..');
  if (path.resolve(targetDir) === path.resolve(packageRoot)) {
    return;
  }

  const src = path.join(packageRoot, 'browser', 'ez.js');
  const dest = path.join(targetDir, 'ez.js');

  if (!fs.existsSync(src)) {
    console.warn('[ez-lang] postinstall: could not find browser/ez.js to copy, skipping.');
    return;
  }

  try {
    if (fs.existsSync(dest)) {
      console.log('[ez-lang] ez.js already exists in your project root -- leaving it alone.');
      console.log('[ez-lang] (delete it and reinstall if you want the latest copy.)');
      return;
    }
    fs.copyFileSync(src, dest);
    console.log('[ez-lang] Copied ez.js into your project root -- drop a <script src="ez.js"> tag into your HTML to use it.');
  } catch (err) {
    console.warn('[ez-lang] postinstall: could not copy ez.js automatically:', err.message);
    console.warn(`[ez-lang] You can copy it yourself from: ${src}`);
  }
}

main();
