import type {
  PseudoStateHook,
  PseudoStateType,
  UiDomNode,
  UiReferenceInput,
  UiReferenceSnapshot
} from '../types/ui-domain.js';

const TAILWIND_COLOR_MAP: Record<string, string> = {
  'white': '#ffffff',
  'black': '#000000',
  'slate-50': '#f8fafc',
  'slate-100': '#f1f5f9',
  'slate-200': '#e2e8f0',
  'slate-400': '#94a3b8',
  'slate-600': '#475569',
  'slate-700': '#334155',
  'slate-800': '#1e293b',
  'slate-900': '#0f172a',
  'slate-950': '#020617',
  'zinc-900': '#18181b',
  'zinc-100': '#f4f4f5',
  'gray-900': '#111827',
  'gray-100': '#f3f4f6',
  'indigo-500': '#6366f1',
  'indigo-600': '#4f46e5',
  'indigo-700': '#4338ca',
  'violet-600': '#7c3aed',
  'blue-500': '#3b82f6',
  'blue-600': '#2563eb',
  'emerald-500': '#10b981',
  'emerald-600': '#059669'
};

const TAILWIND_SPACING_SCALE: Record<string, string> = {
  '0': '0px',
  '1': '4px',
  '2': '8px',
  '3': '12px',
  '4': '16px',
  '5': '20px',
  '6': '24px',
  '8': '32px',
  '10': '40px',
  '12': '48px',
  '16': '64px'
};

const TAILWIND_RADIUS_SCALE: Record<string, string> = {
  'none': '0px',
  'sm': '4px',
  'md': '6px',
  'lg': '8px',
  'xl': '12px',
  '2xl': '16px',
  '3xl': '24px',
  'full': '9999px'
};

