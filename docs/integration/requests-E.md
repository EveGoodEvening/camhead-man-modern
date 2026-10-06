# Requests from E (ui) — for agent I

Status: Phase 1 done (2026-09-29). E needed **no change to any frozen S file** to implement ARCHITECTURE §3.E.
The items below are optional improvements or cross-module notes; none blocks E.

## 1. `src/core/fonts.ts` — warm the handwriting font (optional, S)
The phone 备忘录, the note popups (字条 / 信封) and the photo-card caption use `FONT.hand` ("Long Cang", ART §8.3).
`warmFonts()` does not load it, so the first memo open can swap from the fallback to Long Cang once the slice arrives
(DOM text only, never baked into a canvas, so it is cosmetic). Suggested addition inside the `Promise.all` of
`warmFonts()`:
```ts
document.fonts.load('22px "Long Cang"', uniqueChars([
  ...Object.keys(STR).filter((k) => k.startsWith('clue.') || k.startsWith('item.') || k.startsWith('ui.memo.') || k.startsWith('obj.')).map((k) => STR[k]),
  CARDS.ph_2026_group?.title ?? '',
].join(''))),
```

## 2. Note for F / I: the GDD §19.4 `dialog` checkpoint shows the SMS node, not 小林 (review, 2026-09-29)
The earlier note here (chapter cards replaying on `?chapter=` boot) is obsolete: F's `bootChapter` now marks the boot
state's rules as fired. What remains: `?chapter=ch1&at=sp_store_door` puts the hero inside the `locker_seen` zone, so
F's effect rule starts the system node `sms.garbled` (grey 「系统」 tag) on the first ticks; `talk('xiaolin')` then queues
behind it (E's dialogue queue is FIFO, ARCHITECTURE §3.E). Measured: `state().dialogue.speaker === 'system'`,
`dialog-name` background `rgb(141, 138, 134)` instead of `#f0d055`. Fix options (F/I, not E): shrink/move the
`locker_seen` zone so `sp_store_door` is outside it, or pre-set `locker_seen` (+ its `seen:fx.*`) in `CHAPTER_BOOT.ch1`.

## 3. Note for F: `bootChapter` logs the wx history after `store.replace`
`store.logWx` emits nothing and runs after `stateLoaded`, so E cannot rebuild the chat from the event alone. E now
re-syncs its chat from `state.wxLog` whenever the log grows (src/ui/wx.ts), so nothing is needed; just don't rely on a
`wx` bus event for boot-time history.
