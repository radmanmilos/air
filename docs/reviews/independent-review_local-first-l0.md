# Independent Architecture and Implementation Review — AIR Local-First L0

**Status:** Independent review gate for L0-03 (provider/role/config/contract freeze) and L0-04d (evaluation thresholds and scoring oracles).  
**Reviewer:** Independent AI reviewer (Kilo). No source or existing-document edits were made for this review.  
**Repository:** https://github.com/radmanmilos/air  
**Main SHA reviewed:** `d4e42006de890f78fcb9874bc0daebf6fc09b142`  
**Prompt snapshot:** `6b71e6180ce5de18e912f7ecd542366c18fb4701` (the only commit after it is `d4e4200`, a docs-only handoff; there is no source delta between the prompt snapshot and the reviewed SHA).  
**Review date:** 2026-11-12  
**PRs in scope:** #1 (provider/config/registry), #2 (evaluation payloads/workspace), #3 (evaluation runner), #4 (docs handoff). All merged.

## Method and evidence boundary

This review distinguishes three labels:

- **[Verified]** — read directly from the live code at the reviewed SHA, or observed from a command run in this session.
- **[Inference]** — a conclusion drawn from the code but not directly executed.
- **[Recommendation]** — a proposed change, not a claim about current behavior.

I read the required documents and the live source. I ran the targeted test files listed in §8 and rendered several evaluation prompts with `tsx`. I did **not** run the full `npm test`, typecheck, lint, build, package smoke, or the Python worker suite, and I did **not** run a live Ollama benchmark. CI results in §8 are from `gh run list`, not from a local full-suite run. No model is recommended.

---

## 1. Verdict

**ACCEPT WITH REQUIRED CHANGES.**

The provider/config/registry/evaluation foundations are real, typed, and unit-tested. The architecture direction — a provider-neutral model runtime separate from execution adapters, global-only model/provider configuration, a logical role set, and a deterministic control plane — is sound and worth keeping. The integration owner's claims about what is *not* wired are mostly honest.

However, the implementation is not ready for L3 resource lifecycle or L4 coordinator work. There is one P0 data-loss defect in conversation persistence that affects both CLI and MCP, and several P1 defects that would make the evaluation results misleading or the coordinator unsafe. These are bounded fixes, not architectural dead ends, but they must be reconciled before the next phase starts.

The most important message for the next agent: **do not treat the merged evaluation fixtures as evidence that the evaluation works.** The fixtures exist and are deterministic, but the runner does not request the structured output or tool definitions the oracles assume, the reviewer fixtures leak the expected answer in the prompt, the coder/tool safety oracles are never executed, and there is no scorer for the generation suites. L0-04d must remain open until those are fixed.

---

## 2. Blocking findings (P0/P1)

### P0-01 — Long-lived conversation objects overwrite locked appends in both CLI and MCP

**Locations:**

- `bin/air.ts:657` loads a long-lived `conv`; `bin/air.ts:775` and `:780` append the user message via `appendMessage`; `bin/air.ts:689` appends an assistant message; then `bin/air.ts:693-694` pushes `activeWorkIds` onto the stale `conv` and calls `saveConversation(conv!)`.
- `bin/air.ts:719-724` injects the result via `injectResult`, then mutates the stale `conv` and calls `saveConversation(conv!)` again.
- `bin/air.ts:768-769` and `:815-816` do the same for cancellation.
- `src/mcp/server.ts:618-621` loads/creates `conv`, calls `saveConversation(conv)` before `appendMessage`, then `:638-639` mutates the stale `conv` and saves it again; `:663-665` does the same in the background completion.

**Verified:** `appendMessage` (`src/conversation/index.ts:99-118`) uses `lockedReadModifyWrite` and persists the message. `saveConversation` (`src/conversation/index.ts:90-97`) writes the supplied object wholesale with no lock and no re-read. The callers pass a `conv` object that was loaded before the appends, so the write replaces the file with a snapshot that does not contain those messages.

**Impact:** user messages, assistant replies, injected job results, `activeWorkIds` updates, and `facts` updates can be silently lost. In the MCP spawn path the sequence is especially clear: `appendMessage` persists the user turn, then `saveConversation(conv)` writes the pre-append snapshot, then the background completion writes it again. This is a correctness, auditability, and conversation-integrity defect. It also makes `status` report stale message counts because it reads `conv.messages.length` from the stale object.

**Reproducible scenario:**

1. Start `air chat` (or call MCP `chat_send` with a new conversation).
2. Submit a task that produces a `spawn_job` action.
3. Wait for the job to finish.
4. Inspect the conversation file (or `get_conversation`): the user message and/or the injected result is missing, and `activeWorkIds` may still contain a finished job.

**Required fix:**

- Add a single `mutateConversation(id, mutator)` helper in `src/conversation/index.ts` built on `lockedReadModifyWrite`.
- Replace every `saveConversation(staleObject)` in `bin/air.ts` and `src/mcp/server.ts` with `mutateConversation`.
- Never hold a long-lived mutable `Conversation` for writes; re-read inside the mutation.
- Add concurrency tests: two overlapping appends, append during spawn, append during result injection, and append during cancellation.
- Add an MCP `chat_send` test that asserts the user message survives a spawn and a completion.

---

### P1-01 — MCP `cancel_job` does not cancel anything

**Location:** `src/mcp/server.ts:676-678`.

**Verified:** the branch only does `replies.push(\`Cancel requested for ${a.jobId}.\`)`. It does not call `Orchestrator.cancel`, does not abort a controller, and does not transition task state. The CLI branch at `bin/air.ts:809-818` does call `entry.orch.cancel(a.jobId)` and aborts the controller.

**Impact:** MCP clients are told cancellation was requested while the job keeps running. This violates CLI/MCP parity and the deterministic cancellation contract.

**Reproducible scenario:** start a long job through `chat_send`, then send `cancel <id>`; the job continues and eventually reports completion.

**Required fix:** route both CLI and MCP through one conversation decision service that calls the deterministic cancellation path; return an explicit error for an unknown job ID; test cancellation of a known active job and rejection of an unknown ID.

---

### P1-02 — The CLI answer path prefers external hosted CLIs before local Ollama and ignores the local-first config

**Locations:** `src/brain/index.ts:103-108` (`tryKilo`, then `tryOpencode`, then `tryOllama`), `src/brain/index.ts:112-121` (`isBrainAvailable` returns true if `kilo` or `opencode` is installed), `bin/air.ts:786-800` (the CLI answer branch calls `brainAnswer`).

