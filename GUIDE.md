# `@kr-pro-labs/ui2vibe-mcp` — Engineering & Operation Guide

## 1. Overview
`ui2vibe-mcp` is a Model Context Protocol (MCP) server built by **KR-PRO-Labs** (`@sjdhfjdj30-hash`) that extracts perceptual **Design Tokens (OKLCH/Hex palettes, typography scales, 8pt spacing rhythms, multi-layer elevations, glassmorphism)**, **Semantic Responsive Layout Skeletons (Flex/Grid DOM de-souping)**, and **Motion Physics Equations (`cubic-bezier` to spring `stiffness`/`damping`/`mass` solver & `@keyframes`)** from any UI reference (HTML/CSS/Tailwind/JSX/Vue snippets or computed style snapshots), then synthesizes a zero-dependency, accessible UI component for the target framework (`react-tailwind`, `react-css-vars`, `vanilla-css`, `vue-tailwind`, or `svelte-css`).

## 2. Quick Commands
```bash
# Install dependencies
npm install

# Run strict TypeScript type-checking
npm run typecheck

# Run full Vitest suite
npm test

# Build ESM output to ./dist
npm run build

# Start MCP stdio server
npm start
```

## 3. MCP Client Registration
Add the following entry to your MCP client configuration (`claude_desktop_config.json`, Cursor MCP settings, or Antigravity MCP config):

```json
{
  "mcpServers": {
    "ui2vibe": {
      "command": "node",
      "args": ["C:/github_sjdhfjdj30/ui2vibe-mcp/dist/index.js"]
    }
  }
}
```

## 4. Core Pipeline Modules
1. **`src/types/ui-domain.ts`** — Domain interfaces (`UiReferenceSnapshot`, `ColorToken`, `DesignTokenSet`, `LayoutSkeleton`, `MotionSpec`, `SynthesizedComponent`, `UiFidelityReport`).
2. **`src/capture/ui-reference-capturer.ts`** — `captureUiReference()` normalizes HTML/JSX/Vue markup, inline styles, CSS rulesets, Tailwind classes, and pseudo-states (`:hover`, `:focus-visible`, `:active`, dark mode).
3. **`src/tokens/design-token-extractor.ts`** — `extractDesignTokens()` converts sRGB/HSL/Hex colors into perceptual OKLCH space, computes WCAG relative luminance, synthesizes Dark/Light mode token pairs, and quantizes 8pt grid spacing and typography ratios.
4. **`src/layout/layout-skeleton-decomposer.ts`** — `decomposeLayoutSkeleton()` prunes redundant wrapper `div` chains ("div-soup") into semantic HTML5 landmarks (`header`, `nav`, `main`, `section`, `article`, `aside`, `footer`) and solves Flex/Grid axes and responsive breakpoints.
5. **`src/motion/motion-physics-extractor.ts`** — `extractMotionPhysics()` extracts CSS transitions, `@keyframes`, and Tailwind animation utilities, solving second-order harmonic oscillator spring parameters (`stiffness`, `damping`, `mass`, `settlingTimeMs`) from `cubic-bezier(x1, y1, x2, y2)` curves.
6. **`src/synthesizer/vibe-component-synthesizer.ts`** — `synthesizeVibeComponent()` generates framework-native, zero-dependency components plus CSS Custom Property `:root`/`.dark` theme blocks and Tailwind theme extensions.
7. **`src/audit/ui-fidelity-auditor.ts`** — `auditUiFidelity()` computes WCAG 2.1 contrast ratios ($CR = (L_1 + 0.05)/(L_2 + 0.05)$), checks touch target sizes ($\ge 44\times 44\text{px}$), verifies `@media (prefers-reduced-motion: reduce)` fallbacks, and checks CLS layout stability.
