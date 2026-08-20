# 2048 — Technical Specification

Supersedes all prior drafts. Where this document conflicts with any earlier version, this document wins.

---

# 1. Architecture & Core Setup

## 1.1 Rendering Engine

- **Engine:** PixiJS `v8.11.0`.
- PixiJS strictly handles the game board, tiles, spring animations, and canvas rendering.
- DOM/TailwindCSS handles surrounding application UI (Headers, Score Cards, Modals, Popovers).
- The board must use PixiJS hardware-accelerated rendering rather than DOM-rendered tiles. Avoids cheating.

### Renderer Preference

The application dynamically selects the highest available hardware acceleration tier. Preferred renderer order:

1. WebGPU (via `WebGPURenderer`)
2. WebGL2 (via `WebGLRenderer`)
3. WebGL1 (where required by legacy renderer fallback)

### OffscreenCanvas & WebWorker Offloading

Dictates thread offloading to prevent PixiJS rendering from blocking the main thread during heavy JavaScript execution:

- Use an `OffscreenCanvas` transferred to a WebWorker for PixiJS rendering where supported (`window.OffscreenCanvas` and `Worker` available).
- Communication between the main thread and the rendering worker uses a dedicated `MessageBroker` syncing `call`, `response`, `addListener`, `removeListener`, and `emit` events.
- Fall back gracefully to main-thread rendering where `OffscreenCanvas` or WebWorker rendering is unavailable or fails to initialize.

---

## 1.2 Resolution / Device Pixel Ratio (DPR)

The Pixi stage resolution mathematically maps to the browser's `devicePixelRatio`, clamped to prevent excessive VRAM usage on ultra-high-density mobile displays.

Explicit resolution caps (calculated via `Sc()` logic):

- Screens `< 640px` (mobile widths): maximum resolution capped at `2.0`.
- Screens `≥ 640px` (tablet/desktop widths): maximum resolution capped at `3.0`.
- Minimum resolution bound: `1.0`. Step clamping occurs to the nearest `0.25` interval.

Stage scale formula:

```text
scale = 1 / resolution
```

---

## 1.3 Text Rendering

Canvas tile text utilizes a Multi-channel Signed Distance Field (MSDF) approach for crisp hardware-accelerated typography scaling.

MSDF Parameters:

- Base atlas rendered font size: `100px`.
- Distance-field range: `4px`.
- Fallback font configuration: The UI text operates directly through CSS/DOM layout rendering.

---

## 1.4 Routing

The application utilizes a path-based Single Page Application (SPA) routing architecture, managing localized history states.

Explicit Routes:

- `/` (Standard mode with powerups)
- `/classic` (Vanilla 2048)
- `/plus` (dark board, more powerups)
- `/tutorial` (Scripted sequence, hidden from dropdown menu after completion, stored)
- `/privacy-policy` (Legal document layout)
- `/about` (Historical context & credits; includes a **Midnight Theme** toggle — see Section 3.3 and Section 6.3. This toggle re-skins the _entire_ application, not just the board, into the Midnight palette. It is independent from and stacks on top of the Standard/Plus theme system.)
- `/troubleshooting` (Technical support steps)

Route Event Handlers:

- Unknown routes strictly fall back to: `/`
- Route changes dynamically trigger `Escape` behavior equivalents, explicitly auto-canceling active powerup `Selecting` states to prevent orphaned state logic.
- Game state persistence is isolated per gameplay mode where applicable (`gameState`, `classicGameState`).

### 1.4.1 Plus Mode Access

Plus mode (`/plus`) is a normal, freely accessible route identical in access model to Standard and Classic. There is no unlock mechanic, paywall, entitlement check, or third-party gate of any kind on this route. Any prior implication otherwise is void.

---

# 2. Typography

## 2.1 Font Family

```css
font-family: Rubik, Arial, system-ui, sans-serif;
```

Fonts are hosted locally. Google Fonts are expressly forbidden to ensure offline compatibility.

Loading priority: the variable font is the primary source; static weight-specific `.ttf` files are fallbacks only, loaded when variable font support or the variable file itself is unavailable. Do not load both simultaneously as competing `@font-face` declarations for the same weight — the variable font's `font-weight` range should cover 300–900 in one declaration, with static faces registered as a separate fallback stack gated behind a feature check (e.g. `CSS.supports('font-variation-settings', '"wght" 400')`) or `@supports` block.

## 2.2 Font Files

Primary variable font loading via `@font-face`:

```text
Rubik-VariableWeight.woff2
```

Static TrueType (`.ttf`) fallbacks for discrete `@font-face` definitions:

- `Rubik-Light.ttf`
- `Rubik-LightItalic.ttf`
- `Rubik-Regular.ttf`
- `Rubik-Italic.ttf`
- `Rubik-Medium.ttf`
- `Rubik-MediumItalic.ttf`
- `Rubik-SemiBold.ttf`
- `Rubik-SemiBoldItalic.ttf`
- `Rubik-Bold.ttf`
- `Rubik-BoldItalic.ttf`
- `Rubik-ExtraBold.ttf`
- `Rubik-ExtraBoldItalic.ttf`
- `Rubik-Black.ttf`
- `Rubik-BlackItalic.ttf`

Supported Weights:

- `300` Light
- `400` Regular
- `500` Medium
- `600` SemiBold
- `700` Bold
- `800` ExtraBold
- `900` Black

## 2.3 UI Text Sizes (Tailwind Map)

|Class|Exact Size|Exact Line Height|
|---|--:|--:|
|`text-[10px]`|10px|1|
|`text-xs`|12px|16px (1.2)|
|`text-sm`|14px|20px (1.25rem)|
|`text-base`|16px|24px (1.5rem)|
|`text-lg`|18px|28px (1.75rem)|
|`text-xl`|20px|24px (1.2)|
|`text-2xl`|24px|32px (2rem)|
|`text-3xl`|30px|36px (2.25rem)|
|`text-4xl`|36px|40px (2.5rem)|
|`text-5xl`|48px|1 (48px)|

---

# 3. Global Visuals & Theming

The application has **three** distinct visual themes. They are independent layers, not variants of one another:

1. **Standard/Classic Light Theme** — default, used on `/` and `/classic`.
2. **Plus Dark Theme** — used on `/plus` only.
3. **Midnight Theme** — a global, application-wide override toggled from `/about`, layered on top of whichever route is active. It has its own UI palette (this section) and its own board/tile palette (Section 6.3). It never mixes colors with the Plus Dark Theme.

## 3.1 Color Palette — Standard/Classic (Light) vs Plus (Dark)

|Element|Light Theme (Standard/Classic)|Dark Theme (Plus Route)|
|---|---|---|
|App Background|`#FAF8F0` / `bg-off-white`|`#33312B` / `bg-near-black`|
|Main/Base Text|`#756452` / `text-brown`|`#EAE7D9` / `text-sand`|
|Muted Text|`rgba(117,100,82,0.8)` / `text-brown/80`|`rgba(234,231,217,0.7)` / `text-sand/70`|
|Header Title|`#E46543` / `text-64-red`|`#E46543` / `text-64-red`|
|Score Box|`#EAE7D9` (`bg-sand`), text `#988876` (`text-tan`)|`#534F48` (`bg-dark-grey`), white text|
|Best Box|`border: 2px #EAE7D9`, text `#988876`|`border: 2px #534F48`, white text|
|Primary Button|`bg-gradient-to-b from-[#998C7E] to-[#988776]`, white|`bg-gradient-to-b from-[#756452] to-[#6B665B]`, white|
|Secondary Button|`border-2 border-tan text-brown bg-transparent`|`border-2 border-[#7B7465] text-sand bg-transparent`|
|Modal Overlay|`rgba(51,49,43,0.7)` / `bg-near-black/70`|`rgba(0,0,0,0.8)` / `bg-black/80`|
|Modal Window|`#EAE7D9` / `bg-sand`|`#534F48` / `bg-dark-grey`|
|Dropdown|`#E0DAD1` / `bg-beige`|`#534F48` / `bg-dark-grey`|
|Dialog Gradient|`#e0dad1 → #d8cec0` (bg-gradient-to-b)|`#403A31 → #312C26` (bg-gradient-to-b)|
|Powerup Bar|`#EAE7D9` / `bg-sand`|`#534F48` / `bg-dark-grey`|
|Powerup Active|`#988876` (`bg-tan`) + `shadow-button`|`#7B7465` (`bg-light-grey`) + `shadow-button`|
|Powerup Idle|`rgba(186,172,154,0.3)` / `bg-leather/30`|`rgba(123,116,101,0.4)` / `bg-light-grey/40`|
|Powerup Disabled|`#BAAC9A` / `bg-leather`|`#33312B` / `bg-near-black`|
|Tooltip / Cancel|dark grey (`#534F48`) + white text|near-black (`#33312B`) + white text|

This table governs **application chrome only** (header, score cards, modals, dropdown, powerup bar). It is fully independent from board/tile colors, which live exclusively in Section 6 (board frame/cell background) and Section 7 (tile colors). Do not derive board colors from this table or vice versa.

