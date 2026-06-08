# 04. UI/UX Documentation

## A. Design Philosophy: High-Fidelity Glassmorphism
EvaraOne features a premium, state-of-the-art **Glassmorphic theme** designed to look modern and fluid.

### Core Visual Principles
* **Depth & Translucency**: Cards use a custom semi-transparent white background with high-density blur and saturation filters. This creates a realistic "frosted glass" look that keeps background image patterns visible but blur-softened.
* **Ambient Glow**: Dynamic radial background blobs animate behind the frosted cards, establishing visual depth and a premium ambient light feel.
* **Unified Theme Integration**: Light and Dark mode options dynamically swap background assets and contrast levels, maintaining visual clarity in all lighting conditions.

---

## B. Typography & Text Hierarchy
EvaraOne utilizes a curated typography system built on premium, highly readable modern sans-serif fonts:
* **Primary Brand Font**: **`Aptos`** (A modern, clean humanist sans-serif).
* **Fallback System Fonts**: `Inter`, `Segoe UI`, `Helvetica Neue`, Arial.

### Heading & Body System
* **Main Titles (H1)**: Bold, 34px, dynamic tracking, colored in Royal Navy (`#1e3a8a`) or Bright Sky White.
* **Section Headings (H2)**: Semi-bold, 22px - 24px, balanced margins.
* **Card Subheadings**: Light, 14px, muted slate (`--text-muted`).
* **Telemetry Indicators**: Numeric values use a bold mono-spaced font style (Aptos Mono/Segoe UI Mono) to prevent line layout shifts during live data updates.

---

## C. The Golden Ratio Spacing System (Fibonacci Scaling)
To achieve natural proportioning across all components, margins, paddings, and card heights, EvaraOne rejects arbitrary sizing in favor of a strict **Golden Ratio Spacing System** based on the Fibonacci sequence:
* **`--space-xs` (4px / 0.25rem)**: Micro-padding between status dots and badges.
* **`--space-sm` (8px / 0.5rem)**: Padding between text items inside metadata feeds.
* **`--ratio-13` (13px)**: Margin between form fields and descriptions.
* **`--space-md` (16px / 1rem)**: Core padding for small cards, buttons, and navigation elements.
* **`--ratio-21` (21px)**: Primary padding inside all glass panels.
* **`--space-lg` (26px / 1.618rem)**: Grid gap between telemetry widgets.
* **`--ratio-34` (34px)**: Gap between main page sections and graph cards.
* **`--space-xl` (42px / 2.618rem)**: Padding inside major layouts and forms.
* **`--ratio-55` (55px)**: Margin below header bars and dynamic titles.
* **`--space-xxl` (68px / 4.236rem)**: Splash screen centering margins.

---

## D. Color Palette System
The color system relies on highly calibrated HSL and HEX tokens to ensure perfect harmony:

### 1. Brand Accents
* **Royal Evara Blue**: `#0077be` (Light: `#4dabf5`, Dark: `#004ba0`)
* **Natural Evara Green**: `#2ecc71` (Light: `#58d68d`, Dark: `#27ae60`)
* **Premium Accents**:
  * Indigo Accent: `#6366f1`
  * Rose Accent: `#f43f5e`
  * Amber Accent: `#f59e0b`

### 2. Light Theme System
* **Primary Background**: `#f8fafc` (Slate 50)
* **Secondary Background**: `#f1f5f9` (Slate 100)
* **Glass Card BG**: `rgba(255, 255, 255, 0.22)`
* **Glass Card Border**: `rgba(255, 255, 255, 0.4)`
* **Glass Card Blur**: `blur(25px) saturate(210%)`
* **Text Main**: `#1f2937`
* **Text Secondary**: `#374151`
* **Text Muted**: `#64748b`

### 3. Dark Theme System
* **Primary Background**: Transparent (Exposing Dark background image assets)
* **Secondary Background**: `#162032`
* **Glass Card BG**: `rgba(255, 255, 255, 0.06)`
* **Glass Card Border**: `rgba(255, 255, 255, 0.12)`
* **Glass Card Blur**: `blur(12px)`
* **Text Main**: `#e8f4ff`
* **Text Secondary**: `#c9dff2`
* **Text Muted**: `#cbd5e1`

---

## E. High-Fidelity UI Components & Styling

### 1. The Glassmorphism Navigation Bar (`navbar-glass`)
* Anchored at the top with a pill shape (`border-radius: 999px`).
* Translucent background (`rgba(240, 247, 255, 0.3)`) that blends with the page background.
* Active navigation buttons are styled with blue gradient backdrops (`linear-gradient(135deg, #2563eb, #1e40af)`), giving them a raised, glowing effect.

### 2. Interactive Google Maps Theme (Dark Mode Leaflet)
To maintain visual consistency in dark mode, Leaflet's tile container runs a custom CSS high-contrast filter overlay:
```css
html.dark .leaflet-tile-pane {
  filter: saturate(3) brightness(0.85) contrast(1.2) hue-rotate(10deg);
}
html.dark .leaflet-map-pane {
  background-color: #0d1117;
}
```
This converts standard bright geographical maps into high-contrast dark radar charts, keeping active status indicators readable.

### 3. CSS Micro-Animations
EvaraOne implements custom, hardware-accelerated CSS animations configured inside Tailwind CSS:
* **`animate-fade-in`**: Smooth opacity reveal with a minor blur transition (`0.6s cubic-bezier`).
* **`animate-slide-up`**: Smooth slide translation (`translateY(30px) -> 0`) to make loaded page sections feel alive.
* **`animate-float`**: Soft vertical oscillation (`float 6s ease-in-out infinite`) applied to 3D tank models.
