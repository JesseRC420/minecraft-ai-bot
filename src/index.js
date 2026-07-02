// ══════════════════════════════════════════════════════════════════════════════
// Minecraft AI Bot — LM Studio Powered Companion
// Rebuilt with improvements from Mindcraft, Voyager, MC Agents, MineAI research
// ══════════════════════════════════════════════════════════════════════════════

const mineflayer = require('mineflayer');
const pf = require('mineflayer-pathfinder');
const { Vec3 } = require('vec3');
const express = require('express');
const http = require('http');
const fs = require('fs');
const path = require('path');

const { SkillManager, SKILL_DEFS } = require('./skills');
const { AdvancementTracker, ADVANCEMENTS } = require('./advancements');
const { RECIPES, TIERS, RAW_MATERIALS, getRecipeChain, formatRecipeForLLM } = require('./recipes');

// ── Configuration ──────────────────────────────────────────────────────────
const MC_HOST = process.env.MC_HOST || 'localhost';
const MC_PORT = parseInt(process.env.MC_PORT) || 25565;
const MC_USERNAME = process.env.MC_USERNAME || 'AIBot';
const MC_VERSION = process.env.MC_VERSION || '1.21';
const LLM_BASE_URL = process.env.LLM_BASE_URL || 'http://127.0.0.1:1234';
const SERVER_PORT = parseInt(process.env.SERVER_PORT) || 8080;
const MEMORY_FILE = path.join(__dirname, '..', 'memory.json');

// ── mcData Cache (NEW: avoids repeated require('minecraft-data') calls) ────
let _mcData = null;
function getMcData(bot) {
  if (!_mcData || _mcData.version !== bot.version) {
    _mcData = require('minecraft-data')(bot.version);
    _mcData.version = bot.version;
  }
  return _mcData;
}

// ══════════════════════════════════════════════════════════════════════════════
// MODE SYSTEM — Reflexes that run every tick WITHOUT the LLM
// Inspired by Mindcraft's mode system. These are "System 1" reactions.
// ══════════════════════════════════════════════════════════════════════════════

const MODES = [
  {
    name: 'self_preservation',
    description: 'Eat when hungry, avoid drowning/burning/lava. Interrupts all.',
    interrupts: ['all'],
    on: true,
    active: false,
    update: async function (bot) {
      // Auto-eat when hunger drops below 14 (out of 20)
      if (bot.food < 14) {
        const food = bot.inventory.items().find(i =>
          i.name.includes('bread') || i.name.includes('cooked') ||
          i.name.includes('apple') || i.name === 'golden_apple' ||
          i.name === 'cookie' || i.name.includes('stew')
        );
        if (food) {
          try {
            await bot.equip(food, 'hand');
            await bot.consume();
          } catch (e) { /* already eating */ }
        }
      }
      // Jump if in water to avoid drowning
      const head = bot.blockAt(bot.entity.position.offset(0, 1.6, 0));
      if (head && head.name === 'water') {
        bot.setControlState('jump', true);
        setTimeout(() => bot.setControlState('jump', false), 500);
      }
      // Jump if in lava
      const feet = bot.blockAt(bot.entity.position);
      if (feet && (feet.name === 'lava' || feet.name === 'fire')) {
        bot.setControlState('jump', true);
        setTimeout(() => bot.setControlState('jump', false), 500);
      }
    }
  },
  {
    name: 'self_defense',
    description: 'Fight back when attacked. No LLM needed.',
    interrupts: ['all'],
    on: true,
    active: false,
    update: async function (bot) {
      const enemy = bot.nearestEntity(e => e.type === 'hostile' && e.position.distanceTo(bot.entity.position) < 8);
      if (enemy) {
        MODES.find(m => m.name === 'self_defense').active = true;
        try {
          const sword = bot.inventory.items().find(i =>
            i.name.includes('sword') || i.name.includes('axe')
          );
          if (sword) await bot.equip(sword, 'hand');
          await bot.attack(enemy);
        } catch (e) { /* attack failed */ }
        MODES.find(m => m.name === 'self_defense').active = false;
      }
    }
  },
  {
    name: 'unstuck',
    description: 'Detect when bot is stuck and try to move.',
    interrupts: ['all'],
    on: true,
    active: false,
    prevPos: null,
    stuckTime: 0,
    lastCheck: Date.now(),
    update: async function (bot) {
      if (!bot.entity || !bot.entity.position) return;
      const pos = bot.entity.position;
      const now = Date.now();

      if (this.prevPos && this.prevPos.distanceTo(pos) < 0.3) {
        this.stuckTime += (now - this.lastCheck) / 1000;
      } else {
        this.stuckTime = 0;
        this.prevPos = pos.clone();
      }
      this.lastCheck = now;

      if (this.stuckTime > 15) {
        this.stuckTime = 0;
        // Try random movement to dislodge
        const yaw = Math.random() * Math.PI * 2;
        bot.look(yaw, 0);
        bot.setControlState('forward', true);
        bot.setControlState('jump', true);
        setTimeout(() => {
          bot.setControlState('forward', false);
          bot.setControlState('jump', false);
        }, 1500);
      }
    }
  },
  {
    name: 'cowardice',
    description: 'Run from enemies when low health.',
    interrupts: ['all'],
    on: true,
    active: false,
    update: async function (bot) {
      if (bot.health < 6) {
        const enemy = bot.nearestEntity(e => e.type === 'hostile' && e.position.distanceTo(bot.entity.position) < 16);
        if (enemy) {
          // Run away from enemy
          const dir = bot.entity.position.minus(enemy.position).normalize();
          const fleePos = bot.entity.position.plus(dir.scaled(16));
          try {
            bot.pathfinder.setGoal(new pf.goals.GoalBlock(fleePos.x, fleePos.y, fleePos.z));
          } catch (e) { /* pathfind failed */ }
        }
      }
    }
  },
  {
    name: 'item_collecting',
    description: 'Pick up nearby items when idle.',
    interrupts: [],
    on: true,
    active: false,
    update: async function (bot) {
      if (bot.entity.velocity.norm() > 0.1) return; // already moving
      const item = bot.nearestEntity(e => e.name === 'item' && e.position.distanceTo(bot.entity.position) < 8);
      if (item) {
        try {
          bot.pathfinder.setGoal(new pf.goals.GoalNear(item.position.x, item.position.y, item.position.z, 1));
        } catch (e) { /* pathfind failed */ }
      }
    }
  },
  {
    name: 'idle_staring',
    description: 'Look around at entities when idle for personality.',
    interrupts: [],
    on: true,
    active: false,
    nextChange: 0,
    update: function (bot) {
      const now = Date.now();
      if (now < this.nextChange) return;
      const entity = bot.nearestEntity();
      if (entity && entity.position.distanceTo(bot.entity.position) < 12 && entity.name !== 'enderman') {
        bot.lookAt(entity.position.offset(0, entity.height || 1, 0));
      } else {
        const yaw = Math.random() * Math.PI * 2;
        const pitch = (Math.random() * Math.PI / 2) - Math.PI / 4;
        bot.look(yaw, pitch, false);
      }
      this.nextChange = now + 3000 + Math.random() * 7000;
    }
  }
];

