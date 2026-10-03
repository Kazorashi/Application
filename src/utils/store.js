const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const FILE = path.join(__dirname, '..', '..', 'data', 'seen.json');
const ROOT = path.join(__dirname, '..', '..');
const GIT_OPTS = { cwd: ROOT, stdio: 'pipe' };

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

function reload() {
  cache = load();
}

function has(logMessageId) {
  return Boolean(cache[logMessageId]);
}

function mark(logMessageId, value) {
  cache[logMessageId] = value || true;
  save(cache);
}

function unmark(logMessageId) {
  delete cache[logMessageId];
  save(cache);
}

// Claims left behind by a crashed session ('posting' never resolved).
// Unmark them so the application gets retried; the forum-content check
// guarantees no duplicate if the post actually went through before the crash.
function takeStaleClaims() {
  const ids = Object.keys(cache).filter((k) => cache[k] === 'posting');
  for (const id of ids) delete cache[id];
  if (ids.length) save(cache);
  return ids;
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

function hasRemote() {
  try {
    execSync('git remote get-url origin', GIT_OPTS);
    return true;
  } catch {
    return false;
  }
}

// Commit + push seen.json to the repo so EVERY runner (local, Actions, VPS)
// shares one dedupe state. Runs everywhere, not just on Actions.
function flush() {
  if (!hasRemote()) return;
  try {
    execSync('git add data/seen.json', GIT_OPTS);
    let dirty = true;
    try {
      execSync('git diff --cached --quiet', GIT_OPTS);
      dirty = false;
    } catch {
      /* staged changes exist */
    }
    if (!dirty) return;
    if (process.env.GITHUB_ACTIONS === 'true') {
      execSync('git config user.name "github-actions[bot]"', GIT_OPTS);
      execSync('git config user.email "41898282+github-actions[bot]@users.noreply.github.com"', GIT_OPTS);
    }
    execSync('git commit -m "chore: save seen store"', GIT_OPTS);
    execSync('git pull --rebase --autostash origin main', GIT_OPTS);
    execSync('git push origin HEAD:main', GIT_OPTS);
    console.log('[store] seen.json pushed to repo');
  } catch (e) {
    console.error('[store] flush failed:', String(e.message).slice(0, 300));
  }
}

// Pull the repo's state and reload it, so this instance picks up posts made
// by the other instance (local <-> Actions). Called before any post attempt.
function syncPull() {
  if (!hasRemote()) return false;
  try {
    execSync('git pull --rebase --autostash origin main', GIT_OPTS);
    reload();
    return true;
  } catch (e) {
    console.error('[store] sync failed:', String(e.message).slice(0, 300));
    return false;
  }
}

module.exports = { has, mark, unmark, reload, takeStaleClaims, isInitialized, markInitialized, flush, syncPull };
