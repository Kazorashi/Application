# Appy Forum Bot

Mirrors approved Appy applications to a Discord Forum channel.

- Watches `LOG_CHANNEL_ID` for messages from `APPY_BOT_ID`
- Detects `Approved` (green embed + "Approved" text, permanent)
- Parses OC Name (title) + Gender, Backstory, Hobbies/Skills, Likes/Dislikes, Life Goals
- Creates one Forum post per approval in `FORUM_CHANNEL_ID`

## Setup

1. Copy env:
   ```
   copy .env.example .env
   ```
   Fill `DISCORD_TOKEN` (Developer Portal > Bot > Reset Token) and `GUILD_ID` (right-click server > Copy Server ID).
   Log / Forum / Appy IDs are pre-filled but verify them.

2. Invite bot with scopes `bot` and perms:
   `View Channels, Read History, Send Messages, Create Public Threads, Embed Links`.
   Enable `Message Content Intent` in portal.

3. Install + run:
   ```
   npm install
   npm start
   ```

4. Test: approve one application in log channel. Bot logs `[approved:update/create]` and creates forum thread titled with OC name.

## Files

- `src/index.js` — client + messageCreate/messageUpdate
- `src/config.js` — env loading
- `src/utils/detect.js` — `isApproved()` (green + Approved)
- `src/utils/parse.js` — extracts Q2-Q7 only
- `src/utils/forum.js` — `threads.create()` in forum
- `src/utils/store.js` — `data/seen.json` dedupe

## Run 24/7 with PC off (free)

### Option A — GitHub Actions (recommended, already configured)

`.github/workflows/bot.yml` runs the bot in near-continuous 45-min sessions
(queued next session starts seconds later, no meaningful gaps). Runs are
**free forever on this public repo** (keep it public — private repos get only
2,000 min/month). Dedupe state (`data/seen.json`) is committed back to the repo
after each post, and every session catches up on approvals from its restart gap.

1. GitHub → **Settings → Secrets and variables → Actions → New secret**:
   - Name: `DISCORD_TOKEN`, Value: your bot token
2. **Actions** tab → **Appy Forum Bot** → **Run workflow** → main → Run
   (schedule `*/5 * * * *` keeps it going automatically)
3. First run logs `[baseline] N existing approved log(s) marked seen (not posted)` —
   old approvals are ignored on purpose; only new approvals post.
4. Test: approve an application → forum post appears (same session or next, ≤5 min).

If GitHub auto-disables the schedule after long inactivity, re-enable it in the
Actions tab (the workflow has a self-heartbeat guard to prevent this).

### Option B — HAX.co.id VPS (pm2)
1. Panel → **Web Base Terminal**, paste:
   ```bash
   bash setup.sh https://github.com/Kazorashi/Application
   ```
2. If asked, `nano .env` → fill `DISCORD_TOKEN` → `pm2 start src/index.js --name appy-forum && pm2 save`
3. Remember to **Extend VPS** in the panel before expiry. On server wipes just re-run setup.sh.

### Option C — Oracle Cloud Always Free (true free-forever VPS)
1. Create Oracle Cloud free account, launch Ampere A1 VM (Ubuntu 22.04).
2. SSH in:
   ```
   curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
   sudo apt install -y nodejs git
   git clone https://github.com/Kazorashi/Application appy-forum-bot
   cd appy-forum-bot
   npm ci --omit=dev
   cp .env.example .env
   nano .env   # fill DISCORD_TOKEN
   sudo npm i -g pm2
   pm2 start src/index.js --name appy-forum
   pm2 startup
   pm2 save
   ```
   Never sleeps, free forever within Always Free limits.

### Option D — Render free (5 min)
1. Render.com > New > Blueprint > select repo (`render.yaml` is included).
2. Fill `DISCORD_TOKEN` in dashboard, Deploy.
3. Free web services sleep after inactivity — add UptimeRobot pinging `https://<your-app>.onrender.com/health` every 5 min to keep it awake. `/health` server is already built in.

Note: when hosted separately from GitHub Actions, `data/seen.json` on the server persists the dedupe state; the bot never back-fills history beyond its startup scan of the last 100 logs (old approvals are baselined, not posted).
