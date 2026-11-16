# Design

How Cuisko looks, moves and feels, and the rules a screen or component must obey.

**This page holds rules, not values.** Colours, spacing, radii and type sizes live in
[`src/global/theme.ts`](../src/global/theme.ts) and nowhere else. If a number in this page and a
number in that file disagree, the file wins and this page is wrong. For *what the app is for* and its
voice, see [PRODUCT.md](./PRODUCT.md). For where a component file goes, see
[CONVENTIONS.md](./CONVENTIONS.md) and [ADR 0002](./adr/0002-ui-isolation.md).

Two marks are used below:

- **Holds** — the code already does this. A change that breaks it is a regression.
- **Target** — the rule we adopt, not yet audited against every screen. Apply it to code you write
  or touch; report a screen that breaks it rather than fixing it on the side.

---

## 1. Principles

Product first, craft second. Each of these ties a design choice to a line of
[PRODUCT.md](./PRODUCT.md).

| Principle | In practice |
| --------- | ----------- |
| **Built for the beat** | Planning is seated and unhurried. Shopping is one-handed, in a shop: big targets, obvious state. Cooking is hands dirty: large text, nothing to decide. Design each screen for its beat, not for a generic user. |
| **Nutrition is information, never a verdict** | No red on a single plate, no "blown" budget. Colour scales belong to the week summary only (anti-goal 1). |
| **Remove work, do not add it** | If a design needs the cook to type something the app could infer, redesign it (anti-goal 2). |
| **Forgiving** | An easy undo beats a confirmation. A confirmation dialog is only for an action that is destructive *and* irreversible. Deviating from the plan is never shown as failure (anti-goal 4). |
| **Simple, not minimal** | Show the common path first and the advanced one a level deeper. A control that needs a label to explain it is badly placed. |
| **Craft** | Every spacing, timing and alignment is a value someone chose. A jittery scroll or a misaligned icon reads as carelessness. |

---

## 2. Tokens — Holds

[`theme.ts`](../src/global/theme.ts) is the only source. It is two tiers, and the split is the point.

- **Tier 1, `PALETTE`, is private.** A component cannot reach a colour that has no role. The fix for
  a missing shade is to name a role in tier 2, never to export the palette.
- **Tier 2, `theme.colors`, is roles.** Colours only: no widths, no radii. A component keeps its own
  recipe (a primary button is `primary.foreground` on `primary.base`).
- **A tone is `base`, `elevated`, `subtle` and `foreground`** (`neutral` adds `muted`). What sits on a
  tone's `base` is that tone's `foreground`, never another tone's.
- **Brand and feedback are separate names.** `success` aliases `secondary` today. Write
  `success`, never `secondary`, when the meaning is "it worked" or "you have it". **Target.** Several
  "owned" and "bought" marks still read `secondary`.
- **Spacing comes from `theme.spacing`.** Its keys are a closed union: `theme.spacing[6]` compiles,
  `theme.spacing[7]` does not. Never write a raw number for a gap, a padding or a margin. **Target.**
  About 35 raw values remain.
- **Radii and text styles come from the theme.** Never an inline `fontSize` or `borderRadius`.
  **Target.** A few cards still set `fontSize` inline.
- **No raw hex or `rgba(` in a component.** A translucent surface is a token derived with
  `_withAlpha`. **Target.** Shadow colours (`rgba(0, 0, 0, …)`) are written inline today; the fix is a
  shadow token, not more inline ones.
- **Light only today.** A dark scheme is a second object of the same shape swapped in at tier 2, with
  no component change. That only works while every component reads roles, which is why the rules
  above are worth closing the gaps in.

---

## 3. Type — Holds

- **One display face, one system face.** The display face (Nunito, a rounded sans) is for H4 and
  large figures only. Everything else is the system font, apart from the platform monospace for code
  in the assistant's replies. Do not add another face.
- **Tracking is size-specific and negative.** Each text style in the theme carries its own
  `letterSpacing` and `lineHeight`. Spread the whole style. Change its weight if you must, never its
  size, leading or tracking alone.
- **A display face is checked for width, not height.** It wraps a long heading sooner than the
  system face at the same size. Test a long French title, accents included (`Éclair`).
- **Never set a `fontWeight` of 700 or more on the display face** without reading
  [`fonts.ts`](../src/global/fonts.ts): on Android it silently falls back to the system font. To
  change weight, load a different file.
- **Respect the reader's text size.** Layout grows with the text; a fixed-height box around text is a
  clipping bug waiting for a large setting. **Target.**
- **Quantities and durations in a recipe are bold.** The eye finds the number first.

---

## 4. Components — Holds

- **`src/ui/` knows no backend.** Props are structural. Strings arrive as props, never from
  `translations` ([ADR 0002](./adr/0002-ui-isolation.md)).
- **Search before you build.** A card, a row, a sheet, a chip probably exists in `src/ui/components/`.
  If you are writing the second copy, propose extracting it.
