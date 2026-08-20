# { "Depends": "py-genlayer:1jb45aa8ynh2a9c9xn3b7qqh8sm5q93hwfp7jqmwsfhh8jpz09h6" }
from genlayer import *

# Intelligent Contract: grounded research synthesis.
#
# The line above is REQUIRED and must be the file's literal first line, before
# any other comment or import — GenVM's schema loader parses it as the
# "runner comment" declaring which GenVM SDK build to run against. Its total
# absence produced Studio's `invalid_contract absent_runner_comment` error;
# an earlier version of this file had a plain explanatory comment in that
# position instead, which GenVM couldn't parse as a version declaration
# either (it logged "runner comment does not start with version, using
# default" and still failed schema loading). Confirmed against
# docs.genlayer.com/developers/intelligent-contracts/tooling-setup, which is
# the only page here that's actually been validated against live Studio
# errors rather than just described secondhand — if the contract ever needs
# rebuilding, treat that page as the more trustworthy source.
#
# Everything below is otherwise unchanged: takes a query and a list of
# candidate source chunks (already narrowed down by embedding similarity in
# the Next.js backend — this contract does not do retrieval), and returns a
# grounded answer plus the subset of source IDs actually used. That citation
# decision is what gets validator consensus via gl.eq_principle.prompt_comparative
# (confirmed against docs.genlayer.com/developers/intelligent-contracts/features/non-determinism)
# — it's the one part of this pipeline that's a genuine judgment call rather
# than deterministic retrieval.


class ResearchContract(gl.Contract):

    def __init__(self):
        pass

    @gl.public.write
    def research(self, query: str, sources: list[dict]) -> dict:
        prompt = self._build_prompt(query, sources)

        def call_llm() -> str:
            response = gl.nondet.exec_prompt(prompt)
            return response.strip()

        raw_result = gl.eq_principle.prompt_comparative(
            call_llm,
            principle=(
                "The set of cited source IDs in citationsUsed should be "
                "identical, and the answer text should be semantically "
                "equivalent even if worded differently."
            ),
        )

        return self._parse_result(raw_result, sources)

    def _build_prompt(self, query: str, sources: list[dict]) -> str:
        source_block = "\n\n".join(
            f"[Source {s['id']}] {s['title']}:\n{s['content']}" for s in sources
        )
        return f"""Answer the query using ONLY the sources below. Ground every
claim in an explicitly provided source.

Query: {query}

Sources:
{source_block}

Return strict JSON: {{"answer": "...", "citationsUsed": ["<source id>", ...]}}
Only include a source ID in citationsUsed if its content was actually used.
"""

    def _parse_result(self, raw: str, sources: list[dict]) -> dict:
        import json
        # Seen in testing: gl.nondet.exec_prompt() returning "" instead of a
        # response, likely a first-token timeout on a large/noisy prompt —
        # raising here directly instead of letting json.loads blow up gives
        # a message that actually says what happened.
        if not raw:
            raise Exception("LLM returned an empty response (likely a timeout) — no JSON to parse")
        cleaned = raw.strip()
        if cleaned.startswith("```"):
            cleaned = cleaned.removeprefix("```json").removeprefix("```").removesuffix("```").strip()
        try:
            parsed = json.loads(cleaned)
        except json.JSONDecodeError:
            # Models sometimes add a short explanation around the JSON. Keep
            # the contract strict while accepting the first complete object.
            start = cleaned.find("{")
            end = cleaned.rfind("}")
            if start < 0 or end <= start:
                raise Exception("LLM returned no JSON object")
            parsed = json.loads(cleaned[start:end + 1])
        valid_ids = {s["id"] for s in sources}
        return {
            "answer": str(parsed.get("answer", "")).strip(),
            "citationsUsed": [c for c in parsed.get("citationsUsed", []) if c in valid_ids],
        }