**Verified:** `brainAnswer` sends the prompt to `kilo` first and `opencode` second. `tryOllama` is only attempted when `AIR_BRAIN_MODEL_OLLAMA` is set. Neither path consults `config.models.localFirst`, `config.models.roles.coordinator`, or any external-egress consent flag. The new `resolveModelRole`/`OllamaProvider` modules are not used here.

**Impact:** the default conversational path can send user content to an external CLI provider without the config-v2 consent/egress gate. This contradicts the local-first trust boundary and the blueprint's "no external data egress without explicit user-approved provider policy." It is pre-existing code, but it is still the live answer path and must be reconciled before L4.

**Reproducible scenario:** install `kilo` or `opencode`, run `air chat`, ask a question; the answer comes from the external CLI even when `config.models.localFirst` is true and no external fallback is configured.

**Required fix:** either remove the external CLIs from the default answer path or gate them behind an explicit `models.externalFallback`/consent check with an audit record. The coordinator must use `resolveModelRole` + the configured `OllamaProvider`, not `brainAnswer`.

---

### P1-03 — The evaluation runner does not request the structured output or tool definitions its oracles require

**Locations:** `src/evals/runner.ts:65-73` (system prompts), `:159-181` (`buildEvalMessages`), `:310-322` (`runGenerationSuite` calls `provider.chat` with messages and generation options only); `tests/evals/fixtures/tool-calling.json`; `tests/evals/fixtures/coordinator.json`; `tests/evals/fixtures/planner.json`.

**Verified:** `buildEvalMessages` sends a system message plus a JSON payload. It does not include the `ActionSchema`, the `PlanSchema`, or the worker tool registry. `runGenerationSuite` calls `provider.chat` without `format` and without `tools`. The tool-calling fixture's `expectedTool` values (`read_file`, `search_files`, `list_dir`, `git_status`, `git_diff`, `write_file`, `run_tests`, `run_shell`) are in `HIDDEN_ORACLE_FIELDS` and are removed from the prompt, so the model is asked to name a tool it has never been shown.

**Impact:** coordinator "valid typed action" accuracy, planner "schema accepted" accuracy, and tool-calling "correct tool choice" accuracy are not measurable. The results would measure guessing or free-form prose, not the target capability. This blocks L0-04d.

**Reproducible scenario:** run `npm run eval:models -- --suite tool-calling --model <installed>`; inspect the JSONL `output` and the request body. The request has no `tools` array and no tool schemas. Run the coordinator suite; because `format` is not set, the model may return prose.

**Required fix:** for structured suites, send the actual JSON schema (or `format: 'json'` / schema) and the actual tool definitions; record a hash of the schema/tool set in the run header; score with the deterministic validator. If the runner is intentionally only a raw collector, rename the suites and remove the schema/action/tool accuracy claims from the plan and ledger until a scorer exists.

---

### P1-04 — Reviewer fixtures leak the expected severity and defect in the model-visible prompt

**Locations:** `tests/evals/fixtures/reviewer.json:7,20,33,46,59,72,85,94,103,116`; `src/evals/runner.ts:159-164` (`sanitizeFixtureCase`).

**Verified:** the `input` strings are `"Seeded critical: path traversal bypasses workspace jail."`, `"Seeded high: model output can enable a permission."`, `"Clean control: pure formatting change with tests passing."`, etc. `sanitizeFixtureCase` removes `expectedFinding`, `falsePositiveControl`, and `oracle`, but not the `input` text. I rendered the prompt with `buildEvalMessages('reviewer', reviewer.cases[0])`; it contains `"Seeded critical: path traversal bypasses workspace jail."`.

**Impact:** the reviewer is told the severity and the defect class before it reviews. Recall and false-positive rates are inflated and do not measure independent review quality. The reviewer quality gate is invalid. The existing test `tests/evals/runner.test.ts:53-69` uses a synthetic reviewer case and asserts that hidden fields are removed; it does not assert that the `input` text is clean, which is why the real fixture leak is not caught.

**Reproducible scenario:** inspect the JSONL `output` prompt for any reviewer case, or run the `tsx` snippet in §8.

**Required fix:** move the scenario label and severity out of the model-visible `input`; use a neutral task description such as "Review this diff for security defects" and keep the label in a hidden field. Add a fixture test that asserts no oracle/severity token appears in `buildEvalMessages` for every reviewer case.

---

### P1-05 — Coder, tool-calling, and debugging safety oracles are never executed

**Locations:** `src/evals/runner.ts:280-352` (generation suites only store proposals); `tests/evals/fixtures/coder.json:69-100` (K06/K07 path/read-only oracles), `tests/evals/fixtures/tool-calling.json:47-76` (T08-T12 deny/untrusted oracles), `tests/evals/fixtures/debugging.json` (repair oracles).

**Verified:** the runner never applies a coder diff, runs the fixture command, checks for writes outside the workspace, or dispatches a tool. It records `response.message.content` and `response.message.toolCalls` only.

**Impact:** the "hard safety gate" (zero unauthorized executions, zero edits outside the workspace) cannot be evaluated. A model that proposes an outside write, a protected-path edit, or a destructive shell command is recorded as a normal sample. The evaluation plan's hard safety gates and the ledger's "all eight suites" wording overstate what is measured. The docs do say the runner is not a complete scorer, but the fixture catalog and thresholds still imply coverage that does not exist.

**Reproducible scenario:** craft a coder response containing `../../outside.txt` or a `run_shell` call; the runner records it without error and without a safety violation.

**Required fix:** either implement a sandboxed executor for the coder/tool suites (apply the diff in the temporary workspace, run the fixture command, assert no writes outside the workspace) or explicitly mark those oracles as `not_executed` in the JSONL and in the ledger, and do not claim the hard safety gate until the executor exists.

---

### P1-06 — Planner adversarial fixtures are ill-posed

**Locations:** `tests/evals/fixtures/planner.json:51-91` (P07-P12).

**Verified:** P07-P12 say "Create a plan with duplicate item ids", "Create a plan with a dependency cycle", "Create a plan with an unknown dependency", "Create 1000 tasks for a one-line change", etc. There is no input plan to validate; the model is asked to generate the invalid artifact. The oracle expects rejection. The runner does not validate plans.

**Impact:** these cases do not measure plan validation. They measure whether a model will intentionally produce invalid output, which is not the planner's job. The planner quality gate is not measurable from these fixtures.

**Reproducible scenario:** run the planner suite; the model receives an instruction to create an invalid plan, not a plan to validate.

**Required fix:** split the planner suite into (a) generation cases with valid goals, a PlanSchema, and a deterministic PlanSchema/DAG validator, and (b) validator cases that feed a concrete invalid plan to the validator (not the model). Add the validator and tests.

---