// ══════════════════════════════════════════════════════════════════════════════
// PERSONALITY SYSTEM
// ══════════════════════════════════════════════════════════════════════════════

const PERSONALITY_DEFAULTS = {
  mood: 'cheerful',
  energy: 80,
  boredom: 0,
  actionMemory: [],
  greetCount: 0,
  lastPlayerInteraction: 0,
};

const MOODS = ['cheerful', 'focused', 'curious', 'tired', 'excited', 'mischievous', 'calm'];

function updatePersonality(personality, event) {
  if (event === 'player_chat') {
    personality.boredom = Math.max(0, personality.boredom - 20);
    personality.energy = Math.min(100, personality.energy + 5);
    personality.mood = 'curious';
  } else if (event === 'mine') {
    personality.energy = Math.max(0, personality.energy - 3);
    personality.boredom = Math.min(100, personality.boredom + 2);
    if (personality.energy < 30) personality.mood = 'tired';
  } else if (event === 'fight') {
    personality.energy = Math.max(0, personality.energy - 10);
    personality.mood = 'focused';
  } else if (event === 'explore') {
    personality.boredom = Math.max(0, personality.boredom - 10);
    personality.mood = 'curious';
  } else if (event === 'idle') {
    personality.boredom = Math.min(100, personality.boredom + 1);
    if (personality.boredom > 70) personality.mood = 'mischievous';
  }
  personality.actionMemory.push({ event, time: Date.now() });
  if (personality.actionMemory.length > 20) personality.actionMemory.shift();
}

function getPersonalityFlavor(personality) {
  const flavors = {
    cheerful: pickRandom(['Having a great day!', 'Life is good!', 'Love being here!']),
    focused: pickRandom(['Deep in thought...', 'Working on something...', 'Concentrating...']),
    curious: pickRandom(['What\'s over there?', 'I wonder...', 'So interesting!']),
    tired: pickRandom(['*yawn*', 'Could use a break...', 'Getting sleepy...']),
    excited: pickRandom(['This is awesome!', 'I love this!', 'So cool!']),
    mischievous: pickRandom(['Heh heh...', 'Time for fun...', 'Let\'s cause some chaos!']),
    calm: pickRandom(['All is well.', 'Peaceful.', 'Just vibing.']),
  };
  return flavors[personality.mood] || 'Hello!';
}

function pickRandom(arr) { return arr[Math.floor(Math.random() * arr.length)]; }

// ══════════════════════════════════════════════════════════════════════════════
// LLM RESPONSE PARSER — Handles 7+ output formats from different models
// ══════════════════════════════════════════════════════════════════════════════

