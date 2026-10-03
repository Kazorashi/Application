const http = require('http');
const { Client, GatewayIntentBits, Partials, Events } = require('discord.js');
const { config, validateConfig } = require('./config');
const { isApproved } = require('./utils/detect');
const { parseApplication } = require('./utils/parse');
const { postToForum } = require('./utils/forum');
const store = require('./utils/store');

// Tiny health server for free hosts (Render/Railway/Fly expect an open PORT).
// Keeps free web services alive + gives UptimeRobot something to ping.
const server = http.createServer((req, res) => {
  if (req.url === '/health' || req.url === '/') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ ok: true, bot: 'appy-forum-bot', uptime: process.uptime() }));
  } else {
    res.writeHead(404);
    res.end('not found');
  }
});
server.listen(config.port, () => {
  console.log(`[health] listening on PORT ${config.port}`);
});

const missing = validateConfig();
if (missing.length) {
  console.error(`[appy-forum-bot] Missing .env: ${missing.join(', ')}. Copy .env.example to .env and fill it.`);
  process.exit(1);
}

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
  ],
  partials: [Partials.Message, Partials.Channel],
});

function isWatched(message) {
  if (!message || !message.author) return false;
  if (message.author.id !== config.appyBotId) return false;
  if (message.channelId !== config.logChannelId) return false;
  return true;
}

function dumpDebug(tag, message) {
  if (!config.debugDump) return;
  console.log(`--- ${tag} ${message.id} ---`);
  console.log('content:', JSON.stringify(message.content));
  console.log('embeds:', JSON.stringify(message.embeds.map((e) => e.toJSON ? e.toJSON() : e), null, 2).slice(0, 6000));
}

async function handleApproved(message, source) {
  if (store.has(message.id)) {
    console.log(`[skip] already posted log ${message.id}`);
    return;
  }

  // Sync state from the repo BEFORE deciding: another instance (local or
  // Actions) may have already posted this approval minutes ago.
  store.flush(); // push local marks first so pull can't conflict
  store.syncPull();
  if (store.has(message.id)) {
    console.log(`[skip] log ${message.id} already posted by another session`);
    return;
  }

  const parsed = parseApplication(message);
  console.log(`[approved:${source}] log=${message.id} oc=${parsed.ocName}`);

  if (config.dryRun) {
    console.log('[dryRun] would post:', JSON.stringify({ name: parsed.ocName, parsed }, null, 2).slice(0, 3000));
    return;
  }

  // Claim BEFORE awaiting the forum post so the live event and the startup
  // backfill can never both post the same application.
  store.mark(message.id, 'posting');
  try {
    const { thread, created } = await postToForum(client, config, parsed);
    store.mark(message.id, thread.id);
    store.flush();
    if (created) {
      console.log(`[posted] forum thread ${thread.id} (${thread.name}) for log ${message.id}`);
    } else {
      console.log(`[deduped] identical forum post already existed (${thread.id}) for log ${message.id}`);
    }
  } catch (err) {
    store.unmark(message.id);
    console.error(`[error] forum post failed for log ${message.id}:`, err.message);
  }
}

// On startup, scan the last 100 log messages:
// - first run ever: mark already-approved as seen (baseline, no forum spam)
// - later runs: post any approved-but-unseen ones (catches approvals while restarting)
async function backfill() {
  try {
    // Refresh from repo first: posts made by other sessions while we were down.
    store.syncPull();
    const stale = store.takeStaleClaims();
    if (stale.length) console.log(`[recovery] retrying ${stale.length} interrupted post(s): ${stale.join(', ')}`);
    const channel = await client.channels.fetch(config.logChannelId);
    const msgs = await channel.messages.fetch({ limit: 100 });
    const list = [...msgs.values()].sort((a, b) => (BigInt(a.id) < BigInt(b.id) ? -1 : 1));
    if (!store.isInitialized()) {
      let n = 0;
      for (const m of list) {
        if (isApproved(m)) {
          store.mark(m.id, 'baseline');
          n++;
        }
      }
      store.markInitialized();
      store.flush();
      console.log(`[baseline] ${n} existing approved log(s) marked seen (not posted)`);
    } else {
      let n = 0;
      for (const m of list) {
        if (isApproved(m) && !store.has(m.id)) {
          await handleApproved(m, 'backfill');
          n++;
        }
      }
      if (n === 0) console.log(`[backfill] ${list.length} recent log(s) checked, nothing to post`);
      store.flush();
    }
  } catch (err) {
    console.error('[backfill] error:', err.message);
  }
}

client.once(Events.ClientReady, async (c) => {
  console.log(`[appy-forum-bot] Logged in as ${c.user.tag}`);
  console.log(`Watching Appy ${config.appyBotId} in #${config.logChannelId} -> forum ${config.forumChannelId}`);
  if (config.dryRun) console.log('DRY_RUN=true: will only log, not post.');
  await backfill();
});

client.on(Events.MessageCreate, async (message) => {
  try {
    if (message.partial) await message.fetch().catch(() => null);
    if (!isWatched(message)) return;
    dumpDebug('create', message);
    if (isApproved(message)) await handleApproved(message, 'create');
  } catch (err) {
    console.error('[messageCreate] error:', err.message);
  }
});

client.on(Events.MessageUpdate, async (oldMsg, newMsg) => {
  try {
    if (newMsg.partial) await newMsg.fetch().catch(() => null);
    if (!isWatched(newMsg)) return;
    // Only fire on pending -> approved transition to avoid duplicates
    let oldApproved = false;
    try {
      if (oldMsg && !oldMsg.partial) oldApproved = isApproved(oldMsg);
    } catch { oldApproved = false; }
    dumpDebug('update', newMsg);
    if (!oldApproved && isApproved(newMsg)) await handleApproved(newMsg, 'update');
  } catch (err) {
    console.error('[messageUpdate] error:', err.message);
  }
});

process.on('unhandledRejection', (e) => console.error('[unhandledRejection]', e));

// Flush dedupe state before exit (Actions sends SIGINT before job timeout)
for (const sig of ['SIGINT', 'SIGTERM']) {
  process.on(sig, () => {
    console.log(`\n[signal] ${sig} -> flushing state`);
    store.flush();
    process.exit(sig === 'SIGINT' ? 130 : 143);
  });
}

client.login(config.token);
