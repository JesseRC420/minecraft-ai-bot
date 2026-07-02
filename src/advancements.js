// ── Minecraft Advancements System ───────────────────────────────────────────
// Tracks advancements, provides goals, and suggests what to do when bored.
// The bot WANTS to complete them — it's like a completionist player.

const ADVANCEMENTS = {
  // ══════════════════════════════════════════════════════════════════════════
  // STORY — The main progression line
  // ══════════════════════════════════════════════════════════════════════════

  'story/mine_stone': {
    name: 'Stone Age',
    description: 'Mine stone with your pickaxe',
    category: 'story',
    difficulty: 1,
    triggers: { action: 'mine', block: 'stone' },
    hints: ['Craft a wooden pickaxe first', 'Dig down to find stone under dirt'],
  },
  'story/upgrade_tools': {
    name: 'Getting an Upgrade',
    description: 'Construct a better pickaxe',
    category: 'story',
    difficulty: 1,
    triggers: { action: 'craft', item: 'pickaxe', minTier: 'stone' },
    hints: ['Mine stone → craft stone pickaxe'],
    requires: ['story/mine_stone'],
  },
  'story/wood_pickaxe': {
    name: 'Isn\'t It Pick-Blimey',
    description: 'Craft a wooden pickaxe',
    category: 'story',
    difficulty: 1,
    triggers: { action: 'craft', item: 'wooden_pickaxe' },
    hints: ['Chop tree → make planks → make sticks → craft pickaxe'],
  },
  'story/iron_tools': {
    name: 'Acquire Hardware',
    description: 'Smelt an iron ingot',
    category: 'story',
    difficulty: 2,
    triggers: { action: 'smelt', item: 'iron_ingot' },
    hints: ['Find iron ore (Y=0 to Y=64)', 'Mine with stone pickaxe', 'Smelt in furnace with coal'],
  },
  'story/smelt_iron': {
    name: 'Hot Stuff',
    description: 'Get iron from a furnace',
    category: 'story',
    difficulty: 2,
    triggers: { action: 'smelt', item: 'iron_ingot' },
    hints: ['Same as acquire hardware — smelt iron ore'],
  },
  'story/lava_bucket': {
    name: 'Lava Bucket',
    description: 'Use a lava bucket',
    category: 'story',
    difficulty: 3,
    triggers: { action: 'equip', item: 'lava_bucket' },
    hints: ['Craft a bucket (3 iron ingots)', 'Find lava underground', 'Scoop lava with bucket'],
  },
  'story/iron_bucket': {
    name: 'Bukkit',
    description: 'Craft a bucket',
    category: 'story',
    difficulty: 2,
    triggers: { action: 'craft', item: 'bucket' },
    hints: ['Smelt 3 iron ingots', 'Craft bucket: 3 iron in V shape'],
  },
  'story/diamonds': {
    name: 'Diamonds!',
    description: 'Use a diamond',
    category: 'story',
    difficulty: 4,
    triggers: { action: 'pickup', item: 'diamond' },
    hints: ['Mine at Y=-59 to Y=-64 (best diamond level)', 'Use iron pickaxe or better', 'Branch mine for efficiency'],
  },
  'story/enchant_table': {
    name: 'Enchanter',
    description: 'Build an enchanting table',
    category: 'story',
    difficulty: 5,
    triggers: { action: 'craft', item: 'enchanting_table' },
    hints: ['Need 2 diamonds + 4 obsidian + 1 book', 'Mine obsidian with diamond pickaxe', 'Craft book from paper + leather'],
  },
  'story/shiny_gear': {
    name: 'Cover Me with Diamonds',
    description: '装备 diamond armor',
    category: 'story',
    difficulty: 5,
    triggers: { action: 'equip_armor', tier: 'diamond' },
    hints: ['Mine 24 diamonds total', 'Craft diamond helmet (5), chestplate (8), leggings (7), boots (4)'],
  },
  'story/respawn_anchor': {
    name: 'Not Today, Thank You',
    description: 'Build a respawn anchor',
    category: 'story',
    difficulty: 6,
    triggers: { action: 'craft', item: 'respawn_anchor' },
    hints: ['Go to Nether', 'Mine crying obsidian (from piglin bartering)', 'Craft with glowstone'],
  },

  // ══════════════════════════════════════════════════════════════════════════
  // NETHER — Exploration of the Nether
  // ══════════════════════════════════════════════════════════════════════════

  'nether/nether_portal': {
    name: 'We Need to Go Deeper',
    description: 'Build a nether portal',
    category: 'nether',
    difficulty: 3,
    triggers: { action: 'place', block: 'obsidian', count: 10 },
    hints: ['Mine 10 obsidian (diamond pickaxe)', 'Build 4x5 frame', 'Light with flint and steel'],
  },
  'nether/return_to_sender': {
    name: 'Return to Sender',
    description: 'Kill a ghast with its own fireball',
    category: 'nether',
    difficulty: 7,
    triggers: { action: 'kill', mob: 'ghast', method: 'deflect' },
    hints: ['Find ghast in Nether wastes', 'Hit the fireball back at it with sword/bow'],
  },
  'nether/get_wither': {
    name: 'How Did We Get Here?',
    description: 'Get the Withers effect',
    category: 'nether',
    difficulty: 8,
    triggers: { action: 'effect', effect: 'wither' },
    hints: ['Rare — happens from wither skeleton or wither boss'],
  },
  'nether/explore_nether': {
    name: 'Hot Tourist Destination',
    description: 'Visit all Nether biomes',
    category: 'nether',
    difficulty: 4,
    triggers: { action: 'visit_biome', biomes: ['nether_wastes', 'basalt_deltas', 'crimson_forest', 'warped_forest', 'soul_sand_valley'] },
    hints: ['Explore! Nether has 5 biomes'],
  },
  'nether/find_bastion': {
    name: 'War Pigs',
    description: 'Find a bastion remnant',
    category: 'nether',
    difficulty: 3,
    triggers: { action: 'find_structure', structure: 'bastion_remnant' },
    hints: ['Bastions are large blackstone structures', 'Found in all Nether biomes except basalt deltas'],
  },
  'nether/loot_bastion': {
    name: 'Uneasy Alliance',
    description: 'Loot a bastion chest',
    category: 'nether',
    difficulty: 4,
    triggers: { action: 'loot', structure: 'bastion_remnant' },
    hints: ['Find bastion → find chest room → loot it'],
  },

  // ══════════════════════════════════════════════════════════════════════════
  // END — The End dimension
  // ══════════════════════════════════════════════════════════════════════════

  'end/kill_dragon': {
    name: 'Free the End',
    description: 'Defeat the Ender Dragon',
    category: 'end',
    difficulty: 9,
    triggers: { action: 'kill', mob: 'ender_dragon' },
    hints: ['Collect 12 ender eyes', 'Find stronghold', 'Activate end portal', 'Bring beds + bows + diamond gear'],
  },
  'end/end_city': {
    name: 'The End... Again',
    description: 'Find an End City',
    category: 'end',
    difficulty: 7,
    triggers: { action: 'find_structure', structure: 'end_city' },
    hints: ['After killing dragon, jump through end gateway', 'Explore outer End islands'],
  },
  'end/elytra': {
    name: 'Sky High',
    description: 'Find an elytra',
    category: 'end',
    difficulty: 8,
    triggers: { action: 'pickup', item: 'elytra' },
    hints: ['Find End Ship in End City', 'Elytra in item frame on ship'],
  },

  // ══════════════════════════════════════════════════════════════════════════
  // ADVENTURE — Exploration & discovery
  // ══════════════════════════════════════════════════════════════════════════

  'adventure/voluntary_exile': {
    name: 'Voluntary Exile',
    description: 'Kill a raid captain',
    category: 'adventure',
    difficulty: 4,
    triggers: { action: 'kill', mob: 'pillager', hasOminousBanner: true },
    hints: ['Find pillager patrol', 'Kill the captain (banner on head)'],
  },
  'adventure/hero_of_the_village': {
    name: 'Hero of the Village',
    description: 'Successfully defend a village from a raid',
    category: 'adventure',
    difficulty: 7,
    triggers: { action: 'complete_raid' },
    hints: ['Trigger raid by killing captain', 'Defend village from waves of pillagers'],
  },
  'adventure/whos_the_pillager': {
    name: 'Who\'s the Pillager Now?',
    description: 'Give a pillager a taste of their own medicine',
    category: 'adventure',
    difficulty: 5,
    triggers: { action: 'kill', mob: 'pillager', weapon: 'crossbow' },
    hints: ['Kill pillager with their own crossbow'],
  },
  'adventure/arbalistic': {
    name: 'Arbalistic',
    description: 'Kill 5 unique mobs with a crossbow',
    category: 'adventure',
    difficulty: 6,
    triggers: { action: 'kill_with_crossbow', uniqueMobs: 5 },
    hints: ['Craft crossbow (3 sticks, 3 string, 1 iron ingot, 2 tripwire hooks)'],
  },
  'adventure/snipering': {
    name: 'Sniper Duel',
    description: 'Kill a skeleton from 50+ blocks away',
    category: 'adventure',
    difficulty: 5,
    triggers: { action: 'kill', mob: 'skeleton', distance: 50 },
    hints: ['Find skeleton at night', 'Back up 50 blocks', 'Headshot with bow'],
  },
  'adventure/two_birds': {
    name: 'Two Birds, One Arrow',
    description: 'Kill two phantoms with one arrow',
    category: 'adventure',
    difficulty: 7,
    triggers: { action: 'kill', mob: 'phantom', method: 'multikill', count: 2 },
    hints: ['Don\'t sleep for 3+ nights', 'Phantoms spawn at night', 'Line them up'],
  },
  'adventure/kill_all_mobs': {
    name: 'Monsters Hunted',
    description: 'Kill every hostile mob type',
    category: 'adventure',
    difficulty: 8,
    triggers: { action: 'kill_all_hostile' },
    hints: ['Zombie, skeleton, spider, creeper, witch, phantom, drowned, enderman, blaze, ghast, slime, cave_spider, silverfish, wither_skeleton, blaze, guardian, elder_guardian, evoker, vindicator, ravager, pillager, vindicator'],
  },

  // ══════════════════════════════════════════════════════════════════════════
  // HUSBANDRY — Farming, animals, food
  // ══════════════════════════════════════════════════════════════════════════

  'husbandry/plant_seed': {
    name: 'A Seedy Situation',
    description: 'Plant a seed',
    category: 'husbandry',
    difficulty: 1,
    triggers: { action: 'place', block: 'wheat_seeds' },
    hints: ['Break grass for seeds', 'Hoe dirt into farmland', 'Place seeds'],
  },
  'husbandry/harvest_crop': {
    name: 'Harvesting Bonanza',
    description: 'Harvest a fully grown crop',
    category: 'husbandry',
    difficulty: 1,
    triggers: { action: 'harvest', crop: 'wheat' },
    hints: ['Plant seeds, wait for full growth, break crop'],
  },
  'husbandry/slaughter_animal': {
    name: 'Cow Tipper',
    description: 'Kill a cow',
    category: 'husbandry',
    difficulty: 1,
    triggers: { action: 'kill', mob: 'cow' },
    hints: ['Find cow, punch it'],
  },
  'husbandry/breed_animal': {
    name: 'The Birds and the Bees',
    description: 'Breed two animals',
    category: 'husbandry',
    difficulty: 2,
    triggers: { action: 'breed' },
    hints: ['Get two of same animal', 'Feed them wheat/carrots', 'They make a baby!'],
  },
  'husbandry/tame_animal': {
    name: 'Best Friends Forever',
    description: 'Tame an animal',
    category: 'husbandry',
    difficulty: 2,
    triggers: { action: 'tame' },
    hints: ['Wolf: bones, Cat: raw fish, Horse: repeated mounting'],
  },
  'husbandry/fish': {
    name: 'Delicious Fish',
    description: 'Catch a fish',
    category: 'husbandry',
    difficulty: 1,
    triggers: { action: 'catch', item: 'cod' },
    hints: ['Craft fishing rod', 'Use near water', 'Wait for bobber to dip'],
  },
  'husbandry/breed_all_animals': {
    name: 'Two by Two',
    description: 'Breed every breedable animal',
    category: 'husbandry',
    difficulty: 5,
    triggers: { action: 'breed_all' },
    hints: ['Cow, pig, sheep, chicken, rabbit, horse, donkey, llama, fox, cat, wolf, turtle, bee, panda, goat, frog, camel, sniffer, armadillo'],
  },
  'husbandry/fill_cauldron': {
    name: 'Fill Me With potion',
    description: 'Fill a cauldron with potion',
    category: 'husbandry',
    difficulty: 3,
    triggers: { action: 'fill_cauldron', content: 'potion' },
    hints: ['Craft cauldron (7 iron ingots)', 'Brew potion', 'Pour into cauldron'],
  },

  // ══════════════════════════════════════════════════════════════════════════
  // REDSTONE — Technical achievements
  // ══════════════════════════════════════════════════════════════════════════

  'redstone/redstone': {
    name: 'Redstone',
    description: 'Mine redstone ore',
    category: 'redstone',
    difficulty: 2,
    triggers: { action: 'mine', block: 'redstone_ore' },
    hints: ['Find redstone ore (Y=-64 to Y=16)', 'Mine with iron pickaxe'],
  },
  'redstone/into_the_nether': {
    name: 'Into the Nether',
    description: 'Enter the Nether',
    category: 'redstone',
    difficulty: 3,
    triggers: { action: 'enter_dimension', dimension: 'nether' },
    hints: ['Build obsidian portal', 'Light with flint and steel'],
  },
  'redstone/blink': {
    name: 'Blink',
    description: 'Obtain an observer',
    category: 'redstone',
    difficulty: 3,
    triggers: { action: 'craft', item: 'observer' },
    hints: ['Craft observer: 6 cobblestone + 2 redstone + 1 nether quartz'],
  },

  // ══════════════════════════════════════════════════════════════════════════
  // CHALLENGES — Difficult feats
  // ══════════════════════════════════════════════════════════════════════════

  'challenge/kill_all_mobs': {
    name: 'Monsters Hunted',
    description: 'Kill every hostile mob type',
    category: 'challenge',
    difficulty: 9,
    triggers: { action: 'kill_all_hostile' },
    hints: ['The ultimate combat challenge — kill every mob type'],
  },
  'challenge/trade_everything': {
    name: 'What a Deal',
    description: 'Trade with every villager profession',
    category: 'challenge',
    difficulty: 7,
    triggers: { action: 'trade_all_professions' },
    hints: ['All 15 professions: armorer, butcher, cartographer, cleric, farmer, fisherman, fletcher, leatherworker, librarian, mason, nitwit, shepherd, toolsmith, weaponsmith, cat'],
  },
  'challenge/emerald': {
    name: 'Star Trader',
    description: 'Trade with a villager at the highest level',
    category: 'challenge',
    difficulty: 5,
    triggers: { action: 'trade', villagerLevel: 'master' },
    hints: ['Trade repeatedly with same villager to level them up'],
  },
  'challenge/five_roads': {
    name: 'Five Advancements',
    description: 'Unlock 5 advancements',
    category: 'challenge',
    difficulty: 1,
    triggers: { action: 'advancement_count', count: 5 },
    hints: ['Just play the game and do things!'],
  },
  'challenge/adventuring_time': {
    name: 'Adventuring Time',
    description: 'Visit every biome',
    category: 'challenge',
    difficulty: 8,
    triggers: { action: 'visit_all_biomes' },
    hints: ['There are 60+ biomes across all dimensions', 'Need to visit rivers, oceans, forests, deserts, mountains, etc.'],
  },
  'challenge/very_knowledgeable': {
    name: 'Very Knowledgeable',
    description: 'Unlock 50 advancements',
    category: 'challenge',
    difficulty: 9,
    triggers: { action: 'advancement_count', count: 50 },
    hints: ['The ultimate completionist challenge'],
  },

  // ══════════════════════════════════════════════════════════════════════════
  // ACHIEVEMENTS — Special milestones
  // ══════════════════════════════════════════════════════════════════════════

  'achievement/take_inventory': {
    name: 'Taking Inventory',
    description: 'Open your inventory',
    category: 'achievement',
    difficulty: 1,
    triggers: { action: 'open_inventory' },
    hints: ['Press E on Java, tap ... on Pocket'],
  },
  'achievement/mine_diamond': {
    name: 'DIAMONDS!',
    description: 'Mine a diamond ore',
    category: 'achievement',
    difficulty: 4,
    triggers: { action: 'mine', block: 'diamond_ore' },
    hints: ['Mine at Y=-59 with iron pickaxe'],
  },
  'achievement/enchant_item': {
    name: 'Enchanter',
    description: 'Enchant an item',
    category: 'achievement',
    difficulty: 5,
    triggers: { action: 'enchant' },
    hints: ['Build enchanting table', 'Surround with bookshelves', 'Use lapis lazuli + XP'],
  },
  'achievement/nether_portal': {
    name: 'We Need to Go Deeper',
    description: 'Enter the Nether',
    category: 'achievement',
    difficulty: 3,
    triggers: { action: 'enter_dimension', dimension: 'nether' },
    hints: ['Build obsidian frame', 'Light with flint and steel'],
  },
  'achievement/enter_end': {
    name: 'The End?',
    description: 'Enter the End dimension',
    category: 'achievement',
    difficulty: 6,
    triggers: { action: 'enter_dimension', dimension: 'end' },
    hints: ['Find stronghold', 'Fill end portal frames with eyes of ender'],
  },
  'achievement/dragon_egg': {
    name: 'The Next Generation',
    description: 'Obtain the dragon egg',
    category: 'achievement',
    difficulty: 9,
    triggers: { action: 'pickup', item: 'dragon_egg' },
    hints: ['Kill dragon', 'Place piston facing egg', 'Activate piston to push egg'],
  },
  'achievement/kill_dragon': {
    name: 'Free the End',
    description: 'Kill the Ender Dragon',
    category: 'achievement',
    difficulty: 9,
    triggers: { action: 'kill', mob: 'ender_dragon' },
    hints: ['Full diamond gear, bow, beds, ender pearls', 'Destroy end crystals first'],
  },
}