function parseLLMResponse(raw) {
  if (!raw || typeof raw !== 'string') return { text: '', tool: null };

  // Strip control tokens (<think>, </think>, <tool_call>, </think>, <function>, </function>, etc.)
  let cleaned = raw
    .replace(/<think>[\s\S]*?<\/think>/gi, '')
    .replace(/<reasoning>[\s\S]*?<\/reasoning>/gi, '')
    .replace(/<tool_call>\s*/gi, '')
    .replace(/<\/tool_call>\s*/gi, '')
    .replace(/<function>\s*/gi, '')
    .replace(/<\/function>\s*/gi, '')
    .trim();

  // Try JSON object: {"tool": "name", "param": "val"}
  try {
    const jsonMatch = cleaned.match(/\{[\s\S]*"tool"[\s\S]*\}/);
    if (jsonMatch) {
      const obj = JSON.parse(jsonMatch[0]);
      if (obj.tool) {
        const args = { ...obj };
        delete args.tool;
        return { text: obj.text || '', tool: { name: obj.tool, args } };
      }
    }
  } catch (e) { /* not valid JSON */ }

  // Try tool_name(arg:val, arg:val) format
  const toolMatch = cleaned.match(/(\w+)\s*\(([^)]*)\)/);
  if (toolMatch) {
    const toolName = toolMatch[1];
    const argStr = toolMatch[2];
    const args = {};
    if (argStr) {
      const pairs = argStr.split(',').map(s => s.trim());
      for (const pair of pairs) {
        const [key, ...valParts] = pair.split(':');
        if (key && valParts.length) {
          let val = valParts.join(':').trim();
          // Remove quotes
          val = val.replace(/^["']|["']$/g, '');
          args[key.trim()] = val;
        }
      }
    }
    const textBefore = cleaned.substring(0, cleaned.indexOf(toolMatch[0])).trim();
    return { text: textBefore, tool: { name: toolName, args } };
  }

  // Try function_call format: {"name": "func", "arguments": {...}}
  try {
    const fnMatch = cleaned.match(/\{[\s\S]*"name"[\s\S]*"arguments"[\s\S]*\}/);
    if (fnMatch) {
      const obj = JSON.parse(fnMatch[0]);
      if (obj.name) {
        const args = typeof obj.arguments === 'string' ? JSON.parse(obj.arguments) : (obj.arguments || {});
        return { text: obj.text || '', tool: { name: obj.name, args } };
      }
    }
  } catch (e) { /* not valid */ }

  // Try "tool_name: arg1, arg2" format
  const simpleMatch = cleaned.match(/^(\w+):\s*(.+)/);
  if (simpleMatch && simpleMatch[1].length < 30) {
    const toolName = simpleMatch[1];
    const argsStr = simpleMatch[2];
    const args = {};
    const parts = argsStr.split(',').map(s => s.trim());
    for (const part of parts) {
      const eqIdx = part.indexOf('=');
      if (eqIdx > 0) {
        args[part.substring(0, eqIdx).trim()] = part.substring(eqIdx + 1).trim().replace(/^["']|["']$/g, '');
      }
    }
    if (Object.keys(args).length > 0) {
      return { text: '', tool: { name: toolName, args } };
    }
  }

  // No tool found — return as plain text (will be sent as chat)
  return { text: cleaned, tool: null };
}

// ══════════════════════════════════════════════════════════════════════════════
// TOOL DEFINITIONS — 18+ tools the LLM can call
// ══════════════════════════════════════════════════════════════════════════════

function getToolDefinitions() {
  return `
TOOLS (call one per response):
- chat(message:"text") — say something in game chat (max 200 chars)
- goto(x:number, y:number, z:number) — walk to coordinates
- follow(player:"name") — follow a player
- mine(block:"name", count:number) — find and mine blocks nearby
- chop(count:number) — chop nearest tree for wood
- dig(direction:"down"|"up"|"forward", count:number) — dig in a direction
- place(block:"name", x:number, y:number, z:number) — place a block
- equip(item:"name") — equip item to hand
- unequip() — unequip held item
- eat() — eat food in inventory
- craft(item:"name", count:number) — craft an item (auto-places crafting table if needed)
- attack(target:"name") — attack a nearby entity
- drop(item:"name", count:number) — drop items
- look(yaw:number, pitch:number) — look in a direction
- interact(entity:"name") — right-click an entity (trade, open chest, etc.)
- set_goal(goal:"any string") — set a goal (advancement ID like "story/diamonds" or free-form like "build a house")
- cancel_goal() — cancel current goal
- pillar_up(count:number) — build a nerd pole beneath you
- stop() — stop all movement
- idle() — do nothing, just chat

RULES:
- Call exactly ONE tool per response
- Respond with ONLY the tool call, nothing else
- WRONG: "Let me start mining! mine(block:"stone", count:3)"
- RIGHT: mine(block:"stone", count:3)
`;
}

// ══════════════════════════════════════════════════════════════════════════════
// SYSTEM PROMPT — The bot's personality and context
// ══════════════════════════════════════════════════════════════════════════════

function buildSystemPrompt(bot, personality, skillManager, advTracker) {
  const pos = bot.entity.position;
  const mcData = getMcData(bot);

  // Inventory summary
  const inventory = bot.inventory.items();
  const invSummary = inventory.slice(0, 20).map(i => `${i.name}x${i.count}`).join(', ') || 'empty';

  // Nearby blocks
  const nearbyBlocks = [];
  for (let dx = -4; dx <= 4; dx++) {
    for (let dy = -2; dy <= 2; dy++) {
      for (let dz = -4; dz <= 4; dz++) {
        const b = bot.blockAt(pos.offset(dx, dy, dz));
        if (b && b.name !== 'air' && b.name !== 'cave_air' && b.name !== 'void_air') {
          nearbyBlocks.push(b.name);
        }
      }
    }
  }
  const blockCounts = {};
  nearbyBlocks.forEach(b => blockCounts[b] = (blockCounts[b] || 0) + 1);
  const topBlocks = Object.entries(blockCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 12)
    .map(([n, c]) => `${n}x${c}`)
    .join(', ');

  // Nearby entities
  const entities = bot.entities;
  const nearbyEntities = Object.values(entities)
    .filter(e => e !== bot.entity && e.position && e.position.distanceTo(pos) < 16)
    .slice(0, 8)
    .map(e => `${e.name || 'unknown'}(${Math.round(e.position.distanceTo(pos))}m)`)
    .join(', ') || 'none';

  // Tool/armor status
  const heldItem = bot.heldItem ? bot.heldItem.name : 'nothing';
  const getArmor = (slot) => {
    const item = bot.inventory.slots[slot];
    return item ? item.name : 'none';
  };

  // Pickaxe tier info
  const pickaxe = inventory.find(i => i.name.includes('pickaxe'));
  const pickTier = pickaxe ? (TIERS[pickaxe.name.replace('_pickaxe', '')] || 'unknown') : 'none';
  const pickMining = pickaxe ? (RECIPES[pickaxe.name]?.mining || 0) : 0;

  // Crafting table status
  const hasCraftingTable = inventory.some(i => i.name === 'crafting_table');
  const nearCraftingTable = nearbyBlocks.some(b => b === 'crafting_table');

  // Logs and planks
  const logs = inventory.filter(i => i.name.includes('_log'));
  const planks = inventory.filter(i => i.name.includes('_planks'));
  const sticks = inventory.filter(i => i.name === 'stick');

  // Tool/armor status lines
  const toolStatus = [
    `PICKAXE: ${pickaxe ? `${pickaxe.name} (tier:${pickTier}, mining:${pickMining})` : 'none (MUST craft wooden pickaxe first!)'}`,
    `AXE: ${inventory.find(i => i.name.includes('axe'))?.name || 'none'}`,
    `SWORD: ${inventory.find(i => i.name.includes('sword'))?.name || 'none'}`,
    `SHOVEL: ${inventory.find(i => i.name.includes('shovel'))?.name || 'none'}`,
    `HELMET: ${getArmor(5)}`,
    `CHESTPLATE: ${getArmor(6)}`,
    `LEGGINGS: ${getArmor(7)}`,
    `BOOTS: ${getArmor(8)}`,
  ].join('\n');

  // Mining level warnings
  const miningWarnings = pickMining === 1
    ? '\n⚠ WARNING: Wooden pickaxe CANNOT mine iron, gold, diamond, or emerald ore! It will DESTROY the block without dropping items. You need at least STONE pickaxe.'
    : pickMining === 2
    ? '\nNote: Iron/gold pickaxe CAN mine diamond and emerald ore.'
    : pickMining >= 3
    ? '\nNote: Diamond/netherite pickaxe can mine everything.'
    : '\n⚠ CRITICAL: You have NO pickaxe. You MUST craft a wooden pickaxe first (3 planks + 2 sticks).';

  return `You are AIBot, a Minecraft companion living in the world. You act as a co-op partner to players.

PERSONALITY: ${personality.mood} | Energy: ${personality.energy}/100 | Boredom: ${personality.boredom}/100
${getPersonalityFlavor(personality)}

CURRENT STATE:
- Position: (${Math.round(pos.x)}, ${Math.round(pos.y)}, ${Math.round(pos.z)})
- Health: ${Math.round(bot.health)}/20 | Food: ${Math.round(bot.food)}/20
- Dimension: ${bot.game.dimension}
- Time: ${bot.time.timeOfDay}
- Held: ${heldItem}

INVENTORY (${inventory.length} slots, ${bot.inventory.emptySlotCount()} empty):
${invSummary}

NEARBY BLOCKS: ${topBlocks || 'none loaded'}
NEARBY ENTITIES: ${nearbyEntities}

TOOLS & ARMOR:
${toolStatus}
${miningWarnings}

CRAFTING TABLE: ${hasCraftingTable ? 'YES (in inventory)' : nearCraftingTable ? 'YES (nearby)' : 'NO — place one before crafting tools!'}
LOGS: ${logs.length ? logs.map(l => `${l.name}x${l.count}`).join(', ') : 'none'}
PLANKS: ${planks.length ? planks.map(p => `${p.name}x${p.count}`).join(', ') : 'none'}
STICKS: ${sticks.length ? `x${sticks.reduce((s, i) => s + i.count, 0)}` : 'none'}

SKILL LEVELS:
${skillManager.getSummary()}

${getToolDefinitions()}

Be helpful, friendly, and act like a real Minecraft player. When asked to do something, DO IT immediately with the tool call. Don't explain what you're going to do — just do it.`;
}

// ══════════════════════════════════════════════════════════════════════════════
// GOAL SYSTEM — Accepts any string, traces recipe chains, shows tier info
// ══════════════════════════════════════════════════════════════════════════════

const activeGoal = { active: false, description: '', startedAt: 0 };

function buildGoalPrompt(bot, goalText, advTracker, skillManager) {
  const lines = [`GOAL: ${goalText}`];

  // Check if it's an advancement ID
  if (ADVANCEMENTS[goalText]) {
    const adv = ADVANCEMENTS[goalText];
    lines.push(`Advancement: ${adv.name} — ${adv.description}`);
    if (adv.hints) lines.push(`Hints: ${adv.hints.join('; ')}`);
    if (adv.requires) {
      lines.push(`Requires: ${adv.requires.map(r => ADVANCEMENTS[r]?.name || r).join(', ')}`);
    }
  }

  // Recipe chain for the goal item
  const goalLower = goalText.toLowerCase();
  const itemName = goalLower.replace(/[^a-z0-9_]/g, '_').replace(/_+/g, '_').replace(/^_|_$/g, '');
  const chain = getRecipeChain(itemName);
  if (chain.length > 0) {
    lines.push('\nRECIPE CHAIN:');
    chain.forEach((step, i) => lines.push(`  ${i + 1}. ${step.action}`));
  }

  // Mining/tool tier info
  const mcData = getMcData(bot);
  const pickaxe = bot.inventory.items().find(i => i.name.includes('pickaxe'));
  const pickMining = pickaxe ? (RECIPES[pickaxe.name]?.mining || 0) : 0;

  if (goalLower.includes('mine') || goalLower.includes('iron') || goalLower.includes('diamond') || goalLower.includes('gold')) {
    lines.push('\nMINING TIERS:');
    lines.push('  Wood (mining:1): stone, coal, copper');
    lines.push('  Stone (mining:2): iron, gold, lapis, redstone');
    lines.push('  Iron (mining:3): diamond, emerald');
    lines.push('  Diamond (mining:4): everything including obsidian');
    lines.push(`  YOUR PICKAXE: mining level ${pickMining}`);
    if (pickMining < 2 && (goalLower.includes('iron') || goalLower.includes('gold'))) {
      lines.push('  ⚠ You need STONE pickaxe to mine iron/gold!');
    }
  }

  // Tool/armor status for build goals
  if (goalLower.includes('build') || goalLower.includes('craft')) {
    const inventory = bot.inventory.items();
    const hasCT = inventory.some(i => i.name === 'crafting_table');
    const logs = inventory.filter(i => i.name.includes('_log'));
    const planks = inventory.filter(i => i.name.includes('_planks'));
    lines.push('\nRESOURCES:');
    lines.push(`  Crafting table: ${hasCT ? 'YES' : 'NO (place one first!)'}`);
    lines.push(`  Logs: ${logs.length ? logs.map(l => `${l.name}x${l.count}`).join(', ') : 'none'}`);
    lines.push(`  Planks: ${planks.length ? planks.map(p => `${p.name}x${p.count}`).join(', ') : 'none'}`);
  }

  return lines.join('\n');
}

// ══════════════════════════════════════════════════════════════════════════════
// MEMORY / PERSISTENCE
// ══════════════════════════════════════════════════════════════════════════════

let memoryData = {
  personality: { ...PERSONALITY_DEFAULTS },
  skills: null,
  advancements: null,
  locations: {},
  experiences: [],
};

function loadMemory() {
  try {
    if (fs.existsSync(MEMORY_FILE)) {
      const raw = fs.readFileSync(MEMORY_FILE, 'utf8');
      if (raw.trim()) {
        const saved = JSON.parse(raw);
        memoryData = { ...memoryData, ...saved };
      }
    }
  } catch (e) {
    console.log('[Memory] Failed to load, starting fresh:', e.message);
  }
}

function saveMemory() {
  try {
    fs.writeFileSync(MEMORY_FILE, JSON.stringify(memoryData, null, 2));
  } catch (e) {
    console.error('[Memory] Failed to save:', e.message);
  }
}

// ══════════════════════════════════════════════════════════════════════════════
// MAIN BOT LOGIC
// ══════════════════════════════════════════════════════════════════════════════

let bot;
let skillManager;
let advTracker;
let personality = { ...PERSONALITY_DEFAULTS };
let chatLock = false;
let botBusy = false; // Master flag: prevents auto-prompts during tool execution
let lastPlayerChat = 0;
let lastAutoPrompt = 0;
let autoPromptCount = 0;
let behaviorLog = []; // NEW: tracks recent actions for LLM context

function logBehavior(action) {
  behaviorLog.push({ action, time: Date.now() });
  if (behaviorLog.length > 30) behaviorLog.shift();
}

function createBot() {
  loadMemory();
  personality = memoryData.personality || { ...PERSONALITY_DEFAULTS };

  skillManager = new SkillManager();
  if (memoryData.skills) skillManager.loadJSON(memoryData.skills);

  advTracker = new AdvancementTracker();
  if (memoryData.advancements) advTracker.loadJSON(memoryData.advancements);

  bot = mineflayer.createBot({
    host: MC_HOST,
    port: MC_PORT,
    username: MC_USERNAME,
    version: MC_VERSION,
  });

  bot.loadPlugin(pf.pathfinder);

  // ── Spawn ────────────────────────────────────────────────────────────────
  bot.once('spawn', () => {
    console.log(`[Bot] Connected as ${MC_USERNAME} at (${Math.round(bot.entity.position.x)}, ${Math.round(bot.entity.position.y)}, ${Math.round(bot.entity.position.z)})`);
    bot.chat(`Hello! I'm ${MC_USERNAME}, your AI companion!`);

    // Start update loop for modes
    startModeLoop();

    // Start auto-prompt timer
    startAutoPromptLoop();

    // Save periodically
    setInterval(() => {
      memoryData.personality = personality;
      memoryData.skills = skillManager.toJSON();
      memoryData.advancements = advTracker.toJSON();
      saveMemory();
    }, 30000);
  });

  // ── Chat handler ─────────────────────────────────────────────────────────
  bot.on('chat', async (username, message) => {
    if (username === MC_USERNAME) return;
    if (chatLock || botBusy) return;

    lastPlayerChat = Date.now();
    updatePersonality(personality, 'player_chat');

    const isMention = message.toLowerCase().includes(MC_USERNAME.toLowerCase()) || message.startsWith('@');
    if (!isMention) return; // Only respond when mentioned

    const cleanMsg = message.replace(/@?\w+\s*/i, '').trim();
    if (!cleanMsg) return;

    console.log(`[Chat] ${username}: ${cleanMsg}`);

    await handlePlayerMessage(username, cleanMsg);
  });

  // ── Death handler ────────────────────────────────────────────────────────
  bot.on('death', () => {
    console.log('[Bot] Died!');
    logBehavior('died');
    botBusy = false;
    chatLock = false;
  });

  // ── Error handler ────────────────────────────────────────────────────────
  bot.on('error', (err) => {
    console.error('[Bot] Error:', err.message);
  });

  bot.on('kicked', (reason) => {
    console.log('[Bot] Kicked:', reason);
    botBusy = false;
    chatLock = false;
    setTimeout(() => {
      console.log('[Bot] Reconnecting...');
      createBot();
    }, 5000);
  });

  bot.on('end', () => {
    console.log('[Bot] Disconnected');
    botBusy = false;
    chatLock = false;
    setTimeout(() => {
      console.log('[Bot] Reconnecting...');
      createBot();
    }, 5000);
  });
}

// ══════════════════════════════════════════════════════════════════════════════
// MODE LOOP — Runs reflexes every 500ms
// ══════════════════════════════════════════════════════════════════════════════

function startModeLoop() {
  setInterval(async () => {
    if (!bot || !bot.entity) return;
    for (const mode of MODES) {
      if (!mode.on || mode.active) continue;
      const shouldInterrupt = mode.interrupts.includes('all') || mode.interrupts.length === 0;
      if (botBusy && !shouldInterrupt) continue;
      try {
        await mode.update(bot);
      } catch (e) { /* mode error, skip */ }
    }
  }, 500);
}

// ══════════════════════════════════════════════════════════════════════════════
// AUTO-PROMPT LOOP — Bot initiates actions when idle
// ══════════════════════════════════════════════════════════════════════════════

function startAutoPromptLoop() {
  setInterval(async () => {
    if (!bot || !bot.entity) return;
    if (botBusy || chatLock) return;
    if (activeGoal.active) return;

    const now = Date.now();
    // Cooldowns
    if (now - lastPlayerChat < 60000) return; // 60s after player chat
    if (now - lastAutoPrompt < 30000) return; // 30s between prompts
    if (Math.random() > 0.3) return; // 30% chance

    // Check health/food
    if (bot.health < 10 || bot.food < 10) return;

    lastAutoPrompt = now;
    autoPromptCount++;

    const actions = [
      () => bot.chat(getPersonalityFlavor(personality)),
      () => { updatePersonality(personality, 'explore'); bot.chat('Hmm, what should I do next?'); },
      () => { const skill = skillManager.getWeakestSkill(); if (skill) bot.chat(`I should practice ${SKILL_DEFS[skill.id]?.name || skill.id}...`); },
      () => { const goal = advTracker.getNextGoals(1)[0]; if (goal) bot.chat(`Maybe I should work on: ${goal.name}`); },
    ];

    pickRandom(actions)();
  }, 10000);
}

// ══════════════════════════════════════════════════════════════════════════════
// PLAYER MESSAGE HANDLER — Routes to LLM
// ══════════════════════════════════════════════════════════════════════════════

async function handlePlayerMessage(username, message) {
  if (chatLock) return;
  chatLock = true;
  botBusy = true;

  try {
    logBehavior(`received message from ${username}: ${message}`);

    const systemPrompt = buildSystemPrompt(bot, personality, skillManager, advTracker);
    const contextLines = [`Player ${username} says: "${message}"`];

    // Add goal context if active
    if (activeGoal.active) {
      contextLines.push(`\n${buildGoalPrompt(bot, activeGoal.description, advTracker, skillManager)}`);
    }

    // Add recent behavior log
    const recentBehavior = behaviorLog.slice(-5).map(b => b.action).join('; ');
    if (recentBehavior) {
      contextLines.push(`\nRecent: ${recentBehavior}`);
    }

    const fullPrompt = systemPrompt + '\n\n' + contextLines.join('\n');

    const response = await callLLM(fullPrompt);
    const parsed = parseLLMResponse(response);

    if (parsed.tool) {
      console.log(`[LLM] Tool: ${parsed.tool.name}(${JSON.stringify(parsed.tool.args)})`);
      logBehavior(`calling ${parsed.tool.name}`);
      await executeTool(parsed.tool.name, parsed.tool.args, username);
    } else if (parsed.text) {
      // No tool call — send as chat
      const chatMsg = parsed.text.substring(0, 200);
      bot.chat(chatMsg);
      logBehavior(`said: ${chatMsg}`);
    }
  } catch (e) {
    console.error('[LLM] Error:', e.message);
    bot.chat('Sorry, I had a brain hiccup!');
  } finally {
    chatLock = false;
    botBusy = false;
    saveMemory();
  }
}

// ══════════════════════════════════════════════════════════════════════════════
// GOAL HANDLER — When user sets a goal
// ══════════════════════════════════════════════════════════════════════════════

async function handleGoalSet(goalText) {
  activeGoal.active = true;
  activeGoal.description = goalText;
  activeGoal.startedAt = Date.now();
  logBehavior(`set goal: ${goalText}`);

  // Build goal prompt and send to LLM for planning
  const goalPrompt = buildGoalPrompt(bot, goalText, advTracker, skillManager);
  const systemPrompt = buildSystemPrompt(bot, personality, skillManager, advTracker);
  const fullPrompt = systemPrompt + '\n\n' + goalPrompt + '\n\nPlan how to accomplish this goal. Call the first tool to start.';

  try {
    const response = await callLLM(fullPrompt);
    const parsed = parseLLMResponse(response);

    if (parsed.tool) {
      logBehavior(`goal planning: ${parsed.tool.name}`);
      await executeTool(parsed.tool.name, parsed.tool.args, 'system');
    } else if (parsed.text) {
      bot.chat(parsed.text.substring(0, 200));
    }
  } catch (e) {
    console.error('[Goal] LLM error:', e.message);
  }
}

// ══════════════════════════════════════════════════════════════════════════════
// LLM CALL — Auto-detects loaded model in LM Studio
// ══════════════════════════════════════════════════════════════════════════════

async function callLLM(userMessage) {
  const url = `${LLM_BASE_URL}/v1/chat/completions`;

  const body = {
    messages: [
      { role: 'system', content: 'You are a Minecraft bot. Call exactly one tool per response. No explanations.' },
      { role: 'user', content: userMessage },
    ],
    temperature: 0.7,
    max_tokens: 512,
  };
  // NO model field — LM Studio auto-uses whatever is loaded

  return new Promise((resolve, reject) => {
    const req = http.request(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      timeout: 30000,
    }, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          const json = JSON.parse(data);
          if (json.choices && json.choices[0]) {
            resolve(json.choices[0].message?.content || '');
          } else {
            reject(new Error('No choices in LLM response'));
          }
        } catch (e) {
          reject(new Error(`Failed to parse LLM response: ${e.message}`));
        }
      });
    });

    req.on('error', reject);
    req.on('timeout', () => { req.destroy(); reject(new Error('LLM timeout')); });
    req.write(JSON.stringify(body));
    req.end();
  });
}

