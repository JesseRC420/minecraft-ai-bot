// ══════════════════════════════════════════════════════════════════════════════
// Living Brain — Makes the bot feel embodied and alive
// Sensory stream + Emotional model + Micro-behaviors + Journal + Inner monologue
// ══════════════════════════════════════════════════════════════════════════════

const { Vec3 } = require('vec3');

// ── ANIMAL DROP TABLE ───────────────────────────────────────────────────────
// What each animal drops and how to get it

const ANIMAL_DROPS = {
  sheep:            { drops: ['wool', 'raw_mutton'], needsTool: null, shearDrops: ['white_wool', 'light_gray_wool', 'gray_wool', 'black_wool', 'brown_wool', 'red_wool', 'orange_wool', 'yellow_wool', 'lime_wool', 'pink_wool', 'cyan_wool', 'purple_wool', 'blue_wool', 'magenta_wool'] },
  cow:              { drops: ['raw_beef', 'leather'], needsTool: null },
  pig:              { drops: ['raw_porkchop'], needsTool: null },
  chicken:          { drops: ['raw_chicken', 'feather'], needsTool: null },
  rabbit:           { drops: ['raw_rabbit', 'rabbit_foot', 'rabbit_hide'], needsTool: null },
  wolf:             { drops: [], needsTool: null },  // tamed wolves are pets
  cat:              { drops: [], needsTool: null },   // tamed cats are pets
  horse:            { drops: [], needsTool: null },   // horses are mounts
  donkey:           { drops: [], needsTool: null },
  mooshroom:        { drops: ['raw_beef', 'leather', 'red_mushroom'], needsTool: null },
  panda:            { drops: [], needsTool: null },   // protected
  fox:              { drops: ['raw_rabbit'], needsTool: null },
  bee:              { drops: [], needsTool: null },   // protected
  goat:             { drops: ['raw_mutton'], needsTool: null },
  frog:             { drops: [], needsTool: null },
  camel:            { drops: [], needsTool: null },
  sniffer:          { drops: [], needsTool: null },
  armadillo:        { drops: ['armadillo_scute'], needsTool: null },
  wolf:             { drops: [], needsTool: null },
};

// Hostile mob drops
const HOSTILE_DROPS = {
  zombie:           { drops: ['rotten_flesh'] },
  skeleton:         { drops: ['bone', 'arrow'] },
  creeper:          { drops: ['gunpowder'] },
  spider:           { drops: ['string', 'spider_eye'] },
  enderman:         { drops: ['ender_pearl'] },
  cave_spider:      { drops: ['string', 'spider_eye'] },
  witch:            { drops: ['glass_bottle', 'redstone', 'glowstone_dust', 'stick', 'sugar', 'spider_eye', 'gunpowder', 'stick'] },
  blaze:            { drops: ['blaze_rod'] },
  ghast:            { drops: ['ghast_tear', 'gunpowder'] },
  piglin:           { drops: ['gold_nugget'] },
  phantom:          { drops: ['phantom_membrane'] },
  drowned:          { drops: ['rotten_flesh', 'gold_ingot'] },
  guardian:         { drops: ['prismarine_shard', 'raw_cod'] },
  elder_guardian:   { drops: ['prismarine_shard', 'sponge'] },
  wither_skeleton:  { drops: ['bone', 'wither_skeleton_skull'] },
  skeleton_horse:   { drops: [] },
  zombie_horse:     { drops: [] },
  stray:            { drops: ['bone', 'arrow'] },
  husk:             { drops: ['rotten_flesh'] },
  vindicator:       { drops: ['emerald'] },
  evoker:           { drops: ['totem_of_undying', 'emerald'] },
  pillager:         { drops: ['crossbow'] },
  ravager:          { drops: [] },
  vex:              { drops: [] },
  the_ender_dragon: { drops: [] },
  wither:           { drops: [] },
  slime:            { drops: ['slime_ball'] },
  magma_cube:       { drops: ['magma_cream'] },
  silverfish:       { drops: [] },
  endermite:        { drops: [] },
  guardian:         { drops: ['prismarine_shard', 'raw_cod'] },
};

// ── EMOTIONAL MODEL ─────────────────────────────────────────────────────────
// Continuous emotional state that shifts based on real events.
// Pure code — no LLM needed.

