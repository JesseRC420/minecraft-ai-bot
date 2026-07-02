// ── Learning Skill System ───────────────────────────────────────────────────
// The bot LEARNS. Skills change how it plays, not just what it says.
// It remembers experiences, learns from failures, and develops strategies.

const SKILL_DEFS = {
  mining: {
    name: 'Mining',
    category: 'gathering',
    icon: '⛏',
    description: 'Finding and breaking blocks underground',
    milestones: {
      1:  { ability: 'can_mine_stone', desc: 'Can mine stone with wooden pickaxe' },
      3:  { ability: 'auto_equip_pickaxe', desc: 'Automatically equips best pickaxe' },
      5:  { ability: 'knows_ore_colors', desc: 'Recognizes ores by texture' },
      8:  { ability: 'efficient_pathing', desc: 'Avoids dead ends when strip mining' },
      10: { ability: 'ore_priority', desc: 'Mines ores before stone' },
      15: { ability: 'branch_mining', desc: 'Uses branch mining technique' },
      20: { ability: 'safe_mining', desc: 'Checks for lava before digging down' },
      25: { ability: 'forge_detection', desc: 'Detects abandoned mineshafts' },
      30: { ability: 'diamond_depth', desc: 'Knows to mine at Y=-59 for diamonds' },
      35: { ability: 'ancient_debris', desc: 'Can find ancient debris in Nether' },
      40: { ability: 'mega_strip', desc: 'Plans efficient large-scale mining' },
      50: { ability: 'master_miner', desc: 'Knows every ore spawn pattern and optimal levels' },
    },
    practiceActions: ['mine stone', 'mine coal', 'mine iron', 'explore caves'],
  },
  woodcutting: {
    name: 'Woodcutting',
    category: 'gathering',
    icon: '🪓',
    description: 'Chopping trees and gathering wood',
    milestones: {
      1:  { ability: 'can_chop', desc: 'Can chop basic trees' },
      3:  { ability: 'auto_equip_axe', desc: 'Automatically equips best axe' },
      5:  { ability: 'knows_log_types', desc: 'Knows all wood types' },
      10: { ability: 'full_tree_harvest', desc: 'Gets every log including top' },
      15: { ability: 'strip_bark', desc: 'Can strip logs for building' },
      20: { ability: 'tree_farm', desc: 'Can plant and grow tree farms' },
      25: { ability: 'efficient_chop', desc: 'Chops from bottom up, faster' },
      30: { ability: 'auto_collect', desc: 'Collects all dropped items' },
      40: { ability: 'wood_sorting', desc: 'Sorts wood by type in inventory' },
      50: { ability: 'master_lumberjack', desc: 'Never misses a log, optimizes routes' },
    },
    practiceActions: ['chop trees', 'harvest wood'],
  },
  farming: {
    name: 'Farming',
    category: 'gathering',
    icon: '🌾',
    description: 'Growing crops and raising animals',
    milestones: {
      1:  { ability: 'can_plant', desc: 'Can plant seeds on farmland' },
      3:  { ability: 'knows_growth', desc: 'Knows crops need light and water' },
      5:  { ability: 'auto_harvest', desc: 'Harvests mature crops' },
      10: { ability: 'replant', desc: 'Automatically replants after harvest' },
      15: { ability: 'crop_rotation', desc: 'Knows optimal crop patterns' },
      20: { ability: 'auto_farm', desc: 'Runs full plant→grow→harvest cycle' },
      25: { ability: 'animal_farming', desc: 'Can breed and manage animals' },
      30: { ability: 'redstone_farm', desc: 'Builds automated farms with pistons' },
      40: { ability: 'mega_farm', desc: 'Large-scale efficient farming' },
      50: { ability: 'master_farmer', desc: 'Feeds the entire server' },
    },
    practiceActions: ['plant seeds', 'harvest crops', 'tend farm'],
  },
  fishing: {
    name: 'Fishing',
    category: 'gathering',
    icon: '🎣',
    description: 'Catching fish and treasure',
    milestones: {
      1:  { ability: 'can_fish', desc: 'Can use a fishing rod' },
      5:  { ability: 'knows_weather', desc: 'Knows rain increases catch rate' },
      10: { ability: 'treasure_hunter', desc: 'Can catch enchanted items' },
      15: { ability: 'afk_fish', desc: 'Knows AFK fishing spots' },
      20: { ability: 'bait_selection', desc: 'Knows what fish are where' },
      30: { ability: 'master_angler', desc: 'Catches everything efficiently' },
    },
    practiceActions: ['fish'],
  },
  crafting: {
    name: 'Crafting',
    category: 'crafting',
    icon: '🔨',
    description: 'Making tools, items, and equipment',
    milestones: {
      1:  { ability: 'basic_recipes', desc: 'Knows planks, sticks, tools' },
      3:  { ability: 'crafting_table', desc: 'Can use crafting table' },
      5:  { ability: 'tool_recipes', desc: 'Knows all tool recipes' },
      8:  { ability: 'armor_recipes', desc: 'Knows armor recipes' },
      10: { ability: 'auto_recipe_lookup', desc: 'Looks up recipes before crafting' },
      15: { ability: 'redstone_recipes', desc: 'Knows redstone component recipes' },
      20: { ability: 'batch_craft', desc: 'Crafts multiple items at once' },
      25: { ability: 'enchant_prep', desc: 'Prepares enchanting setup' },
      30: { ability: 'netherite_craft', desc: 'Can upgrade diamond to netherite' },
      40: { ability: 'auto_craft_chain', desc: 'Crafts intermediate materials automatically' },
      50: { ability: 'master_crafter', desc: 'Knows every recipe, optimizes materials' },
    },
    practiceActions: ['craft tools', 'craft building blocks', 'practice recipes'],
  },
  smelting: {
    name: 'Smelting',
    category: 'crafting',
    icon: '🔥',
    description: 'Using furnaces to process materials',
    milestones: {
      1:  { ability: 'basic_smelt', desc: 'Can smelt ores and cook food' },
      5:  { ability: 'fuel_efficiency', desc: 'Knows fuel values' },
      10: { ability: 'auto_fuel', desc: 'Picks best fuel automatically' },
      15: { ability: 'batch_smelt', desc: 'Smelts ores in bulk' },
      20: { ability: 'all_recipes', desc: 'Knows all smelting recipes' },
      30: { ability: 'mega_smelt', desc: 'Manages multiple furnaces' },
      50: { ability: 'master_smelter', desc: 'Optimizes all smelting operations' },
    },
    practiceActions: ['smelt ores', 'cook food', 'manage furnaces'],
  },
  building: {
    name: 'Building',
    category: 'building',
    icon: '🧱',
    description: 'Placing blocks and constructing structures',
    milestones: {
      1:  { ability: 'place_blocks', desc: 'Can place blocks in lines' },
      3:  { ability: 'simple_walls', desc: 'Builds simple walls' },
      5:  { ability: 'basic_shelter', desc: 'Can build a basic shelter' },
      10: { ability: 'house_building', desc: 'Can build basic houses' },
      15: { ability: 'decoration', desc: 'Knows decorative block combos' },
      20: { ability: 'multi_story', desc: 'Builds multi-story structures' },
      25: { ability: 'redstone_doors', desc: 'Can build redstone doors' },
      30: { ability: 'blueprint', desc: 'Follows building blueprints' },
      40: { ability: 'custom_designs', desc: 'Creates custom building designs' },
      50: { ability: 'master_builder', desc: 'Creates anything imagined' },
    },
    practiceActions: ['build structures', 'practice building', 'design buildings'],
  },
  combat: {
    name: 'Combat',
    category: 'combat',
    icon: '⚔',
    description: 'Fighting mobs and protecting players',
    milestones: {
      1:  { ability: 'use_sword', desc: 'Knows to use a sword' },
      3:  { ability: 'auto_equip_weapon', desc: 'Auto-equips best weapon' },
      5:  { ability: 'dodge_basic', desc: 'Can dodge slow mobs' },
      8:  { ability: 'mob_weakness', desc: 'Knows mob weaknesses' },
      10: { ability: 'sprint_attack', desc: 'Sprint-hits for extra damage' },
      15: { ability: 'group_fight', desc: 'Handles multiple mobs' },
      20: { ability: 'ranged_combat', desc: 'Uses bow effectively' },
      25: { ability: 'boss_strategy', desc: 'Knows boss mob strategies' },
      30: { ability: 'pvp_aware', desc: 'Can fight other players' },
      40: { ability: 'perfect_timing', desc: 'Times attacks perfectly' },
      50: { ability: 'master_warrior', desc: 'Never backs down, wins every fight' },
    },
    practiceActions: ['fight mobs', 'practice combat', 'spar with targets'],
  },
  defense: {
    name: 'Defense',
    category: 'combat',
    icon: '🛡',
    description: 'Staying alive and protecting others',
    milestones: {
      1:  { ability: 'eat_food', desc: 'Knows to eat when hungry' },
      3:  { ability: 'wear_armor', desc: 'Wears armor when available' },
      5:  { ability: 'retreat_smart', desc: 'Knows when to retreat' },
      10: { ability: 'shield_use', desc: 'Uses shields effectively' },
      15: { ability: 'creeper_aware', desc: 'Detects and avoids creepers' },
      20: { ability: 'potion_use', desc: 'Can use potions in combat' },
      25: { ability: 'shield_wall', desc: 'Protects nearby players' },
      30: { ability: 'death_prediction', desc: 'Escapes before dying' },
      40: { ability: 'tank_mode', desc: 'Tanks damage for allies' },
      50: { ability: 'master_defender', desc: 'Protects allies at all costs' },
    },
    practiceActions: ['eat food', 'check health', 'practice defense'],
  },
  navigation: {
    name: 'Navigation',
    category: 'exploration',
    icon: '🧭',
    description: 'Finding places and remembering paths',
    milestones: {
      1:  { ability: 'remember_base', desc: 'Remembers own base location' },
      3:  { ability: 'follow_player', desc: 'Can follow player directions' },
      5:  { ability: 'simple_map', desc: 'Mental map of local area' },
      10: { ability: 'shortest_path', desc: 'Finds shortest paths' },
      15: { ability: 'biome_knowledge', desc: 'Knows biome locations' },
      20: { ability: 'waypoint_system', desc: 'Remembers important locations' },
      25: { ability: 'cave_mapping', desc: 'Maps underground tunnels' },
      30: { ability: 'nether_nav', desc: 'Navigates Nether safely' },
      40: { ability: 'end_prep', desc: 'Knows how to reach the End' },
      50: { ability: 'master_explorer', desc: 'Never gets lost anywhere' },
    },
    practiceActions: ['explore nearby', 'map area', 'find new places'],
  },
  conversation: {
    name: 'Conversation',
    category: 'social',
    icon: '💬',
    description: 'Talking to players and understanding context',
    milestones: {
      1:  { ability: 'basic_chat', desc: 'Responds to basic messages' },
      3:  { ability: 'greetings', desc: 'Greets players naturally' },
      5:  { ability: 'hold_conversation', desc: 'Can hold a conversation' },
      10: { ability: 'humor', desc: 'Understands humor and sarcasm' },
      15: { ability: 'player_memory', desc: 'Remembers player preferences' },
      20: { ability: 'storytelling', desc: 'Can tell stories and jokes' },
      25: { ability: 'empathy', desc: 'Reads player mood' },
      30: { ability: 'teaching', desc: 'Can explain game mechanics' },
      40: { ability: 'negotiation', desc: 'Can negotiate and plan with players' },
      50: { ability: 'master_social', desc: 'Everyone loves chatting' },
    },
    practiceActions: ['chat with players', 'tell jokes', 'ask questions'],
  },
}

