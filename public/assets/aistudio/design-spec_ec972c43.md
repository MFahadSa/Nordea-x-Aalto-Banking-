# Abel design spec (match v11 exactly)

The reference is `context-cabinet-nordea-v11.html` plus the screenshots `light-*.png` and `dark-*.png`.
The stylesheet is `design-system.css`, extracted verbatim from v11. **Use it as the global stylesheet and reuse its
class names. Do not invent a new visual style.**

## 1. Theme
- **Light mode is the default.** Follow the operating system setting (`prefers-color-scheme`), and let the toggle
  override it using `data-theme="light" | "dark"` on `<html>`, exactly as `design-system.css` does.
- All colours come from the CSS variables in `:root` (light) and the dark overrides. No hard-coded colours in components.
- Light: page `--bg #EEEFF3`, cards `#FFFFFF`, ink `#10132B`, brand `#0000A0`. Dark only changes the variables.

## 2. Typography
- Noto Sans. Body **16px**, card titles **17px / 700**, secondary text **14px** muted grey,
  amounts **16px / 700** right-aligned with two decimals (14,200.00).
- **No uppercase labels** ("PRIMARY GOAL", "QUICK ACTIONS", "CONCEPT · FICTIONAL DATA" in caps are wrong).
  Use sentence case: "Quick actions", "Accounts and cards".
- **Nothing below 12.5px**, except the small "Concept · fictional data" tag.
- No monospace text anywhere (account numbers use the normal font, grey).

## 3. Layout
- Phone mockup: a real 390×844 screen, **scaled as a whole** to fit the window (see `fitPhone()` in v11).
  Everything, including the chat and sheets, stays **inside** the phone.
- Header: deep blue band with a subtle line pattern (top right). The **real logo image** (from v11), "Welcome, Lauri!" under it,
  the "Concept · fictional data" tag top left, then Notifications with a bell and badge, and the avatar, top right.
  Nothing else in the header (no "PROTOTYPE", no "Full Mode", no points badge).
- Cards: white, **4px radius**, no visible border, very soft shadow, 14px side gutter, 10px gap.
  The first card overlaps the blue header.
- Quick actions: **round 56px outlined circles** with the label underneath (Nordea app pattern), no boxed tiles.
  "Abel" is the filled blue circle with the green online dot.
- Lists inside cards: rows separated by 1px dividers, name left, grey sub-line, bold amount right.
- One accent colour (Nordea blue). Status colours only for meaning: green = you told us / ok,
  orange = Nordea noticed, amber = warning. **No glows, gradients on cards, or neon outlines.**

## 4. Calm
- Fewer badges and labels. If a label doesn't help the customer decide something, remove it
  ("Verified Synthetic", "Observation" chips, "Phase 1" banners).
- Technical details (gateway reads, agent ids) belong in the Access Log, not on the home screen or in chat bubbles.

## 5. Chat (see `light-4-chat.png`)
- Opens as a sheet **inside the phone**, below the status bar: white header with the Abel avatar,
  "Abel" and "Your Nordea assistant · online", plus refresh and close icons.
- Abel's bubbles: light grey, 18px radius with a 6px corner at the bottom left, avatar on the last bubble of a group,
  "Abel" name above the first. Your bubbles: Nordea blue, white text, right aligned.
- Quick replies: outlined pills, right aligned, stacked.
- Input: rounded pill field plus a round blue send button, with a small grey "Concept · fictional data" line below.
- The window is built once; new messages are appended (no full re-render), and it scrolls smoothly to the newest message.

## 6. Calm view (Eeva)
Same design system, with body text 18–19px, at most 4 widgets, bigger tap targets (min 52px),
and a "Talk to a person" card always visible. Same colours. No separate visual style.
