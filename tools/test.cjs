'use strict';
const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

const root = path.resolve(__dirname, '..');
const files = fs.readdirSync(root)
  .filter(f => f.startsWith('test_') && f.endsWith('.js'))
  .sort();

console.log(`Executing ${files.length} regression test suites...\n`);

let passed = 0;
for (const file of files) {
  process.stdout.write(`• Running ${file}... `);
  try {
    execFileSync(process.execPath, [path.join(root, file)], {
      cwd: root,
      stdio: 'pipe',
      encoding: 'utf8'
    });
    console.log('PASSED');
    passed++;
  } catch (err) {
    console.log('FAILED');
    console.error(`\nError in ${file}:`);
    if (err.stdout) console.log(err.stdout);
    if (err.stderr) console.error(err.stderr);
    process.exit(1);
  }
}

console.log(`\nAll ${passed}/${files.length} test suites passed with 0 errors.`);
