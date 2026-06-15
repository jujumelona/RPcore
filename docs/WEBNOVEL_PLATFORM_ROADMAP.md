# Webnovel Platform Roadmap

## Purpose

This document is the execution baseline for the webnovel reader, AI companion,
community, moderation, and admin migration work.

Use this roadmap as the reference point for future implementation order.

Related execution documents:

- `docs/CHAT_UI_REBUILD_PLAN.md` for chat-specific UX and keyboard/scroll work.

## Hard Requirements

1. UI must remain compatible with 15 locales.
2. All new reader, community, moderation, and admin flows must keep
   localization in mind from the beginning instead of treating i18n as a
   follow-up task.
3. Preserve Korean text safely during every import, export, storage, API, and
   markdown step.
4. Do not introduce mojibake. Korean strings must remain valid UTF-8 and must
   be verified after file edits, generated content, copy updates, and data
   migrations.
5. Reader and AI companion work must not break the existing AI270M
   "read together" experience.

## Chosen Donor Stack

- Reader engine base: `epubjs-react-native`
- Reader UX and offline flow reference: `LNReader`
- Community data and tag discussion model reference: `Flarum`
- Moderation workflow reference: `Discourse`
- Admin web baseline: `react-admin`

## Project Scope

The work is split into five tracks that must stay coordinated:

1. Reader platform
2. AI companion and emotion sync
3. Community model cleanup
4. Report and block moderation flow
5. Admin tooling

## Current RPcore Mapping

Primary current files:

- `src/screens/webnovel/WebNovelReaderScreen.tsx`
- `src/screens/webnovel/WebNovelLibraryScreen.tsx`
- `src/screens/webnovel/DownloadedNovelsScreenV2.tsx`
- `src/screens/AIWebNovelChatScreen.tsx`
- `src/screens/webnovel/WebNovelEmotionPanel.tsx`
- `src/screens/webnovel/WebNovelEmotionStatusBar.tsx`
- `src/api/NovelAPI.ts`
- `src/store/readerSettingsStore.ts`
- `src/store/userProfileStore.ts`
- `src/components/ReportModal.tsx`
- `src/api/AdminAPI.ts`
- `src/screens/AdminPanelScreen.tsx`
- `src/screens/admin/AdminDashboardScreen.tsx`
- `admin-web/src/App.tsx`
- `admin-web/src/resources.tsx`

## Execution Order

### Phase 1. Reader Adapter Layer

Goal:

- Introduce a stable adapter contract before swapping engines.

Output:

- `ReaderAdapter` interface
- Shared `ReaderLocator` contract
- Scroll-based temporary locator helper for the current reader
- Progress persistence that can later accept EPUB locator data

Done when:

- Current reader can persist a normalized locator
- Future reader engines can be plugged in without rewriting AI logic

### Phase 2. EPUB Reader Spike

Goal:

- Integrate `epubjs-react-native` in a contained way.

Implementation note:

- A dev-only spike screen may use compact technical copy while the reader is
  still isolated, but the production-facing reader UI must still satisfy the
  15-locale requirement before rollout.

Output:

- Separate reader implementation behind the adapter
- `onLocationChange` wired into progress persistence
- Bookmark and annotation event mapping
- Vertical scroll mode validated first

Done when:

- One test book opens, restores position, and emits stable location updates

### Phase 3. AI Companion Sync

Goal:

- Keep the AI companion anchored to reading position instead of raw pixel math.

Implementation note:

- Use a shared reader-context snapshot to publish locator, current paragraph,
  paragraph text, and selected text from every reader surface before the full
  production AI sync rollout is finished.

Output:

- Locator-to-context bridge
- Selected text and current paragraph handoff to AI
- Safe auto-scroll contract that requests a target locator instead of forcing
  uncontrolled scroll mutations

Done when:

- AI responses stay aligned with current reading context
- Existing AI270M flow still works during read sessions

### Phase 4. Emotion Sync Migration

Goal:

- Keep emotion feedback tied to reading context after the reader migration.

Implementation note:

- Resolve the active emotion slot from the shared reader-context snapshot first,
  then fall back to local scroll paragraph detection only when locator context
  is not available yet.
- Keep the local novel emotion panel and status bar wired to the same resolved
  paragraph so the current reader and future EPUB reader can share one
  emotion-basis contract.

Output:

- Locator-aware emotion updates
- Paragraph and scene mapping strategy
- Compatibility with current local novel emotion UI

Done when:

- Emotion panel and status bar still update correctly after reader changes

### Phase 5. LNReader-Style UX Upgrade

Goal:

- Improve reading UX, downloads, and library handling using LNReader as the
  benchmark, not as a full transplant.

Implementation note:

- Use locator progression as the canonical resume metric for library and
  download surfaces instead of relying only on chapter index math.
- Surface last-read metadata wherever possible so "continue reading" feels
  consistent before the full offline and queue work is finished.
- Keep download-surface rewrites UTF-8 safe. If an older file contains garbled
  text, prefer routing to a clean replacement screen first, then retire the
  legacy file after verification.

Output:

