**gl.nondet.exec_prompt() consistently returning an empty string on studionet — reproducible across every validator/model, 3 separate transactions**

Deployed a contract to **studionet** via Studio (address `0xd004Fc3c0f79B181767f5B56D409B2AE945b45aB`). Its `research()` method calls:

```python
def call_llm() -> str:
    response = gl.nondet.exec_prompt(prompt)
    return response.strip()

raw_result = gl.eq_principle.prompt_comparative(call_llm, principle="...")
```

`raw_result` comes back as `""` every time, which then throws inside my own JSON parsing — but the root cause is upstream of my code, in the LLM call itself:

```
File "/contract.py", line 71, in _parse_result
    parsed = json.loads(raw)
json.decoder.JSONDecodeError: Expecting value: line 1 column 1 (char 0)
```

**Why I think this is router/infra-side, not my contract:** across 3 separate transactions, *every* validator hit the identical empty-response error — regardless of which model was assigned (`claude-sonnet-4-6`, `gpt-5.4`, `gemini-3-flash-preview`, `deepseek-v3.2`, `gpt-oss-120b`). I also shrank the prompt significantly between attempts (dropped from ~8000 chars to ~3000) and got the exact same failure, so it's not a prompt-size/first-token-timeout thing on my end. Every failing validator's config routes through `router.ygr.ai` (`"provider": "llm-router"`) as primary, with `openrouter.ai` as secondary.

Transaction hashes with full receipts showing this:
- `0x353355aba4004f12fc198ff1366bc71f587e092012cece8a3ce247b235374bfb`
- `0xe865b30fb89ef212d631d9f21685257bbe08c17bfb08226875bfb45d3c8118ff`

A third transaction (`0x3c965c2ab43cba2a109b097914b83bf0320c9d95a26e0664c25b896dc3830949`) never even reached ACCEPTED status after ~2.5 minutes of polling across 8 retries.

Is this a known issue with the LLM router right now? Happy to share the full receipt JSON for either tx if useful.
