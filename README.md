# citeflow-genlayer

A standalone demo app, forked from CiteFlowAI's product concept, that swaps the
final answer-generation step for a GenLayer Intelligent Contract instead of a
direct Gemini/Claude API call. Lives in its own repo, own Supabase project,
and own deploy target on purpose — it should never need to touch the main
CiteFlowAI app or its Arc/Circle production setup.

## What's different from the main app

- **No ownership verification.** Any wallet-connected user can register any
  public URL as a source. The main app gates registration behind proven
  domain/X/Medium/Substack/Arc House ownership; this demo drops that so a
  source can be registered and cited in one take. Don't carry this forward
  into anything handling real user funds without adding it back.
- **Generation runs on GenLayer, not Gemini/Claude.** Retrieval (which chunks
  are worth considering) is still local embedding similarity — deterministic,
  cheap, off-chain. The actual answer + citation decision is a single call to
  a GenLayer Intelligent Contract (`contracts/research_contract.py`), signed
  and submitted by a backend relayer so the end user never needs a GenLayer
  wallet. See `src/lib/genlayer/`.
- **Payment/settlement is unchanged**: Circle Programmable Wallets (email +
  PIN, no seed phrase) funding a treasury on Arc Testnet, same as the main
  app.
- **No agent economy surface.** No x402 endpoint, no MCP server — this app is
  website-only, for human researchers.

## Before this runs

`src/lib/genlayer/` and `contracts/research_contract.py` were written from
GenLayer's public docs without a live SDK to test against, so treat them as
**likely-correct, not confirmed-correct**. Two real bugs already found via
actual Studio errors (not just guessed) and fixed:

1. The contract originally called `gl.eq_principle.strict_eq(call_llm)`, a
   guessed function name that doesn't exist. Fixed to
   `gl.eq_principle.prompt_comparative(call_llm, principle="...")`, matching
   the confirmed example at docs.genlayer.com/developers/intelligent-contracts/features/non-determinism.
2. The file was missing GenVM's required "runner comment" — a literal first
   line, before any import, declaring which SDK build to run against:
   `# { "Depends": "py-genlayer:1jb45aa8ynh2a9c9xn3b7qqh8sm5q93hwfp7jqmwsfhh8jpz09h6" }`.
   Its absence produced Studio's exact `invalid_contract absent_runner_comment`
   error — confirmed by testing a plain docs-verbatim contract with no runner
   comment and getting the identical failure. This was the deeper cause; the
   `strict_eq` bug was real but not sufficient on its own to explain the
   error, since even a syntactically-correct contract without this comment
   fails the same way.

If Studio still rejects the current version, that's a real signal something
else needs fixing — re-check the error message against
docs.genlayer.com/developers/intelligent-contracts/tooling-setup and the
non-determinism page, the two pages here that have actually been checked
against live Studio errors rather than just described secondhand. Also still
worth verifying, in this order:

1. Scaffold a real contract via the GenLayer Skills plugin
   (`/plugin marketplace add genlayerlabs/skills`, per skills.genlayer.com)
   and diff its generated project against `contracts/research_contract.py` —
   in particular, `list[dict]` as a `@gl.public.write` parameter type hasn't
   been confirmed against a working example, only inferred.
2. Confirm the `genlayer-js` package name and its client/account/contract-call
   API against its own README (github.com/genlayerlabs/genlayer-js) —
   `src/lib/genlayer/client.ts`, `relayer.ts`, and `contract.ts` all depend on
   it. One thing already confirmed against that README: there's no raw RPC
   URL to configure — the client is created via a named chain preset
   (`localnet` / `studionet` / `testnetAsimov` / `testnetBradbury`) imported
   from `genlayer-js/chains`, which has the endpoint baked in.
3. Deploy `research_contract.py` (once corrected) via studio.genlayer.com,
   same flow already in use — the app is configured for **studionet**
   (`GENLAYER_NETWORK=studionet`), not testnetBradbury, because Bradbury was
   unreliable during setup. Trade-off: studionet is a shared hosted simulator;
   its persistence/uptime guarantees weren't confirmed here, so if a demo
   recording session hits flakiness, that's a plausible cause — worth
   re-checking testnetBradbury's status on docs.genlayer.com if this becomes
   a problem. Fill the deployed contract address into
   `GENLAYER_CONTRACT_ADDRESS`.
4. Fund the **relayer** account (`GENLAYER_RELAYER_PRIVATE_KEY`) separately —
   this is the account the app itself uses to call the contract at runtime,
   it doesn't need to be the same key you deployed with, but it does need its
   own funds on whichever network you deployed to.

## Setup

1. `npm install`
2. Create a **new, separate** Supabase project (do not reuse CiteFlowAI's).
   Run `supabase/migrations/00000000000000_initial_schema.sql` against it.
3. Circle: either reuse the main app's sandbox API key/app ID, or create a
   separate Circle account — either works since this is Arc Testnet, but a
   separate one keeps the two apps fully independent.
4. Copy `.env.example` to `.env.local` and fill in every value.
5. `npm run dev`

## Product surfaces

- `/research` runs funded, consensus-grounded research and displays citation
  and settlement receipts with the completed answer.
- `/register-article` lets wallet-authenticated creators register and price a
  public source.
- `/dashboard` shows the connected creator's registered sources, settled
  citations, and USDC earnings.
- `/docs` explains the researcher and creator workflows, payments, refunds,
  troubleshooting, and current demo limitations.

There is no standalone receipts page yet; receipts are shown within each
completed research result and retained in research history.
