// ══════════════════════════════════════════════════════════════════════════════
// LLM Tool Calling Benchmark — Test models for accuracy and speed
// ══════════════════════════════════════════════════════════════════════════════
// Usage: node test-llm.js
// Requires: a model loaded in LM Studio at http://127.0.0.1:1234
// Set context length to 4096 in LM Studio before loading the model.
// ══════════════════════════════════════════════════════════════════════════════

const http = require('http');
const fs = require('fs');
const path = require('path');

// ── Load config ─────────────────────────────────────────────────────────────
let config;
try {
  config = JSON.parse(fs.readFileSync(path.join(__dirname, 'config.json'), 'utf8'));
} catch (e) {
  console.error('[Config] Failed to load config.json, using defaults');
  config = {};
}

const LLM_BASE_URL = config.llm?.baseUrl || 'http://127.0.0.1:1234';
const LLM_API_ENDPOINT = config.llm?.apiEndpoint || '/api/v1/chat';
const LLM_URL = `${LLM_BASE_URL}${LLM_API_ENDPOINT}`;
const MODEL_NAME = config.llm?.model || 'nvidia/nemotron-3-nano-4b';
const CONTEXT_LENGTH = config.llm?.contextLength || 4096;

// ── TOOL DEFINITIONS (same as the bot) ──────────────────────────────────────

const TOOLS = `
TOOLS (call one per response):
- chat(message:"text") — say something in game chat (max 200 chars)
- goto(x:number, y:number, z:number) — walk to coordinates
- mine(block:"name", count:number) — find and mine blocks nearby
- chop(count:number) — chop nearest tree for wood
- dig(direction:"down"|"up"|"forward", count:number) — dig in a direction
- place(block:"name", x:number, y:number, z:number) — place a block
- equip(item:"name") — equip item to hand
- eat() — eat food in inventory
- craft(item:"name", count:number) — craft an item
- attack(target:"name") — attack a nearby entity
- hunt(animal:"sheep"|"cow"|"pig"|"chicken") — kill an animal
- drop(item:"name", count:number) — drop items from inventory
- use_block(block:"name") — right-click a nearby block
- add_task(text:"description") — add a task to your list
- complete_task(id:"text") — mark a task as done
- get_tasks() — view your task list
- stop() — stop all movement
- idle() — do nothing
`;

const SYSTEM_PROMPT = `You are AIBot, a Minecraft bot. Call exactly one tool per response. No explanations.
${TOOLS}

CURRENT STATE:
- Position: (-176, 68, -27)
- Health: 20/20 | Food: 20/20
- Time: 6000 (DAY)
- Held: iron_sword

YOUR INVENTORY (5 items):
iron_swordx1, cobblestonex16, torchx8, crafting_tablex1, oak_planksx12

YOUR TASKS:
No active tasks.`;

// ── TEST CASES ──────────────────────────────────────────────────────────────
// Each test: { prompt, expectedTool, expectedArgs (partial match), description }

const TESTS = [
  // === BASIC TOOL SELECTION ===
  {
    prompt: 'Player says: "chop some wood"',
    expectedTool: 'chop',
    expectedArgs: {},
    description: 'Chop wood',
  },
  {
    prompt: 'Player says: "mine some stone"',
    expectedTool: 'mine',
    expectedArgs: { block: 'stone' },
    description: 'Mine stone',
  },
  {
    prompt: 'Player says: "drop the cobblestone"',
    expectedTool: 'drop',
    expectedArgs: { item: 'cobblestone' },
    description: 'Drop cobblestone',
  },
  {
    prompt: 'Player says: "eat something"',
    expectedTool: 'eat',
    expectedArgs: {},
    description: 'Eat food',
  },
  {
    prompt: 'Player says: "craft a wooden pickaxe"',
    expectedTool: 'craft',
    expectedArgs: { item: 'wooden_pickaxe' },
    description: 'Craft wooden pickaxe',
  },

  // === COMPLEX TOOL SELECTION ===
  {
    prompt: 'Player says: "use the crafting table"',
    expectedTool: 'use_block',
    expectedArgs: { block: 'crafting_table' },
    description: 'Use crafting table',
  },
  {
    prompt: 'Player says: "go to coordinates 100 70 -200"',
    expectedTool: 'goto',
    expectedArgs: {},
    description: 'Go to coordinates',
  },
  {
    prompt: 'Player says: "there\'s a zombie behind me!"',
    expectedTool: 'attack',
    expectedArgs: { target: 'zombie' },
    description: 'Attack zombie',
  },
  {
    prompt: 'Player says: "hunt that sheep for wool"',
    expectedTool: 'hunt',
    expectedArgs: { animal: 'sheep' },
    description: 'Hunt sheep',
  },
  {
    prompt: 'Player says: "stop moving"',
    expectedTool: 'stop',
    expectedArgs: {},
    description: 'Stop movement',
  },

  // === TASK MANAGEMENT ===
  {
    prompt: 'Player says: "build a house" — break this into tasks',
    expectedTool: 'add_task',
    expectedArgs: {},
    description: 'Add task (build house)',
  },
  {
    prompt: 'You just finished mining 3 stone. Player asked for stone. Mark it done.',
    expectedTool: 'complete_task',
    expectedArgs: {},
    description: 'Complete task',
  },

  // === CHAT ===
  {
    prompt: 'Player says: "hello!"',
    expectedTool: 'chat',
    expectedArgs: {},
    description: 'Chat response',
  },

  // === TRICKY / EDGE CASES ===
  {
    prompt: 'Player says: "place a torch at 10 64 -5"',
    expectedTool: 'place',
    expectedArgs: { block: 'torch' },
    description: 'Place torch',
  },
  {
    prompt: 'Player says: "dig down 3 blocks"',
    expectedTool: 'dig',
    expectedArgs: { direction: 'down' },
    description: 'Dig down',
  },
];