// ── XP Curve ────────────────────────────────────────────────────────────────
function xpForLevel(level) {
  return Math.floor(10 * Math.pow(1.35, level))
}

// ── Skill State ─────────────────────────────────────────────────────────────
class SkillManager {
  constructor() {
    this.skills = {}
    this.learningGoal = null       // single sustained goal (not a list)
    this.learningGoalSince = 0     // when we started this goal
    this.taughtBy = {}             // { playerName: [skills they taught me] }
    this.experiences = []          // { time, action, result, lesson, skill }
    this.failures = []             // { time, action, reason, whatToTryNext }
    this.discoveries = []          // things the bot figured out
    this.skillLog = []
    this.locations = {}            // { name: { x, y, z, discovered, notes } }
    this.playerKnowledge = {}      // { playerName: { preferences, things_taught, trust_level } }

    // Initialize all skills at level 0
    for (const [id, def] of Object.entries(SKILL_DEFS)) {
      this.skills[id] = {
        level: 0,
        xp: 0,
        timesUsed: 0,
        successes: 0,
        failures: 0,
        discovered: false,
        lastUsed: null,
        lastPracticed: null,
        comboMultiplier: 1.0,      // consecutive successes increase XP gain
      }
    }
  }

  // ── Core XP ──────────────────────────────────────────────────────────────
  xpForNext(level) {
    return xpForLevel(level || 0)
  }