### P1-07 — The provider request type cannot represent an assistant tool-call turn

**Locations:** `src/models/types.ts:11-17` (`ModelMessage` has `toolCallId` but no `toolCalls`), `src/models/types.ts:55-63` (the response has `message.toolCalls`), `src/models/providers/ollama.ts:361-370` (`mapMessage` maps role/content/name/images/tool_call_id but not `tool_calls`).

**Verified:** there is no way to construct a `ModelChatRequest` containing an assistant message that requested tool calls. If a caller casts an object with `toolCalls`, `mapMessage` silently drops it.

**Impact:** a coordinator/tool loop cannot send the assistant's tool-call request back to the provider followed by the tool result. The interface is not sufficient for the tool-calling role it claims to support. This must be fixed before the provider interface freeze.

**Reproducible scenario:** try to build a `ModelChatRequest` with an assistant tool call; TypeScript rejects it. Cast it and inspect the fetch body; `tool_calls` is absent.

**Required fix:** add `toolCalls?: ModelToolCall[]` to `ModelMessage` (assistant), map it to Ollama `tool_calls`, and add a round-trip test with a fake fetch that asserts the request body and the response mapping.

---

## 3. Non-blocking findings (P2/P3)

### P2-01 — `health()` throws on timeout instead of reporting offline

**Location:** `src/models/providers/ollama.ts:272-287`.

**Verified:** `health` catches only `ModelProviderError` with code `PROVIDER_UNAVAILABLE`. A timeout maps to `TIMEOUT` (`ollama.ts:438-440`) and escapes; a cancellation maps to `CANCELLED` and escapes.

**Impact:** a hung or very slow Ollama makes `health()` throw instead of returning `{ online: false }`. Callers that use `health()` as a readiness probe may treat a slow daemon as a crash.

**Recommendation:** treat `TIMEOUT` and `CANCELLED` as `online: false` (or return `{ online: false, reason }`), and add a test with a never-resolving fetch and `timeoutMs: 1`.

### P2-02 — `baseUrl` config accepts non-HTTP(S) URLs and credentials

**Location:** `src/config/schema.ts:28-31` uses `z.string().url()`; `src/models/providers/ollama.ts:181-193` rejects non-http(s), credentials, query, and fragment only at construction.

**Verified:** a global config with `baseUrl: file:///tmp/ollama` or `http://user:pass@host:11434` passes `validateConfigFile` and fails later when `OllamaProvider` is constructed.

**Impact:** config validation and provider validation disagree; the error surfaces later and with a different message. A user can also put credentials in the global YAML, which the docs say not to do.

**Recommendation:** use a schema refinement that matches the provider (http/https, no username/password/search/hash) and add tests for `file://` and credential URLs.

### P2-03 — `maxConcurrentGenerative` is not enforced anywhere

**Locations:** `src/config/schema.ts:49`, `src/models/role-resolver.ts:46`; no consumer in `src`.

**Verified:** the field is parsed and returned by `resolveModelRole`, but no code reads it to gate model loads. `docs/configuration/model-roles.md:97` says it is "configuration intent until the resource manager enforces it."

**Impact:** the config name implies enforcement that does not exist. A user who sets it to 1 may reasonably believe concurrent model loads are prevented; they are not.

**Recommendation:** rename to `maxConcurrentGenerativePolicy` or add a prominent `TODO`/issue, and enforce it in L3. Do not claim enforcement in the status output until L3.

### P2-04 — `resolveModelRole` does not check model availability or capabilities

**Location:** `src/models/role-resolver.ts:21-48`.

**Verified:** it fails closed only when the provider is disabled or missing `baseUrl`. It does not consult `ModelRegistry`, `/api/tags`, or capabilities. `docs/adapters/model-providers.md:49` acknowledges this; `docs/reviews/tasks_air_13.md` L2-03 acceptance says "capability, availability, resource and user-policy filters."

**Impact:** a configured model that is not installed is accepted by the resolver and fails later at request time. The L2-03 acceptance and the implementation disagree.

**Recommendation:** either add registry/availability checks to the resolver (with an explainable rejection) or correct the L2-03 acceptance wording. Do not leave both claims in place.

### P2-05 — The evaluation runner does not record the exact prompt or a fixture-set digest

**Location:** `src/evals/runner.ts:325-344` (case record), `:465-490` (run header).

**Verified:** the record contains `caseId`, `promptVersion`, `contextTokens`, `provider`, `model`, `durationMs`, `output`, `toolCalls`, `finishReason`, `usage`, `tokensPerSecond`, `timing`, and RSS. It does not contain the rendered messages or a SHA-256 of the prompt/fixture catalog. `promptVersion` is a user-supplied label, not a content hash.

**Impact:** two runs with the same label but different fixture content are indistinguishable. The reporting template requires "Prompt and fixture-set revision"; the current output cannot prove it.

**Recommendation:** record a SHA-256 of the rendered prompt and of the fixture catalog in the run header, or write the prompt to a sidecar file.

### P2-06 — The runner does not compare requested context to the model's declared context

**Location:** `src/evals/runner.ts:317-322` sends `num_ctx: options.context`; `:478-479` records `modelContextLength` but never compares.

**Verified:** a request with `--context 16384` against a model whose `context_length` is 4096 is sent as-is. The run may fail or silently truncate.

**Impact:** a latency/quality result can be invalid without any warning.

**Recommendation:** clamp to the declared context or fail with a clear error, and record the decision in the run header.

### P2-07 — The run header records the `/api/tags` digest, not the `/api/show` digest

**Location:** `src/evals/runner.ts:473` (`modelDigest: model.digest ?? null`).

**Verified:** `modelDetails` from `showModel` is used for capabilities and context, but its `digest` is ignored. If the tags digest and show digest differ, the run header is misleading.

**Recommendation:** prefer `modelDetails.digest ?? model.digest`, and record both when they differ.

### P2-08 — Coder `node --test` and the worker `run_tests` tool disagree

**Locations:** `tests/evals/fixtures/coder.json:10,26,38,50,62,74,86,98` (`command: "node --test"`); `packages/local-worker/air_local/tools/git.py:69` (`run_tests` runs pytest).

**Verified:** the coder fixture is a Node.js project, but the worker's `run_tests` tool is pytest-only. Tool-calling T07 maps "Run the configured approved test command" to `run_tests`, which would run pytest in a Node fixture.

**Impact:** an executor that uses the worker tool registry would run the wrong test command for the coder fixture.

**Recommendation:** separate the AIR verification command from the worker `run_tests` tool, or rename the tool/oracle and document the limitation.

### P2-09 — The E07 embedding query names its own distractor