## 3.2 Theme Resolution Order

At render time, resolve theme in this order:

1. Is Midnight Theme active (global toggle from `/about`, persisted — see 3.3)? → Use Midnight UI palette (3.3) + Midnight board/tile palette (6.3), regardless of route.
2. Else, is the route `/plus`? → Use Plus Dark Theme (3.1 right column) + Plus board/tile colors (Section 6 Dark Theme + Section 7 dark-tile variant).
3. Else (`/`, `/classic`) → Use Light Theme (3.1 left column) + Light board/tile colors (Section 6 Light Theme + Section 7 light-tile variant).

## 3.3 Midnight Theme — UI Palette

A granite/near-black palette. No blue undertones anywhere in this theme — all neutrals are true/warm-neutral greys, never cool greys or navy-tinted blacks.

|Element|Midnight Theme|
|---|---|
|App Background|`#111111` / `bg-midnight-void`|
|Main/Base Text|`#E4E1D9` / `text-midnight-sand`|
|Muted Text|`rgba(228,225,217,0.65)` / `text-midnight-sand/65`|
|Header Title|`#E46543` / `text-64-red` (unchanged — brand red stays constant across all themes)|
|Score Box|`#20201F` (`bg-midnight-panel`), text `#9A9488` (`text-midnight-tan`)|
|Best Box|`border: 2px #20201F`, text `#9A9488`|
|Primary Button|`bg-gradient-to-b from-[#2B2A27] to-[#232220]`, white|
|Secondary Button|`border-2 border-[#3A3835] text-midnight-sand bg-transparent`|
|Modal Overlay|`rgba(0,0,0,0.85)` / `bg-black/85`|
|Modal Window|`#151515` / `bg-midnight-surface`|
|Dropdown|`#171717` / `bg-midnight-raised`|
|Dialog Gradient|`#1C1C1B → #131312` (bg-gradient-to-b)|
|Powerup Bar|`#151515` / `bg-midnight-surface`|
|Powerup Active|`#3A3835` (`bg-midnight-active`) + `shadow-button` (Midnight variant, 4.1)|
|Powerup Idle|`rgba(58,56,53,0.35)` / `bg-midnight-active/35`|
|Powerup Disabled|`#1A1A19` / `bg-midnight-disabled`|
|Tooltip / Cancel|`#0C0C0C` + white text|

Reference swatches you gave as anchors (used, not copied verbatim, to keep contrast ratios workable at text sizes): `#111111`, `#151515`, `#20201F`.

Persistence: the Midnight toggle state persists the same way theme-adjacent settings do — store as a boolean flag alongside existing `localStorage` keys (see Section 39), independent of `gameState`/`bestScore` so toggling it never touches game progress.

---

# 4. Shadows & Filters

## 4.1 `shadow-button`

Applied to primary action buttons and active powerups to ensure depth.

**Light Theme:**

```css
box-shadow: 0 5px 15px rgba(140,100,60,0.12),
            0 2px 3px rgba(140,100,60,0.09),
            inset 0 -1px 0 rgba(0,0,0,0.1);
```

**Plus Dark Theme** (Replaces `rgba(140,100,60,X)` with true black):

```css
box-shadow: 0 5px 15px rgba(0,0,0,0.12),
            0 2px 3px rgba(0,0,0,0.09),
            inset 0 -1px 0 rgba(0,0,0,0.1);
```

**Midnight Theme** (deeper, tighter falloff to read correctly against near-black backgrounds):

```css
box-shadow: 0 5px 15px rgba(0,0,0,0.35),
            0 2px 3px rgba(0,0,0,0.25),
            inset 0 -1px 0 rgba(255,255,255,0.04);
```

## 4.2 `shadow-dialog`

Used for inner dialog illustrations/details (`shadow-dialog-illustration-box`).

```css
box-shadow: inset 0 -2px 3px rgba(140,100,60,0.06),
            inset 0 -5px 15px rgba(140,100,60,0.09);
```

## 4.3 `shadow-xl`

Used for modal window containers and dropdowns.

```css
box-shadow: inset 0 -1px 0 rgba(0,0,0,0.1),
            0 4px 6px rgba(140,100,60,0.13),
            0 10px 30px rgba(140,100,60,0.18);
```

---

# 5. PixiJS Geometry & Board

## 5.1 Board

Logical board bounds ensure perfect mapping between grid physics and WebGL/WebGPU bounds.

- Logical board size: `576 × 576`
- Board SVG definition dimensions: `576 × 576`
- Outer perimeter radius (`rx`): `22px`

## 5.2 Tiles / Cells

- Logical rendered tile size: `112 × 112`
- Logical rendered tile corner radius: `rx = 12`
- Empty SVG cell inner background geometry: `108 × 108`
- Empty SVG cell inner corner radius: `rx = 10`
- Grid spacing configurations:
    - Logical physical grid gap: `8px`.
    - SVG visible spacing gap: `12px`.
    - Inner board padding/offset from edge: `16px`.

## 5.3 Board Coordinate System

Exact physical spring positioning matrix coordinates:

- Stride distance between adjacent tile centers: `_u = 120px`
- Tile dimension width/height: `Cu = 112px`
- Center offset calculation (`T`):
    
    ```text
    T = (112 * 4 + 8 * 3) / 2 = 236
    ```
    
- Formula for translating a `{ col: x, row: y }` index into PixiJS absolute `X/Y`:
    
    ```text
    x = 56 + (120 * col) - 236y = 56 + (120 * row) - 236
    ```
    

## 5.4 Stage

- Stage anchor alignment: `anchor.set(0.5, 0.5)`
- Stage positioning guarantees absolute centering inside the flexible DOM container:
    
    ```javascript
    stage.x = canvas.width / 2;stage.y = canvas.height / 2;
    ```
    
- Inverse scale application based on device DPI clamping:
    
    ```javascript
    stage.scale.set(1 / resolution)
    ```
    
- Canvas strictly fills `100%` of the available width/height of its flex parent (`width: 100%; height: 100%`).

## 5.5 Board Vertical Centering Across Modes

The board's vertical position in the DOM layout flow depends on which sibling UI elements are present:

- Standard (`/`) and Plus (`/plus`) render a Powerup Bar (Section 15) below the board.
- Classic (`/classic`) renders no Powerup Bar — that vertical space is absent.

The board must remain visually centered within whatever vertical space is actually occupied by the game area (Score Cards + Board + [Powerup Bar if present]) as a group, not centered against a fixed assumption that the Powerup Bar always exists. Consequently, switching between a Powerup-Bar mode (Standard/Plus) and Classic causes the board's resting Y position to shift.

This shift must be animated, not an instant layout snap — apply the same spring model already used for tile movement (Section 19.2: `stiffness: 100, damping: 10, mass: 1`, ~250ms-equivalent settle) to the board container's Y offset when the Powerup Bar mounts/unmounts. The board's X centering (Section 5.4) is unaffected by this and remains constant.

---

# 6. Board & Cell Textures

The board is dynamically generated via vector gradients embedded as Base64 SVGs to ensure pristine hardware scaling. There are three independent board palettes, matching the three themes in Section 3.

## 6.1 Light Theme (Standard / Classic)

- **Board Outer Gradient:** `#998C7E → #988776`
- **Cell Inner Background:** `#BAAC9A`

## 6.2 Plus Dark Theme

- **Board Outer Gradient:** `#54514A → #504C44`
- **Cell Inner Background:** `#6B665B`

## 6.3 Midnight Theme

A distinct, granite-toned board — darker and flatter than Plus, with no warm undertone push.

- **Board Outer Gradient:** `#232322 → #1A1A19`
- **Cell Inner Background:** `#2A2A28`

Gradients strictly run top-to-bottom (`180deg`) across all three themes. SVG equivalent parameter: `y1="0" y2="100%"`

---

# 7. Tile Colors, Gradients & Lighting

## 7.1 Palette Model

There are exactly **two** tile color sets: **Light-tile palette** and **Dark-tile palette**. A theme does not get its own bespoke tile colors — it selects one of these two sets:

|Theme|Board (Section 6)|Tile Palette Used|
|---|---|---|
|Standard / Classic|Light|Light-tile palette (7.2)|
|Plus|Dark|Dark-tile palette (7.3)|
|Midnight|Midnight (darkest)|Dark-tile palette (7.3)|

The Dark-tile palette is the _same_ hue progression as the Light-tile palette, each color shifted darker/more saturated (illustrative shift pattern: `#D98A5F → #C6613F`-style tightening) so tiles retain sufficient contrast against dark board backgrounds. It is not a separate design — do not invent new hues for it, derive it mechanically from 7.2 by darkening.

## 7.2 Light-Tile Palette

Progression logic: pale neutral → warm cream → peach → orange → red-orange → gold (existing, unchanged through 2048) → terracotta → rose-red → deep wine → near-black ember, from tile 2 up through 131,072. Effects stay minimal: a soft glow only, no patterns, no multi-color blending, no motion cues baked into the texture itself.

### Tile 2