const EMOTIONS = {
  content:    { base: 0.3, decay: 0.02, color: '🟢' },
  excited:    { base: 0,   decay: 0.05, color: '🟡' },
  scared:     { base: 0,   decay: 0.04, color: '🔴' },
  proud:      { base: 0,   decay: 0.03, color: '🟣' },
  lonely:     { base: 0,   decay: 0.01, color: '🔵' },
  curious:    { base: 0.2, decay: 0.02, color: '🟠' },
  bored:      { base: 0,   decay: 0.03, color: '⚪' },
  anxious:    { base: 0,   decay: 0.04, color: '🟤' },
  peaceful:   { base: 0.1, decay: 0.02, color: '🩵' },
};

class EmotionalModel {
  constructor() {
    this.mood = {};
    for (const [key, def] of Object.entries(EMOTIONS)) {
      this.mood[key] = def.base;
    }
    this.dominant = 'content';
    this.moodHistory = [];  // last 20 mood shifts
  }

  // Boost an emotion by amount (0-1)
  boost(emotion, amount) {
    if (this.mood[emotion] !== undefined) {
      this.mood[emotion] = Math.min(1, this.mood[emotion] + amount);
    }
  }

  // Reduce an emotion
  reduce(emotion, amount) {
    if (this.mood[emotion] !== undefined) {
      this.mood[emotion] = Math.max(0, this.mood[emotion] - amount);
    }
  }

  // Natural decay — emotions fade over time
  tick() {
    for (const [key, def] of Object.entries(EMOTIONS)) {
      this.mood[key] = Math.max(def.base * 0.1, this.mood[key] - def.decay);
    }

    // Content is suppressed by strong negative emotions
    if (this.mood.scared > 0.2 || this.mood.anxious > 0.2 || this.mood.bored > 0.3) {
      this.mood.content = Math.max(0.05, this.mood.content - 0.03);
    } else {
      // Only restore content when things are calm
      this.mood.content = Math.min(0.4, this.mood.content + 0.005);
    }

    // Compound: scared + lonely = anxious
    if (this.mood.scared > 0.3 && this.mood.lonely > 0.2) {
      this.mood.anxious = Math.min(1, this.mood.anxious + 0.03);
    }

    // Loneliness fades faster when player is around
    if (this.mood.lonely > 0.2 && this.sensory && this.sensory.nearbyPlayers && this.sensory.nearbyPlayers.length > 0) {
      this.mood.lonely = Math.max(0, this.mood.lonely - 0.05);
    }

    // Find dominant emotion
    let maxVal = 0;
    for (const [key, val] of Object.entries(this.mood)) {
      if (val > maxVal) {
        maxVal = val;
        this.dominant = key;
      }
    }
  }

  // Process a game event and shift emotions
  processEvent(event) {
    const shifts = {
      // Positive
      'found_diamond':     { excited: 0.6, proud: 0.4, content: -0.2 },
      'found_ore':         { excited: 0.3, curious: 0.2 },
      'leveled_up':        { excited: 0.5, proud: 0.5 },
      'crafted_item':      { proud: 0.3, content: 0.2 },
      'built_something':   { proud: 0.4, content: 0.3 },
      'player_talked':     { lonely: -0.4, content: 0.1, curious: 0.1, scared: -0.15 },
      'player_gifted':     { excited: 0.4, proud: 0.3, content: 0.3, scared: -0.2 },
      'ate_food':          { content: 0.15 },
      'daytime':           { peaceful: 0.2, scared: -0.15 },
      'saw_animal':        { curious: 0.15, content: 0.1 },
      'nearby_player':     { lonely: -0.3, curious: 0.15 },

      // Negative (suppress positive emotions)
      'took_damage':       { scared: 0.5, anxious: 0.3, content: -0.3, excited: -0.2, proud: -0.1 },
      'mob_nearby':        { scared: 0.3, anxious: 0.2, curious: 0.1 },
      'creeper_nearby':    { scared: 0.7, anxious: 0.4, content: -0.4, excited: -0.4, proud: -0.2 },
      'low_health':        { scared: 0.6, anxious: 0.5, content: -0.3, excited: -0.3 },
      'low_food':          { anxious: 0.3, bored: -0.1 },
      'fell':              { scared: 0.35, content: -0.2, excited: -0.2 },
      'died':              { scared: 0.8, anxious: 0.6, content: -0.5, excited: -0.5, proud: -0.3 },
      'nighttime':         { scared: 0.25, curious: -0.1, peaceful: -0.1 },
      'in_dark':           { scared: 0.35, content: -0.2, excited: -0.2 },
      'in_lava':           { scared: 0.9, anxious: 0.7, content: -0.5, excited: -0.5 },
      'stuck':             { anxious: 0.3, bored: 0.2, content: -0.2 },

      // Neutral
      'idle':              { bored: 0.08, lonely: 0.03, content: -0.02 },
      'exploring':         { curious: 0.15, bored: -0.08, content: 0.05 },
      'mining':            { content: 0.08, bored: -0.03 },
      'walking':           { content: 0.03 },
      'spawned':           { curious: 0.4, content: 0.3, peaceful: 0.2 },
      'raining':           { bored: 0.05, peaceful: 0.05 },
    };

    const shift = shifts[event];
    if (shift) {
      for (const [emotion, amount] of Object.entries(shift)) {
        if (amount > 0) this.boost(emotion, amount);
        else this.reduce(emotion, Math.abs(amount));
      }
      this.moodHistory.push({ event, time: Date.now(), mood: { ...this.mood } });
      if (this.moodHistory.length > 20) this.moodHistory.shift();

      // Immediately recalculate dominant
      this._updateDominant();
    }
  }

