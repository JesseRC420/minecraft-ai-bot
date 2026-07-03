# LLM Benchmark Results — Minecraft AI Bot

Tool calling accuracy and speed tests for local LLMs used by the bot.

**Hardware:** Single RTX 5060 Ti 16GB
**Test script:** `test-llm.js`
**Endpoint:** `http://127.0.0.1:1234/api/v1/chat` (native LM Studio)
**Context length:** 4096 tokens
**Test cases:** 15 (basic tools, complex tools, task management, chat, edge cases)

## How to Test

1. Load a model in LM Studio (set context length to 4096)
2. Update `MODEL_NAME` in `test-llm.js` to match the loaded model
3. Run `node test-llm.js`
4. Add results to the table below

## Results

| Rank | Model | Params | Tool Accuracy | Full Accuracy | Avg Response | Tok/s | Grade | Notes |
|------|-------|--------|--------------|---------------|-------------|-------|-------|-------|
| 🥇 | nvidia/nemotron-3-nano-4b | 4B | 100% (15/15) | 100% (15/15) | 932ms | 113.6 | A+ | PERFECT score — every tool correct with correct args. Fast + accurate. Best model tested. |
| 🥈 | gemma-4-e4b-it-nvfp4 | 4B (nvfp4) | 100% (15/15) | 93% (14/15) | 261ms | 92.2 | A | Perfect tool selection, fast response, only 1 minor args issue (bare drop name). NVFP4 quantized variant. |
| 🥉 | qwen3-4b-function-calling-xlam-unsloth | 4B | 100% (15/15) | 87% (13/15) | 1658ms | 110.4 | A | Perfect tool selection! Purpose-built for function calling. 2 minor args issues (bare names, wrong coords) |
| 4th | PrismML Bonsai-8B | 8B | 93% (14/15) | 60% (9/15) | 131ms | 138.8 | A | Blazing fast, excellent tool selection, some missing args on bare tool names. Only fail: complete_task returns "mine" |
| 5th | deepreinforce-ai_ornith-1.0-9b | 9B | 93% (14/15) | 80% (12/15) | 1397ms | 62.4 | A | Solid tool calling, 1 fail: place vs use_block confusion |
| 6th | qwen3.5-9b-uncensored-hauhaucs-aggressive | 9B | 93% (14/15) | 87% (13/15) | 1712ms | 61.4 | A | Good tool calling, 1 fail: use_block confusion. Uncensored = says anything. |
| 7th | google/gemma-4-12b-qat | 12B | 100% (11/11) | — | ~7000ms | 46.7 | A* | Thinking model (always-on reasoning). Perfect accuracy but 4-15s per response. |

## Grades

- **A+** (100%): Perfect — use this
- **A** (90%+): Excellent — reliable for all tasks
- **B** (80-89%): Good — reliable for most tasks
- **C** (70-79%): Decent — works but misses some tools
- **D** (60-69%): Needs work — frequently wrong tool selection
- **F** (<60%): Bad — not suitable for tool calling

## Recommendation

**Best for Minecraft bot: nvidia/nemotron-3-nano-4b**
- 100% tool accuracy with correct arguments
- 113.6 t/s — fast enough for real-time responses
- 4B params — lightweight, fits in 16GB easily

**Runner-up: gemma-4-e4b-it-nvfp4**
- 100% tool accuracy, fastest response time (261ms)
- 1 minor args issue (occasionally omits arguments on bare tool names)

## Test Cases

1. Chop wood → `chop()`
2. Mine stone → `mine(block:"stone")`
3. Drop cobblestone → `drop(item:"cobblestone")`
4. Eat food → `eat()`
5. Craft wooden pickaxe → `craft(item:"wooden_pickaxe")`
6. Use crafting table → `use_block(block:"crafting_table")`
7. Go to coordinates → `goto(x, y, z)`
8. Attack zombie → `attack(target:"zombie")`
9. Hunt sheep → `hunt(animal:"sheep")`
10. Stop movement → `stop()`
11. Add task (build house) → `add_task(text:"...")`
12. Complete task → `complete_task(id:"...")`
13. Chat hello → `chat(message:"...")`
14. Place torch → `place(block:"torch")`
15. Dig down → `dig(direction:"down")`
