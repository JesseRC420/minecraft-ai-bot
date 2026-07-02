// ══════════════════════════════════════════════════════════════════════════════
// Persistent Memory — The bot's long-term brain
// Relationships, locations, discoveries, timeline, self-knowledge
// Saves to memory.json, survives restarts
// ══════════════════════════════════════════════════════════════════════════════

const fs = require('fs');
const path = require('path');

const MEMORY_FILE = path.join(__dirname, '..', 'memory.json');

// ── RELATIONSHIP TRACKER ────────────────────────────────────────────────────
// Remembers every player it's met, trust level, what they've done together

class RelationshipTracker {
  constructor() {
    this.players = {}; // { playerName: { firstMet, lastSeen, trust, interactions, taughtMe, helpedMe, timesKilled, personality } }
  }

  // Record meeting a player for the first time
  meet(playerName) {
    if (!this.players[playerName]) {
      this.players[playerName] = {
        firstMet: Date.now(),
        lastSeen: Date.now(),
        trust: 1,               // 1-10 scale
        interactions: 0,
        messagesExchanged: 0,
        taughtMe: [],           // skills/things they taught the bot
        helpedMe: [],           // times they helped (gave items, protected, etc.)
        hurtMe: [],             // times they attacked/killed
        giftedItems: [],        // what they've given me
        timesKilled: 0,         // how many times they killed me
        timesSaved: 0,          // how many times they saved me
        lastInteractionType: '',
        notes: '',              // freeform notes
        personality: '',        // what I think about them
      };
      console.log(`[Memory] Met new player: ${playerName}`);
    }
    this.players[playerName].lastSeen = Date.now();
    this.players[playerName].interactions++;
  }

  // Player chatted with me
  recordChat(playerName, message) {
    this.meet(playerName);
    this.players[playerName].messagesExchanged++;
    this.players[playerName].lastInteractionType = 'chat';
  }

  // Player gave me something
  recordGift(playerName, itemName) {
    this.meet(playerName);
    const p = this.players[playerName];
    p.giftedItems.push({ item: itemName, time: Date.now() });
    if (p.giftedItems.length > 20) p.giftedItems.shift();
    p.trust = Math.min(10, p.trust + 1);
    p.lastInteractionType = 'gift';
    p.helpedMe.push(`Gave me ${itemName}`);
    if (p.helpedMe.length > 20) p.helpedMe.shift();
  }

  // Player taught me something
  recordTeach(playerName, topic) {
    this.meet(playerName);
    const p = this.players[playerName];
    if (!p.taughtMe.includes(topic)) p.taughtMe.push(topic);
    p.trust = Math.min(10, p.trust + 2);
    p.lastInteractionType = 'teach';
  }

  // Player killed me
  recordKill(playerName) {
    this.meet(playerName);
    const p = this.players[playerName];
    p.timesKilled++;
    p.trust = Math.max(0, p.trust - 2);
    p.hurtMe.push(`Killed me at ${new Date().toLocaleTimeString()}`);
    if (p.hurtMe.length > 10) p.hurtMe.shift();
    p.lastInteractionType = 'kill';
  }

  // Player saved me (healed, gave food, protected from mob)
  recordSave(playerName, how) {
    this.meet(playerName);
    const p = this.players[playerName];
    p.timesSaved++;
    p.trust = Math.min(10, p.trust + 1);
    p.helpedMe.push(how);
    if (p.helpedMe.length > 20) p.helpedMe.shift();
    p.lastInteractionType = 'save';
  }

  // Set a note about a player
  setNote(playerName, note) {
    this.meet(playerName);
    this.players[playerName].notes = note;
  }

  // Get trust level description
  getTrustLevel(playerName) {
    const p = this.players[playerName];
    if (!p) return 'stranger';
    if (p.trust >= 8) return 'trusted friend';
    if (p.trust >= 5) return 'acquaintance';
    if (p.trust >= 3) return 'newcomer';
    if (p.trust >= 1) return 'stranger';
    return 'enemy';
  }

