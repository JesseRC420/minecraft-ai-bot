// ── Crafting Recipe Database ────────────────────────────────────────────────
// Complete MC 1.21.1 reference for the bot to look up how to craft anything.
// Organized by category. Each recipe has: materials, and station.
// Stone tools accept ANY stone-tier block (cobblestone, andesite, diorite, granite, etc.)

const RECIPES = {
  // ══════════════════════════════════════════════════════════════════════════
  // BASIC MATERIALS (the foundation of everything)
  // ══════════════════════════════════════════════════════════════════════════

  // ── Planks (from any log) ──
  'oak_planks':      { materials: { 'oak_log': 1 }, station: 'hand', gives: 4 },
  'birch_planks':    { materials: { 'birch_log': 1 }, station: 'hand', gives: 4 },
  'spruce_planks':   { materials: { 'spruce_log': 1 }, station: 'hand', gives: 4 },
  'jungle_planks':   { materials: { 'jungle_log': 1 }, station: 'hand', gives: 4 },
  'dark_oak_planks': { materials: { 'dark_oak_log': 1 }, station: 'hand', gives: 4 },
  'acacia_planks':   { materials: { 'acacia_log': 1 }, station: 'hand', gives: 4 },

  // ── Sticks ──
  'stick': { materials: { 'oak_planks': 2 }, station: 'hand', gives: 4 },

  // ── Torches ──
  'torch': { materials: { 'coal': 1, 'stick': 1 }, station: 'hand', gives: 4 },

  // ── Crafting & Smelting ──
  'crafting_table': { materials: { 'oak_planks': 4 }, station: 'hand' },
  'furnace':        { materials: { 'cobblestone': 8 }, station: 'hand' },
  'chest':          { materials: { 'oak_planks': 8 }, station: 'hand' },

  // ── Block Compression (9 items → 1 block) ──
  'iron_block':   { materials: { 'iron_ingot': 9 }, station: 'hand' },
  'gold_block':   { materials: { 'gold_ingot': 9 }, station: 'hand' },
  'diamond_block': { materials: { 'diamond': 9 }, station: 'hand' },
  'lapis_block':  { materials: { 'lapis_lazuli': 9 }, station: 'hand' },
  'emerald_block': { materials: { 'emerald': 9 }, station: 'hand' },
  'coal_block':   { materials: { 'coal': 9 }, station: 'hand' },
  'raw_iron_block':   { materials: { 'raw_iron': 9 }, station: 'hand' },
  'raw_gold_block':   { materials: { 'raw_gold': 9 }, station: 'hand' },
  'raw_copper_block': { materials: { 'raw_copper': 9 }, station: 'hand' },
  'copper_block': { materials: { 'copper_ingot': 9 }, station: 'hand' },
  'netherite_block': { materials: { 'netherite_ingot': 9 }, station: 'hand' },

  // ── Block Decompression (1 block → 9 items) ──
  'iron_ingot_from_block':   { materials: { 'iron_block': 1 }, station: 'hand', gives: 9, output: 'iron_ingot' },
  'gold_ingot_from_block':   { materials: { 'gold_block': 1 }, station: 'hand', gives: 9, output: 'gold_ingot' },
  'diamond_from_block':      { materials: { 'diamond_block': 1 }, station: 'hand', gives: 9, output: 'diamond' },
  'lapis_from_block':        { materials: { 'lapis_block': 1 }, station: 'hand', gives: 9, output: 'lapis_lazuli' },
  'emerald_from_block':      { materials: { 'emerald_block': 1 }, station: 'hand', gives: 9, output: 'emerald' },
  'coal_from_block':         { materials: { 'coal_block': 1 }, station: 'hand', gives: 9, output: 'coal' },
  'copper_ingot_from_block': { materials: { 'copper_block': 1 }, station: 'hand', gives: 9, output: 'copper_ingot' },
  'netherite_ingot_from_block': { materials: { 'netherite_block': 1 }, station: 'hand', gives: 9, output: 'netherite_ingot' },

  // ── Nugget ↔ Ingot ──
  'iron_nugget_from_ingot':   { materials: { 'iron_ingot': 1 }, station: 'hand', gives: 9, output: 'iron_nugget' },
  'gold_nugget_from_ingot':   { materials: { 'gold_ingot': 1 }, station: 'hand', gives: 9, output: 'gold_nugget' },
  'iron_ingot_from_nugget':   { materials: { 'iron_nugget': 9 }, station: 'hand', gives: 1, output: 'iron_ingot' },
  'gold_ingot_from_nugget':   { materials: { 'gold_nugget': 9 }, station: 'hand', gives: 1, output: 'gold_ingot' },
  'copper_nugget_from_ingot': { materials: { 'copper_ingot': 1 }, station: 'hand', gives: 9, output: 'copper_nugget' },
  'copper_ingot_from_nugget': { materials: { 'copper_nugget': 9 }, station: 'hand', gives: 1, output: 'copper_ingot' },

  // ── Lapis from block ──
  'lapis_lazuli_from_block': { materials: { 'lapis_block': 1 }, station: 'hand', gives: 9, output: 'lapis_lazuli' },

  // ── Bone Meal ──
  'bone_meal': { materials: { 'bone': 1 }, station: 'hand', gives: 3 },

  // ══════════════════════════════════════════════════════════════════════════
  // TOOLS — Tiered: wood → stone → iron → golden → diamond → netherite
  // Stone tools accept ANY stone-tier block (cobblestone, andesite, diorite, granite, tuff, deepslate)
  // ══════════════════════════════════════════════════════════════════════════

  // ── Pickaxes ──
  'wooden_pickaxe':    { materials: { 'oak_planks': 3, 'stick': 2 }, station: 'hand', tier: 'wood',   mining: 1, durability: 59,  speed: 2.0 },
  'stone_pickaxe':     { materials: { 'cobblestone': 3, 'stick': 2 }, station: 'hand', tier: 'stone', mining: 1, durability: 131, speed: 4.0 },
  'iron_pickaxe':      { materials: { 'iron_ingot': 3, 'stick': 2 },  station: 'hand', tier: 'iron',  mining: 2, durability: 250, speed: 6.0 },
  'golden_pickaxe':    { materials: { 'gold_ingot': 3, 'stick': 2 },  station: 'hand', tier: 'gold',  mining: 2, durability: 33,  speed: 12.0 },
  'diamond_pickaxe':   { materials: { 'diamond': 3, 'stick': 2 },     station: 'hand', tier: 'diamond', mining: 3, durability: 1561, speed: 8.0 },
  'netherite_pickaxe': { materials: { 'netherite_ingot': 3, 'stick': 2 }, station: 'hand', tier: 'netherite', mining: 4, durability: 2031, speed: 9.0 },

  // ── Axes ──
  'wooden_axe':    { materials: { 'oak_planks': 3, 'stick': 2 }, station: 'hand', tier: 'wood',   chopping: 1, durability: 59,  speed: 2.0 },
  'stone_axe':     { materials: { 'cobblestone': 3, 'stick': 2 }, station: 'hand', tier: 'stone', chopping: 1, durability: 131, speed: 4.0 },
  'iron_axe':      { materials: { 'iron_ingot': 3, 'stick': 2 },  station: 'hand', tier: 'iron',  chopping: 2, durability: 250, speed: 6.0 },
  'golden_axe':    { materials: { 'gold_ingot': 3, 'stick': 2 },  station: 'hand', tier: 'gold',  chopping: 2, durability: 33,  speed: 8.0 },
  'diamond_axe':   { materials: { 'diamond': 3, 'stick': 2 },     station: 'hand', tier: 'diamond', chopping: 3, durability: 1561, speed: 8.0 },
  'netherite_axe': { materials: { 'netherite_ingot': 3, 'stick': 2 }, station: 'hand', tier: 'netherite', chopping: 4, durability: 2031, speed: 9.0 },

  // ── Shovels ──
  'wooden_shovel':    { materials: { 'oak_planks': 1, 'stick': 2 }, station: 'hand', tier: 'wood',   digging: 1, durability: 59,  speed: 2.0 },
  'stone_shovel':     { materials: { 'cobblestone': 1, 'stick': 2 }, station: 'hand', tier: 'stone', digging: 1, durability: 131, speed: 4.0 },
  'iron_shovel':      { materials: { 'iron_ingot': 1, 'stick': 2 },  station: 'hand', tier: 'iron',  digging: 2, durability: 250, speed: 6.0 },
  'golden_shovel':    { materials: { 'gold_ingot': 1, 'stick': 2 },  station: 'hand', tier: 'gold',  digging: 2, durability: 33,  speed: 8.0 },
  'diamond_shovel':   { materials: { 'diamond': 1, 'stick': 2 },     station: 'hand', tier: 'diamond', digging: 3, durability: 1561, speed: 8.0 },
  'netherite_shovel': { materials: { 'netherite_ingot': 1, 'stick': 2 }, station: 'hand', tier: 'netherite', digging: 4, durability: 2031, speed: 9.0 },

  // ── Hoes ──
  'wooden_hoe':    { materials: { 'oak_planks': 2, 'stick': 2 }, station: 'hand', tier: 'wood',   durability: 59 },
  'stone_hoe':     { materials: { 'cobblestone': 2, 'stick': 2 }, station: 'hand', tier: 'stone', durability: 131 },
  'iron_hoe':      { materials: { 'iron_ingot': 2, 'stick': 2 },  station: 'hand', tier: 'iron',  durability: 250 },
  'golden_hoe':    { materials: { 'gold_ingot': 2, 'stick': 2 },  station: 'hand', tier: 'gold',  durability: 33 },
  'diamond_hoe':   { materials: { 'diamond': 2, 'stick': 2 },     station: 'hand', tier: 'diamond', durability: 1561 },
  'netherite_hoe': { materials: { 'netherite_ingot': 2, 'stick': 2 }, station: 'hand', tier: 'netherite', durability: 2031 },

  // ── Swords ──
  'wooden_sword':    { materials: { 'oak_planks': 2, 'stick': 1 }, station: 'hand', tier: 'wood',   damage: 4, durability: 59 },
  'stone_sword':     { materials: { 'cobblestone': 2, 'stick': 1 }, station: 'hand', tier: 'stone', damage: 5, durability: 131 },
  'iron_sword':      { materials: { 'iron_ingot': 2, 'stick': 1 },  station: 'hand', tier: 'iron',  damage: 6, durability: 250 },
  'golden_sword':    { materials: { 'gold_ingot': 2, 'stick': 1 },  station: 'hand', tier: 'gold',  damage: 4, durability: 32 },
  'diamond_sword':   { materials: { 'diamond': 2, 'stick': 1 },     station: 'hand', tier: 'diamond', damage: 7, durability: 1561 },
  'netherite_sword': { materials: { 'netherite_ingot': 2, 'stick': 1 }, station: 'hand', tier: 'netherite', damage: 8, durability: 2031 },

  // ══════════════════════════════════════════════════════════════════════════
  // ARMOR — Tiered: leather → iron → golden → diamond → netherite
  // ══════════════════════════════════════════════════════════════════════════

  // ── Helmets ──
  'leather_helmet':    { materials: { 'leather': 5 },           station: 'hand', tier: 'leather', defense: 1, durability: 55 },
  'iron_helmet':       { materials: { 'iron_ingot': 5 },        station: 'hand', tier: 'iron',    defense: 2, durability: 363 },
  'golden_helmet':     { materials: { 'gold_ingot': 5 },        station: 'hand', tier: 'gold',    defense: 2, durability: 77 },
  'diamond_helmet':    { materials: { 'diamond': 5 },           station: 'hand', tier: 'diamond', defense: 3, durability: 528 },
  'netherite_helmet':  { materials: { 'netherite_ingot': 1 },   station: 'hand', tier: 'netherite', defense: 3, durability: 407, upgrade: 'diamond_helmet' },

  // ── Chestplates ──
  'leather_chestplate':    { materials: { 'leather': 8 },           station: 'hand', tier: 'leather', defense: 3, durability: 80 },
  'iron_chestplate':       { materials: { 'iron_ingot': 8 },        station: 'hand', tier: 'iron',    defense: 6, durability: 528 },
  'golden_chestplate':     { materials: { 'gold_ingot': 8 },        station: 'hand', tier: 'gold',    defense: 5, durability: 112 },
  'diamond_chestplate':    { materials: { 'diamond': 8 },           station: 'hand', tier: 'diamond', defense: 8, durability: 528 },
  'netherite_chestplate':  { materials: { 'netherite_ingot': 1 },   station: 'hand', tier: 'netherite', defense: 8, durability: 616, upgrade: 'diamond_chestplate' },

  // ── Leggings ──
  'leather_leggings':    { materials: { 'leather': 7 },           station: 'hand', tier: 'leather', defense: 2, durability: 75 },
  'iron_leggings':       { materials: { 'iron_ingot': 7 },        station: 'hand', tier: 'iron',    defense: 5, durability: 495 },
  'golden_leggings':     { materials: { 'gold_ingot': 7 },        station: 'hand', tier: 'gold',    defense: 3, durability: 105 },
  'diamond_leggings':    { materials: { 'diamond': 7 },           station: 'hand', tier: 'diamond', defense: 6, durability: 495 },
  'netherite_leggings':  { materials: { 'netherite_ingot': 1 },   station: 'hand', tier: 'netherite', defense: 6, durability: 585, upgrade: 'diamond_leggings' },

  // ── Boots ──
  'leather_boots':    { materials: { 'leather': 4 },           station: 'hand', tier: 'leather', defense: 1, durability: 65 },
  'iron_boots':       { materials: { 'iron_ingot': 4 },        station: 'hand', tier: 'iron',    defense: 2, durability: 429 },
  'golden_boots':     { materials: { 'gold_ingot': 4 },        station: 'hand', tier: 'gold',    defense: 1, durability: 91 },
  'diamond_boots':    { materials: { 'diamond': 4 },           station: 'hand', tier: 'diamond', defense: 3, durability: 429 },
  'netherite_boots':  { materials: { 'netherite_ingot': 1 },   station: 'hand', tier: 'netherite', defense: 3, durability: 514, upgrade: 'diamond_boots' },

  // ── Horse Armor (leather only, rest are loot-only) ──
  'leather_horse_armor': { materials: { 'leather': 7 }, station: 'hand' },

  // ══════════════════════════════════════════════════════════════════════════
  // SLABS, STAIRS & WALLS
  // ══════════════════════════════════════════════════════════════════════════

  'oak_slab':       { materials: { 'oak_planks': 3 }, station: 'hand', gives: 6 },
  'stone_slab':     { materials: { 'smooth_stone': 3 }, station: 'hand', gives: 6 },
  'cobblestone_slab': { materials: { 'cobblestone': 3 }, station: 'hand', gives: 6 },
  'oak_stairs':     { materials: { 'oak_planks': 6 }, station: 'hand', gives: 4 },
  'cobblestone_stairs': { materials: { 'cobblestone': 6 }, station: 'hand', gives: 4 },
  'stone_brick_slab': { materials: { 'stone_bricks': 3 }, station: 'hand', gives: 6 },

  // ── Fences & Gates ──
  'oak_fence':      { materials: { 'oak_planks': 4, 'stick': 2 }, station: 'hand', gives: 3 },
  'oak_fence_gate': { materials: { 'stick': 4, 'oak_planks': 2 }, station: 'hand' },

  // ── Doors ──
  'oak_door':  { materials: { 'oak_planks': 6 }, station: 'hand', gives: 3 },
  'iron_door': { materials: { 'iron_ingot': 6 }, station: 'hand', gives: 3 },

  // ── Signs ──
  'oak_sign': { materials: { 'oak_planks': 6, 'stick': 1 }, station: 'hand', gives: 3 },

  // ── Beds ──
  'bed': { materials: { 'oak_planks': 3, 'wool': 3 }, station: 'hand' },

  // ── Boats ──
  'oak_boat': { materials: { 'oak_planks': 5 }, station: 'hand' },

  // ══════════════════════════════════════════════════════════════════════════
  // REDSTONE & MECHANISM
  // ══════════════════════════════════════════════════════════════════════════

  'redstone_torch':  { materials: { 'redstone': 1, 'stick': 1 }, station: 'hand' },
  'lever':           { materials: { 'cobblestone': 1, 'stick': 1 }, station: 'hand' },
  'button':          { materials: { 'oak_planks': 1 }, station: 'hand' },
  'stone_button':    { materials: { 'cobblestone': 1 }, station: 'hand' },
  'pressure_plate':  { materials: { 'oak_planks': 2 }, station: 'hand' },
  'stone_pressure_plate': { materials: { 'stone': 2 }, station: 'hand' },
  'tripwire_hook':   { materials: { 'iron_ingot': 1, 'stick': 1, 'oak_planks': 1 }, station: 'hand', gives: 2 },
  'note_block':      { materials: { 'oak_planks': 8, 'redstone': 1 }, station: 'hand' },
  'jukebox':         { materials: { 'oak_planks': 8, 'diamond': 1 }, station: 'hand' },

  // ── Pistons ──
  'piston':        { materials: { 'oak_planks': 3, 'cobblestone': 4, 'iron_ingot': 1, 'redstone': 1 }, station: 'hand' },
  'sticky_piston': { materials: { 'piston': 1, 'slime_ball': 1 }, station: 'hand' },

  // ── Dispenser/Dropper ──
  'dispenser': { materials: { 'cobblestone': 7, 'bow': 1, 'redstone': 1 }, station: 'hand' },
  'dropper':   { materials: { 'cobblestone': 7, 'redstone': 1 }, station: 'hand' },

  // ── Hopper ──
  'hopper': { materials: { 'iron_ingot': 5, 'chest': 1 }, station: 'hand' },

  // ── Observer ──
  'observer': { materials: { 'cobblestone': 6, 'redstone': 2, 'nether_quartz': 1 }, station: 'hand' },

  // ── Redstone components ──
  'redstone_lamp':     { materials: { 'glowstone': 4, 'redstone': 1 }, station: 'hand' },
  'daylight_detector': { materials: { 'oak_planks': 6, 'nether_quartz': 3, 'glass': 3 }, station: 'hand' },

  // ── Rails ──
  'rail':           { materials: { 'iron_ingot': 6, 'stick': 1 }, station: 'hand', gives: 16 },
  'powered_rail':   { materials: { 'gold_ingot': 6, 'stick': 1, 'redstone': 1 }, station: 'hand', gives: 6 },
  'detector_rail':  { materials: { 'iron_ingot': 6, 'redstone': 1, 'stone_pressure_plate': 1 }, station: 'hand', gives: 6 },
  'activator_rail': { materials: { 'iron_ingot': 6, 'stick': 2, 'redstone_torch': 1 }, station: 'hand', gives: 6 },

  // ── Minecarts ──
  'minecart':          { materials: { 'iron_ingot': 5 }, station: 'hand' },
  'chest_minecart':   { materials: { 'minecart': 1, 'chest': 1 }, station: 'hand' },
  'hopper_minecart':  { materials: { 'minecart': 1, 'hopper': 1 }, station: 'hand' },
  'tnt_minecart':     { materials: { 'minecart': 1, 'tnt': 1 }, station: 'hand' },
  'furnace_minecart': { materials: { 'minecart': 1, 'furnace': 1 }, station: 'hand' },

  // ══════════════════════════════════════════════════════════════════════════
  // BOWS, ARROWS & COMBAT
  // ══════════════════════════════════════════════════════════════════════════

  'bow':      { materials: { 'stick': 3, 'string': 3 }, station: 'hand' },
  'arrow':    { materials: { 'flint': 1, 'stick': 1, 'feather': 1 }, station: 'hand', gives: 4 },
  'crossbow': { materials: { 'stick': 3, 'iron_ingot': 3, 'string': 2, 'tripwire_hook': 1 }, station: 'hand' },
  'shield':   { materials: { 'oak_planks': 6, 'iron_ingot': 1 }, station: 'hand' },
  'trident':  { materials: {}, station: 'none', note: 'Cannot be crafted — only found in ocean ruins' },

  // ── Splash/Lingering Potions ──
  'splash_potion':    { materials: { 'gunpowder': 1, 'potion': 1 }, station: 'hand' },
  'lingering_potion': { materials: { 'dragon_breath': 3, 'splash_potion': 1 }, station: 'hand' },

  // ══════════════════════════════════════════════════════════════════════════
  // ENCHANTING & BREWING
  // ══════════════════════════════════════════════════════════════════════════

  'enchanting_table': { materials: { 'diamond': 2, 'obsidian': 4, 'book': 1 }, station: 'hand' },
  'anvil':            { materials: { 'iron_block': 3, 'iron_ingot': 4 }, station: 'hand' },
  'grindstone':       { materials: { 'stick': 2, 'stone_slab': 1, 'iron_ingot': 2 }, station: 'hand' },
  'stonecutter':      { materials: { 'iron_ingot': 2, 'stone': 1 }, station: 'hand' },
  'smithing_table':   { materials: { 'iron_ingot': 4, 'oak_planks': 2 }, station: 'hand' },
  'book':             { materials: { 'paper': 3, 'leather': 1 }, station: 'hand' },
  'bookshelf':        { materials: { 'oak_planks': 6, 'book': 3 }, station: 'hand' },
  'lectern':          { materials: { 'oak_slab': 1, 'bookshelf': 1 }, station: 'hand' },
  'cartography_table': { materials: { 'paper': 2, 'oak_planks': 4 }, station: 'hand' },
  'brewing_stand':    { materials: { 'blaze_rod': 1, 'cobblestone': 3 }, station: 'hand' },
  'cauldron':         { materials: { 'iron_ingot': 7 }, station: 'hand' },

  // ── Paper & Books ──
  'paper':   { materials: { 'sugar_cane': 3 }, station: 'hand', gives: 3 },
  'map':     { materials: { 'paper': 8, 'compass': 1 }, station: 'hand' },
  'compass': { materials: { 'iron_ingot': 4, 'redstone': 1 }, station: 'hand' },

  // ══════════════════════════════════════════════════════════════════════════
  // FOOD & FARMING
  // ══════════════════════════════════════════════════════════════════════════

  'bowl':           { materials: { 'oak_planks': 3 }, station: 'hand', gives: 4 },
  'bread':          { materials: { 'wheat': 3 }, station: 'hand' },
  'cake':           { materials: { 'wheat': 3, 'sugar': 2, 'milk_bucket': 3, 'egg': 1 }, station: 'hand' },
  'cookie':         { materials: { 'wheat': 2, 'cocoa_beans': 1 }, station: 'hand', gives: 8 },
  'pumpkin_pie':    { materials: { 'pumpkin': 1, 'sugar': 1, 'egg': 1 }, station: 'hand' },
  'golden_apple':   { materials: { 'apple': 1, 'gold_nugget': 8 }, station: 'hand' },
  'enchanted_golden_apple': { materials: { 'apple': 1, 'gold_block': 8 }, station: 'hand' },
  'golden_carrot':  { materials: { 'carrot': 1, 'gold_nugget': 8 }, station: 'hand' },
  'mushroom_stew':  { materials: { 'bowl': 1, 'brown_mushroom': 1, 'red_mushroom': 1 }, station: 'hand' },
  'suspicious_stew': { materials: { 'bowl': 1, 'brown_mushroom': 1, 'red_mushroom': 1, 'flower': 1 }, station: 'hand', note: 'Flower determines effect' },

  // ── Smelting recipes (input → output, fuel needed) ──
  'cooked_beef':     { smelts: 'beef', fuel: 'any', output: 'cooked_beef', xp: 0.35 },
  'cooked_porkchop': { smelts: 'porkchop', fuel: 'any', output: 'cooked_porkchop', xp: 0.35 },
  'cooked_chicken':  { smelts: 'chicken', fuel: 'any', output: 'cooked_chicken', xp: 0.35 },
  'cooked_mutton':   { smelts: 'mutton', fuel: 'any', output: 'cooked_mutton', xp: 0.35 },
  'cooked_rabbit':   { smelts: 'rabbit', fuel: 'any', output: 'cooked_rabbit', xp: 0.35 },
  'cooked_cod':      { smelts: 'cod', fuel: 'any', output: 'cooked_cod', xp: 0.35 },
  'cooked_salmon':   { smelts: 'salmon', fuel: 'any', output: 'cooked_salmon', xp: 0.35 },
  'baked_potato':    { smelts: 'potato', fuel: 'any', output: 'baked_potato', xp: 0.35 },
  'bread_smelted':   { smelts: 'wheat', fuel: 'any', output: 'bread', xp: 0.35 },

  // ── Smelting ores ──
  'iron_ingot_from_smelting':   { smelts: 'raw_iron', fuel: 'any', output: 'iron_ingot', xp: 0.7 },
  'gold_ingot_from_smelting':   { smelts: 'raw_gold', fuel: 'any', output: 'gold_ingot', xp: 1.0 },
  'copper_ingot_from_smelting': { smelts: 'raw_copper', fuel: 'any', output: 'copper_ingot', xp: 0.7 },
  'diamond_from_smelting':      { smelts: 'diamond_ore', fuel: 'any', output: 'diamond', xp: 1.0 },
  'netherite_scrap':            { smelts: 'ancient_debris', fuel: 'any', output: 'netherite_scrap', xp: 2.0 },

  // ── Smelting misc ──
  'smooth_stone': { smelts: 'stone', fuel: 'any', output: 'smooth_stone', xp: 0.1 },
  'glass':        { smelts: 'sand', fuel: 'any', output: 'glass', xp: 0.1 },
  'terracotta':   { smelts: 'clay_ball', fuel: 'any', output: 'terracotta', xp: 0.3 },
  'charcoal':     { smelts: 'oak_log', fuel: 'any', output: 'charcoal', xp: 0.15 },

  // ══════════════════════════════════════════════════════════════════════════
  // STORAGE & UTILITIES
  // ══════════════════════════════════════════════════════════════════════════

  'bucket':          { materials: { 'iron_ingot': 3 }, station: 'hand' },
  'flint_and_steel': { materials: { 'iron_ingot': 1, 'flint': 1 }, station: 'hand' },
  'fishing_rod':     { materials: { 'stick': 3, 'string': 2 }, station: 'hand' },
  'shears':          { materials: { 'iron_ingot': 2 }, station: 'hand' },
  'lead':            { materials: { 'slime_ball': 4, 'string': 4 }, station: 'hand' },
  'clock':           { materials: { 'gold_ingot': 4, 'redstone': 1 }, station: 'hand' },
  'spyglass':        { materials: { 'copper_ingot': 2, 'amethyst_shard': 1 }, station: 'hand' },
  'name_tag':        { materials: {}, station: 'none', note: 'Cannot be crafted — found in loot/fishing' },
  'saddle':          { materials: {}, station: 'none', note: 'Cannot be crafted — found in loot/chests' },

  // ── Fireworks ──
  'firework_rocket': { materials: { 'paper': 1, 'gunpowder': 1 }, station: 'hand', gives: 3, note: 'Add firework star for colored explosions' },

  // ══════════════════════════════════════════════════════════════════════════
  // TNT & EXPLOSIVES
  // ══════════════════════════════════════════════════════════════════════════

  'tnt': { materials: { 'sand': 4, 'gunpowder': 5 }, station: 'hand' },

  // ══════════════════════════════════════════════════════════════════════════
  // BANNERS & DECORATIONS
  // ══════════════════════════════════════════════════════════════════════════

  'banner':     { materials: { 'stick': 1, 'wool': 6 }, station: 'hand' },
  'painting':   { materials: { 'stick': 8, 'wool': 1 }, station: 'hand' },
  'flower_pot': { materials: { 'terracotta': 3 }, station: 'hand' },
  'item_frame': { materials: { 'stick': 8, 'leather': 1 }, station: 'hand' },
  'glow_item_frame': { materials: { 'item_frame': 1, 'glow_ink_sac': 1 }, station: 'hand' },

  // ── Armor Stands ──
  'armor_stand': { materials: { 'stick': 5, 'oak_slab': 3 }, station: 'hand' },

  // ══════════════════════════════════════════════════════════════════════════
  // WOOL COLORS & DYES
  // ══════════════════════════════════════════════════════════════════════════

  'white_wool': { materials: { 'string': 4 }, station: 'hand' },

  // ── Dyes ──
  'white_dye':      { materials: { 'bone_meal': 1 }, station: 'hand' },
  'light_gray_dye': { materials: { 'oxeye_daisy': 1 }, station: 'hand' },
  'gray_dye':       { materials: { 'black_dye': 1, 'white_dye': 1 }, station: 'hand' },
  'brown_dye':      { materials: { 'cocoa_beans': 1 }, station: 'hand' },
  'black_dye':      { materials: { 'ink_sac': 1 }, station: 'hand' },
  'red_dye':        { materials: { 'poppy': 1 }, station: 'hand' },
  'orange_dye':     { materials: { 'orange_tulip': 1 }, station: 'hand' },
  'yellow_dye':     { materials: { 'dandelion': 1 }, station: 'hand' },
  'lime_dye':       { materials: { 'green_dye': 1, 'white_dye': 1 }, station: 'hand' },
  'green_dye':      { materials: { 'cactus': 1 }, station: 'hand' },
  'cyan_dye':       { materials: { 'blue_dye': 1, 'green_dye': 1 }, station: 'hand' },
  'light_blue_dye': { materials: { 'blue_orchid': 1 }, station: 'hand' },
  'blue_dye':       { materials: { 'lapis_lazuli': 1 }, station: 'hand' },
  'purple_dye':     { materials: { 'blue_dye': 1, 'red_dye': 1 }, station: 'hand' },
  'magenta_dye':    { materials: { 'allium': 1 }, station: 'hand' },
  'pink_dye':       { materials: { 'pink_tulip': 1 }, station: 'hand' },

  // ══════════════════════════════════════════════════════════════════════════
  // WOODEN BUILDING BLOCKS
  // ══════════════════════════════════════════════════════════════════════════

  'barrel':        { materials: { 'oak_planks': 6, 'oak_slab': 2 }, station: 'hand' },
  'composter':     { materials: { 'oak_slab': 7 }, station: 'hand' },
  'scaffolding':   { materials: { 'bamboo': 6, 'string': 1 }, station: 'hand', gives: 6 },
  'beehive':       { materials: { 'oak_planks': 6, 'honeycomb': 3 }, station: 'hand' },
  'campfire':      { materials: { 'stick': 3, 'coal': 1, 'log': 3 }, station: 'hand' },
  'smoker':        { materials: { 'oak_planks': 4, 'furnace': 1 }, station: 'hand' },
  'blast_furnace': { materials: { 'iron_ingot': 5, 'furnace': 1, 'smooth_stone': 3 }, station: 'hand' },
  'loom':          { materials: { 'string': 2, 'oak_planks': 2 }, station: 'hand' },
  'fletching_table': { materials: { 'flint': 2, 'oak_planks': 4 }, station: 'hand' },

  // ══════════════════════════════════════════════════════════════════════════
  // NETHER & END
  // ══════════════════════════════════════════════════════════════════════════

  'nether_portal': { materials: { 'obsidian': 10 }, station: 'hand', note: 'Place obsidian in 4x5 frame, light with flint_and_steel' },
  'eyes_of_ender': { materials: { 'ender_pearl': 1, 'blaze_powder': 1 }, station: 'hand' },
  'end_crystal':   { materials: { 'glass': 7, 'ender_pearl': 1, 'ghast_tear': 1 }, station: 'hand' },
  'beacon':        { materials: { 'nether_star': 1, 'obsidian': 3, 'glass': 5 }, station: 'hand' },
  'conduit':       { materials: { 'nautilus_shell': 7, 'heart_of_the_sea': 1 }, station: 'hand' },

  // ── Netherite Upgrade (Smithing Table) ──
  'netherite_upgrade': { materials: { 'netherite_upgrade_smithing_template': 1, 'netherite_ingot': 1 }, station: 'smithing_table', note: 'Place diamond tool/armor in smithing table with template + netherite ingot' },

  // ── Uncraftable items (loot only) ──
  'ender_pearl':  { materials: {}, station: 'none', note: 'Dropped by Endermen — cannot be crafted' },
  'elytra':       { materials: {}, station: 'none', note: 'Found in End Ships — cannot be crafted' },
  'skull':        { materials: {}, station: 'none', note: 'Cannot be crafted — wither skeleton drop' },
  'chainmail_helmet':   { materials: {}, station: 'none', note: 'Cannot be crafted — only from loot/villagers' },
  'chainmail_chestplate': { materials: {}, station: 'none', note: 'Cannot be crafted — only from loot/villagers' },
  'chainmail_leggings': { materials: {}, station: 'none', note: 'Cannot be crafted — only from loot/villagers' },
  'chainmail_boots':    { materials: {}, station: 'none', note: 'Cannot be crafted — only from loot/villagers' },
  'iron_horse_armor':   { materials: {}, station: 'none', note: 'Cannot be crafted — found in chests' },
  'golden_horse_armor': { materials: {}, station: 'none', note: 'Cannot be crafted — found in chests' },
  'diamond_horse_armor': { materials: {}, station: 'none', note: 'Cannot be crafted — found in chests' },
}