// ── TOOL NAME ALIASES (same as bot) ─────────────────────────────────────────

const TOOL_ALIASES = {
  // Standard aliases
  place_block: 'place', put_block: 'place', set_block: 'place',
  dig_block: 'dig', mine_block: 'mine',
  cut_tree: 'chop', chop_tree: 'chop',
  stop_follow: 'stop', unfollow: 'stop',
  eat_food: 'eat', use_bed: 'use_block', open_chest: 'use_block',
  drop_item: 'drop', throw_item: 'drop',
  goto_location: 'goto', walk_to: 'goto', move_to: 'goto',
  craft_item: 'craft', make_item: 'craft',
  add_todo: 'add_task', create_task: 'add_task', new_task: 'add_task',
  mark_done: 'complete_task', finish_task: 'complete_task', done: 'complete_task',
  list_tasks: 'get_tasks', show_tasks: 'get_tasks', tasks: 'get_tasks',
  // Typo corrections
  clop: 'chop', chp: 'chop', cho: 'chop',
  mne: 'mine', min: 'mine', myne: 'mine',
  et: 'eat', eet: 'eat',
  grop: 'goto', go_to: 'goto',
  atack: 'attack', attck: 'attack',
  huant: 'hunt', hnt: 'hunt',
  crafft: 'craft', crft: 'craft',
  drp: 'drop', drpp: 'drop',
  place: 'place', plce: 'place',
  duge: 'dig', digg: 'dig',
};

// ── RESPONSE PARSER — Handles all LLM output formats ────────────────────────