  // Get a summary for the LLM
  getSummary() {
    const lines = [];
    const sorted = Object.entries(this.players)
      .sort((a, b) => b[1].lastSeen - a[1].lastSeen);

    for (const [name, p] of sorted.slice(0, 10)) {
      const age = Math.round((Date.now() - p.firstMet) / 3600000);
      const lastSeen = Math.round((Date.now() - p.lastSeen) / 60000);
      const lastSeenStr = lastSeen < 1 ? 'just now' : lastSeen < 60 ? `${lastSeen}m ago` : `${Math.round(lastSeen/60)}h ago`;

      let line = `${name}: trust ${p.trust}/10 (${this.getTrustLevel(name)}), met ${age}h ago, last seen ${lastSeenStr}`;
      if (p.taughtMe.length) line += `, taught me: ${p.taughtMe.join(', ')}`;
      if (p.timesKilled > 0) line += `, killed me ${p.timesKilled}x`;
      if (p.notes) line += ` [note: ${p.notes}]`;
      lines.push(line);
    }

    return lines.length ? lines.join('\n') : 'No players met yet';
  }

  toJSON() {
    return { players: this.players };
  }

  loadJSON(data) {
    if (data.players) this.players = data.players;
  }
}

// ── LOCATION MEMORY ─────────────────────────────────────────────────────────
// Remembers important places: home, mines, farms, points of interest

class LocationMemory {
  constructor() {
    this.locations = {}; // { name: { x, y, z, dimension, discovered, lastVisited, notes, category } }
  }

  // Save a location
  remember(name, x, y, z, dimension, notes, category) {
    this.locations[name] = {
      x: Math.round(x), y: Math.round(y), z: Math.round(z),
      dimension: dimension || 'overworld',
      discovered: this.locations[name]?.discovered || Date.now(),
      lastVisited: Date.now(),
      notes: notes || '',
      category: category || 'point_of_interest',
    };
    console.log(`[Memory] Remembered location: ${name} at (${Math.round(x)}, ${Math.round(y)}, ${Math.round(z)})`);
  }

  // Visit a location (updates lastVisited)
  visit(name) {
    if (this.locations[name]) {
      this.locations[name].lastVisited = Date.now();
    }
  }

  // Find nearest known location
  findNearest(x, y, z) {
    let nearest = null;
    let minDist = Infinity;
    for (const [name, loc] of Object.entries(this.locations)) {
      const dist = Math.sqrt((loc.x-x)**2 + (loc.y-y)**2 + (loc.z-z)**2);
      if (dist < minDist) {
        minDist = dist;
        nearest = { name, ...loc, distance: Math.round(dist) };
      }
    }
    return nearest;
  }

  // Get summary for LLM
  getSummary() {
    const lines = [];
    for (const [name, loc] of Object.entries(this.locations)) {
      const lastVisited = Math.round((Date.now() - loc.lastVisited) / 60000);
      const lastStr = lastVisited < 1 ? 'now' : lastVisited < 60 ? `${lastVisited}m ago` : `${Math.round(lastVisited/60)}h ago`;
      lines.push(`${name} (${loc.x}, ${loc.y}, ${loc.z}) [${loc.category}] - visited ${lastStr}${loc.notes ? ' - ' + loc.notes : ''}`);
    }
    return lines.length ? lines.join('\n') : 'No locations remembered';
  }

  toJSON() {
    return { locations: this.locations };
  }

  loadJSON(data) {
    if (data.locations) this.locations = data.locations;
  }
}

// ── DISCOVERY LOG ───────────────────────────────────────────────────────────
// Tracks what the bot has figured out: recipes, strategies, world rules

class DiscoveryLog {
  constructor() {
    this.discoveries = []; // { text, category, time, importance }
    this.maxDiscoveries = 50;
  }

  // Record a discovery
  discover(text, category, importance) {
    // Don't duplicate
    if (this.discoveries.some(d => d.text === text)) return;

    this.discoveries.push({
      text,
      category: category || 'general',
      time: Date.now(),
      importance: importance || 1, // 1-5 scale
    });
    if (this.discoveries.length > this.maxDiscoveries) {
      // Remove least important old discoveries
      this.discoveries.sort((a, b) => b.importance - a.importance);
      this.discoveries = this.discoveries.slice(0, this.maxDiscoveries);
    }
    console.log(`[Memory] Discovered: ${text}`);
  }

