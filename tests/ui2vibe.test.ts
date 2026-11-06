import { describe, expect, it } from 'vitest';
import {
  auditUiFidelity,
  captureUiReference,
  computeContrastRatio,
  computeRelativeLuminance,
  createUi2VibeServer,
  decomposeLayoutSkeleton,
  detectHostUiFramework,
  executeUi2VibeTool,
  extractDesignTokens,
  extractMotionPhysics,
  hexToOklch,
  oklchToHex,
  quantizeTo8ptGrid,
  readUi2VibeResource,
  solveSpringFromCubicBezier,
  synthesizeVibeComponent
} from '../src/index.js';

const SAMPLE_REFERENCE_MARKUP = `
<div class="outer-wrapper">
  <div class="inner-wrapper">
    <div class="card flex flex-col gap-4 p-6 bg-slate-900 text-white rounded-2xl shadow-xl backdrop-blur-md md:flex-row lg:px-8">
      <div class="nav-header">
        <h2 style="font-size: 24px; font-weight: 700;">Vibe Analytics Pro</h2>
      </div>
      <p style="color: #cbd5e1; font-size: 16px;">Real-time perceptual token and physics telemetry.</p>
      <button class="cta-btn bg-indigo-600 text-white px-6 py-3 rounded-xl hover:scale-105 focus-visible:outline-2 active:scale-95 transition-all duration-300 ease-out min-w-[48px] min-h-[48px]">
        Launch Inspector
      </button>
    </div>
  </div>
</div>
`;

const SAMPLE_REFERENCE_CSS = `
.card {
  background-color: #0f172a;
  color: #f8fafc;
  border-color: rgba(148, 163, 184, 0.25);
  backdrop-filter: blur(12px);
  transition: transform 280ms cubic-bezier(0.34, 1.56, 0.64, 1);
}
.card:hover {
  transform: translateY(-4px) scale(1.02);
}
.cta-btn:focus-visible {
  outline-color: #6366f1;
}
@media (prefers-color-scheme: dark) {
  .card {
    background-color: #020617;
  }
}
@keyframes pulseGlow {
  0% { opacity: 0.7; transform: scale(0.98); }
  100% { opacity: 1; transform: scale(1); }
}
`;

