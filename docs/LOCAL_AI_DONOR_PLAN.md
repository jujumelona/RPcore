# Local AI Donor Plan

Last updated: 2026-04-03

## Hard Guardrails

- UI must remain compatible with 15 languages.
- Korean text must stay UTF-8 safe. Do not introduce mojibake while editing docs, JSON, locales, or source files.
- Keep the current story/chat experience working with the local AI stack.
- Prefer pattern adoption over large code copy, especially when upstream license is AGPL.

## Goal

Use proven ideas from local-LLM mobile apps to improve:

- model lifecycle
- benchmarking
- download and model UX
- provider abstraction
- backup/export
- tool extensibility
- TTS / voice patterns

without breaking the current RP chat, story, emotion, and KV session flow.

## Verified Donor References

### PocketPal AI

- Repo: https://github.com/a-ghorbani/pocketpal-ai
- License: MIT
- Verified from README:
  - auto offload/load
  - tok/s and memory benchmarking
  - Hugging Face public and gated model integration
  - JP / ZH localization
  - direct GGUF search and quantization selection
- Verified from releases:
  - latest release on 2026-03-27 is `v1.13.1`
  - upgraded `llama.rn` to `0.12.0-rc.2`
  - recent releases added memory profiling and OpenAI-compatible remote server support

### ChatterUI

- Repo: https://github.com/Vali-98/ChatterUI
- License: AGPL-3.0
- Verified from README:
  - Character Card v2 support
  - external GGUF loading from device storage
  - custom API template system
  - custom `cui-llama.rn` adapter
  - quantization guidance: Snapdragon 8 Gen 1+ / Exynos 2200+ recommends `Q4_0`
- Verified from releases:
  - JSON chat import
  - much faster PNG parser
  - OpenCL / NPU-related work on Snapdragon devices
  - backend selection on compatible devices

### cui-llama.rn

- Repo: https://github.com/Vali-98/cui-llama.rn
- License: MIT
- Verified from README:
  - custom fork of `llama.rn`
  - tokenizer and prompt-processing improvements
  - context shift support
  - CPU feature detection
  - tool calling support
  - parallel decoding support
  - multimodal support

### Maid

- Repo: https://github.com/Mobile-Artificial-Intelligence/maid
- License: MIT
- Verified from README:
  - local llama.cpp mode
  - remote providers: Anthropic, DeepSeek, Mistral, Novita, Ollama, OpenAI
  - curated one-tap model downloads
  - bring-your-own GGUF
  - create / rename / delete / export / import chats as JSON
  - companion TTS app integration via Maise

### Maise

- Repo: https://github.com/Mobile-Artificial-Intelligence/maise
- License: MIT
- Verified from README:
  - on-device Android TTS engine
  - on-device ASR
  - Kokoro-based TTS pipeline
  - streaming playback pipeline
  - Whisper-style ASR pipeline

### Google AI Edge Gallery / LiteRT / LiteRT-LM

- Gallery: https://github.com/google-ai-edge/gallery
- LiteRT overview: https://ai.google.dev/edge/litert/overview?hl=ko
- License: Apache-2.0
- Verified from repo/docs:
  - Gallery is an on-device ML / GenAI showcase app
  - Gallery includes Hugging Face integration
  - LiteRT and LiteRT-LM are active upstream projects
  - good reference for Android-native benchmark / model showcase patterns

## Notes About Verification

- I verified the items above from public upstream README, release, and official docs pages.
- I did not verify every single UI control named in brainstorming, such as a literal PocketPal "Metal toggle" screen or exact slider layout, so those should be treated as candidate UX patterns unless confirmed by code inspection.
- The idea of a Google AI Edge "Agent Skills" style modular tool system is directionally good, but I did not verify a literal upstream API named exactly that in the sources checked today.

## What Already Exists In This Repo

### Good Existing Base

- Device profiling already exists:
  - `src/core/llama/DeviceProfiler.ts`
  - `measure()` and `computeLlamaParams()` already expose RAM, backend, and GPU-layer logic
- Model lifecycle already exists:
  - `src/core/llama/LlamaEngine.ts`
  - `load()` and `release()` are already real entry points
