# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

Merlin the Wizard is a **Windows 11 Electron desktop companion** — the Microsoft Agent Merlin sprite running as a transparent, always-on-top character backed by a swappable LLM. Multi-provider (Groq / OpenRouter / Ollama / MiniMax / Hermes Agent), voice in/out, screen capture, web search, tool-calling, custom characters. Windows-only by design (uses DPAPI, SAPI, screen-capture PowerShell helpers).

## Commands

```bash
npm run dev          # electron-vite dev — the normal run loop
npm run build        # electron-vite build → out/  (run before committing)
npm run typecheck    # tsc -b  (project references: node + web)
npm run lint         # eslint . --ext .ts,.tsx
npm run format       # prettier --write .
npm test             # vitest run — unit tests (test/unit)
npm run test:e2e     # build + Playwright Electron smoke test (test/e2e)
npm run verify:assets# sprite-asset integrity guard (--build / --package variants)
npm run test:all     # unit → verify:assets → e2e
npm run assets       # MUST run once before first dev/build — downloads MS Agent
                     # sprite packs from the clippyjs CDN into src/renderer/public/agents/
                     # (gitignored). Idempotent; pass --force to re-fetch.
npm run dist         # assets + verify + build + verify + electron-builder + verify
                     # → NSIS installer (Merlin-Setup.exe). Asset guard runs at every
                     # stage so a build missing sprite assets can't be produced.
npm run dist:portable# single portable .exe
```

### Tests
A real suite now exists (added after a user reported Merlin never appeared after
install — sprite assets were missing from the package and the load failure was
swallowed silently). See [test/README.md](test/README.md).
- **Unit** ([test/unit](test/unit)) — Vitest; `electron` is aliased to a stub
  ([test/mocks/electron.ts](test/mocks/electron.ts)) since real Electron can't run
  under Node. Covers animation gating, settings defaults, sprite geometry, the
  inline tool-call parser, character roster, custom-persona resolution.
- **E2E** ([test/e2e](test/e2e)) — Playwright `_electron` launches the **built**
  app with a fresh user-data dir (clean first install) and asserts a clippyjs
  agent actually mounts. The sprite renderer sets `window.__merlinAgentReady` /
  `window.__merlinAgentError`; a load failure now shows a visible banner instead
  of an invisible empty window.
- **Asset guard** ([scripts/verify-assets.mjs](scripts/verify-assets.mjs)) — runs
  in the `dist` chain; cracks the asar to confirm assets actually shipped.

### Working-loop expectation
After any code change: **typecheck → `npm test` → `electron-vite build` → restart `npm run dev`** (run dev in the background). Never hand back a broken tree or a stale runtime — a successful build does not mean the running instance picked up the change.

### Electron launch gotcha (sandbox)
The shell may have `ELECTRON_RUN_AS_NODE` pre-set, which makes Electron boot as plain Node and crash with a spurious `app.whenReady undefined`. **`unset ELECTRON_RUN_AS_NODE` before any Electron launch.**

## Build topology

electron-vite produces three independent bundles ([electron.vite.config.ts](electron.vite.config.ts)):
- **main** — single entry `src/main/index.ts` → `out/main`
- **preload** — one entry *per window* (`sprite`, `bubble`, `settings`, `debug`, `history`, `chatPanel`, `brainWizard`, `setupWizard`) → `out/preload`
- **renderer** — one HTML entry *per window* under `src/renderer/*/index.html` → `out/renderer`

`@shared` aliases `src/shared`. Adding a new window means touching **all three** input lists plus a preload bridge and an `IPC` channel.

## Architecture

Three processes, with `src/shared/` as the only code both sides import.

### Multi-window model
Each surface is its own `BrowserWindow` created under `src/main/windows/`: the floating transparent **sprite**, the classic yellow **bubble**, the modern docked **chatPanel**, plus settings / history / debug / brainWizard / setupWizard. Two display modes share the sprite: **classic** (sprite + on-demand bubble) and **modern** (sprite + persistent dark chat panel). `activeSurface.ts` tracks which surface currently *hosts* the clippyjs sprite so animation IPC routes correctly.

### IPC contract
`src/shared/ipc-contract.ts` is the **single typed channel map** (`IPC.*`). Main and preload both reference it; preload files in `src/preload/` are the `contextBridge` surfaces. When adding a channel, add it here first, then the preload bridge, then handlers (`src/main/ipc/registerHandlers.ts`).

