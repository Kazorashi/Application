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
  const parsed = parseApplication(message);
  console.log(`[approved:${source}] log=${message.id} oc=${parsed.ocName}`);

  if (config.dryRun) {
    console.log('[dryRun] would post:', JSON.stringify({ name: parsed.ocName, parsed }, null, 2).slice(0, 3000));
    return;
  }

  try {
    const thread = await postToForum(client, config, parsed);
    store.mark(message.id, thread.id);
    console.log(`[posted] forum thread ${thread.id} (${thread.name}) for log ${message.id}`);
  } catch (err) {
    console.error(`[error] forum post failed for log ${message.id}:`, err.message);
  }
}

client.once(Events.ClientReady, (c) => {
  console.log(`[appy-forum-bot] Logged in as ${c.user.tag}`);
  console.log(`Watching Appy ${config.appyBotId} in #${config.logChannelId} -> forum ${config.forumChannelId}`);
  if (config.dryRun) console.log('DRY_RUN=true: will only log, not post.');
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

client.login(config.token);
