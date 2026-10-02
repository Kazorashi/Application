// Parse Appy log embed into OC fields.
// Keeps ONLY: Gender(3), Backstory(4), Hobbies/Skills(5), Likes/Dislikes(6), Life Goals(7)
// Title uses Q2 NAME (OC Name).

function blobFromMessage(message) {
  const chunks = [];
  if (message.content) chunks.push(message.content);
  for (const e of message.embeds || []) {
    if (e.description) chunks.push(e.description);
    for (const f of e.fields || []) {
      // Keep Q + A together so "3. Gender\nBlack" splitting works
      chunks.push(`${f.name}\n${f.value}`);
    }
    if (e.footer?.text) chunks.push(e.footer.text);
  }
  return chunks.join('\n').replace(/\r/g, '').trim();
}

function splitSections(blob) {
  // Split on lines starting with "N. " (Appy format: "3. Gender")
  const lines = blob.split('\n');
  const sections = [];
  let current = null;
  for (const line of lines) {
    if (/^\s*\d+\.\s+/.test(line)) {
      if (current) sections.push(current);
      current = line;
    } else if (current == null) {
      current = line;
    } else {
      current += '\n' + line;
    }
  }
  if (current) sections.push(current);
  return sections;
}

function sectionAnswer(section) {
  // Drop first line (the question), rest is the answer
  const idx = section.indexOf('\n');
  if (idx === -1) return '';
  return section.slice(idx + 1).trim().replace(/\n{3,}/g, '\n\n');
}

function classifySection(section) {
  const head = section.split('\n')[0].toLowerCase();
  const numMatch = head.match(/^\s*(\d+)\./);
  const num = numMatch ? parseInt(numMatch[1], 10) : null;
  if (num >= 2 && num <= 8) return num;
  if (head.includes('gender')) return 3;
  if (head.includes('backstory')) return 4;
  if (head.includes('hobbi') || head.includes('skill')) return 5;
  if (head.includes('like') || head.includes('dislike')) return 6;
  if (head.includes('life goal')) return 7;
  if (head.includes('name') && head.includes('oc')) return 2;
  return null;
}

function cleanName(raw) {
  if (!raw) return 'Unknown';
  let name = raw.split('\n')[0].trim();
  name = name.replace(/[<@!>_~*`#]+/g, '').trim();
  name = name.replace(/\s+/g, ' ').trim();
  return name.slice(0, 90) || 'Unknown';
}

function cleanField(raw, max = 1000) {
  if (!raw) return '—';
  let v = String(raw).trim();
  if (!v) return '—';
  if (v.length > max) v = v.slice(0, max - 3).trimEnd() + '...';
  return v;
}

function parseApplication(message) {
  const blob = blobFromMessage(message);
  const sections = splitSections(blob);
  const byNum = {};
  for (const s of sections) {
    const n = classifySection(s);
    if (n && !byNum[n]) byNum[n] = sectionAnswer(s);
  }

  const ocName = cleanName(byNum[2] || 'Unknown');
  const applicantMentionMatch = blob.match(/<@!?(\d{5,25})>/);
  const applicantId = applicantMentionMatch ? applicantMentionMatch[1] : null;

  // Author of embed sometimes holds applicant name
  const embedAuthor = message.embeds?.[0]?.author?.name || null;

  return {
    ocName,
    gender: cleanField(byNum[3]),
    backstory: cleanField(byNum[4]),
    hobbies: cleanField(byNum[5]),
    likes: cleanField(byNum[6]),
    goals: cleanField(byNum[7]),
    applicantId,
    applicantMention: applicantId ? `<@${applicantId}>` : (embedAuthor || ''),
    logUrl: message.url || '',
    logMessageId: message.id,
    createdAt: message.createdTimestamp ? new Date(message.createdTimestamp) : new Date(),
    rawBlob: blob,
  };
}

module.exports = { parseApplication, blobFromMessage };