// ══════════════════════════════════════════════════════════════════════════════
// Advancement Tracker
// ══════════════════════════════════════════════════════════════════════════════

class AdvancementTracker {
  constructor() {
    this.completed = {}
    this.mobKills = {}          // { mobName: { count, lastKill, locations, weapons } }
    this.blocksMined = {}       // { blockName: { count, locations, tools } }
    this.itemsCrafted = {}      // { itemName: { count, lastCrafted } }
    this.itemsSmelted = {}      // { itemName: { count } }
    this.biomesVisited = {}     // { biomeName: { firstVisit, lastVisit } }
    this.structuresFound = {}   // { structureName: { firstFound, location } }
    this.dimensionsEntered = new Set()
    this.tradingPartners = {}   // { profession: { count, lastTrade } }
    this.distanceKills = {}     // { mobName: [distances] } for sniper achievements
    this.killsByMethod = {}     // { "mob+method": count } for special kills
    this.totalAdvancements = Object.keys(ADVANCEMENTS).length
    this.progressLog = []       // recent advancement progress for LLM
  }

  // ── Tracking events with metadata ──
  trackKill(mobName, meta) {
    meta = meta || {}
    if (!this.mobKills[mobName]) this.mobKills[mobName] = { count: 0, lastKill: 0, locations: [], weapons: [] }
    const k = this.mobKills[mobName]
    k.count++
    k.lastKill = Date.now()
    if (meta.location) k.locations.push(meta.location)
    if (k.locations.length > 10) k.locations.shift()
    if (meta.weapon) {
      if (!k.weapons.includes(meta.weapon)) k.weapons.push(meta.weapon)
    }

    // Track distance for sniper achievements
    if (meta.distance) {
      if (!this.distanceKills[mobName]) this.distanceKills[mobName] = []
      this.distanceKills[mobName].push(meta.distance)
      if (this.distanceKills[mobName].length > 10) this.distanceKills[mobName].shift()
    }

    // Track method (deflect, etc.)
    if (meta.method) {
      const key = `${mobName}+${meta.method}`
      this.killsByMethod[key] = (this.killsByMethod[key] || 0) + 1
    }
  }

