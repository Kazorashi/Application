const { ChannelType } = require('discord.js');

function sanitizeThreadName(name) {
  let n = String(name || 'Unknown').replace(/[\n\r\t]+/g, ' ').trim();
  if (!n) n = 'Unknown';
  return n.slice(0, 100);
}

// Plain-text post: OC name is the thread title; body = Name + categories,
// each as "**Label**" line with the answer on the next line, blank line between.
// No embed, no log link, no status wording. Age block only when parsed
// (old submissions' form had no age question).
function buildPostText(parsed) {
  const blocks = [
    ['Name', parsed.ocName],
    ['Gender', parsed.gender],
  ];
  if (parsed.age) blocks.push(['Age', parsed.age]);
  blocks.push(
    ['Backstory', parsed.backstory],
    ['Hobbies/Skills', parsed.hobbies],
    ['Likes/Dislikes', parsed.likes],
    ['Life Goals', parsed.goals]
  );
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

// Same-name rule: find the OLDEST thread with this OC name, active OR
// archived. A newer application with the same name edits that thread instead
// of creating a second thread with an identical title.
async function findThreadByName(forum, ocName) {
  const wanted = sanitizeThreadName(ocName);
  const nameEq = (t) => t.name === wanted || sanitizeThreadName(t.name) === wanted;
  const matches = [];
  try {
    const active = await forum.threads.fetchActive();
    for (const t of active.threads.values()) if (nameEq(t)) matches.push(t);
  } catch (e) {
    console.error('[forum] active-threads lookup failed:', String(e.message).slice(0, 200));
  }
  try {
    const archived = await forum.threads.fetchArchived({ limit: 100 });
    for (const t of archived.threads.values()) if (nameEq(t)) matches.push(t);
  } catch (e) {
    console.error('[forum] archived-threads lookup failed:', String(e.message).slice(0, 200));
  }
  matches.sort((a, b) => a.createdTimestamp - b.createdTimestamp);
  return matches[0] || null;
}

// Returns { thread, created, edited }:
//   created=true  -> new thread
//   edited=true   -> same-name thread existed, its post was updated in place
//   both false    -> same-name thread existed with identical content (no-op)
async function postToForum(client, config, parsed) {
  const forum = await client.channels.fetch(config.forumChannelId);
  if (!forum || forum.type !== ChannelType.GuildForum) {
    throw new Error(`FORUM_CHANNEL_ID ${config.forumChannelId} is not a Forum channel (type=${forum?.type}).`);
  }

  const text = buildPostText(parsed);
  const existing = await findThreadByName(forum, parsed.ocName);
  if (existing) {
    // Unarchive first — archived threads reject message edits.
    if (existing.archived) await existing.setArchived(false, `Re-activated by Appy log ${parsed.logMessageId}`);
    const starter = await existing.fetchStarterMessage().catch(() => null);
    if (starter && starter.content === text) {
      return { thread: existing, created: false, edited: false };
    }
    if (starter) {
      await starter.edit({ content: text });
      return { thread: existing, created: false, edited: true };
    }
    // Starter unavailable (deleted?) -> fall through and create a new one.
    console.warn(`[forum] thread ${existing.id} has no starter message; creating a new post`);
  }

  const options = {
    name: sanitizeThreadName(parsed.ocName),
    autoArchiveDuration: 10080,
    message: { content: text },
    reason: `Mirror Appy log ${parsed.logMessageId}`,
  };
  if (config.approvedTagId) options.appliedTags = [config.approvedTagId];

  const thread = await forum.threads.create(options);
  return { thread, created: true, edited: false };
}

module.exports = { buildPostText, findThreadByName, postToForum, sanitizeThreadName };
