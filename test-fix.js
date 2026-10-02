const { isApproved, wasApproved } = require('./src/utils/detect');
const { parseApplication } = require('./src/utils/parse');
const { buildPostText } = require('./src/utils/forum');

const stats =
  'UserId: `709446568172060675`\nUsername: `saperan.`\nUser: <@709446568172060675>\nDuration: `49s`\nJoined guild <t:1772739205:R>\nSubmitted: <t:1790970191:R>';
const desc =
  '### **1.** Any roleplay experience? If yes, then describe it\nyes i cucked Kazorashi\n### **2.** NAME (OC Name, not yours)\nCuckorashi\n### **3.** Gender\nCuck\n### **4.** Backstory\nCukcoll\n### **5.** Hobbies/Skills\ncucking\n### **6.** Likes/Dislikes\nloves Cucks\n### **7.** Life Goals\nCuck more\n### **8.** Do you have any plans for Roleplay? (it is okay if you do not, just an example)\nCUCK';

const pending = {
  id: '1555666479783870485',
  content: '<@&1479202892371070997>',
  embeds: [
    {
      title: "saperan.'s 'Re:Change SMP' Application Submitted",
      description: desc,
      color: 16757375,
      fields: [{ name: 'Submission stats', value: stats }],
    },
  ],
};

const approved = {
  id: '1555666479783870485',
  content:
    "<@709446568172060675>'s submission has been accepted successfully by <@839555373601390662>",
  embeds: [
    {
      title: "saperan.'s 'Re:Change SMP' Application Submitted",
      description: desc,
      color: 8972168,
      fields: [{ name: 'Submission stats', value: stats }],
    },
  ],
};

// false-positive trap: pending red, but answer contains "accept"
const trap = {
  id: 'x',
  content: '<@&role>',
  embeds: [
    {
      title: 'App',
      description:
        '### **1.** Experience\nI accept everyone\n### **2.** NAME (OC Name, not yours)\nTrap\n### **3.** Gender\nM',
      color: 16757375,
      fields: [],
    },
  ],
};

let fails = 0;
function check(label, cond) {
  console.log((cond ? 'PASS' : 'FAIL') + ' | ' + label);
  if (!cond) fails++;
}

check('pending -> false', isApproved(pending) === false);
check('approved -> true', isApproved(approved) === true);
check('red + "accept" in answers -> false', isApproved(trap) === false);
check(
  'transition pending -> approved fires',
  wasApproved(pending) === false && isApproved(approved) === true
);

const p = parseApplication(approved);
check('ocName = Cuckorashi (' + p.ocName + ')', p.ocName === 'Cuckorashi');
check('gender = Cuck (' + p.gender + ')', p.gender === 'Cuck');
check('backstory = Cukcoll (' + p.backstory + ')', p.backstory === 'Cukcoll');
check('hobbies = cucking (' + p.hobbies + ')', p.hobbies === 'cucking');
check('likes = loves Cucks (' + p.likes + ')', p.likes === 'loves Cucks');
check('goals = Cuck more (' + p.goals + ')', p.goals === 'Cuck more');
check('applicant = 709446568172060675', p.applicantId === '709446568172060675');
check('no Q1/Q8 leak into fields', !p.backstory.includes('roleplay') && !p.goals.includes('CUCK'));

const post = buildPostText(p);
console.log('--- post text preview ---\n' + post + '\n-------------------------');
check('post is plain text', typeof post === 'string');
check('post has Name block', post.includes('**Name**\nCuckorashi'));
check('post has 6 bold category headers', ['**Gender**', '**Backstory**', '**Hobbies/Skills**', '**Likes/Dislikes**', '**Life Goals**'].every((l) => post.includes(l)));
check('values on line after label', post.includes('**Gender**\nCuck') && post.includes('**Life Goals**\nCuck more'));
check('blank line between categories', post.includes('Cuck\n\n**Backstory**') && post.includes('Cukcoll\n\n**Hobbies/Skills**'));
check('post has no log link', !post.includes('discord.com') && !post.includes('Log:'));
check('post has no "approved" wording', !/approv/i.test(post));
check('post within 2000 chars', post.length <= 2000);

// overflow safety: huge answers must still fit and keep structure
const huge = buildPostText({ ...p, backstory: 'x'.repeat(900), hobbies: 'y'.repeat(900), likes: 'z'.repeat(900), goals: 'w'.repeat(900) });
check('huge answers capped at 2000', huge.length <= 2000);
check('huge still has all headers', ['**Gender**', '**Backstory**', '**Hobbies/Skills**', '**Likes/Dislikes**', '**Life Goals**'].every((l) => huge.includes(l)));

console.log(fails === 0 ? '\nALL TESTS PASSED' : `\n${fails} FAILED`);
process.exit(fails === 0 ? 0 : 1);
