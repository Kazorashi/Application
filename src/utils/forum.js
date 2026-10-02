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

async function postToForum(client, config, parsed) {
  const forum = await client.channels.fetch(config.forumChannelId);
  if (!forum || forum.type !== ChannelType.GuildForum) {
    throw new Error(`FORUM_CHANNEL_ID ${config.forumChannelId} is not a Forum channel (type=${forum?.type}).`);
  }

  const options = {
    name: sanitizeThreadName(parsed.ocName),
    autoArchiveDuration: 10080,
    message: { content: buildPostText(parsed) },
    reason: `Mirror Appy log ${parsed.logMessageId}`,
  };
  if (config.approvedTagId) options.appliedTags = [config.approvedTagId];

  return forum.threads.create(options);
}

module.exports = { buildPostText, postToForum, sanitizeThreadName };