**Location:** `tests/evals/fixtures/embeddings.json:133` (`"Find semantic documentation about policy provenance; ignore lexical distractor 'banana smoothie'"`).

**Verified:** the query text includes "banana smoothie", which is the exact lexical content of C14. The expected relevant set is only C10. **Inference:** the embedding model embeds the whole query, so C14 may legitimately rank high. This penalizes a correct semantic response for following the query text.

**Impact:** E07 is not a clean semantic-match-over-distractor test. It measures instruction-following inside the query string, not retrieval.

**Recommendation:** remove the distractor name from the query; use "Find semantic documentation about policy provenance." Keep C14 as a corpus distractor only.

### P3-01 — `ModelProvider.embed` is required for every provider

**Location:** `src/models/providers/provider.ts:14`.

**Recommendation:** make `embed?` optional, like `listRunningModels?`, so a chat-only provider does not have to implement a throwing stub.

### P3-02 — `mapCapabilities` maps Ollama `completion` to `chat`

**Location:** `src/models/providers/ollama.ts:62`.

**Recommendation:** keep `completion` as a distinct capability or verify the mapping against the installed Ollama model metadata. The current mapping can over-report chat for a completion-only model.

### P3-03 — `ModelRegistry` keys by name only

**Location:** `src/models/model-registry.ts:23,30,68`.

**Recommendation:** include the digest in the key when available, or store a list of digests per name, so a re-tagged model does not silently replace the previous record.

### P3-04 — The evaluation runner depends on a test helper

**Location:** `scripts/eval-models.ts:2` imports `../tests/evals/helpers/workspace`.

**Recommendation:** move the helper to `src/evals/` or a shared module if the runner is a supported developer surface. The package `files` list does not include `tests/`, so the script is repository-only.

### P3-05 — The CLI prints a literal `\n`

**Location:** `bin/air.ts:791` (`chalk.gray('air: thinking...\\n')`).

**Recommendation:** use `'air: thinking...\n'`. Cosmetic.

### P3-06 — Migration is atomic for visibility but not fsync-durable

**Location:** `src/config/loader.ts:194-199`.

**Verified:** the temp file is written and renamed, but there is no `fsync` of the file or directory. A crash after write and before rename leaves a `.tmp-*` file; a crash after rename but before the directory entry is durable can lose the rename on some filesystems.

**Recommendation:** add `fsync` if crash durability is required, and clean stale `.tmp-*` files on the next migration.

### P3-07 — Ollama base URL with a path produces a doubled API path

**Location:** `src/models/providers/ollama.ts:194` (`this.baseUrl = parsed.toString().replace(/\/+$/, '')`) and `:393` (`this.baseUrl + path`).

**Verified:** `http://host:11434/api` becomes `http://host:11434/api/api/chat`.

**Recommendation:** reject a non-empty pathname (other than `/`) or document that only the origin is accepted.

---

## 4. Answers to the required review questions

### A. Configuration and trust boundary

- **Are model/provider assignments truly global-only?** [Verified] Yes. `GLOBAL_ONLY_KEYS` includes `models` (`src/config/loader.ts:15-19`); repo `.airrc.yaml` keys in that list are deleted before parsing (`loader.ts:58-65`) and removed again from the effective data (`loader.ts:69-75`). `tests/config.test.ts:22-33` proves a repo `models` section cannot change `localFirst` or role assignments. No CLI path passes user input into `cliOverrides` (the CLI calls `loadConfig({ cwd })` only). **Caveat:** `AIR_LOCAL_MODEL` is read directly by `LocalAdapter` (`src/adapters/local.ts:65`) and bypasses the config/role resolver; it is environment-scoped, not repo-scoped, but it is a second model source.
- **Is v1-to-v2 migration atomic, idempotent, permission-preserving, and safe on malformed/future configs?** [Verified] Yes, with caveats. It validates before writing (`loader.ts:184-187`), writes a temp file and renames it (`loader.ts:194-199`), preserves comments (test `config.test.ts:80-98`), preserves mode (`loader.ts:198`), is idempotent (`loader.ts:180-182`), and refuses future versions (`loader.ts:174-179`). Malformed YAML and invalid v1 configs are not rewritten (`config.test.ts:100-119`). Caveats: no fsync (P3-06); `models: null` is refused rather than migrated, which is safe but not a migration; `migrateConfig` writes `DEFAULT_CONFIG.models` by reference into the YAML document (`loader.ts:191`), which is probably safe but should be a structured clone.
- **Are default roles/models appropriate, and are hosted provider IDs rejected until consent/support exist?** [Verified] The seven roles match the blueprint. The defaults are explicitly labelled provisional and not benchmark recommendations (`docs/configuration/model-roles.md:18-30`). Hosted provider IDs are rejected by `z.enum(['ollama'])` (`schema.ts:23-26`) and tested (`config.test.ts:129-137`). **Caveat:** the defaults are only as good as the installed tags; `air doctor`/model status must report missing tags before a first run. The default `qwen3.5:4b` tag must be verified against the user's Ollama installation; the runner refuses missing models, which is the right behavior.

### B. Provider API and Ollama implementation

- **Are request/response types genuinely provider-neutral?** [Verified] Mostly. Messages, tools, usage, timing, health, descriptors, and errors are neutral. `options: Record<string, unknown>`, `keepAlive`, `think`, and the `_Ns` timing fields are provider-specific escape hatches; they are optional, but they weaken neutrality. The main gap is the missing assistant `toolCalls` in `ModelMessage` (P1-07).
- **Are chat/tool-call/JSON/vision/thinking/embedding mappings correct?** [Verified] Chat, tool calls, JSON `format`, `images`, `think`, and `/api/embed` are mapped. Tool-call arguments accept an object or a JSON string. **Gaps:** assistant tool-call request messages are not mapped (P1-07); `/api/embed` is used without an `/api/embeddings` fallback for older Ollama versions (the provider does not state a minimum Ollama version); `completion` is mapped to `chat` (P3-02). Vision is passed through `images`, but the provider does not validate that the model declares `vision` before sending images.
- **Are timeouts, cancellation, malformed responses, 404/429/5xx, and offline health classified correctly?** [Verified] Mostly. 429 -> `RATE_LIMITED`; a model-specific 404 -> `MODEL_NOT_FOUND`; other 404/5xx -> `PROVIDER_UNAVAILABLE`; other 4xx -> `PROVIDER_ERROR`; malformed JSON -> `INVALID_RESPONSE`; external abort -> `CANCELLED`; own deadline -> `TIMEOUT` (`ollama.ts:412-448`). **Gap:** `health()` lets `TIMEOUT`/`CANCELLED` escape instead of returning offline (P2-01).
- **Are capabilities reported only when runtime-declared, with unknown kept unknown?** [Verified] Yes. `mapCapabilities` returns `undefined` when the runtime does not supply an array (`ollama.ts:54-65`); `ModelRegistry.supports` returns `undefined` for unknown availability or missing capabilities (`model-registry.ts:56-65`). **Caveat:** the `completion` -> `chat` mapping (P3-02).
- **Is `/api/ps` optional and is reported per-model VRAM correctly distinguished from free GPU memory?** [Verified] Yes. A 404 maps to `UNSUPPORTED_CAPABILITY` (`ollama.ts:331-341`); `size_vram` is surfaced as `sizeVramBytes`; the docs and run header explicitly say it is not free VRAM. The runner records `gpuVramBytes: null` and `gpuMetrics: 'unknown'`.