  // Recalculate dominant emotion
  _updateDominant() {
    let maxVal = 0;
    for (const [key, val] of Object.entries(this.mood)) {
      if (val > maxVal) {
        maxVal = val;
        this.dominant = key;
      }
    }
  }

  // Get a text description of current mood
  describe() {
    const dominant = this.dominant;
    const val = this.mood[dominant];
    const intensity = val > 0.7 ? 'very' : val > 0.4 ? 'somewhat' : 'a little';

    const descriptions = {
      content:    'feeling content',
      excited:    `${intensity} excited`,
      scared:     `${intensity} scared`,
      proud:      `${intensity} proud`,
      lonely:     `${intensity} lonely`,
      curious:    `${intensity} curious`,
      bored:      `${intensity} bored`,
      anxious:    `${intensity} anxious`,
      peaceful:   'feeling peaceful',
    };

    return descriptions[dominant] || 'feeling okay';
  }

  // Get mood flavor text for LLM context
  getFlavorText() {
    const lines = [];
    const dominant = this.dominant;
    const val = this.mood[dominant];

    if (val > 0.5) {
      const flavors = {
        content:    ['Just vibing.', 'All is well.', 'Nice day.'],
        excited:    ['So exciting!', 'This is great!', 'Wow!'],
        scared:     ['*trembling*', 'That was close...', 'Need to be careful...'],
        proud:      ['Feeling accomplished!', 'Nailed it!', 'I did good!'],
        lonely:     ['Anyone there?', '*looks around*', 'It\'s quiet...'],
        curious:    ['What\'s that?', 'I wonder...', 'Interesting...'],
        bored:      ['*yawn*', 'Nothing happening...', 'Same old...'],
        anxious:    ['*fidgets*', 'Something feels off...', 'On edge...'],
        peaceful:   ['So peaceful.', 'Just breathing.', 'Zen moment.'],
      };
      lines.push(pickRandom(flavors[dominant] || ['...']));
    }

    // Secondary emotions
    const secondaries = Object.entries(this.mood)
      .filter(([k, v]) => k !== dominant && v > 0.3)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 2);
    for (const [emotion, val] of secondaries) {
      lines.push(`Also feeling ${emotion}`);
    }

    return lines.join('. ') || 'Just existing.';
  }

  toJSON() {
    return { mood: { ...this.mood }, dominant: this.dominant, moodHistory: this.moodHistory };
  }

  loadJSON(data) {
    if (data.mood) this.mood = data.mood;
    if (data.dominant) this.dominant = data.dominant;
    if (data.moodHistory) this.moodHistory = data.moodHistory;
  }
}

// ── SENSORY STREAM ──────────────────────────────────────────────────────────
// Continuously processes what the bot sees, feels, and experiences.
// Pure code — feeds into EmotionalModel.

class SensoryStream {
  constructor(bot, emotional) {
    this.bot = bot;
    this.emotional = emotional;
    this.lastHealth = 20;
    this.lastFood = 20;
    this.lastPosition = null;
    this.lastTimeOfDay = 0;
    this.lastLightLevel = 15;
    this.seenEntities = new Set();
    this.seenBlocks = new Set();
    this.nearbyMobs = [];
    this.nearbyPlayers = [];
    this.environment = {};
    this.lastTick = Date.now();
  }

