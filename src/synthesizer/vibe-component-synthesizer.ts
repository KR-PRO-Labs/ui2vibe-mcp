import type {
  DesignTokenSet,
  LayoutSkeleton,
  LayoutSkeletonNode,
  MotionPhysicsReport,
  SynthesisOptions,
  SynthesizedComponent,
  TargetUiFramework,
  UiReferenceSnapshot
} from '../types/ui-domain.js';

export function detectHostUiFramework(
  workspacePackageJson?: string,
  explicitTarget?: TargetUiFramework
): TargetUiFramework {
  if (explicitTarget) {
    return explicitTarget;
  }
  if (!workspacePackageJson) {
    return 'react-tailwind';
  }
  try {
    const parsed = JSON.parse(workspacePackageJson) as {
      dependencies?: Record<string, string>;
      devDependencies?: Record<string, string>;
    };
    const deps = { ...(parsed.dependencies ?? {}), ...(parsed.devDependencies ?? {}) };
    const hasTailwind = Boolean(deps['tailwindcss']);
    if (deps['vue']) {
      return 'vue-tailwind';
    }
    if (deps['svelte']) {
      return 'svelte-css';
    }
    if (deps['react'] || deps['next']) {
      return hasTailwind ? 'react-tailwind' : 'react-css-vars';
    }
  } catch {
    // Fallback if package.json string is malformed
  }
  return 'vanilla-css';
}

function renderChildrenHtml(nodes: LayoutSkeletonNode[], indent = 4): string {
  const pad = ' '.repeat(indent);
  return nodes
    .map((n) => {
      const tag = n.semanticTag;
      const text = n.textContent || (n.isInteractive ? 'Action' : '');
      const interactiveAttrs = n.isInteractive
        ? ' type="button" style="min-width: 44px; min-height: 44px;"'
        : '';
      if (n.children.length === 0) {
        return `${pad}<${tag} data-node-id="${n.id}"${interactiveAttrs}>${text}</${tag}>`;
      }
      const inner = renderChildrenHtml(n.children, indent + 2);
      return `${pad}<${tag} data-node-id="${n.id}"${interactiveAttrs}>\n${
        text ? `${pad}  <span>${text}</span>\n` : ''
      }${inner}\n${pad}</${tag}>`;
    })
    .join('\n');
}

function renderChildrenJsx(nodes: LayoutSkeletonNode[], indent = 6): string {
  const pad = ' '.repeat(indent);
  return nodes
    .map((n) => {
      const tag = n.semanticTag;
      const text = n.textContent || (n.isInteractive ? 'Confirm Action' : '');
      if (n.isInteractive || tag === 'button') {
        return `${pad}<button\n${pad}  type="button"\n${pad}  data-node-id="${n.id}"\n${pad}  disabled={isLoading}\n${pad}  className="inline-flex items-center justify-center min-w-[44px] min-h-[44px] px-4 py-2 rounded-xl font-medium transition-all duration-200 focus-visible:outline-2 focus-visible:outline-offset-2 active:scale-95 disabled:opacity-60"\n${pad}  style={{ backgroundColor: 'var(--color-accent)', color: '#ffffff' }}\n${pad}>\n${pad}  {isLoading ? 'Processing...' : '${text.replace(/'/g, "\\'")}'}\n${pad}</button>`;
      }
      if (n.children.length === 0) {
        return `${pad}<${tag} data-node-id="${n.id}">${text}</${tag}>`;
      }
      const inner = renderChildrenJsx(n.children, indent + 2);
      return `${pad}<${tag} data-node-id="${n.id}">\n${
        text ? `${pad}  <span>${text}</span>\n` : ''
      }${inner}\n${pad}</${tag}>`;
    })
    .join('\n');
}

