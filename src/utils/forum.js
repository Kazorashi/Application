const { ChannelType, EmbedBuilder } = require('discord.js');

function sanitizeThreadName(name) {
  let n = String(name || 'Unknown').replace(/[\n\r\t]+/g, ' ').trim();
  if (!n) n = 'Unknown';
  return n.slice(0, 100);
}

function buildForumEmbed(parsed) {
  return new EmbedBuilder()
    .setTitle(parsed.ocName)
    .setColor(0x57f287)
    .addFields(
      { name: 'Gender', value: parsed.gender.slice(0, 1024) || '—' },
      { name: 'Backstory', value: parsed.backstory.slice(0, 1024) || '—' },
      { name: 'Hobbies/Skills', value: parsed.hobbies.slice(0, 1024) || '—' },
      { name: 'Likes/Dislikes', value: parsed.likes.slice(0, 1024) || '—' },
      { name: 'Life Goals', value: parsed.goals.slice(0, 1024) || '—' },
    )
    .setFooter({ text: `Approved • log ${parsed.logMessageId}` })
    .setTimestamp(parsed.createdAt);
}

async function postToForum(client, config, parsed) {
  const forum = await client.channels.fetch(config.forumChannelId);
  if (!forum || forum.type !== ChannelType.GuildForum) {
    throw new Error(`FORUM_CHANNEL_ID ${config.forumChannelId} is not a Forum channel (type=${forum?.type}).`);
  }

  const threadName = sanitizeThreadName(parsed.ocName);
  const embed = buildForumEmbed(parsed);
  const starter = `${parsed.applicantMention ? parsed.applicantMention + '\n' : ''}Approved application for **${parsed.ocName}**.\nLog: ${parsed.logUrl}`;

  const options = {
    name: threadName,
    autoArchiveDuration: 10080,
    message: { content: starter.slice(0, 2000), embeds: [embed] },
    reason: `Appy approved log ${parsed.logMessageId}`,
  };
  if (config.approvedTagId) options.appliedTags = [config.approvedTagId];

  return forum.threads.create(options);
}

module.exports = { buildForumEmbed, postToForum, sanitizeThreadName };