  // Process one tick of sensory data
  tick() {
    if (!this.bot || !this.bot.entity) return;

    const now = Date.now();
    const dt = (now - this.lastTick) / 1000;
    this.lastTick = now;

    const pos = this.bot.entity.position;
    const mcData = require('minecraft-data')(this.bot.version);

    // ── Health changes ──
    if (this.bot.health < this.lastHealth) {
      this.emotional.processEvent('took_damage');
      if (this.bot.health < 6) this.emotional.processEvent('low_health');
    }
    if (this.bot.health < 6) this.emotional.processEvent('low_health');
    this.lastHealth = this.bot.health;

    // ── Food changes ──
    if (this.bot.food < this.lastFood) {
      if (this.bot.food < 6) this.emotional.processEvent('low_food');
    }
    this.lastFood = this.bot.food;

    // ── Time of day ──
    const timeOfDay = this.bot.time.timeOfDay;
    const isNight = timeOfDay > 12500 && timeOfDay < 23500;
    const wasNight = this.lastTimeOfDay > 12500 && this.lastTimeOfDay < 23500;
    if (isNight && !wasNight) this.emotional.processEvent('nighttime');
    if (!isNight && wasNight) this.emotional.processEvent('daytime');
    this.lastTimeOfDay = timeOfDay;

    // ── Light level at feet ──
    const blockAtFeet = this.bot.blockAt(pos);
    if (blockAtFeet) {
      const light = blockAtFeet.light;
      if (light < 7) this.emotional.processEvent('in_dark');
      this.lastLightLevel = light;
    }

    // ── Nearby entities ──
    this.nearbyMobs = [];
    this.nearbyPlayers = [];
    this.nearbyAnimals = [];
    const entities = Object.values(this.bot.entities);

    for (const entity of entities) {
      if (entity === this.bot.entity || !entity.position) continue;
      const dist = entity.position.distanceTo(pos);
      if (dist > 32) continue;

      // Players
      if (entity.type === 'player') {
        this.nearbyPlayers.push({ name: entity.username, dist, entity });
        if (dist < 16) this.emotional.processEvent('nearby_player');
      }

      // Hostile mobs
      if (entity.type === 'hostile') {
        this.nearbyMobs.push({ name: entity.name, dist, entity, hostile: true });
        if (entity.name === 'creeper' && dist < 8) {
          this.emotional.processEvent('creeper_nearby');
        } else if (dist < 12) {
          this.emotional.processEvent('mob_nearby');
        }
      }

      // Animals — detailed tracking with drops
      if (entity.type === 'animal' && dist < 20) {
        const animalInfo = ANIMAL_DROPS[entity.name];
        if (animalInfo) {
          this.nearbyAnimals.push({
            name: entity.name,
            dist: Math.round(dist),
            entity,
            drops: animalInfo.drops,
            needsTool: animalInfo.needsTool || null,
            color: entity.metadata ? this._getSheepColor(entity) : null,
          });
        }
        if (dist < 12) this.emotional.processEvent('saw_animal');
      }
    }

    // ── Position change → movement detection ──
    if (this.lastPosition) {
      const moved = pos.distanceTo(this.lastPosition);
      if (moved > 0.5) {
        this.emotional.processEvent('walking');
      } else if (moved < 0.1) {
        this.emotional.processEvent('idle');
      }
    }
    this.lastPosition = pos.clone();

    // ── Environment snapshot ──
    this.environment = {
      pos: { x: Math.round(pos.x), y: Math.round(pos.y), z: Math.round(pos.z) },
      health: Math.round(this.bot.health),
      food: Math.round(this.bot.food),
      timeOfDay,
      isNight,
      lightLevel: this.lastLightLevel,
      dimension: this.bot.game.dimension,
      nearbyHostiles: this.nearbyMobs.length,
      nearbyPlayers: this.nearbyPlayers.length,
      nearbyPlayerNames: this.nearbyPlayers.map(p => p.name),
      heldItem: this.bot.heldItem ? this.bot.heldItem.name : 'none',
    };
  }

  // Get a compact summary for the LLM
  getSnapshot() {
    const e = this.environment;
    if (!e || !e.pos) return 'Sensory stream initializing...';
    return [
      `POS: (${e.pos.x}, ${e.pos.y}, ${e.pos.z})`,
      `HP: ${e.health}/20 | FOOD: ${e.food}/20`,
      `TIME: ${e.isNight ? 'Night' : 'Day'} (light:${e.lightLevel})`,
      `HELD: ${e.heldItem}`,
      `MOOD: ${this.emotional.describe()}`,
      `HOSTILES nearby: ${e.nearbyHostiles}`,
      `PLAYERS nearby: ${e.nearbyPlayerNames.join(', ') || 'none'}`,
    ].join(' | ');
  }

