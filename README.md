# Saeed

Saeed is a Windows desktop AI companion inspired by the classic animated-assistant experience, including the ideas behind **Merlin the Wizard** — but this repository is being developed as its own project with its own identity, architecture, behavior, and future roadmap.

The goal is not to make a copy of Merlin. The goal is to take the useful ideas from that style of assistant and evolve them into **Saeed**: a practical desktop AI companion that can talk, listen, act, remember context, use tools, and eventually operate the Windows environment with clear permission controls.

## Project identity

- **Name:** Saeed
- **Repository:** `saeedhub101/Saeedoo`
- **Platform:** Windows desktop
- **Runtime:** Electron
- **Language:** TypeScript
- **UI:** Electron renderer + React where appropriate
- **Build:** electron-vite + electron-builder
- **License:** MIT
- **Author:** Saeed O. Almansour

## What Saeed is

Saeed is designed as a persistent desktop companion rather than a normal chat application.

The current foundation already contains several important systems:

- LLM provider abstraction and streaming conversations
- Multiple provider options, including cloud and local models
- Voice input/output infrastructure
- Animated desktop character support
- Character and persona management
- Conversation history
- Tasks
- Web search tooling
- Screen capture and attachments
- A proactive/autonomous brain layer
- Pluggable brain controllers
- Settings and setup wizards
- Debugging/diagnostic surfaces
- Windows tray integration
- Auto-start support
- Update support
- Electron secure storage for secrets
- Asset verification during the build/package pipeline

## The brain architecture

One of the core ideas Saeed inherits from the Merlin project is separating the **brain** from the **desktop world**.

Saeed's brain layer can reason about context and choose an action without directly owning the Electron window implementation.

The current architecture includes:

```
User / System Events
        |
        v
   Saeed Core
        |
   +----+-------------------+
   |                        |
Conversation LLM       Autonomous Brain
   |                        |
   |                 Brain Controller
   |                 /      |       \
   |              Default  Local    Hermes
   |                        LLM
   +------------+-----------+
                |
          Brain Context
                |
                v
        Desktop / Character
        Voice / Tasks / UI
        Tools / Windows
```

This separation is important because Saeed is intended to grow beyond simple character animation.

## Current brain model

The autonomous brain is controller-based. The repository currently provides a supervisor and controller registry so different brain strategies can be selected without rewriting the rest of the application.

The intended direction is:

1. Observe the current desktop/application state.
2. Understand recent user interaction.
3. Decide whether action is useful.
4. Choose a constrained action.
5. Execute through the appropriate application service.
6. Verify the result.
7. Recover or report when something fails.

The current implementation is the foundation for that larger agent architecture; it is not yet the final full computer-agent system.

## Character system

Saeed keeps the classic animated-assistant concept but treats the character as a replaceable presentation layer.

The project supports multiple bundled character packs and custom character personas.

The visual layer should remain independent from the AI reasoning layer so that the character can change without changing the brain.

The original sprite assets are still identified internally by their upstream character IDs where required by the asset format. This is an implementation detail and does not define Saeed's product identity.

## Voice

Saeed includes voice infrastructure for:

- Text-to-speech
- Windows/local speech
- Cloud speech providers where configured
- Speech transcription infrastructure
- Voice playback synchronization with the character

Voice is intended to become a first-class interaction channel rather than a separate feature bolted onto chat.

## Tools and desktop actions

The existing foundation contains tools for tasks, movement, visibility, web search, screen capture, and related assistant actions.

The long-term Saeed agent is intended to expand this into:

- Windows application control
- Browser automation
- Excel / Word / CSV workflows
- PDF reading and extraction
- File operations
- Email integration
- Code assistance and execution
- UI/OCR based computer interaction
- Verification and recovery
- Permission-controlled sensitive actions

Saeed should prefer direct APIs and structured automation when available, and use GUI automation only when necessary.

## Permission model

A future core requirement is a clear permission gateway.

Normal, low-risk operations should be able to run directly when enabled by the user.

Sensitive or potentially destructive operations should support explicit:

**Allow / Deny**

confirmation with a clear explanation of:

- what Saeed wants to do
- why it wants to do it
- what system/resource will be affected

The permission system should also support configurable categories and an **Ask Always** mode.

## Safety and control

Saeed is intended to include:

- Cancel/Stop
- Emergency Stop
- Dry Run
- Action journal
- Verification
- Retry/recovery
- Clear diagnostics
- Configurable permissions

These are part of the target agent architecture and should be implemented incrementally rather than hidden inside individual tools.

## Development principles

### 1. Preserve working systems

When improving one subsystem, do not unnecessarily rewrite unrelated working systems.

### 2. Separate reasoning from execution

The brain chooses what should happen; dedicated services execute the action.

### 3. Prefer deterministic automation

Use APIs and structured interfaces before screen-click automation.

### 4. Verify important actions

A successful command is not the same thing as a successful result.

### 5. Keep the character responsive

The character is a companion UI, not a fullscreen application. It should remain lightweight, unobtrusive, and responsive.

### 6. Make failures observable

Errors should be visible in logs/diagnostics and should not silently disappear.

### 7. Keep the project independently identifiable

Saeed is its own product and should not depend on the Merlin project's branding, repository metadata, release configuration, or ownership.

## Development

Install dependencies:

```bash
npm install
```

Run in development:

```bash
npm run dev
```

Build the Electron application:

```bash
npm run build
```

Type-check:

```bash
npm run typecheck
```

Run tests:

```bash
npm test
```

Prepare and verify character assets:

```bash
npm run assets
npm run verify:assets
```

Create a Windows distribution:

```bash
npm run dist
```

## Asset pipeline

The character packs are prepared at build time and verified at three stages:

1. Source assets
2. Electron build output
3. Packaged application

The asset preparation script is now named:

```
scripts/prepare-saeed-assets.mjs
```

The verification script remains:

```
scripts/verify-assets.mjs
```

The verification step exists to prevent a common desktop-companion failure where the application launches but the character assets are missing from the final package.

## Roadmap

### Phase 1 — Saeed foundation
- Establish Saeed branding and project identity
- Preserve the useful Merlin architecture
- Stabilize character, chat, voice, settings, and brain foundations
- Keep the build/package pipeline reliable

### Phase 2 — Saeed brain
- Stronger planning
- Context/state management
- Action selection
- Cancellation
- Verification
- Retry/recovery
- Action journal

### Phase 3 — Computer agent
- Application detection
- Screenshot/OCR
- Structured UI detection
- Direct automation APIs
- GUI fallback
- Permission gateway

### Phase 4 — Work automation
- Excel
- Word
- PDF
- CSV
- Browser
- Email
- File workflows
- Code workflows

### Phase 5 — Personal desktop companion
- Persistent memory
- Better proactive behavior
- Natural voice interaction
- Rich character reactions
- User-configurable skills
- Safe autonomous workflows

## Relationship to Merlin

Saeed was started from a codebase containing ideas and components from **Merlin the Wizard**.

That project is treated as the inspiration/base reference. Saeed is developed separately in this repository and is intended to evolve in a different direction.

The purpose of this repository is therefore:

> **Keep the useful foundation, change the identity, improve the architecture, and build Saeed into a more capable desktop AI companion.**

## Status

Saeed is under active development.

The current repository should be considered a development foundation rather than a finished product. Features may be incomplete while the architecture is being expanded.

---

**Saeed — a desktop AI companion for Windows.**
