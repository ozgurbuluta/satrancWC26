// Fails when a tracked file looks like it holds a credential or a private
// setting. This repository is public: keys belong in the host's environment
// settings, and .env.example holds placeholders only.
//
//   node scripts/check-secrets.mjs            tracked files
//   node scripts/check-secrets.mjs --history  every commit on every branch as well
//
// Output names the place and the rule, never the matched text: this runs in
// public CI logs, and a real secret must not be copied into them.
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';

const RULES = [
  ['PostHog project key', /phc_[A-Za-z0-9]{20,}/],
  ['PostHog personal key', /ph[xs]_[A-Za-z0-9]{20,}/],
  ['GitHub token', /\b(gh[pousr]_[A-Za-z0-9]{30,}|github_pat_[A-Za-z0-9_]{30,})/],
  ['Vercel token', /\bvercel_[A-Za-z0-9]{20,}/i],
  ['AWS access key', /\bAKIA[0-9A-Z]{16}\b/],
  ['Google API key', /\bAIza[0-9A-Za-z_-]{35}\b/],
  ['Stripe key', /\b[rs]k_(live|test)_[A-Za-z0-9]{20,}/],
  ['Slack token', /\bxox[abprs]-[A-Za-z0-9-]{10,}/],
  ['private key block', /-----BEGIN [A-Z ]*PRIVATE KEY-----/],
  ['bearer token', /\bBearer\s+[A-Za-z0-9._-]{30,}/],
  ['JSON web token', /\beyJ[A-Za-z0-9_-]{15,}\.eyJ[A-Za-z0-9_-]{15,}\./],
  ['credentials in a URL', /\b[a-z][a-z0-9+.-]*:\/\/[^\s/:@'"`]+:[^\s/@'"`]+@[a-z0-9.-]+/i],
  ['non-noreply email address', /\b[A-Za-z0-9._%+-]+@(?!users\.noreply\.github\.com\b|example\.(com|org)\b|anthropic\.com\b)[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/],
];

// Lines that look like credentials on purpose, each one named individually.
// They are made-up fixtures from the first committed version of the analytics
// tests. That file has been rewritten since and needs no exception today;
// these entries only cover the old commit, which stays in the history. A line
// is listed by the SHA-256 of its text, so nothing else in that file, and no
// changed version of these lines, is exempt. No whole file is skipped.
// To add one: `node scripts/check-secrets.mjs --history --fingerprints`
// prints the hashes (never the text) of what is currently flagged.
const KNOWN_FIXTURE_LINES = new Set([
  // tests/analytics.test.ts as first committed (1d5ded6): six made-up addresses with a login or a mailbox in them
  '206ed77bfa24026e9ef5aa4f2b6bc26b87ec558547bb5675d487fa23a043d0b9',
  '731b82882d8cec2d838dffd7785674babd427161ef87978f3185556d8d0677f1',
  '7f2b95176f6fb64b75e3432fcb0b968c76532f518c77b87bea8cba3f186c6588',
  'aa7f8a076d857840f85a2f765d41da858b5b6588277cf99670bc43c453212fe5',
  'c4b50adc0b4a3a029eaa4462c13e9da271f6511ff4a30f881b93d4e3903897dc',
  'fcedc1abbfc5cb5ea13a2055b3609cc4a8181fc3944661753930b1a43b026179',
]);

const BINARY = /\.(png|jpg|jpeg|gif|webp|ico|wasm|woff2?)$/i;
const fingerprint = line => createHash('sha256').update(line.trim()).digest('hex');
const git = (...args) => execFileSync('git', args, { encoding: 'utf8', maxBuffer: 512 * 1024 * 1024 });

/** One finding: where and which rule. The matched text is never kept. */
const findings = [];
const fingerprints = [];
const check = (where, line) => {
  for (const [rule, pattern] of RULES) {
    if (!pattern.test(line)) continue;
    const print = fingerprint(line);
    if (KNOWN_FIXTURE_LINES.has(print)) continue;
    findings.push(`${where}  ${rule}`);
    fingerprints.push(`${print}  ${where}  ${rule}`);
  }
};

const tracked = git('ls-files').split('\n').filter(Boolean);
for (const file of tracked) {
  if (/(^|\/)\.env(\..*)?$/.test(file) && !file.endsWith('.env.example')) findings.push(`${file}  env file is tracked`);
  if (BINARY.test(file)) continue;
  readFileSync(file, 'utf8')
    .split('\n')
    .forEach((line, i) => check(`${file}:${i + 1}`, line));
}
if (tracked.includes('.env.example')) {
  readFileSync('.env.example', 'utf8')
    .split('\n')
    .forEach((line, i) => {
      if (/^\s*[A-Z0-9_]+\s*=\s*\S/.test(line)) findings.push(`.env.example:${i + 1}  placeholder has a value`);
    });
}

if (process.argv.includes('--history')) {
  // Added lines of every commit on every branch, including files deleted since.
  const log = git('log', '--all', '-p', '--no-color', '--format=commit %H');
  let commit = '';
  let file = '';
  let lineNo = 0;
  for (const line of log.split('\n')) {
    if (line.startsWith('commit ')) commit = line.slice(7, 14);
    else if (line.startsWith('+++ ')) file = line.slice(4).replace(/^b\//, '');
    else if (line.startsWith('@@')) lineNo = Number(/\+(\d+)/.exec(line)?.[1] ?? 1) - 1;
    else if (line.startsWith('+')) {
      lineNo++;
      if (!BINARY.test(file)) check(`commit ${commit}  ${file}:${lineNo}`, line.slice(1));
    } else if (!line.startsWith('-')) lineNo++;
  }
  const everTracked = new Set(git('log', '--all', '--name-only', '--format=').split('\n').filter(Boolean));
  for (const name of everTracked) {
    if (/(^|\/)\.env(\..*)?$/.test(name) && !name.endsWith('.env.example')) findings.push(`history  ${name}  env file was committed at some point`);
  }
}

if (process.argv.includes('--fingerprints')) {
  // For maintaining KNOWN_FIXTURE_LINES: hashes only, still no matched text.
  console.log([...new Set(fingerprints)].join('\n'));
  process.exit(0);
}

if (findings.length) {
  const unique = [...new Set(findings)];
  console.error(`Possible secrets or private data (${unique.length}). Place and rule only; the text is not shown:\n` + unique.map(f => '  ' + f).join('\n'));
  process.exit(1);
}
console.log(`No secrets found in ${tracked.length} tracked files${process.argv.includes('--history') ? ' or in the commit history' : ''}.`);