  trackMine(blockName, meta) {
    meta = meta || {}
    if (!this.blocksMined[blockName]) this.blocksMined[blockName] = { count: 0, locations: [], tools: [] }
    const b = this.blocksMined[blockName]
    b.count++
    if (meta.location) b.locations.push(meta.location)
    if (b.locations.length > 10) b.locations.shift()
    if (meta.tool && !b.tools.includes(meta.tool)) b.tools.push(meta.tool)
  }

  trackCraft(itemName) {
    if (!this.itemsCrafted[itemName]) this.itemsCrafted[itemName] = { count: 0, lastCrafted: 0 }
    this.itemsCrafted[itemName].count++
    this.itemsCrafted[itemName].lastCrafted = Date.now()
  }

  trackSmelt(itemName) {
    if (!this.itemsSmelted[itemName]) this.itemsSmelted[itemName] = { count: 0 }
    this.itemsSmelted[itemName].count++
  }

  trackBiome(biomeName) {
    if (!this.biomesVisited[biomeName]) {
      this.biomesVisited[biomeName] = { firstVisit: Date.now(), lastVisit: Date.now() }
    } else {
      this.biomesVisited[biomeName].lastVisit = Date.now()
    }
  }

  trackStructure(structureName, meta) {
    meta = meta || {}
    if (!this.structuresFound[structureName]) {
      this.structuresFound[structureName] = { firstFound: Date.now(), location: meta.location || null }
    }
  }

