require('dotenv').config();

const config = {
  token: process.env.DISCORD_TOKEN || '',
  guildId: process.env.GUILD_ID || '',
  logChannelId: process.env.LOG_CHANNEL_ID || '1482835040600588328',
  forumChannelId: process.env.FORUM_CHANNEL_ID || '1555637461944897596',
  appyBotId: process.env.APPY_BOT_ID || '853327905357561948',
  approvedTagId: process.env.APPROVED_TAG_ID || '',
  dryRun: String(process.env.DRY_RUN || 'false').toLowerCase() === 'true',
  debugDump: String(process.env.DEBUG_DUMP || 'true').toLowerCase() === 'true',
  port: parseInt(process.env.PORT || '3000', 10) || 3000,
};

function validateConfig() {
  const missing = [];
  if (!config.token || config.token.includes('put-your')) missing.push('DISCORD_TOKEN');
  if (!config.logChannelId) missing.push('LOG_CHANNEL_ID');
  if (!config.forumChannelId) missing.push('FORUM_CHANNEL_ID');
  if (!config.appyBotId) missing.push('APPY_BOT_ID');
  return missing;
}

module.exports = { config, validateConfig };