  // Get nearby block types for awareness
  getNearbyBlocks() {
    if (!this.bot || !this.bot.entity) return 'unknown';
    const pos = this.bot.entity.position;
    const counts = {};
    for (let dx = -6; dx <= 6; dx++) {
      for (let dy = -3; dy <= 3; dy++) {
        for (let dz = -6; dz <= 6; dz++) {
          const b = this.bot.blockAt(pos.offset(dx, dy, dz));
          if (b && b.name !== 'air' && b.name !== 'cave_air' && b.name !== 'void_air') {
            counts[b.name] = (counts[b.name] || 0) + 1;
          }
        }
      }
    }
    return Object.entries(counts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 8)
      .map(([n, c]) => `${n}x${c}`)
      .join(', ');
  }

  // Get interactive blocks nearby — things the bot can right-click
  getInteractiveBlocks() {
    if (!this.bot || !this.bot.entity) return 'unknown';
    const pos = this.bot.entity.position;

    const INTERACTIVE_BLOCKS = new Set([
      // Beds
      'white_bed', 'orange_bed', 'magenta_bed', 'light_blue_bed', 'yellow_bed',
      'lime_bed', 'pink_bed', 'gray_bed', 'light_gray_bed', 'cyan_bed',
      'purple_bed', 'blue_bed', 'brown_bed', 'green_bed', 'red_bed', 'black_bed',
      // Storage
      'chest', 'trapped_chest', 'ender_chest', 'barrel',
      // Crafting
      'crafting_table', 'smithing_table', 'cartography_table', 'loom', 'stonecutter',
      // Smelting
      'furnace', 'blast_furnace', 'smoker',
      // Brewing
      'brewing_stand',
      // Enchanting
      'enchanting_table',
      // Utility
      'anvil', 'chipped_anvil', 'damaged_anvil',
      ' cauldron', 'water_cauldron', 'lava_cauldron', 'powder_snow_cauldron',
      'composter', 'note_block', 'jukebox',
      // Doors & gates
      'oak_door', 'spruce_door', 'birch_door', 'jungle_door', 'acacia_door',
      'dark_oak_door', 'mangrove_door', 'cherry_door', 'bamboo_door', 'crimson_door', 'warped_door',
      'oak_fence_gate', 'spruce_fence_gate', 'birch_fence_gate', 'jungle_fence_gate',
      'acacia_fence_gate', 'dark_oak_fence_gate',
      // Redstone
      'lever', 'stone_button', 'oak_button',
      'oak_pressure_plate', 'stone_pressure_plate', 'light_weighted_pressure_plate', 'heavy_weighted_pressure_plate',
      'tripwire_hook',
      // Signs
      'oak_sign', 'spruce_sign', 'birch_sign', 'jungle_sign', 'acacia_sign', 'dark_oak_sign',
      // Spawners
      'spawner', 'trial_spawner',
      // Portals
      'nether_portal', 'end_portal',
      // Other
      'beacon', 'bell', 'campfire', 'soul_campfire',
      'hopper', 'dropper', 'dispenser',
      'tnt',
    ]);

    const found = [];
    for (let dx = -8; dx <= 8; dx++) {
      for (let dy = -4; dy <= 4; dy++) {
        for (let dz = -8; dz <= 8; dz++) {
          const b = this.bot.blockAt(pos.offset(dx, dy, dz));
          if (b && INTERACTIVE_BLOCKS.has(b.name)) {
            const dist = Math.round(Math.sqrt(dx*dx + dy*dy + dz*dz));
            found.push({ name: b.name, dist, x: b.position.x, y: b.position.y, z: b.position.z });
          }
        }
      }
    }

    // Sort by distance
    found.sort((a, b) => a.dist - b.dist);
    return found.slice(0, 10);
  }

  // Get a summary of interactive blocks for the LLM
  getInteractiveBlocksSummary() {
    const blocks = this.getInteractiveBlocks();
    if (!blocks.length) return 'No interactive blocks nearby';
    return blocks.map(b => {
      const name = b.name.replace(/_/g, ' ');
      return `${name}(${b.dist}m) at (${b.x},${b.y},${b.z})`;
    }).join('\n');
  }

  // Get nearby entity descriptions
  getNearbyEntities() {
    if (!this.bot || !this.bot.entity) return 'unknown';
    const lines = [];
    for (const mob of this.nearbyMobs.slice(0, 5)) {
      const drops = HOSTILE_DROPS[mob.name]?.drops?.join(', ') || 'unknown';
      lines.push(`${mob.name}(${Math.round(mob.dist)}m) [drops: ${drops}]`);
    }
    for (const player of this.nearbyPlayers.slice(0, 3)) {
      lines.push(`${player.name}(${Math.round(player.dist)}m)`);
    }
    return lines.join(', ') || 'none';
  }

