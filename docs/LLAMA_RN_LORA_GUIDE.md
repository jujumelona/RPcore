# llama.rn LoRA Guide

## TL;DR

- Current workspace has `llama.rn@0.11.5`.
- In this version, LoRA is already exposed in the package.
- For Android, we do **not** need a fresh C++ fork just to turn LoRA on.
- The practical work is at the app layer:
  - pass `lora` / `lora_list` into `initLlama()`
  - or call `applyLoraAdapters()` / `removeLoraAdapters()` at runtime
- When upgrading `llama.rn`, we usually only need to re-verify the API surface, not re-implement LoRA from scratch.

## Actual Feasibility Verdict

Android: **yes, functionally possible**.

What is real today:

- `initLlama({ lora, lora_list })` is wired through params parsing, JSI, and native code
- `ctx.applyLoraAdapters()` / `ctx.removeLoraAdapters()` are also wired through end-to-end
- current app uses prebuilt Android `librnllama*.so` by default because `rnllamaBuildFromSource=true` is **not** set in `android/gradle.properties`

Important caveats found in the bundled `0.11.5` source:

- init-time LoRA looks to be applied twice
  - `common_init_from_params()` already loads/applies `params.lora_adapters`
  - then `RNLlamaJSI.cpp` calls `ctx->applyLoraAdapters(ctx->params.lora_adapters)` again after `loadModel()`
- repeated runtime swap is likely to accumulate adapter memory until the model/context is released
  - `removeLoraAdapters()` clears the active list
  - but it does not explicitly free previously loaded adapter objects before model teardown

So the honest answer is:

- one-shot Android use: realistic
- occasional swap: realistic
- frequent long-lived hot-swap in one context: risky unless we patch upstream or recreate the context periodically

## What Was Verified

LoRA support is already present in the installed package:

- TypeScript init params:
  - `node_modules/llama.rn/src/types.ts`
  - has `lora`, `lora_scaled`, `lora_list`
- TypeScript runtime methods:
  - `node_modules/llama.rn/src/index.ts`
  - has `applyLoraAdapters()`
  - has `removeLoraAdapters()`
  - has `getLoadedLoraAdapters()`
- JSI bridge:
  - `node_modules/llama.rn/cpp/jsi/RNLlamaJSI.cpp`
  - registers `llamaApplyLoraAdapters`
  - registers `llamaRemoveLoraAdapters`
  - registers `llamaGetLoadedLoraAdapters`
- Native C++ wrapper:
  - `node_modules/llama.rn/cpp/rn-llama.cpp`
  - has `applyLoraAdapters()`
  - has `removeLoraAdapters()`
  - has `getLoadedLoraAdapters()`

So the package already wraps `llama.cpp` LoRA support end-to-end.

## How To Use It

### 1. Apply at init time

```ts
const ctx = await initLlama({
  model: modelPath,
  n_ctx: 4096,
  lora: adapterPath,
  lora_scaled: 1.0,
})
```

Note:

- this should work in the current package
- but due to the double-load path above, init-time LoRA is not the cleanest path in `0.11.5`
- for Android, a safer practical pattern is:
  - init model without LoRA
  - call `applyLoraAdapters()` once after context creation

Or with multiple adapters:

```ts
const ctx = await initLlama({
  model: modelPath,
  n_ctx: 4096,
  lora_list: [
    { path: adapterAPath, scaled: 1.0 },
    { path: adapterBPath, scaled: 0.6 },
  ],
})
```

### 2. Hot-swap at runtime

```ts
await ctx.applyLoraAdapters?.([
  { path: adapterPath, scaled: 1.0 },
])
```

Remove all:

```ts
await ctx.removeLoraAdapters?.()
```

Inspect loaded adapters:

```ts
const loaded = await ctx.getLoadedLoraAdapters?.()
```

## Android Notes

- Android is the priority path here; iOS support is not required for this task.
- This project currently uses the prebuilt Android `rnllama` binaries, not source-built core libs.
- `llama.rn` strips `file://` prefixes in its JS layer, so local file paths are fine.
- Apply or swap LoRA only when the context is idle.
  - The native bridge rejects changes while completion is running.
- If you swap adapters many times in a long-lived context, memory may grow until context release.
  - safest operational pattern: unload/reload context when changing adapters often
- Treat LoRA files like model assets:
  - stable absolute path
  - storage permission/path handling already resolved by app layer

## What We Changed In This Repo

We only added local app-side type coverage so the runtime API can be used without extra `any` casting:

- `src/types/llama.types.ts`
  - added `LlamaLoraAdapter`
  - added `applyLoraAdapters()`
  - added `removeLoraAdapters()`
  - added `getLoadedLoraAdapters()`
  - added `lora`, `lora_scaled`, `lora_list` to init params

No native patch was added in this repo because the installed `llama.rn` package already contains the native implementation.

## Do We Need To Re-Do This After Upgrading The Engine?

Usually: **no full native rework**.

What is likely after a version bump:

- best case:
  - no work
- common case:
  - update local types if upstream renames params or methods
- less common case:
  - rebuild Android native artifacts / clear Gradle cache
- worst case:
  - if upstream removes or redesigns the LoRA bridge, re-check the same 4 files listed above
  - if upstream fixes the current double-load or memory-lifetime quirks, adjust app guidance accordingly

In other words, the expensive part is **not** maintaining a custom C++ LoRA fork right now.
The main maintenance cost is verifying that upstream still exposes the same API shape.

## Upgrade Checklist

After bumping `llama.rn`, verify:

1. `src/types.ts` still has `lora`, `lora_scaled`, `lora_list`
2. `src/index.ts` still has:
   - `applyLoraAdapters`
   - `removeLoraAdapters`
   - `getLoadedLoraAdapters`
3. `cpp/jsi/RNLlamaJSI.cpp` still registers the LoRA JSI functions
4. `cpp/rn-llama.cpp` still calls into LoRA adapter application/removal
5. Android app still builds cleanly after native cache reset if needed

## Recommendation

For this project, the clean path is:

- do not fork `llama.rn` C++ just for LoRA
- use the upstream-exposed LoRA API
- keep a thin app-level integration and this checklist

If we decide to wire it into `src/core/llama/LlamaEngine.ts` later, that should be a small app-layer feature, not a native engine rewrite.