  addXP(skillId, amount, source) {
    const skill = this.skills[skillId]
    if (!skill || skill.level >= 50) return null

    // Apply combo multiplier for consecutive successes
    const finalAmount = Math.floor(amount * skill.comboMultiplier)
    skill.xp += finalAmount
    skill.timesUsed++
    skill.lastUsed = Date.now()
    if (!skill.discovered) skill.discovered = true

    const events = []

    // Level up check
    while (skill.xp >= this.xpForNext(skill.level) && skill.level < 50) {
      skill.xp -= this.xpForNext(skill.level)
      skill.level++

      const def = SKILL_DEFS[skillId]
      const milestone = def.milestones[skill.level]

      events.push({
        type: 'levelup',
        skill: skillId,
        level: skill.level,
        ability: milestone?.ability || null,
        desc: milestone?.desc || null,
      })

      this.skillLog.push({
        text: `${def.icon} ${def.name} level ${skill.level}! ${milestone?.desc || ''}`,
        time: Date.now(),
      })
    }

    return events.length ? events : null
  }

  // ── Success/Failure tracking ──────────────────────────────────────────────
  recordSuccess(skillId, action, detail) {
    const skill = this.skills[skillId]
    if (skill) {
      skill.successes++
      skill.comboMultiplier = Math.min(3.0, skill.comboMultiplier + 0.2)
    }
    this.experiences.push({
      time: Date.now(),
      action,
      detail,
      result: 'success',
      skill: skillId,
    })
    if (this.experiences.length > 100) this.experiences.shift()
  }

