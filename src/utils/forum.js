const { ChannelType } = require('discord.js');

function sanitizeThreadName(name) {
  let n = String(name || 'Unknown').replace(/[\n\r\t]+/g, ' ').trim();
  if (!n) n = 'Unknown';
  return n.slice(0, 100);
}

// Plain-text post: OC name is the thread title; body = Name + 5 categories,
// each as "**Label**" line with the answer on the next line, blank line between.
// No embed, no log link, no status wording.
function buildPostText(parsed) {
  const blocks = [
    ['Name', parsed.ocName],
    ['Gender', parsed.gender],
    ['Backstory', parsed.backstory],
    ['Hobbies/Skills', parsed.hobbies],
    ['Likes/Dislikes', parsed.likes],
    ['Life Goals', parsed.goals],
  ];
  const mention = parsed.applicantMention ? parsed.applicantMention + '\n\n' : '';

  // Keep within Discord's 2000-char limit: structure (labels + blank lines)
  // always intact; only the longest values get trimmed when overflowing.
  const sep = '\n\n';
  const overhead =
    mention.length +
    blocks.reduce((n, [label]) => n + label.length + 5, 0) + // `**label**\n`
    sep.length * (blocks.length - 1);
  const budget = 2000 - overhead - 1;

  const values = blocks.map(([, v]) => v);
  let sum = values.reduce((n, v) => n + v.length, 0);
  while (sum > budget && budget > 0) {
    let idx = 0;
    for (let i = 1; i < values.length; i++) {
      if (values[i].length > values[idx].length) idx = i;
    }
    if (values[idx].length <= 1) break;
    const take = Math.min(sum - budget, values[idx].length - 1);
    values[idx] = values[idx].slice(0, values[idx].length - take);
    sum -= take;
  }

  let text = mention + blocks.map(([label], i) => `**${label}**\n${values[i]}`).join(sep);
  if (text.length > 2000) text = text.slice(0, 1997) + '...';
  return text;
}

// Last-resort dedupe: if the forum already contains a post with identical
// starter text (posted by any instance), return it instead of duplicating.
async function findExistingPost(forum, parsed) {
  const text = buildPostText(parsed);
  const wantedName = sanitizeThreadName(parsed.ocName);
  try {
    const active = await forum.threads.fetchActive();
    for (const thread of active.threads.values()) {
      if (thread.name !== wantedName) continue;
      const starter = await thread.fetchStarterMessage().catch(() => null);
      if (starter && starter.content === text) return thread;
    }
  } catch (e) {
    console.error('[forum] existing-post check failed:', String(e.message).slice(0, 200));
  }
  return null;
}

// Returns { thread, created } — created=false means an identical post already
// existed (deduped against the forum itself).
async function postToForum(client, config, parsed) {
  const forum = await client.channels.fetch(config.forumChannelId);
  if (!forum || forum.type !== ChannelType.GuildForum) {
    throw new Error(`FORUM_CHANNEL_ID ${config.forumChannelId} is not a Forum channel (type=${forum?.type}).`);
  }

  const existing = await findExistingPost(forum, parsed);
  if (existing) return { thread: existing, created: false };

  const options = {
    name: sanitizeThreadName(parsed.ocName),
    autoArchiveDuration: 10080,
    message: { content: buildPostText(parsed) },
    reason: `Mirror Appy log ${parsed.logMessageId}`,
  };
  if (config.approvedTagId) options.appliedTags = [config.approvedTagId];

  const thread = await forum.threads.create(options);
  return { thread, created: true };
}

module.exports = { buildPostText, findExistingPost, postToForum, sanitizeThreadName };