  trackDimension(dimensionName) {
    this.dimensionsEntered.add(dimensionName)
  }

  trackTrading(profession) {
    if (!this.tradingPartners[profession]) this.tradingPartners[profession] = { count: 0, lastTrade: 0 }
    this.tradingPartners[profession].count++
    this.tradingPartners[profession].lastTrade = Date.now()
  }

  // ── Check for completions ──
  checkAdvancements() {
    const newlyCompleted = []

    for (const [id, adv] of Object.entries(ADVANCEMENTS)) {
      if (this.completed[id]) continue
      if (adv.requires && adv.requires.some(r => !this.completed[r])) continue

      let completed = false
      const t = adv.triggers

      switch (t.action) {
        case 'mine': {
          const b = this.blocksMined[t.block]
          if (b && (!t.count || b.count >= t.count)) completed = true
          break
        }
        case 'kill': {
          const k = this.mobKills[t.mob]
          if (k && (!t.count || k.count >= t.count)) {
            if (t.distance) {
              // Check if any kill was at the required distance
              const longShot = this.distanceKills[t.mob]?.some(d => d >= t.distance)
              if (longShot) completed = true
            } else if (t.method) {
              const key = `${t.mob}+${t.method}`
              if (this.killsByMethod[key] && this.killsByMethod[key] > 0) completed = true
            } else {
              completed = true
            }
          }
          break
        }
        case 'craft': {
          const c = this.itemsCrafted[t.item]
          if (c) {
            if (t.minTier) {
              // Check if crafted item matches tier
              const tierMap = { wood: 'wooden', stone: 'stone', iron: 'iron', gold: 'golden', diamond: 'diamond', netherite: 'netherite' }
              const tierPrefix = tierMap[t.minTier] || t.minTier
              if (t.item.includes(tierPrefix)) completed = true
            } else {
              completed = true
            }
          }
          break
        }
        case 'smelt':
          if (this.itemsSmelted[t.item]) completed = true
          break
        case 'visit_biome':
          if (t.biomes.every(b => this.biomesVisited[b])) completed = true
          break
        case 'find_structure':
          if (this.structuresFound[t.structure]) completed = true
          break
        case 'enter_dimension':
          if (this.dimensionsEntered.has(t.dimension)) completed = true
          break
        case 'kill_all_hostile': {
          const hostiles = ['zombie','skeleton','spider','creeper','witch','phantom','drowned',
            'blaze','slime','cave_spider','silverfish','enderman','ghast','magma_cube',
            'wither_skeleton','guardian','elder_guardian','evoker','vindicator','ravager','pillager']
          if (hostiles.every(m => this.mobKills[m] && this.mobKills[m].count > 0)) completed = true
          break
        }
        case 'visit_all_biomes': {
          const allBiomes = ['plains','forest','desert','mountains','ocean','river','swamp','taiga',
            'jungle','badlands','mushroom_fields','savanna','snowy_tundra','frozen_ocean','nether_wastes',
            'crimson_forest','warped_forest','soul_sand_valley','basalt_deltas']
          if (allBiomes.every(b => this.biomesVisited[b])) completed = true
          break
        }
        case 'advancement_count':
          if (Object.keys(this.completed).length >= t.count) completed = true
          break
      }

      if (completed) {
        this.completed[id] = { time: Date.now() }
        newlyCompleted.push({ id, ...adv })
        this.progressLog.push({ text: `🏆 ${adv.name}`, time: Date.now() })
        if (this.progressLog.length > 20) this.progressLog.shift()
      }
    }

    return newlyCompleted
  }