  // Get discoveries by category
  getByCategory(category) {
    return this.discoveries.filter(d => d.category === category);
  }

  // Get summary for LLM
  getSummary() {
    if (!this.discoveries.length) return 'No discoveries yet';
    const sorted = [...this.discoveries].sort((a, b) => b.time - a.time);
    return sorted.slice(0, 10).map(d => {
      const age = Math.round((Date.now() - d.time) / 60000);
      const ageStr = age < 60 ? `${age}m ago` : `${Math.round(age/60)}h ago`;
      return `[${d.category}] ${d.text} (${ageStr})`;
    }).join('\n');
  }

  toJSON() {
    return { discoveries: this.discoveries };
  }

  loadJSON(data) {
    if (data.discoveries) this.discoveries = data.discoveries;
  }
}

// ── EVENT TIMELINE ──────────────────────────────────────────────────────────
// Chronological log of significant events (not every action, just important ones)

class EventTimeline {
  constructor() {
    this.events = []; // { text, time, importance, mood }
    this.maxEvents = 100;
  }

  // Record a significant event
  record(text, importance, mood) {
    this.events.push({
      text,
      time: Date.now(),
      importance: importance || 1,
      mood: mood || 'neutral',
    });
    if (this.events.length > this.maxEvents) this.events.shift();
  }

  // Get recent events for LLM context
  getRecent(count) {
    return this.events.slice(-(count || 10)).map(e => {
      const age = Math.round((Date.now() - e.time) / 60000);
      const ageStr = age < 1 ? 'just now' : age < 60 ? `${age}m ago` : `${Math.round(age/60)}h ago`;
      return `[${ageStr}] ${e.text}`;
    }).join('\n');
  }

  // Get a summary of today's events
  getTodaySummary() {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const todayEvents = this.events.filter(e => e.time >= today.getTime());
    if (!todayEvents.length) return 'No events today';

    const byType = {};
    for (const e of todayEvents) {
      const key = e.text.split(' ')[0].toLowerCase();
      byType[key] = (byType[key] || 0) + 1;
    }

    return `${todayEvents.length} events today: ${Object.entries(byType).map(([k,v]) => `${k}(${v})`).join(', ')}`;
  }

  toJSON() {
    return { events: this.events };
  }

  loadJSON(data) {
    if (data.events) this.events = data.events;
  }
}

// ── SELF MODEL ──────────────────────────────────────────────────────────────
// The bot's understanding of itself: what it can do, what it's good at,
// what it's failed at, what it wants to learn

class SelfModel {
  constructor() {
    this.abilities = {};     // { ability: { level, lastUsed, timesUsed } }
    this.failures = [];      // { action, reason, time }
    this.goals = [];         // { goal, status, time, result }
    this.preferences = {};   // { thing: preference } — e.g., "food": "bread"
    this.identity = '';      // freeform description of self
  }

  // Record an ability
  useAbility(ability, success) {
    if (!this.abilities[ability]) {
      this.abilities[ability] = { level: 0, lastUsed: null, timesUsed: 0, successes: 0, failures: 0 };
    }
    const a = this.abilities[ability];
    a.lastUsed = Date.now();
    a.timesUsed++;
    if (success) {
      a.successes++;
      if (a.successes > 3 && a.level < 5) a.level++;
    } else {
      a.failures++;
      a.level = Math.max(0, a.level - 1);
    }
  }

  // Record a failure
  recordFailure(action, reason) {
    this.failures.push({ action, reason, time: Date.now() });
    if (this.failures.length > 20) this.failures.shift();
  }

  // Record a goal attempt
  recordGoal(goal, status, result) {
    this.goals.push({ goal, status, result: result || '', time: Date.now() });
    if (this.goals.length > 20) this.goals.shift();
  }

  // Set a preference
  setPreference(thing, preference) {
    this.preferences[thing] = preference;
  }