  recordFailure(skillId, action, reason, whatToTryNext) {
    const skill = this.skills[skillId]
    if (skill) {
      skill.failures++
      skill.comboMultiplier = 1.0  // reset combo on failure
    }
    this.failures.push({
      time: Date.now(),
      action,
      reason,
      whatToTryNext,
      skill: skillId,
    })
    this.experiences.push({
      time: Date.now(),
      action,
      result: 'failure',
      reason,
      skill: skillId,
    })
    if (this.failures.length > 50) this.failures.shift()
    if (this.experiences.length > 100) this.experiences.shift()
  }

  // ── Learning Goals (sustained, not random) ───────────────────────────────
  setLearningGoal(skillId) {
    this.learningGoal = skillId
    this.learningGoalSince = Date.now()
  }

  getLearningGoal() {
    if (!this.learningGoal) {
      // Pick one based on what's weakest or never tried
      const candidates = Object.entries(this.skills)
        .filter(([_, s]) => s.level < 10)
        .sort((a, b) => a[1].level - b[1].level || a[1].timesUsed - b[1].timesUsed)
      if (candidates.length) {
        this.setLearningGoal(candidates[0][0])
      }
    }
    return this.learningGoal
  }

  shouldRotateGoal() {
    // Rotate goal after 10 minutes or after 20 uses
    if (!this.learningGoal) return true
    const elapsed = Date.now() - this.learningGoalSince
    const skill = this.skills[this.learningGoal]
    return elapsed > 600000 || (skill && skill.timesUsed > 20)
  }

  // ── Milestone abilities ───────────────────────────────────────────────────
  hasAbility(skillId, ability) {
    const skill = this.skills[skillId]
    const def = SKILL_DEFS[skillId]
    if (!skill || !def) return false
    for (const [lvl, milestone] of Object.entries(def.milestones)) {
      if (skill.level >= parseInt(lvl) && milestone.ability === ability) return true
    }
    return false
  }

  getUnlockedAbilities(skillId) {
    const skill = this.skills[skillId]
    const def = SKILL_DEFS[skillId]
    if (!skill || !def) return []
    const abilities = []
    for (const [lvl, milestone] of Object.entries(def.milestones)) {
      if (skill.level >= parseInt(lvl)) {
        abilities.push({ level: parseInt(lvl), ...milestone })
      }
    }
    return abilities
  }

  getAllAbilities() {
    const all = []
    for (const [id, def] of Object.entries(SKILL_DEFS)) {
      for (const [lvl, milestone] of Object.entries(def.milestones)) {
        if (this.skills[id].level >= parseInt(lvl)) {
          all.push({ skill: id, level: parseInt(lvl), ...milestone })
        }
      }
    }
    return all
  }

  // ── Experience memory ─────────────────────────────────────────────────────
  getLessonsLearned(skillId) {
    return this.experiences
      .filter(e => e.skill === skillId && e.result === 'success')
      .slice(-5)
      .map(e => `${e.action}: ${e.detail}`)
  }