export function synthesizeVibeComponent(
  snapshot: UiReferenceSnapshot,
  tokens: DesignTokenSet,
  layout: LayoutSkeleton,
  motion: MotionPhysicsReport,
  options: SynthesisOptions = {}
): SynthesizedComponent {
  const targetFramework = detectHostUiFramework(
    options.workspacePackageJson,
    options.targetFramework
  );
  const componentName = (options.componentName ?? snapshot.componentName ?? 'VibeComponent')
    .replace(/[^a-zA-Z0-9_]/g, '')
    || 'VibeComponent';

  const bgToken =
    tokens.colors.find((c) => c.role === 'surface') ??
    tokens.colors.find((c) => c.role === 'background') ??
    tokens.colors[0]!;
  const fgToken =
    tokens.colors.find((c) => c.role === 'text-primary') ??
    tokens.colors[1] ??
    tokens.colors[0]!;
  const accentToken =
    tokens.colors.find((c) => c.role === 'accent') ??
    tokens.colors[0]!;

  const includeDarkTheme = options.includeDarkTheme !== false;
  const primaryMotion = motion.motions[0]!;
  const keyframeBlocks = motion.keyframes.map((k) => k.cssKeyframeBlock).join('\n\n');

  const baseCssVarsBlock = includeDarkTheme
    ? tokens.cssVariablesBlock
    : tokens.cssVariablesBlock.split('\n\n.dark')[0] ?? tokens.cssVariablesBlock;

  const darkActiveBlock = includeDarkTheme
    ? [
        '.dark, [data-theme="dark"] {',
        `  --color-surface-active: ${bgToken.darkCounterpartHex};`,
        `  --color-text-active: ${fgToken.darkCounterpartHex};`,
        `  --color-accent: ${accentToken.darkCounterpartHex};`,
        '}'
      ].join('\n')
    : '';

  const scrollTimelineBlocks = motion.scrollTimelines?.map((s) => s.supportsFallbackCss).join('\n\n') ?? '';
  const svgMorphBlocks = motion.svgMorphs?.map((m) => m.cssKeyframeAnimation).join('\n\n') ?? '';

  const containerCssBlocks: string[] = [];
  function collectContainerCss(node: LayoutSkeletonNode): void {
    if (node.containerQueries) {
      for (const cq of node.containerQueries) {
        const declLines = Object.entries(cq.declarations)
          .map(([k, v]) => `    ${k}: ${v};`)
          .join('\n');
        const cond = cq.containerName
          ? `@container ${cq.containerName} ${cq.queryRaw.replace(cq.containerName, '').trim()}`
          : `@container ${cq.queryRaw}`;
        containerCssBlocks.push(`${cond} {\n  [data-node-id="${node.id}"] {\n${declLines}\n  }\n}`);
      }
    }
    for (const child of node.children) {
      collectContainerCss(child);
    }
  }
  collectContainerCss(layout.root);
  const containerQueryCss = containerCssBlocks.join('\n\n');

  const themeCssVariables = [
    baseCssVarsBlock,
    ':root {',
    `  --color-surface-active: ${bgToken.hex};`,
    `  --color-text-active: ${fgToken.hex};`,
    `  --color-accent: ${accentToken.hex};`,
    `  --motion-duration: ${primaryMotion.durationMs}ms;`,
    `  --motion-easing: ${primaryMotion.easingCss};`,
    '}',
    darkActiveBlock,
    keyframeBlocks,
    svgMorphBlocks,
    scrollTimelineBlocks,
    containerQueryCss,
    motion.reducedMotionCssFallback
  ]
    .filter(Boolean)
    .join('\n\n');

  const tailwindColors: Record<string, string> = {};
  for (const c of tokens.colors) {
    tailwindColors[c.name] = `var(--${c.name}, ${c.hex})`;
  }
  const tailwindSpacing: Record<string, string> = {};
  for (const s of tokens.spacing) {
    tailwindSpacing[s.name] = s.rem;
  }
  const tailwindRadii: Record<string, string> = {};
  for (const r of tokens.radii) {
    tailwindRadii[r.name] = r.cssValue;
  }

  const tailwindConfigExtension: Record<string, unknown> = {
    theme: {
      extend: {
        colors: tailwindColors,
        spacing: tailwindSpacing,
        borderRadius: tailwindRadii,
        containers: {
          'xs': '20rem',
          'sm': '24rem',
          'md': '28rem',
          'lg': '32rem',
          'xl': '36rem'
        },
        transitionTimingFunction: {
          'vibe-spring': primaryMotion.easingCss
        },
        transitionDuration: {
          'vibe': `${primaryMotion.durationMs}ms`
        }
      }
    }
  };

  const rootTag = layout.root.semanticTag;
  const containerClass = layout.root.containerType
    ? layout.root.containerName
      ? `@container/${layout.root.containerName}`
      : '@container'
    : '';
  const subgridClass = layout.root.isSubgrid ? 'grid-cols-subgrid' : '';
  const layoutClass = [
    containerClass,
    layout.root.layoutMode === 'grid'
      ? subgridClass ? `grid ${subgridClass} gap-4` : 'grid gap-4'
      : layout.root.flexDirection === 'column'
        ? 'flex flex-col gap-4'
        : 'flex flex-row items-center gap-4'
  ]
    .filter(Boolean)
    .join(' ');

  let componentCode = '';

  if (targetFramework === 'react-tailwind' || targetFramework === 'react-css-vars') {
    const isCssVarsOnly = targetFramework === 'react-css-vars';
    const childJsx =
      layout.root.children.length > 0
        ? renderChildrenJsx(layout.root.children, 6)
        : `      <div>\n        <h2>${layout.root.textContent || componentName}</h2>\n      </div>\n      <button\n        type="button"\n        disabled={isLoading}\n        onClick={onAction}\n        className="inline-flex items-center justify-center min-w-[44px] min-h-[44px] px-4 py-2 rounded-xl font-medium transition-all focus-visible:outline-2 focus-visible:outline-offset-2 active:scale-95"\n        style={{ backgroundColor: 'var(--color-accent)', color: '#ffffff', minWidth: '44px', minHeight: '44px' }}\n      >\n        {isLoading ? 'Loading...' : 'Trigger Action'}\n      </button>`;

    const rootClassAttr = isCssVarsOnly
      ? `className="vibe-react-vars motion-reduce:transition-none"`
      : `className="${layoutClass} p-6 rounded-xl border transition-all motion-reduce:transition-none"`;

    const extraCssVarsStyle = isCssVarsOnly
      ? `\n        display: '${layout.root.layoutMode}',\n        flexDirection: '${layout.root.flexDirection ?? 'column'}',\n        gap: 'var(--${tokens.spacing[0]?.name ?? 'space-16'}, 16px)',\n        padding: '24px',\n        borderRadius: 'var(--${tokens.radii[0]?.name ?? 'radius-12'}, 12px)',`
      : '';

    componentCode = `import React, { useState } from 'react';

export interface ${componentName}Props {
  title?: string;
  isLoading?: boolean;
  darkMode?: boolean;
  onAction?: () => void;
}

/**
 * Synthesized by @kr-pro-labs/ui2vibe-mcp (${targetFramework})
 * Spring Physics Approximation: stiffness=${primaryMotion.springApproximation.stiffness}, damping=${primaryMotion.springApproximation.damping}, mass=${primaryMotion.springApproximation.mass}
 */
export function ${componentName}({
  title = '${(layout.root.textContent || componentName).replace(/'/g, "\\'")}',
  isLoading = false,
  darkMode = false,
  onAction
}: ${componentName}Props) {
  const [isHovered, setIsHovered] = useState(false);

  return (
    <${rootTag}
      data-component="${componentName}"
      data-theme={darkMode ? 'dark' : 'light'}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      ${rootClassAttr}
      style={{${extraCssVarsStyle}
        backgroundColor: 'var(--color-surface-active, ${bgToken.hex})',
        color: 'var(--color-text-active, ${fgToken.hex})',
        transitionDuration: 'var(--motion-duration, ${primaryMotion.durationMs}ms)',
        transitionTimingFunction: 'var(--motion-easing, ${primaryMotion.easingCss})',
        transform: isHovered ? 'translateY(-2px)' : 'translateY(0px)',
        minHeight: '48px'
      }}
    >
      <header className="flex items-center justify-between gap-2">
        <span className="font-semibold tracking-tight">{title}</span>
      </header>
${childJsx}
    </${rootTag}>
  );
}
`;
  } else if (targetFramework === 'vue-tailwind') {
    const childHtml =
      layout.root.children.length > 0
        ? renderChildrenHtml(layout.root.children, 4)
        : `    <button type="button" class="inline-flex items-center justify-center min-w-[44px] min-h-[44px] px-4 py-2 rounded-xl" style="min-width: 44px; min-height: 44px; background-color: var(--color-accent); color: #ffffff;">Action</button>`;

    componentCode = `<script setup lang="ts">
import { ref } from 'vue';

defineProps<{
  title?: string;
  isLoading?: boolean;
  darkMode?: boolean;
}>();

const isHovered = ref(false);
</script>

<template>
  <${rootTag}
    :data-theme="darkMode ? 'dark' : 'light'"
    class="${layoutClass} p-6 rounded-xl border transition-all motion-reduce:transition-none"
    :style="{
      backgroundColor: 'var(--color-surface-active, ${bgToken.hex})',
      color: 'var(--color-text-active, ${fgToken.hex})',
      transitionDuration: 'var(--motion-duration, ${primaryMotion.durationMs}ms)',
      transitionTimingFunction: 'var(--motion-easing, ${primaryMotion.easingCss})',
      transform: isHovered ? 'translateY(-2px)' : 'translateY(0px)',
      minHeight: '48px'
    }"
    @mouseenter="isHovered = true"
    @mouseleave="isHovered = false"
  >
    <header>{{ title ?? '${componentName}' }}</header>
${childHtml}
  </${rootTag}>
</template>

<style scoped>
${themeCssVariables}
</style>
`;
  } else if (targetFramework === 'svelte-css') {
    const childHtml =
      layout.root.children.length > 0
        ? renderChildrenHtml(layout.root.children, 2)
        : `  <button type="button" class="vibe-action-btn" style="min-width: 44px; min-height: 44px;">Action</button>`;

    componentCode = `<script lang="ts">
  export let title: string = '${componentName}';
  export let darkMode: boolean = false;
</script>

<${rootTag} class="vibe-container" data-theme={darkMode ? 'dark' : 'light'}>
  <header>{title}</header>
${childHtml}
</${rootTag}>

<style>
${themeCssVariables}
.vibe-container {
  display: ${layout.root.layoutMode};
  gap: ${layout.root.gapPx || 16}px;
  padding: 24px;
  border-radius: 12px;
  background-color: var(--color-surface-active, ${bgToken.hex});
  color: var(--color-text-active, ${fgToken.hex});
  transition: all var(--motion-duration, ${primaryMotion.durationMs}ms) var(--motion-easing, ${primaryMotion.easingCss});
  min-height: 48px;
}
.vibe-container:hover {
  transform: translateY(-2px);
}
.vibe-action-btn {
  min-width: 44px;
  min-height: 44px;
  background-color: var(--color-accent, ${accentToken.hex});
  color: #ffffff;
}
</style>
`;
  } else {
    // vanilla-css
    const childHtml =
      layout.root.children.length > 0
        ? renderChildrenHtml(layout.root.children, 2)
        : `  <button type="button" class="vibe-btn" style="min-width: 44px; min-height: 44px;">Trigger Action</button>`;

    componentCode = `<style>
${themeCssVariables}
.vibe-root {
  display: ${layout.root.layoutMode};
  gap: ${layout.root.gapPx || 16}px;
  padding: 24px;
  border-radius: 12px;
  background-color: var(--color-surface-active, ${bgToken.hex});
  color: var(--color-text-active, ${fgToken.hex});
  transition: all var(--motion-duration, ${primaryMotion.durationMs}ms) var(--motion-easing, ${primaryMotion.easingCss});
  min-height: 48px;
}
.vibe-root:hover {
  transform: translateY(-2px);
}
.vibe-root:focus-visible, .vibe-btn:focus-visible {
  outline: 2px solid var(--color-accent, ${accentToken.hex});
  outline-offset: 2px;
}
.vibe-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 44px;
  min-height: 44px;
  padding: 8px 16px;
  border-radius: 10px;
  background-color: var(--color-accent, ${accentToken.hex});
  color: #ffffff;
}
</style>
<${rootTag} class="vibe-root" data-component="${componentName}">
  <header>${layout.root.textContent || componentName}</header>
${childHtml}
</${rootTag}>
`;
  }

  return {
    componentName,
    targetFramework,
    themeCssVariables,
    tailwindConfigExtension,
    componentCode,
    zeroExternalDependencies: true,
    interactiveStatesIncluded: ['hover', 'focus-visible', 'active', 'disabled', 'dark'],
    reducedMotionGuardIncluded: true
  };
}
