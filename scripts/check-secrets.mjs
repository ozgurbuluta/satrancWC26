// Fails when a tracked file looks like it holds a credential or a private
// setting. This repository is public: keys belong in the host's environment
// settings, and .env.example holds placeholders only.
//
//   node scripts/check-secrets.mjs            tracked files
//   node scripts/check-secrets.mjs --history  every commit as well
import { execFileSync } from 'node:child_process';
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
// Test fixtures and the scanner itself contain look-alikes on purpose.
const SKIP = /^(package-lock\.json|LICENSE|scripts\/check-secrets\.mjs|tests\/analytics\.test\.ts)$/;

const git = (...args) => execFileSync('git', args, { encoding: 'utf8', maxBuffer: 256 * 1024 * 1024 });
const problems = [];

const scan = (where, text) => {
  text.split('\n').forEach((line, i) => {
    for (const [name, pattern] of RULES) {
      if (pattern.test(line)) problems.push(`${where}:${i + 1}  ${name}`);
    }
  });
};

const tracked = git('ls-files').split('\n').filter(Boolean);
for (const file of tracked) {
  if (/(^|\/)\.env(\..*)?$/.test(file) && !file.endsWith('.env.example')) problems.push(`${file}  env file is tracked`);
  if (SKIP.test(file) || /\.(png|jpg|jpeg|gif|webp|ico|wasm|woff2?)$/i.test(file)) continue;
  scan(file, readFileSync(file, 'utf8'));
}
if (tracked.includes('.env.example')) {
  for (const line of readFileSync('.env.example', 'utf8').split('\n')) {
    const m = /^\s*([A-Z0-9_]+)\s*=\s*(\S+)/.exec(line);
    if (m) problems.push(`.env.example  ${m[1]} has a value; placeholders must be empty`);
  }
}

if (process.argv.includes('--history')) {
  // Added lines of every commit on every branch, including files deleted since.
  const log = git('log', '--all', '-p', '--no-color', '--format=commit %H', '--', '.', ':(exclude)package-lock.json', ':(exclude)LICENSE', ':(exclude)scripts/check-secrets.mjs', ':(exclude)tests/analytics.test.ts');
  let commit = '';
  for (const line of log.split('\n')) {
    if (line.startsWith('commit ')) commit = line.slice(7, 14);
    else if (line.startsWith('+') && !line.startsWith('+++')) {
      for (const [name, pattern] of RULES) if (pattern.test(line)) problems.push(`history ${commit}  ${name}: ${line.slice(1, 60).trim()}…`);
    }
  }
  const everTracked = new Set(git('log', '--all', '--name-only', '--format=').split('\n').filter(Boolean));
  for (const file of everTracked) if (/(^|\/)\.env(\..*)?$/.test(file) && !file.endsWith('.env.example')) problems.push(`history  ${file} was committed at some point`);
}

if (problems.length) {
  console.error(`Possible secrets or private data (${problems.length}):\n` + [...new Set(problems)].map(p => '  ' + p).join('\n'));
  process.exit(1);
}
console.log(`No secrets found in ${tracked.length} tracked files${process.argv.includes('--history') ? ' or in the commit history' : ''}.`);