// ══════════════════════════════════════════════════════════════════════════════
// TIER REFERENCE
// ══════════════════════════════════════════════════════════════════════════════

const TIERS = {
  tools: {
    wood:    { material: 'planks',      mineLevel: 0, mineSpeed: 2.0, damage: 4, durability: 59,   note: 'Breaks stone slowly' },
    stone:   { material: 'cobblestone', mineLevel: 1, mineSpeed: 4.0, damage: 5, durability: 131,  note: 'Breaks iron ore' },
    iron:    { material: 'iron_ingot',  mineLevel: 2, mineSpeed: 6.0, damage: 6, durability: 250,  note: 'Breaks diamond ore, workhorse tier' },
    golden:  { material: 'gold_ingot',  mineLevel: 2, mineSpeed: 12.0, damage: 4, durability: 33, note: 'Fastest but breaks instantly' },
    diamond: { material: 'diamond',     mineLevel: 3, mineSpeed: 8.0, damage: 7, durability: 1561, note: 'Best durability, breaks everything' },
    netherite: { material: 'netherite_ingot', mineLevel: 4, mineSpeed: 9.0, damage: 8, durability: 2031, note: 'Top tier, fireproof, upgrade from diamond' },
  },
  armor: {
    leather:   { defense: [1,3,2,1], total: 7,  note: 'Dyes any color, worst protection' },
    chainmail: { defense: [2,5,4,1], total: 12, note: 'Can\'t craft — only from loot/villagers' },
    iron:      { defense: [2,6,5,2], total: 15, note: 'Good mid-game, easy to get' },
    golden:    { defense: [2,5,3,1], total: 11, note: 'Worst protection, high enchantability' },
    diamond:   { defense: [3,8,6,3], total: 20, note: 'Best craftable armor' },
    netherite: { defense: [3,8,6,3], total: 20, note: 'Same as diamond but knockback resistant + fireproof' },
  },
  miningLevels: {
    0: 'Nothing special — hand/wood can mine dirt, sand, gravel',
    1: 'Stone pickaxe — mines iron ore, copper ore, coal ore',
    2: 'Iron pickaxe — mines diamond ore, gold ore, emerald ore',
    3: 'Diamond pickaxe — mines obsidian',
    4: 'Netherite pickaxe — fastest at everything',
  },
  fuelEfficiency: {
    coal: '8 items (smelts 8)',
    charcoal: '8 items',
    lava_bucket: '100 items (best fuel)',
    blaze_rod: '12 items',
    coal_block: '80 items',
    dried_kelp_block: '20 items',
    stick: '0.5 items (terrible)',
    planks: '1.5 items',
    log: '1.5 items',
  }
}