- Better download queue and offline handling
- Cleaner library and reading settings flow
- Stronger chapter list, bookmark, and resume UX

Done when:

- Offline reading, resume, and library browsing feel consistent and reliable

### Phase 6. Community Model Cleanup

Goal:

- Move toward a cleaner discussion-post-tag model inspired by Flarum.

Implementation note:

- Normalize community feed responses into one shared post model before list
  rendering.
- Apply user moderation preferences such as blocked authors and blocked tags at
  the normalized feed layer so every community screen can reuse the same rule.
- Reuse the same normalized post/detail model across list, detail, tag browser,
  author feed, liked feed, follow feed, and self-managed community screens.

Output:

- Clear board model for free/community/webnovel content
- Unified tag behavior
- Cleaner post detail and feed API assumptions

Done when:

- Community screens can evolve without one-off API logic per screen

### Phase 7. Report and Block Moderation

Goal:

- Upgrade report and block handling using Flarum-like data structure and
  Discourse-like moderation workflow.

Implementation note:

- Route report creation through one moderation API surface that can submit the
  user-facing report and mirror the payload to operator inbox tooling.
- Keep local block actions immediate in-app, but emit a server-side moderation
  signal so admin tooling can audit and triage abuse patterns later.
- Use the mobile admin dashboard as an interim moderation client so queue
  fields, status transitions, and operator copy are exercised before the web
  back office is introduced.

Output:

- `reports` queue
- `blocks` model
- `moderation_actions` audit log
- status flow such as `open`, `reviewing`, `resolved`, `rejected`,
  `auto_hidden`

Done when:

- User block is reflected immediately in-app
- Reports land in a real moderation queue
- Moderators can review, resolve, and audit actions

### Phase 8. Admin Web

Goal:

- Move serious operations into a dedicated web admin surface.

Implementation note:

- Define shared resource blueprints and moderation queue contracts inside the
  app repo first so the future `react-admin` web can reuse stable names and
  fields instead of rediscovering them later.
- Keep mobile admin and future web admin aligned on the same resource names so
  `reports`, `stories`, `users`, and `communityPosts` can be migrated without
  another contract pass.

Output:

- `react-admin` app with resources for reports, stories, users, posts,
  announcements, and support messages

Done when:

- Mobile admin screens are no longer the only operator workflow

## Data Model Targets

### Reports

- `id`
- `reporterId`
- `targetType`
- `targetId`
- `reason`
- `detail`
- `status`
- `assigneeId`
- `resolution`
- `createdAt`

### Blocks

- `userId`
- `targetType`
- `targetId`
- `createdAt`

### Moderation Actions

- `actorId`
- `actionType`
- `targetType`
- `targetId`
- `reportId`
- `note`
- `createdAt`

## Non-Goals

- Do not replace the AI layer with a donor project.
- Do not transplant LNReader wholesale.
- Do not move admin operations into the mobile app if they belong in a web
  back office.

## Quality Gates

Before closing any phase:

1. Typecheck passes.
2. Korean strings still render correctly after changes.
3. No new localization shortcut is introduced that would block 15-language UI.
4. Existing AI webnovel flow still opens and responds.
5. Reader progress restore still works.

## Current Status

- Phase 1: completed
- Phase 2: in progress
- Phase 3: in progress
- Phase 4: in progress
- Phase 5: in progress
- Phase 6: in progress
- Phase 7: in progress
- Phase 8: in progress

Recent progress:

- Downloaded novels routing now points to a UTF-8 safe replacement screen with
  locator-based resume metadata.
- Mobile admin now includes a moderation reports tab backed by the shared
  reports queue contract and status update flow.
- `admin-web/` now contains a `react-admin` scaffold that reads the shared
  resource blueprint names from the app repo.
- `admin-web` now uses a resource-aware custom data provider so reports,
  story moderation actions, user moderation, community post management,
  announcements, and support-message status/reply flows map to the existing
  backend routes instead of assuming generic REST endpoints.
- `admin-web` now builds successfully after dependency install, uses split
  vendor chunks for a smaller production output, and no longer carries the
  unused `ra-data-simple-rest` package.
- Community normalization now covers the main feed, post detail, tag browser,
  author profile feed, likes/bookmarks feed, follow feed, and my content view.
- Chat rebuild baseline now uses `ChatScreenRefactored` as the single active
  export path, anchors first entry at the latest messages, suppresses duplicate
  streaming footer bubbles, adds a scroll-to-bottom action, and keeps user
  avatar taps on the same image/profile path as character avatars.
- Chat bubble polish now includes tighter grouped spacing, visible end-of-run
  tails, more stable timestamp placement, and localized intro/speech-style
  sections in the profile sheet.
- Chat profile entry now uses a bottom-sheet style surface, and long-press
  bubble actions now show labeled chips with clearer reply/copy/edit/bookmark
  affordances.
- Chat header now surfaces live status/model pills plus a character avatar
  cluster, and the active composer now reuses `ChatInputBar.tsx` patterns with
  tighter keyboard docking, stop-generation affordance, and profile-sheet action
  buttons for bookmarks/core memo/continue flow.