describe('@kr-pro-labs/ui2vibe-mcp Core Pipeline & Edge Cases', () => {
  it('1. captures HTML/JSX/Vue reference markup, Tailwind utilities, and pseudo-states', () => {
    const snapshot = captureUiReference({
      markup: SAMPLE_REFERENCE_MARKUP,
      css: SAMPLE_REFERENCE_CSS,
      componentName: 'VibeAnalyticsCard'
    });

    expect(snapshot.componentName).toBe('VibeAnalyticsCard');
    expect(snapshot.flatNodes.length).toBeGreaterThanOrEqual(6);
    expect(snapshot.tailwindClassesDetected).toContain('bg-slate-900');
    expect(snapshot.tailwindClassesDetected).toContain('backdrop-blur-md');

    const states = snapshot.pseudoStateHooks.map((h) => h.state);
    expect(states).toContain('hover');
    expect(states).toContain('focus-visible');
    expect(states).toContain('active');
    expect(states).toContain('dark');
    expect(snapshot.keyframesRaw['pulseGlow']).toBeDefined();
  });

  it('2. converts Hex/RGB/HSL to perceptual OKLCH, synthesizes dark counterparts, and quantizes 8pt grid', () => {
    const whiteOklch = hexToOklch('#ffffff');
    expect(whiteOklch.l).toBeCloseTo(1, 2);
    expect(whiteOklch.c).toBeCloseTo(0, 2);

    const indigoHex = '#4f46e5';
    const indigoOklch = hexToOklch(indigoHex);
    const roundTripHex = oklchToHex(indigoOklch);
    expect(roundTripHex).toBe(indigoHex);

    const hslOklch = hexToOklch('hsl(220, 80%, 50%)');
    expect(hslOklch.l).toBeGreaterThan(0.4);
    expect(hslOklch.c).toBeGreaterThan(0.1);

    expect(computeRelativeLuminance('#ffffff')).toBeCloseTo(1, 3);
    expect(computeRelativeLuminance('#000000')).toBeCloseTo(0, 3);
    expect(computeContrastRatio('#ffffff', '#000000')).toBeCloseTo(21, 1);

    expect(quantizeTo8ptGrid(0).quantized8ptPx).toBe(0);
    expect(quantizeTo8ptGrid(5).quantized8ptPx).toBe(4);
    expect(quantizeTo8ptGrid(15).quantized8ptPx).toBe(16);
    expect(quantizeTo8ptGrid(23).quantized8ptPx).toBe(24);

    const snapshot = captureUiReference({
      markup: SAMPLE_REFERENCE_MARKUP,
      css: SAMPLE_REFERENCE_CSS
    });
    const tokens = extractDesignTokens(snapshot);

    expect(tokens.colors.length).toBeGreaterThanOrEqual(3);
    expect(tokens.spacing.some((s) => s.quantized8ptPx === 16 || s.quantized8ptPx === 24)).toBe(true);
    expect(tokens.elevations.some((e) => e.isGlassmorphism)).toBe(true);
    expect(tokens.cssVariablesBlock).toContain(':root {');
    expect(tokens.cssVariablesBlock).toContain('.dark, [data-theme="dark"] {');
  });

  it('3. collapses redundant div wrappers (div-soup pruning) into semantic Flex/Grid skeletons', () => {
    const snapshot = captureUiReference({
      markup: SAMPLE_REFERENCE_MARKUP,
      css: SAMPLE_REFERENCE_CSS
    });
    const skeleton = decomposeLayoutSkeleton(snapshot);

    expect(skeleton.prunedWrapperCount).toBeGreaterThanOrEqual(2);
    expect(skeleton.totalPrunedNodes).toBeLessThan(skeleton.totalOriginalNodes);
    expect(skeleton.root.semanticTag).toBe('article');
    expect(skeleton.root.layoutMode).toBe('flex');
    expect(skeleton.semanticLandmarksUsed).toContain('header');
    expect(skeleton.semanticLandmarksUsed).toContain('button');
    expect(skeleton.responsiveBreakpoints.some((bp) => bp.breakpoint === 'md')).toBe(true);
  });

  it('4. solves physical spring parameters from cubic-bezier curves and extracts @keyframes', () => {
    const bounceSpring = solveSpringFromCubicBezier([0.34, 1.56, 0.64, 1], 400);
    const smoothSpring = solveSpringFromCubicBezier([0.22, 1, 0.36, 1], 250);

    // Overshoot bezier produces a lower damping ratio (more bounce) than smooth bezier
    expect(bounceSpring.dampingRatio).toBeLessThan(smoothSpring.dampingRatio);
    expect(bounceSpring.stiffness).toBeGreaterThan(60);
    expect(bounceSpring.damping).toBeGreaterThan(8);

    const snapshot = captureUiReference({
      markup: SAMPLE_REFERENCE_MARKUP,
      css: SAMPLE_REFERENCE_CSS
    });
    const motion = extractMotionPhysics(snapshot);

    expect(motion.motions.length).toBeGreaterThanOrEqual(2);
    expect(motion.keyframes.length).toBe(1);
    expect(motion.keyframes[0]?.name).toBe('pulseGlow');
    expect(motion.reducedMotionCssFallback).toContain('prefers-reduced-motion: reduce');
  });

  it('5. synthesizes zero-dependency components across React, Vue, Svelte, and Vanilla CSS', () => {
    const snapshot = captureUiReference({
      markup: SAMPLE_REFERENCE_MARKUP,
      css: SAMPLE_REFERENCE_CSS,
      componentName: 'GlassFeatureCard'
    });
    const tokens = extractDesignTokens(snapshot);
    const layout = decomposeLayoutSkeleton(snapshot);
    const motion = extractMotionPhysics(snapshot);

    expect(
      detectHostUiFramework(JSON.stringify({ dependencies: { vue: '^3.5.0', tailwindcss: '^3.4.0' } }))
    ).toBe('vue-tailwind');
    expect(
      detectHostUiFramework(JSON.stringify({ dependencies: { svelte: '^5.0.0' } }))
    ).toBe('svelte-css');

    for (const targetFramework of [
      'react-tailwind',
      'vanilla-css',
      'vue-tailwind',
      'svelte-css'
    ] as const) {
      const synth = synthesizeVibeComponent(snapshot, tokens, layout, motion, {
        targetFramework,
        componentName: 'GlassFeatureCard'
      });
      expect(synth.targetFramework).toBe(targetFramework);
      expect(synth.zeroExternalDependencies).toBe(true);
      expect(synth.reducedMotionGuardIncluded).toBe(true);
      expect(synth.componentCode).toContain('GlassFeatureCard');
      expect(synth.themeCssVariables).toContain('--color-surface-active');
    }
  });

  it('6. audits WCAG contrast ratios, touch targets, reduced-motion, and detects low-contrast edge cases', () => {
    const snapshot = captureUiReference({
      markup: SAMPLE_REFERENCE_MARKUP,
      css: SAMPLE_REFERENCE_CSS,
      componentName: 'AccessibleCard'
    });
    const tokens = extractDesignTokens(snapshot);
    const layout = decomposeLayoutSkeleton(snapshot);
    const motion = extractMotionPhysics(snapshot);
    const synth = synthesizeVibeComponent(snapshot, tokens, layout, motion, {
      targetFramework: 'react-tailwind'
    });

    const audit = auditUiFidelity(tokens, layout, motion, synth);
    expect(audit.fidelityScore).toBe(100);
    expect(audit.allContrastPassesAA).toBe(true);
    expect(audit.allTouchTargetsPass).toBe(true);
    expect(audit.hasReducedMotionFallback).toBe(true);
    expect(audit.clsLayoutStable).toBe(true);
    expect(audit.zeroExternalDepsVerified).toBe(true);

    // Edge case: low-contrast snippet (#94a3b8 text on #cbd5e1 background) and undersized 24x24px button
    const lowContrastSnap = captureUiReference({
      markup: `<div style="background-color: #cbd5e1; color: #94a3b8;"><button style="width: 24px; height: 24px;">Tiny</button></div>`
    });
    const lowTokens = extractDesignTokens(lowContrastSnap);
    const lowLayout = decomposeLayoutSkeleton(lowContrastSnap);
    const lowMotion = extractMotionPhysics(lowContrastSnap);
    const lowSynth = synthesizeVibeComponent(lowContrastSnap, lowTokens, lowLayout, lowMotion);
    const lowAudit = auditUiFidelity(lowTokens, lowLayout, lowMotion, lowSynth);

    expect(lowAudit.allContrastPassesAA).toBe(false);
    expect(lowAudit.allTouchTargetsPass).toBe(false);
    expect(lowAudit.touchTargetAudits[0]?.widthPx).toBe(24);
    expect(lowAudit.touchTargetAudits[0]?.heightPx).toBe(24);
    expect(lowAudit.fidelityScore).toBeLessThan(80);
    expect(lowAudit.recommendations.length).toBeGreaterThanOrEqual(2);
  });

  it('7. handles JSX arrow function props, oklch() / shorthand / Tailwind alpha colors, @media (min-width), and react-css-vars synthesis', () => {
    const jsxSnap = captureUiReference({
      markup: `<div className="bg-white/10 backdrop-blur-md p-4"><button onClick={() => fireEvent()} data-config={{ retry: 2 }} className="bg-indigo-600 text-white min-w-[48px] min-h-[48px]">Execute</button></div>`,
      css: `
        .panel {
          display: flex;
          flex-direction: column;
          padding: 8px 24px;
          border: 1px solid #334155;
          color: oklch(0.95 0.02 250);
          animation: fadeSlide 650ms ease-out both;
        }
        @media (min-width: 768px) {
          .panel {
            flex-direction: row;
          }
        }
        @keyframes fadeSlide {
          0% { opacity: 0; transform: translateY(8px); }
          100% { opacity: 1; transform: translateY(0); }
        }
      `
    });

    const btnNode = jsxSnap.flatNodes.find((n) => n.tag === 'button');
    expect(btnNode).toBeDefined();
    expect(btnNode?.classes).toContain('bg-indigo-600');
    expect(btnNode?.attributes['onClick']).toContain('=>');
    expect(jsxSnap.rawCssRules['.panel']?.['flex-direction']).toBe('column');
    expect(jsxSnap.rawCssRules['.panel']?.['@media-md-flex-direction']).toBe('row');

    const tokens = extractDesignTokens(jsxSnap);
    expect(tokens.colors.some((c) => c.role === 'glass')).toBe(true);
    expect(tokens.colors.some((c) => c.role === 'border' && c.hex === '#334155')).toBe(true);
    expect(tokens.spacing.some((s) => s.quantized8ptPx === 8)).toBe(true);
    expect(tokens.spacing.some((s) => s.quantized8ptPx === 24)).toBe(true);

    const motion = extractMotionPhysics(jsxSnap);
    const kfSpec = motion.keyframes.find((k) => k.name === 'fadeSlide');
    expect(kfSpec?.durationMs).toBe(650);

    const layout = decomposeLayoutSkeleton(jsxSnap);
    const synthCssVars = synthesizeVibeComponent(jsxSnap, tokens, layout, motion, {
      targetFramework: 'react-css-vars',
      includeDarkTheme: false,
      componentName: 'CssVarsPanel'
    });
    expect(synthCssVars.targetFramework).toBe('react-css-vars');
    expect(synthCssVars.componentCode).toContain('vibe-react-vars');
    expect(synthCssVars.themeCssVariables).not.toContain('.dark, [data-theme="dark"]');
  });

  it('8. executes all 6 MCP tools, 2 MCP resources, and rejects invalid tool/resource requests', () => {
    const server = createUi2VibeServer();
    expect(server).toBeDefined();

    const toolNames = [
      'capture_ui_reference',
      'extract_design_tokens',
      'decompose_layout_skeleton',
      'extract_motion_physics',
      'synthesize_vibe_component',
      'audit_ui_fidelity'
    ];

    for (const name of toolNames) {
      const res = executeUi2VibeTool(name, {
        markup: SAMPLE_REFERENCE_MARKUP,
        css: SAMPLE_REFERENCE_CSS,
        componentName: 'McpTestCard',
        targetFramework: 'react-tailwind'
      });
      expect(res).toBeDefined();
    }

    const presetsRes = readUi2VibeResource('ui2vibe://presets/motion-curves');
    expect(presetsRes.mimeType).toBe('application/json');
    expect(presetsRes.text).toContain('snappyMicroInteraction');

    const guideRes = readUi2VibeResource('ui2vibe://guide/ui-absorption-workflow');
    expect(guideRes.mimeType).toBe('text/markdown');
    expect(guideRes.text).toContain('UI2Vibe Absorption Workflow Guide');

    expect(() => executeUi2VibeTool('non_existent_tool', {})).toThrow(/Unknown tool/);
    expect(() => readUi2VibeResource('ui2vibe://unknown')).toThrow(/Unknown resource URI/);
  });
});