// ══════════════════════════════════════════════════════════════════════════════
// RECIPE CHAIN LOOKUP — helps the LLM trace back dependencies
// E.g., "how do I get sticks?" → need planks → need logs
// ══════════════════════════════════════════════════════════════════════════════

const RAW_MATERIALS = new Set([
  'oak_log', 'birch_log', 'spruce_log', 'jungle_log', 'dark_oak_log', 'acacia_log',
  'cobblestone', 'stone', 'sand', 'gravel', 'clay_ball', 'iron_ore', 'gold_ore',
  'diamond_ore', 'lapis_ore', 'redstone_ore', 'coal_ore', 'copper_ore', 'emerald_ore',
  'raw_iron', 'raw_gold', 'raw_copper', 'ancient_debris',
  'string', 'feather', 'flint', 'leather', 'bone', 'gunpowder', 'slime_ball',
  'ender_pearl', 'blaze_rod', 'blaze_powder', 'ghast_tear', 'nether_star',
  'nether_quartz', 'prismarine_shard', 'prismarine_crystals', 'nautilus_shell',
  'heart_of_the_sea', 'dragon_breath', 'echo_shard',
  'iron_ingot', 'gold_ingot', 'copper_ingot', 'netherite_ingot', 'netherite_scrap',
  'diamond', 'emerald', 'lapis_lazuli', 'redstone', 'coal', 'charcoal',
  'gold_nugget', 'iron_nugget', 'copper_nugget',
  'paper', 'sugar_cane', 'sugar', 'wheat', 'apple', 'carrot', 'potato', 'beetroot',
  'pumpkin', 'melon_slice', 'cocoa_beans', 'egg', 'milk_bucket',
  'poppy', 'dandelion', 'oxeye_daisy', 'blue_orchid', 'allium', 'orange_tulip', 'pink_tulip',
  'brown_mushroom', 'red_mushroom', 'vine', 'moss_block',
  'honeycomb', 'honey_bottle', 'amethyst_shard',
  'glowstone_dust', 'glow_ink_sac', 'ink_sac', 'bone_meal',
  'nether_wart', 'fermented_spider_eye', 'spider_eye', 'magma_cream',
  'phantom_membrane', 'rabbit_hide', 'rabbit_foot',
  'turtle_scute', 'armadillo_scute', 'breeze_rod',
  'disc_fragment_5', 'music_disc_13', 'music_disc_cat',
])

