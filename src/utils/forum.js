const { ChannelType } = require('discord.js');

function sanitizeThreadName(name) {
  let n = String(name || 'Unknown').replace(/[\n\r\t]+/g, ' ').trim();
  if (!n) n = 'Unknown';
  return n.slice(0, 100);
}

// Plain-text post: OC name is the thread title, body = the 5 fields only.
// No embed, no log link, no status wording.
function buildPostText(parsed) {
  const lines = [];
  if (parsed.applicantMention) {
    lines.push(parsed.applicantMention, '');
  }
  lines.push(
    `Gender: ${parsed.gender}`,
    `Backstory: ${parsed.backstory}`,
    `Hobbies/Skills: ${parsed.hobbies}`,
    `Likes/Dislikes: ${parsed.likes}`,
    `Life Goals: ${parsed.goals}`
  );
  let text = lines.join('\n');
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
