# Kept — Budgeting App: Design Spec

Hand-off for implementation. Mobile-first (iPhone, 390 × 844), light mode. Goal: simple, calm, premium, Apple-like. Lots of space, big quiet numbers, one accent color, no clutter.

Design preview (private): https://claude.ai/artifact/3BiWQRiRbJbv8oi3aDvRJb

## Principles
- One idea per screen. One hero number per screen.
- Hierarchy through size and weight, not color or borders.
- White rounded cards on a soft gray background; hairline dividers, no heavy outlines or shadows.
- One accent (green). Orange only as a warning (budget nearly used). No red/green pairs for meaning alone: always pair color with text ("$14 left").
- No emoji. Stroke icons only (1.75px, round caps/joins).
- Touch targets ≥ 44px. Real `<button>` / `<a>` elements. `aria-label` on icon-only buttons.

## Design tokens

### Color
| Token | Value | Use |
|---|---|---|
| `bg` | `#F2F2F7` | App background |
| `surface` | `#FFFFFF` | Cards |
| `text` | `#1C1C1E` | Primary text |
| `text-secondary` | `#6C6C70` | Labels, meta (passes 4.5:1) |
| `accent` | `#0B7A55` | Primary actions, progress, active tab, positive amounts |
| `accent-tint` | `#E3F2EC` | Income icon background |
| `accent-mid` | `#5BB594` | Chart series 2 |
| `warn` | `#C2620A` (bar) / `#B05A06` (text) | Budget ≥ ~90% used |
| `track` | `#E2E2E8` / `#E9E9EE` | Progress track |
| `divider` | `#ECECF0` | Row dividers inside cards |
| `segment-bg` | `#E4E4EA` | Segmented control track |
| `chart-muted` | `#D9D9DF` | Past-period bars |
| `chart-gray` | `#9A9AA0`, `#D0D0D6` | Chart series 3 / 4 |
| `tabbar` | `rgba(249,249,251,0.88)` + 24px blur | Tab bar, hairline top border `rgba(60,60,67,0.14)` |

### Type
Font stack: `-apple-system, 'SF Pro Display', Inter, system-ui, sans-serif`, antialiased.

| Role | Size / weight | Tracking |
|---|---|---|
| Hero number (Today) | 68 / 600 | -0.035em |
| Amount entry | 64 / 600 | -0.035em |
| Big stat (Insights) | 40 / 600 | -0.03em |
| Large title | 34 / 700 | -0.03em |
| Section title | 17 / 600 | -0.01em |
| Row title | 16 / 500 | — |
| Body / secondary | 15 / 400–500 | — |
| Meta | 14 / 400 | — |
| Tab label | 11 / 500 (600 active) | — |

### Shape and spacing
- Screen side padding: 20px. Top padding: 56px (below the status area; no fake status bar).
- Card radius: 22px (list cards), 16px (form group), 16px (primary button), pill = 20px (chips).
- Card padding: 20px horizontal; list rows 12–14px vertical.
- Gaps between cards: 16px. Section gap after hero: 28px.
- Progress bar: 5–6px tall, fully rounded.
- Segmented control: radius 10, inner radius 8, active = white with `0 1px 3px rgba(0,0,0,.1)`.

## Navigation
Bottom tab bar, 84px tall, 4 slots: **Today**, **Budgets**, **Add** (48px filled accent circle with white +), **Insights**. Active tab = accent color + 600 weight; inactive = `text-secondary`. Content scrolls beneath the translucent bar. Add opens as a full-screen modal (no tab bar) with Cancel top-left.

## Screens

### 1. Today (home)
- Header row: "October" (17/600) left; settings icon-button (44×44) right.
- "Left to spend" (15, secondary) → **$1,842** hero → "of $3,200 · 11 days left".
- Overall progress bar (42% filled, accent). Under it: "$1,358 spent" left, "$167 a day" right (14, secondary).
- **Budgets card**: title + "See all" link (accent). Three rows: name left, amount right ("$312 of $500"), thin bar below. Over-threshold row shows "$14 left" in warn color with warn bar.
- **Recent card**: rows with 40px circular icon (neutral `#F2F2F7`; income uses `accent-tint`), merchant (16/500), "Category · time" (14, secondary), amount right. Income amounts are accent-colored with "+"; expenses use "−" (true minus).

### 2. Budgets
- Large title "Budgets"; segmented control Monthly | Weekly.
- Centered ring (168px, stroke 10, rounded cap, starts at 12 o'clock): accent arc = % spent; center shows "$1,842" (32/600) and "left of $3,200".
- List card of categories (Rent & bills, Groceries, Dining out, Transport, Leisure), each with name, "spent of budget", and bar. Nearly-used categories switch to warn.

### 3. Add expense
- Top: Cancel (accent) | "New entry" | spacer. Segmented: Expense | Income.
- Amount centered 64/600, "from Everyday account" beneath.
- Category chips (wrap, centered): selected = accent fill + white text; others white.
- Form group card: Date (Today), Note (Add a note) — rows 48px.
- Number pad: 3×4 grid, transparent 54px keys, 28/500 numerals, last key = backspace icon.
- Primary button "Save expense": full width, 56px, accent, radius 16, 17/600.

### 4. Insights
- Large title; segmented Week | Month | Year.
- Summary card: "Spent in October" → **$1,358** → "12% less than September" (accent, 15/500). Six-month bar chart (136px tall, 12px gaps, top-rounded 8px): past months `chart-muted`, current month accent; month labels beneath (12px), current bold accent. Provide an accessible text alternative with the values.
- "Where it went" card: segmented stacked bar (10px, 3px gaps) + legend rows with dot, name, percentage. Series colors differ in lightness (not hue only): `#0B7A55`, `#5BB594`, `#9A9AA0`, `#D0D0D6`.

## Sample data (placeholder)
Budget $3,200 · spent $1,358 · left $1,842 · 11 days left · $167/day.
Groceries 312/500, Dining 186/200, Transport 64/150, Leisure 82/250, Rent & bills 1200/1200.
Recent: Blue Bottle Coffee −$6.50, Whole Foods −$54.20, Paycheck +$2,400.
Monthly spend May–Oct: 1620, 1480, 1710, 1530, 1543, 1358.

## Implementation notes
- Suggested stack: React Native / Expo or SwiftUI; for web, React + Tailwind with the tokens above as CSS variables.
- Store money as integer cents; format with `Intl.NumberFormat`. Use tabular numerals for amounts.
- Derive "left", "per day", progress %, and warn state (≥ 90% used) from data; don't hardcode.
- Animate progress bars and the ring on mount (~400ms ease-out); respect `prefers-reduced-motion`.
- Haptic tick on number-pad keys and a light success haptic on save (native).
- To do next: dark mode (swap `bg`→`#000`, `surface`→`#1C1C1E`, keep the accent lighter, e.g. `#34C48E`), onboarding, empty states, and category/transaction detail screens.