- **A recipe is a card, a plate is a carousel item.** Domain-shaped components live in a subfolder
  of their shape (`cards/`, `carousels/`) and stay pure.
- **All text goes through `Text`.** It applies the tokens and the platform font fixes.
- **All taps go through `Pressable`** (section 5). **Target.**

### States a component must draw — Target

A component is not finished until each of these exists, or is ruled out in a comment.

| State | Rule |
| ----- | ---- |
| **Empty** | Cuisko speaks, and offers the next step. Never a blank area. Uses `empty-state`. |
| **Loading** | The shape of what is coming, not a bare spinner. A long wait (a generated week) gets the loading screen, with steps that say what is happening. |
| **Error** | Plain words, no mascot jokes, one way to retry. See the voice rule in [PRODUCT.md](./PRODUCT.md). |
| **Pressed** | Instant, on press-in, not on release. Section 5. |
| **Disabled** | Visibly different, and says why when the reason is not obvious. |
| **Long content** | A title that wraps, a name with no spaces, a French string 30% longer than the English one. |

---

## 5. Touch and feedback

### Pressing — Holds

- **`Pressable` from `@ui/pressable` scales on press-in, locks a second tap for 300 ms, and supports a long
  press.** Use it for every new tappable, never `TouchableOpacity` or React Native's own `Pressable`.
  **Target.** Three screens still use the bare one (the account drawer, the navigation bar, the recipe
  import).
- **Feedback on press-in.** A press that waits for release feels dead.
- **A tap that navigates needs no haptic.** The screen changing is the feedback.
- **A control that stays where it is ticks.** A stepper, a chip, a heart, a tick-off: `haptic` on
  `Pressable`, which fires a selection tick. A long press always gives a soft impact, since it has no
  visible start.

### Targets — Target

- **44 pt minimum** in both directions for anything tappable, with `hitSlop` when the drawn element is
  smaller. In the shop beat, prefer larger: one thumb, one hand, arm's length.
- **An action that cannot be taken back takes two taps, not a dialog.** `useArmedPress` is the
  pattern: the first tap changes the button's words, the second confirms, and it disarms on its own.
  Keep such a control away from the one used most.

### Haptics — Holds, with a Target

- **A haptic marks a meaningful moment:** a tick-off, a snap, a commit. Not every tap.
- **It fires on the causal event, on the same frame as the visual.** A tick that lands after the
  animation settles feels broken. **Target.**
- **Success and error use the notification haptic, never the selection tick.** **Target.**

### Forgiveness — Holds

- **Undo for a few minutes, client-side** ([ADR 0009](./adr/0009-the-client-decides-an-undo.md)).
  Ticking an item is one tap and reversible, so it never asks first.

---

## 6. Motion

Motion is the answer to a touch, not decoration. The shape is Apple's: a thing responds at once,
moves continuously, carries the speed it was given, and can be grabbed again mid-flight.

### Whether to animate — Target

- **Animate to explain a change** (a card leaves the list, a sheet comes from its button), **to answer
  a touch**, or **to cover a wait**. Anything else is decoration: leave it out.
- **Do not animate what the cook does many times a day.** The cooking steps and the shopping ticks
  stay quick and quiet.