### The animation pipeline (most-touched subsystem)
An LLM reply streams through, in order:
```
LLM stream → FunctionCallParser → StreamingAnimParser → ItalicActionFilter → consumers
```
- `src/shared/function-call-parser.ts` — recovers inline `<function=…>` tool calls some models emit as text.
- `src/shared/animation-protocol.ts` — `StreamingAnimParser` extracts inline directives `[anim:Name]`, `[feel:mood]`, `[suggest:text]` from the stream (holds back partial tags across chunk boundaries).
- `ItalicActionFilter` (in [interaction.ts](src/main/interaction.ts)) strips `*slides left*`-style fake narration because real movement goes through tools, not prose.
- Consumers: `[anim:]` → `animationController.playInline()`, `[feel:]` → `feelings.setMood()`, `[suggest:]` → UI chips, plain text → `SentenceSplitter` → TTS. Bubble/panel reveal is **synced to first-audio-ready**, not to stream start.

`src/main/animationController.ts` is the **central animation brain** and single source of truth for sprite intent (`sleeping | idle | reacting | thinking | speaking | doing | hidden`). It owns mood-weighted selection with a recent-anim ring buffer, an `energy` (0–100) + time-of-day model, eye-tracking toward the cursor, and the sleep/wake drift. Don't play animations by poking the sprite window directly — go through the controller.

### Brain system (autonomous behavior)
The "brain" is the **idle/autonomous loop**, separate from chat. `src/main/brain.ts` is a back-compat shim; the real owner is `brainSupervisor.ts`, which holds one active `BrainController` and a singleton `BrainContext`. Controllers live in `src/main/brainControllers/` and are registered in `registry.ts`: `default` (offline timer-based), `local-llm` (Ollama decides each idle tick), `hermes` (Hermes Agent decides). Controllers **never touch sprite/animation internals directly** — they only call the capability methods on `BrainContext` (`types.ts`), which are flag-aware and rate-limited. The active controller is hot-swappable at runtime via the `brainController` setting. Add a new brain by adding a factory to `registry.ts`; the interface is locked.

### LLM providers & tools
`src/main/llm/providerRegistry.ts` dispatches across Groq / OpenRouter / Ollama / MiniMax / Hermes using the Vercel AI SDK (`ai`, `@ai-sdk/*`). Tools are defined in `llm/tools.ts` and executed via `llm/toolHandlers.ts`: sprite control (`move_to`, `move_relative`, `hide`, `show`), persistent todos (`add_task` etc., backed by `tasks.ts`), and `web_search` (`tools/webSearch.ts` — Tavily, DuckDuckGo fallback). The per-turn system prompt is assembled in `llm/systemPrompt.ts` from the active character + live context.

### Voice
`src/main/voice/tts.ts` is the multi-engine dispatcher (Edge Neural, Windows SAPI via PowerShell, Groq Orpheus, ElevenLabs) plus `sanitizeForSpeech` (strips markdown so it isn't read aloud). `whisper.ts` is Groq push-to-talk STT. `sentenceSplitter.ts` chunks the stream so audio starts before the full reply lands; `audioState.ts` tracks playback so `speaking` intent survives until audio actually stops.

### Storage & secrets
- `storage/store.ts` — plain settings JSON (electron-store).
- `storage/secrets.ts` — API keys encrypted at rest via Electron `safeStorage` (Windows DPAPI). Keys may also come from `.env` for dev convenience (`loadEnv.ts`); `.env` is gitignored.
- `storage/conversationStore.ts` — rolling chat history.
- `extensions.ts` — feature-flag (`behavior.*`) values with a **synchronous** module-level cache, warmed once at boot, because 30Hz gate sites (drag, eye-tracking) can't `await` per check. Invalidated on `settingsSet`.

### Updater
`src/main/updater.ts` is a **self-rolled GitHub-Releases updater, NOT electron-updater**. The app is unsigned, so a silent `/S` install gets blocked by SmartScreen with no UI. Instead it downloads `Merlin-Setup.exe` and launches the **interactive NSIS installer**, keeping the user in front of the OS security prompt. Never reintroduce silent install.

## Conventions

- TypeScript strict everywhere. Each pipeline stage carries a top-of-file comment block explaining *why* the design is what it is — read it before changing that stage.
- Prefer editing existing files over adding new ones; no scope creep.
- clippyjs is pinned with a bundled jQuery 3.5.1 (unmaintained since ~2017 but works); the sprite assets it loads are Microsoft IP fetched from the CDN at install time and are **not** committed. Because they're fetched (not committed), a build can silently ship without them — that's the failure `scripts/verify-assets.mjs` and the E2E smoke test exist to catch. If you touch the asset pipeline, the packaging config, or the `../agents/` load path, run `npm run test:e2e`.
