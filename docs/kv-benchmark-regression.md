# KV Benchmark / Regression

## 1) Android one-command pipeline (recommended)

Run low/mid/high devices in sequence, pull reports, then run full gate:

```bash
npm run bench:kv:android:e2e -- --low <LOW_SERIAL> --mid <MID_SERIAL> --high <HIGH_SERIAL>
```

Optional flags:

- `--models gemma-3-1b-qat,gemma-3n-e2b-reasoning`
- `--runs 5 --warmup-runs 1 --max-tokens 180`
- `--timeout-sec 1800`
- `--skip-full-gate` (only run device benchmarks + pull)

## 2) On-device benchmark trigger

The app (DEV build) exposes:

- `global.__kvBench.run({...})`
- `global.__kvBench.runSuite({...})`
- command-file bridge: `files/kv_bench_command.json`

The Android e2e script uses the command-file bridge so you do not need manual dev-console execution.

## 3) Pull reports from device(s)

Pull manually if needed:

```bash
npm run bench:kv:pull -- --device <ADB_SERIAL>
```

## 4) Auto report (TTFT/tok/s)

Strict low/mid/high coverage gate:

```bash
npm run bench:kv:report
```

Soft mode (no coverage gate):

```bash
npm run bench:kv:report:soft
```

Output:

- `artifacts/kv-summary.md`
- `artifacts/kv-summary.json`

## 5) KV forced-switch regression

Run:

```bash
npm run test:kv:regression
```

Checks include:

- version mismatch all-model purge
- A/B model switch purge coverage
- kv-spec constants vs ModelConfig consistency
- native KV format consistency (`q8_0`, `q4_0`, flash-attn ON)

## 6) Full gate

Run both regression + strict report gate:

```bash
npm run test:kv:full
```