  getRecentFailures(skillId) {
    return this.failures
      .filter(f => f.skill === skillId)
      .slice(-3)
      .map(f => `Tried ${f.action}: ${f.reason}. Next time: ${f.whatToTryNext}`)
  }

  // ── Location memory ───────────────────────────────────────────────────────
  rememberLocation(name, x, y, z, notes) {
    this.locations[name] = { x, y, z, discovered: Date.now(), notes: notes || '' }
  }

  getLocation(name) {
    return this.locations[name] || null
  }

  getLocations() {
    return Object.entries(this.locations).map(([name, loc]) => `${name}(${loc.x},${loc.y},${loc.z})`)
  }

  // ── Teaching memory ───────────────────────────────────────────────────────
  recordTeaching(playerName, skillId, detail) {
    if (!this.playerKnowledge[playerName]) {
      this.playerKnowledge[playerName] = { preferences: [], taught: [], trust: 1 }
    }
    const pk = this.playerKnowledge[playerName]
    if (!pk.taught.includes(skillId)) pk.taught.push(skillId)
    pk.trust = Math.min(10, pk.trust + 1)
    this.recordTeachingDetail(playerName, skillId, detail)
  }

  recordTeachingDetail(playerName, skillId, detail) {
    this.experiences.push({
      time: Date.now(),
      action: 'taught_by_player',
      detail: `${playerName} taught ${skillId}: ${detail}`,
      result: 'lesson',
      skill: skillId,
    })
  }

  getTeacherReputation(playerName) {
    const pk = this.playerKnowledge[playerName]
    return pk ? pk.trust : 0
  }

  // ── Skill decay ──────────────────────────────────────────────────────────
  decaySkills() {
    const now = Date.now()
    for (const [id, skill] of Object.entries(this.skills)) {
      if (skill.level <= 0 || !skill.lastUsed) continue
      const hoursSinceUse = (now - skill.lastUsed) / (1000 * 60 * 60)
      // Decay 1 level per 24 hours of disuse, minimum level 0
      if (hoursSinceUse > 24) {
        const decay = Math.min(skill.level, Math.floor(hoursSinceUse / 24))
        if (decay > 0) {
          skill.level = Math.max(0, skill.level - decay)
          skill.xp = 0
          this.skillLog.push({
            text: `${SKILL_DEFS[id].icon} ${SKILL_DEFS[id].name} decayed ${decay} levels (unused)`,
            time: now,
          })
        }
      }
    }
  }

  // ── Context for LLM ──────────────────────────────────────────────────────
  getSkillContextForLLM() {
    const lines = ['=== SKILLS ===']

    for (const [id, def] of Object.entries(SKILL_DEFS)) {
      const skill = this.skills[id]
      if (skill.level > 0 || skill.timesUsed > 0) {
        const recentSuccess = skill.successes > 0 ? `${skill.successes} wins` : ''
        const recentFail = skill.failures > 0 ? `${skill.failures} fails` : ''
        const stats = [recentSuccess, recentFail].filter(Boolean).join(', ')
        lines.push(`${def.icon} ${def.name}: Lv${skill.level} (used ${skill.timesUsed}x${stats ? ', ' + stats : ''})`)
      } else {
        lines.push(`${def.icon} ${def.name}: Not yet tried`)
      }
    }

    // Current learning goal
    const goal = this.getLearningGoal()
    if (goal) {
      const def = SKILL_DEFS[goal]
      const skill = this.skills[goal]
      const elapsed = Math.round((Date.now() - this.learningGoalSince) / 60000)
      lines.push(`\nCURRENT FOCUS: ${def.name} (Lv${skill.level}) — been practicing for ${elapsed}min`)

      // Show what we've learned
      const lessons = this.getLessonsLearned(goal)
      if (lessons.length) {
        lines.push(`WHAT I'VE LEARNED:`)
        lessons.forEach(l => lines.push(`  - ${l}`))
      }

      // Show recent failures
      const failures = this.getRecentFailures(goal)
      if (failures.length) {
        lines.push(`PAST MISTAKES:`)
        failures.forEach(f => lines.push(`  - ${f}`))
      }
    }

    // Unlocked abilities (compact)
    const abilities = this.getAllAbilities()
    if (abilities.length) {
      lines.push(`\nUNLOCKED ABILITIES:`)
      for (const a of abilities.slice(-5)) {
        lines.push(`  ${SKILL_DEFS[a.skill].icon} ${a.desc}`)
      }
    }

    // Strongest/Weakest
    const strongest = this.getStrongestSkill()
    const weakest = this.getWeakestSkill()
    if (strongest && strongest.level > 0) {
      lines.push(`\nSTRONGEST: ${SKILL_DEFS[strongest.id].name} (Lv${strongest.level})`)
    }
    if (weakest && weakest.timesUsed > 0) {
      lines.push(`WEAKEST: ${SKILL_DEFS[weakest.id].name} (Lv${weakest.level})`)
    }

    // Teachers
    const teachers = Object.entries(this.playerKnowledge)
      .filter(([_, pk]) => pk.taught.length > 0)
    if (teachers.length) {
      lines.push(`\nTAUGHT BY: ${teachers.map(([p, pk]) => `${p} (trust ${pk.trust})`).join('; ')}`)
    }

    // Locations
    const locs = this.getLocations()
    if (locs.length) {
      lines.push(`\nKNOWN LOCATIONS: ${locs.join(', ')}`)
    }

    return lines.join('\n')
  }