```text
Color: #ECE4DB
```

### Tile 4

```text
Color: #E8D8BA
```

### Tile 8

```text
Gradient: #E9B582 → #E6AF79
```

### Tile 16

```text
Gradient: #E99A6D → #E79362
```

### Tile 32

```text
Gradient: #E8886E → #E57A5D
```

### Tile 64

```text
Gradient: #E67051 → #E26240
```

### Tile 128

```text
Gradient: #EBD47F → #EDCF64
```

### Tile 256

- **Base Gradient:** `#EBD47F → #EDCF64`
- **Glow SVG Filter Gradient:** `#FCDB69 → #EEC450`
- **Glow Opacity:** `16%`
- **Blur Definition:** SVG `stdDeviation = 2.25` (~4.5px Gaussian blur).

### Tile 512

- **Base Gradient:** `#EBD47F → #EDCF64`
- **Glow SVG Filter Gradient:** `#FCDB69 → #EEC450`
- **Glow Opacity:** `33%`
- **Blur Definition:** SVG `stdDeviation = 2.5` (~5px blur).

### Tile 1024

- **Base Gradient:** `#EBD47F → #EDCF64`
- **Glow SVG Filter Gradient:** `#FCDB69 → #EEC450`
- **Glow Opacity:** `50%`
- **Blur Definition:** SVG `stdDeviation = 2.75` (~5.5px blur).

### Tile 2048

- **Base Gradient:** `#EFDB94 → #ECD069`
- **Glow SVG Filter Gradient:** `#FCDB69 → #EEC450`
- **Glow Opacity:** `100%`
- **Blur Definition:** SVG `stdDeviation = 3.0` (~6px blur).

### Tile 4096

Transitional step out of gold into terracotta — the ramp begins warming toward orange-red.

- **Base Gradient:** `#E8B562 → #E29A4F`
- **Glow SVG Filter Gradient:** `#F0C468 → #E29A4F`
- **Glow Opacity:** `100%`
- **Blur Definition:** SVG `stdDeviation = 3.0` (~6px blur, holds steady from here up — glow intensity is carried by opacity/color shift, not increasing blur).

### Tile 8192

Terracotta.

- **Base Gradient:** `#E08750 → #D9713C`
- **Glow SVG Filter Gradient:** `#E89660 → #D9713C`
- **Glow Opacity:** `100%`
- **Blur Definition:** SVG `stdDeviation = 3.0`

### Tile 16384

Rose-red.

- **Base Gradient:** `#D9653F → #C94A32`
- **Glow SVG Filter Gradient:** `#DD7047 → #C94A32`
- **Glow Opacity:** `100%`
- **Blur Definition:** SVG `stdDeviation = 3.0`

### Tile 32768

Deep red.

- **Base Gradient:** `#C43F32 → #A82E28`
- **Glow SVG Filter Gradient:** `#CC4A3A → #A82E28`
- **Glow Opacity:** `100%`
- **Blur Definition:** SVG `stdDeviation = 3.0`

### Tile 65536

Wine / oxblood — deepening toward the end of the visible spectrum before going dark.

- **Base Gradient:** `#8F2A28 → #6E1F20`
- **Glow SVG Filter Gradient:** `#9C332F → #6E1F20`
- **Glow Opacity:** `100%`
- **Blur Definition:** SVG `stdDeviation = 3.0`

### Tile 131072

Near-black ember — the terminal tier. Dark base with a thin warm ember-red glow as the only remaining color cue, evoking cooling metal rather than a new hue.

- **Base Gradient:** `#2E1613 → #1C0E0C`
- **Glow SVG Filter Gradient:** `#7A2620 → #4A1613`
- **Glow Opacity:** `100%`
- **Blur Definition:** SVG `stdDeviation = 3.0`

### Overflow (beyond 131072, if ever reached)

- **Base Gradient:** `#403A31 → #312C26` (flat neutral — signals "off the designed scale" rather than continuing the ramp indefinitely)

## 7.3 Dark-Tile Palette (Plus & Midnight)

Mechanically derived from 7.2 by darkening/tightening each gradient — same stops, same glow mechanics, same progression logic, shifted for legibility against dark boards. Values below are the authoritative dark-tile numbers (do not re-derive at build time; these are final):

|Tile|Light Base (7.2)|Dark Base (use this)|
|---|---|---|
|2|`#ECE4DB`|`#3A3833`|
|4|`#E8D8BA`|`#4A4430`|
|8|`#E9B582 → #E6AF79`|`#C68A54 → #C08249`|
|16|`#E99A6D → #E79362`|`#C77347 → #C46C3D`|
|32|`#E8886E → #E57A5D`|`#C66450 → #C25640`|
|64|`#E67051 → #E26240`|`#C44E33 → #C0431F`|
|128|`#EBD47F → #EDCF64`|`#CBAF54 → #CDA93A`|
|256|`#EBD47F → #EDCF64`|`#CBAF54 → #CDA93A`|
|512|`#EBD47F → #EDCF64`|`#CBAF54 → #CDA93A`|
|1024|`#EBD47F → #EDCF64`|`#CBAF54 → #CDA93A`|
|2048|`#EFDB94 → #ECD069`|`#CFB964 → #CCAC3F`|
|4096|`#E8B562 → #E29A4F`|`#C6913C → #C0762F`|
|8192|`#E08750 → #D9713C`|`#BE6330 → #B7511C`|
|16384|`#D9653F → #C94A32`|`#B7411F → #A72612`|
|32768|`#C43F32 → #A82E28`|`#A21F12 → #862008`|
|65536|`#8F2A28 → #6E1F20`|`#6D160E → #4C0D08`|
|131072|`#2E1613 → #1C0E0C`|`#1A0A08 → #0E0605`|

Glow opacity and blur values carry over unchanged from 7.2 at each corresponding tier — only base/glow hex stops darken.

---

# 8. Tile Bevel Configuration

Every tile receives an inner bevel/highlight computed directly via SVG filter compounding.

SVG Matrix configuration uses an arithmetic composite for the top-left white highlight reflection:

```xml
<feComposite in2="hardAlpha" operator="arithmetic" k2="-1" k3="1" />
```

Opacity logic: Bevel opacity scales linearly across the progression array from `0.1` at Tile 2, scaling up to a hard cap of `0.4` at Tile 2048, and holds at `0.4` for all tiers above 2048 (does not continue scaling past the cap).

---

# 9. Tile Text Specifications

## Colors

- Values `≤ 4`: `#756452` (Dark Brown text)
- Values `8–2048`: `#FFFFFF` (White text)
- Values `> 2048` (Overflow): `#C4BDB7` (Muted silver/grey text)

## Sizing / Fitting

- `1–2` digit length: `48px`
- `3` digit length: `40px`
- `4+` digit length: `33px`

## Higher-Value Display Format

At `5+` digits (100,000 and above — not reachable in-bounds given the palette caps at 131,072, but the formatter must not crash if it is), fall back to abbreviated notation rather than shrinking font size further: `100k`, `131k`, etc. (round to nearest whole thousand, lowercase `k` suffix, no decimal). This keeps text legible at the `33px` floor rather than introducing a fifth size tier.

---

# 10. SVG Assets

The exact paths provided in the source must be perfectly retained. Do not approximate or use replacement libraries (like FontAwesome or Heroicons).

## Hamburger Menu

`24×24`. `fill="currentColor"`.

```xml
<path d="M3 16h18v1.5a1.5 1.5 0 0 1-1.5 1.5h-15A1.5 1.5 0 0 1 3 17.5zm0-2-.621-7.452a.75.75 0 0 1 1.163-.686l3.756 2.503a.75.75 0 0 0 1.006-.16L11.41 4.25a.75.75 0 0 1 1.18 0l3.106 3.954a.75.75 0 0 0 1.006.16l3.756-2.503a.75.75 0 0 1 1.163.686L21 14z"/>
```

## Close / X

`20×20`. `fill="currentColor"`.

```xml
<path d="M480-429 316-265q-11 11-25 10.5T266-266t-11-25.5 11-25.5l163-163-164-164q-11-11-10.5-25.5T266-695t25.5-11 25.5 11l163 164 164-164q11-11 25.5-11t25.5 11 11 25.5-11 25.5L531-480l164 164q11 11 11 25t-11 25-25.5 11-25.5-11z"/>
```

## Undo

`32×32`. `stroke-width="2.5" stroke-linecap="round"`.

```xml
<path d="M10 25h6.5a8.5 8.5 0 0 0 8.5-8.5v0A8.5 8.5 0 0 0 16.5 8H8m0 0 3.5-4M8 8l3.5 4"/>
```

## Swap Two Tiles

`32×32`. Combination of `stroke="currentColor"` and `fill="currentColor"`.

