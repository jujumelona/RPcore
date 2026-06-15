# Chat UI Rebuild Plan

## Hard Requirements

1. UI must remain compatible with 15 locales.
2. Korean text must stay valid UTF-8 during every file edit, import, export,
   storage, API, and markdown step.
3. Do not introduce mojibake. Korean copy must be checked after every chat UI,
   translation, markdown, and generated-content change.
4. The existing AI270M chat flow must keep working during the migration.
5. The chat composer must attach tightly to the keyboard with no wasted bottom
   gap.
6. Chat entry must open on the newest messages, not at the oldest top region.
7. Auto-scroll must behave like a real chat app:
   - scroll to bottom on first entry
   - stay at bottom for self-send and active generation when the user is near
     bottom
   - stop forcing bottom when the user is intentionally reading older messages
8. During AI generation there must be exactly one visible active AI bubble for
   the current response. Do not show duplicate streaming and committed bubbles.
9. Avatar tap, image tap, and profile-sheet behavior must feel production-ready
   on Android first.

## Purpose

This document is the execution baseline for rebuilding RPcore chat UI quality
without breaking the current engine, AI session logic, or multilingual support.

Use this as the chat-specific reference point for implementation order.

## Current Pain Points

The current chat experience is missing several baseline behaviors that users
expect from a production messaging UI.

- First entry can start from the top instead of the latest messages.
- Auto-scroll to the latest message is inconsistent during generation.
- Keyboard and composer do not always dock tightly; empty bottom space can
  remain.
- Streaming AI output can appear as two different bubbles instead of one
  stable active bubble.
- Avatar layout, bubble grouping, bubble tail size, and image handling are not
  yet at polished chat-app quality.
- Tapping a round avatar image does not yet feel like a complete profile and
  image-view experience.

## Current RPcore Mapping

Primary current files:

- `src/screens/chat/ChatScreenRefactored.tsx`
- `src/components/ChatMessageList.tsx`
- `src/components/MessageBubble.tsx`
- `src/screens/ChatInputBar.tsx`
- `src/components/PremiumImageViewer.tsx`
- `src/components/modal/ProfileSheet.tsx`
- `src/screens/chat/core/ChatEngineCore.ts`

Supporting libraries already in the repo:

- `react-native-keyboard-controller`
- `@gorhom/bottom-sheet`
- `react-native-reanimated`
- `react-native-gesture-handler`

## Architecture Risk Notes

The current chat stack appears to have more than one render path.

- `ChatScreenRefactored.tsx` contains its own `FlatList` chat renderer.
- `ChatUI.tsx` also contains a separate older chat renderer path.
- `ChatMessageList.tsx` has its own scroll and streaming footer behavior.

This increases the chance of:

- entry-position mismatches
- duplicate streaming UI
- bottom-scroll inconsistencies
- keyboard layout conflicts
- feature drift between chat surfaces

## Chosen Donor Stack

- Bubble and composer behavior donor: `react-native-gifted-chat`
- Real-world interaction pattern donor: `stream-chat-react-native`
- Avatar and image zoom donor: `react-native-image-viewing`
- Keyboard docking base: `react-native-keyboard-controller`
- Profile and action sheet base: `@gorhom/bottom-sheet`

These donors should be used for UX patterns and focused components, not for a
full engine replacement.

## Product-Level Done Criteria

The chat rebuild is done only when the following are true:

1. Entering chat lands on the latest visible messages.
2. Sending a message keeps the user pinned to the latest part of the chat.
3. AI generation shows one stable active bubble, not two.
4. The composer docks to the keyboard without dead space on Android.
5. Avatar tap can open a usable image/profile flow.
6. Long conversations still scroll smoothly.
7. Korean and all localized UI strings still render correctly.

## Current Execution Status

- Phase 1 baseline landed:
  - `ChatScreenRefactored.tsx` remains the active owner.
  - legacy `ChatUI` is no longer re-exported from
    `src/screens/chat/index.ts`.
- Phase 2 baseline landed:
  - first entry now requests repeated bottom anchoring instead of relying on a
    single fragile scroll call.
  - self-send, session restore, and streaming start now request bottom follow
    bursts.
  - a scroll-to-bottom button now appears when the reader drifts far above the
    live edge.