  // ── What to do next? ──
  getNextGoals(count) {
    count = count || 5
    const goals = []

    for (const [id, adv] of Object.entries(ADVANCEMENTS)) {
      if (this.completed[id]) continue
      const prereqMet = !adv.requires || adv.requires.every(r => this.completed[r])
      if (!prereqMet) continue

      // Calculate partial progress
      let progress = 0
      let totalNeeded = 1
      const t = adv.triggers
      if (t.action === 'kill' && t.count) {
        const k = this.mobKills[t.mob]
        progress = k ? Math.min(k.count, t.count) : 0
        totalNeeded = t.count
      } else if (t.action === 'mine' && t.count) {
        const b = this.blocksMined[t.block]
        progress = b ? Math.min(b.count, t.count) : 0
        totalNeeded = t.count
      } else if (t.action === 'kill_all_hostile') {
        const hostiles = ['zombie','skeleton','spider','creeper','witch','phantom','drowned','blaze','slime','enderman','ghast']
        const killed = hostiles.filter(m => this.mobKills[m] && this.mobKills[m].count > 0).length
        progress = killed
        totalNeeded = hostiles.length
      }

      goals.push({
        id,
        name: adv.name,
        description: adv.description,
        difficulty: adv.difficulty,
        category: adv.category,
        hints: adv.hints,
        progress,
        totalNeeded,
        percentComplete: Math.round((progress / totalNeeded) * 100),
      })
    }

    // Sort: closest to completion first, then by difficulty
    goals.sort((a, b) => {
      if (a.percentComplete > 0 && b.percentComplete === 0) return -1
      if (a.percentComplete === 0 && b.percentComplete > 0) return 1
      if (a.percentComplete !== b.percentComplete) return b.percentComplete - a.percentComplete
      return a.difficulty - b.difficulty
    })

    return goals.slice(0, count)
  }