```xml
<path stroke-width="2" d="M18 9h.53a4 4 0 0 1 3.96 3.434L23 16m0 0 3.5-3.5M23 16l-4-2"/>
<path fill-rule="evenodd" clip-rule="evenodd" d="M16.006 25.23A4 4 0 0 0 20 29h5a4 4 0 0 0 4-4v-5a4 4 0 0 0-2.19-3.568l-1.689 1.69a3 3 0 0 1-3.463.561l-3.939-1.97A4 4 0 0 0 16 20v.764c.614.55 1 1.347 1 2.236 0 .885-.384 1.681-.994 2.23"/>
<path stroke-width="2" d="M14 23h-.53a4 4 0 0 1-3.96-3.434L9 16m0 0-3.5 3.5M9 16l4 2"/>
<path fill-rule="evenodd" clip-rule="evenodd" d="M3 7a4 4 0 0 1 4-4h5a4 4 0 0 1 3.993 3.77A3 3 0 0 0 15 9a3 3 0 0 0 1 2.236V12c0 1.361-.68 2.564-1.72 3.286l-3.938-1.97a3 3 0 0 0-3.463.563l-1.69 1.689A4 4 0 0 1 3 12z"/>
```

## Unassigned / Reserved Icon (formerly "Merge Any Two")

`32×32`. `fill="currentColor" fill-rule="evenodd" clip-rule="evenodd"`.

**Note:** the "Merge Any Two Adjacent Tiles" powerup this icon originally represented has been removed from the game entirely (see Section 34 — removed). The mechanic does not exist in any mode. This SVG path is retained in the asset library only because the artwork itself may be reused for an unrelated future feature; it carries no current in-game meaning and should not be wired to any powerup.

```xml
<path d="M27 15a4 4 0 0 1-4 4h-6a4 4 0 0 1-.46-.026l-.04-.005A4 4 0 0 1 13 15V9a4 4 0 0 1 4-4h6a4 4 0 0 1 4 4zm-16-2H9a4 4 0 0 0-4 4v6a4 4 0 0 0 4 4h6a4 4 0 0 0 4-4v-2h-2q-.252 0-.5-.02V23a1.5 1.5 0 0 1-1.5 1.5H9A1.5 1.5 0 0 1 7.5 23v-6A1.5 1.5 0 0 1 9 15.5h2.02A6 6 0 0 1 11 15zm10-4a1 1 0 1 0-2 0v2h-2a1 1 0 1 0 0 2h2v2a1 1 0 1 0 2 0v-2h2a1 1 0 1 0 0-2h-2z"/>
```

## Remove by Value

`32×32`. `stroke="currentColor"`.

```xml
<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M14 26.8c-4.564-.927-8-4.962-8-9.8 0-5.523 4.477-10 10-10h3m0 0-3-4m3 4-3 4"/>
<path stroke-dasharray="3 4" stroke-linecap="round" stroke-width="2.5" d="M25.037 12.716a9.95 9.95 0 0 1 .865 5.676c-.673 4.79-4.637 8.309-9.286 8.59"/>
```

## Teleport

`32×32`. `stroke` and `fill` mixed.

```xml
<path stroke-width="2" stroke-linecap="round" stroke-linejoin="round" d="m19 13-6 6m6-6 .5 5m-.5-5-5-.5"/>
<path fill-rule="evenodd" clip-rule="evenodd" d="M20 5.5h5A1.5 1.5 0 0 1 26.5 7v5a1.5 1.5 0 0 1-1.5 1.5h-2.935l.25 2.5H25a4 4 0 0 0 4-4V7a4 4 0 0 0-4-4h-5a4 4 0 0 0-4 4v2.685l2.5.25V7A1.5 1.5 0 0 1 20 5.5M11.757 16H6.6A3.6 3.6 0 0 0 3 19.6v5.8A3.6 3.6 0 0 0 6.6 29h5.8a3.6 3.6 0 0 0 3.6-3.6v-5.157l-.879.878a3 3 0 1 1-4.242-4.242z"/>
```

## Rotate Outer Ring

`32×32`. Transform parameters are absolute constraints.

```xml
<rect width="12" height="12" x="15" y="15" rx="4" transform="rotate(180 15 15)"/>
<rect width="9.5" height="9.5" x="13.75" y="27.75" stroke-linecap="round" stroke-width="2.5" rx="2.75" transform="rotate(180 13.75 27.75)"/>
<rect width="9.5" height="9.5" x="27.75" y="13.75" stroke-linecap="round" stroke-width="2.5" rx="2.75" transform="rotate(180 27.75 13.75)"/>
<rect width="12" height="12" x="29" y="29" rx="4" transform="rotate(180 29 29)"/>
```

## Bomb

`32×32`. `fill="currentColor"`.

```xml
<path d="M22.667 10.067q-.166 0-.334-.034A1 1 0 0 1 22 9.9l-1.167-.667a1.3 1.3 0 0 0-1.016-.116 1.3 1.3 0 0 0-.817.616l-.167.267 1.334.767q.7.399.916 1.2a1.9 1.9 0 0 1-.183 1.5l-.9 1.6q.767 1.2 1.15 2.55.384 1.35.383 2.783 0 4.167-2.916 7.083T11.533 30.4 4.45 27.45t-2.917-7.117 2.884-7.05 7.05-2.883h.433l.9-1.567a1.87 1.87 0 0 1 1.2-.95 1.92 1.92 0 0 1 1.533.217l1 .567.167-.267q.767-1.434 2.4-1.867t3.067.4l1.133.634q.3.166.5.483t.2.683q0 .567-.383.95a1.3 1.3 0 0 1-.95.384m4 .333q0-.567.383-.95a1.3 1.3 0 0 1 .95-.383h1.333q.567 0 .95.383.384.383.384.95 0 .566-.384.95a1.3 1.3 0 0 1-.95.383H28a1.3 1.3 0 0 1-.95-.383 1.3 1.3 0 0 1-.383-.95m-6-6a1.3 1.3 0 0 1-.95-.383 1.3 1.3 0 0 1-.384-.95V1.733q0-.566.384-.95a1.3 1.3 0 0 1 .95-.383q.567 0 .95.383.383.384.383.95v1.334q0 .566-.383.95a1.3 1.3 0 0 1-.95.383M24.9 6.167q-.366-.367-.367-.934 0-.567.367-.933l.967-.967q.366-.366.933-.366t.933.366q.367.367.367.934 0 .565-.367.933l-.966.967q-.367.366-.934.366-.565 0-.933-.366"/>
```

## Restart / New Game

`24×24`. `fill="#e8eaed"`.

```xml
<path d="M440-800v487L216-537l-56 57 320 320 320-320-56-57-224 224v-487z"/>
```

---

# 11. Responsive Layout Breakpoints

The application utilizes Tailwind responsive media queries:

```text
xs  = 360px
sm  = 640px
md  = 768px
lg  = 1100px
xl  = 1280px
2xl = 1536px
```

Special functional breakpoints:

```css
@media (max-height: 650px) { ... } /* `short` modifier */
@media (display-mode: standalone) { ... } /* `pwa` modifier */
```

---

# 12. App Container

Base structure housing the main game wrapper guarantees mobile-first touch safety and overflow clipping:

```html
<div class="flex flex-col min-h-[100svh] w-screen touch-none overflow-x-hidden">
  ...
</div>
```

Padding configurations:

- Default/Mobile: `px-4 pt-6 pb-3`
- Tablet/Desktop (`md:`): `px-8 pt-0 pb-8`
- Installed App mode (`pwa:`): `pb-10`
- Squat height devices (`short:`): `pt-[0.375rem]`

---

# 13. Header Layout

## 13.1 Header Grid System

The main game header utilizes a specific CSS grid constraint:

```css
.header-grid {
  grid-template-columns: [left] 1fr [center] min-content [right] 1fr;
  grid-template-rows: [first] min-content;
  gap: 6px 4px;
}
```

Container class: `px-2`

**Centering invariant (hard requirement):** the `left` and `right` grid columns must always remain equal-width (`1fr`/`1fr`) at every breakpoint and in every state. This guarantees the `center` column is always visually centered in the header regardless of how much or how little content the left/right columns hold. Do not give left and right different flex weights, fixed widths, or asymmetric padding to accommodate future content — if a column's content would overflow, wrap or truncate that content, but never break the `1fr`/`1fr` symmetry.

## 13.2 Left Column (Menu / Hamburger)

```css
.col-\[left\] { grid-column: left; }
.row-\[first\] { grid-row: first; }
```

Classes: `col-[left] row-[first] flex items-center gap-4` Hamburger SVG explicitly sizing: `size-7` (28px).

## 13.3 Center Column (Title & Mode Badge)

Classes: `col-[center] row-[first] flex items-center justify-center text-3xl sm:text-5xl font-bold text-64-red gap-2`

Optional Mode Badge logic: If in classic mode, render the "Classic" badge directly adjacent to "2048":

```html
<span class="bg-leather ml-1 rounded-md px-1 py-0.5 text-xs font-medium uppercase text-white">Classic</span>
```

## 13.4 Right Column (Actions / New Game)

Classes: `col-[right] row-[first] flex items-center justify-end gap-4`

Contains:

