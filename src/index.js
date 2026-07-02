// ══════════════════════════════════════════════════════════════════════════════
// Minecraft AI Bot — LM Studio Powered Companion
// Rebuilt with improvements from Mindcraft, Voyager, MC Agents, MineAI research
// ══════════════════════════════════════════════════════════════════════════════

// ── Crash protection: log errors instead of dying silently ──────────────────
process.on('uncaughtException', (err) => {
  console.error('[CRASH] Uncaught exception:', err.message);
  console.error(err.stack);
});
process.on('unhandledRejection', (reason) => {
  console.error('[CRASH] Unhandled rejection:', reason);
});

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
const { LivingBrain } = require('./livingbrain');
const { PersistentMemory } = require('./memory');

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
    active: true,
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
    active: true,
    update: async function (bot) {
      const enemy = bot.nearestEntity(e => e.type === 'hostile' && e.position.distanceTo(bot.entity.position) < 8);
      if (enemy) {
        try {
          const sword = bot.inventory.items().find(i =>
            i.name.includes('sword') || i.name.includes('axe')
          );
          if (sword) await bot.equip(sword, 'hand');
          await bot.attack(enemy);
        } catch (e) { /* attack failed */ }
      }
    }
  },
  {
    name: 'unstuck',
    description: 'Detect when bot is stuck and try to move.',
    interrupts: ['all'],
    on: true,
    active: true,
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
    active: true,
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
    name: 'sleep',
    description: 'Sleep in a bed at night. No LLM needed.',
    interrupts: ['all'],
    on: true,
    active: true,
    sleeping: false,
    lastCheck: 0,
    update: async function (bot) {
      if (!bot.entity || !bot.entity.position) return;
      const now = Date.now();
      if (now - this.lastCheck < 5000) return; // check every 5s
      this.lastCheck = now;

      const timeOfDay = bot.time.timeOfDay;
      const isNight = timeOfDay >= 12500 && timeOfDay <= 23000;

      // Already sleeping — stay in bed until morning
      if (this.sleeping) {
        if (!isNight) {
          // Morning! Wake up
          try { bot.wake(); } catch (e) {}
          this.sleeping = false;
          console.log('[Sleep] Woke up — morning!');
        }
        return;
      }

      // Not night? Don't sleep
      if (!isNight) return;

      // Check if there's a hostile mob nearby — don't sleep with danger
      const enemy = bot.nearestEntity(e => e.type === 'hostile' && e.position.distanceTo(bot.entity.position) < 16);
      if (enemy) return;

      // Find a bed placed in the world
      const bedBlock = bot.findBlock({
        matching: (b) => b.name.includes('_bed') && !b.name.includes('_head'),
        maxDistance: 32,
        count: 1,
      });

      if (bedBlock) {
        try {
          // Walk to bed
          bot.pathfinder.setGoal(new pf.goals.GoalNear(bedBlock.position.x, bedBlock.position.y, bedBlock.position.z, 2));
          await new Promise(r => {
            let waited = 0;
            const check = setInterval(() => {
              const d = bot.entity.position.distanceTo(bedBlock.position);
              if (d <= 3 || waited >= 10) { clearInterval(check); r(); }
              waited += 0.5;
            }, 500);
          });

          // Look at and click the bed
          await bot.lookAt(bedBlock.position.offset(0, 1, 0));
          await new Promise(r => setTimeout(r, 300));
          bot.activateBlock(bedBlock);
          this.sleeping = true;
          this.active = true;
          console.log(`[Sleep] Going to sleep in ${bedBlock.name} at (${bedBlock.position.x}, ${bedBlock.position.y}, ${bedBlock.position.z})`);
        } catch (e) {
          console.log('[Sleep] Failed to sleep:', e.message);
        }
        return;
      }

      // No bed found — try to craft one
      const wool = bot.inventory.items().find(i => i.name.includes('_wool'));
      const planks = bot.inventory.items().find(i => i.name.includes('_planks'));
      if (wool && planks && wool.count >= 3 && planks.count >= 3) {
        console.log('[Sleep] No bed found — crafting one from inventory');
        try {
          // Place crafting table if needed
          const ct = bot.inventory.items().find(i => i.name === 'crafting_table');
          const nearCT = bot.findBlock({ matching: b => b.name === 'crafting_table', maxDistance: 4, count: 1 });
          if (ct && !nearCT) {
            const pos = bot.entity.position.offset(
              -Math.round(Math.sin(bot.entity.yaw)),
              0,
              -Math.round(Math.cos(bot.entity.yaw))
            );
            await bot.equip(ct, 'hand');
            const ref = bot.blockAt(pos);
            if (ref) await bot.placeBlock(ref, new Vec3(0, 1, 0));
            await new Promise(r => setTimeout(r, 500));
          }

          // Craft bed
          const bedName = wool.name.replace('_wool', '_bed');
          const recipe = RECIPES[bedName] || RECIPES['white_bed'];
          if (recipe) {
            // Place crafting table
            const craftTable = bot.findBlock({ matching: b => b.name === 'crafting_table', maxDistance: 4, count: 1 });
            if (craftTable) {
              bot.pathfinder.setGoal(new pf.goals.GoalNear(craftTable.position.x, craftTable.position.y, craftTable.position.z, 2));
              await new Promise(r => setTimeout(r, 3000));
              await bot.lookAt(craftTable.position.offset(0, 1, 0));
              await new Promise(r => setTimeout(r, 300));
            }

            // Craft using recipe book
            await bot.creative?.craft(recipe, 1);
            // Fallback: craft from recipe
            await bot.waitForTicks(20);

            const crafted = bot.inventory.items().find(i => i.name.includes('_bed'));
            if (crafted) {
              // Place the bed
              const yaw = bot.entity.yaw;
              const placePos = bot.entity.position.offset(
                -Math.round(Math.sin(yaw)) * 2,
                0,
                -Math.round(Math.cos(yaw)) * 2
              );
              const placeBlock = bot.blockAt(placePos);
              if (placeBlock && placeBlock.name === 'air') {
                await bot.equip(crafted, 'hand');
                await bot.placeBlock(placeBlock, new Vec3(0, 1, 0));
                console.log(`[Sleep] Placed ${crafted.name} — now sleeping!`);
                await new Promise(r => setTimeout(r, 1000));
                // Click the placed bed
                const placedBed = bot.findBlock({
                  matching: b => b.name.includes('_bed') && !b.name.includes('_head'),
                  maxDistance: 4, count: 1
                });
                if (placedBed) {
                  bot.activateBlock(placedBed);
                  this.sleeping = true;
                  this.active = true;
                  console.log('[Sleep] Going to sleep in crafted bed!');
                }
              }
            }
          }
        } catch (e) {
          console.log('[Sleep] Failed to craft bed:', e.message);
        }
      }
    }
  },
  {
    name: 'item_collecting',
    description: 'Pick up nearby items when idle.',
    interrupts: [],
    on: true,
    active: true,
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
    active: true,
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
  },
  {
    name: 'follow_player',
    description: 'Continuously follow a target player. Triggered by "follow" chat. Stops on "stop".',
    interrupts: ['all'],
    on: true,
    active: true,
    target: null,
    update: async function (bot) {
      if (!this.target || !bot.entity) return;
      const player = bot.players[this.target];
      if (!player || !player.entity) return;

      const targetPos = player.entity.position;
      const myPos = bot.entity.position;
      const dist = myPos.distanceTo(targetPos);

      if (dist > 3) {
        // Face the player and walk toward them
        bot.lookAt(targetPos.offset(0, player.entity.height || 1, 0));
        bot.setControlState('forward', true);
        bot.setControlState('sprint', dist > 8); // sprint if far
        // Jump over obstacles
        const ahead = bot.blockAt(myPos.offset(
          -Math.round(Math.sin(bot.entity.yaw)),
          -1,
          -Math.round(Math.cos(bot.entity.yaw))
        ));
        if (ahead && ahead.name !== 'air' && ahead.name !== 'water') {
          bot.setControlState('jump', true);
          setTimeout(() => bot.setControlState('jump', false), 300);
        }
      } else {
        // Close enough — stop moving but keep looking at them
        bot.setControlState('forward', false);
        bot.setControlState('sprint', false);
        bot.lookAt(targetPos.offset(0, player.entity.height || 1, 0));
      }
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

// ══════════════════════════════════════════════════════════════════════════════
// TOOL NAME ALIASES — LLM sometimes invents names, map them to real tools
// ══════════════════════════════════════════════════════════════════════════════

const TOOL_ALIASES = {
  place_block: 'place',
  put_block: 'place',
  set_block: 'place',
  dig_block: 'dig',
  mine_block: 'mine',
  cut_tree: 'chop',
  chop_tree: 'chop',
  follow_player: 'follow',
  stop_follow: 'stop',
  unfollow: 'stop',
  eat_food: 'eat',
  use_bed: 'use_block',
  open_chest: 'use_block',
  drop_item: 'drop',
  throw_item: 'drop',
  goto_location: 'goto',
  walk_to: 'goto',
  move_to: 'goto',
  craft_item: 'craft',
  make_item: 'craft',
  build_pillar: 'pillar_up',
  nerd_pole: 'pillar_up',
};

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
    const normalized = TOOL_ALIASES[toolName] || toolName;
    return { text: textBefore, tool: { name: normalized, args } };
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
- mine(block:"name", count:number) — find and mine blocks nearby
- chop(count:number) — chop nearest tree for wood
- dig(direction:"down"|"up"|"forward", count:number) — dig in a direction
- place(block:"name", x:number, y:number, z:number) — place a block FROM YOUR INVENTORY at coordinates (NOTE: tool name is "place" not "place_block")
- equip(item:"name") — equip item to hand
- unequip() — unequip held item
- eat() — eat food in inventory
- craft(item:"name", count:number) — craft an item (auto-places crafting table if needed)
- attack(target:"name") — attack a nearby entity
- hunt(animal:"sheep"|"cow"|"pig"|"chicken"|"rabbit") — kill a specific animal for resources (auto-equips weapon, walks to it, kills it)
- shear(animal:"sheep") — use shears on a sheep to get wool without killing it
- drop(item:"name", count:number) — drop items from inventory onto the ground. USE THIS when player asks you to drop/give/toss something.
- look(yaw:number, pitch:number) — look in a direction
- interact(entity:"name") — right-click an entity (trade, open chest, etc.)
- use_block(block:"name") — right-click a nearby block (sleep in bed, open chest, use furnace, etc.)
- set_goal(goal:"any string") — set a goal (advancement ID like "story/diamonds" or free-form like "build a house")
- cancel_goal() — cancel current goal
- pillar_up(count:number) — build a nerd pole beneath you
- stop() — stop all movement
- idle() — do nothing, just chat

ANIMAL DROPS:
- sheep: wool (or shear for colored wool without killing), raw_mutton
- cow: raw_beef, leather
- pig: raw_porkchop
- chicken: raw_chicken, feather
- rabbit: raw_rabbit, rabbit_foot, rabbit_hide

BED RECIPE: 3 wool + 3 planks → bed. Wool comes from sheep (kill or shear).

⚠ TOOL SELECTION RULES:
- If player says "drop X" → use drop(item:"X")
- If player says "give me X" → use drop(item:"X")
- If player says "use X" → use use_block(block:"X") or equip(item:"X")
- If player says "go to X" → use goto(x,y,z)
- If player says "mine X" → use mine(block:"X")
- If player says "chop" → use chop()
- If player says "craft X" → use craft(item:"X")
- If player says "place X" → use place(block:"X", x, y, z) — tool name is "place" NOT "place_block"
- DO NOT just chat about doing something. USE THE TOOL.

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

  // Nearby entities — separate hostile and passive, show Y difference
  const HOSTILE_NAMES = new Set(['zombie','skeleton','spider','creeper','witch','enderman','phantom','drowned','cave_spider','blaze','ghast','magma_cube','slime','wither_skeleton','piglin_brute','hoglin','vex','evoker','pillager','vindicator','ravager','warden','breeze']);
  const entities = bot.entities;
  const allNearby = Object.values(entities)
    .filter(e => e !== bot.entity && e.position && e.position.distanceTo(pos) < 32);

  const hostile = allNearby
    .filter(e => e.type === 'hostile' || (e.name && HOSTILE_NAMES.has(e.name)))
    .slice(0, 6)
    .map(e => {
      const hDist = Math.round(Math.sqrt(
        (e.position.x - pos.x) ** 2 + (e.position.z - pos.z) ** 2
      ));
      const yDiff = Math.round(e.position.y - pos.y);
      const yLabel = yDiff > 2 ? `${yDiff}↑above` : yDiff < -2 ? `${Math.abs(yDiff)}↓below` : 'same level';
      return `${e.name}(${hDist}m, ${yLabel})`;
    });

  const passive = allNearby
    .filter(e => !HOSTILE_NAMES.has(e.name) && e.type !== 'hostile')
    .slice(0, 6)
    .map(e => {
      const hDist = Math.round(Math.sqrt(
        (e.position.x - pos.x) ** 2 + (e.position.z - pos.z) ** 2
      ));
      return `${e.name || 'unknown'}(${hDist}m)`;
    });

  const hostileStr = hostile.length ? `HOSTILE: ${hostile.join(', ')}` : 'HOSTILE: none nearby';
  const passiveStr = passive.length ? ` | PASSIVE: ${passive.join(', ')}` : '';
  const nearbyEntities = hostileStr + passiveStr;

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

⚠ CRITICAL RULES:
- NEVER claim to have items you don't have. CHECK YOUR INVENTORY BELOW before saying what you have.
- If inventory says "empty" or "none", you have NOTHING. Don't make things up.
- When the player asks you to do something, USE A TOOL to do it. Don't just chat about doing it.
- If you need to craft something, call craft(). If you need to mine, call mine(). Don't say "let me do X" — just do X.
- One tool per response. No explaining, just doing.

PERSONALITY: ${personality.mood} | Energy: ${personality.energy}/100 | Boredom: ${personality.boredom}/100
${getPersonalityFlavor(personality)}

CURRENT STATE:
- Position: (${Math.round(pos.x)}, ${Math.round(pos.y)}, ${Math.round(pos.z)})
- Health: ${Math.round(bot.health)}/20 | Food: ${Math.round(bot.food)}/20
- Dimension: ${bot.game.dimension}
- Time: ${bot.time.timeOfDay} (${bot.time.timeOfDay >= 12500 && bot.time.timeOfDay <= 23000 ? 'NIGHT' : 'DAY'})
- Sleeping: ${MODES.find(m => m.name === 'sleep')?.sleeping ? 'YES (do not interrupt)' : 'no'}
- Following: ${(() => { const f = MODES.find(m => m.name === 'follow_player'); return f?.active ? `YES — following ${f.target} (say "stop" to stop)` : 'no'; })()}
- Held: ${heldItem}

YOUR INVENTORY (${inventory.length} items total):
${invSummary}

NEARBY BLOCKS: ${topBlocks || 'none loaded'}
NEARBY ENTITIES: ${nearbyEntities}

INTERACTIVE BLOCKS (right-click to use): ${(() => {
  const INTERACTIVE = new Set([
    'white_bed','orange_bed','magenta_bed','light_blue_bed','yellow_bed','lime_bed','pink_bed','gray_bed','light_gray_bed','cyan_bed','purple_bed','blue_bed','brown_bed','green_bed','red_bed','black_bed',
    'chest','trapped_chest','ender_chest','barrel',
    'crafting_table','smithing_table','cartography_table','loom','stonecutter',
    'furnace','blast_furnace','smoker','brewing_stand','enchanting_table',
    'anvil','chipped_anvil','damaged_anvil',
    'oak_door','spruce_door','birch_door','jungle_door','acacia_door','dark_oak_door',
    'lever','stone_button','oak_button',
    'spawner','nether_portal','end_portal',
    'beacon','bell','campfire','hopper','dropper','dispenser',
  ]);
  const found = [];
  for (let dx = -8; dx <= 8; dx++) {
    for (let dy = -4; dy <= 4; dy++) {
      for (let dz = -8; dz <= 8; dz++) {
        const b = bot.blockAt(pos.offset(dx, dy, dz));
        if (b && INTERACTIVE.has(b.name)) {
          const dist = Math.round(Math.sqrt(dx*dx + dy*dy + dz*dz));
          found.push(`${b.name.replace(/_/g,' ')}(${dist}m)`);
        }
      }
    }
  }
  return found.length ? found.slice(0, 10).join(', ') : 'none';
})()}

TOOLS & ARMOR:
${toolStatus}
${miningWarnings}

CRAFTING TABLE: ${hasCraftingTable ? 'YES (in inventory)' : nearCraftingTable ? 'YES (nearby)' : 'NO — place one before crafting tools!'}
LOGS: ${logs.length ? logs.map(l => `${l.name}x${l.count}`).join(', ') : 'NONE'}
PLANKS: ${planks.length ? planks.map(p => `${p.name}x${p.count}`).join(', ') : 'NONE'}
STICKS: ${sticks.length ? `x${sticks.reduce((s, i) => s + i.count, 0)}` : 'NONE'}

SKILL LEVELS:
${skillManager.getSkillContextForLLM()}

${livingBrain ? livingBrain.getLivingContext() : '(Brain offline)'}

${persistentMemory ? persistentMemory.getMemoryContext() : '(Memory offline)'}

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
  livingBrain: null,
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
let livingBrain;
let persistentMemory;
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

  persistentMemory = new PersistentMemory();
  persistentMemory.load();

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

    // Create and start the living brain
    livingBrain = new LivingBrain(bot);
    if (memoryData.livingBrain) livingBrain.loadJSON(memoryData.livingBrain);
    livingBrain.start();
    livingBrain.onEvent('spawned');

    // Record spawn location in persistent memory
    if (persistentMemory) {
      persistentMemory.locations.remember(
        'spawn',
        bot.entity.position.x,
        bot.entity.position.y,
        bot.entity.position.z,
        bot.game.dimension,
        'Where I first appeared',
        'home'
      );
      persistentMemory.onDiscovery('Spawned into the world', 'world', 2);
      livingBrain.setMemory(persistentMemory);
    }

    bot.chat(`Hello! I'm ${MC_USERNAME}, your AI companion!`);

    // Start update loop for modes
    startModeLoop();

    // Start auto-prompt timer
    startAutoPromptLoop();

    // Start inner monologue loop
    startMonologueLoop();

    // Save periodically
    setInterval(() => {
      memoryData.personality = personality;
      memoryData.skills = skillManager.toJSON();
      memoryData.advancements = advTracker.toJSON();
      memoryData.livingBrain = livingBrain ? livingBrain.toJSON() : null;
      saveMemory();
      if (persistentMemory) {
        persistentMemory.tick();
        persistentMemory.save();
      }
    }, 30000);
  });

  // ── Chat handler ─────────────────────────────────────────────────────────
  bot.on('chat', async (username, message) => {
    if (username === MC_USERNAME) return;

    // Always log and track player chat
    console.log(`[Chat] ${username}: ${message}`);
    lastPlayerChat = Date.now();
    updatePersonality(personality, 'player_chat');

    // Feed to living brain
    if (livingBrain) livingBrain.onPlayerChat(username, message);

    // Feed to persistent memory
    if (persistentMemory) persistentMemory.onPlayerChat(username, message);

    // ── Hardcoded commands (no LLM needed) ──────────────────────────────
    const lowerMsg = message.toLowerCase().trim();

    // FOLLOW: "follow me", "follow", "come here", "come with me"
    if (lowerMsg.match(/\b(follow me|follow|come here|come with me|come on|let's go)\b/)) {
      const followMode = MODES.find(m => m.name === 'follow_player');
      followMode.target = username;
      followMode.active = true;
      bot.chat(`Following you, ${username}!`);
      console.log(`[Follow] Now following ${username}`);
      return; // skip LLM
    }

    // STOP: "stop", "unfollow", "stay", "wait here", "halt"
    if (lowerMsg.match(/\b(stop|unfollow|stay|wait here|halt|nevermind|nm)\b/)) {
      const followMode = MODES.find(m => m.name === 'follow_player');
      if (followMode.active) {
        followMode.active = false;
        followMode.target = null;
        bot.setControlState('forward', false);
        bot.setControlState('sprint', false);
        bot.setControlState('jump', false);
        bot.pathfinder.setGoal(null);
        bot.chat(`Stopped following.`);
        console.log('[Follow] Stopped following');
        return; // skip LLM
      }
    }

    // Skip if busy processing
    if (chatLock || botBusy) {
      console.log('[Chat] Bot busy, skipping message');
      return;
    }

    // Respond to ALL messages (not just mentions)
    // If they mention the bot, respond directly
    // Otherwise, respond to the most recent message if it seems directed at the bot
    const isMention = message.toLowerCase().includes(MC_USERNAME.toLowerCase()) || message.startsWith('@');

    let cleanMsg = message;
    if (isMention) {
      // Strip bot name from message
      cleanMsg = message.replace(new RegExp(MC_USERNAME, 'gi'), '').replace(/^@/, '').trim();
    }

    if (!cleanMsg) return;

    console.log(`[Chat] Processing: ${cleanMsg} (mentioned: ${isMention})`);

    await handlePlayerMessage(username, cleanMsg);
  });

  // ── Death handler ────────────────────────────────────────────────────────
  bot.on('death', () => {
    console.log('[Bot] Died!');
    logBehavior('died');
    if (livingBrain) livingBrain.onEvent('died');
    if (persistentMemory) persistentMemory.onDeath(null);
    botBusy = false;
    chatLock = false;
  });

  // ── Game event listeners for the living brain ────────────────────────────
  bot.on('entitySwing', (entity) => {
    if (entity.type === 'hostile' && livingBrain) {
      const dist = entity.position.distanceTo(bot.entity.position);
      if (dist < 16) livingBrain.onEvent('mob_nearby');
    }
  });

  bot.on('entityMoved', (entity) => {
    if (!livingBrain || !bot.entity) return;
    if (entity.type === 'hostile') {
      const dist = entity.position.distanceTo(bot.entity.position);
      if (entity.name === 'creeper' && dist < 8) {
        livingBrain.onEvent('creeper_nearby');
      } else if (dist < 12) {
        livingBrain.onEvent('mob_nearby');
      }
    }
    if (entity.type === 'player') {
      const dist = entity.position.distanceTo(bot.entity.position);
      if (dist < 16) livingBrain.onEvent('nearby_player');
    }
  });

  bot.on('rain', () => {
    if (livingBrain) livingBrain.onEvent('raining');
  });

  bot.on('timeUpdate', () => {
    // Time events are handled by the sensory stream
  });

  // ── Error handler ────────────────────────────────────────────────────────
  bot.on('error', (err) => {
    console.error('[Bot] Error:', err.message);
  });

  bot.on('kicked', (reason) => {
    console.log('[Bot] Kicked:', reason);
    logBehavior('kicked from server');
    botBusy = false;
    chatLock = false;
    setTimeout(() => {
      console.log('[Bot] Reconnecting in 5s...');
      createBot();
    }, 5000);
  });

  bot.on('end', (reason) => {
    console.log('[Bot] Disconnected:', reason || 'unknown reason');
    logBehavior('disconnected');
    botBusy = false;
    chatLock = false;
    setTimeout(() => {
      console.log('[Bot] Reconnecting in 5s...');
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
      if (!mode.on || !mode.active) continue; // skip disabled modes
      if (mode.busy) continue; // skip if already mid-execution
      const shouldInterrupt = mode.interrupts.includes('all') || mode.interrupts.length === 0;
      if (botBusy && !shouldInterrupt) continue;
      try {
        mode.busy = true;
        await mode.update(bot);
      } catch (e) { /* mode error, skip */ }
      mode.busy = false;
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
// INNER MONOLOGUE — Bot reflects and thinks during idle periods
// ══════════════════════════════════════════════════════════════════════════════

let lastMonologue = 0;

function startMonologueLoop() {
  setInterval(async () => {
    if (!bot || !bot.entity || !livingBrain) return;
    if (botBusy || chatLock) return;

    const now = Date.now();
    // Every 60-90 seconds, have a thought
    if (now - lastMonologue < 60000) return;
    if (Math.random() > 0.4) return; // 40% chance

    lastMonologue = now;

    try {
      const monologuePrompt = livingBrain.getMonologuePrompt();
      const response = await callLLM(monologuePrompt);
      const parsed = parseLLMResponse(response);
      if (parsed.text && parsed.text.length > 3) {
        console.log(`[Monologue] ${parsed.text}`);
        // Don't always say it out loud — sometimes just think it
        if (Math.random() < 0.5) {
          bot.chat(`*${parsed.text}*`);
        }
        livingBrain.journal.record('thought', parsed.text, livingBrain.emotional.dominant);
      }
    } catch (e) {
      console.error('[Monologue] Error:', e.message);
    }
  }, 15000); // Check every 15s, actual trigger is 60-90s
}

// ══════════════════════════════════════════════════════════════════════════════
// PLAYER MESSAGE HANDLER — Routes to LLM
// ══════════════════════════════════════════════════════════════════════════════

async function handlePlayerMessage(username, message) {
  if (chatLock) {
    console.log('[Handler] Chat lock active, skipping');
    return;
  }
  chatLock = true;
  botBusy = true;

  console.log(`[Handler] Processing message from ${username}: "${message}"`);

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

    // Debug: log inventory being sent to LLM
    const invItems = bot.inventory.items();
    console.log(`[Handler] Inventory: ${invItems.length === 0 ? 'EMPTY' : invItems.map(i => `${i.name}x${i.count}`).join(', ')}`);
    console.log(`[Handler] Logs: ${invItems.filter(i => i.name.includes('_log')).length > 0 ? invItems.filter(i => i.name.includes('_log')).map(i => `${i.name}x${i.count}`).join(', ') : 'NONE'}`);
    console.log(`[Handler] Crafting table: ${invItems.some(i => i.name === 'crafting_table') ? 'YES' : 'NO'}`);

    const response = await callLLM(fullPrompt);
    const parsed = parseLLMResponse(response);

    if (parsed.tool) {
      console.log(`[LLM] Tool: ${parsed.tool.name}(${JSON.stringify(parsed.tool.args)})`);
      logBehavior(`calling ${parsed.tool.name}`);
      const toolResult = await executeTool(parsed.tool.name, parsed.tool.args, username);

      // Feed to living brain
      if (livingBrain) livingBrain.onToolUse(parsed.tool.name, toolResult);

      // Feed to persistent memory
      if (persistentMemory) persistentMemory.onToolUse(parsed.tool.name, toolResult, true);

      // Skip follow-up for chat/stop/idle — they already said what they wanted
      const noFollowUp = ['chat', 'stop', 'idle'];
      if (!noFollowUp.includes(parsed.tool.name)) {
        // Send tool result back to LLM for a natural follow-up response
        const followUpPrompt = `You just performed this action for player ${username}:\nTool: ${parsed.tool.name}(${JSON.stringify(parsed.tool.args)})\nResult: ${toolResult}\n\nNow respond to the player with a short message about what you did or what happened. Keep it under 100 chars. Just the message, no tool calls.`;
        try {
          const followUp = await callLLM(followUpPrompt);
          const followUpParsed = parseLLMResponse(followUp);
          const reply = followUpParsed.text || followUp || 'Done!';
          bot.chat(reply.substring(0, 200));
          logBehavior(`said: ${reply}`);
        } catch (e) {
          console.error('[LLM] Follow-up error:', e.message);
          // Fallback: send a generic response based on the tool
          const fallbacks = {
            goto: 'On my way!',
            follow: 'Following!',
            mine: 'Mining done!',
            chop: 'Chopping done!',
            craft: 'Crafting done!',
            attack: 'Attacked!',
            hunt: 'Hunt complete!',
            shear: 'Sheared!',
            eat: 'Ate some food!',
            equip: 'Equipped!',
            drop: 'Dropped items!',
            pillar_up: 'Pillared up!',
          };
          bot.chat(fallbacks[parsed.tool.name] || 'Done!');
        }
      }
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
  console.log(`[LLM] Calling: ${url}`);

  const body = {
    model: 'local-model',
    messages: [
      { role: 'system', content: 'You are a Minecraft bot. Call exactly one tool per response. No explanations.' },
      { role: 'user', content: userMessage },
    ],
    temperature: 0.7,
    max_tokens: 512,
  };
  // model: "local-model" tells LM Studio to use whatever model is currently loaded

  return new Promise((resolve, reject) => {
    const req = http.request(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      timeout: 30000,
    }, (res) => {
      console.log(`[LLM] Response status: ${res.statusCode}`);
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          const json = JSON.parse(data);
          if (json.choices && json.choices[0]) {
            const content = json.choices[0].message?.content || '';
            console.log(`[LLM] Got response (${content.length} chars): ${content.substring(0, 100)}...`);
            resolve(content);
          } else {
            console.error('[LLM] Response has no choices:', data.substring(0, 200));
            reject(new Error('No choices in LLM response'));
          }
        } catch (e) {
          console.error('[LLM] Failed to parse response:', data.substring(0, 200));
          reject(new Error(`Failed to parse LLM response: ${e.message}`));
        }
      });
    });

    req.on('error', (err) => {
      console.error('[LLM] Request error:', err.message);
      reject(err);
    });
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
  let result = 'Tool executed';

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
        result = `Said: ${msg}`;
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
        result = `Walking to ${x},${y},${z}`;
        break;
      }

      case 'follow': {
        const targetName = args.player || args.name;
        const player = bot.players[targetName];
        if (player && player.entity) {
          bot.pathfinder.setGoal(new pf.goals.GoalFollow(player.entity, 3));
          logBehavior(`following ${targetName}`);
          result = `Following ${targetName}`;
        } else {
          result = `Can't see ${targetName}`;
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
          result = `Need ${neededTier} pickaxe to mine ${blockName}`;
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
              result = `No ${blockName} found nearby`;
              break;
            }
            try {
              bot.pathfinder.setGoal(new pf.goals.GoalNear(block.position.x, block.position.y, block.position.z, 2));
              await new Promise(r => setTimeout(r, 3000));
              await bot.dig(block);
              skillManager.addXP('mining', 10, 'mine');
              skillManager.recordSuccess('mining', 'mine', `Mined ${blockName}`);
            } catch (e) {
              skillManager.recordFailure('mining', 'mine', e.message, 'Try another block');
            }
          }
        });
        logBehavior(`mined ${count}x ${blockName}`);
        result = `Mined ${count}x ${blockName}`;
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
              result = 'No trees nearby';
              break;
            }
            try {
              bot.pathfinder.setGoal(new pf.goals.GoalNear(log.position.x, log.position.y, log.position.z, 2));
              await new Promise(r => setTimeout(r, 3000));
              await bot.dig(log);
              skillManager.addXP('woodcutting', 10, 'chop');
              skillManager.recordSuccess('woodcutting', 'chop', 'Chopped log');
            } catch (e) {
              skillManager.recordFailure('woodcutting', 'chop', e.message, 'Try another tree');
            }
          }
        });
        logBehavior(`chopped ${count} logs`);
        result = `Chopped ${count} logs`;
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
          result = `Dug ${dir}`;
        } else {
          result = `Nothing to dig ${dir}`;
        }
        break;
      }

      case 'place': {
        const blockName = args.block;
        const x = parseFloat(args.x);
        const y = parseFloat(args.y);
        const z = parseFloat(args.z);
        if (!blockName || isNaN(x) || isNaN(y) || isNaN(z)) { result = 'Invalid place args'; break; }

        const item = bot.inventory.items().find(i => i.name === blockName);
        if (!item) {
          result = `No ${blockName} in inventory`;
          break;
        }
        await bot.equip(item, 'hand');
        const refBlock = bot.blockAt(new Vec3(x, y, z));
        if (refBlock) {
          await bot.placeBlock(refBlock, new Vec3(0, 1, 0));
          logBehavior(`placed ${blockName} at ${x},${y},${z}`);
          result = `Placed ${blockName} at ${x},${y},${z}`;
        } else {
          result = 'Invalid placement location';
        }
        break;
      }

      case 'equip': {
        const itemName = args.item || args.name;
        if (!itemName) { result = 'No item specified'; break; }
        const item = bot.inventory.items().find(i => i.name.includes(itemName));
        if (item) {
          await bot.equip(item, 'hand');
          logBehavior(`equipped ${item.name}`);
          result = `Equipped ${item.name}`;
        } else {
          result = `No ${itemName} in inventory`;
        }
        break;
      }

      case 'unequip': {
        logBehavior('unequipped');
        result = 'Unequipped';
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
          result = `Ate ${food.name}`;
        } else {
          result = 'No food to eat';
        }
        break;
      }

      case 'craft': {
        const itemName = args.item || args.name;
        const count = parseInt(args.count) || 1;
        if (!itemName) { result = 'No item specified'; break; }

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
          result = `Don't know how to craft ${itemName}`;
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
            result = 'No crafting table nearby and none in inventory';
            break;
          }
        }

        // Attempt crafting (simplified — activates crafting table or hand)
        const craftingItem = bot.inventory.items().find(i => i.name.includes('_planks') || i.name === 'iron_ingot' || i.name === 'diamond');
        if (craftingItem) {
          await bot.equip(craftingItem, 'hand');
          bot.activateItem();
          await new Promise(r => setTimeout(r, 500));
          logBehavior(`crafted ${craftItem}`);
          result = `Crafting ${craftItem}`;
        } else {
          result = `No materials to craft ${craftItem}`;
        }
        break;
      }

      case 'attack': {
        const targetName = args.target || args.name;
        if (!targetName) { result = 'No target specified'; break; }
        const entity = bot.nearestEntity(e =>
          (e.name && e.name.toLowerCase().includes(targetName.toLowerCase())) ||
          (e.username && e.username.toLowerCase().includes(targetName.toLowerCase()))
        );
        if (entity) {
          const sword = bot.inventory.items().find(i => i.name.includes('sword'));
          if (sword) await bot.equip(sword, 'hand');
          await bot.attack(entity);
          skillManager.addXP('combat', 10, 'attack');
          skillManager.recordSuccess('combat', 'attack', `Attacked ${entity.name || targetName}`);
          logBehavior(`attacked ${entity.name || targetName}`);
          result = `Attacked ${entity.name || targetName}`;
        } else {
          result = `No ${targetName} found nearby`;
        }
        break;
      }

      case 'hunt': {
        const animalName = (args.animal || args.target || '').toLowerCase();
        if (!animalName) { result = 'No animal specified (sheep, cow, pig, chicken, rabbit)'; break; }

        // Find nearest animal of that type
        const animal = bot.nearestEntity(e =>
          e.type === 'animal' && e.name && e.name.toLowerCase() === animalName
        );

        if (!animal) {
          result = `No ${animalName} found nearby`;
          break;
        }

        // Auto-equip best weapon
        const weapon = bot.inventory.items().find(i =>
          i.name.includes('sword') || i.name.includes('axe')
        );
        if (weapon) await bot.equip(weapon, 'hand');

        try {
          // Walk to the animal
          bot.pathfinder.setGoal(new pf.goals.GoalNear(animal.position.x, animal.position.y, animal.position.z, 2));
          await new Promise(r => setTimeout(r, 3000));

          // Kill it
          await bot.attack(animal);
          await new Promise(r => setTimeout(r, 500));
          await bot.attack(animal);

          skillManager.addXP('combat', 15, 'hunt');
          skillManager.recordSuccess('combat', 'hunt', `Hunted ${animalName}`);
          logBehavior(`hunted ${animalName}`);

          // Report what it dropped
          const ANIMAL_DROPS_REPORT = {
            sheep: 'wool and raw_mutton',
            cow: 'raw_beef and leather',
            pig: 'raw_porkchop',
            chicken: 'raw_chicken and feather',
            rabbit: 'raw_rabbit and rabbit_foot',
          };
          result = `Killed ${animalName}, dropped: ${ANIMAL_DROPS_REPORT[animalName] || 'items'}`;
        } catch (e) {
          result = `Failed to hunt ${animalName}: ${e.message}`;
        }
        break;
      }

      case 'shear': {
        const shearTarget = (args.animal || args.target || 'sheep').toLowerCase();
        if (shearTarget !== 'sheep') { result = 'Can only shear sheep'; break; }

        // Find nearest sheep
        const sheep = bot.nearestEntity(e =>
          e.type === 'animal' && e.name === 'sheep'
        );

        if (!sheep) {
          result = 'No sheep found nearby';
          break;
        }

        // Check for shears
        const shears = bot.inventory.items().find(i => i.name === 'shears');
        if (!shears) {
          result = 'No shears in inventory (need 2 iron ingots)';
          break;
        }

        try {
          await bot.equip(shears, 'hand');
          // Walk to the sheep
          bot.pathfinder.setGoal(new pf.goals.GoalNear(sheep.position.x, sheep.position.y, sheep.position.z, 2));
          await new Promise(r => setTimeout(r, 3000));

          // Shear it
          await bot.attack(sheep);

          // Detect sheep color for reporting
          let woolColor = 'white';
          try {
            const colors = ['white', 'orange', 'magenta', 'light_blue', 'yellow', 'lime', 'pink', 'gray', 'light_gray', 'cyan', 'purple', 'blue', 'brown', 'green', 'red', 'black'];
            if (sheep.metadata && sheep.metadata[12] !== undefined) {
              woolColor = colors[sheep.metadata[12]] || 'white';
            }
          } catch (e) {}

          skillManager.addXP('woodcutting', 5, 'shear');
          skillManager.recordSuccess('woodcutting', 'shear', `Sheared sheep for ${woolColor} wool`);
          logBehavior(`sheared sheep for ${woolColor} wool`);
          result = `Sheared sheep, got ${woolColor} wool (sheep still alive)`;
        } catch (e) {
          result = `Failed to shear sheep: ${e.message}`;
        }
        break;
      }

      case 'drop': {
        const itemName = args.item || args.name;
        const count = parseInt(args.count) || 1;
        if (!itemName) { result = 'No item specified'; break; }
        const item = bot.inventory.items().find(i => i.name.includes(itemName));
        if (item) {
          await bot.tossStack(item);
          logBehavior(`dropped ${item.name}`);
          result = `Dropped ${item.name}`;
        } else {
          result = `No ${itemName} in inventory`;
        }
        break;
      }

      case 'look': {
        const yaw = parseFloat(args.yaw) || 0;
        const pitch = parseFloat(args.pitch) || 0;
        bot.look(yaw, pitch);
        logBehavior('looked around');
        result = 'Looking around';
        break;
      }

      case 'interact': {
        const entityName = args.entity || args.name;
        if (!entityName) { result = 'No entity specified'; break; }
        const entity = bot.nearestEntity(e =>
          e.name && e.name.toLowerCase().includes(entityName.toLowerCase())
        );
        if (entity) {
          await bot.lookAt(entity.position.offset(0, entity.height || 1, 0));
          bot.activateEntity(entity);
          logBehavior(`interacted with ${entity.name}`);
          result = `Interacted with ${entity.name}`;
        } else {
          result = `No ${entityName} found nearby`;
        }
        break;
      }

      case 'use_block': {
        const blockName = (args.block || args.name || '').replace(/ /g, '_').toLowerCase();
        if (!blockName) { result = 'No block specified (bed, chest, furnace, etc.)'; break; }

        // Find nearest matching block
        const targetBlock = bot.findBlock({
          matching: (b) => b.name.includes(blockName),
          maxDistance: 8,
          count: 1,
        });

        if (!targetBlock) {
          result = `No ${blockName.replace(/_/g, ' ')} found nearby`;
          break;
        }

        try {
          // Walk to the block — wait until actually close
          const dist = bot.entity.position.distanceTo(targetBlock.position);
          if (dist > 3) {
            bot.pathfinder.setGoal(new pf.goals.GoalNear(targetBlock.position.x, targetBlock.position.y, targetBlock.position.z, 2));
            // Wait up to 8 seconds for bot to arrive
            await new Promise(r => {
              let waited = 0;
              const check = setInterval(() => {
                const d = bot.entity.position.distanceTo(targetBlock.position);
                if (d <= 3 || waited >= 8) {
                  clearInterval(check);
                  r();
                }
                waited += 0.5;
              }, 500);
            });
          }

          // Look at and right-click the block
          await bot.lookAt(targetBlock.position.offset(0, 1, 0));
          await new Promise(r => setTimeout(r, 300)); // brief pause to settle
          bot.activateBlock(targetBlock);
          logBehavior(`used ${targetBlock.name}`);
          result = `Used ${targetBlock.name.replace(/_/g, ' ')} at (${targetBlock.position.x}, ${targetBlock.position.y}, ${targetBlock.position.z})`;
        } catch (e) {
          result = `Failed to use ${blockName.replace(/_/g, ' ')}: ${e.message}`;
        }
        break;
      }

      case 'set_goal': {
        const goalText = args.goal || args.text || '';
        if (!goalText) { result = 'No goal specified'; break; }
        logBehavior(`set goal: ${goalText}`);
        result = `Goal set: ${goalText}`;
        await handleGoalSet(goalText);
        break;
      }

      case 'cancel_goal': {
        activeGoal.active = false;
        activeGoal.description = '';
        logBehavior('cancelled goal');
        result = 'Goal cancelled';
        break;
      }

      case 'pillar_up': {
        const count = parseInt(args.count) || 3;
        const block = bot.inventory.items().find(i =>
          i.name.includes('cobblestone') || i.name.includes('dirt') || i.name.includes('stone')
        );
        if (!block) {
          result = 'No blocks to pillar with';
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
        result = `Pillared up ${count} blocks`;
        break;
      }

      case 'stop': {
        bot.pathfinder.setGoal(null);
        bot.clearControlStates();
        logBehavior('stopped');
        result = 'Stopped';
        break;
      }

      case 'idle': {
        logBehavior('idling');
        result = 'Idling';
        break;
      }

      default:
        result = `Unknown tool: ${name}`;
    }
  } catch (e) {
    console.error(`[Tool] ${name} error:`, e.message);
    logBehavior(`${name} failed: ${e.message}`);
    result = `Error: ${e.message}`;
  }

  return result;
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
    sleeping: MODES.find(m => m.name === 'sleep')?.sleeping || false,
    following: (() => { const f = MODES.find(m => m.name === 'follow_player'); return f?.active ? f.target : null; })(),
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