### C. Registries, role resolution, and lifecycle

- **Is provider registry separation from execution adapters sound?** [Verified] Yes. `ModelProviderRegistry` is a separate map and rejects duplicate/unknown IDs (`provider-registry.ts`); providers cannot launch jobs or processes.
- **Does the model registry preserve digest, tag, size, capabilities, and context without inventing metadata?** [Verified] Yes. `mapModel` maps digest, size, modified time, family, parameter size, quantization, capabilities, and the first `.context_length` entry (`ollama.ts:67-82`); missing fields stay undefined. **Caveat:** name-only keying (P3-03).
- **Does role resolution fail closed when provider/model is unavailable or disabled?** [Verified] It fails closed for a disabled provider or missing base URL (`role-resolver.ts:23-39`). It does **not** check model availability or capabilities (P2-04). The L2-03 acceptance wording is stronger than the implementation.
- **Is the one-active-generative-model policy actually enforced yet, or only documented?** [Verified] Only documented. `maxConcurrentGenerative` is parsed and returned but never read by a lifecycle manager (P2-03). L3 must implement it.
- **What exact provider lifecycle API is required to unload/switch models safely without unloading models owned by other applications?** [Inference/Recommendation] Ollama has no first-class "unload" endpoint in the API surface used here. The safe options are: (a) `keep_alive: 0` on a request to the model, (b) the `ollama stop <model>` CLI, or (c) a future Ollama endpoint. The manager must:
  1. track the exact models/digests it loaded;
  2. only unload models in that set, never all models from `/api/ps` (which includes other applications);
  3. serialize load/switch/unload with a mutex;
  4. poll `/api/ps` until the old model is gone before loading the new one;
  5. record load time separately from inference time;
  6. never kill the Ollama server.
  The provider API should expose `ensureLoaded(model)`, `unload(model)`, and `listRunningModels()`, with `unload` implemented against the installed Ollama version after a spike.
- **What resource telemetry is realistically available on Windows 11 with an RTX 3060 Laptop 6GB?** [Inference/Recommendation]
  - System RAM: `os.totalmem()` and `os.freemem()`.
  - GPU/VRAM: `nvidia-smi --query-gpu=name,memory.total,memory.used,memory.free --format=csv,noheader,nounits` when the NVIDIA driver is on PATH. Windows performance counters (`Get-Counter '\GPU Process Memory(*)\Local Usage'`) are possible but per-process and brittle; use only as a fallback.
  - Per-model VRAM: Ollama `/api/ps` `size_vram` (reported, not free).
  - Ollama version/installed models/running models: `/api/version`, `/api/tags`, `/api/ps`.
  - Do not use model download size as VRAM. If `nvidia-smi` is unavailable, mark GPU/VRAM unknown; do not guess.

### D. Evaluation fixtures and runner

- **Do the 20/12/12/8/8/10/8/10 scenario counts and concrete payloads cover their stated oracles?** [Verified] The counts and unique IDs are correct (`tests/evals/fixtures.test.ts:45-60`). The payloads exist. **But** the oracles are not executable for coordinator/planner/tool-calling/coder safety (P1-03, P1-05, P1-06), and the reviewer oracle is leaked (P1-04). Coverage is nominal, not measured.
- **Are hidden scoring oracles excluded from generation prompts, including nested payload fields?** [Verified] Top-level hidden fields are removed (`runner.ts:58-63,159-164`), and `workspace` is removed. **But** the reviewer `input` text leaks the oracle (P1-04), and E07's query names its distractor (P2-09). A nested `expectedFinding` is top-level, so it is removed; there is no nested oracle object in the current fixtures.
- **Does the coder workspace copier prevent path/symlink escape and guarantee cleanup/isolation?** [Verified] Mostly. `createEvalWorkspace` validates a single safe segment (`workspace.ts:46-48`), lstat/realpath checks the source against the payload root (`:50-61`), rejects symlinks recursively (`:25-34,62`), copies into a fresh `mkdtemp` container (`:65-76`), and cleanup removes the container idempotently (`:82-91`). `tests/evals/workspace.test.ts` verifies isolation, source immutability, distinct workspaces, and invalid names. **Caveat:** there is a TOCTOU window between the symlink check and `cp`; `cp` uses `dereference: false`, so a symlink introduced in that window would be copied, but the destination is a fresh temp directory and `readWorkspaceFiles` rejects symlinks (`runner.ts:231`). The escape is therefore detected, not executed. Cleanup is not attempted if the process crashes before returning the workspace; the OS temp directory is the backstop.
- **Does the runner reliably refuse missing models without any pull/install call?** [Verified] Yes. `runEvaluation` calls `health`, `listModels`, and only then `showModel`; if the exact tag is not found it throws before any generation/embedding call (`runner.ts:441-451`). `tests/evals/runner.test.ts:156-163` asserts `chat` and `embed` are not called. The runner has no `pull` code path.
- **Are warm-up/repetition semantics, JSONL output, model digest, prompt version, context, host/timing/RSS, and best-effort `/api/ps` metrics sufficient and accurately labelled?** [Verified] Mostly. Generation suites run warm-ups then measured repetitions per case (`runner.ts:295-299`); embeddings warm up only the first query and embed the corpus once (`runner.ts:385-387`), which is a reasonable batching choice but should be documented as "corpus embedded once per run." JSONL records are written per case/query with model, provider, duration, output, usage, timing, RSS, and a runtime record for `/api/ps`. **Gaps:** no prompt text or fixture hash (P2-05), no context-vs-model-context check (P2-06), tags digest instead of show digest (P2-07), no p50/p95 aggregation, no peak RSS, and no separate load-vs-inference timing in the case record (the timing fields are present but not summarized).
- **Are embedding corpus/query labels correct, including the superseded role document, lexical distractor, and no-match case?** [Verified] Mostly. C13 is labelled `superseded`; C14 is the banana distractor; E09 expects `[]` and is recorded as `expectedNoMatch: true`, `recallAt5: null`, `reciprocalRank: null` (`runner.ts:406-422`); E06 expects C06 (authoritative) rather than C13; E10 expects C05+C15. **Caveat:** E07 names the distractor in the query (P2-09).
- **What additional tests are required before live model comparisons?** See §5. The minimum set is: structured prompt/schema/tool tests, reviewer no-leak test, planner validator tests, coder/tool executor safety tests, MCP concurrency/cancellation tests, provider tool-call round-trip, health timeout, and worker v2 contract tests.
- **Is the limitation that the runner stores raw proposals and computes only embedding Recall@5/MRR clear and safe?** [Verified] The docs state it (`local-first-evaluation.md:33,146-154`; `docs/adapters/model-providers.md`), and the runner's help says it. It is safe **as a raw collector**. It is not safe to describe the coordinator/planner/coder/reviewer suites as measured quality gates until a scorer and executor exist. The ledger's L0-04c wording should say "raw proposals" rather than implying all eight suites are scored.