  // Get summary for LLM
  getSummary() {
    const lines = ['=== SELF-KNOWLEDGE ==='];

    // Abilities
    const abilities = Object.entries(this.abilities)
      .sort((a, b) => b[1].level - a[1].level);
    if (abilities.length) {
      lines.push('Skills:');
      for (const [name, a] of abilities.slice(0, 8)) {
        lines.push(`  ${name}: Lv${a.level} (${a.successes} wins, ${a.failures} fails)`);
      }
    }

    // Recent failures (lessons learned)
    if (this.failures.length) {
      lines.push('Past mistakes:');
      for (const f of this.failures.slice(-3)) {
        lines.push(`  ${f.action}: ${f.reason}`);
      }
    }

    // Goals
    if (this.goals.length) {
      const recent = this.goals.slice(-3);
      lines.push('Recent goals:');
      for (const g of recent) {
        lines.push(`  ${g.goal}: ${g.status}${g.result ? ' - ' + g.result : ''}`);
      }
    }

    // Preferences
    if (Object.keys(this.preferences).length) {
      lines.push('Preferences:');
      for (const [thing, pref] of Object.entries(this.preferences)) {
        lines.push(`  ${thing}: ${pref}`);
      }
    }

    return lines.join('\n');
  }

  toJSON() {
    return { abilities: this.abilities, failures: this.failures, goals: this.goals, preferences: this.preferences, identity: this.identity };
  }

  loadJSON(data) {
    if (data.abilities) this.abilities = data.abilities;
    if (data.failures) this.failures = data.failures;
    if (data.goals) this.goals = data.goals;
    if (data.preferences) this.preferences = data.preferences;
    if (data.identity) this.identity = data.identity;
  }
}

// ══════════════════════════════════════════════════════════════════════════════
// PERSISTENT MEMORY — Orchestrates all memory systems
// ══════════════════════════════════════════════════════════════════════════════

class PersistentMemory {
  constructor() {
    this.relationships = new RelationshipTracker();
    this.locations = new LocationMemory();
    this.discoveries = new DiscoveryLog();
    this.timeline = new EventTimeline();
    this.selfModel = new SelfModel();
    this.lastConsolidation = 0;
    this.consolidationInterval = 300000; // 5 minutes
  }

  // Save to disk
  save() {
    try {
      const data = {
        relationships: this.relationships.toJSON(),
        locations: this.locations.toJSON(),
        discoveries: this.discoveries.toJSON(),
        timeline: this.timeline.toJSON(),
        selfModel: this.selfModel.toJSON(),
        lastConsolidation: this.lastConsolidation,
        savedAt: Date.now(),
      };
      fs.writeFileSync(MEMORY_FILE, JSON.stringify(data, null, 2));
    } catch (e) {
      console.error('[Memory] Failed to save:', e.message);
    }
  }

  // Load from disk
  load() {
    try {
      if (fs.existsSync(MEMORY_FILE)) {
        const raw = fs.readFileSync(MEMORY_FILE, 'utf8');
        if (raw.trim()) {
          const data = JSON.parse(raw);
          if (data.relationships) this.relationships.loadJSON(data.relationships);
          if (data.locations) this.locations.loadJSON(data.locations);
          if (data.discoveries) this.discoveries.loadJSON(data.discoveries);
          if (data.timeline) this.timeline.loadJSON(data.timeline);
          if (data.selfModel) this.selfModel.loadJSON(data.selfModel);
          if (data.lastConsolidation) this.lastConsolidation = data.lastConsolidation;
          console.log('[Memory] Loaded from disk');
          return true;
        }
      }
    } catch (e) {
      console.error('[Memory] Failed to load:', e.message);
    }
    return false;
  }