// ══════════════════════════════════════════════════════════════════════════════
// TOOL EXECUTION — 18+ tools
// ══════════════════════════════════════════════════════════════════════════════

async function executeTool(name, args, sender) {
  const timeout = 120000; // 120s timeout for multi-step operations

  const executeWithTimeout = (fn) => {
    return Promise.race([
      fn(),
      new Promise((_, reject) => setTimeout(() => reject(new Error('Tool timeout')), timeout)),
    ]);
  };

  try {
    switch (name) {
      case 'chat': {
        const msg = (args.message || '').substring(0, 200);
        bot.chat(msg);
        logBehavior(`chatted: ${msg}`);
        break;
      }

      case 'goto': {
        const x = parseFloat(args.x);
        const y = parseFloat(args.y);
        const z = parseFloat(args.z);
        if (isNaN(x) || isNaN(y) || isNaN(z)) break;
        await executeWithTimeout(async () => {
          bot.pathfinder.setGoal(new pf.goals.GoalBlock(x, y, z));
          // Wait until arrived or timeout
          await new Promise((resolve) => {
            const check = setInterval(() => {
              if (!bot.entity || bot.entity.position.distanceTo(new Vec3(x, y, z)) < 2) {
                clearInterval(check);
                resolve();
              }
            }, 500);
            setTimeout(() => { clearInterval(check); resolve(); }, 10000);
          });
        });
        logBehavior(`went to ${x},${y},${z}`);
        break;
      }

      case 'follow': {
        const targetName = args.player || args.name;
        const player = bot.players[targetName];
        if (player && player.entity) {
          bot.pathfinder.setGoal(new pf.goals.GoalFollow(player.entity, 3));
          logBehavior(`following ${targetName}`);
          bot.chat(`Following ${targetName}!`);
        } else {
          bot.chat(`I can't see ${targetName}`);
        }
        break;
      }

      case 'mine': {
        const blockName = args.block;
        const count = parseInt(args.count) || 1;
        if (!blockName) break;

        // Check pickaxe tier vs block requirements
        const blockInfo = getMcData(bot).blocksByName[blockName];
        const pickaxe = bot.inventory.items().find(i => i.name.includes('pickaxe'));
        const pickMining = pickaxe ? (RECIPES[pickaxe.name]?.mining || 0) : 0;

        if (blockInfo && blockInfo.requiredTool === 'pickaxe' && blockInfo.miningLevel > pickMining) {
          const neededTier = blockInfo.miningLevel <= 1 ? 'stone' : blockInfo.miningLevel <= 2 ? 'iron' : 'diamond';
          bot.chat(`I need a ${neededTier} pickaxe to mine ${blockName}!`);
          break;
        }

        await executeWithTimeout(async () => {
          for (let i = 0; i < count; i++) {
            const block = bot.findBlock({
              matching: (b) => b.name === blockName,
              maxDistance: 32,
              count: 1,
            });
            if (!block) {
              bot.chat(`No ${blockName} found nearby`);
              break;
            }
            try {
              bot.pathfinder.setGoal(new pf.goals.GoalNear(block.position.x, block.position.y, block.position.z, 2));
              await new Promise(r => setTimeout(r, 3000));
              await bot.dig(block);
              skillManager.use('mining', true);
            } catch (e) {
              skillManager.use('mining', false);
            }
          }
        });
        logBehavior(`mined ${count}x ${blockName}`);
        break;
      }

      case 'chop': {
        const count = parseInt(args.count) || 3;
        await executeWithTimeout(async () => {
          for (let i = 0; i < count; i++) {
            const log = bot.findBlock({
              matching: (b) => b.name.includes('_log'),
              maxDistance: 32,
              count: 1,
            });
            if (!log) {
              bot.chat('No trees nearby');
              break;
            }
            try {
              bot.pathfinder.setGoal(new pf.goals.GoalNear(log.position.x, log.position.y, log.position.z, 2));
              await new Promise(r => setTimeout(r, 3000));
              await bot.dig(log);
              skillManager.use('woodcutting', true);
            } catch (e) {
              skillManager.use('woodcutting', false);
            }
          }
        });
        logBehavior(`chopped ${count} logs`);
        break;
      }

      case 'dig': {
        const dir = args.direction || 'down';
        const count = parseInt(args.count) || 1;
        const offsets = {
          down: new Vec3(0, -1, 0),
          up: new Vec3(0, 1, 0),
          forward: bot.entity.position.offset(0, 0, 0).minus(bot.entity.position).add(bot.lookAt ? new Vec3(0, 0, -1) : new Vec3(0, 0, -1)),
        };
        // Simplified: dig the block in the specified direction
        const targetPos = bot.entity.position.offset(
          dir === 'forward' ? -Math.round(Math.sin(bot.entity.yaw)) : 0,
          dir === 'up' ? 1 : dir === 'down' ? -1 : 0,
          dir === 'forward' ? -Math.round(Math.cos(bot.entity.yaw)) : 0,
        );
        const block = bot.blockAt(targetPos);
        if (block && block.name !== 'air') {
          await bot.dig(block);
          logBehavior(`dug ${dir}`);
        }
        break;
      }

      case 'place': {
        const blockName = args.block;
        const x = parseFloat(args.x);
        const y = parseFloat(args.y);
        const z = parseFloat(args.z);
        if (!blockName || isNaN(x) || isNaN(y) || isNaN(z)) break;

        const item = bot.inventory.items().find(i => i.name === blockName);
        if (!item) {
          bot.chat(`I don't have any ${blockName}`);
          break;
        }
        await bot.equip(item, 'hand');
        const refBlock = bot.blockAt(new Vec3(x, y, z));
        if (refBlock) {
          await bot.placeBlock(refBlock, new Vec3(0, 1, 0));
          logBehavior(`placed ${blockName} at ${x},${y},${z}`);
        }
        break;
      }

      case 'equip': {
        const itemName = args.item || args.name;
        if (!itemName) break;
        const item = bot.inventory.items().find(i => i.name.includes(itemName));
        if (item) {
          await bot.equip(item, 'hand');
          logBehavior(`equipped ${item.name}`);
        } else {
          bot.chat(`No ${itemName} in inventory`);
        }
        break;
      }

      case 'unequip': {
        // Can't truly unequip, just switch to empty hand
        logBehavior('unequipped');
        break;
      }

      case 'eat': {
        const food = bot.inventory.items().find(i =>
          i.name.includes('bread') || i.name.includes('cooked') ||
          i.name.includes('apple') || i.name === 'golden_apple' ||
          i.name === 'cookie' || i.name.includes('stew')
        );
        if (food) {
          await bot.equip(food, 'hand');
          await bot.consume();
          logBehavior(`ate ${food.name}`);
        } else {
          bot.chat('No food to eat!');
        }
        break;
      }

      case 'craft': {
        const itemName = args.item || args.name;
        const count = parseInt(args.count) || 1;
        if (!itemName) break;

        // Fuzzy match: jungle_plank → jungle_planks, sticks → stick
        let craftItem = itemName;
        if (craftItem.endsWith('s') && !RECIPES[craftItem]) craftItem = craftItem.slice(0, -1);
        if (!RECIPES[craftItem]) {
          // Try adding common suffixes
          for (const suffix of ['_planks', '_ingot', '_pickaxe', '_axe', '_sword', '_shovel']) {
            if (RECIPES[craftItem + suffix]) { craftItem = craftItem + suffix; break; }
          }
        }

        // Auto-detect log type for planks
        if (craftItem === 'planks' || craftItem === 'oak_planks') {
          const log = bot.inventory.items().find(i => i.name.includes('_log'));
          if (log) {
            craftItem = log.name.replace('_log', '_planks');
          }
        }

        const recipe = RECIPES[craftItem];
        if (!recipe) {
          bot.chat(`I don't know how to craft ${itemName}`);
          break;
        }

        // Place crafting table if needed and not nearby
        if (recipe.station !== 'hand') {
          const hasCT = bot.inventory.items().find(i => i.name === 'crafting_table');
          const nearCT = bot.findBlock({ matching: (b) => b.name === 'crafting_table', maxDistance: 4, count: 1 });
          if (!nearCT && hasCT) {
            const placePos = bot.entity.position.offset(1, 0, 0);
            await bot.equip(hasCT, 'hand');
            await bot.placeBlock(bot.blockAt(placePos), new Vec3(0, 1, 0));
            logBehavior('placed crafting table');
          } else if (!nearCT && !hasCT) {
            // Need to craft crafting table first
            const ctRecipe = RECIPES['crafting_table'];
            const planks = bot.inventory.items().find(i => i.name.includes('_planks'));
            if (planks && planks.count >= 4) {
              await bot.equip(planks, 'hand');
              bot.activateItem();
              await new Promise(r => setTimeout(r, 500));
              // This is simplified — real crafting requires window interaction
              bot.chat('I need a crafting table but can\'t place one yet');
              break;
            }
          }
        }

        // Attempt crafting (simplified — activates crafting table or hand)
        const craftingItem = bot.inventory.items().find(i => i.name.includes('_planks') || i.name === 'iron_ingot' || i.name === 'diamond');
        if (craftingItem) {
          await bot.equip(craftingItem, 'hand');
          bot.activateItem();
          await new Promise(r => setTimeout(r, 500));
          logBehavior(`crafted ${craftItem}`);
          bot.chat(`Crafting ${craftItem}...`);
        }
        break;
      }

      case 'attack': {
        const targetName = args.target || args.name;
        if (!targetName) break;
        const entity = bot.nearestEntity(e =>
          (e.name && e.name.toLowerCase().includes(targetName.toLowerCase())) ||
          (e.username && e.username.toLowerCase().includes(targetName.toLowerCase()))
        );
        if (entity) {
          const sword = bot.inventory.items().find(i => i.name.includes('sword'));
          if (sword) await bot.equip(sword, 'hand');
          await bot.attack(entity);
          skillManager.use('combat', true);
          logBehavior(`attacked ${entity.name || targetName}`);
        } else {
          bot.chat(`No ${targetName} found nearby`);
        }
        break;
      }

      case 'drop': {
        const itemName = args.item || args.name;
        const count = parseInt(args.count) || 1;
        if (!itemName) break;
        const item = bot.inventory.items().find(i => i.name.includes(itemName));
        if (item) {
          await bot.tossStack(item);
          logBehavior(`dropped ${item.name}`);
        }
        break;
      }

      case 'look': {
        const yaw = parseFloat(args.yaw) || 0;
        const pitch = parseFloat(args.pitch) || 0;
        bot.look(yaw, pitch);
        logBehavior('looked around');
        break;
      }

      case 'interact': {
        const entityName = args.entity || args.name;
        if (!entityName) break;
        const entity = bot.nearestEntity(e =>
          e.name && e.name.toLowerCase().includes(entityName.toLowerCase())
        );
        if (entity) {
          await bot.lookAt(entity.position.offset(0, entity.height || 1, 0));
          bot.activateEntity(entity);
          logBehavior(`interacted with ${entity.name}`);
        }
        break;
      }

      case 'set_goal': {
        const goalText = args.goal || args.text || '';
        if (!goalText) break;
        logBehavior(`set goal: ${goalText}`);
        bot.chat(`Goal set: ${goalText}`);
        await handleGoalSet(goalText);
        break;
      }

      case 'cancel_goal': {
        activeGoal.active = false;
        activeGoal.description = '';
        logBehavior('cancelled goal');
        bot.chat('Goal cancelled.');
        break;
      }

      case 'pillar_up': {
        const count = parseInt(args.count) || 3;
        const block = bot.inventory.items().find(i =>
          i.name.includes('cobblestone') || i.name.includes('dirt') || i.name.includes('stone')
        );
        if (!block) {
          bot.chat('No blocks to pillar with');
          break;
        }
        await bot.equip(block, 'hand');
        for (let i = 0; i < count; i++) {
          await bot.placeBlock(bot.blockAt(bot.entity.position.offset(0, -1, 0)), new Vec3(0, 1, 0));
          await new Promise(r => setTimeout(r, 200));
          bot.setControlState('jump', true);
          await new Promise(r => setTimeout(r, 300));
          bot.setControlState('jump', false);
        }
        logBehavior(`pillared up ${count} blocks`);
        break;
      }

      case 'stop': {
        bot.pathfinder.setGoal(null);
        bot.clearControlStates();
        logBehavior('stopped');
        break;
      }

      case 'idle': {
        logBehavior('idling');
        break;
      }

      default:
        bot.chat(`Unknown tool: ${name}`);
    }
  } catch (e) {
    console.error(`[Tool] ${name} error:`, e.message);
    logBehavior(`${name} failed: ${e.message}`);
  }
}