1. **Feedback Link (Desktop only):** `hidden xl:block text-sm text-nowrap hover:underline text-tan`. Links to `mailto:feedback@play2048.co`.
2. **New Game Button:** Square aspect ratio wrapping the Restart SVG. Keyboard shortcuts `N` and `R` trigger the "New Game" confirmation modal.

---

# 14. Score Cards

## 14.1 Score Grid Container

Grid for hosting the current score and best score side-by-side.

```css
grid-template-columns: repeat(2, 1fr);
gap: 0.5rem;
```

Container Classes: `px-2 max-w-96 mx-auto` At Tablet (`md:`), collapses into a vertical single-column layout:

```css
@media (min-width: 768px) { grid-template-columns: 1fr; }
```

## 14.2 Card Geometry

Classes: `flex min-w-0 grow basis-0 transform-gpu items-center justify-between gap-2 rounded-xl px-4 py-2 text-sm font-bold text-tan` At `sm:` breakpoints: `sm:h-[52px] sm:flex-col sm:justify-center sm:gap-0 sm:py-0 sm:text-xl`

**Score Card Theming:**

- Active Score: `bg-sand` (Light) / `bg-dark-grey` (Plus Dark) / `bg-midnight-panel` (Midnight)
- Best Score: `border-2 border-sand` (Light) / `border-2 border-dark-grey` (Plus Dark) / `border-2 border-midnight-panel` (Midnight)

## 14.3 Dynamic Score Value Width Check

To prevent layout jitter/shifting when the number scales from 3 digits to 5 digits, the component utilizes a responsive minimum width calculator (`rh(e[4])` in JS) strictly mapping character count to dynamic bounds.

---

# 15. Powerup Bar

## 15.1 Container & Slots

Capacity: Hard cap of exactly `6` active powerup slots. Standard mode only populates 3 of these slots (see Section 29); the remaining slots are simply not rendered rather than shown empty/disabled.

Classes: `relative flex max-w-[calc(100vw-20px)] gap-2 sm:gap-3 rounded-xl p-2 xs:p-3 transition-opacity` Background:

- Light Theme: `bg-sand`
- Plus Dark Theme: `bg-dark-grey`
- Midnight Theme: `bg-midnight-surface`

## 15.2 Buttons

Each slot is an interactive element. Classes: `aspect-square w-full max-w-12 shrink items-center justify-center rounded-md p-1` At `xs:` it shifts to `p-2 rounded-lg`.

**Powerup Inventory Badge (Uses remaining limit visual):**

```html
<span class="absolute right-0 bottom-0 min-w-4 translate-x-1/2 translate-y-1/2 rounded-full px-1 py-0.5 text-xs font-semibold bg-off-white text-tan">...</span>
```

## 15.3 Tooltip (Hover & Touch Focus)

Activates when the user hovers over a powerup button (or focuses via touch on mobile). Classes: `absolute -top-2 z-30 hidden w-max max-w-64 -translate-y-full flex-col rounded-xl px-4 py-3 text-xs opacity-0` Hover modifiers: `group-hover:-top-4 group-hover:flex group-hover:opacity-100`

Theme: `bg-dark-grey text-white` (Light/Plus). Midnight: `bg-midnight-void text-white`.

---

# 16. Menus

## Dropdown Menu (Header Hamburger)

Classes: `bg-beige absolute top-8 right-2 left-2 z-40 mt-2 flex-col rounded-xl shadow-xl will-change-[opacity,transform]` Midnight theme: `bg-midnight-raised` in place of `bg-beige`. At Tablet (`md:`), anchors to the left hamburger button strictly: `md:top-14 md:right-auto md:left-0 md:w-80`

**Contents Sequence:**

1. Standard Route (`/`)
2. Classic Route (`/classic`)
3. Tutorial Route (`/tutorial`)
4. Plus Route (`/plus`)
5. `border-t border-leather/50 mx-2` (Divider)
6. About
7. Troubleshooting

Animations run on opacity and Y-transform (see Section 20).

---

# 17. Dialogs & Modals

## 17.1 Modal Overlay

Overlay obscures the game and intercepts stray inputs.

- Light Theme: `bg-near-black/70 fixed inset-0 z-50`
- Plus Dark Theme: `bg-black/80`
- Midnight Theme: `bg-black/85`

## 17.2 Dialog Window

Classes: `bg-sand relative my-4 flex max-h-[85vh] w-[90vw] max-w-[450px] flex-col overflow-hidden rounded-3xl shadow-xl`

- Plus Dark Theme: `bg-dark-grey`
- Midnight Theme: `bg-midnight-surface`

## 17.3 Content Body

Classes: `p-6 md:p-8 text-center flex flex-col gap-6 overflow-y-auto`

## 17.4 Close Button

```html
<button class="absolute right-0 top-0 flex h-6 w-6 -translate-y-1/2 translate-x-1/2 items-center justify-center rounded-full bg-near-black text-white">
  <!-- Close SVG -->
</button>
```

Midnight theme: `bg-midnight-void` in place of `bg-near-black`.

---

# 18. Generic Pages (About, Privacy, Troubleshooting)

Static text pages skip PixiJS initialization entirely. Base Wrapper Classes: `mx-auto w-screen max-w-screen-md px-4 py-6 sm:px-8`

The `/about` page additionally hosts the Midnight Theme toggle control (Section 3.3), placed at the bottom of the page content.

_(Text contents strictly follow the provided `AsyncContent` blocks, including MediaVine advertisement privacy clauses and Chrome/Safari hardware acceleration troubleshooting steps)._

---

# 19. Animations & Physics

## 19.1 General Rule

Game tile movements (slides, merges, undo) are driven by a highly deterministic **spring solver logic**, _not_ standard CSS `transition: transform`.

## 19.2 Standard Spring (Slide / Move)

- Duration equivalent: `250ms`
- Target Bounce: `0.3`
- Physics mapping configuration used by the Popmotion/Spring engine in JS:
    - `stiffness: 100`
    - `damping: 10`
    - `mass: 1`

This is also the spring configuration reused for the Board Vertical Recentering transition described in Section 5.5.

## 19.3 Floating Animation (Rotate Arrow)

Used by the Rotation Arrows floating next to the board.

- Y transform: `0 → -5px`
- Duration: `2000ms` (Infinite mirror loop)
- Delay: `500ms`
- Physics parameters:
    - `stiffness: 200`
    - `damping: 7`
    - `mass: 0.3`
    - `velocity: 50`

## 19.4 Tile Slide Mechanics

- Tiles are linearly interpolated via spring to their target destination cell across `250ms`.
- All affected tiles must animate and evaluate simultaneously.
- Game input (Keyboard arrows, WASD, HJKL, Swipes) is completely locked and buffered during this `250ms` window.

## 19.5 Tile Spawn

- The spawn animation scale runs from `0 → 1`.
- Scale animation duration is `250ms`.
- **Negative Offset:** Spawning initiates precisely `-50ms` _before_ the previous slide/merge fully completes (`elapsed: -50` injected into spring controller).

## 19.6 Tile Merge

- Colliding tiles simultaneously arrive at the target cell.
- The two consumed (lower value) tiles are immediately destroyed/unspawned from memory.
- The new resulting tile spawns instantaneously at scale `0.8` (Hard clamped restriction, do not allow shrinking below `0.8`).
- The new tile immediately spring-bounces back to scale `1.0`.

## 19.7 Tile Undo Animation

The exact reverse sequence of the merge/slide.

- Consumed merged tile scales from `1 → 0`.
- The two original pre-merge tiles instantly pop into existence at their target cells.
- They seamlessly slide backwards over `250ms` to their original origin cells.

## 19.8 Tile Remove (Powerup)

Scale `1 → 0` over `250ms`.

---

# 20. UI Animations

## 20.1 Dropdown Menu Fade/Slide

- Opacity: `0 → 1`
- Y Transform: `-20px → 0`
- Duration: `150ms`
- Timing Function: `cubic-bezier(0.4, 0, 0.2, 1)`
- Matrix Equivalent mapping utilized in JS inline styles: `transform: translate3d(0, 20 * -(1 - opacity)px, 0)`

## 20.2 Dialog Overlay Fade

- Opacity: `0 → 1`
- Duration: `300ms`
- Easing: `linear`

## 20.3 Dialog Window Pop

- Scale: `0 → 1`
- TranslateY: `300px → 0`
- Duration: `350ms`
- Spring Bounce: `0.3`

## 20.4 UI Throb (Keyframes)

Infinite pulsing animation for score cards (after point accrual) and active/hovering powerup slots.

```css
@keyframes throb {
  0%, 100% { transform: scale(1); }
  50% { transform: scale(1.1); }
}
.animate-throb { animation: throb 1000ms infinite; }
```

---

# 21. Keyboard Input Configuration

Event listener is bound globally to `window` for `keydown` tracking.

**Valid Axes:**

- `ArrowUp`, `W`, `K` (Up)
- `ArrowDown`, `S`, `J` (Down)
- `ArrowLeft`, `A`, `H` (Left)
- `ArrowRight`, `D`, `L` (Right)

## 21.1 Ignore Rules

Movement keys are immediately aborted/ignored if any of the following modifiers are active:

- `e.ctrlKey`
- `e.metaKey` (Command/Windows key)
- `e.altKey`
- `e.shiftKey`

Movement is also ignored if the current `document.activeElement` is:

- An `<INPUT>`
- A `<TEXTAREA>`
- Any generic DOM element with the `contenteditable` attribute set to true.

**Note:** If the input is valid and passes all checks, `e.preventDefault()` and `e.stopImmediatePropagation()` are triggered instantaneously to lock screen scrolling behavior.

---

# 22. Touch / Swipe Input

Event listeners track `touchstart`, `touchmove`, and `touchend` attached to the `window`.

**Interaction Safety Rules:**

- Multi-touch triggers abort execution (If `touches.length > 1`, return early).
- Only the first touch pointer is tracked and calculated.

## 22.1 Threshold and Axis Lock

- Registration Threshold: Swipe must travel `> 10px` in either axis: `max(abs(deltaX), abs(deltaY)) > 10`.
- Axis Locking evaluates strictly whichever delta is larger:
    
    ```javascript
    if (Math.abs(deltaX) > Math.abs(deltaY)) {    // Process Horizontal} else {    // Process Vertical (Exact ties favor Y-axis)}
    ```
    
- If a valid swipe evaluates, `e.stopImmediatePropagation()` is invoked to prevent overscroll/pull-to-refresh anomalies.

---

# 23. Game State Logic

The application manages distinct discrete machine states.

```text
Fresh      -> Just initialized, 0 moves.
Playing    -> In progress.
Selecting  -> Waiting for user to complete a multi-step Powerup action.
GameOver   -> Board locked, no available actions.
GameWon    -> Achieved 2048 tile.
```

---

# 24. Board Initialization

A new Fresh board spawns containing exactly `2 tiles` positioned into distinct, non-overlapping random empty cells.

**PRNG Value Generation Math:**

- `90%` probability for a `2` tile.
- `10%` probability for a `4` tile.

**PRNG Sequence Consumption Order:** The sequence generated by the `alea` deterministic random number generator strictly consumes calls in this order during init:

1. Select Cell 1
2. Select Value 1
3. Select Cell 2
4. Select Value 2

Initial counters: `score = 0`, `moveCount = 0`.

---

# 25. Standard Game Algorithm

## 25.1 Move Traversal

Tiles must be evaluated row by row, or column by column, originating from the absolute furthest edge mapping to the requested direction to prevent overlap collision errors.

Explicit processing bounds:

- **Right:** process X from `3 → 0`
- **Left:** process X from `0 → 3`
- **Down:** process Y from `3 → 0`
- **Up:** process Y from `0 → 3`

## 25.2 Slide & Merge

- **Slide:** Each tile slides to the furthest contiguous empty cell available along the processed trajectory vector.
- **Merge Constraint:** A specific tile is legally permitted to merge at most _once_ per single turn.
- Identical adjacent orthogonal tiles merge. Example: row `[2, 2, 2, 2]` swiped right evaluates strictly to `[_, _, 4, 4]`.
- Expanded example: row `[_, 2, 2, 2]` swiped right evaluates strictly to `[_, _, 2, 4]`.

## 25.3 Natural Scoring

When Tile `A` and Tile `B` merge, the resulting entity pushes the natural calculation into the session score:

```text
Score += A + B
```

Powerup usage implicitly yields `0` points towards the session score, completely bypassing this function.

## 25.4 Natural Spawn Rules

If **any** single tile changes grid position or merges into a new entity during the evaluated slide phase:

- Spawn exactly `1` new tile.
- Spawn distribution maintains `90% → 2` and `10% → 4`.
- The cell is selected randomly from the pool of currently `null` empty cells.
- The `alea` PRNG strictly consumes `Select Cell` first, then `Select Value` second. Do not invert.

---

# 26. Win State (`GameWon`)

Creating a `2048` tile immediately triggers the `GameWon` state intercept.

- Board animations suspend.
- "You Win" modal overlay injects into the UI.
- Modal Buttons:
    - Secondary: `Start Over`
    - Primary: `Keep Going` (Allows returning to `Playing` state).
- After `Keep Going` evaluates, the `2048` trigger rule is permanently deactivated for that session. Future cascades reaching `4096`, `8192`, etc. are ignored.

---

# 27. Game Over State (`GameOver`)

The game over validation hook executes precisely upon the resolution of the slide/merge calculation map.

Conditions for trigger:

1. `0` empty cells exist on the grid.
2. AND `0` valid adjacent orthogonal matches remain available.

**Delay Sequence:** If conditions map to true, the application must await a rigid `500ms` window after the final tile spring animation settles before triggering the "Game Over" modal UI overlay.

---

# 28. Game Over Rescue Operations

If a `GameOver` evaluates, but the player currently holds specific rescue-capable powerups in their inventory stash, the session remains potentially playable.

Valid Rescue Powerups:

- **Undo**
- **Bomb** (Plus mode only — Standard mode does not grant Bomb; see Section 29)

If either is available `> 0` for the active mode, the "Game Over" modal modifies its core action button label to strictly read `Undo` (Even if `Bomb` is the only powerup logically remaining in the stash). Activating it drops the modal and lets the user apply the powerup.

---

# 29. Powerup System

## 29.1 Starting Inventory (Authoritative)

**Standard Mode** — strictly 3 powerups, in this order:

```text
Undo: 2
Swap: 1
Remove by Value: 0
```

No other powerups exist in Standard mode. Nothing accrues into a powerup slot Standard mode doesn't have (see 29.3).

**Plus Mode** — strictly 6 powerups, in this order:

```text
Undo: 2
Teleport a tile: 1
Swap two tiles: 1
Rotate the outer ring: 1
Delete tiles by number: 0
Bomb: 0
```

**Classic Mode** — no powerup inventory at all. The Powerup Bar does not render.

"Merge Any Two Adjacent Tiles" is not a powerup in any mode — see Section 34 (removed).

## 29.2 Hard Capacity Limit

Maximum stored uses per individual powerup: `2`. If an accrual threshold is reached while the inventory limit is already at `2`, the newly accrued charge drops into the void (ignored).

## 29.3 Accrual Mechanics

Powerup charges are generated _only_ as a direct byproduct of a tile created via a **natural merge** on the board. Normal spawning (or powerup-created tiles) do not execute the accrual loop.

Threshold Rules:

- Creating a `128` tile → Accrue `+1 Undo`
- Creating a `256` tile → Accrue `+1 Swap`, `+1 Teleport`, `+1 Rotate`
- Creating a `512` tile → Accrue `+1 Remove by Value`, `+1 Bomb`

Creating a `512` tile does not add to Undo, Swap, Teleport, or Rotate, and vice versa — each threshold strictly grants only its listed powerups.

**Mode-gated accrual:** a threshold only grants a charge for a powerup that exists in the active mode's inventory (per 29.1). In Standard mode, hitting the `256` threshold grants `+1 Swap` but has no effect on Teleport/Rotate (Standard doesn't carry those slots); hitting `512` grants `+1 Remove by Value` but has no effect on Bomb. This is not an error case — it's expected and silent, exactly like the capacity-limit overflow in 29.2.

## 29.4 Powerup Scoring Impact

Using any powerup executes a flat modification of `0 points` to the session score block.

---

# 30. Powerup Selection State & Cancellation

Triggering an active powerup from the inventory enters the discrete `Selecting` state. The game grid highlights interactive vectors, and the activated powerup's bottom UI slot icon transforms into a designated "Cancel" SVG.

## Cancel Button UI

Classes: `absolute right-1/2 bottom-0 flex h-6 w-6 translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full bg-dark-grey text-white` Midnight theme: `bg-midnight-void` in place of `bg-dark-grey`.

## Cancellation Triggers

Selection gracefully aborts if any of the following occur:

1. The user explicitly taps the transformed Cancel button on the powerup bar.
2. The user fires the `Escape` key.
3. The user executes a pointer click/tap registering outside the physical grid boundary.
4. The user forces a Route/URL change via the header menu.

## Cancellation Behavior

Immediate reversion to `previousGameplay` memory object:

- `changes` array flushed to `[]`.
- Turn count is untouched.
- Powerup inventory charge remains unconsumed.
- The application smoothly transitions back from `Selecting` to the prior `Playing` state.

---

# 31. Selection Visuals & Ring Logic

During target picking, a bespoke selection ring guides the user.

- **Asset Specification:** `162 × 162` exact White ring SVG.
- **Drop Shadow:** Applies `#D84F4D`, `30% opacity`, `10px blur`.
- **Mechanics:** The ring anchors to the DOM pointer utilizing physics spring delay.

## Hover / Interaction States

- **Valid Hover:** `scale: 1.07`, `alpha: 1.0`
- **Invalid Hover:** `scale: 0.975`, `alpha: 0.15` (Dimmed to represent illegal action).
- **Idle Valid (Not hovering but target is legal):** `scale: 0.975`, `alpha: 0.8`
- **Selected (Clicked):** `scale: 1.15`, `alpha: 1.0`. Fires a `moveToForeground()` command to ensure maximum z-index overlap bump.