  // Get nearby animals with their drops — key for resource gathering
  getNearbyAnimals() {
    if (!this.nearbyAnimals || !this.nearbyAnimals.length) return 'none';
    return this.nearbyAnimals.map(a => {
      let desc = `${a.name}(${a.dist}m) [drops: ${a.drops.join(', ')}]`;
      if (a.name === 'sheep' && a.color) desc += ` [color: ${a.color}]`;
      if (a.needsTool) desc += ` [needs: ${a.needsTool}]`;
      return desc;
    }).join('\n');
  }

  // Get resource summary — what can be gathered from nearby entities
  getResourceSummary() {
    const resources = {};
    if (this.nearbyAnimals) {
      for (const animal of this.nearbyAnimals) {
        for (const drop of animal.drops) {
          resources[drop] = (resources[drop] || 0) + 1;
        }
      }
    }
    if (this.nearbyMobs) {
      for (const mob of this.nearbyMobs) {
        const drops = HOSTILE_DROPS[mob.name]?.drops || [];
        for (const drop of drops) {
          resources[drop] = (resources[drop] || 0) + 1;
        }
      }
    }
    if (Object.keys(resources).length === 0) return 'No gatherable resources nearby';
    return Object.entries(resources)
      .map(([item, count]) => `${item}x${count}`)
      .join(', ');
  }

  // Get sheep color from entity metadata (value index 12 = color)
  _getSheepColor(entity) {
    try {
      const colorIndex = entity.metadata ? entity.metadata[12] : null;
      if (colorIndex === null || colorIndex === undefined) return 'white';
      const colors = ['white', 'orange', 'magenta', 'light_blue', 'yellow', 'lime', 'pink', 'gray', 'light_gray', 'cyan', 'purple', 'blue', 'brown', 'green', 'red', 'black'];
      return colors[colorIndex] || 'white';
    } catch (e) {
      return 'white';
    }
  }
}

// ── EMBODIED JOURNAL ────────────────────────────────────────────────────────
// Rolling memory of experiences — what happened, what it felt like.
// Gives the bot temporal continuity.

class EmbodiedJournal {
  constructor() {
    this.entries = [];        // recent experiences
    this.longTermMemory = []; // summarized memories
    this.maxEntries = 50;
    this.maxLongTerm = 20;
  }

  // Record an experience
  record(type, description, emotion, detail) {
    this.entries.push({
      type,
      description,
      emotion,
      detail: detail || '',
      time: Date.now(),
    });
    if (this.entries.length > this.maxEntries) this.entries.shift();
  }

  // Get recent experiences for LLM context
  getRecentContext(count) {
    const recent = this.entries.slice(-(count || 8));
    return recent.map(e => {
      const age = Math.round((Date.now() - e.time) / 60000);
      const ageStr = age < 1 ? 'just now' : `${age}m ago`;
      return `[${ageStr}] ${e.description} (${e.emotion})`;
    }).join('\n');
  }

  // Summarize recent entries into long-term memory
  summarize() {
    if (this.entries.length < 5) return null;

    const recent = this.entries.slice(-10);
    const events = recent.map(e => e.description).join('; ');
    const dominantEmotion = this.getDominantEmotion(recent);

    const summary = {
      text: `Recent: ${events}`,
      emotion: dominantEmotion,
      time: Date.now(),
    };

    this.longTermMemory.push(summary);
    if (this.longTermMemory.length > this.maxLongTerm) {
      this.longTermMemory.shift();
    }

    return summary;
  }

  getDominantEmotion(entries) {
    const counts = {};
    for (const e of entries) {
      counts[e.emotion] = (counts[e.emotion] || 0) + 1;
    }
    return Object.entries(counts).sort((a, b) => b[1] - a[1])[0]?.[0] || 'content';
  }

  // Get long-term memories for LLM
  getLongTermContext() {
    return this.longTermMemory.map(m => m.text).join('\n');
  }

  toJSON() {
    return { entries: this.entries, longTermMemory: this.longTermMemory };
  }

  loadJSON(data) {
    if (data.entries) this.entries = data.entries;
    if (data.longTermMemory) this.longTermMemory = data.longTermMemory;
  }
}

// ── MICRO-BEHAVORS ──────────────────────────────────────────────────────────
// Small autonomous actions that make the bot feel physically present.
// Pure code — runs every tick based on sensory input.

class MicroBehaviors {
  constructor(bot, sensory, emotional) {
    this.bot = bot;
    this.sensory = sensory;
    this.emotional = emotional;
    this.lastBehavior = 0;
    this.behaviorCooldown = 2000;
  }

