/**
 * Lists every known app bug and where it is used.
 *
 *   npm run known-bugs            prints the list
 *   npm run known-bugs -- --check exits 1 if a test uses a key that is not listed
 */
import fs from 'node:fs';
import path from 'node:path';
import knownBugs from '../known-bugs.json';

const root = path.resolve(__dirname, '..');
const bugs: Record<string, { issue: string; description: string }> = knownBugs;

function testFiles(dir: string): string[] {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) return testFiles(full);
    return entry.name.endsWith('.ts') ? [full] : [];
  });
}

const usage = new Map<string, string[]>();
for (const file of testFiles(path.join(root, 'tests'))) {
  const source = fs.readFileSync(file, 'utf8');
  for (const match of source.matchAll(/knownBug\(\s*['"]([^'"]+)['"]\s*\)/g)) {
    usage.set(match[1], [...(usage.get(match[1]) ?? []), path.relative(root, file).replace(/\\/g, '/')]);
  }
}

console.log('| Key | Issue | Description | Used in |');
console.log('| --- | --- | --- | --- |');
for (const [key, bug] of Object.entries(bugs)) {
  const files = [...new Set(usage.get(key) ?? [])].join(', ') || 'not used';
  console.log(`| ${key} | ${bug.issue || 'no issue linked'} | ${bug.description} | ${files} |`);
}

const unused = Object.keys(bugs).filter((key) => !usage.has(key));
const unlisted = [...usage.keys()].filter((key) => !(key in bugs));
if (unused.length) console.log(`\nListed but not used by any test: ${unused.join(', ')}`);
if (unlisted.length) console.log(`\nUsed by a test but missing from known-bugs.json: ${unlisted.join(', ')}`);
// An unused entry is only a note; a test using an unlisted key is an error.
if (process.argv.includes('--check') && unlisted.length) process.exit(1);