---

# 32. Undo Powerup Specifics

Undo is an instantaneous revert to the `previousGameplay` snapshot captured strictly after the previous natural move fully completed.

## Copy Semantics

The application utilizes **immutable object cloning** (spreading) via a deep copy equivalent `JSON.parse(JSON.stringify(state))` or serialized proxy, guaranteeing restoring the board completely decouples references. It completely reverts:

- Board matrix topology.
- Session Score.
- Powerup Inventory.
- Gameplay tracking state.

If the reverted move had naturally triggered a threshold that accrued a powerup, reverting natively scrubs that accrued powerup from the inventory because the snapshot predated the accrual.

Consumption cost: `1 Undo use` per execution.

---

# 33. Swap Two Tiles Powerup

- Selection Type: `multipleTile` (Requires 2 inputs).
- Prompt sequence UI: `Choose the first tile` → `Choose the second tile`
- Validation logic: The user must select two _different_ physical tiles. Attempting to select the identical tile twice aborts as an invalid selection state.
- Execution: Swap absolute `X/Y` coordinate positions.
- Animation profile: Simultaneous `250ms` spring slide.

---

# 34. Merge Any Two Adjacent Tiles — REMOVED

This powerup does not exist in the game. It appeared in an earlier draft in error and has been fully removed:

- No mode grants it (see Section 29.1).
- Its SVG icon is retained in the asset library under a generic name (Section 10) but is not wired to any powerup.
- No prompt UI, selection type, execution formula, or accrual rule for it exists. Do not implement it.

---

# 35. Remove Tiles by Value

- Selection Type: `byValue`
- Prompt UI: `Choose a number`
- Execution: Extracts the numerical value of the tapped tile. All distinct tiles across the board sharing this value highlight simultaneously, undergo a scale `1 → 0` transition, and are erased.
- Viability: Runs logically whether `0`, `1`, or `multiple` matching targets exist on execution.
- Spawn Rule Override: Removing tiles via this powerup does _not_ trigger the end-of-turn natural spawn.

---

# 36. Teleport Tile

- Selection Type: `tileAndEmptyCell`
- Prompt sequence UI: `Choose a tile` → `Pick an empty spot on the board`
- Validation: Select an active tile, then select a distinct `null` coordinate cell. If the intended cell miraculously becomes occupied mid-selection sequence, validation fails.
- Execution: Tile coordinates update, visual slide executes.

---

# 37. Rotate Outer Ring

- Selection Type: `rotation`
- Prompt UI: `Choose a direction`

## UI Visuals

Two discrete SVG curved arrows float adjacent to the board.

- Asset dimension: `256 × 262`
- X Offset displacement: `±(board_width / 2) + 50px`
- Floating Animation: `y: 0 → -5px` looping over `2000ms`.
- Interaction: On pointer hover, scale springs to `1.1`.

## Rotation Core Logic

The board's outer physical perimeter strictly bounds exactly `12` perimeter tiles forming a continuous circular track. The central `2 × 2` inner quadrant grid remains totally static.

- Execution: Selecting Clockwise or Counter-Clockwise shifts the vector matrix of all `12` perimeter tiles by exactly `3` positions (Yielding a `90 degree` geometric rotation mapping).
- Animation uses standard slide interpolation.

---

# 38. Bomb

- Selection Type: `bomb`
- Prompt UI: `Place the bomb`

## Cross Field UI

Initiating the bomb overlays a `<g>` `crossField` component consisting of `16` discrete vector crosses centered mathematically atop grid intersections.

- On Hover Over Area:
    - Target `3 × 3` impact grid zone scales up to `1.0`.
    - The direct center epicenter cross alpha spikes to `1.0`.
    - The `8` perimeter impact crosses alpha drops to `0.2`.

## Execution Mechanics

1. Obliterate all tiles registered within the highlighted `3 × 3` target matrix.
2. Evaluate cleanup edge-clipping logic (bomb damage seamlessly bounds at grid edges and does not wrap).
3. Count surviving tiles mapping to `remainingTiles`.
4. Trigger special replenishment loop.
5. Calculate required spawns: `Math.max(2 - remainingTiles, 0)`
6. Execute spawns sequentially to hit requirement, pulling PRNG `90% 2` / `10% 4` in random valid `null` cells.

---

# 39. Persistence & Storage

The application utilizes synchronous Web Storage `localStorage`. Dedicated keys mapped:

- `gameState` (Base64 XOR obfuscated object)
- `bestScore` (Base64 XOR obfuscated integer string)
- `midnightTheme` (plain boolean flag — not XOR obfuscated, since it carries no gameplay-sensitive data; see Section 3.3)

---

# 40. State Serialization & Obfuscation Layer

Game state arrays are shielded from basic manual manipulation to protect leaderboards/progress.

