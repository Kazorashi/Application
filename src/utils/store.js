const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const FILE = path.join(__dirname, '..', '..', 'data', 'seen.json');
const ROOT = path.join(__dirname, '..', '..');

function load() {
  try {
    if (!fs.existsSync(FILE)) return {};
    return JSON.parse(fs.readFileSync(FILE, 'utf8') || '{}');
  } catch {
    return {};
  }
}

function save(data) {
  fs.mkdirSync(path.dirname(FILE), { recursive: true });
  fs.writeFileSync(FILE, JSON.stringify(data, null, 2));
}

let cache = load();

function has(logMessageId) {
  return Boolean(cache[logMessageId]);
}

function mark(logMessageId, value) {
  cache[logMessageId] = value || true;
  save(cache);
}

// First run marks existing approvals as seen (baseline) so we never
// spam the forum with old applications on first deploy / after outages.
function isInitialized() {
  return Boolean(cache.__init);
}

function markInitialized() {
  cache.__init = true;
  save(cache);
}

// GitHub Actions runners have ephemeral disks -> push state back to the repo
// so the next queued run (and restarts) keep dedupe continuity.
function flush() {
  if (process.env.GITHUB_ACTIONS !== 'true') return;
  const opts = { cwd: ROOT, stdio: 'pipe' };
  try {
    execSync('git add data/seen.json', opts);
    try {
      execSync('git diff --cached --quiet', opts);
      return; // nothing staged
    } catch {
      /* staged changes exist -> commit them */
    }
    execSync('git config user.name "github-actions[bot]"', opts);
    execSync('git config user.email "41898282+github-actions[bot]@users.noreply.github.com"', opts);
    execSync('git commit -m "chore: save seen store"', opts);
    try {
      execSync('git pull --rebase origin main', opts);
    } catch {
      /* rebase may fail on detached HEAD; push anyway */
    }
    execSync('git push origin HEAD:main', opts);
    console.log('[store] seen.json pushed to repo');
  } catch (e) {
    console.error('[store] flush failed:', String(e.message).slice(0, 300));
  }
}

module.exports = { has, mark, isInitialized, markInitialized, flush };
