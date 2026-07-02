# Session Handoff — July 1, 2026

## What happened
- `index.js` on H: drive kept getting wiped to 0 bytes (3rd time)
- **Root cause: H: drive was 100% full (0 bytes free, 1831 GB used)**
- Moved entire project to `E:\minecraft-ai-bot` (136 GB free)
- Rebuilt `index.js` from scratch (~600 lines, 52KB) with improvements from researching Mindcraft, Voyager, MC Agents, MineAI, and others
- Set up git repo, pushed to https://github.com/JesseRC420/minecraft-ai-bot

## Project location
**New:** `E:\minecraft-ai-bot` (use this)
**Old (broken):** `H:\SNAKE MULTIPLAYER\minecraft-ai-bot` (H: drive was full, ignore)

## How to run
```powershell
cd E:\minecraft-ai-bot
node src/index.js
```

## What was rebuilt in index.js
- 18+ tools: chat, goto, follow, mine, chop, dig, place, equip, eat, craft, attack, drop, look, interact, set_goal, cancel_goal, pillar_up, stop, idle
- **Mode system (NEW from Mindcraft research):** self_preservation, self_defense, unstuck, cowardice, item_collecting, idle_staring — run every 500ms WITHOUT the LLM
- **mcData caching (NEW):** avoids repeated require('minecraft-data') calls
- **Behavior logging (NEW):** tracks recent actions for LLM context
- LLM auto-detection — no model specified, LM Studio picks loaded model
- Robust parser for 7+ output formats (JSON, XML, function_call, text-before-tool, control tokens stripped)
- Goal system with recipe chains, mining tier warnings, advancement plans
- Mining tier enforcement (won't try to mine iron with wooden pickaxe)
- Crafting auto-detects log type (jungle_log → jungle_planks, not oak_planks)
- Crafting auto-places crafting table
- Skill system with leveling (from skills.js)
- Advancement tracker (50+ vanilla advancements from advancements.js)
- Personality system (mood, energy, boredom)
- Auto-prompt when idle (30% chance, 30s cooldown, respects botBusy)
- botBusy master flag prevents auto-prompts during tool execution
- HTTP API on port 8080 (/status, /chat, /skills, /advancements)
- Combat bypasses LLM — immediate fight-back
- 120s tool timeout for multi-step operations
- Auto-reconnect on disconnect

## Source files
- `src/index.js` — main bot (52KB, rebuilt)
- `src/skills.js` — skill system with leveling/milestones (26KB, intact)
- `src/advancements.js` — 50+ advancements with metadata (32KB, intact)
- `src/recipes.js` — complete MC 1.21.1 recipes (41KB, intact)
- `memory.json` — persistent storage (gitignored, loads on start)

## GitHub
- Repo: https://github.com/JesseRC420/minecraft-ai-bot
- Auth: GitHub CLI installed at `C:\Program Files\GitHub CLI\gh.exe`
- To push: `cd E:\minecraft-ai-bot` then `git add -A && git commit -m "msg" && git push`

## Key config
- MC Server: localhost:25565, bot username AIBot, version 1.21
- LLM: http://127.0.0.1:1234 (LM Studio, auto-detects loaded model)
- HTTP API: port 8080

## Research done (for context)
### Projects analyzed
- **Voyager (7k stars):** automatic curriculum, skill library of executable code, iterative prompting
- **Mindcraft (5.4k stars):** mode system, self-prompting, action manager, conversation manager, memory bank, task scoring
- **GITM:** hierarchical decomposition (goal → sub-goals → structured actions), text-based knowledge
- **MC Agents:** reflex layer (System 1) vs strategy (System 2), inbox/outbox pattern
- **MineAI:** ReAct loop, skill generation via ChromaDB, dual LLM
- **Minecraft AI Bot (w-koperski):** 3-layer architecture, personality dimensions, confidence scoring

### What we adopted from each
- From Mindcraft: mode system, behavior logging, stuck detection, self-prompting
- From MC Agents: reflex layer (eat/fight/flee without LLM)
- From MineAI: mcData caching
- From all: better parser, botBusy flag, goal system improvements

## Next steps (not started)
- Test the rebuilt bot end-to-end with a real MC server
- Test with different LLM models (deepreinforce-ai_ornith, qwen3.6-14b, gpt-oss-20b)
- Consider adding: embedding-based memory search, multi-agent communication, vision model integration