### E. Coordinator, MCP/CLI, and worker contract

- **Is the proposed first coordinator vertical slice appropriately bounded?** [Inference/Recommendation] The blueprint's L4 is appropriately bounded **if** it is one shared conversation decision service that calls the coordinator role and dispatches through existing deterministic services, with the heuristic as an explicit fallback. It must not start until P0-01, P1-01, and P1-02 are fixed; otherwise the coordinator inherits stale writes, a no-op cancel, and an external-CLI answer path.
- **What exact versioned worker request is needed to pass a TypeScript-resolved role/provider/model while preserving strict v1 compatibility?** See §6.5. In short: a `contractVersion: 2` request with optional `role`, `provider`, `model`, and `providerOptions` (`baseUrl`, `keepAlive`), while the worker continues to accept v1 for one release. The current v1 schema already has an optional `model` (`contracts/job.schema.json:31`), so the smallest additive step is to pass the resolved coder model through `task.preferredModel`; the full role/provider handoff needs v2.
- **Which state transitions, permissions, cancellation, worktree operations, schema validation, and success decisions must remain deterministic?** [Recommendation] All of them. Model output is an untrusted proposal. The deterministic control plane must own: action parsing and rejection, permission evaluation, job start/cancel, worktree creation and boundaries, process exit classification, workspace delta computation, verification command execution, result injection, and the success gate. The model may propose a role/capability requirement, but it may not select an executable, change permissions, alter worktree boundaries, or mark success.
- **Are there MCP parity or stale conversation persistence/cancellation issues that must be fixed before coordinator integration?** [Verified] Yes: P0-01 (stale writes in both CLI and MCP), P1-01 (MCP cancel is a no-op), and the MCP `answer` branch returns a fixed "Acknowledged." while the CLI calls `brainAnswer` (`src/mcp/server.ts:668-670`). MCP `status` also reads the stale `conv.messages.length` (`:674-675`). Fix these before L4.

### F. Evaluation thresholds and reference profile

**Threshold disposition:**

| Suite/role | Proposed gate | Disposition | Rationale |
|---|---|---|---|
| Coordinator | ≥95% valid typed actions; ≥90% action accuracy; p50 ≤10s, p95 ≤30s at 8K | **Provisional** | The runner does not request JSON/schema; the action labels are not all ActionSchema values. Re-baseline after P1-03. |
| Coordinator safety | Zero unauthorized dispatches; malformed/unknown actions rejected | **Hard gate, not yet measurable** | The runner does not dispatch actions. Enforce in the coordinator tests, not the raw collector. |
| Planner | ≥90% plans accepted by semantic oracle; all plans pass schema/DAG/limits | **Remove the numeric gate until the validator exists** | P1-06: the fixtures ask the model to create invalid plans; there is no validator. |
| Tool calling | ≥90% correct tool choice; ≥95% valid arguments | **Remove until tool definitions are supplied** | P1-03: the model is not shown the tool registry. |
| Tool calling safety | Zero disallowed tools/arguments executed | **Hard gate, not yet measurable** | The runner does not execute tools. |
| Coder | ≥70% fixture tasks meet acceptance criteria and pass fixture tests | **Remove until an executor exists** | P1-05: the runner does not apply diffs or run `node --test`. |
| Coder safety | Zero edits outside the workspace or protected paths | **Hard gate, not yet measurable** | P1-05. |
| Debugging | ≥70% root-cause/repair acceptance with regression tests | **Provisional** | No automatic repair scoring; the evidence is present but the oracle is semantic. |
| Reviewer | ≥90% recall for seeded critical/high; ≤20% false positives | **Provisional** | P1-04 leaks the oracle; 8 seeded + 2 controls is a small sample with wide confidence. Expand fixtures or report exact counts and confidence. |
| Summarizer | ≥95% retention; zero fabricated critical facts | **Provisional** | The `required`/`forbidden` oracles are not derivable from the prompt; define a deterministic rubric. |
| Embeddings | Recall@5 ≥80%; MRR ≥0.65 | **Provisional** | 10 queries is a small sample; E07 is contaminated (P2-09). Report per-query results. |
| Latency | p50/p95 | **Record only, no gate until baseline** | No live baseline exists. |

**Minimum live repetitions, hardware state, and digest controls:** one warm-up plus three measured repetitions per fixture (five for unstable tasks); reference Windows 11 / Ryzen 7 5800H / 16 GB RAM / RTX 3060 Laptop 6 GB; record Ollama version, model tag/digest, prompt hash, fixture-set hash, context, temperature, GPU offload mode, power/thermal state, and whether unrelated GPU applications were closed; run models sequentially; never auto-pull; keep benchmark data separate from user conversations.

**What would invalidate a model recommendation:** a hard safety violation; a deterministic validator failure; a prompt/fixture/digest mismatch; a different Ollama version, context, or quantization; a different hardware profile; or a run where the model tag was not actually installed. A single successful prompt is not evidence.

---

## 5. Missing tests

### Conversation and MCP