  // ── Context for LLM ──
  getAdvancementContext() {
    const completed = Object.keys(this.completed).length
    const total = this.totalAdvancements
    const percent = Math.round((completed / total) * 100)

    const lines = [`=== ADVANCEMENTS ===`, `Completed: ${completed}/${total} (${percent}%)`]

    const nextGoals = this.getNextGoals(5)
    if (nextGoals.length) {
      lines.push(`\nNEXT GOALS:`)
      for (const g of nextGoals) {
        const prog = g.percentComplete > 0 ? ` [${g.percentComplete}% done]` : ''
        lines.push(`- ${g.name}: ${g.description}${prog} [${g.category}, diff ${g.difficulty}/10]`)
        if (g.hints && g.hints[0]) lines.push(`  Hint: ${g.hints[0]}`)
      }
    }

    // Recent completions
    const recent = this.progressLog.slice(-3)
    if (recent.length) {
      lines.push(`\nRECENT:`)
      recent.forEach(r => lines.push(`- ${r.text} ✓`))
    }

    // Kill stats for combat advancements
    const killEntries = Object.entries(this.mobKills)
      .filter(([_, k]) => k.count > 0)
      .sort((a, b) => b[1].count - a[1].count)
      .slice(0, 5)
    if (killEntries.length) {
      lines.push(`\nMOB KILLS: ${killEntries.map(([m, k]) => `${m}x${k.count}`).join(', ')}`)
    }

    return lines.join('\n')
  }

