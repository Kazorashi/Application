// Parse Appy log embed into OC fields.
// Keeps ONLY: Name, Gender, Age (new), Backstory, Hobbies/Skills, Likes/Dislikes, Life Goals.
// Classification is KEYWORD-FIRST on the question text so inserting/renumbering
// questions (like the new Age) can never misroute another field.

const LEGACY_NUM_KEY = { 2: 'name', 3: 'gender', 4: 'backstory', 5: 'hobbies', 6: 'likes', 7: 'goals' };

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

// Appy real format: "### **3.** Gender" (markdown) — also plain "3. Gender"
const SECTION_RE = /^(?:#+\s*)?(?:\*\*)?\s*(\d+)\.\s*(?:\*\*)?\s*/;

function splitSections(blob) {
  const lines = blob.split('\n');
  const sections = [];
  let current = null;
  for (const line of lines) {
    // Start a new section on a numbered question OR on the "Submission stats"
    // embed field, so the LAST question's answer never swallows field lines.
    if (SECTION_RE.test(line) || line.startsWith('Submission stats')) {
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
  const head = section.split('\n')[0];
  const h = head.toLowerCase();
  // Keyword-first: immune to question renumbering when Appy adds fields.
  if (h.includes('gender')) return 'gender';
  if (h.includes('backstory')) return 'backstory';
  if (h.includes('hobbi') || h.includes('skill')) return 'hobbies';
  if (h.includes('like') || h.includes('dislike')) return 'likes';
  if (h.includes('life goal')) return 'goals';
  if (/\bage\b/.test(h) || /\bold\b/.test(h)) return 'age'; // new category, any position/number
  if (h.includes('name') && h.includes('oc')) return 'name';
  return null;
}

function sectionNumber(section) {
  const numMatch = section.split('\n')[0].match(SECTION_RE);
  return numMatch ? parseInt(numMatch[1], 10) : null;
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
  const byKey = {};
  const unmatched = [];
  for (const s of sections) {
    const key = classifySection(s);
    if (key) {
      if (byKey[key] === undefined) byKey[key] = sectionAnswer(s);
    } else {
      unmatched.push(s);
    }
  }
  // Legacy numbered fallback: only fills keys no keyword match claimed,
  // so a shifted question with odd wording can never steal another field.
  for (const s of unmatched) {
    const k = LEGACY_NUM_KEY[sectionNumber(s)];
    if (k && byKey[k] === undefined) byKey[k] = sectionAnswer(s);
  }

  const ocName = cleanName(byKey.name || 'Unknown');
  const applicantMentionMatch = blob.match(/<@!?(\d{5,25})>/);
  const applicantId = applicantMentionMatch ? applicantMentionMatch[1] : null;

  // Author of embed sometimes holds applicant name
  const embedAuthor = message.embeds?.[0]?.author?.name || null;
  const age = byKey.age !== undefined && byKey.age !== '' ? cleanField(byKey.age) : '';

  return {
    ocName,
    gender: cleanField(byKey.gender),
    age, // '' when the form has no age question (old submissions)
    backstory: cleanField(byKey.backstory),
    hobbies: cleanField(byKey.hobbies),
    likes: cleanField(byKey.likes),
    goals: cleanField(byKey.goals),
    applicantId,
    applicantMention: applicantId ? `<@${applicantId}>` : (embedAuthor || ''),
    logUrl: message.url || '',
    logMessageId: message.id,
    createdAt: message.createdTimestamp ? new Date(message.createdTimestamp) : new Date(),
    rawBlob: blob,
  };
}

module.exports = { parseApplication, blobFromMessage };