function parseResponse(raw) {
  if (!raw || typeof raw !== 'string') return { text: '', tool: null };

  // Strip thinking/reasoning tags
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

  // ── FORMAT 2: XML self-closing <tool key="val" /> or <tool /> ────────────
  const selfCloseMatch = cleaned.match(/<(\w+)\s+([^>]*?)\/?>/i);
  if (selfCloseMatch) {
    const tag = selfCloseMatch[1];
    // Check if it looks like a tool name (not HTML tags like <br>, <p>, etc.)
    const VALID_TOOLS = new Set(['chat', 'goto', 'mine', 'chop', 'dig', 'place', 'equip', 'unequip',
      'eat', 'craft', 'attack', 'hunt', 'shear', 'drop', 'look', 'interact', 'use_block',
      'set_goal', 'cancel_goal', 'pillar_up', 'stop', 'idle', 'add_task', 'complete_task', 'get_tasks', 'invoke']);
    if (VALID_TOOLS.has(tag) || tag === 'invoke') {
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
    const VALID_TOOLS = new Set(['chat', 'goto', 'mine', 'chop', 'dig', 'place', 'equip',
      'eat', 'craft', 'attack', 'hunt', 'shear', 'drop', 'use_block', 'stop', 'idle',
      'add_task', 'complete_task', 'get_tasks']);
    if (VALID_TOOLS.has(tag)) {
      const toolName = TOOL_ALIASES[tag] || tag;
      const inner = xmlChildMatch[2];
      const args = {};
      // Try <key>val</key> pairs
      const childMatches = inner.matchAll(/<(\w+)>([\s\S]*?)<\/\1>/g);
      let hasChildren = false;
      for (const m of childMatches) {
        args[m[1]] = m[2].trim().replace(/^["']|["']$/g, '');
        hasChildren = true;
      }
      if (!hasChildren && inner.trim()) {
        // Single value — figure out what arg it should be
        args[guessArgName(tag)] = inner.trim();
      }
      const textBefore = cleaned.substring(0, cleaned.indexOf(`<${tag}>`)).trim();
      return { text: textBefore, tool: { name: toolName, args } };
    }
  }

  // ── FORMAT 4: tool_name(arg:val, arg:val) ────────────────────────────────
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
    return { text: cleaned.substring(0, cleaned.indexOf(toolMatch[0])).trim(), tool: { name: toolName, args } };
  }

  // ── FORMAT 5: JSON {"tool": "name", ...} ─────────────────────────────────
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
  } catch (e) {}

  // ── FORMAT 6: JSON {"name": "func", "arguments": {...}} ──────────────────
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
  } catch (e) {}

  // ── FORMAT 7: Simple "tool: value" or "tool value" ──────────────────────
  const simpleMatch = cleaned.match(/^(\w+):\s*(.+)/);
  if (simpleMatch && simpleMatch[1].length < 30) {
    const toolName = TOOL_ALIASES[simpleMatch[1]] || simpleMatch[1];
    const VALID_TOOLS2 = new Set(['chat', 'goto', 'mine', 'chop', 'dig', 'place', 'equip',
      'eat', 'craft', 'attack', 'hunt', 'shear', 'drop', 'use_block', 'stop', 'idle',
      'add_task', 'complete_task', 'get_tasks']);
    if (VALID_TOOLS2.has(toolName)) {
      return { text: '', tool: { name: toolName, args: { message: simpleMatch[2].trim() } } };
    }
  }

  // ── FORMAT 8: Bare tool name (just "chop" or "stop" with no args) ────────
  const bareMatch = cleaned.match(/^(\w+)$/m);
  if (bareMatch) {
    const toolName = TOOL_ALIASES[bareMatch[1]] || bareMatch[1];
    const ALL_TOOLS = new Set(['chat', 'goto', 'mine', 'chop', 'dig', 'place', 'equip', 'unequip',
      'eat', 'craft', 'attack', 'hunt', 'shear', 'drop', 'look', 'interact', 'use_block',
      'set_goal', 'cancel_goal', 'pillar_up', 'stop', 'idle', 'add_task', 'complete_task', 'get_tasks']);
    if (ALL_TOOLS.has(toolName)) {
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
    add_task: 'text', complete_task: 'id',
  };
  return map[toolName] || 'value';
}

// ── LLM CALL ────────────────────────────────────────────────────────────────

function callLLM(prompt) {
  return new Promise((resolve, reject) => {
    const body = JSON.stringify({
      model: MODEL_NAME,
      input: SYSTEM_PROMPT + '\n\n' + prompt,
      context_length: CONTEXT_LENGTH,
      temperature: 0.1,
    });

    const startTime = Date.now();

    const req = http.request(LLM_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) },
      timeout: 30000,
    }, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        const elapsed = Date.now() - startTime;
        try {
          const json = JSON.parse(data);
          // Native endpoint returns output array
          let content = '';
          if (json.output && json.output.length > 0) {
            const lastMsg = json.output.filter(o => o.type === 'message').pop();
            content = lastMsg?.content || '';
          } else if (json.choices && json.choices[0]) {
            // Fallback to OpenAI format
            content = json.choices[0].message?.content || '';
          }
          const tokensPerSec = json.stats?.tokens_per_second || 0;
          const completionTokens = json.stats?.total_output_tokens || json.usage?.completion_tokens || 0;
          resolve({ content, elapsed, tokensPerSec, completionTokens });
        } catch (e) {
          reject(new Error(`Parse error: ${e.message}`));
        }
      });
    });

    req.on('error', reject);
    req.on('timeout', () => { req.destroy(); reject(new Error('Timeout')); });
    req.write(body);
    req.end();
  });
}

// ── MATCHING ────────────────────────────────────────────────────────────────

function checkMatch(result, expected) {
  const toolMatch = result.tool?.name === expected.expectedTool;
  let argsMatch = true;
  for (const [key, val] of Object.entries(expected.expectedArgs)) {
    if (!result.tool?.args?.[key]?.toLowerCase().includes(val.toLowerCase())) {
      argsMatch = false;
      break;
    }
  }
  return { toolMatch, argsMatch, pass: toolMatch && argsMatch };
}

// ── MAIN ────────────────────────────────────────────────────────────────────