export function parseStyleDeclarations(styleText: string): Record<string, string> {
  const result: Record<string, string> = {};
  if (!styleText) {
    return result;
  }

  // Handle JSX style={{ key: 'value' }} object syntax
  const cleaned = styleText.replace(/^\{\{|\}\}$/g, '').trim();
  const segments = cleaned.split(/[;,]\s*(?=[a-zA-Z-]+\s*:)/);

  for (const seg of segments) {
    const colonIdx = seg.indexOf(':');
    if (colonIdx <= 0) continue;
    const rawKey = seg.slice(0, colonIdx).trim().replace(/^['"]|['"]$/g, '');
    const rawVal = seg
      .slice(colonIdx + 1)
      .trim()
      .replace(/[;,]$/, '')
      .replace(/^['"]|['"]$/g, '');
    if (!rawKey || !rawVal) continue;
    const kebabKey = rawKey.replace(/[A-Z]/g, (m) => `-${m.toLowerCase()}`);
    result[kebabKey] = rawVal;
  }

  return result;
}

function resolveTailwindColorToken(colorKey: string): string | undefined {
  const bracketHex = colorKey.match(/^\[(.+)\]$/)?.[1];
  if (bracketHex) return bracketHex;

  const slashIdx = colorKey.indexOf('/');
  if (slashIdx > 0) {
    const baseName = colorKey.slice(0, slashIdx);
    const alphaRaw = Number(colorKey.slice(slashIdx + 1));
    const baseHex = TAILWIND_COLOR_MAP[baseName];
    if (baseHex && !Number.isNaN(alphaRaw)) {
      const hex = baseHex.slice(1);
      const r = parseInt(hex.slice(0, 2), 16);
      const g = parseInt(hex.slice(2, 4), 16);
      const b = parseInt(hex.slice(4, 6), 16);
      const alpha = Math.max(0, Math.min(1, Number((alphaRaw / 100).toFixed(2))));
      return `rgba(${r}, ${g}, ${b}, ${alpha})`;
    }
  }

  return TAILWIND_COLOR_MAP[colorKey];
}

function mapTailwindTokenToDeclaration(token: string): Record<string, string> {
  const decls: Record<string, string> = {};

  if (token === 'flex') decls['display'] = 'flex';
  else if (token === 'inline-flex') decls['display'] = 'inline-flex';
  else if (token === 'grid') decls['display'] = 'grid';
  else if (token === 'block') decls['display'] = 'block';
  else if (token === 'flex-col') decls['flex-direction'] = 'column';
  else if (token === 'flex-row') decls['flex-direction'] = 'row';
  else if (token.startsWith('grid-cols-')) {
    const count = Number(token.slice('grid-cols-'.length));
    if (!Number.isNaN(count) && count > 0) {
      decls['display'] = 'grid';
      decls['grid-template-columns'] = `repeat(${count}, minmax(0, 1fr))`;
    }
  } else if (token.startsWith('gap-')) {
    const key = token.slice('gap-'.length);
    const val = TAILWIND_SPACING_SCALE[key] ?? (key.match(/^\[(.+)\]$/)?.[1] ?? '');
    if (val) decls['gap'] = val;
  } else if (token.startsWith('p-') || token.startsWith('px-') || token.startsWith('py-')) {
    const prefix = token.split('-')[0] ?? 'p';
    const key = token.slice(prefix.length + 1);
    const val = TAILWIND_SPACING_SCALE[key] ?? (key.match(/^\[(.+)\]$/)?.[1] ?? '');
    if (val) {
      if (prefix === 'p') decls['padding'] = val;
      if (prefix === 'px') {
        decls['padding-left'] = val;
        decls['padding-right'] = val;
      }
      if (prefix === 'py') {
        decls['padding-top'] = val;
        decls['padding-bottom'] = val;
      }
    }
  } else if (token.startsWith('bg-')) {
    const colorKey = token.slice(3);
    const resolved = resolveTailwindColorToken(colorKey);
    if (resolved) decls['background-color'] = resolved;
  } else if (token.startsWith('text-')) {
    const suffix = token.slice(5);
    const colorVal = resolveTailwindColorToken(suffix);
    if (colorVal) {
      decls['color'] = colorVal;
    } else if (suffix === 'xs') decls['font-size'] = '12px';
    else if (suffix === 'sm') decls['font-size'] = '14px';
    else if (suffix === 'base') decls['font-size'] = '16px';
    else if (suffix === 'lg') decls['font-size'] = '18px';
    else if (suffix === 'xl') decls['font-size'] = '20px';
    else if (suffix === '2xl') decls['font-size'] = '24px';
    else if (suffix === '3xl') decls['font-size'] = '30px';
  } else if (token.startsWith('border-')) {
    const suffix = token.slice(7);
    const colorVal = resolveTailwindColorToken(suffix);
    if (colorVal) decls['border-color'] = colorVal;
  } else if (token.startsWith('rounded')) {
    const suffix = token === 'rounded' ? 'md' : token.slice('rounded-'.length);
    const val = TAILWIND_RADIUS_SCALE[suffix] ?? (suffix.match(/^\[(.+)\]$/)?.[1] ?? '');
    if (val) decls['border-radius'] = val;
  } else if (token === 'shadow' || token.startsWith('shadow-')) {
    if (token === 'shadow-sm') decls['box-shadow'] = '0 1px 2px 0 rgba(0, 0, 0, 0.05)';
    else if (token === 'shadow' || token === 'shadow-md') {
      decls['box-shadow'] = '0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -2px rgba(0, 0, 0, 0.1)';
    } else if (token === 'shadow-lg') {
      decls['box-shadow'] = '0 10px 15px -3px rgba(0, 0, 0, 0.1), 0 4px 6px -4px rgba(0, 0, 0, 0.1)';
    } else if (token === 'shadow-xl' || token === 'shadow-2xl') {
      decls['box-shadow'] = '0 20px 25px -5px rgba(0, 0, 0, 0.15), 0 8px 10px -6px rgba(0, 0, 0, 0.1)';
    }
  } else if (token.startsWith('backdrop-blur')) {
    if (token === 'backdrop-blur-sm') decls['backdrop-filter'] = 'blur(4px)';
    else if (token === 'backdrop-blur' || token === 'backdrop-blur-md') decls['backdrop-filter'] = 'blur(12px)';
    else if (token === 'backdrop-blur-lg' || token === 'backdrop-blur-xl') decls['backdrop-filter'] = 'blur(20px)';
  } else if (token.startsWith('transition')) {
    decls['transition-property'] = token === 'transition-transform' ? 'transform' : 'all';
  } else if (token.startsWith('duration-')) {
    const ms = Number(token.slice('duration-'.length));
    if (!Number.isNaN(ms)) decls['transition-duration'] = `${ms}ms`;
  } else if (token === 'ease-in') {
    decls['transition-timing-function'] = 'cubic-bezier(0.4, 0, 1, 1)';
  } else if (token === 'ease-out') {
    decls['transition-timing-function'] = 'cubic-bezier(0, 0, 0.2, 1)';
  } else if (token === 'ease-in-out') {
    decls['transition-timing-function'] = 'cubic-bezier(0.4, 0, 0.2, 1)';
  } else if (token.startsWith('scale-')) {
    const num = Number(token.slice('scale-'.length));
    if (!Number.isNaN(num)) decls['transform'] = `scale(${(num / 100).toFixed(2)})`;
  } else if (token.startsWith('-translate-y-')) {
    const key = token.slice('-translate-y-'.length);
    const val = TAILWIND_SPACING_SCALE[key] ?? '4px';
    decls['transform'] = `translateY(-${val})`;
  } else if (token.startsWith('min-w-[')) {
    const val = token.match(/^min-w-\[(.+)\]$/)?.[1];
    if (val) decls['min-width'] = val;
  } else if (token.startsWith('min-h-[')) {
    const val = token.match(/^min-h-\[(.+)\]$/)?.[1];
    if (val) decls['min-height'] = val;
  } else if (token.startsWith('w-')) {
    const key = token.slice(2);
    const val = TAILWIND_SPACING_SCALE[key] ?? (key.match(/^\[(.+)\]$/)?.[1] ?? '');
    if (val) decls['width'] = val;
  } else if (token.startsWith('h-')) {
    const key = token.slice(2);
    const val = TAILWIND_SPACING_SCALE[key] ?? (key.match(/^\[(.+)\]$/)?.[1] ?? '');
    if (val) decls['height'] = val;
  } else if (token.startsWith('max-w-')) {
    const suffix = token.slice('max-w-'.length);
    if (suffix === 'sm') decls['max-width'] = '384px';
    else if (suffix === 'md') decls['max-width'] = '448px';
    else if (suffix === 'lg') decls['max-width'] = '512px';
    else if (suffix === 'xl') decls['max-width'] = '576px';
    else if (suffix === '2xl') decls['max-width'] = '672px';
    else if (suffix === '4xl') decls['max-width'] = '896px';
    else if (suffix === '6xl') decls['max-width'] = '1152px';
    else if (suffix === '7xl') decls['max-width'] = '1280px';
  } else if (token === 'aspect-video') {
    decls['aspect-ratio'] = '16 / 9';
  } else if (token === 'aspect-square') {
    decls['aspect-ratio'] = '1 / 1';
  }

  return decls;
}

function minWidthPxToBreakpoint(minWidthPx: number): 'sm' | 'md' | 'lg' | 'xl' {
  if (minWidthPx >= 1280) return 'xl';
  if (minWidthPx >= 1024) return 'lg';
  if (minWidthPx >= 768) return 'md';
  return 'sm';
}

function parseCssStylesheet(cssText: string): {
  rules: Record<string, Record<string, string>>;
  pseudoHooks: PseudoStateHook[];
  keyframes: Record<string, Record<string, Record<string, string>>>;
} {
  const rules: Record<string, Record<string, string>> = {};
  const pseudoHooks: PseudoStateHook[] = [];
  const keyframes: Record<string, Record<string, Record<string, string>>> = {};

  if (!cssText) {
    return { rules, pseudoHooks, keyframes };
  }

  const withoutComments = cssText.replace(/\/\*[\s\S]*?\*\//g, '');

  // Extract @keyframes blocks first
  const keyframeRegex = /@keyframes\s+([a-zA-Z0-9_-]+)\s*\{((?:[^{}]|\{[^{}]*\})*)\}/g;
  let kfMatch: RegExpExecArray | null;
  while ((kfMatch = keyframeRegex.exec(withoutComments)) !== null) {
    const kfName = kfMatch[1];
    const kfBody = kfMatch[2];
    if (!kfName || !kfBody) continue;
    const steps: Record<string, Record<string, string>> = {};
    const stepRegex = /([a-zA-Z0-9%,\s]+)\{([^}]*)\}/g;
    let stepMatch: RegExpExecArray | null;
    while ((stepMatch = stepRegex.exec(kfBody)) !== null) {
      const stepKey = stepMatch[1]?.trim();
      const stepBody = stepMatch[2]?.trim();
      if (stepKey && stepBody) {
        steps[stepKey] = parseStyleDeclarations(stepBody);
      }
    }
    keyframes[kfName] = steps;
  }

  // Extract @media blocks (dark mode, responsive min-width, reduced-motion, etc.)
  const mediaRegex = /@media\s*([^{]+)\{((?:[^{}]|\{[^{}]*\})*)\}/g;
  let mediaMatch: RegExpExecArray | null;
  while ((mediaMatch = mediaRegex.exec(withoutComments)) !== null) {
    const condition = mediaMatch[1]?.trim() ?? '';
    const inner = mediaMatch[2] ?? '';
    const isDark = /prefers-color-scheme\s*:\s*dark/i.test(condition);
    const minWidthMatch = condition.match(/min-width\s*:\s*([0-9.]+)px/i);

    const innerRuleRegex = /([^{]+)\{([^}]*)\}/g;
    let irMatch: RegExpExecArray | null;
    while ((irMatch = innerRuleRegex.exec(inner)) !== null) {
      const sel = irMatch[1]?.trim() ?? '';
      const body = irMatch[2]?.trim() ?? '';
      if (!sel || !body) continue;
      const decls = parseStyleDeclarations(body);
      if (isDark) {
        pseudoHooks.push({
          selector: sel,
          state: 'dark',
          declarations: decls
        });
      } else if (minWidthMatch?.[1]) {
        const bp = minWidthPxToBreakpoint(Number(minWidthMatch[1]));
        const existing = rules[sel] ?? {};
        for (const [k, v] of Object.entries(decls)) {
          existing[`@media-${bp}-${k}`] = v;
        }
        rules[sel] = existing;
      }
    }
  }

  // Strip @keyframes and @media blocks before parsing standard rules
  const stripped = withoutComments
    .replace(keyframeRegex, '')
    .replace(mediaRegex, '');

  const ruleRegex = /([^{}@]+)\{([^}]*)\}/g;
  let match: RegExpExecArray | null;
  while ((match = ruleRegex.exec(stripped)) !== null) {
    const rawSelector = match[1]?.trim();
    const rawBody = match[2]?.trim();
    if (!rawSelector || !rawBody) continue;
    const decls = parseStyleDeclarations(rawBody);

    const selectors = rawSelector.split(',').map((s) => s.trim());
    for (const sel of selectors) {
      if (sel.includes(':hover')) {
        pseudoHooks.push({
          selector: sel.replace(/:hover/g, ''),
          state: 'hover',
          declarations: decls
        });
      } else if (sel.includes(':focus-visible') || sel.includes(':focus')) {
        pseudoHooks.push({
          selector: sel.replace(/:focus(-visible)?/g, ''),
          state: 'focus-visible',
          declarations: decls
        });
      } else if (sel.includes(':active')) {
        pseudoHooks.push({
          selector: sel.replace(/:active/g, ''),
          state: 'active',
          declarations: decls
        });
      } else if (sel.includes(':disabled')) {
        pseudoHooks.push({
          selector: sel.replace(/:disabled/g, ''),
          state: 'disabled',
          declarations: decls
        });
      } else if (sel.startsWith('.dark ')) {
        pseudoHooks.push({
          selector: sel.slice('.dark '.length).trim(),
          state: 'dark',
          declarations: decls
        });
      } else {
        rules[sel] = { ...(rules[sel] ?? {}), ...decls };
      }
    }
  }

  return { rules, pseudoHooks, keyframes };
}

function parseAttributes(attrString: string): {
  classes: string[];
  inlineStyles: Record<string, string>;
  attributes: Record<string, string>;
} {
  const attributes: Record<string, string> = {};
  let classes: string[] = [];
  let inlineStyles: Record<string, string> = {};

  if (!attrString.trim()) {
    return { classes, inlineStyles, attributes };
  }

  // Handle JSX style={{ ... }}
  const jsxStyleMatch = attrString.match(/style\s*=\s*\{\{([\s\S]*?)\}\}/);
  if (jsxStyleMatch?.[1]) {
    inlineStyles = { ...inlineStyles, ...parseStyleDeclarations(jsxStyleMatch[1]) };
  }

  const attrRegex =
    /([a-zA-Z0-9_:-]+)\s*=\s*(?:"([^"]*)"|'([^']*)'|\{((?:[^{}]|\{[^{}]*\})*)\})/g;
  let m: RegExpExecArray | null;
  while ((m = attrRegex.exec(attrString)) !== null) {
    const name = m[1];
    const val = (m[2] ?? m[3] ?? m[4] ?? '').trim();
    if (!name) continue;
    if (name === 'class' || name === 'className') {
      classes = val
        .replace(/^['"`]|['"`]$/g, '')
        .split(/\s+/)
        .filter(Boolean);
    } else if (name === 'style') {
      if (!jsxStyleMatch) {
        inlineStyles = { ...inlineStyles, ...parseStyleDeclarations(val) };
      }
    } else {
      attributes[name] = val;
    }
  }

  return { classes, inlineStyles, attributes };
}

const VOID_TAGS = new Set([
  'area',
  'base',
  'br',
  'col',
  'embed',
  'hr',
  'img',
  'input',
  'link',
  'meta',
  'param',
  'source',
  'track',
  'wbr'
]);

export function captureUiReference(input: UiReferenceInput): UiReferenceSnapshot {
  let rawMarkup = input.markup ?? '';
  let embeddedCss = input.css ?? '';

  // Extract <style> blocks if present in HTML/Vue/Svelte
  const styleTagRegex = /<style[^>]*>([\s\S]*?)<\/style>/gi;
  let stMatch: RegExpExecArray | null;
  while ((stMatch = styleTagRegex.exec(rawMarkup)) !== null) {
    if (stMatch[1]) {
      embeddedCss += `\n${stMatch[1]}`;
    }
  }
  rawMarkup = rawMarkup.replace(styleTagRegex, '');

  // Strip Vue <template> wrapper if present
  let detectedFramework: 'html' | 'jsx' | 'vue' | 'svelte' = input.sourceFrameworkHint ?? 'html';
  if (/<template[\s>]/i.test(rawMarkup)) {
    detectedFramework = input.sourceFrameworkHint ?? 'vue';
    rawMarkup = rawMarkup.replace(/<\/?template[^>]*>/gi, '');
  } else if (/className\s*=/.test(rawMarkup) || /style\s*=\s*\{\{/.test(rawMarkup)) {
    detectedFramework = input.sourceFrameworkHint ?? 'jsx';
  }

  const { rules: rawCssRules, pseudoHooks, keyframes } = parseCssStylesheet(embeddedCss);

  const rootNodes: UiDomNode[] = [];
  const flatNodes: UiDomNode[] = [];
  const stack: UiDomNode[] = [];
  const tailwindSet = new Set<string>();

  // Quote- and brace-aware HTML/JSX tag matcher so `>` inside `onClick={() => ...}` or quotes does not truncate tags
  const tagRegex =
    /<!--[\s\S]*?-->|<(\/?)([a-zA-Z][a-zA-Z0-9-]*)((?:[^>"'{]|"[^"]*"|'[^']*'|\{(?:[^{}]|\{[^{}]*\})*\})*?)(\/?)>/g;
  let lastIndex = 0;
  let nodeCounter = 0;
  let match: RegExpExecArray | null;

  while ((match = tagRegex.exec(rawMarkup)) !== null) {
    const textSlice = rawMarkup.slice(lastIndex, match.index).trim();
    if (textSlice && stack.length > 0) {
      const currentParent = stack[stack.length - 1];
      if (currentParent && !textSlice.startsWith('{') && !textSlice.startsWith('//')) {
        currentParent.textContent = currentParent.textContent
          ? `${currentParent.textContent} ${textSlice}`
          : textSlice;
      }
    }
    lastIndex = tagRegex.lastIndex;

    // Skip HTML comments
    if (match[0].startsWith('<!--')) continue;

    const isClosing = match[1] === '/';
    const rawTag = match[2] ?? 'div';
    const tag = rawTag.toLowerCase();
    const attrStr = match[3] ?? '';
    const isSelfClosing = match[4] === '/' || VOID_TAGS.has(tag);

    if (isClosing) {
      if (stack.length > 0) {
        stack.pop();
      }
      continue;
    }

    nodeCounter += 1;
    const nodeId = `node-${nodeCounter}`;
    const { classes, inlineStyles, attributes } = parseAttributes(attrStr);

    const computedStyles: Record<string, string> = {};

    // Apply tag-level CSS rules
    if (rawCssRules[tag]) {
      Object.assign(computedStyles, rawCssRules[tag]);
    }

    // Apply class-level CSS rules & Tailwind utilities
    for (const cls of classes) {
      tailwindSet.add(cls);
      const classSelector = `.${cls}`;
      if (rawCssRules[classSelector]) {
        Object.assign(computedStyles, rawCssRules[classSelector]);
      }

      if (cls.startsWith('hover:') || cls.startsWith('focus:') || cls.startsWith('focus-visible:') || cls.startsWith('active:') || cls.startsWith('dark:')) {
        const colonIdx = cls.indexOf(':');
        const prefix = cls.slice(0, colonIdx);
        const utility = cls.slice(colonIdx + 1);
        const mapped = mapTailwindTokenToDeclaration(utility);
        if (Object.keys(mapped).length > 0) {
          const stateMap: Record<string, PseudoStateType> = {
            'hover': 'hover',
            'focus': 'focus-visible',
            'focus-visible': 'focus-visible',
            'active': 'active',
            'dark': 'dark'
          };
          const state = stateMap[prefix] ?? 'hover';
          pseudoHooks.push({
            selector: `#${nodeId}`,
            state,
            declarations: mapped
          });
        }
      } else if (cls.startsWith('sm:') || cls.startsWith('md:') || cls.startsWith('lg:') || cls.startsWith('xl:')) {
        const colonIdx = cls.indexOf(':');
        const bp = cls.slice(0, colonIdx);
        const utility = cls.slice(colonIdx + 1);
        const mapped = mapTailwindTokenToDeclaration(utility);
        for (const [k, v] of Object.entries(mapped)) {
          computedStyles[`@media-${bp}-${k}`] = v;
        }
      } else {
        Object.assign(computedStyles, mapTailwindTokenToDeclaration(cls));
      }
    }

    // Apply ID-level CSS rules
    if (attributes['id'] && rawCssRules[`#${attributes['id']}`]) {
      Object.assign(computedStyles, rawCssRules[`#${attributes['id']}`]);
    }

    // Inline styles have highest specificity
    Object.assign(computedStyles, inlineStyles);

    const newNode: UiDomNode = {
      id: nodeId,
      tag,
      classes,
      attributes,
      inlineStyles,
      computedStyles,
      textContent: '',
      children: []
    };

    flatNodes.push(newNode);

    if (stack.length > 0) {
      const parent = stack[stack.length - 1];
      parent?.children.push(newNode);
    } else {
      rootNodes.push(newNode);
    }

    if (!isSelfClosing) {
      stack.push(newNode);
    }
  }

  return {
    componentName: input.componentName ?? 'AbsorbedVibeComponent',
    sourceFramework: detectedFramework,
    rootNodes,
    flatNodes,
    rawCssRules,
    pseudoStateHooks: pseudoHooks,
    keyframesRaw: keyframes,
    tailwindClassesDetected: Array.from(tailwindSet)
  };
}