**XOR Master Key:** `bWFkZSBieSAxbXBhY3Rpbjk===` (Base64 encoding of the author's name. Treat the literal Base64 string as the key itself in memory).

**Detailed Encoding Pipeline:**

1. Serialize internal state mapping to string: `JSON.stringify(state)`.
2. Instantiate `TextEncoder` to translate the JSON into a discrete `Uint8Array` byte map.
3. Process a loop executing a byte-level XOR against the payload using modulo mapping against the key array:
    
    ```javascript
    payload[i] ^= xorKey[i % xorKey.length]
    ```
    
4. Transpile the modified byte array directly into an ASCII string buffer.
5. Wrap the final result output string in `btoa()`.

This 5-step byte-array `TextEncoder` pipeline is the exact definitive requirement — do not simplify to a plain `JSON → XOR → btoa` shortcut that skips the explicit byte-array stage.

---

# 41. State Schema Shape

Valid representative state mapping requirement:

```json
{
  "state": "playing",
  "board": [
    [null, {
      "id": "x1",
      "value": 2,
      "position": {
        "x": 1,
        "y": 0
      }
    }, null, null]
  ],
  "id": "game_id_string",
  "moveCount": 12,
  "score": 148,
  "powerups": {
    "undo": {
      "usesRemaining": 2,
      "usesCount": 0
    }
  },
  "_rng": {
    "seed": "12345",
    "seedrandomState": {}
  },
  "highestReachedTile": 64
}
```

---

# 42. Persistence Validation & Recovery

When reading `localStorage`, validation triggers. If any of the following occur:

- Base64 or Byte decoding outright fails.
- Extracted string yields malformed non-parseable JSON.
- The schema structure mismatches required variables.
- Required state data is suspiciously corrupt. The application seamlessly intercepts, discards the tainted payload, and forces initialization of a brand new `Fresh` state board.

---

# 43. Application IDs

Tile UUIDs and Game UUIDs generate via base36 timestamp appending a random counter.

```javascript
// Reference logic mapping
`${Date.now().toString(36)}${Math.random().toString(36).substring(2)}`
```

Game IDs reset completely upon transitioning into a new `Fresh` initial reset.

---

# 44. Best Score Tracking

`bestScore` updates asynchronously globally against the `localStorage` key whenever `currentScore > bestScore`. The initial load maps the historical persisted best score to the right UI card.

---

# 45. RNG (Deterministic Generation)

The application avoids `Math.random()` for gameplay to ensure replay determinism and synchronous consistency across state snapshots. It implements the standard `alea` Pseudorandom Number Generator (PRNG).

- Seed persistence maps to `_rng.seed`.
- Raw engine state maps to `_rng.seedrandomState` (Object/array payload compatible with standard alea libraries).

## Initial Seed Logic

Upon booting the app for the very first time (or starting a brand new game without a seed), a fallback `Math.random().toString()` is generated purely to formulate the initial deterministic PRNG seed. This generated seed is then captured, passed to `alea`, and rigidly persisted across the entire game lifecycle.

---

# 46. Routing & Modes

## Standard Mode (`/`)

- Powerups Available: `Undo`, `Swap`, `Remove by Value` — exactly these three, per Section 29.1. No others.
- Renders strictly with the Light Theme (Section 3.1/6.1/7.2), unless Midnight Theme is globally toggled on (Section 3.3).

## Classic Mode (`/classic`)

- Strips the powerup logic completely. Empty inventory, no accrual, no Powerup Bar rendered.
- Header maps a `Classic` UI badge directly next to the `2048` logo.
- Renders strictly with the Light Theme, unless Midnight Theme is globally toggled on.
- Board vertical position accounts for the absent Powerup Bar (Section 5.5).

## Plus Mode (`/plus`)

- Freely accessible route, same access model as Standard/Classic — no unlock, no gate (Section 1.4.1).
- Powerups Available: `Undo`, `Teleport`, `Swap`, `Rotate`, `Remove by Value`, `Bomb` — exactly these six, per Section 29.1.
- Renders strictly with the Plus Dark Theme (Section 3.1/6.2/7.3), unless Midnight Theme is globally toggled on, in which case Midnight (Section 3.3/6.3/7.3) takes over instead.

## Tutorial (`/tutorial`)

- Implements the scripted tutorial sequence modal dialogs.
- Bypasses PRNG mapping to lock deterministic tile behavior for instructional logic.

---

# 47. Tutorial Sequence Script

The tutorial route forces the user through 7 specific scripted validation steps.

### Step 1 — MoveTiles

Mobile: > Swipe in any direction to move the tiles. Desktop: > Use the arrow keys to move the tiles. _Arrow key representation: `←` `↑` `↓` `→` rendered in specific `Dp` spans._

### Step 2 — MergeInto4

> Make a match The tiles all moved in the same direction and a new one appeared. Try moving the 2 and 2 towards each other.

### Step 3 — MergeInto8

> Boom! Tiles with the same number join when they touch. Keep going. Can you merge two 4 tiles into an 8?

### Step 4 — MergeInto16

> 4 + 4 = 8 You're getting the hang of it! Let's increase the difficulty. Merge two 8 tiles into a 16 tile.

### Step 5 — UseUndo

> Need a do-over? If you make mistakes, you can use undo. Try it out! _(Game engine strictly enforces the user to click the Undo UI button)_

### Step 6 — OtherPowerups

> Powerups! Undo isn't the only powerup you can use. Try 'Swap Two Tiles'!

### Step 7 — Done

Modal Title: > You're Ready Primary Button: > Start Playing

---

# 48. Dialog Copy (Game Over)

**Title:** `Game Over` **Body String:** `{score} points scored in {moveCount} moves.` **Powerup Summary Line:** `{powerupsUsed} powerups used:` (Or: `No powerups used!`) **Button Action:** `Try Again`

---

# 49. Dialog Copy (Game Won)

**Title:** `You Win` **Body String:** `{score} points scored in {moveCount} moves.` **Secondary Button:** `Start Over` **Primary Button:** `Keep Going`

---

# 50. Dialog Copy (New Game Confirmation)

**Title:** `New Game` **Body String:** `Are you sure you want to start a new game? All progress will be lost.` **Secondary Button:** `Cancel` **Primary Button:** `Start New Game` (Must use `text-64-red` coloring class for destructive indication).

---

# 51. Powerup UI Prompts (Tooltip/Selection State)

- **Swap:** `Choose the first tile` → `Choose the second tile`
- **Remove:** `Choose a number`
- **Bomb:** `Place the bomb`
- **Teleport:** `Choose a tile` → `Pick an empty spot on the board`
- **Rotate:** `Choose a direction`

---

# 52. Powerup State Semantics

Core gameplay loops must respect the specific non-turn nature of powerups.

- Utilizing a powerup absolutely yields `0` points.
- Utilizing a powerup absolutely does **not** trigger the end-of-turn natural `1` tile spawn unless that powerup specifically executes logic stating otherwise (i.e. Bomb replenishment logic).
- `Remove by Value` does **not** trigger a natural spawn.
- Normal tile movement executing a slide or merge triggers exactly one normal spawn.
- Accrual (earning a powerup) maps only from natural merges, and only into slots the active mode's inventory actually has (Section 29.3).
- Undo perfectly reverses prior layout memory state, erasing accruals gained on the reverted turn.

---

# 53. Selection Invalid States

The architecture operates on a strict validation-first principle, preventing invalid inputs instead of attempting to execute and repair them.

- Swap selecting the identical tile twice → Invalid/Abort.
- Teleport attempting to dump into an already occupied cell matrix → Invalid/Abort.
- Esc / Out-of-bounds click / Route change → Complete cancellation, no consumption of the powerup charge, and no progression of turn state.

---

# 54. Rendering / UI Separation Rule

Under absolutely no circumstances should HTML/DOM elements be mapped into PixiJS WebGL space without an explicit and overriding performance dictate.

- The `576x576` Game Board (Gradients, Cells, Blocks, Physics, Spring updates, Text, Glowing/Filters) = **PixiJS strictly**.
- The Application Wrapper (Header, Dropdown Menus, Sidebars, Route Pages, Modals, Powerup Bar, Score Tracking, Text overlays) = **DOM/TailwindCSS strictly**.

---

# 55. Accessibility / Interaction Safety Rules

Input listeners require rigorous fail-safes.

- Keyboard listeners (`window.addEventListener("keydown")`) must silently abort and drop event execution if `document.activeElement` maps to an `<input>`, `<textarea>`, or `[contenteditable="true"]`.
- The presence of `Ctrl`, `Meta`, `Alt`, or `Shift` natively drops all game movement processing.
- Touch gesture thresholds map to `> 10px` delta minimum.
- Valid touch swipes must call `e.stopImmediatePropagation()` to abort standard iOS/Android page scroll logic from hijacking the window.

There is no third-party unlock, gate, paywall, or entitlement system anywhere in the application (telemetry/ads/analytics integrations are unaffected by this — this rule concerns feature/route access only). Plus mode is free and equally accessible as Standard and Classic. Do not implement or imply otherwise.

---

# 56. Checklist

Manual checks for the user — ignore this section if you are working on the project itself:

### Rendering

- [ ] PixiJS version is exactly `8.11.0`.
- [ ] Renderer preference evaluates correctly (WebGPU > WebGL2 > WebGL1).
- [ ] OffscreenCanvas/WebWorker executes cleanly on compatible browsers.
- [ ] DPR scale caps (`2.0` mobile, `3.0` desktop) accurately applied.
- [ ] Stage scale matches `1 / resolution`.
- [ ] Board dimension matches `576×576`.
- [ ] Tile layout, corner radius, gaps, and stride calculate mathematically perfectly.
- [ ] Gradients (Top to Bottom), glowing filters, and opacities mirror spec across all three themes.
- [ ] Inner Bevel applies exact SVG arithmetic composite logic, capped at `0.4` above tile 2048.
- [ ] MSDF text maps correctly.
- [ ] Tile colors 4096–131072 render with correct progression and dark-tile derivation (Section 7).
- [ ] Board vertical recenter animates (spring) when switching between Powerup-Bar modes and Classic (Section 5.5).

### UI

- [ ] Font variables (`Rubik-VariableWeight.woff2` and `.ttf` fallbacks) mapped locally, variable-first with feature-gated static fallback.
- [ ] Typography size/line-height classes perfectly correlate to Tailwind mapping.
- [ ] Score card dynamically scales value width to prevent layout jumping.
- [ ] Powerup Bar renders only the slots relevant to the active mode (3 for Standard, 6 for Plus, 0/hidden for Classic).
- [ ] Modals and Dropdown animations mirror spring and bezier curve directives.
- [ ] SVG Icon paths are retained exactly.
- [ ] Header left/right columns remain `1fr`/`1fr` at all breakpoints (Section 13.1 invariant).
- [ ] Midnight Theme toggle (from `/about`) correctly re-skins UI (3.3), board (6.3), and tiles (7.3) app-wide, independent of route.

### Interaction

- [ ] Arrow Keys, `WASD`, and `HJKL` bindings capture correctly.
- [ ] Modifier bypass (Input focus bypass) functions safely.
- [ ] Touch gestures measure the > 10px delta, resolving exact ties favorably to the Y-axis.

### Game

- [ ] Two initial tiles generated mapped to distinct null spaces.
- [ ] Correct evaluation traversal (Edges inward).
- [ ] Strict enforcement of "merge only once per block per turn" logic.
- [ ] Exactly 1 natural PRNG spawn after a successful shift.
- [ ] Game Over enforces a distinct `500ms` UI delay block.
- [ ] Game Over properly identifies rescue powerups (Undo/Bomb) if available for the active mode.

### Powerups

- [ ] Accurate starting inventory distributions per mode (Standard: 3 powerups; Plus: 6 powerups — Section 29.1).
- [ ] Hard maximum capacity limit of `2` per variant.
- [ ] Appropriate generation logic upon hitting `128`, `256`, and `512` merges, gated to only the powerups the active mode actually has.
- [ ] Score zeroing during usage.
- [ ] Cancellation interactions cleanly rollback without consequence.
- [ ] "Merge Any Two" is fully absent from gameplay, UI prompts, and accrual logic (Section 34).
- [ ] No unlock/gate exists for Plus mode anywhere in the app (Section 1.4.1 / 55).

### Persistence

- [ ] Storage utilizes `gameState`, `bestScore`, and `midnightTheme`.
- [ ] Serialization follows the explicit 5-step pipeline: JSON stringify → TextEncoder array → Master Key Modulo XOR → ASCII buffer → btoa Base64.
- [ ] Corrupt payload mapping correctly drops into a fresh game state wipe.
- [ ] Deterministic `alea` RNG correctly saves and restores inner mapping state across reloads.
- [ ] IDs generate using `Date.now().toString(36)` and `Math.random` fallback.

### Routing

- [ ] Standard (`/`), Classic (`/classic`), Plus (`/plus`), Tutorial (`/tutorial`) handle isolated state properly.
- [ ] Static pages (`/about`, `/privacy-policy`, `/troubleshooting`) bypass rendering engine accurately.
- [ ] Theme resolves correctly per the order in Section 3.2 (Midnight overrides route-based theme when toggled on).

**End of File.**