async function main() {
  console.log('╔══════════════════════════════════════════════════════════════╗');
  console.log('║         LLM Tool Calling Benchmark — Minecraft Bot         ║');
  console.log('╚══════════════════════════════════════════════════════════════╝');
  console.log(`\nEndpoint: ${LLM_URL}`);
  console.log(`Tests: ${TESTS.length}`);
  console.log(`Context length recommendation: 4096 tokens\n`);

  // Check if LLM is available
  console.log('Checking LLM connection...');
  try {
    const test = await callLLM('ping');
    console.log(`✓ LLM responding (${test.elapsed}ms)\n`);
  } catch (e) {
    console.error(`✗ LLM not available: ${e.message}`);
    console.error('  Load a model in LM Studio first, then re-run this test.');
    process.exit(1);
  }

  const results = [];

  for (let i = 0; i < TESTS.length; i++) {
    const test = TESTS[i];
    process.stdout.write(`[${i + 1}/${TESTS.length}] ${test.description}... `);

    try {
      const llmResult = await callLLM(test.prompt);
      const parsed = parseResponse(llmResult.content);
      const match = checkMatch(parsed, test);

      const status = match.pass ? '✓ PASS' : (match.toolMatch ? '~ ARGS' : '✗ FAIL');
      console.log(`${status} (${llmResult.elapsed}ms, ${llmResult.tokensPerSec.toFixed(1)} t/s)`);
      console.log(`    Tool: ${parsed.tool?.name || 'NONE'} | Expected: ${test.expectedTool}`);
      if (!match.argsMatch && parsed.tool) {
        console.log(`    Args: ${JSON.stringify(parsed.tool.args)} | Expected: ${JSON.stringify(test.expectedArgs)}`);
      }
      if (!parsed.tool) {
        console.log(`    Raw: ${llmResult.content.substring(0, 120)}`);
      }

      results.push({
        test: test.description,
        pass: match.pass,
        toolMatch: match.toolMatch,
        argsMatch: match.argsMatch,
        tool: parsed.tool?.name || null,
        expected: test.expectedTool,
        time: llmResult.elapsed,
        tps: llmResult.tokensPerSec,
      });
    } catch (e) {
      console.log(`✗ ERROR: ${e.message}`);
      results.push({
        test: test.description,
        pass: false,
        toolMatch: false,
        argsMatch: false,
        tool: null,
        expected: test.expectedTool,
        time: 0,
        tps: 0,
        error: e.message,
      });
    }

    // Small delay between calls
    await new Promise(r => setTimeout(r, 500));
  }

  // ── SUMMARY ─────────────────────────────────────────────────────────────
  console.log('\n═══════════════════════════════════════════════════════════════');
  console.log('                         RESULTS');
  console.log('═══════════════════════════════════════════════════════════════');

  const passed = results.filter(r => r.pass).length;
  const toolCorrect = results.filter(r => r.toolMatch).length;
  const totalTime = results.reduce((s, r) => s + r.time, 0);
  const avgTime = totalTime / results.length;
  const avgTps = results.filter(r => r.tps > 0).reduce((s, r) => s + r.tps, 0) / results.filter(r => r.tps > 0).length || 0;

  console.log(`\n  Tool Accuracy:  ${toolCorrect}/${results.length} (${(toolCorrect / results.length * 100).toFixed(0)}%)`);
  console.log(`  Full Accuracy:  ${passed}/${results.length} (${(passed / results.length * 100).toFixed(0)}%)`);
  console.log(`  Avg Response:   ${avgTime.toFixed(0)}ms`);
  console.log(`  Avg Speed:      ${avgTps.toFixed(1)} tokens/sec`);
  console.log(`  Total Time:     ${(totalTime / 1000).toFixed(1)}s`);

  // Grade
  const pct = toolCorrect / results.length * 100;
  let grade;
  if (pct >= 90) grade = 'A — Excellent';
  else if (pct >= 80) grade = 'B — Good';
  else if (pct >= 70) grade = 'C — Decent';
  else if (pct >= 60) grade = 'D — Needs work';
  else grade = 'F — Bad for this task';

  console.log(`\n  Grade: ${grade}`);
  console.log('\n═══════════════════════════════════════════════════════════════\n');

  // Failed tests detail
  const failed = results.filter(r => !r.toolMatch);
  if (failed.length > 0) {
    console.log('FAILED TESTS:');
    for (const f of failed) {
      console.log(`  - ${f.test}: got "${f.tool}", expected "${f.expected}"`);
    }
    console.log('');
  }
}

main().catch(console.error);