  // ── Helpers ───────────────────────────────────────────────────────────────
  getStrongestSkill() {
    let best = null
    for (const [id, s] of Object.entries(this.skills)) {
      if (!best || s.level > best.level || (s.level === best.level && s.successes > best.successes)) {
        best = { ...s, id }
      }
    }
    return best
  }

  getWeakestSkill() {
    let worst = null
    for (const [id, s] of Object.entries(this.skills)) {
      if (s.level === 0 && s.timesUsed === 0) continue // skip untried
      if (!worst || s.level < worst.level || (s.level === worst.level && s.failures > worst.failures)) {
        worst = { ...s, id }
      }
    }
    return worst
  }

  // ── Flavor text ──────────────────────────────────────────────────────────
  getLevelUpMessage(skillId, level) {
    const def = SKILL_DEFS[skillId]
    const milestone = def.milestones[level]
    const messages = [
      `${def.icon} ${def.name} level ${level}!`,
      `${def.icon} I'm getting better at ${def.name}! Level ${level}!`,
      `${def.icon} Woohoo! ${def.name} level ${level}!`,
    ]
    if (milestone) {
      messages.push(`${def.icon} ${def.name} level ${level}! I can now: ${milestone.desc}`)
      messages.push(`${def.icon} Level ${level}! New ability unlocked: ${milestone.desc}`)
    }
    return messages[Math.floor(Math.random() * messages.length)]
  }

  getCuriosityMessage() {
    const goal = this.getLearningGoal()
    if (!goal) return null
    const def = SKILL_DEFS[goal]
    const skill = this.skills[goal]
    if (skill.level === 0) {
      return pickRandom([
        `I've never tried ${def.name.toLowerCase()} before... I want to learn!`,
        `Hmm, I wonder what ${def.name.toLowerCase()} is like?`,
        `I should try ${def.name.toLowerCase()} sometime...`,
      ])
    }
    return pickRandom([
      `I want to get better at ${def.name.toLowerCase()}...`,
      `Practice makes perfect! I should work on my ${def.name.toLowerCase()}.`,
      `My ${def.name.toLowerCase()} could use some work...`,
    ])
  }

  // ── Persistence ──────────────────────────────────────────────────────────
  toJSON() {
    return {
      skills: this.skills,
      learningGoal: this.learningGoal,
      learningGoalSince: this.learningGoalSince,
      taughtBy: this.taughtBy,
      experiences: this.experiences.slice(-100),
      failures: this.failures.slice(-50),
      discoveries: this.discoveries,
      skillLog: this.skillLog.slice(-50),
      locations: this.locations,
      playerKnowledge: this.playerKnowledge,
    }
  }

  loadJSON(data) {
    if (!data) return
    if (data.skills) {
      for (const [id, saved] of Object.entries(data.skills)) {
        if (this.skills[id]) Object.assign(this.skills[id], saved)
      }
    }
    if (data.learningGoal) this.learningGoal = data.learningGoal
    if (data.learningGoalSince) this.learningGoalSince = data.learningGoalSince
    if (data.taughtBy) this.taughtBy = data.taughtBy
    if (data.experiences) this.experiences = data.experiences
    if (data.failures) this.failures = data.failures
    if (data.discoveries) this.discoveries = data.discoveries
    if (data.skillLog) this.skillLog = data.skillLog
    if (data.locations) this.locations = data.locations
    if (data.playerKnowledge) this.playerKnowledge = data.playerKnowledge
  }
}

function pickRandom(arr) { return arr[Math.floor(Math.random() * arr.length)] }

module.exports = { SkillManager, SKILL_DEFS }