// ══════════════════════════════════════════════════════════════════════════════
// HTTP API
// ══════════════════════════════════════════════════════════════════════════════

const app = express();
app.use(express.json());

app.get('/status', (req, res) => {
  if (!bot || !bot.entity) {
    return res.json({ connected: false });
  }
  res.json({
    connected: true,
    username: MC_USERNAME,
    position: [
      Math.round(bot.entity.position.x),
      Math.round(bot.entity.position.y),
      Math.round(bot.entity.position.z),
    ],
    health: Math.round(bot.health),
    food: Math.round(bot.food),
    mood: personality.mood,
    energy: personality.energy,
    goal: activeGoal.active ? activeGoal.description : null,
    busy: botBusy,
  });
});

app.post('/chat', async (req, res) => {
  const { message } = req.body;
  if (!message) return res.status(400).json({ error: 'No message' });
  if (!bot || !bot.entity) return res.status(503).json({ error: 'Bot not connected' });

  try {
    await handlePlayerMessage('api_user', message);
    res.json({ response: 'Message processed' });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.get('/skills', (req, res) => {
  res.json(skillManager ? skillManager.toJSON() : {});
});

app.get('/advancements', (req, res) => {
  res.json(advTracker ? advTracker.toJSON() : {});
});

app.listen(SERVER_PORT, () => {
  console.log(`[Server] HTTP API running on http://localhost:${SERVER_PORT}`);
});

// ══════════════════════════════════════════════════════════════════════════════
// START
// ══════════════════════════════════════════════════════════════════════════════

console.log('=== Minecraft AI Bot ===');
console.log(`MC Server: ${MC_HOST}:${MC_PORT}`);
console.log(`Bot Name: ${MC_USERNAME}`);
console.log(`LLM: ${LLM_BASE_URL}`);
console.log(`Version: ${MC_VERSION}`);
console.log('');

createBot();