function getRecipesByCategory(category) {
  const results = {}
  for (const [name, recipe] of Object.entries(RECIPES)) {
    if (category === 'all' || name.includes(category)) {
      results[name] = recipe
    }
  }
  return results
}

function getSmeltingRecipes() {
  const results = {}
  for (const [name, recipe] of Object.entries(RECIPES)) {
    if (recipe.smelts) results[name] = recipe
  }
  return results
}

function getCraftableItems() {
  return Object.entries(RECIPES)
    .filter(([_, r]) => r.materials && Object.keys(r.materials).length > 0)
    .map(([name, r]) => ({
      name,
      materials: r.materials,
      station: r.station,
      gives: r.gives || 1,
    }))
}

function getTierInfo(tierName) {
  const toolTier = TIERS.tools[tierName]
  const armorTier = TIERS.armor[tierName]
  return { tools: toolTier, armor: armorTier }
}

function formatRecipeForLLM(itemName) {
  const recipe = RECIPES[itemName]
  if (!recipe) return `No recipe found for ${itemName}`

  const lines = [`Recipe: ${itemName}`]

  if (recipe.smelts) {
    lines.push(`  Smelt ${recipe.smelts} in furnace → ${recipe.output}`)
    lines.push(`  XP: ${recipe.xp}`)
  } else if (recipe.materials && Object.keys(recipe.materials).length > 0) {
    const mats = Object.entries(recipe.materials).map(([m, c]) => `${c}x ${m}`).join(', ')
    lines.push(`  Materials: ${mats}`)
    lines.push(`  Station: ${recipe.station === 'hand' ? 'Crafting Table or Hand' : recipe.station}`)
    if (recipe.gives) lines.push(`  Gives: ${recipe.gives}`)
  } else {
    lines.push(`  ${recipe.note || 'Cannot be crafted'}`)
  }

  if (recipe.tier) lines.push(`  Tier: ${recipe.tier}`)
  if (recipe.durability) lines.push(`  Durability: ${recipe.durability}`)
  if (recipe.damage) lines.push(`  Damage: ${recipe.damage}`)
  if (recipe.defense) lines.push(`  Defense: ${recipe.defense}`)
  if (recipe.speed) lines.push(`  Speed: ${recipe.speed}`)

  return lines.join('\n')
}