  tick() {
    if (!this.bot || !this.bot.entity) return;
    const now = Date.now();
    if (now - this.lastBehavior < this.behaviorCooldown) return;

    const mood = this.emotional.dominant;
    const val = this.emotional.mood[mood];

    // ── Scared behaviors ──
    if (mood === 'scared' && val > 0.4) {
      if (Math.random() < 0.3) {
        // Look around nervously
        const yaw = Math.random() * Math.PI * 2;
        this.bot.look(yaw, 0, true);
        this.lastBehavior = now;
        return;
      }
    }

    // ── Excited behaviors ──
    if (mood === 'excited' && val > 0.4) {
      if (Math.random() < 0.3) {
        // Jump!
        this.bot.setControlState('jump', true);
        setTimeout(() => this.bot.setControlState('jump', false), 300);
        this.lastBehavior = now;
        return;
      }
    }

    // ── Curious behaviors ──
    if (mood === 'curious' && val > 0.4) {
      if (Math.random() < 0.2) {
        // Look at nearest entity
        const entity = this.bot.nearestEntity(e => e.position && e.position.distanceTo(this.bot.entity.position) < 12);
        if (entity) {
          this.bot.lookAt(entity.position.offset(0, entity.height || 1, 0));
          this.lastBehavior = now;
          return;
        }
      }
    }

    // ── Lonely behaviors ──
    if (mood === 'lonely' && val > 0.4) {
      if (Math.random() < 0.15) {
        // Look around for players
        const yaw = Math.random() * Math.PI * 2;
        this.bot.look(yaw, 0, true);
        this.lastBehavior = now;
        return;
      }
    }

    // ── Bored behaviors ──
    if (mood === 'bored' && val > 0.5) {
      if (Math.random() < 0.2) {
        // Look at held item
        if (this.bot.heldItem) {
          this.bot.lookAt(this.bot.entity.position.offset(0, 1.5, 0.5));
          this.lastBehavior = now;
          return;
        }
      }
    }

    // ── Peaceful behaviors ──
    if (mood === 'peaceful' && val > 0.4) {
      if (Math.random() < 0.1) {
        // Slowly look around
        const yaw = this.bot.entity.yaw + (Math.random() - 0.5) * 0.5;
        this.bot.look(yaw, 0, true);
        this.lastBehavior = now;
        return;
      }
    }

    // ── Crouch when anxious ──
    if (mood === 'anxious' && val > 0.5) {
      this.bot.setControlState('sneak', true);
      setTimeout(() => this.bot.setControlState('sneak', false), 2000);
      this.lastBehavior = now;
    }
  }
}

