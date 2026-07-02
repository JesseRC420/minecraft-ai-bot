# Minecraft AI Bot - Setup Guide

## ✅ Installation Complete!

Your bot is ready to go. Here's what you need to do next:

---

## Step 1: Start Your Minecraft Server

You'll need a Minecraft Java Edition server running. Options:

### Option A: Use Paper/Spigot (Recommended)
1. Download from https://papermc.io/ or https://getbukkit.org/
2. Extract to a folder, run `java -jar paper.jar`
3. Configure in `server.properties`:
   ```properties
   server-ip=0.0.0.0
   server-port=25565
   ```

### Option B: Use Vanilla Minecraft Server
1. Download from https://www.minecraft.net/en-us/download/server
2. Run `java -jar server.jar`

### Option C: Already Have a Server?
Just make sure it's running on port 25565 (or change in config).

---

## Step 2: Add Bot as Operator

In your Minecraft server console or via another player:
```
/op AIBot
```

This gives the bot permission to interact with the world.

---

## Step 3: Configure Environment Variables

Create a `.env` file in the project root:

```bash
# Create .env file
echo "MC_HOST=localhost" > .env
echo "MC_PORT=25565" >> .env
echo "MC_USERNAME=AIBot" >> .env
echo "MC_VERSION=1.21" >> .env
echo "LLM_BASE_URL=http://127.0.0.1:1234" >> .env
echo "LLM_MODEL=deepreinforce-ai_ornith-1.0-9b" >> .env
echo "SERVER_PORT=8080" >> .env
```

Or set them in your terminal before running:
```bash
set MC_HOST=localhost
set MC_PORT=25565
set MC_USERNAME=AIBot
set LLM_BASE_URL=http://127.0.0.1:1234
set LLM_MODEL=deepreinforce-ai_ornith-1.0-9b
```

---

## Step 4: Verify LM Studio is Running

Open your browser and go to: http://127.0.0.1:1234

You should see the LM Studio interface. If not, start it first.

**Test the API:**
```bash
curl http://127.0.0.1:1234/v1/chat/completions -H "Content-Type: application/json" -d "{\"model\":\"deepreinforce-ai_ornith-1.0-9b\",\"messages\":[{\"role\":\"user\",\"content\":\"Hello\"}]}"
```

You should get a response back.

---

## Step 5: Start the Bot!

```bash
cd "H:\SNAKE MULTIPLAYER\minecraft-ai-bot"
node src/index.js
```

You should see:
```
[Server] HTTP API running on http://localhost:8080
[Bot] Connected as AIBot at (x, y, z)
[Bot] Spawned successfully!
[Bot] Following player every 2 seconds...
```

---

## Step 6: Test It In-Game

1. Join your Minecraft server with a player account
2. Type in chat: `@AIBot Hello!`
3. Watch the bot respond via LLM and follow you around!

**Example interaction:**
```
[player] Hey bot, what are you doing?
[Bot] I'm following you around and ready to help with anything! What do you need?
```

---

## HTTP API Testing (Optional)

### Send a message:
```bash
curl -X POST http://localhost:8080/chat ^
  -H "Content-Type: application/json" ^
  -d "{\"message\": \"What's your name, bot?\"}"
```

Response:
```json
{
  "response": "[Bot] I'm AIBot! Nice to meet you. How can I help?"
}
```

### Get status:
```bash
curl http://localhost:8080/status
```

Response:
```json
{
  "connected": true,
  "username": "AIBot",
  "position": [123, 64, -45],
  "entities": 15
}
```

---

## Troubleshooting

### Bot won't connect to MC server
- Check `MC_HOST` and `MC_PORT` in `.env`
- Make sure your MC server is running
- Verify AIBot has operator status (`/op AIBot`)

### LLM not responding
- Ensure LM Studio is running at http://127.0.0.1:1234
- Test with curl command above
- Check if model name matches exactly in `.env`

### Bot can't follow player
- Player must be within 50 blocks
- No obstacles (water, lava) blocking path
- Make sure both are on same dimension

### "Bot kicked" error
- AIBot needs operator status
- Server might have whitelist enabled - add AIBot to whitelist

---

## What's Next?

Once the basic bot works, you can:

1. **Add more skills**: Mining, building, farming (see `src/skills/` directory)
2. **Customize behavior**: Edit prompts in `src/index.js`
3. **Add streaming**: Use prismarine-viewer to watch the bot in 3D
4. **Multiple bots**: Create a swarm of specialized agents

---

## Project Structure

```
minecraft-ai-bot/
├── src/
│   └── index.js          # Main bot logic (LM Studio + Mineflayer)
├── demo.js               # Demo mode (no MC server needed)
├── package.json          # Dependencies
├── node_modules/         # Installed packages
└── README.md             # Full documentation
```

---

## Quick Reference

| Command | Purpose |
|---------|---------|
| `node demo.js` | Run without MC server (test only) |
| `node src/index.js` | Start full bot with MC connection |
| `curl http://localhost:8080/status` | Check bot status |
| `curl -X POST ... /chat` | Send message to bot |

---

**Enjoy your AI-powered Minecraft companion! 🎮🤖**
