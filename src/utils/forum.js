const { ChannelType } = require('discord.js');

function sanitizeThreadName(name) {
  let n = String(name || 'Unknown').replace(/[\n\r\t]+/g, ' ').trim();
  if (!n) n = 'Unknown';
  return n.slice(0, 100);
}

// Plain-text post: OC name is the thread title; body = Name + MC Username +
// categories, each as "**Label**" line with the answer on the next line,
// blank line between. No embed, no log link, no status wording.
// MC Username / Age blocks appear only when parsed (old forms lack them).
// Full text is NEVER truncated — overlong posts are split into follow-up
// messages in the same thread by splitText() below.
function buildPostText(parsed) {
  const blocks = [
    ['Name', parsed.ocName],
  ];
  if (parsed.mcUsername) blocks.push(['MC Username', parsed.mcUsername]);
  blocks.push(['Gender', parsed.gender]);
  if (parsed.age) blocks.push(['Age', parsed.age]);
  blocks.push(
    ['Backstory', parsed.backstory],
    ['Hobbies/Skills', parsed.hobbies],
    ['Likes/Dislikes', parsed.likes],
    ['Life Goals', parsed.goals]
  );
  const mention = parsed.applicantMention ? parsed.applicantMention + '\n\n' : '';
  return mention + blocks.map(([label, value]) => `**${label}**\n${value}`).join('\n\n');
}

// Split text into <=limit chunks for Discord's 2000-char message limit.
// Packs whole blank-line paragraphs greedily so "**Label**\nvalue" blocks
// are never torn apart; only a single giant paragraph is hard-split.
function splitText(text, limit = 2000) {
  const paras = String(text || '').split('\n\n');
  const chunks = [];
  let cur = '';
  const pushChunk = (s) => { if (s) chunks.push(s); };
  for (const p of paras) {
    if (!p) continue;
    const add = cur ? '\n\n' + p : p;
    if ((cur + add).length <= limit) {
      cur += add;
      continue;
    }
    pushChunk(cur);
    if (p.length <= limit) {
      cur = p;
      continue;
    }
    let rest = p;
    while (rest.length > limit) {
      chunks.push(rest.slice(0, limit));
      rest = rest.slice(limit);
    }
    cur = rest;
  }
  pushChunk(cur);
  return chunks.length ? chunks : [''];
}

// Bot's own follow-up messages in a thread (starter excluded), oldest first.
// Used to reconcile follow-ups when a same-name post is updated or shortened.
async function getBotFollowUps(thread, starterId) {
  const selfId = thread.client.user.id;
  const msgs = await thread.messages.fetch({ limit: 100 });
  return [...msgs.values()]
    .filter((m) => m.author?.id === selfId && m.id !== starterId)
    .sort((a, b) => (BigInt(a.id) < BigInt(b.id) ? -1 : 1));
}

// Make the thread's follow-ups match chunks[1:]: edit in place, create
// missing ones, delete surplus ones from a previously longer version.
async function syncFollowUps(thread, starterId, restChunks) {
  const followUps = await getBotFollowUps(thread, starterId);
  for (let i = 0; i < restChunks.length; i++) {
    if (followUps[i]) {
      if (followUps[i].content !== restChunks[i]) await followUps[i].edit(restChunks[i]);
    } else {
      await thread.send(restChunks[i]);
    }
  }
  for (let i = restChunks.length; i < followUps.length; i++) {
    await followUps[i].delete().catch(() => null);
  }
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

// Download log images (avatars, attachments, embed images) to re-upload them
// on the forum post. Cap: 6 files, 10MB each. Failed downloads fall back to
// plain URL lines appended to the post text so nothing is silently lost.
async function fetchImageFiles(urls, maxFiles = 6, maxBytes = 10 * 1024 * 1024) {
  const files = [];
  const failed = [];
  for (const url of (urls || []).slice(0, maxFiles * 2)) {
    if (files.length >= maxFiles) break;
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(15000) });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const ct = (res.headers.get('content-type') || '').toLowerCase();
      if (ct && !ct.startsWith('image/')) throw new Error(`not image: ${ct}`);
      const buf = Buffer.from(await res.arrayBuffer());
      if (!buf.length || buf.length > maxBytes) throw new Error(`bad size ${buf.length}`);
      const m = url.split('?')[0].match(/\.([a-z0-9]{2,4})$/i);
      files.push(new AttachmentBuilder(buf, { name: `image-${files.length + 1}.${m ? m[1].toLowerCase() : 'png'}` }));
    } catch {
      failed.push(url);
    }
  }
  return { files, failed };
}

function withImageFallback(text, failed) {
  if (!failed.length) return text;
  let t = text + '\n\n' + failed.map((u) => `Image: ${u}`).join('\n');
  if (t.length > 2000) t = t.slice(0, 1997) + '...';
  return t;
}
// Returns { thread, created, edited, parts }:
//   created=true  -> new thread
//   edited=true   -> same-name thread existed, its post was updated in place
//   both false    -> same-name thread existed with identical content (no-op)
// Long posts are split: chunk[0] is the starter, the rest are follow-up
// messages in the same thread (posted/edited/deleted to match).
async function postToForum(client, config, parsed) {
  const forum = await client.channels.fetch(config.forumChannelId);
  if (!forum || forum.type !== ChannelType.GuildForum) {
    throw new Error(`FORUM_CHANNEL_ID ${config.forumChannelId} is not a Forum channel (type=${forum?.type}).`);
  }

  const { files, failed } = await fetchImageFiles(parsed.images);
  const chunks = splitText(withImageFallback(buildPostText(parsed), failed));
  const parts = chunks.length;

  const existing = await findThreadByName(forum, parsed.ocName);
  if (existing) {
    // Unarchive first — archived threads reject message edits.
    if (existing.archived) await existing.setArchived(false, `Re-activated by Appy log ${parsed.logMessageId}`);
    const starter = await existing.fetchStarterMessage().catch(() => null);
    if (starter) {
      const followUps = await getBotFollowUps(existing, starter.id);
      const same =
        starter.content === chunks[0] &&
        followUps.length === chunks.length - 1 &&
        followUps.every((m, i) => m.content === chunks[i + 1]);
      if (same) return { thread: existing, created: false, edited: false, parts };
      await starter.edit({ content: chunks[0], files });
      await syncFollowUps(existing, starter.id, chunks.slice(1));
      return { thread: existing, created: false, edited: true, parts };
    }
    // Starter unavailable (deleted?) -> fall through and create a new one.
    console.warn(`[forum] thread ${existing.id} has no starter message; creating a new post`);
  }

  const options = {
    name: sanitizeThreadName(parsed.ocName),
    autoArchiveDuration: 10080,
    message: { content: chunks[0], files },
    reason: `Mirror Appy log ${parsed.logMessageId}`,
  };
  if (config.approvedTagId) options.appliedTags = [config.approvedTagId];

  const thread = await forum.threads.create(options);
  for (const chunk of chunks.slice(1)) await thread.send(chunk);
  return { thread, created: true, edited: false, parts };
}

module.exports = { buildPostText, splitText, findThreadByName, postToForum, sanitizeThreadName, fetchImageFiles };