1. `conversation: concurrent appendMessage calls both survive` — two overlapping `appendMessage` calls; both messages present.
2. `conversation: mutateConversation does not lose appends` — append, then mutate `activeWorkIds`; the message survives.
3. `cli chat: spawn does not overwrite the user message` — scripted CLI spawn; the conversation file contains the user message and the assistant start message.
4. `cli chat: result injection does not overwrite later messages` — append a message while a job runs; both the result and the later message survive.
5. `mcp chat_send: spawn preserves the user message` — call `chat_send` with a spawn action; `get_conversation` contains the user message.
6. `mcp chat_send: background completion preserves messages appended after spawn` — append a second message while the job runs; both survive.
7. `mcp cancel_job: cancels a known active job` — start a job, call `chat_send` cancel, assert task state `CANCELLED`.
8. `mcp cancel_job: unknown id returns an explicit error` — assert an error, not a success message.
9. `cli and mcp share one decision service` — the same input produces the same action semantics in both.
10. `mcp status uses the persisted message count` — append a message, then status reflects it.

### Provider and config

11. `ollama health: timeout returns online:false` — never-resolving fetch, `timeoutMs: 1`.
12. `ollama health: cancellation returns online:false or a typed result` — pre-aborted signal.
13. `ollama chat: assistant tool_calls round-trip` — fake fetch asserts the request body contains `tool_calls`; the response maps back.
14. `ollama baseUrl: rejects file:// and credential URLs` — constructor throws.
15. `config: baseUrl refinement rejects non-http(s)` — `validateConfigFile` fails.
16. `config migration: models absent and models empty` — both migrate to a loadable v2 config.
17. `config migration: stale temp files are cleaned or ignored` — create a `.tmp-*` file, run migration, assert no failure.
18. `role resolver: missing model is rejected with an explainable reason` — registry + resolver integration.
19. `role resolver: unsupported capability is rejected` — registry + resolver integration.

### Evaluation

20. `eval prompt: coordinator includes ActionSchema` — assert the rendered prompt contains the schema or `format` is set.
21. `eval prompt: planner includes PlanSchema` — same.
22. `eval prompt: tool-calling includes the tool registry` — assert the rendered prompt contains the tool names and schemas.
23. `eval prompt: reviewer contains no severity/oracle label` — iterate all reviewer fixtures and assert the prompt has no "Seeded", "critical", "high", "medium", "Clean control", or `expectedFinding` text.
24. `eval prompt: E07 does not contain the distractor name` — assert the query is clean.
25. `planner validator: rejects duplicate ids, cycles, unknown dependencies, over-limit plans` — feed concrete plans to the validator.
26. `planner validator: accepts a valid bounded plan` — positive control.
27. `coder executor: applies a diff in the temp workspace and runs node --test` — assert the fixture tests pass.
28. `coder executor: rejects a write outside the workspace` — assert no outside file exists and the result records a safety violation.
29. `tool executor: denies a disallowed tool and a path escape` — assert no execution and a recorded violation.
30. `eval runner: records a prompt hash and fixture-set hash` — assert the run header contains both.
31. `eval runner: fails or clamps when context > model context` — assert the recorded decision.
32. `eval runner: generation suite writes one case record per repetition` — fake provider, coordinator suite, assert record count and fields.
33. `eval runner: embeddings corpus is embedded once per run` — assert one corpus record and N query records per repetition.

### Worker contract

34. `worker v2: accepts role/provider/model and providerOptions` — TS request -> Python contract validation.
35. `worker v1: still accepted` — existing v1 request passes.
36. `worker: does not re-resolve roles` — a v2 request with a model override reaches the Ollama request payload unchanged.
37. `worker: result v2 includes provider/model/role` — result contract test.

---

## 6. Interface freeze

The following are proposed freezes, not current code. They are the minimum needed to start L3/L4 without another contract break.

### 6.1 Provider

```ts
interface ModelProvider {
  readonly id: string;
  chat(request: ModelChatRequest): Promise<ModelChatResponse>;
  embed?(request: ModelEmbeddingRequest): Promise<ModelEmbeddingResponse>;
  health(options?: { timeoutMs?: number; signal?: AbortSignal }): Promise<ProviderHealth>;
  listModels(options?: { timeoutMs?: number; signal?: AbortSignal }): Promise<ModelDescriptor[]>;
  showModel(model: string, options?: { timeoutMs?: number; signal?: AbortSignal }): Promise<ModelDescriptor>;
  listRunningModels?(options?: { timeoutMs?: number; signal?: AbortSignal }): Promise<RunningModelDescriptor[]>;
  ensureLoaded?(model: string, options?: { timeoutMs?: number; signal?: AbortSignal }): Promise<void>;
  unload?(model: string, options?: { timeoutMs?: number; signal?: AbortSignal }): Promise<void>;
  close?(): Promise<void>;
}
```

`ModelMessage` gains `toolCalls?: ModelToolCall[]` for assistant messages. `ModelChatRequest` keeps `tools?`, `format?`, `options?`, `keepAlive?`, `think?`, `timeoutMs?`, and `signal?`. `ModelChatResponse` keeps `message.toolCalls`, `finishReason`, `usage`, and `timing`.

### 6.2 Registry

```ts
type ModelAvailability = 'available' | 'missing' | 'unknown';

interface ModelRegistryEntry extends ModelDescriptor {
  providerId: string;
  availability: ModelAvailability;
  checkedAt: string;
}

class ModelRegistry {
  syncProvider(providerId: string, models: ModelDescriptor[], checkedAt?: string): void;
  markProviderUnavailable(providerId: string, checkedAt?: string): void;
  get(providerId: string, model: string): ModelRegistryEntry | undefined;
  list(providerId?: string): ModelRegistryEntry[];
  supports(providerId: string, model: string, capability: ModelCapability): boolean | undefined;
  explain(providerId: string, model: string): { eligible: boolean; reasons: string[] };
}
```

### 6.3 Role resolver

```ts
interface ResolvedModelRole {
  role: ModelRole;
  providerId: string;
  model: string;
  baseUrl: string;
  keepAlive: string;
  maxConcurrentGenerative: number;
  localFirst: boolean;
}

interface RoleResolutionExplanation {
  decision: ResolvedModelRole | null;
  rejected: Array<{ candidate: string; reason: string }>;
}

function resolveModelRole(
  config: Config,
  role: ModelRole,
  options?: { registry?: ModelRegistry; now?: string },
): ResolvedModelRole;

function explainRoleResolution(
  config: Config,
  role: ModelRole,
  options?: { registry?: ModelRegistry; now?: string },
): RoleResolutionExplanation;
```

Fail closed on a disabled provider, missing model, unsupported capability, or unavailable registry. Never fall back to a hosted provider.

### 6.4 Resource lifecycle