// ── HELPER ──
function pickRandom(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

// ══════════════════════════════════════════════════════════════════════════════
// LIVING BRAIN — Orchestrates all systems
// ══════════════════════════════════════════════════════════════════════════════

class LivingBrain {
  constructor(bot) {
    this.bot = bot;
    this.emotional = new EmotionalModel();
    this.sensory = new SensoryStream(bot, this.emotional);
    this.journal = new EmbodiedJournal();
    this.microBehaviors = new MicroBehaviors(bot, this.sensory, this.emotional);
    this.persistentMemory = null;
    this.running = false;
    this.interval = null;
  }

  // Connect persistent memory for monologue context
  setMemory(memory) {
    this.persistentMemory = memory;
  }

  start() {
    if (this.running) return;
    this.running = true;
    console.log('[Brain] Living brain activated');

    // Main sensory loop — 500ms
    this.interval = setInterval(() => {
      try {
        this.sensory.tick();
        this.emotional.tick();
        this.microBehaviors.tick();
      } catch (e) {
        console.error('[Brain] Tick error:', e.message);
      }
    }, 500);
  }

  stop() {
    this.running = false;
    if (this.interval) clearInterval(this.interval);
    console.log('[Brain] Living brain deactivated');
  }

  // Process a game event from external code
  onEvent(event) {
    this.emotional.processEvent(event);
    this.journal.record('event', event, this.emotional.dominant);
  }

  // Process player interaction
  onPlayerChat(username, message) {
    this.emotional.processEvent('player_talked');
    this.journal.record('chat', `${username}: ${message}`, this.emotional.dominant);
  }

  // Process tool execution
  onToolUse(toolName, result) {
    this.journal.record('action', `Used ${toolName}: ${result}`, this.emotional.dominant);
    if (toolName === 'craft') this.emotional.processEvent('crafted_item');
    if (toolName === 'mine') this.emotional.processEvent('mining');
    if (toolName === 'chop') this.emotional.processEvent('exploring');
  }

  // Get full context string for the LLM system prompt
  getLivingContext() {
    const lines = [];

    // Emotional state
    lines.push('=== INNER STATE ===');
    lines.push(`Mood: ${this.emotional.describe()}`);
    lines.push(`Feeling: ${this.emotional.getFlavorText()}`);

    // Dominant emotion breakdown
    const dominant = this.emotional.dominant;
    const val = this.emotional.mood[dominant];
    lines.push(`Dominant emotion: ${dominant} (${Math.round(val * 100)}%)`);

    // Recent emotions
    const recent = this.emotional.moodHistory.slice(-3);
    if (recent.length) {
      lines.push(`Recent events: ${recent.map(h => h.event).join(', ')}`);
    }

    // Sensory snapshot
    lines.push('\n=== SENSORY INPUT ===');
    lines.push(this.sensory.getSnapshot());
    lines.push(`Blocks: ${this.sensory.getNearbyBlocks()}`);

    // Interactive blocks — things the bot can right-click/use
    const interactive = this.sensory.getInteractiveBlocksSummary();
    if (interactive !== 'No interactive blocks nearby') {
      lines.push('\n=== INTERACTIVE BLOCKS (right-click to use) ===');
      lines.push(interactive);
    }

    lines.push(`Entities: ${this.sensory.getNearbyEntities()}`);

    // Animals nearby — key for resource gathering
    const animals = this.sensory.getNearbyAnimals();
    if (animals !== 'none') {
      lines.push('\n=== ANIMALS NEARBY ===');
      lines.push(animals);
    }

    // Gatherable resources
    const resources = this.sensory.getResourceSummary();
    if (resources !== 'No gatherable resources nearby') {
      lines.push(`\nGATHERABLE: ${resources}`);
    }

    // Journal
    const recentJournal = this.journal.getRecentContext(5);
    if (recentJournal) {
      lines.push('\n=== RECENT EXPERIENCES ===');
      lines.push(recentJournal);
    }

    // Long-term memories
    const longTerm = this.journal.getLongTermContext();
    if (longTerm) {
      lines.push('\n=== MEMORIES ===');
      lines.push(longTerm);
    }

    return lines.join('\n');
  }

  // Get inner monologue prompt (for self-reflection during idle)
  getMonologuePrompt() {
    const mood = this.emotional.describe();
    const flavor = this.emotional.getFlavorText();
    const snapshot = this.sensory.getSnapshot();
    const recentJournal = this.journal.getRecentContext(3);

    // Inject memory context if available
    const memoryContext = this.persistentMemory ? this.persistentMemory.getBriefContext() : '';

    return `You are a Minecraft companion living in a blocky world. You are ${mood}. ${flavor}
${memoryContext ? `Memory: ${memoryContext}` : ''}

Current situation: ${snapshot}

Recent experiences: ${recentJournal || 'nothing notable yet'}

Think to yourself (1-2 sentences, a brief observation or thought about your surroundings, something a real player would think — keep it casual and positive-ish, no existential dread). No tool calls, just a thought:`;
  }

  // Get self-prompting prompt (decides what to do next)
  getSelfPrompt() {
    const mood = this.emotional.dominant;
    const moodVal = this.emotional.mood[mood];
    const snapshot = this.sensory.getSnapshot();
    const isNight = this.sensory.environment.isNight;
    const lowHealth = this.sensory.environment.health < 10;
    const lowFood = this.sensory.environment.food < 10;
    const hostiles = this.sensory.environment.nearbyHostiles;

    let situation = 'calm and free';
    if (lowHealth) situation = 'hurt and vulnerable';
    else if (lowFood) situation = 'hungry';
    else if (hostiles > 0) situation = 'in danger';
    else if (isNight) situation = 'exposed at night';
    else if (mood === 'bored') situation = 'bored with nothing to do';
    else if (mood === 'curious') situation = 'curious about surroundings';

    return `You are in a situation: ${situation}. You are ${this.emotional.describe()}.

${snapshot}

Based on your current state, decide what to do next. You can:
- chat(message:"text") to say something
- goto(x, y, z) to move somewhere
- mine(block:"name") or chop(count:1) to gather resources
- eat() if hungry
- idle() if nothing to do
- set_goal(goal:"text") if you want a project

Call exactly one tool. Keep your response brief.`;
  }

  toJSON() {
    return {
      emotional: this.emotional.toJSON(),
      journal: this.journal.toJSON(),
    };
  }

  loadJSON(data) {
    if (data.emotional) this.emotional.loadJSON(data.emotional);
    if (data.journal) this.journal.loadJSON(data.journal);
  }
}

module.exports = { LivingBrain, EmotionalModel, SensoryStream, EmbodiedJournal, MicroBehaviors };