- **Never animate layout properties by hand** (`width`, `height`, `top`). Animate `transform` and
  `opacity`, on the native thread, with Reanimated for anything new (`Pressable`'s press scale is the
  one place on React Native's own `Animated`). A layout change goes through a layout transition.

### Springs, not durations — Target

- **A thing the user touches uses a spring.** A spring is interruptible and keeps its velocity.
  A timed animation is for something nobody touched: a fade, a progress fill, a loop.
- **Two knobs, as Apple has them:** response (how fast) and damping ratio (how much bounce). The
  popover already speaks it: open at 380 ms and ratio 0.82, close at 300 ms and ratio 1.
- **Default to no bounce** (ratio 1). **Add bounce only when the gesture carried momentum**: a flick,
  a throw, a drag released. A menu that fades in and then wobbles looks wrong.
- **Close is quicker than open, and has no bounce.** The user already knows where it went.
- **Name a spring once** as a constant at the top of the file, with a line on why. The plate
  carousel's `SNAP_SPRING` is the model: named, and its comment says the bounce is deliberate.

### Gestures — Target

- **Track 1:1 while the finger is down**, from where it grabbed, not from the element's centre.
- **Never block input during a transition.** A closing sheet that is grabbed follows the finger.
- **Hand the release velocity to the spring.** No seam between the drag and the settle.
- **Decide by projected end, not release point.** A hard flick can carry the plate carousel past
  more than one plate; a slow drag that stops halfway returns.
- **Resist at the edge, do not stop dead.** Rubber-band past a boundary.
- **Enter and leave by the same path.** A drawer that came from the right goes back to the right. A
  popover grows from the control that opened it, never from its own centre.

### Reduced motion — Holds

- **Gate a layout animation or a decorative loop on `useIsMotionAllowed`.** It reads the system
  setting and the old-device flag. Not attaching the animation is the rule, because skipping an
  attached one left cards frozen on Android.
- **Reduced motion keeps the meaning, loses the movement.** The popover swaps its spring for a short
  fade. A change of state still shows; it just does not travel.
- **A loop that never ends is decoration**, and stops under reduced motion. The one exception is a
  loop whose movement *is* the instruction: the onboarding paw keeps tapping, because a paw that
  stands still is not read as "tap here". It is small and stays in place. Any other exception needs
  the same reason in a comment.
- **Stop a loop when its screen is not visible.** **Target.**

---

## 7. Layout and surfaces

- **The week is the hero.** On home, the header and week summary come first, then the plate
  carousel, and the shortcuts, ideas and favorites follow it. Nothing else goes in front of the
  carousel ([PRODUCT.md](./PRODUCT.md)).
- **Frosted surfaces carry the page.** A card is a translucent `surface` with a hairline
  `border.default`, which reads as a highlight, not a line. **Never put a translucent surface on
  another translucent surface**: the text loses its contrast. **Target.**
- **A bigger surface reads as thicker.** A sheet gets more blur and a deeper shadow than a chip.
  **Target.**
- **A phone, held upright, is the only screen.** The layouts are built for a phone 360 to 412 pt
  wide and 780 to 915 pt tall. A tablet and a computer are not targets: nothing is laid out for
  them, and a layout is never made worse on a phone to suit them.
- **Respect the safe area on every edge**, with `safe-area-view`. The navigation bar sits at the
  bottom, where the thumb is.
- **Wayfinding.** Each screen answers: where am I, what can I do, how do I get out. Never trap the
  cook. Name a place for what it contains, not with a vague umbrella. **Target.**

---

## 8. Accessibility — Target

Cuisko is used in a shop, one-handed, in bad light, and in the kitchen with wet hands. Those are
accessibility conditions too.

- **Every tappable has a label and a role.** An icon-only button without `accessibilityLabel` is a
  bug. The label is a translated string passed in as a prop.
- **Contrast of 4.5:1** for text and 3:1 for large text and icons, in the light scheme. Check the
  `muted` ink on the frosted surfaces first; it is the likeliest to fail.
- **Nothing is conveyed by colour alone.** A ticked item also changes shape, text or icon, not only
  its colour.
- **A state change is announced** (an item ticked, a plate swapped), not only drawn.
- **Reading order follows the visual order**, and a sheet traps focus until it is closed.

---

## 9. Copy in the interface

The voice is in [PRODUCT.md](./PRODUCT.md). What it means for a design:

- **A button names the action** (*Planifier ma semaine*), in the infinitive.
- **Say what will happen before the tap** when a tap has a cost: the sheet that plans a recipe says
  its groceries get listed.
- **Plain on failure, warm on good news.** The mascot steps back in an error and mid-task.
- **Both languages, always.** Design for the longer one, and never cut a French string to fit.
- **No exclamation marks on a warning.**

---

## 10. Checking a change

Before you call a UI change done:

1. **Run it.** Open it in the simulator or on the web build and use it. A typecheck proves nothing
   about feel. Look at it, and take screenshots, at the two phone sizes the app is made for:
   **360 × 780** (a small phone) and **412 × 915** (a large one). Never judge it at a tablet or
   desktop width.
2. **Break it.** Feed it a long title, a one-letter name, zero items, two hundred items, French. The
   `break-ui` skill does this.
3. **Switch motion off** in the system settings, and check the screen still makes sense.
4. **Read the motion once in slow motion**, for a seam between a drag and its settle.
5. **Compare it to the beat.** Would it work one-handed in a shop, on a Tuesday evening?

---

## References

Skills that carry detail this page does not repeat. They are guides, not law: where they disagree
with this page or with the code, this page and the code win.

- **`apple-design`** — the source of section 6. Written for the web; its CSS parts (backdrop filter,
  `prefers-*` queries) do not apply, and its spring, interruption, velocity and projection parts do.
- **`animate-expo`** — building motion for React Native and Expo: which thread, which properties,
  haptics, gestures, sheets and screen transitions.
- **`review-animations`**, **`improve-animations`**, **`find-animation-opportunities`** — review the
  motion in a change, audit a whole codebase, and find where motion is missing.
- **`mobile-native`** — native conventions.
- **`break-ui`** — the worst-case data pass of section 10.
- **`pick-ui-library`** — choose a trusted library instead of hand-rolling a toast or a sheet.

### Installing them

Check first: if the skill is in your skill list, it is installed. If not, run this from any folder:

```bash
npx skills@latest add emilkowalski/skills
```

The installer lists the skills and asks which to install. Tick the eight skills above, `apple-design`
included. Choose project scope to keep them in this repository, or global to have them everywhere.

A skill is a guide, not a rule. A web-only skill that fires on a React Native screen gives advice that
does not apply.
