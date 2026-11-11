import { computeContrastRatio } from '../tokens/design-token-extractor.js';
import type {
  ContrastPairAudit,
  DesignTokenSet,
  LayoutSkeleton,
  LayoutSkeletonNode,
  MotionPhysicsReport,
  SynthesizedComponent,
  TouchTargetAudit,
  UiFidelityReport
} from '../types/ui-domain.js';

function collectInteractiveNodes(node: LayoutSkeletonNode, list: LayoutSkeletonNode[]): void {
  if (
    node.isInteractive ||
    node.semanticTag === 'button' ||
    node.semanticTag === 'a' ||
    node.semanticTag === 'input'
  ) {
    list.push(node);
  }
  for (const child of node.children) {
    collectInteractiveNodes(child, list);
  }
}

export function auditUiFidelity(
  tokens: DesignTokenSet,
  layout: LayoutSkeleton,
  motion: MotionPhysicsReport,
  synthesizedComponent: SynthesizedComponent
): UiFidelityReport {
  const recommendations: string[] = [];
  const wcagContrastAudits: ContrastPairAudit[] = [];

  const backgrounds = tokens.colors.filter(
    (c) => c.role === 'background' || c.role === 'surface'
  );
  const foregrounds = tokens.colors.filter(
    (c) => c.role === 'text-primary' || c.role === 'text-muted'
  );

  for (const bg of backgrounds) {
    for (const fg of foregrounds) {
      const cr = computeContrastRatio(fg.hex, bg.hex);
      const passesAA = cr >= 4.5;
      const passesAAA = cr >= 7.0;
      wcagContrastAudits.push({
        foregroundToken: fg.name,
        foregroundHex: fg.hex,
        backgroundToken: bg.name,
        backgroundHex: bg.hex,
        contrastRatio: cr,
        passesAA,
        passesAAA
      });
      if (!passesAA) {
        recommendations.push(
          `Increase contrast between ${fg.name} (${fg.hex}) and ${bg.name} (${bg.hex}); current ratio is ${cr}:1 (minimum 4.5:1 required for WCAG AA).`
        );
      }
    }
  }

  const allContrastPassesAA =
    wcagContrastAudits.length > 0 && wcagContrastAudits.every((a) => a.passesAA);

  const interactiveNodes: LayoutSkeletonNode[] = [];
  collectInteractiveNodes(layout.root, interactiveNodes);

  const touchTargetAudits: TouchTargetAudit[] = interactiveNodes.map((node) => {
    const widthPx = node.minWidthPx ?? 44;
    const heightPx = node.minHeightPx ?? 44;
    const passesMinimum44px = widthPx >= 44 && heightPx >= 44;
    if (!passesMinimum44px) {
      recommendations.push(
        `Interactive element ${node.id} (<${node.semanticTag}>) has target dimensions ${widthPx}x${heightPx}px; increase to at least 44x44px.`
      );
    }
    return {
      nodeId: node.id,
      tag: node.semanticTag,
      widthPx,
      heightPx,
      passesMinimum44px
    };
  });

  if (touchTargetAudits.length === 0) {
    const codeHas44px =
      /min-w-\[44px\]/.test(synthesizedComponent.componentCode) ||
      /min-width:\s*44px/.test(synthesizedComponent.componentCode);
    touchTargetAudits.push({
      nodeId: 'synthesized-trigger',
      tag: 'button',
      widthPx: codeHas44px ? 44 : 32,
      heightPx: codeHas44px ? 44 : 32,
      passesMinimum44px: codeHas44px
    });
  }

  const allTouchTargetsPass = touchTargetAudits.every((t) => t.passesMinimum44px);

  const hasReducedMotionFallback =
    synthesizedComponent.themeCssVariables.includes('prefers-reduced-motion: reduce') ||
    synthesizedComponent.componentCode.includes('motion-reduce:') ||
    motion.reducedMotionCssFallback.includes('prefers-reduced-motion: reduce');

  if (!hasReducedMotionFallback) {
    recommendations.push(
      'Add a @media (prefers-reduced-motion: reduce) fallback to disable non-essential transitions for vestibular accessibility.'
    );
  }

  if (motion.scrollTimelines?.length > 0) {
    const hasSupportsCheck = motion.scrollTimelines.every((st) =>
      st.supportsFallbackCss.includes('@supports')
    );
    if (!hasSupportsCheck) {
      recommendations.push(
        'Provide @supports (animation-timeline: view()) fallback styling for browsers lacking CSS Scroll-Driven Animations support.'
      );
    }
  }

  const clsLayoutStable =
    Boolean(layout.root.minHeightPx || layout.root.aspectRatio) ||
    /minHeight|min-height|aspect-ratio/.test(synthesizedComponent.componentCode);

  if (!clsLayoutStable) {
    recommendations.push(
      'Add explicit min-height or aspect-ratio to root layout containers to prevent Cumulative Layout Shift (CLS).'
    );
  }

  const externalImportMatch = synthesizedComponent.componentCode.match(
    /from\s+['"](?!react['"]|vue['"]|svelte['"])([^'"]+)['"]/
  );
  const zeroExternalDepsVerified = !externalImportMatch && synthesizedComponent.zeroExternalDependencies;

  if (!zeroExternalDepsVerified) {
    recommendations.push(
      `Remove third-party UI dependency "${externalImportMatch?.[1] ?? 'unknown'}" to keep synthesized component 100% self-contained.`
    );
  }

  let score = 100;
  if (!allContrastPassesAA) score -= 25;
  if (!allTouchTargetsPass) score -= 20;
  if (!hasReducedMotionFallback) score -= 20;
  if (!clsLayoutStable) score -= 15;
  if (!zeroExternalDepsVerified) score -= 20;

  return {
    fidelityScore: Math.max(0, score),
    wcagContrastAudits,
    allContrastPassesAA,
    touchTargetAudits,
    allTouchTargetsPass,
    hasReducedMotionFallback,
    clsLayoutStable,
    zeroExternalDepsVerified,
    recommendations
  };
}