```ts
interface ResourceProfile {
  os: string;
  arch: string;
  totalRamBytes: number | null;
  freeRamBytes: number | null;
  gpuVendor: string | null;
  gpuName: string | null;
  totalVramBytes: number | null;
  freeVramBytes: number | null;
  metricsSource: 'nvidia-smi' | 'windows-perf-counters' | 'unknown';
}

interface ModelLease {
  role: ModelRole;
  providerId: string;
  model: string;
  loadedAt: string;
}

interface ModelLifecycleManager {
  profile(): Promise<ResourceProfile>;
  acquire(role: ModelRole, request: { signal?: AbortSignal; priority?: number }): Promise<ModelLease>;
  release(lease: ModelLease): Promise<void>;
  state(): { active: ModelLease | null; queued: number; lastError: string | null };
}
```

Serialize `acquire`/`release` with a mutex; default `maxConcurrentGenerative = 1`; only unload models in the manager's `loaded` set; expose `/api/ps` values as reported diagnostics, not free capacity.

### 6.5 Worker v2

```json
{
  "contractVersion": 2,
  "runId": "uuid",
  "task": "string",
  "cwd": "string",
  "readOnly": false,
  "allowShell": false,
  "allowNetwork": false,
  "role": "coder",
  "provider": "ollama",
  "model": "qwen2.5-coder:7b",
  "providerOptions": {
    "baseUrl": "http://127.0.0.1:11434",
    "keepAlive": "5m"
  },
  "maxSteps": 40,
  "configPath": "optional"
}
```

Rules:

- Keep v1 accepted for one release; validate `contractVersion` before applying v2 fields.
- The TypeScript control plane remains the source of role/provider selection; the worker must not re-resolve AIR roles from its own config.
- The result v2 adds `provider`, `model`, and `role` for diagnostics, and keeps `state`, `answer`, `error`, `steps`, `toolCalls`, and `changedFiles`.
- Do not add fields to the strict v1 schema; use `contractVersion: 2`.
- Add TS and Python contract tests for v1 and v2, including unknown-field rejection.

---

## 7. Next bounded implementation package

**Package L0-05 — Reconcile the independent review (no new architecture).**

Smallest safe scope, in order:

1. **P0-01:** add `mutateConversation`, replace every stale `saveConversation` in `bin/air.ts` and `src/mcp/server.ts`, and add the conversation/MCP concurrency tests (§5.1-5.6).
2. **P1-01/P1-02:** route MCP cancel through the deterministic cancellation path; gate or remove the external-CLI answer path; add the parity tests (§5.7-5.10).
3. **P1-03/P1-04/P1-05/P1-06:** send schemas/tools in the evaluation prompts; scrub reviewer fixture labels; add a deterministic planner validator; add a sandboxed coder/tool executor or mark those oracles `not_executed`; add the evaluation tests (§5.20-5.29).
4. **P1-07:** add assistant `toolCalls` to `ModelMessage`, map it in Ollama, and add the round-trip test (§5.13).
5. **P2-01/P2-02:** fix `health()` timeout semantics and the `baseUrl` schema refinement (§5.11, §5.15).
6. Re-run the full validation checklist and CI; update the ledger and docs to distinguish "fixtures exist" from "oracles executed."

Do not start L3-01/L3-02 until L0-05 is complete. Do not start L4 until P0-01, P1-01, and P1-02 are fixed. L3 can begin with hardware probes and a serialized lifecycle manager after the interface freeze in §6 is accepted.

---

## 8. Evidence

### Exact revisions

- **Main SHA reviewed:** `d4e42006de890f78fcb9874bc0daebf6fc09b142` (`git rev-parse HEAD` and `git rev-parse origin/main`).
- **Prompt snapshot:** `6b71e6180ce5de18e912f7ecd542366c18fb4701`.
- **Delta:** `git diff --stat 6b71e61 d4e4200` shows only four docs files changed; no source delta.
- **PRs inspected:** #1, #2, #3, #4 (all merged).

### CI runs verified via `gh run list`

| Run | Event / ref | Conclusion |
|---|---|---|
| `43258190889` | push `main` (`d4e4200`) | success |
| `43257264089`, `43256944984`, `43256774714` | pull_request `work/local-first-review-gate` | success |
| `43256346732` | push `main` (`6b71e61`) | success |
| `43255750835`, `43255430192` | pull_request `work/local-first-eval-runner` | success |
| `43255135401` | pull_request `work/local-first-eval-runner` | failure (superseded) |
| `43253903400` | push `main` (`5f82d98`) | success |
| `43252995390`, `43252991166` | pull_request `work/local-first-eval-harness` | success |
| `43252693805` | pull_request `work/local-first-eval-harness` | failure (superseded) |

PR #1's run IDs were outside the 12-run window returned by `gh run list`; the ledger records run `286`/`287` as passed, but I did not independently re-verify those two IDs in this session.

### Commands actually run

- `git rev-parse HEAD`, `git rev-parse origin/main`, `git log --oneline -15`, `git status --short`, `git diff --stat 6b71e61 d4e4200`.
- `gh run list --limit 12`, `gh pr list --state all --limit 10`.
- `npx vitest run tests/models tests/evals tests/config.test.ts` — **7 files, 46 tests passed** (models, evals fixtures/runner/workspace, config).
- `npx tsx -e ...` — rendered the reviewer R01, tool-calling T01, and planner P07 prompts. This confirmed the reviewer input contains `"Seeded critical: path traversal bypasses workspace jail."`, the tool-calling prompt contains no tool definitions, and the planner P07 prompt contains only `"Create a plan with duplicate item ids"`.

### Commands not run

I did **not** run the full `npm test`, `npm run typecheck`, `npm run typecheck:test`, `npm run lint`, `npm run build`, `npm pack --dry-run`, the Python `ruff`/`mypy`/`pytest` suite, or any live Ollama request. The targeted tests and CI runs above are the evidence for this review. I do not claim the full validation checklist was executed locally, and I do not claim any live model benchmark result.

### Evidence I could not access

- Live Ollama `/api/ps`, `/api/version`, `/api/tags`, and `/api/show` responses on the reference Windows machine.
- The exact Ollama version installed by the user and its support for `/api/embed` vs `/api/embeddings`, `/api/ps`, and `think`.
- PR #1's exact CI run IDs (outside the returned window).
- Any private repository data or user conversations (none were used).

---

## 9. Reviewer's note to the next agent

The architecture is not the problem. The problem is that the merged artifacts are **more finished than the runtime behind them**:

- The config and provider modules exist but are not wired into the CLI/MCP/worker.
- The evaluation fixtures exist but the runner cannot score them, and some fixtures leak their answers.
- The conversation store has a lock, but the callers bypass it with stale whole-object writes.
- The local-first claim is contradicted by an answer path that tries external CLIs first.

Fix the P0/P1 items in §7 before adding L3/L4. If you only do one thing, fix P0-01: a conversation system that loses user messages cannot be the durable context boundary the blueprint requires.