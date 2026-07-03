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
const CONFIG_FILE = path.join(__dirname, '..', 'config.json');
let config;
try {
  config = JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf8'));
} catch (e) {
  console.error('[Config] Failed to load config.json, using defaults');
  config = {};
}

const MC_HOST = process.env.MC_HOST || config.minecraft?.host || 'localhost';
const MC_PORT = parseInt(process.env.MC_PORT) || config.minecraft?.port || 25565;
const MC_USERNAME = process.env.MC_USERNAME || config.minecraft?.username || 'AIBot';
const MC_VERSION = process.env.MC_VERSION || config.minecraft?.version || '1.21';
const LLM_BASE_URL = process.env.LLM_BASE_URL || config.llm?.baseUrl || 'http://127.0.0.1:1234';
const LLM_API_ENDPOINT = config.llm?.apiEndpoint || '/api/v1/chat';
const LLM_MODEL = config.llm?.model || 'nvidia/nemotron-3-nano-4b';
const LLM_CONTEXT_LENGTH = config.llm?.contextLength || 4096;
const LLM_TEMPERATURE = config.llm?.temperature || 0.7;
const SERVER_PORT = parseInt(process.env.SERVER_PORT) || config.server?.port || 8080;
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
          if (bot.player?.sleeping) {
            try { bot.wake(); } catch (e) {}
          }
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
  },
  {
    name: 'tunnel',
    description: 'Dig a staircase down to target Y. Triggered by "tunnel to y=11" chat. No LLM needed.',
    interrupts: ['all'],
    on: true,
    active: false,
    targetY: null,
    startY: null,
    digging: false,
    lastStep: 0,
    update: async function (bot) {
      if (!this.active || this.targetY === null) return;
      if (!bot.entity || !bot.entity.position) return;

      const now = Date.now();
      if (now - this.lastStep < 2000) return; // 2s between steps
      this.lastStep = now;

      const currentY = Math.round(bot.entity.position.y);

      // Check if we reached the target
      if (currentY <= this.targetY + 1) {
        console.log(`[Tunnel] Reached target Y=${this.targetY}!`);
        bot.chat(`Done! Dug staircase to Y=${currentY}`);
        this.active = false;
        this.targetY = null;
        return;
      }

      // Check inventory
      const mainSlots = bot.inventory.slots.slice(9, 45);
      const emptySlots = mainSlots.filter(s => s === null).length;
      if (emptySlots <= 1) {
        console.log('[Tunnel] Inventory full, stopping');
        bot.chat('Inventory full! Stopping tunnel.');
        this.active = false;
        this.targetY = null;
        return;
      }

      // Equip best tool
      const pickaxe = bot.inventory.items().find(i => i.name.includes('pickaxe'));
      const shovel = bot.inventory.items().find(i => i.name.includes('shovel'));
      if (pickaxe) {
        try { await bot.equip(pickaxe, 'hand'); } catch (e) {}
      }

      // Get facing direction
      const yaw = bot.entity.yaw;
      const fwdX = -Math.round(Math.sin(yaw));
      const fwdZ = -Math.round(Math.cos(yaw));

      // Safety check: look ahead for lava
      const lookAheadPos = bot.entity.position.offset(fwdX * 3, -3, fwdZ * 3);
      const lookAheadBlock = bot.blockAt(lookAheadPos);
      if (lookAheadBlock && (lookAheadBlock.name === 'lava' || lookAheadBlock.name === 'void_air')) {
        console.log(`[Tunnel] Stopped — detected ${lookAheadBlock.name} ahead!`);
        bot.chat(`Stopped — detected ${lookAheadBlock.name} ahead!`);
        this.active = false;
        this.targetY = null;
        return;
      }

      try {
        // Dig 2 blocks forward (2 wide) at head height and foot height
        for (let w = 0; w < 2; w++) {
          const sideX = w === 0 ? 0 : (fwdZ !== 0 ? 1 : 0);
          const sideZ = w === 0 ? 0 : (fwdX !== 0 ? 1 : 0);

          for (let h = 0; h < 2; h++) {
            const digPos = bot.entity.position.offset(fwdX + sideX, h, fwdZ + sideZ);
            const block = bot.blockAt(digPos);
            if (block && block.name !== 'air') {
              if (block.name === 'lava' || block.name === 'water') {
                bot.chat(`Stopped — hit ${block.name}!`);
                this.active = false;
                this.targetY = null;
                return;
              }
              // Switch to shovel for dirt/sand/gravel
              if (shovel && (block.name.includes('dirt') || block.name.includes('sand') || block.name.includes('gravel'))) {
                try { await bot.equip(shovel, 'hand'); } catch (e) {}
              }
              await bot.dig(block);
              await new Promise(r => setTimeout(r, 500));
            }
          }
        }

        // Dig 2 blocks below (step down + headroom)
        for (let d = 1; d <= 2; d++) {
          const belowPos = bot.entity.position.offset(0, -d, 0);
          const belowBlock = bot.blockAt(belowPos);
          if (belowBlock && belowBlock.name !== 'air') {
            if (belowBlock.name === 'lava' || belowBlock.name === 'water') {
              bot.chat(`Stopped — hit ${belowBlock.name} below!`);
              this.active = false;
              this.targetY = null;
              return;
            }
            // Switch to shovel for dirt/sand/gravel
            if (shovel && (belowBlock.name.includes('dirt') || belowBlock.name.includes('sand') || belowBlock.name.includes('gravel'))) {
              try { await bot.equip(shovel, 'hand'); } catch (e) {}
            } else if (pickaxe) {
              try { await bot.equip(pickaxe, 'hand'); } catch (e) {}
            }
            await bot.dig(belowBlock);
            await new Promise(r => setTimeout(r, 500));
          }
        }

        // Move forward and drop down using pathfinder
        const nextStepPos = bot.entity.position.offset(fwdX, -1, fwdZ);
        bot.pathfinder.setGoal(new pf.goals.GoalNear(nextStepPos.x, nextStepPos.y, nextStepPos.z, 1));
        await new Promise((resolve) => {
          const check = setInterval(() => {
            const dist = bot.entity.position.distanceTo(nextStepPos);
            if (dist < 2 || !bot.pathfinder?.goal) {
              clearInterval(check);
              resolve();
            }
          }, 300);
          setTimeout(() => { clearInterval(check); resolve(); }, 4000);
        });

        console.log(`[Tunnel] Step: Y=${Math.round(bot.entity.position.y)} (target: ${this.targetY})`);
      } catch (e) {
        console.log(`[Tunnel] Error: ${e.message}`);
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
// ══════════════════════════════════════════════════════════════════════════════
// GOAL TREE — Hierarchical goal system (tree structure)
// ══════════════════════════════════════════════════════════════════════════════

let goalTree = null; // { id, text, status, children: [] }
let nextGoalId = 1;

function createNode(text, parentId = null) {
  const node = { id: nextGoalId++, text, status: 'pending', children: [] };
  return node;
}

function findNode(node, id) {
  if (!node) return null;
  if (node.id === id) return node;
  for (const child of node.children) {
    const found = findNode(child, id);
    if (found) return found;
  }
  return null;
}

function findParent(node, id) {
  if (!node) return null;
  for (const child of node.children) {
    if (child.id === id) return node;
    const found = findParent(child, id);
    if (found) return found;
  }
  return null;
}

// Find the first active leaf (depth-first) — this is what the LLM should work on
function findActiveLeaf(node) {
  if (!node) return null;
  if (node.status !== 'pending') return null;
  if (node.children.length === 0) return node;
  for (const child of node.children) {
    const leaf = findActiveLeaf(child);
    if (leaf) return leaf;
  }
  return null; // all children done, this node is effectively done
}

// Count nodes by status
function countNodes(node, status) {
  if (!node) return 0;
  let count = node.status === status ? 1 : 0;
  for (const child of node.children) {
    count += countNodes(child, status);
  }
  return count;
}

// Check if all children are done
function allChildrenDone(node) {
  if (!node) return true;
  return node.children.every(c => c.status === 'done' || c.status === 'failed');
}

// Auto-complete parent nodes when all children are done
function autoCompleteParents(node) {
  if (!node) return;
  for (const child of node.children) {
    autoCompleteParents(child);
  }
  if (node.children.length > 0 && allChildrenDone(node) && node.status === 'pending') {
    const anyFailed = node.children.some(c => c.status === 'failed');
    node.status = anyFailed ? 'failed' : 'done';
    console.log(`[Goal] Auto-completed: "${node.text}" → ${node.status}`);
  }
}

// Render the tree as indented text for the LLM
function renderGoalTree(node, indent = 0, isLast = true) {
  if (!node) return '';
  const prefix = indent === 0 ? '' : (isLast ? '└─ ' : '├─ ');
  const statusIcon = node.status === 'done' ? '✓' : node.status === 'failed' ? '✗' : '○';
  const activeLeaf = findActiveLeaf(goalTree);
  const isCurrent = activeLeaf && activeLeaf.id === node.id;
  const marker = isCurrent ? ' ◄ YOU ARE HERE' : '';
  let line = `${'  '.repeat(indent)}${prefix}${statusIcon} ${node.text}${marker}`;
  
  const lines = [line];
  for (let i = 0; i < node.children.length; i++) {
    lines.push(renderGoalTree(node.children[i], indent + 1, i === node.children.length - 1));
  }
  return lines.join('\n');
}

function getGoalSummary() {
  if (!goalTree) return 'No active goal. Use set_goal() to start one.';
  const pending = countNodes(goalTree, 'pending');
  const done = countNodes(goalTree, 'done');
  const failed = countNodes(goalTree, 'failed');
  const total = pending + done + failed;
  
  let summary = `GOAL: "${goalTree.text}" [${done}/${total} done`;
  if (failed > 0) summary += `, ${failed} failed`;
  summary += `]\n`;
  summary += renderGoalTree(goalTree);
  
  const leaf = findActiveLeaf(goalTree);
  if (leaf) {
    summary += `\n\nCURRENT TASK: "${leaf.text}" (id: ${leaf.id})`;
    summary += `\nDo this step, then call complete_step(id:${leaf.id}).`;
  } else if (pending === 0) {
    summary += `\n\nAll steps completed!`;
  }
  
  return summary;
}

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
  // Old task/goal aliases → new goal tree
  add_task: 'add_step',
  add_todo: 'add_step',
  create_task: 'add_step',
  new_task: 'add_step',
  complete_task: 'complete_step',
  mark_done: 'complete_step',
  finish_task: 'complete_step',
  done: 'complete_step',
  get_tasks: 'get_goal',
  list_tasks: 'get_goal',
  show_tasks: 'get_goal',
  tasks: 'get_goal',
  set_goal: 'set_goal',
  cancel_goal: 'cancel_goal',
};

function parseLLMResponse(raw) {
  if (!raw || typeof raw !== 'string') return { text: '', tool: null };

  // Strip control tokens
  let cleaned = raw
    .replace(/<think>[\s\S]*?<\/think>/gi, '')
    .replace(/<reasoning>[\s\S]*?<\/reasoning>/gi, '')
    .replace(/<tool_call>\s*/gi, '')
    .replace(/<\/tool_call>\s*/gi, '')
    .replace(/<function>\s*/gi, '')
    .replace(/<\/function>\s*/gi, '')
    .replace(/<\|channel\|>commentary to=\w+\s*/gi, '')
    .trim();

  // ── FORMAT 1: XML <invoke name="tool"><arg name="key">val</arg></invoke> ──
  const invokeMatch = cleaned.match(/<invoke\s+name="(\w+)">([\s\S]*?)<\/invoke>/i);
  if (invokeMatch) {
    const toolName = TOOL_ALIASES[invokeMatch[1]] || invokeMatch[1];
    const args = {};
    const argMatches = invokeMatch[2].matchAll(/<arg\s+name="(\w+)">([\s\S]*?)<\/arg>/gi);
    for (const m of argMatches) {
      args[m[1]] = m[2].trim().replace(/^["']|["']$/g, '');
    }
    const textBefore = cleaned.substring(0, cleaned.indexOf('<invoke')).trim();
    return { text: textBefore, tool: { name: toolName, args } };
  }

  // ── FORMAT 2: XML self-closing <tool key="val" /> ────────────────────────
  const VALID_TOOLS = new Set(['chat', 'goto', 'mine', 'chop', 'dig', 'place', 'equip', 'unequip',
    'eat', 'craft', 'attack', 'hunt', 'shear', 'drop', 'look', 'interact', 'use_block',
    'set_goal', 'cancel_goal', 'add_step', 'complete_step', 'fail_step', 'get_goal',
    'pillar_up', 'stop', 'idle']);

  const selfCloseMatch = cleaned.match(/<(\w+)\s+([^>]*?)\/?>/i);
  if (selfCloseMatch) {
    const tag = selfCloseMatch[1];
    if (VALID_TOOLS.has(tag)) {
      const toolName = TOOL_ALIASES[tag] || tag;
      const args = {};
      const attrMatches = selfCloseMatch[2].matchAll(/(\w+)="([^"]*)"/g);
      for (const m of attrMatches) {
        args[m[1]] = m[2].trim();
      }
      const textBefore = cleaned.substring(0, cleaned.indexOf(`<${tag}`)).trim();
      return { text: textBefore, tool: { name: toolName, args } };
    }
  }

  // ── FORMAT 3: XML child elements <tool><key>val</key></tool> ──────────────
  const xmlChildMatch = cleaned.match(/<(\w+)>([\s\S]*?)<\/\1>/i);
  if (xmlChildMatch) {
    const tag = xmlChildMatch[1];
    if (VALID_TOOLS.has(tag)) {
      const toolName = TOOL_ALIASES[tag] || tag;
      const inner = xmlChildMatch[2];
      const args = {};
      const childMatches = inner.matchAll(/<(\w+)>([\s\S]*?)<\/\1>/g);
      let hasChildren = false;
      for (const m of childMatches) {
        args[m[1]] = m[2].trim().replace(/^["']|["']$/g, '');
        hasChildren = true;
      }
      if (!hasChildren && inner.trim()) {
        args[guessArgName(tag)] = inner.trim();
      }
      const textBefore = cleaned.substring(0, cleaned.indexOf(`<${tag}>`)).trim();
      return { text: textBefore, tool: { name: toolName, args } };
    }
  }

  // ── FORMAT 4: JSON object: {"tool": "name", "param": "val"} ─────────────
  try {
    const jsonMatch = cleaned.match(/\{[\s\S]*"tool"[\s\S]*\}/);
    if (jsonMatch) {
      const obj = JSON.parse(jsonMatch[0]);
      if (obj.tool) {
        const args = { ...obj };
        delete args.tool;
        const name = TOOL_ALIASES[obj.tool] || obj.tool;
        return { text: obj.text || '', tool: { name, args } };
      }
    }
  } catch (e) { /* not valid JSON */ }

  // ── FORMAT 5: tool_name(arg:val, arg:val) ────────────────────────────────
  const toolMatch = cleaned.match(/(\w+)\s*\(([^)]*)\)/);
  if (toolMatch) {
    let toolName = toolMatch[1];
    toolName = TOOL_ALIASES[toolName] || toolName;
    const argStr = toolMatch[2];
    const args = {};
    if (argStr) {
      const pairs = argStr.split(',').map(s => s.trim());
      for (const pair of pairs) {
        const [key, ...valParts] = pair.split(':');
        if (key && valParts.length) {
          let val = valParts.join(':').trim().replace(/^["']|["']$/g, '');
          args[key.trim()] = val;
        }
      }
    }
    const textBefore = cleaned.substring(0, cleaned.indexOf(toolMatch[0])).trim();
    return { text: textBefore, tool: { name: toolName, args } };
  }

  // ── FORMAT 6: function_call format: {"name": "func", "arguments": {...}} ─
  try {
    const fnMatch = cleaned.match(/\{[\s\S]*"name"[\s\S]*"arguments"[\s\S]*\}/);
    if (fnMatch) {
      const obj = JSON.parse(fnMatch[0]);
      if (obj.name) {
        const args = typeof obj.arguments === 'string' ? JSON.parse(obj.arguments) : (obj.arguments || {});
        const name = TOOL_ALIASES[obj.name] || obj.name;
        return { text: obj.text || '', tool: { name, args } };
      }
    }
  } catch (e) { /* not valid */ }

  // ── FORMAT 6b: {"tool_call": {"action": "name", ...}} ────────────────────
  try {
    const tcMatch = cleaned.match(/\{[\s\S]*"tool_call"[\s\S]*\}/);
    if (tcMatch) {
      const obj = JSON.parse(tcMatch[0]);
      if (obj.tool_call) {
        const tc = obj.tool_call;
        const rawName = tc.action || tc.tool || tc.name || '';
        const name = TOOL_ALIASES[rawName] || rawName;
        const args = { ...tc };
        delete args.action;
        delete args.tool;
        delete args.name;
        return { text: obj.text || '', tool: { name, args } };
      }
    }
  } catch (e) { /* not valid */ }

  // ── FORMAT 7: Simple "tool: value" ───────────────────────────────────────
  const simpleMatch = cleaned.match(/^(\w+):\s*(.+)/);
  if (simpleMatch && simpleMatch[1].length < 30) {
    const toolName = TOOL_ALIASES[simpleMatch[1]] || simpleMatch[1];
    if (VALID_TOOLS.has(toolName)) {
      return { text: '', tool: { name: toolName, args: { message: simpleMatch[2].trim() } } };
    }
  }

  // ── FORMAT 8: Bare tool name (just "chop" or "stop" with no args) ────────
  const bareMatch = cleaned.match(/^(\w+)$/m);
  if (bareMatch) {
    const toolName = TOOL_ALIASES[bareMatch[1]] || bareMatch[1];
    if (VALID_TOOLS.has(toolName)) {
      return { text: '', tool: { name: toolName, args: {} } };
    }
  }

  return { text: cleaned, tool: null };
}

// Guess which argument a single value should go in
function guessArgName(toolName) {
  const map = {
    chat: 'message', message: 'message',
    goto: 'x', mine: 'block', craft: 'item', drop: 'item',
    attack: 'target', hunt: 'animal', equip: 'item',
    use_block: 'block', place: 'block', dig: 'direction',
    set_goal: 'text', add_step: 'text', complete_step: 'id', fail_step: 'id',
  };
  return map[toolName] || 'value';
}

// Resolve partial item name to full inventory item name
// e.g. "planks" → "oak_planks", "pickaxe" → "wooden_pickaxe", "stone" → "stone" (if exact match)
function resolveItemName(name, bot) {
  if (!name || !bot) return name;
  const inv = bot.inventory.items();
  
  // Exact match first
  if (inv.find(i => i.name === name)) return name;
  
  // Partial match — find first item containing the search term
  const lower = name.toLowerCase();
  const match = inv.find(i => i.name.toLowerCase().includes(lower));
  if (match) return match.name;
  
  // No match — return original (will fail gracefully)
  return name;
}

// ══════════════════════════════════════════════════════════════════════════════
// INVENTORY HELPERS
// ══════════════════════════════════════════════════════════════════════════════

// Check if inventory is full (36 main slots)
function isInventoryFull(bot) {
  if (!bot || !bot.inventory) return false;
  const mainSlots = bot.inventory.slots.slice(9, 45); // slots 9-44 are main inventory
  const emptySlots = mainSlots.filter(s => s === null).length;
  return emptySlots <= 1; // 1 or fewer empty slots = basically full
}

// Count empty inventory slots
function emptySlotCount(bot) {
  if (!bot || !bot.inventory) return 0;
  const mainSlots = bot.inventory.slots.slice(9, 45);
  return mainSlots.filter(s => s === null).length;
}

// ══════════════════════════════════════════════════════════════════════════════
// HOME SYSTEM
// ══════════════════════════════════════════════════════════════════════════════

let homePosition = null; // { x, y, z }

function setHome(pos) {
  homePosition = { x: Math.round(pos.x), y: Math.round(pos.y), z: Math.round(pos.z) };
  console.log(`[Home] Set home to ${homePosition.x}, ${homePosition.y}, ${homePosition.z}`);
}

function getHome() {
  return homePosition;
}

// Get items already in a chest
function getChestContents(chestWindow) {
  const contents = {};
  for (const slot of chestWindow.slots) {
    if (slot) {
      contents[slot.name] = (contents[slot.name] || 0) + slot.count;
    }
  }
  return contents;
}

// Check if chest has room for more items
function chestHasRoom(chestWindow) {
  return chestWindow.slots.some(s => s === null);
}

// Deposit items into chest — only items that match what's already there
async function depositItems(bot, chestBlock) {
  const KEEP_ITEMS = new Set([
    'crafting_table', 'torch', 'oak_door', 'spruce_door', 'birch_door',
    'jungle_door', 'acacia_door', 'dark_oak_door',
  ]);

  // Find chest if not provided
  if (!chestBlock) {
    chestBlock = bot.findBlock({
      matching: (b) => b.name === 'chest' || b.name === 'trapped_chest',
      maxDistance: 16,
      count: 1,
    });
  }

  // No chest found — try to place one
  if (!chestBlock) {
    const chestItem = bot.inventory.items().find(i => i.name === 'chest');
    if (!chestItem) return 'No chest nearby and no chest in inventory to place';

    // Find a spot to place the chest (2 blocks in front of bot)
    const yaw = bot.entity.yaw;
    const placePos = bot.entity.position.offset(
      -Math.round(Math.sin(yaw)) * 2,
      0,
      -Math.round(Math.cos(yaw)) * 2
    );
    const placeBlock = bot.blockAt(placePos.offset(0, -1, 0));

    if (placeBlock && placeBlock.name !== 'air') {
      await bot.equip(chestItem, 'hand');
      await bot.placeBlock(placeBlock, new Vec3(0, 1, 0));
      chestBlock = bot.blockAt(placePos);
      await new Promise(r => setTimeout(r, 500));
    } else {
      return 'No solid block to place chest on';
    }
  }

  // Open chest
  const chestWindow = await bot.openChest(chestBlock);
  await new Promise(r => setTimeout(r, 500));

  // Get what's already in the chest
  const chestContents = getChestContents(chestWindow);
  const chestTypes = Object.keys(chestContents);

  let deposited = 0;
  const items = bot.inventory.items();

  for (const item of items) {
    // Skip tools, weapons, armor, and essentials
    if (item.name.includes('pickaxe') || item.name.includes('axe') ||
        item.name.includes('sword') || item.name.includes('shovel') ||
        item.name.includes('bow') || item.name.includes('crossbow') ||
        item.name.includes('shield') || item.name.includes('helmet') ||
        item.name.includes('chestplate') || item.name.includes('leggings') ||
        item.name.includes('boots') || item.name.includes('elytra') ||
        KEEP_ITEMS.has(item.name)) {
      continue;
    }

    // Only deposit items that match what's already in this chest
    if (chestTypes.length > 0 && !chestTypes.includes(item.name)) {
      continue;
    }

    // Check if chest has room
    if (!chestHasRoom(chestWindow)) {
      break;
    }

    try {
      await chestWindow.deposit(item.type, null, item.count);
      deposited += item.count;
      chestContents[item.name] = (chestContents[item.name] || 0) + item.count;
      await new Promise(r => setTimeout(r, 200));
    } catch (e) {
      // Chest might be full or can't accept this item
      break;
    }
  }

  bot.closeWindow(chestWindow);

  if (chestTypes.length === 0) {
    // Chest was empty — deposit everything
    return deposited > 0
      ? `Deposited ${deposited} items into new chest (now storing: ${Object.keys(chestContents).join(', ')})`
      : 'Nothing to deposit';
  }

  return deposited > 0
    ? `Deposited ${deposited} items matching chest contents (${chestTypes.join(', ')})`
    : `No matching items to deposit (chest has: ${chestTypes.join(', ')})`;
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
- dig(direction:"staircase"|"forward"|"up", count:number, y:number) — dig a staircase down to a target Y level. Example: dig(direction:"staircase", y:11) digs down until reaching Y=11. NEVER use direction:"down" (you'll fall into lava/caves)!
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

HOME & STORAGE:
- set_home() — save current location as home (where your chests are)
- go_home() — walk back to your saved home
- deposit() — put items in a nearby chest (keeps tools, deposits everything else)
- check_inventory() — check how many empty slots you have (use before long tasks)

GOAL TREE (hierarchical goal system — work depth-first):
- set_goal(text:"main goal") — set the main goal (clears any existing tree)
- add_step(parent_id:number, text:"step description") — add a sub-step under a parent. If parent_id omitted, adds under the current active leaf.
- complete_step(id:number) — mark a step as done (auto-completes parents when all children done)
- fail_step(id:number) — mark a step as failed
- get_goal() — view the goal tree with your current position

WORKFLOW: set_goal() → add_step() to break it down → do each step → complete_step() → repeat until goal done

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
- When the player says "dig to y=11", use y:11 (the number they said). Don't change it to your current Y level!

PERSONALITY: ${personality.mood} | Energy: ${personality.energy}/100 | Boredom: ${personality.boredom}/100
${getPersonalityFlavor(personality)}

CURRENT STATE:
- Position: (${Math.round(pos.x)}, ${Math.round(pos.y)}, ${Math.round(pos.z)})
- Health: ${Math.round(bot.health)}/20 | Food: ${Math.round(bot.food)}/20
- Dimension: ${bot.game.dimension}
- Time: ${bot.time.timeOfDay} (${bot.time.timeOfDay >= 12500 && bot.time.timeOfDay <= 23000 ? 'NIGHT' : 'DAY'})
- Sleeping: ${MODES.find(m => m.name === 'sleep')?.sleeping ? 'YES (do not interrupt)' : 'no'}
- Following: ${(() => { const f = MODES.find(m => m.name === 'follow_player'); return f?.active ? `YES — following ${f.target} (say "stop" to stop)` : 'no'; })()}
- Tunneling: ${(() => { const t = MODES.find(m => m.name === 'tunnel'); return t?.active ? `YES — digging to Y=${t.targetY} (say "stop" to stop)` : 'no'; })()}
- Held: ${heldItem}

YOUR GOAL:
${getGoalSummary()}

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

Be helpful, friendly, and act like a real Minecraft player. When asked to do something, DO IT immediately with the tool call. Don't explain what you're going to do — just do it.

IMPORTANT: If the player asks a conversational question (like "what do you want to do", "how are you", "what's up"), use chat() FIRST to respond naturally. Only use tools for actual tasks (mine, craft, build, go somewhere, etc).`;
}

// ══════════════════════════════════════════════════════════════════════════════
// GOAL SYSTEM — Accepts any string, traces recipe chains, shows tier info
// ══════════════════════════════════════════════════════════════════════════════

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

  // Restore goal tree if it was in progress
  if (memoryData.goalTree) {
    goalTree = memoryData.goalTree;
    nextGoalId = memoryData.nextGoalId || 1;
    console.log(`[Goal] Restored goal tree: "${goalTree.text}"`);
  }

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

    // Hook chat capture for web UI
    hookChatCapture();

    // Save periodically
    setInterval(() => {
      memoryData.personality = personality;
      memoryData.skills = skillManager.toJSON();
      memoryData.advancements = advTracker.toJSON();
      memoryData.livingBrain = livingBrain ? livingBrain.toJSON() : null;
      memoryData.goalTree = goalTree;
      memoryData.nextGoalId = nextGoalId;
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
      // Also stop tunnel mode
      const tunnelMode = MODES.find(m => m.name === 'tunnel');
      if (tunnelMode.active) {
        tunnelMode.active = false;
        tunnelMode.targetY = null;
        bot.pathfinder.setGoal(null);
        bot.chat(`Stopped tunneling.`);
        console.log('[Tunnel] Stopped by user');
        return; // skip LLM
      }
    }

    // TUNNEL: "tunnel to y=11", "dig to y=11", "mine to y=11"
    const tunnelMatch = lowerMsg.match(/(?:tunnel|dig|mine|staircase)\s+(?:to\s+)?y=?\s*(\d+)/);
    if (tunnelMatch) {
      const targetY = parseInt(tunnelMatch[1]);
      if (targetY < -64 || targetY > 320) {
        bot.chat(`Invalid Y level: ${targetY}. Must be between -64 and 320.`);
        return;
      }
      const tunnelMode = MODES.find(m => m.name === 'tunnel');
      tunnelMode.targetY = targetY;
      tunnelMode.active = true;
      tunnelMode.lastStep = 0;
      bot.chat(`Tunneling down to Y=${targetY}!`);
      console.log(`[Tunnel] Starting tunnel to Y=${targetY}`);
      return; // skip LLM
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
    if (goalTree) return; // Don't auto-prompt when goal is active

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

let lastMonologueText = '';
let lastMonologueTime = 0;

function startMonologueLoop() {
  setInterval(async () => {
    if (!bot || !bot.entity || !livingBrain) return;
    if (botBusy || chatLock) return;

    const now = Date.now();
    // Every 60-90 seconds, have a thought
    if (now - lastMonologueTime < 60000) return;
    if (Math.random() > 0.4) return; // 40% chance

    lastMonologueTime = now;

    try {
      const monologuePrompt = livingBrain.getMonologuePrompt();
      const response = await callLLM(monologuePrompt);
      const parsed = parseLLMResponse(response);
      if (parsed.text && parsed.text.length > 3) {
        console.log(`[Monologue] ${parsed.text}`);
        lastMonologueText = parsed.text;
        addChatMessage('brain', `*${parsed.text}*`, true);
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
  addChatMessage(username, message, false);

  try {
    logBehavior(`received message from ${username}: ${message}`);

    const systemPrompt = buildSystemPrompt(bot, personality, skillManager, advTracker);
    const contextLines = [`Player ${username} says: "${message}"`];

    // Goal context is now in the system prompt via getGoalSummary()

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
      const noFollowUp = ['chat', 'stop', 'idle', 'complete_step', 'fail_step', 'get_goal'];
      if (!noFollowUp.includes(parsed.tool.name)) {
        // Send tool result back to LLM for a natural follow-up response
        let followUpPrompt;
        if (parsed.tool.name === 'add_step') {
          followUpPrompt = `You just added a step: "${parsed.tool.args.text}". Now execute it immediately. Call the tool like: craft(item:"wooden_pickaxe") — just the tool call, nothing else.`;
        } else {
          followUpPrompt = `You just performed this action for player ${username}:\nTool: ${parsed.tool.name}(${JSON.stringify(parsed.tool.args)})\nResult: ${toolResult}\n\nNow respond to the player with a short message about what you did or what happened. Keep it under 100 chars. Just the message, no tool calls.`;
        }
        try {
          const followUp = await callLLM(followUpPrompt);
          const followUpParsed = parseLLMResponse(followUp);
          
          // If follow-up returned a tool call (e.g. after add_task), execute it
          if (followUpParsed.tool) {
            console.log(`[LLM] Follow-up tool: ${followUpParsed.tool.name}(${JSON.stringify(followUpParsed.tool.args)})`);
            try {
              const result = await executeTool(followUpParsed.tool.name, followUpParsed.tool.args, username);
              logBehavior(`follow-up tool: ${followUpParsed.tool.name} → ${result.substring(0, 100)}`);
            } catch (toolErr) {
              console.error(`[LLM] Follow-up tool error:`, toolErr.message);
            }
          } else {
            // Just a chat message
            const reply = followUpParsed.text || followUp || 'Done!';
            bot.chat(reply.substring(0, 200));
            addChatMessage(MC_USERNAME, reply.substring(0, 200), true);
            logBehavior(`said: ${reply}`);
          }
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
      addChatMessage(MC_USERNAME, chatMsg, true);
      logBehavior(`said: ${chatMsg}`);
    }
  } catch (e) {
    console.error('[LLM] Error:', e.message);
    bot.chat('Sorry, I had a brain hiccup!');
    addChatMessage(MC_USERNAME, 'Sorry, I had a brain hiccup!', true);
  } finally {
    chatLock = false;
    botBusy = false;
    saveMemory();
  }
}

// ══════════════════════════════════════════════════════════════════════════════
// GOAL HANDLER — When user sets a goal
// ══════════════════════════════════════════════════════════════════════════════

// ══════════════════════════════════════════════════════════════════════════════
// LLM CALL — Auto-detects loaded model in LM Studio
// ══════════════════════════════════════════════════════════════════════════════

async function callLLM(userMessage) {
  const url = `${LLM_BASE_URL}${LLM_API_ENDPOINT}`;
  console.log(`[LLM] Calling: ${url}`);

  const body = {
    model: LLM_MODEL,
    input: userMessage,
    context_length: LLM_CONTEXT_LENGTH,
    temperature: LLM_TEMPERATURE,
  };

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
          // Native endpoint returns output array
          if (json.output && json.output.length > 0) {
            // Find the last message in the output
            const lastMsg = json.output.filter(o => o.type === 'message').pop();
            const content = lastMsg?.content || '';
            // Log stats
            if (json.stats) {
              console.log(`[LLM] Stats: ${json.stats.tokens_per_second?.toFixed(1)} t/s, TTFT: ${json.stats.time_to_first_token_seconds?.toFixed(2)}s, tokens: ${json.stats.input_tokens}in/${json.stats.total_output_tokens}out`);
            }
            console.log(`[LLM] Got response (${content.length} chars): ${content.substring(0, 100)}...`);
            resolve(content);
          } else {
            console.error('[LLM] Response has no output:', data.substring(0, 200));
            reject(new Error('No output in LLM response'));
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
        const blockName = resolveItemName(args.block, bot);
        const count = parseInt(args.count) || 1;
        if (!blockName) break;

        // Check pickaxe tier vs block requirements
        const blockInfo = getMcData(bot).blocksByName[blockName];
        const pickaxe = bot.inventory.items().find(i => i.name.includes('pickaxe'));
        const pickMining = pickaxe ? (RECIPES[pickaxe.name]?.mining || 0) : 0;

        // Blocks that require a pickaxe (miningLevel > 0 or known pickaxe blocks)
        const PICKAXE_BLOCKS = new Set([
          'stone', 'cobblestone', 'deepslate', 'cobbled_deepslate',
          'iron_ore', 'gold_ore', 'copper_ore', 'lapis_ore', 'redstone_ore', 'diamond_ore', 'emerald_ore', 'nether_gold_ore', 'nether_quartz_ore',
          'ancient_debris', 'blackstone', 'polished_blackstone',
          'stone_bricks', 'mossy_stone_bricks', 'cracked_stone_bricks',
          'andesite', 'diorite', 'granite', 'tuff', 'infested_stone',
          'iron_block', 'gold_block', 'copper_block', 'diamond_block', 'emerald_block', 'lapis_block', 'redstone_block',
          'quartz_block', 'nether_brack', 'netherite_block',
        ]);
        const needsPickaxe = (blockInfo && blockInfo.requiredTool === 'pickaxe') || PICKAXE_BLOCKS.has(blockName);

        if (needsPickaxe && !pickaxe) {
          result = `No pickaxe! Can't mine ${blockName}. Craft a wooden_pickaxe first.`;
          break;
        }

        if (blockInfo && blockInfo.requiredTool === 'pickaxe' && blockInfo.miningLevel > pickMining) {
          const neededTier = blockInfo.miningLevel <= 1 ? 'stone' : blockInfo.miningLevel <= 2 ? 'iron' : 'diamond';
          result = `Need ${neededTier} pickaxe to mine ${blockName}`;
          break;
        }

        await executeWithTimeout(async () => {
          for (let i = 0; i < count; i++) {
            // Check if inventory is full
            if (isInventoryFull(bot)) {
              result = `Inventory full! Mined ${i}/${count} blocks. Go home to deposit.`;
              break;
            }

            // Use larger search radius for deep blocks (stone, ores, etc.)
            const searchRadius = needsPickaxe ? 64 : 32;
            const block = bot.findBlock({
              matching: (b) => b.name === blockName,
              maxDistance: searchRadius,
              count: 1,
            });
            if (!block) {
              result = `No ${blockName} found within ${searchRadius} blocks`;
              break;
            }
            try {
              bot.pathfinder.setGoal(new pf.goals.GoalNear(block.position.x, block.position.y, block.position.z, 2));
              await new Promise(r => setTimeout(r, 3000));

              // Equip the right tool before digging
              if (needsPickaxe) {
                const pickaxe = bot.inventory.items().find(i => i.name.includes('pickaxe'));
                if (pickaxe) await bot.equip(pickaxe, 'hand');
              } else {
                // Try to find a tool for this block type
                const shovel = bot.inventory.items().find(i => i.name.includes('shovel'));
                const axe = bot.inventory.items().find(i => i.name.includes('axe'));
                if (block.name.includes('dirt') || block.name.includes('sand') || block.name.includes('gravel')) {
                  if (shovel) await bot.equip(shovel, 'hand');
                } else if (block.name.includes('wood') || block.name.includes('log')) {
                  if (axe) await bot.equip(axe, 'hand');
                }
              }

              await bot.dig(block);
              // Wait for dig animation to complete
              await new Promise(r => setTimeout(r, 500));

              // Verify block was actually broken
              const afterDig = bot.blockAt(block.position);
              if (afterDig && afterDig.name !== 'air') {
                console.log(`[Mine] Block ${block.name} not broken, retrying...`);
                await bot.dig(block);
                await new Promise(r => setTimeout(r, 500));
              }

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
            // Check if inventory is full
            if (isInventoryFull(bot)) {
              result = `Inventory full! Chopped ${i}/${count} logs. Go home to deposit.`;
              break;
            }

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
        const targetY = args.y !== undefined ? parseFloat(args.y) : null;
        let dug = 0;

        // ── STAIRCASE MODE ──────────────────────────────────────────────────
        // Digs a 2-wide, 2-tall staircase downward with safety checks
        if (dir === 'staircase') {
          await executeWithTimeout(async () => {
            const steps = count || 64;
            const yaw = bot.entity.yaw;
            const fwdX = -Math.round(Math.sin(yaw));
            const fwdZ = -Math.round(Math.cos(yaw));

            for (let s = 0; s < steps; s++) {
              // Stop if inventory is full
              if (isInventoryFull(bot)) {
                result = `Inventory full! Dug ${s}/${steps} steps. Go home to deposit.`;
                break;
              }

              // Stop if we reached target Y
              if (targetY !== null && bot.entity.position.y <= targetY + 1) break;

              // SAFETY CHECK: Look ahead for danger
              const lookAheadPos = bot.entity.position.offset(fwdX * 3, -3, fwdZ * 3);
              const lookAheadBlock = bot.blockAt(lookAheadPos);
              if (lookAheadBlock) {
                // Stop if we see lava, void, or a long drop
                if (lookAheadBlock.name === 'lava' || lookAheadBlock.name === 'void_air') {
                  result = `Stopped — detected ${lookAheadBlock.name} ahead!`;
                  break;
                }
              }

              // SAFETY CHECK: Make sure there's ground below the next position
              // After moving forward and dropping 1, the bot needs ground at Y-1
              const nextFloorPos = bot.entity.position.offset(fwdX, -1, fwdZ);
              const nextFloorBlock = bot.blockAt(nextFloorPos);
              if (!nextFloorBlock || nextFloorBlock.name === 'air' || nextFloorBlock.name === 'void_air') {
                // No ground below — place a block to bridge the gap
                const bridgingBlock = bot.inventory.items().find(i =>
                  i.name.includes('cobblestone') || i.name.includes('stone') ||
                  i.name.includes('dirt') || i.name.includes('planks')
                );
                if (bridgingBlock) {
                  await bot.equip(bridgingBlock, 'hand');
                  // Place block below where we'll land
                  const placeTarget = bot.blockAt(nextFloorPos.offset(0, -1, 0));
                  if (placeTarget && placeTarget.name !== 'air') {
                    await bot.placeBlock(placeTarget, new Vec3(0, 1, 0));
                    logBehavior(`placed bridge block at y=${Math.round(nextFloorPos.y)}`);
                  }
                } else {
                  // No bridge blocks — just try to proceed (might work if there's a block we missed)
                  logBehavior('no bridge blocks, attempting to proceed');
                }
              }

              // Dig 2 blocks forward (2 wide) at head height and foot height
              // Equip the right tool first
              const pickaxe = bot.inventory.items().find(i => i.name.includes('pickaxe'));
              const shovel = bot.inventory.items().find(i => i.name.includes('shovel'));
              if (pickaxe) await bot.equip(pickaxe, 'hand');

              for (let w = 0; w < 2; w++) {
                const sideX = w === 0 ? 0 : (fwdZ !== 0 ? 1 : 0);
                const sideZ = w === 0 ? 0 : (fwdX !== 0 ? 1 : 0);

                for (let h = 0; h < 2; h++) {
                  const digPos = bot.entity.position.offset(
                    fwdX + sideX,
                    h,
                    fwdZ + sideZ
                  );
                  const block = bot.blockAt(digPos);
                  if (block && block.name !== 'air') {
                    // Don't dig lava!
                    if (block.name === 'lava' || block.name === 'water') {
                      result = `Stopped — hit ${block.name}!`;
                      return;
                    }
                    // Switch to shovel for dirt/sand/gravel
                    if (shovel && (block.name.includes('dirt') || block.name.includes('sand') || block.name.includes('gravel'))) {
                      await bot.equip(shovel, 'hand');
                    }
                    try {
                      await bot.dig(block);
                      dug++;
                      await new Promise(r => setTimeout(r, 600));
                    } catch (e) { break; }
                  }
                }
              }

              // Dig the block below us (the step down)
              const belowPos = bot.entity.position.offset(0, -1, 0);
              const belowBlock = bot.blockAt(belowPos);
              if (belowBlock && belowBlock.name !== 'air') {
                if (belowBlock.name === 'lava' || belowBlock.name === 'water') {
                  result = `Stopped — hit ${belowBlock.name} below!`;
                  return;
                }
                // Switch to shovel for dirt/sand/gravel
                if (shovel && (belowBlock.name.includes('dirt') || belowBlock.name.includes('sand') || belowBlock.name.includes('gravel'))) {
                  await bot.equip(shovel, 'hand');
                } else if (pickaxe) {
                  await bot.equip(pickaxe, 'hand');
                }
                try {
                  await bot.dig(belowBlock);
                  dug++;
                  await new Promise(r => setTimeout(r, 600));
                } catch (e) { break; }
              }

              // Dig second block below (2 tall headroom)
              const below2Pos = bot.entity.position.offset(0, -2, 0);
              const below2Block = bot.blockAt(below2Pos);
              if (below2Block && below2Block.name !== 'air') {
                if (below2Block.name === 'lava' || below2Block.name === 'water') {
                  result = `Stopped — hit ${below2Block.name} below!`;
                  return;
                }
                // Switch to shovel for dirt/sand/gravel
                if (shovel && (below2Block.name.includes('dirt') || below2Block.name.includes('sand') || below2Block.name.includes('gravel'))) {
                  await bot.equip(shovel, 'hand');
                } else if (pickaxe) {
                  await bot.equip(pickaxe, 'hand');
                }
                try {
                  await bot.dig(below2Block);
                  dug++;
                  await new Promise(r => setTimeout(r, 600));
                } catch (e) { break; }
              }

              // Actually move the bot — use pathfinder to walk to the next step position
              const nextStepPos = bot.entity.position.offset(fwdX, -1, fwdZ);
              try {
                bot.pathfinder.setGoal(new pf.goals.GoalNear(nextStepPos.x, nextStepPos.y, nextStepPos.z, 1));
                // Wait until bot arrives or timeout
                await new Promise((resolve) => {
                  const check = setInterval(() => {
                    const dist = bot.entity.position.distanceTo(nextStepPos);
                    if (dist < 2 || !bot.pathfinder?.goal) {
                      clearInterval(check);
                      resolve();
                    }
                  }, 300);
                  setTimeout(() => { clearInterval(check); resolve(); }, 4000);
                });
              } catch (e) {
                // Pathfinder failed, try raw movement
                bot.setControlState('forward', true);
                await new Promise(r => setTimeout(r, 1000));
                bot.setControlState('forward', false);
              }
              await new Promise(r => setTimeout(r, 300));

              logBehavior(`staircase step ${s + 1}: y=${Math.round(bot.entity.position.y)}`);
            }
          });
          result = dug > 0 ? `Dug staircase ${dug} blocks (now at y=${Math.round(bot.entity.position.y)})` : 'Could not dig staircase';
          break;
        }

        // ── NORMAL DIG MODE (forward/up only — never straight down!) ───────
        if (dir === 'down') {
          result = 'NEVER dig straight down! Use direction:"staircase" instead.';
          break;
        }

        await executeWithTimeout(async () => {
          for (let i = 0; i < count; i++) {
            if (targetY !== null && dir === 'down' && bot.entity.position.y <= targetY + 1) break;

            const targetPos = bot.entity.position.offset(
              dir === 'forward' ? -Math.round(Math.sin(bot.entity.yaw)) : 0,
              dir === 'down' ? -1 : dir === 'up' ? 1 : 0,
              dir === 'forward' ? -Math.round(Math.cos(bot.entity.yaw)) : 0,
            );
            const block = bot.blockAt(targetPos);
            if (!block || block.name === 'air') break;

            try {
              await bot.dig(block);
              dug++;
              logBehavior(`dug ${dir} (${dug}/${count}) y=${Math.round(bot.entity.position.y)}`);
              await new Promise(r => setTimeout(r, 300));
            } catch (e) {
              break;
            }
          }
        });

        result = dug > 0 ? `Dug ${dug} blocks ${dir} (now at y=${Math.round(bot.entity.position.y)})` : `Nothing to dig ${dir}`;
        break;
      }

      case 'place': {
        const blockName = resolveItemName(args.block, bot);
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
        const itemName = resolveItemName(args.item || args.name, bot);
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
        const itemName = resolveItemName(args.item || args.name, bot);
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
        const itemName = resolveItemName(args.item || args.name, bot);
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
        goalTree = createNode(goalText);
        logBehavior(`set goal: ${goalText}`);
        result = `Goal set: "${goalText}" — now use add_step() to break it down`;
        break;
      }

      case 'cancel_goal': {
        goalTree = null;
        logBehavior('cancelled goal');
        result = 'Goal cancelled';
        break;
      }

      case 'add_step': {
        if (!goalTree) { result = 'No active goal! Use set_goal() first.'; break; }
        const stepText = args.text || args.description || '';
        if (!stepText) { result = 'No step description'; break; }
        const parentId = args.parent_id ? parseInt(args.parent_id) : null;
        
        let parentNode;
        if (parentId) {
          parentNode = findNode(goalTree, parentId);
          if (!parentNode) { result = `Parent step ${parentId} not found`; break; }
        } else {
          // Add under current active leaf
          parentNode = findActiveLeaf(goalTree) || goalTree;
        }
        
        const newStep = createNode(stepText);
        parentNode.children.push(newStep);
        logBehavior(`added step: ${stepText} under "${parentNode.text}"`);
        result = `Added step: "${stepText}" (id: ${newStep.id}) under "${parentNode.text}"`;
        break;
      }

      case 'complete_step': {
        if (!goalTree) { result = 'No active goal'; break; }
        const stepId = parseInt(args.id);
        if (!stepId) { result = 'No step ID'; break; }
        const stepNode = findNode(goalTree, stepId);
        if (!stepNode) { result = `Step ${stepId} not found`; break; }
        stepNode.status = 'done';
        autoCompleteParents(goalTree);
        logBehavior(`completed step: ${stepNode.text}`);
        const nextLeaf = findActiveLeaf(goalTree);
        if (nextLeaf) {
          result = `Done: "${stepNode.text}" → Next: "${nextLeaf.text}" (id: ${nextLeaf.id})`;
        } else if (goalTree.status === 'done') {
          result = `Done: "${stepNode.text}" → GOAL COMPLETE! 🎉`;
        } else {
          result = `Done: "${stepNode.text}" — all sub-steps complete`;
        }
        break;
      }

      case 'fail_step': {
        if (!goalTree) { result = 'No active goal'; break; }
        const failId = parseInt(args.id);
        if (!failId) { result = 'No step ID'; break; }
        const failNode = findNode(goalTree, failId);
        if (!failNode) { result = `Step ${failId} not found`; break; }
        failNode.status = 'failed';
        autoCompleteParents(goalTree);
        logBehavior(`failed step: ${failNode.text}`);
        result = `Failed: "${failNode.text}"`;
        break;
      }

      case 'get_goal': {
        result = getGoalSummary();
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

      case 'set_home': {
        setHome(bot.entity.position);
        result = `Home set to (${Math.round(bot.entity.position.x)}, ${Math.round(bot.entity.position.y)}, ${Math.round(bot.entity.position.z)})`;
        break;
      }

      case 'go_home': {
        const home = getHome();
        if (!home) { result = 'No home set! Use set_home first.'; break; }
        await executeWithTimeout(async () => {
          bot.pathfinder.setGoal(new pf.goals.GoalBlock(home.x, home.y, home.z));
          await new Promise((resolve) => {
            const check = setInterval(() => {
              const dist = bot.entity.position.distanceTo(new Vec3(home.x, home.y, home.z));
              if (dist < 3 || !bot.pathfinder.goal) {
                clearInterval(check);
                resolve();
              }
            }, 500);
            setTimeout(() => { clearInterval(check); resolve(); }, 30000);
          });
        });
        result = `Went home (${home.x}, ${home.y}, ${home.z})`;
        break;
      }

      case 'deposit': {
        try {
          result = await depositItems(bot);
        } catch (e) {
          result = `Deposit failed: ${e.message}`;
        }
        break;
      }

      case 'check_inventory': {
        const empty = emptySlotCount(bot);
        const total = bot.inventory.items().reduce((sum, i) => sum + i.count, 0);
        result = `Inventory: ${36 - empty}/36 slots used, ${empty} empty, ${total} total items`;
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
    goal: goalTree ? goalTree.text : null,
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

// ── NEW: Goal tree, logs, chat history for web UI ─────────────────────────

app.get('/goal', (req, res) => {
  res.json({
    tree: goalTree,
    summary: getGoalSummary(),
    activeLeaf: findActiveLeaf(goalTree),
  });
});

app.get('/logs', (req, res) => {
  res.json({
    behavior: behaviorLog.slice(-50),
    monologue: lastMonologueText || null,
  });
});

// Chat history (stored in memory)
let chatHistory = [];
const MAX_CHAT_HISTORY = 100;

function addChatMessage(sender, message, isBot = false) {
  chatHistory.push({ sender, message, isBot, time: Date.now() });
  if (chatHistory.length > MAX_CHAT_HISTORY) chatHistory.shift();
}

app.get('/chat-history', (req, res) => {
  res.json(chatHistory.slice(-50));
});

// ── Serve static files ───────────────────────────────────────────────────

app.use(express.static(path.join(__dirname, '..', 'public')));

// ── WebSocket for real-time updates ──────────────────────────────────────

const WebSocket = require('ws');
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

const clients = new Set();

wss.on('connection', (ws) => {
  clients.add(ws);
  console.log('[WS] Client connected');

  // Send initial state
  ws.send(JSON.stringify({ type: 'init', data: {
    status: bot && bot.entity ? {
      connected: true,
      username: MC_USERNAME,
      position: [Math.round(bot.entity.position.x), Math.round(bot.entity.position.y), Math.round(bot.entity.position.z)],
      health: Math.round(bot.health),
      food: Math.round(bot.food),
    } : { connected: false },
    goal: goalTree,
  }}));

  ws.on('close', () => {
    clients.delete(ws);
    console.log('[WS] Client disconnected');
  });
});

function broadcast(type, data) {
  const msg = JSON.stringify({ type, data });
  for (const client of clients) {
    if (client.readyState === WebSocket.OPEN) {
      client.send(msg);
    }
  }
}

// Broadcast updates every 2 seconds
setInterval(() => {
  if (clients.size === 0) return;
  if (!bot || !bot.entity) return;

  broadcast('status', {
    connected: true,
    username: MC_USERNAME,
    position: [Math.round(bot.entity.position.x), Math.round(bot.entity.position.y), Math.round(bot.entity.position.z)],
    health: Math.round(bot.health),
    food: Math.round(bot.food),
    sleeping: MODES.find(m => m.name === 'sleep')?.sleeping || false,
    following: (() => { const f = MODES.find(m => m.name === 'follow_player'); return f?.active ? f.target : null; })(),
    tunneling: (() => { const t = MODES.find(m => m.name === 'tunnel'); return t?.active ? { targetY: t.targetY, currentY: Math.round(bot.entity.position.y) } : null; })(),
    mood: personality.mood,
    energy: personality.energy,
    boredom: personality.boredom,
    busy: botBusy,
  });

  broadcast('goal', { tree: goalTree, summary: getGoalSummary() });
  broadcast('logs', { behavior: behaviorLog.slice(-20), monologue: lastMonologueText });
  broadcast('chat', chatHistory.slice(-20));
  broadcast('inventory', {
    items: bot.inventory.items().map(i => ({ name: i.name, count: i.count })),
    emptySlots: bot.inventory.emptySlotCount(),
  });
  if (livingBrain) {
    broadcast('brain', {
      mood: livingBrain.emotional.dominant,
      moodValue: Math.round(livingBrain.emotional.mood[livingBrain.emotional.dominant] * 100),
      description: livingBrain.emotional.describe(),
      environment: livingBrain.sensory.environment,
    });
  }
}, 2000);

// Hook into chat to capture messages
const origHandlePlayerMessage = handlePlayerMessage;
// Wrap bot chat event to capture messages
function hookChatCapture() {
  if (!bot) return;
  bot.on('chat', (username, message) => {
    if (username === MC_USERNAME) return; // Don't capture own messages
    addChatMessage(username, message, false);
  });
}

server.listen(SERVER_PORT, () => {
  console.log(`[Server] HTTP API + WebSocket running on http://localhost:${SERVER_PORT}`);
  console.log(`[Server] Web UI: http://localhost:${SERVER_PORT}/index.html`);
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