function formatAllRecipesCompact() {
  const lines = []
  for (const [name, recipe] of Object.entries(RECIPES)) {
    if (recipe.smelts) {
      lines.push(`${name}: smelt ${recipe.smelts} → ${recipe.output}`)
    } else if (recipe.materials && Object.keys(recipe.materials).length > 0) {
      const mats = Object.entries(recipe.materials).map(([m,c]) => `${c}${m}`).join('+')
      const note = recipe.note ? ` (${recipe.note})` : ''
      lines.push(`${name}: ${mats}${note}`)
    } else {
      lines.push(`${name}: UNCRAFTABLE — ${recipe.note || 'find in world'}`)
    }
  }
  return lines.join('\n')
}

// ══════════════════════════════════════════════════════════════════════════════
// RECIPE CHAIN FINDER — traces back what you need to craft an item
// Returns array of steps from raw materials to final product
// ══════════════════════════════════════════════════════════════════════════════

function getRecipeChain(itemName, visited = new Set()) {
  if (visited.has(itemName)) return []
  visited.add(itemName)

  const recipe = RECIPES[itemName]
  if (!recipe) return []
  if (recipe.smelts) {
    return [{ step: itemName, action: `smelt ${recipe.smelts} in furnace`, output: recipe.output || itemName }]
  }
  if (!recipe.materials || Object.keys(recipe.materials).length === 0) return []

  const steps = []
  for (const [mat, count] of Object.entries(recipe.materials)) {
    if (RAW_MATERIALS.has(mat)) continue // it's a raw material, no need to craft it
    const subRecipe = RECIPES[mat]
    if (subRecipe && subRecipe.materials && Object.keys(subRecipe.materials).length > 0) {
      steps.push(...getRecipeChain(mat, visited))
    }
  }

  const mats = Object.entries(recipe.materials).map(([m, c]) => `${c}x ${m}`).join(', ')
  steps.push({ step: itemName, action: `craft ${itemName} from ${mats}`, gives: recipe.gives || 1 })
  return steps
}

module.exports = { RECIPES, TIERS, RAW_MATERIALS, getRecipesByCategory, getSmeltingRecipes, getCraftableItems, getTierInfo, formatRecipeForLLM, formatAllRecipesCompact, getRecipeChain }
