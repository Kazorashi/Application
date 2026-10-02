// Detection for Appy approvals.
// User-confirmed shape: green embed + "Approved" text above/in message, permanent.

const GREEN_COLORS = new Set([
  0x57f287, // Discord green (Approved default)
  0x2ecc71,
  0x00ff00,
  0x3ba55d,
  0x57f287 & 0xffffff,
  3066993, // 0x2ECC71 decimal
  5763719, // 0x57F287 decimal
  65280,
  1673366,
]);

function isGreen(color) {
  if (color == null) return false;
  if (GREEN_COLORS.has(color)) return true;
  // Heuristic: green-dominant hex (g high, r low)
  const r = (color >> 16) & 0xff;
  const g = (color >> 8) & 0xff;
  const b = color & 0xff;
  return g >= 150 && g > r + 40 && g >= b;
}

function embedToText(embed) {
  const parts = [];
  if (embed.title) parts.push(embed.title);
  if (embed.description) parts.push(embed.description);
  if (embed.footer?.text) parts.push(embed.footer.text);
  if (embed.author?.name) parts.push(embed.author.name);
  for (const f of embed.fields || []) {
    if (f.name) parts.push(f.name);
    if (f.value) parts.push(f.value);
  }
  return parts.join('\n');
}

// Detection for Appy approvals.
// Real log shape (verified from live dumps):
//   pending: content = role ping, embed color red (16757375)
//   approved: content = "<@user>'s submission has been accepted successfully by <@staff>",
//             embed color green (8972168 = 0x88E788), permanent.
// Rule: approval word ("accepted"/"approved") in content or embed AND green embed.

function isApproved(message) {
  if (!message) return false;
  const content = message.content || '';
  const embeds = message.embeds || [];
  const embedText = embeds.map(embedToText).join('\n');

  const approvedWord = /approv|accept/i;
  const hasApprovalText = approvedWord.test(content) || approvedWord.test(embedText);
  if (!hasApprovalText) return false;

  // Green confirms the approval state; without it a pending application
  // whose answers contain "accept/approve" cannot false-positive.
  if (embeds.length > 0 && !embeds.some((e) => isGreen(e.color))) return false;

  return true;
}

function wasApproved(oldMessage) {
  try {
    return isApproved(oldMessage);
  } catch {
    return false;
  }
}

module.exports = { isApproved, wasApproved, isGreen, embedToText };