- Phase 3 baseline landed:
  - the footer typing indicator is now suppressed while the active streaming
    bubble already exists.
  - empty streaming states now stay inside the active bubble instead of feeling
    like a second surface.
- Phase 4 baseline landed:
  - the redundant `KeyboardAvoidingView` wrapper was removed from the active
    chat screen.
  - list bottom padding now follows the measured overlay height instead of
    double-counting extra bottom space.
- Phase 5 baseline landed:
  - same-speaker runs now use tighter vertical spacing and a clearer bubble
    silhouette.
  - active end-of-run chat bubbles now render a visible tail instead of
    feeling like generic rounded cards.
- Phase 6 baseline landed:
  - tapping the user's round avatar now reaches the same image/profile path as
    character avatars when an avatar image exists.
  - chat profile entry now uses a dedicated bottom-sheet style surface instead
    of the previous full-screen modal feel.
  - the profile sheet now uses localized intro and speech-style sections when
    that character data exists.
- Reply and action polish landed:
  - the reply bar now reads more clearly as an active reply state instead of a
    plain banner.
  - bubble long-press actions now show labeled chips rather than icon-only
    buttons.
  - action chips now animate in/out instead of appearing abruptly.
- Header and composer polish landed:
  - the chat header now shows live status/model badges instead of discarding
    those values.
  - the header now also carries a character avatar cluster and stronger state
    presence instead of looking like a plain title bar.
  - the active composer now reuses `ChatInputBar.tsx` patterns directly, keeps
    the keyboard dock tight, supports stop-generation, and preserves reply state
    inside the same input surface.
- Interaction polish landed:
  - swipe-to-reply now exposes a clearer reply hint instead of a barely visible
    icon-only reveal.
  - bubble metadata now keeps timestamp placement and grouped spacing more
    consistent near the end of a speaker run.
  - long-press action state now has an outside-tap dismissal layer instead of
    forcing users to reopen the same bubble to close it.
- Profile sheet actions landed:
  - the bottom-sheet profile entry now exposes direct actions for continuing the
    chat, opening the character list, opening bookmarks, or opening core memo
    depending on context.
- Legacy cleanup landed:
  - `src/screens/chat/index.ts` no longer re-exports the old `ChatInput`
    component path, keeping `ChatScreenRefactored.tsx` as the practical owner of
    the active chat surface.
- Phase 7 intentionally deferred:
  - image send/receive polish is not a current priority for this app path, so
    attachment-heavy donor work stays out of scope unless product direction
    changes.

## Execution Order

### Phase 1. Single Chat Render Path

Goal:

- Consolidate chat UI rendering so one canonical list/composer path owns chat
  layout behavior.

Output:

- Decide one primary render stack:
  - `ChatScreenRefactored.tsx`
  - `ChatMessageList.tsx`
  - `ChatInputBar.tsx`
- De-scope the legacy `ChatUI.tsx` path from active production flow.
- Document one source of truth for message order and list direction.

Done when:

- New chat bugs no longer need to be fixed in multiple list implementations.

### Phase 2. Scroll Contract

Goal:

- Make chat scroll behavior deterministic and chat-like.

Output:

- One scroll controller contract for:
  - first entry
  - self-send
  - AI streaming
  - keyboard open/close
  - manual user scroll away from bottom
- Explicit `near bottom` threshold rules.
- Resume behavior that restores to latest live chat area by default.

Done when:

- Entering chat no longer starts from the top.
- Generation no longer leaves the active reply outside the viewport when the
  user is already near bottom.

### Phase 3. Streaming Bubble Contract

Goal:

- Prevent duplicate active AI reply bubbles.

Output:

- One canonical active reply state:
  - `idle`
  - `user_pending`
  - `ai_streaming`
  - `ai_committed`
- Replace-in-place commit behavior for the active AI message instead of
  rendering one streaming bubble plus one final bubble.
- Clear visual distinction for:
  - typing indicator
  - streaming message
  - committed message

Done when:

- AI generation never shows two separate current-response bubbles.

