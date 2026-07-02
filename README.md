# Minecraft AI Bot - LM Studio Powered

A Minecraft bot that follows players and responds to chat messages using your local LM Studio LLM.

## Features

- 🤖 **Follows the player** automatically, adjusting position in real-time
- 💬 **In-game chat responses** powered by your local LLM (no API costs!)
- 🔧 **Simple HTTP API** for external control and monitoring
- 🎮 **Works with any Minecraft Java Edition server**

## Requirements

- Node.js 18+
- LM Studio running locally at `http://127.0.0.1:1234`
- Minecraft Java Edition server (any version, recommended 1.21)
- Your MC username must be an operator on the server (`/op AIBot`)

## Quick Start

### 1. Configure Environment Variables

Create a `.env` file or set these environment variables:

```bash
# Minecraft Server
MC_HOST=localhost
MC_PORT=25565
MC_USERNAME=AIBot
MC_VERSION=1.21

# LM Studio (already configured)
LLM_BASE_URL=http://127.0.0.1:1234
LLM_MODEL=deepreinforce-ai_ornith-1.0-9b

# HTTP Server Port
SERVER_PORT=8080
```

### 2. Install Dependencies

```bash
npm install
```

### 3. Start Your Minecraft Server

Start your MC server first, then:

```bash
# Make sure AIBot is an operator
/op AIBot

# Start the bot
node src/index.js
```

## Usage

### In-Game Chat

Once connected, players can type in-game chat and the bot will respond via LLM:

```
[player] Hello! What's your name?
[Bot] I'm AIBot! Nice to meet you. How can I help?
```

The bot will also follow the player automatically.

### HTTP API

**Send a message:**
```bash
curl -X POST http://localhost:8080/chat \
  -H "Content-Type: application/json" \
  -d '{"message": "Hey bot, what are you doing?"}'
```

Response:
```json
{
  "response": "[Bot] I'm following the player and ready to help!"
}
```

**Get status:**
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

## How It Works

1. **Player types in-game chat** → Bot receives message via Mineflayer event
2. **Bot builds world context** → Position, nearby entities, blocks, inventory
3. **LLM processes request** → LM Studio generates response + actions
4. **Actions execute** → Movement, chat responses, block interactions
5. **Loop continues** → Bot follows player every 2 seconds

## Troubleshooting

### "Bot not connected"
- Check MC server is running and AIBot has operator status
- Verify `MC_HOST` and `MC_PORT` are correct

### LLM not responding
- Ensure LM Studio is running at `http://127.0.0.1:1234`
- Test with curl: `curl http://127.0.0.1:1234/v1/chat/completions`

### Bot can't follow player
- Make sure the player is within 50 blocks
- Check if there are obstacles (water, lava) blocking path

## Customization

Edit `src/index.js` to customize:
- Follow distance (currently 50 blocks)
- LLM temperature (affects creativity vs. precision)
- Movement speed and jump behavior
