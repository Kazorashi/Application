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

Truth: no host is 100% "free forever, no limits". Closest options:

### Option A — Oracle Cloud Always Free (only true free-forever VPS)
1. Create Oracle Cloud free account, launch Ampere A1 VM (Ubuntu 22.04).
2. SSH in:
   ```
   curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
   sudo apt install -y nodejs git
   git clone <your-repo-url> appy-forum-bot
   cd appy-forum-bot
   npm ci --omit=dev
   cp .env.example .env
   nano .env   # fill DISCORD_TOKEN + GUILD_ID
   sudo npm i -g pm2
   pm2 start src/index.js --name appy-forum
   pm2 startup
   pm2 save
   ```
   Never sleeps, free forever within Always Free limits.

### Option B — Render free (easiest, 5 min)
1. Push this folder to GitHub.
2. Render.com > New > Blueprint > select repo (`render.yaml` is included).
3. Fill `DISCORD_TOKEN`, `GUILD_ID` in dashboard, Deploy.
4. Free web services sleep after inactivity — add UptimeRobot pinging `https://<your-app>.onrender.com/health` every 5 min to keep it awake. `/health` server is already built in.

### Option C — Fly.io free allowance
```
fly launch
fly secrets set DISCORD_TOKEN=xxx GUILD_ID=xxx LOG_CHANNEL_ID=1482835040600588328 FORUM_CHANNEL_ID=1555637461944897596 APPY_BOT_ID=853327905357561948 DEBUG_DUMP=false
fly deploy
```
`fly.toml` included, `min_machines_running = 1` keeps it up.

Note: free hosts wipe `data/seen.json` on restart. Safe here — bot only reacts to *new* approvals, it never re-posts history.