  // Process a player chat message
  onPlayerChat(username, message) {
    this.relationships.recordChat(username, message);

    // Auto-detect teaching moments
    const teachPatterns = [
      /you (should|can|need to|must) (.+)/i,
      /try (to |doing )?(.+)/i,
      /here('s| is) (.+)/i,
      /right click|left click|shift|sneak|jump/i,
    ];
    for (const pattern of teachPatterns) {
      const match = message.match(pattern);
      if (match) {
        this.relationships.recordTeach(username, match[2] || match[0]);
        break;
      }
    }
  }

  // Process a player giving an item
  onPlayerGift(username, itemName) {
    this.relationships.recordGift(username, itemName);
    this.timeline.record(`${username} gave me ${itemName}`, 2, 'grateful');
  }

  // Process bot death
  onDeath(killer) {
    if (killer) {
      this.relationships.recordKill(killer);
      this.timeline.record(`Killed by ${killer}`, 3, 'scared');
    } else {
      this.timeline.record('Died', 2, 'scared');
    }
  }

  // Process a discovery
  onDiscovery(text, category, importance) {
    this.discoveries.discover(text, category, importance);
    this.timeline.record(`Discovered: ${text}`, importance || 2, 'curious');
  }

  // Process reaching a location
  onReachLocation(name, x, y, z, dimension) {
    this.locations.remember(name, x, y, z, dimension);
    this.timeline.record(`Reached ${name}`, 1, 'content');
  }

  // Process a tool use
  onToolUse(toolName, result, success) {
    this.selfModel.useAbility(toolName, success !== false);
    if (success === false) {
      this.selfModel.recordFailure(toolName, result);
    }
  }

  // Process a goal completion
  onGoalComplete(goal, success, result) {
    this.selfModel.recordGoal(goal, success ? 'completed' : 'failed', result);
    this.timeline.record(`${success ? 'Completed' : 'Failed'} goal: ${goal}`, 3, success ? 'proud' : 'disappointed');
  }

  // Auto-save and consolidate periodically
  tick() {
    const now = Date.now();
    if (now - this.lastConsolidation > this.consolidationInterval) {
      this.lastConsolidation = now;
      this.consolidate();
      this.save();
    }
  }

  // Consolidate: remove trivial events, summarize patterns
  consolidate() {
    // Remove events older than 24h with low importance
    const dayAgo = Date.now() - 86400000;
    this.timeline.events = this.timeline.events.filter(e =>
      e.time > dayAgo || e.importance >= 3
    );

    // Auto-discover patterns
    const playerInteractions = {};
    for (const [name, p] of Object.entries(this.relationships.players)) {
      playerInteractions[name] = p.interactions;
    }

    console.log('[Memory] Consolidated and saved');
  }

  // Get full memory context for the LLM
  getMemoryContext() {
    const lines = [];

    // Relationships
    lines.push('=== PEOPLE I KNOW ===');
    lines.push(this.relationships.getSummary());

    // Locations
    const locs = this.locations.getSummary();
    if (locs !== 'No locations remembered') {
      lines.push('\n=== PLACES I REMEMBER ===');
      lines.push(locs);
    }

    // Discoveries
    const disc = this.discoveries.getSummary();
    if (disc !== 'No discoveries yet') {
      lines.push('\n=== WHAT I\'VE LEARNED ===');
      lines.push(disc);
    }

    // Timeline
    const recent = this.timeline.getRecent(5);
    if (recent) {
      lines.push('\n=== RECENT EVENTS ===');
      lines.push(recent);
    }

    // Self-knowledge
    lines.push('\n' + this.selfModel.getSummary());

    return lines.join('\n');
  }

  // Get a compact summary for inner monologue
  getBriefContext() {
    const playerCount = Object.keys(this.relationships.players).length;
    const locCount = Object.keys(this.locations.locations).length;
    const discCount = this.discoveries.discoveries.length;
    const eventCount = this.timeline.events.length;

    return `${playerCount} players known, ${locCount} locations, ${discCount} discoveries, ${eventCount} events recorded`;
  }

  toJSON() {
    return {
      relationships: this.relationships.toJSON(),
      locations: this.locations.toJSON(),
      discoveries: this.discoveries.toJSON(),
      timeline: this.timeline.toJSON(),
      selfModel: this.selfModel.toJSON(),
    };
  }

  loadJSON(data) {
    if (data.relationships) this.relationships.loadJSON(data.relationships);
    if (data.locations) this.locations.loadJSON(data.locations);
    if (data.discoveries) this.discoveries.loadJSON(data.discoveries);
    if (data.timeline) this.timeline.loadJSON(data.timeline);
    if (data.selfModel) this.selfModel.loadJSON(data.selfModel);
  }
}

module.exports = { PersistentMemory, RelationshipTracker, LocationMemory, DiscoveryLog, EventTimeline, SelfModel };