  // ── Generic action tracker — dispatches to specific trackers ──────────────
  trackAction(tool, result, personality) {
    if (!result || result.startsWith('Error')) return
    const lower = result.toLowerCase()
    if (tool === 'attack' || lower.includes('killed') || lower.includes('attacked')) {
      const mob = lower.replace(/.*fought\s+/, '').replace(/.*attacked\s+/, '').replace(/.*killed\s+/, '').trim().split(' ')[0]
      if (mob) this.trackKill(mob, { weapon: 'hand' })
    }
    if (tool === 'mine' || lower.includes('mined')) {
      const block = lower.replace(/.*mined\s+/, '').replace(/.*dug\s+/, '').trim().split(' ')[0]
      if (block) this.trackMine(block, {})
    }
    if (tool === 'craft' || lower.includes('crafted')) {
      const item = lower.replace(/.*crafted\s+/, '').trim().split(' ')[0]
      if (item) this.trackCraft(item)
    }
    if (tool === 'smelt' || lower.includes('smelted')) {
      const item = lower.replace(/.*smelted\s+/, '').trim().split(' ')[0]
      if (item) this.trackSmelt(item)
    }
  }

  // ── Persistence ──
  toJSON() {
    return {
      completed: this.completed,
      mobKills: this.mobKills,
      blocksMined: this.blocksMined,
      itemsCrafted: this.itemsCrafted,
      itemsSmelted: this.itemsSmelted,
      biomesVisited: this.biomesVisited,
      structuresFound: this.structuresFound,
      dimensionsEntered: [...this.dimensionsEntered],
      tradingPartners: this.tradingPartners,
      distanceKills: this.distanceKills,
      killsByMethod: this.killsByMethod,
      progressLog: this.progressLog.slice(-20),
    }
  }

  loadJSON(data) {
    if (!data) return
    if (data.completed) this.completed = data.completed
    if (data.mobKills) this.mobKills = data.mobKills
    if (data.blocksMined) this.blocksMined = data.blocksMined
    if (data.itemsCrafted) this.itemsCrafted = data.itemsCrafted
    if (data.itemsSmelted) this.itemsSmelted = data.itemsSmelted
    if (data.biomesVisited) this.biomesVisited = data.biomesVisited
    if (data.structuresFound) this.structuresFound = data.structuresFound
    if (data.dimensionsEntered) this.dimensionsEntered = new Set(data.dimensionsEntered)
    if (data.tradingPartners) this.tradingPartners = data.tradingPartners
    if (data.distanceKills) this.distanceKills = data.distanceKills
    if (data.killsByMethod) this.killsByMethod = data.killsByMethod
    if (data.progressLog) this.progressLog = data.progressLog
  }
}

module.exports = { ADVANCEMENTS, AdvancementTracker }