- AppState-based recovery already exists:
  - `src/hooks/useEngineRecovery.ts`
  - currently reload-oriented, not full auto-offload
- Background model downloads already exist:
  - `src/core/llama/ModelDownloader.ts`
  - background downloader, HF direct URL strategy, download recovery
- KV benchmarking already exists:
  - `src/core/llama/KVBenchmarkRunner.ts`
- Tool-call parsing already exists:
  - `src/core/llama/ToolCallHandler.ts`
  - `RPTool`, `RPToolCall`, `parseToolCalls()`
- Backup localization is already present:
  - `src/locales/*/backup_restore.json`
- JSON export/import infrastructure exists for compressed cache:
  - `src/utils/CompressedCache.ts`
- TTS groundwork already exists:
  - `src/core/llama/ExecutorchEngine.ts`
  - Kokoro TTS integration already exists in local code

### Missing Or Underbuilt

- no user-facing auto offload policy for background / foreground transitions
- no proper benchmark screen for `tok/s`, TTFT, memory, and device share/export
- no user-facing GPU layers override UI
- no proper HF model browser with GGUF filters in-app
- no seamless "switch model but keep conversation context" UX
- no clear chat/session JSON export-import for end users
- no provider registry matching Maid-style remote backends
- no formal tool registry or community skill/plugin layer on top of `RPTool`

## Donor Priority

### P0: Safe To Adopt First

- PocketPal auto offload/load pattern
- PocketPal benchmark UI and share flow
- PocketPal HF browse/search/filter UX
- Maid chat export/import JSON
- Maid provider abstraction ideas
- ChatterUI external GGUF loading ideas

### P1: High Value But Needs Care

- `cui-llama.rn` benchmark comparison against current `llama.rn`
- ChatterUI quantization recommendation logic
- ChatterUI character card v2 parsing ideas
- Maise-style voice pipeline patterns
- Google AI Edge benchmark / showcase UX patterns

### P2: Do Not Copy Blindly

- ChatterUI code itself, because AGPL-3.0 is risky for direct donor use
- Android-native Google AI Edge code as a direct RN drop-in
- large adapter swaps without benchmark proof

## Recommended Implementation Order

### Phase 1: Auto Offload / Reload

Source inspiration:

- PocketPal AI

Why now:

- biggest memory win for mobile
- smallest architectural risk

Local touch points:

- `src/hooks/useEngineRecovery.ts`
- `src/core/llama/LlamaEngine.ts`
- `src/store/modelStore.ts`

Plan:

1. Add an explicit lifecycle policy:
   - foreground: lazy `load(activeModelId)` only when needed
   - background/inactive: `release()` after small debounce
2. Preserve chat/KV/session state before release.
3. Add user setting:
   - `always_keep_loaded`
   - `auto_offload_after_10s`
   - `auto_offload_immediately`
4. Surface warm state in UI:
   - idle
   - warming
   - ready
   - reloading

### Phase 2: Benchmark Screen

Source inspiration:

- PocketPal AI
- Google AI Edge Gallery

Local touch points:

- `src/core/llama/DeviceProfiler.ts`
- `src/core/llama/KVBenchmarkRunner.ts`
- `src/utils/PerformanceMonitor.ts`
- `src/store/modelStore.ts`

Plan:

1. Build a dedicated benchmark screen.
2. Show:
   - TTFT
   - tok/s
   - avg tok/s
   - measured RAM
   - backend
   - GPU layers
3. Add JSON export/share for benchmark result.
4. Add per-model history by device.

### Phase 3: GPU Layers And Memory UI

Source inspiration:

- PocketPal AI
- ChatterUI backend selection ideas

Local touch points:

- `src/core/llama/DeviceProfiler.ts`
- `src/core/llama/LlamaEngine.ts`
- `src/store/modelStore.ts`
- `src/ui/ModelSelector.tsx`

Plan:

1. Add advanced settings panel:
   - backend preference
   - GPU layers override
   - thread override
   - context override
2. Keep auto recommendation as default.
3. Show estimated memory before apply.
4. Add safe reset-to-auto button.

