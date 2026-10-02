const fs = require('fs');
const path = require('path');

const FILE = path.join(__dirname, '..', '..', 'data', 'seen.json');

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

function mark(logMessageId, threadId) {
  cache[logMessageId] = threadId || true;
  save(cache);
}

module.exports = { has, mark };