### Phase 4. Composer and Keyboard Dock

Goal:

- Make the input bar sit flush on the keyboard with no wasted area.

Output:

- One owner for keyboard docking, based on `KeyboardStickyView`.
- Remove redundant keyboard-avoidance layers where they conflict.
- Stable bottom inset formula for:
  - safe area
  - reply bar
  - choice panel
  - emotion dock
- Android-first keyboard open/close QA checklist.

Done when:

- The composer visually attaches to the keyboard without floating gaps.

### Phase 5. Bubble Layout and Grouping

Goal:

- Bring bubble and avatar layout to production chat quality.

Output:

- Stable grouping rules for same-speaker runs.
- Avatar visibility rules:
  - show once per run
  - hide repeats within the same run
- Consistent bubble radius, tail size, spacing, and timestamp placement.
- Separate visual systems for:
  - user
  - AI character
  - narrator
  - image card
  - streaming

Done when:

- The conversation reads as one polished thread instead of mixed components.

### Phase 6. Avatar, Image Zoom, and Profile Sheet

Goal:

- Make character and user identity interactions feel complete.

Output:

- Round avatar tap opens:
  - enlarged image view
  - profile sheet
  - relevant actions such as follow, block, or inspect
- Full-screen image viewer with:
  - pinch zoom
  - double tap
  - swipe-to-close
- Character profile sheet built on bottom sheet patterns.

Done when:

- Tapping an avatar feels like a finished feature, not a placeholder.

### Phase 7. Attachments and Rich Bubble Polish

Goal:

- Make image and rich-content messages feel native to the thread.

Output:

- Better image-card sizing and aspect handling.
- Unified image bubble spacing with text bubbles.
- Preview and open behavior that matches regular chat expectations.

Done when:

- Image messages no longer feel like a separate temporary system.

### Phase 8. QA, Localization, and Regression Guardrails

Goal:

- Lock down the rebuilt chat behavior across core flows.

Output:

- QA matrix for:
  - Android keyboard dock
  - first entry scroll
  - long thread scroll
  - streaming AI
  - reply mode
  - image zoom
  - avatar/profile sheet
  - Korean and localized copy validation
- Regression checklist for future chat changes.

Done when:

- The rebuilt chat flow is testable and no longer depends on fragile manual
  behavior.

## File-Level Work Backlog

### Core Ownership

- `src/screens/chat/ChatScreenRefactored.tsx`
  - make this the top-level owner of chat lifecycle and layout
- `src/screens/chat/core/ChatEngineCore.ts`
  - normalize active streaming message state
- `src/components/ChatMessageList.tsx`
  - own list virtualization and bottom-scroll behavior
- `src/screens/ChatInputBar.tsx`
  - own composer and keyboard dock contract
- `src/components/MessageBubble.tsx`
  - own bubble, avatar, tail, grouping, and image-entry behavior
- `src/components/PremiumImageViewer.tsx`
  - upgrade or wrap with a more focused chat-avatar image viewer
- `src/components/modal/ProfileModal.tsx`
  - evolve into a stronger profile entry surface or replace with bottom sheet

### First Fix Targets

1. Remove duplicate current-response rendering between streaming state and final
   committed message state.
2. Force first entry and self-send to latest message anchor.
3. Make keyboard docking bottom spacing deterministic.
4. Normalize bubble grouping and avatar repetition rules.

## Non-Goals

- Do not replace the AI engine or session logic with a donor project.
- Do not remove multilingual support to simplify chat UI work.
- Do not risk Korean text corruption while editing chat copy or markdown files.

## Quality Gates

Before closing any chat phase:

1. Root typecheck still passes.
2. Korean strings still render correctly.
3. No new localization shortcut blocks 15-language UI.
4. AI270M chat still starts, streams, and completes correctly.
5. Chat entry, send, and generation all behave correctly at the latest-message
   edge.

## Recommended Immediate Build Order

1. Consolidate to one active renderer path.
2. Fix initial entry to latest-message position.
3. Fix duplicate streaming/final bubble behavior.
4. Fix composer-to-keyboard docking.
5. Upgrade bubble/avatar/profile/image interactions.