### Phase 4: HF Search / GGUF Filtering / Better Downloads

Source inspiration:

- PocketPal AI
- Maid

Local touch points:

- `src/core/llama/ModelDownloader.ts`
- `src/ui/ModelSelector.tsx`
- `src/models/ModelConfig.ts`

Plan:

1. Add searchable model browser.
2. Add GGUF-only filters:
   - quantization
   - model family
   - size
   - gated/public
3. Keep direct HF download pattern already in `ModelDownloader`.
4. Add bookmarked models and "recommended for this device".

### Phase 5: In-Session Model Switch

Source inspiration:

- PocketPal AI

Local touch points:

- `src/store/modelStore.ts`
- `src/core/llama/LlamaEngine.ts`
- `src/hooks/useChatSession.ts`
- `src/hooks/useInference.ts`

Plan:

1. Turn current model switching into explicit session UX.
2. Allow:
   - switch and continue conversation
   - switch and regenerate last turn
   - compare same prompt on another model
3. Keep chat history, but mark model boundary in the transcript.

### Phase 6: Chat Export / Import

Source inspiration:

- Maid
- ChatterUI

Local touch points:

- `src/store/chatStore.ts`
- `src/hooks/useChatSession.ts`
- `src/utils/CompressedCache.ts`
- `src/locales/*/backup_restore.json`

Plan:

1. Add JSON export/import for chat sessions.
2. Include:
   - messages
   - selected model
   - story id
   - emotion snapshot
   - core memo snapshot
   - timestamps
3. Keep format versioned.
4. Use UTF-8-safe read/write helpers for Korean and all locales.

### Phase 7: Provider Registry

Source inspiration:

- Maid

Why later:

- useful, but broader than current local-first workflow

Local touch points:

- `src/api/ServerAPI.ts`
- `src/store/settingsStore.ts`
- `src/hooks/useInference.ts`

Plan:

1. Introduce provider abstraction:
   - local
   - OpenAI-compatible
   - OpenAI
   - Anthropic
   - Ollama
2. Keep story chat features compatible with local mode first.
3. Restrict advanced RP/KV features to local-capable providers.

### Phase 8: Tool Registry / Skill Layer

Source inspiration:

- Google AI Edge modular use-case pattern
- existing `RPTool` structure in this repo

Local touch points:

- `src/core/llama/ToolCallHandler.ts`
- tool execution layer around current RP tool handling

Plan:

1. Keep `RPTool` as the base schema.
2. Add a registry layer:
   - built-in tools
   - enabled/disabled flags
   - permission metadata
   - story-safe vs general tools
3. Later allow community-defined tool packs.

## Benchmark Candidate: `llama.rn` vs `cui-llama.rn`

Do this only as a structured benchmark, not as a blind swap.

Measure:

- TTFT
- tok/s
- prompt processing speed
- memory usage
- crash rate
- session restore stability
- tool-call correctness
- Korean output stability

If `cui-llama.rn` wins clearly on Android and does not regress KV/session behavior, consider a separate adapter spike branch.

## License Policy

- MIT / Apache-2.0 donors:
  - PocketPal AI
  - Maid
  - Maise
  - Google AI Edge projects
  - `cui-llama.rn`
- AGPL donor:
  - ChatterUI

Policy:

- ChatterUI should be used for ideas, UX patterns, and benchmark targets.
- Do not directly transplant AGPL code into the main app without a deliberate license decision.

## Immediate Backlog

### First Three Tasks

1. Implement auto offload/reload policy.
2. Add benchmark screen using existing profiler and KV benchmark runner.
3. Add chat export/import JSON.

### Next Three Tasks

1. Add advanced model settings with GPU layers UI.
2. Add HF model browser with GGUF filters.
3. Add session-aware model switching UX.

## Repo Reality Check

This repo is already closer to PocketPal than it may look:

- benchmarking primitives already exist
- download recovery already exists
- GPU-layer calculation already exists
- tool-call schema already exists
- TTS groundwork already exists

The biggest gap is not engine capability. The biggest gap is user-facing product surface around those capabilities.
