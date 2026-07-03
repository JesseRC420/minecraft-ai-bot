# Minecraft AI Bot - LM Studio Powered

A Minecraft bot with an "artificial brain" — persistent memory, emotional modeling, sensory awareness, and autonomous behavior, powered by your local LM Studio LLM.

## Features

- 🧠 **Living Brain** — emotional model (9 emotions), sensory stream, micro-behaviors, inner monologue
- 💾 **Persistent Memory** — relationships, location memory, discovery log, event timeline, self-model
- 💬 **In-game Chat** — responds to all messages, not just mentions
- 🔧 **20+ Tools** — mine, chop, craft, build, attack, hunt, dig staircases, and more
- 🏠 **Home System** — set home, go home, deposit items into chests
- 📋 **Task Management** — plan multi-step work with add_task/complete_task
- 🛡️ **Safety Checks** — no straight-down digging, inventory full detection, fall detection
- 🔄 **Auto Behaviors** — sleep at night, follow players, defend against mobs
- 📊 **HTTP API** — status, inventory, brain state, memory, manual chat

## Requirements

- Node.js 18+
- LM Studio running locally with a model loaded
- Minecraft Java Edition server (1.21 recommended)
- Your MC username must be an operator on the server (`/op AIBot`)

## Quick Start

### 1. Configure

Copy `config.example.json` to `config.json` and edit:

```json
{
  "minecraft": {
    "host": "localhost",
    "port": 25565,
    "username": "AIBot",
    "version": "1.21"
  },
  "llm": {
    "baseUrl": "http://127.0.0.1:1234",
    "apiEndpoint": "/api/v1/chat",
    "model": "nvidia/nemotron-3-nano-4b",
    "contextLength": 4096,
    "temperature": 0.7
  },
  "server": {
    "port": 8080
  }
}
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

```
[player] Hey bot, can you get me some wood?
[Bot] On it!
[Bot] *chops down a tree*
[Bot] Got 3 oak logs for you!

[player] What do you want to do?
[Bot] I'm thinking about exploring that cave over there...

[player] Dig a staircase down to y=11
[Bot] *digs a safe 2-wide staircase downward*
```

### Tools the Bot Can Use

| Tool | Description |
|------|-------------|
| `chop` | Chop trees for wood |
| `mine` | Mine specific blocks (stone, ores, etc.) |
| `dig` | Dig staircases (safe!) or tunnels |
| `craft` | Craft items using recipes |
| `attack` | Attack hostile mobs |
| `hunt` | Hunt animals for food/resources |
| `goto` | Walk to coordinates |
| `set_home` | Save current location as home |
| `go_home` | Walk back to home |
| `deposit` | Put items in nearby chests |
| `add_task` | Plan multi-step work |

### HTTP API

**Check status:**
```bash
curl http://localhost:8080/status
```

**View inventory:**
```bash
curl http://localhost:8080/inventory
```

**View brain state:**
```bash
curl http://localhost:8080/brain
```

**View memory:**
```bash
curl http://localhost:8080/memory
```

**Send manual chat:**
```bash
curl -X POST http://localhost:8080/chat \
  -H "Content-Type: application/json" \
  -d '{"message": "Hey bot, what are you doing?"}'
```

## LLM Benchmark

Test different models for tool calling accuracy and speed:

```bash
node test-llm.js
```

See `LLM_BENCHMARK.md` for results. Recommended: `nvidia/nemotron-3-nano-4b` (100% accuracy, fast).

## How It Works

1. **Player types in chat** → Bot receives message via Mineflayer
2. **Living Brain processes** → Emotional state, sensory input, inner monologue
3. **System prompt built** → Inventory, entities, tasks, brain state, memory
4. **LLM generates response** → Tool call or chat message
5. **Tool executes** → Mine, craft, build, etc.
6. **Follow-up LLM call** → Natural response about what happened
7. **Persistent memory updated** → Relationships, discoveries, events

## Architecture

```
src/
├── index.js        # Main bot, tools, LLM integration, API server
├── livingbrain.js  # Emotional model, sensory stream, micro-behaviors
├── memory.js       # Persistent memory, relationships, locations
├── skills.js       # Skill system with XP and leveling
├── advancements.js # Vanilla advancement tracker
└── recipes.js      # MC 1.21.1 crafting recipes
```

## Troubleshooting

### "Bot not connected"
- Check MC server is running and AIBot has operator status
- Verify `config.json` has correct `host` and `port`

### LLM not responding
- Ensure LM Studio is running with a model loaded
- Check the model name in `config.json` matches exactly what's loaded

### Bot digging straight down
- The bot refuses to dig straight down (safety rule)
- Use `dig(direction:"staircase")` instead

## License

MIT
