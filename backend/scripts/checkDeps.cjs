/**
 * Checks that every declared dependency is actually installed, before anything tries to
 * import one.
 *
 * Runs automatically as `premigrate`, `prestart` and `predev`, so it is not something to
 * remember. It exists because the failure it replaces is unhelpful: Node reports a missing
 * package as
 *
 *     Error [ERR_MODULE_NOT_FOUND]: Cannot find package 'pg' imported from .../config/db.js
 *
 * followed by ten lines of internal stack, which reads like a bug in the project rather than
 * what it is — `npm install` has not been run, or was run before a dependency was added.
 * That happens on every fresh clone, because node_modules is deliberately not committed.
 *
 * Deliberately CommonJS (hence .cjs — the project is "type": "module") and nothing outside
 * Node's standard library: a script whose job is to report missing dependencies cannot have
 * any, and must not need a loader that works only once they are installed.
 */
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');
const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'));
const declared = Object.keys(pkg.dependencies || {});

const missing = declared.filter((name) => {
  try {
    // Resolving from the project root is what an import inside the project does.
    require.resolve(name, { paths: [ROOT] });
    return false;
  } catch {
    return true;
  }
});

if (missing.length === 0) process.exit(0);

const everything = !fs.existsSync(path.join(ROOT, 'node_modules'));

console.error('');
if (everything) {
  console.error('  Dependencies are not installed.');
  console.error('');
  console.error('  node_modules is not in the download — it is hundreds of megabytes and is');
  console.error('  rebuilt from package.json. Run this first, in the backend folder:');
} else {
  console.error(`  ${missing.length} dependenc${missing.length === 1 ? 'y is' : 'ies are'} missing: ${missing.join(', ')}`);
  console.error('');
  console.error('  node_modules exists but is out of date — it was installed before these were');
  console.error('  added. Run this in the backend folder:');
}
console.error('');
console.error('      npm install');
console.error('');
process.exit(1);