app.get('/inventory', (req, res) => {
  if (!bot || !bot.entity) return res.json({ error: 'Bot not connected' });
  const items = bot.inventory.items();
  const held = bot.heldItem ? bot.heldItem.name : 'none';
  res.json({
    held,
    itemCount: items.length,
    emptySlots: bot.inventory.emptySlotCount(),
    items: items.map(i => ({ name: i.name, count: i.count, slot: i.slot })),
  });
});

app.get('/brain', (req, res) => {
  if (!livingBrain) return res.json({ error: 'Brain not active' });
  res.json({
    mood: livingBrain.emotional.dominant,
    moodValue: Math.round(livingBrain.emotional.mood[livingBrain.emotional.dominant] * 100),
    description: livingBrain.emotional.describe(),
    nearbyAnimals: livingBrain.sensory.nearbyAnimals.map(a => ({ name: a.name, dist: a.dist, drops: a.drops, color: a.color })),
    nearbyMobs: livingBrain.sensory.nearbyMobs.map(m => ({ name: m.name, dist: Math.round(m.dist) })),
    environment: livingBrain.sensory.environment,
  });
});

app.get('/memory', (req, res) => {
  if (!persistentMemory) return res.json({ error: 'Memory not active' });
  res.json({
    players: persistentMemory.relationships.players,
    locations: persistentMemory.locations.locations,
    discoveries: persistentMemory.discoveries.discoveries.slice(-10),
    recentEvents: persistentMemory.timeline.events.slice(-10),
    selfModel: persistentMemory.selfModel,
  });
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

// Verify dependencies
try {
  require('minecraft-data');
  console.log('[Init] minecraft-data loaded');
  require('mineflayer-pathfinder');
  console.log('[Init] mineflayer-pathfinder loaded');
} catch (e) {
  console.error('[Init] MISSING DEPENDENCY:', e.message);
  console.error('Run: npm install mineflayer mineflayer-pathfinder minecraft-data vec3 express');
  process.exit(1);
}

createBot();
