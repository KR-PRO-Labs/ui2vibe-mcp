import type {
  KeyframeAnimationSpec,
  MotionPhysicsReport,
  MotionSpec,
  ScrollTimelineAxis,
  ScrollTimelineSpec,
  SpringApproximation,
  SvgMorphSpec,
  UiReferenceSnapshot
} from '../types/ui-domain.js';

export const NAMED_BEZIER_MAP: Record<string, [number, number, number, number]> = {
  linear: [0, 0, 1, 1],
  ease: [0.25, 0.1, 0.25, 1],
  'ease-in': [0.42, 0, 1, 1],
  'ease-out': [0, 0, 0.58, 1],
  'ease-in-out': [0.42, 0, 0.58, 1]
};

export const PRESET_MOTION_CURVES: Record<
  string,
  {
    easingCss: string;
    bezier: [number, number, number, number];
    durationMs: number;
    spring: SpringApproximation;
    useCase: string;
  }
> = {
  snappyMicroInteraction: {
    easingCss: 'cubic-bezier(0.22, 1, 0.36, 1)',
    bezier: [0.22, 1, 0.36, 1],
    durationMs: 180,
    spring: {
      stiffness: 420,
      damping: 32,
      mass: 1,
      dampingRatio: 0.78,
      settlingTimeMs: 195
    },
    useCase: 'Button hover/active states, toggle switches, segmented controls'
  },
  fluidSurfaceElevation: {
    easingCss: 'cubic-bezier(0.16, 1, 0.3, 1)',
    bezier: [0.16, 1, 0.3, 1],
    durationMs: 280,
    spring: {
      stiffness: 290,
      damping: 28,
      mass: 1,
      dampingRatio: 0.82,
      settlingTimeMs: 300
    },
    useCase: 'Cards, modals, command palettes, popover menus'
  },
  elasticSpringBounce: {
    easingCss: 'cubic-bezier(0.34, 1.56, 0.64, 1)',
    bezier: [0.34, 1.56, 0.64, 1],
    durationMs: 420,
    spring: {
      stiffness: 340,
      damping: 18,
      mass: 1,
      dampingRatio: 0.49,
      settlingTimeMs: 460
    },
    useCase: 'Playful badge pop-ins, notification toasts, floating action buttons'
  }
};

export function parseCubicBezier(easingCss: string): [number, number, number, number] {
  const trimmed = easingCss.trim().toLowerCase();
  if (NAMED_BEZIER_MAP[trimmed]) {
    return NAMED_BEZIER_MAP[trimmed] ?? [0.25, 0.1, 0.25, 1];
  }
  const match = trimmed.match(
    /cubic-bezier\(\s*([-0-9.]+)\s*,\s*([-0-9.]+)\s*,\s*([-0-9.]+)\s*,\s*([-0-9.]+)\s*\)/
  );
  if (match) {
    const x1 = Number(match[1]);
    const y1 = Number(match[2]);
    const x2 = Number(match[3]);
    const y2 = Number(match[4]);
    if (![x1, y1, x2, y2].some((v) => Number.isNaN(v))) {
      return [x1, y1, x2, y2];
    }
  }
  return [0.25, 0.1, 0.25, 1];
}

export function solveSpringFromCubicBezier(
  bezier: [number, number, number, number],
  durationMs: number
): SpringApproximation {
  const [x1, y1, x2, y2] = bezier;
  const safeDurationSec = Math.max(0.08, Math.min(2.5, durationMs / 1000));
  const mass = 1;

  // Estimate initial velocity aggressiveness and overshoot from control points
  const initialSlope = y1 / Math.max(0.08, x1);
  const overshoot = Math.max(0, y1 - 1, y2 - 1);

  let dampingRatio: number;
  if (overshoot > 0.02) {
    // Underdamped spring with visible bounce
    dampingRatio = Math.max(0.38, Math.min(0.76, 0.78 - overshoot * 0.5));
  } else {
    // Critically / near-critically damped smooth deceleration
    const decelerationFactor = Math.max(0, 1 - x2);
    dampingRatio = Math.max(0.78, Math.min(1.0, 0.96 - decelerationFactor * 0.18));
  }

  // Natural frequency omega_n (rad/s) derived from settling envelope ~ 4 / (zeta * omega_n)
  const speedBoost = Math.max(0.75, Math.min(1.45, 0.85 + Math.min(initialSlope, 3) * 0.15));
  const omegaN = (4.2 / (dampingRatio * safeDurationSec)) * speedBoost;

  const stiffness = Math.round(Math.max(60, Math.min(900, mass * omegaN * omegaN)));
  const damping = Math.round(
    Math.max(8, Math.min(120, 2 * dampingRatio * Math.sqrt(stiffness * mass)))
  );
  const settlingTimeMs = Math.round((4 / (dampingRatio * Math.sqrt(stiffness / mass))) * 1000);

  return {
    stiffness,
    damping,
    mass,
    dampingRatio: Number(dampingRatio.toFixed(2)),
    settlingTimeMs
  };
}

function parseDurationMs(raw: string | undefined): number {
  if (!raw) return 220;
  const trimmed = raw.trim().toLowerCase();
  if (trimmed.endsWith('ms')) {
    const n = parseFloat(trimmed.slice(0, -2));
    return Number.isNaN(n) ? 220 : Math.round(n);
  }
  if (trimmed.endsWith('s')) {
    const n = parseFloat(trimmed.slice(0, -1));
    return Number.isNaN(n) ? 220 : Math.round(n * 1000);
  }
  const plain = Number(trimmed);
  return Number.isNaN(plain) ? 220 : Math.round(plain);
}

export interface NormalizedSvgCommand {
  type: 'M' | 'C';
  x1?: number;
  y1?: number;
  x2?: number;
  y2?: number;
  x: number;
  y: number;
}

export function parseAndNormalizeSvgPath(d: string): NormalizedSvgCommand[] {
  const result: NormalizedSvgCommand[] = [];
  const cmdRegex = /([a-df-z])([^a-df-z]*)/gi;
  let match: RegExpExecArray | null;
  let currX = 0;
  let currY = 0;
  let startX = 0;
  let startY = 0;

  while ((match = cmdRegex.exec(d)) !== null) {
    const rawCmd = match[1] ?? 'M';
    const cmd = rawCmd.toUpperCase();
    const isRel = rawCmd !== cmd;
    const nums = (match[2]?.match(/[-+]?(?:\d*\.\d+|\d+)(?:[eE][-+]?\d+)?/g) ?? []).map(Number);

    if (cmd === 'M') {
      let idx = 0;
      while (idx < nums.length) {
        const x = isRel ? currX + (nums[idx] ?? 0) : (nums[idx] ?? 0);
        const y = isRel ? currY + (nums[idx + 1] ?? 0) : (nums[idx + 1] ?? 0);
        if (result.length === 0) {
          result.push({ type: 'M', x, y });
          startX = x;
          startY = y;
        } else {
          result.push({ type: 'C', x1: currX, y1: currY, x2: x, y2: y, x, y });
        }
        currX = x;
        currY = y;
        idx += 2;
      }
    } else if (cmd === 'L') {
      let idx = 0;
      while (idx < nums.length) {
        const x = isRel ? currX + (nums[idx] ?? 0) : (nums[idx] ?? 0);
        const y = isRel ? currY + (nums[idx + 1] ?? 0) : (nums[idx + 1] ?? 0);
        result.push({ type: 'C', x1: currX, y1: currY, x2: x, y2: y, x, y });
        currX = x;
        currY = y;
        idx += 2;
      }
    } else if (cmd === 'H') {
      for (const val of nums) {
        const x = isRel ? currX + val : val;
        result.push({ type: 'C', x1: currX, y1: currY, x2: x, y2: currY, x, y: currY });
        currX = x;
      }
    } else if (cmd === 'V') {
      for (const val of nums) {
        const y = isRel ? currY + val : val;
        result.push({ type: 'C', x1: currX, y1: currY, x2: currX, y2: y, x: currX, y });
        currY = y;
      }
    } else if (cmd === 'C') {
      let idx = 0;
      while (idx + 5 < nums.length) {
        const x1 = isRel ? currX + (nums[idx] ?? 0) : (nums[idx] ?? 0);
        const y1 = isRel ? currY + (nums[idx + 1] ?? 0) : (nums[idx + 1] ?? 0);
        const x2 = isRel ? currX + (nums[idx + 2] ?? 0) : (nums[idx + 2] ?? 0);
        const y2 = isRel ? currY + (nums[idx + 3] ?? 0) : (nums[idx + 3] ?? 0);
        const x = isRel ? currX + (nums[idx + 4] ?? 0) : (nums[idx + 4] ?? 0);
        const y = isRel ? currY + (nums[idx + 5] ?? 0) : (nums[idx + 5] ?? 0);
        result.push({ type: 'C', x1, y1, x2, y2, x, y });
        currX = x;
        currY = y;
        idx += 6;
      }
    } else if (cmd === 'Q') {
      let idx = 0;
      while (idx + 3 < nums.length) {
        const qx1 = isRel ? currX + (nums[idx] ?? 0) : (nums[idx] ?? 0);
        const qy1 = isRel ? currY + (nums[idx + 1] ?? 0) : (nums[idx + 1] ?? 0);
        const x = isRel ? currX + (nums[idx + 2] ?? 0) : (nums[idx + 2] ?? 0);
        const y = isRel ? currY + (nums[idx + 3] ?? 0) : (nums[idx + 3] ?? 0);
        const x1 = currX + (2 / 3) * (qx1 - currX);
        const y1 = currY + (2 / 3) * (qy1 - currY);
        const x2 = x + (2 / 3) * (qx1 - x);
        const y2 = y + (2 / 3) * (qy1 - y);
        result.push({ type: 'C', x1, y1, x2, y2, x, y });
        currX = x;
        currY = y;
        idx += 4;
      }
    } else if (cmd === 'Z') {
      if (currX !== startX || currY !== startY) {
        result.push({ type: 'C', x1: currX, y1: currY, x2: startX, y2: startY, x: startX, y: startY });
        currX = startX;
        currY = startY;
      }
    }
  }

  if (result.length === 0) {
    result.push({ type: 'M', x: 0, y: 0 });
  }

  return result;
}

export function padNormalizedCommands(cmds: NormalizedSvgCommand[], targetLen: number): void {
  if (cmds.length >= targetLen) return;
  const last = cmds[cmds.length - 1]!;
  while (cmds.length < targetLen) {
    cmds.push({
      type: 'C',
      x1: last.x,
      y1: last.y,
      x2: last.x,
      y2: last.y,
      x: last.x,
      y: last.y
    });
  }
}

export function interpolateNormalizedCommands(
  a: NormalizedSvgCommand[],
  b: NormalizedSvgCommand[],
  t: number
): string {
  const parts: string[] = [];
  const len = Math.min(a.length, b.length);
  const round = (n: number) => Number(n.toFixed(2));

  for (let i = 0; i < len; i++) {
    const cmdA = a[i]!;
    const cmdB = b[i]!;
    if (i === 0 && cmdA.type === 'M') {
      const mx = round((1 - t) * cmdA.x + t * cmdB.x);
      const my = round((1 - t) * cmdA.y + t * cmdB.y);
      parts.push(`M ${mx} ${my}`);
    } else {
      const x1 = round((1 - t) * (cmdA.x1 ?? cmdA.x) + t * (cmdB.x1 ?? cmdB.x));
      const y1 = round((1 - t) * (cmdA.y1 ?? cmdA.y) + t * (cmdB.y1 ?? cmdB.y));
      const x2 = round((1 - t) * (cmdA.x2 ?? cmdA.x) + t * (cmdB.x2 ?? cmdB.x));
      const y2 = round((1 - t) * (cmdA.y2 ?? cmdA.y) + t * (cmdB.y2 ?? cmdB.y));
      const x = round((1 - t) * cmdA.x + t * cmdB.x);
      const y = round((1 - t) * cmdA.y + t * cmdB.y);
      parts.push(`C ${x1} ${y1}, ${x2} ${y2}, ${x} ${y}`);
    }
  }

  return parts.join(' ');
}

export function buildSvgMorphSpec(
  id: string,
  sourceD: string,
  targetD: string
): SvgMorphSpec {
  const normA = parseAndNormalizeSvgPath(sourceD);
  const normB = parseAndNormalizeSvgPath(targetD);
  const maxLen = Math.max(normA.length, normB.length);
  padNormalizedCommands(normA, maxLen);
  padNormalizedCommands(normB, maxLen);

  const steps: string[] = [];
  for (const t of [0, 0.25, 0.5, 0.75, 1.0]) {
    steps.push(interpolateNormalizedCommands(normA, normB, t));
  }

  const kfName = `morph_${id.replace(/[^a-zA-Z0-9_]/g, '_')}`;
  const cssKeyframeAnimation = [
    `@keyframes ${kfName} {`,
    `  0% { d: path('${steps[0]}'); }`,
    `  25% { d: path('${steps[1]}'); }`,
    `  50% { d: path('${steps[2]}'); }`,
    `  75% { d: path('${steps[3]}'); }`,
    `  100% { d: path('${steps[4]}'); }`,
    `}`
  ].join('\n');

  return {
    id,
    sourcePathD: sourceD,
    targetPathD: targetD,
    interpolatedSteps: steps,
    commandCount: maxLen,
    cssKeyframeAnimation,
    prefersReducedMotionFallbackD: targetD
  };
}

export function extractMotionPhysics(snapshot: UiReferenceSnapshot): MotionPhysicsReport {
  const motions: MotionSpec[] = [];
  const keyframes: KeyframeAnimationSpec[] = [];
  const scrollTimelines: ScrollTimelineSpec[] = [];
  const svgMorphs: SvgMorphSpec[] = [];
  const seenMotionKeys = new Set<string>();
  const animationOverrides = new Map<string, { durationMs: number; easingCss: string }>();
  let motionCount = 0;

  const inspectDeclarations = (
    decls: Record<string, string>,
    trigger: MotionSpec['trigger']
  ): void => {
    const animShorthand = decls['animation'];
    const animName = decls['animation-name'];
    const animDuration = decls['animation-duration'];
    const animEasing = decls['animation-timing-function'];
    if (animShorthand || animName) {
      const targetName =
        animName?.trim() ??
        animShorthand
          ?.split(/\s+/)
          .find(
            (tok) =>
              !/^[0-9]/.test(tok) &&
              !tok.startsWith('cubic-bezier') &&
              !NAMED_BEZIER_MAP[tok] &&
              !['infinite', 'both', 'forwards', 'backwards', 'alternate', 'normal', 'reverse'].includes(tok)
          );
      if (targetName) {
        const durToken = animDuration ?? animShorthand?.match(/\b([0-9.]+m?s)\b/)?.[1];
        const bezierToken =
          animEasing ??
          animShorthand?.match(/cubic-bezier\([^)]+\)/)?.[0] ??
          Object.keys(NAMED_BEZIER_MAP).find((named) =>
            new RegExp(`\\b${named}\\b`).test(animShorthand ?? '')
          );
        animationOverrides.set(targetName, {
          durationMs: durToken ? parseDurationMs(durToken) : 400,
          easingCss: bezierToken ?? 'cubic-bezier(0.16, 1, 0.3, 1)'
        });
      }
    }

    const transitionShorthand = decls['transition'];
    const transitionProp = decls['transition-property'];
    const transitionDuration = decls['transition-duration'];
    const transitionEasing = decls['transition-timing-function'];
    const hasTransform = Boolean(decls['transform']);

    if (transitionShorthand || transitionProp || transitionDuration || hasTransform) {
      let property = transitionProp ?? 'all';
      let durationMs = parseDurationMs(transitionDuration);
      let easingCss = transitionEasing ?? 'cubic-bezier(0.22, 1, 0.36, 1)';

      if (transitionShorthand) {
        const bezierInShorthand = transitionShorthand.match(/cubic-bezier\([^)]+\)/)?.[0];
        const durationInShorthand = transitionShorthand.match(/\b([0-9.]+m?s)\b/)?.[1];
        const propToken = transitionShorthand.split(/\s+/)[0];
        if (propToken && !/^[0-9]/.test(propToken) && !propToken.startsWith('cubic-bezier')) {
          property = propToken;
        }
        if (durationInShorthand) {
          durationMs = parseDurationMs(durationInShorthand);
        }
        if (bezierInShorthand) {
          easingCss = bezierInShorthand;
        } else {
          for (const named of Object.keys(NAMED_BEZIER_MAP)) {
            if (new RegExp(`\\b${named}\\b`).test(transitionShorthand)) {
              easingCss = named;
              break;
            }
          }
        }
      }

      const bezier = parseCubicBezier(easingCss);
      const spring = solveSpringFromCubicBezier(bezier, durationMs);
      const normalizedEasing = easingCss.startsWith('cubic-bezier')
        ? easingCss
        : `cubic-bezier(${bezier.join(', ')})`;

      const dedupeKey = `${trigger}|${property}|${durationMs}|${normalizedEasing}`;
      if (!seenMotionKeys.has(dedupeKey)) {
        seenMotionKeys.add(dedupeKey);
        motionCount += 1;
        motions.push({
          id: `motion-${motionCount}`,
          trigger,
          property,
          durationMs,
          easingCss: normalizedEasing,
          bezierControlPoints: bezier,
          springApproximation: spring,
          cssRule: `transition: ${property} ${durationMs}ms ${normalizedEasing};`
        });
      }
    }
  };

  for (const node of snapshot.flatNodes) {
    inspectDeclarations(node.computedStyles, 'hover');
  }
  for (const ruleDecls of Object.values(snapshot.rawCssRules)) {
    inspectDeclarations(ruleDecls, 'hover');
  }
  for (const hook of snapshot.pseudoStateHooks) {
    const mappedTrigger: MotionSpec['trigger'] =
      hook.state === 'focus-visible'
        ? 'focus'
        : hook.state === 'active'
          ? 'active'
          : 'hover';
    inspectDeclarations(hook.declarations, mappedTrigger);
  }

  for (const [kfName, steps] of Object.entries(snapshot.keyframesRaw)) {
    const stepLines: string[] = [];
    for (const [stepSelector, stepDecls] of Object.entries(steps)) {
      const pairs = Object.entries(stepDecls)
        .map(([k, v]) => `${k}: ${v};`)
        .join(' ');
      stepLines.push(`  ${stepSelector} { ${pairs} }`);
    }
    const override = animationOverrides.get(kfName);
    const kfDuration = override?.durationMs ?? 400;
    const rawEasing = override?.easingCss ?? 'cubic-bezier(0.16, 1, 0.3, 1)';
    const bezier = parseCubicBezier(rawEasing);
    const normalizedEasing = rawEasing.startsWith('cubic-bezier')
      ? rawEasing
      : `cubic-bezier(${bezier.join(', ')})`;

    const cssKeyframeBlock = `@keyframes ${kfName} {\n${stepLines.join('\n')}\n}`;
    keyframes.push({
      name: kfName,
      durationMs: kfDuration,
      easingCss: normalizedEasing,
      steps,
      cssKeyframeBlock
    });

    motionCount += 1;
    motions.push({
      id: `motion-${motionCount}`,
      trigger: 'keyframe',
      property: kfName,
      durationMs: kfDuration,
      easingCss: normalizedEasing,
      bezierControlPoints: bezier,
      springApproximation: solveSpringFromCubicBezier(bezier, kfDuration),
      cssRule: `animation: ${kfName} ${kfDuration}ms ${normalizedEasing} both;`
    });
  }

  // Extract Scroll-Driven Timelines from rawCssRules and flatNodes
  const allDeclsToCheck: Array<{ selector: string; decls: Record<string, string> }> = [];
  for (const [sel, decls] of Object.entries(snapshot.rawCssRules)) {
    allDeclsToCheck.push({ selector: sel, decls });
  }
  for (const node of snapshot.flatNodes) {
    allDeclsToCheck.push({ selector: `#${node.id}`, decls: node.computedStyles });
  }

  let scrollIdx = 0;
  for (const { selector, decls } of allDeclsToCheck) {
    const animTimeline = decls['animation-timeline'];
    if (animTimeline) {
      scrollIdx += 1;
      const type: 'view' | 'scroll' = animTimeline.includes('scroll') ? 'scroll' : 'view';
      let axis: ScrollTimelineAxis = 'block';
      if (animTimeline.includes('inline')) axis = 'inline';
      else if (animTimeline.includes('x')) axis = 'x';
      else if (animTimeline.includes('y')) axis = 'y';

      const timelineName =
        decls['view-timeline-name'] ??
        decls['scroll-timeline-name'] ??
        decls['view-timeline']?.split(/\s+/)[0];
      const viewInset = decls['view-timeline-inset'];
      const animRange = decls['animation-range'];
      const rangeStart =
        decls['animation-range-start'] ??
        (animRange ? animRange.split(/\s+/).slice(0, 2).join(' ') : 'entry 0%');
      const rangeEnd =
        decls['animation-range-end'] ??
        (animRange ? animRange.split(/\s+/).slice(2).join(' ') : 'cover 100%');

      const cssRule = `animation-timeline: ${animTimeline}; animation-range: ${animRange || `${rangeStart} ${rangeEnd}`};`;
      const supportsFallbackCss = [
        `@supports (animation-timeline: ${type}()) {`,
        `  ${selector} {`,
        `    ${cssRule}`,
        `  }`,
        `}`,
        `@supports not (animation-timeline: ${type}()) {`,
        `  ${selector} {`,
        `    opacity: 1;`,
        `    transform: none;`,
        `  }`,
        `}`
      ].join('\n');

      const spec: ScrollTimelineSpec = {
        id: `scroll-timeline-${scrollIdx}`,
        targetSelector: selector,
        type,
        axis,
        timelineName,
        viewInset,
        rangeStart,
        rangeEnd,
        cssRule,
        supportsFallbackCss
      };
      scrollTimelines.push(spec);

      motionCount += 1;
      motions.push({
        id: `motion-${motionCount}`,
        trigger: 'scroll-timeline',
        property: 'animation-timeline, transform, opacity',
        durationMs: 1000,
        easingCss: 'linear',
        bezierControlPoints: [0, 0, 1, 1],
        springApproximation: solveSpringFromCubicBezier([0, 0, 1, 1], 1000),
        cssRule
      });
    }
  }

  // Extract SVG Path Morphing specs from snapshot.svgPathsDetected
  let morphIdx = 0;
  for (const svgPath of snapshot.svgPathsDetected) {
    if (svgPath.morphTargetD && svgPath.morphTargetD !== svgPath.d) {
      morphIdx += 1;
      const morphSpec = buildSvgMorphSpec(
        svgPath.id || `morph-${morphIdx}`,
        svgPath.d,
        svgPath.morphTargetD
      );
      svgMorphs.push(morphSpec);

      const kfName = `morph_${morphSpec.id.replace(/[^a-zA-Z0-9_]/g, '_')}`;
      keyframes.push({
        name: kfName,
        durationMs: 800,
        easingCss: 'cubic-bezier(0.22, 1, 0.36, 1)',
        steps: {
          '0%': { d: `path('${morphSpec.interpolatedSteps[0]}')` },
          '100%': { d: `path('${morphSpec.interpolatedSteps[4]}')` }
        },
        cssKeyframeBlock: morphSpec.cssKeyframeAnimation
      });

      motionCount += 1;
      motions.push({
        id: `motion-${motionCount}`,
        trigger: 'svg-morph',
        property: 'd',
        durationMs: 800,
        easingCss: 'cubic-bezier(0.22, 1, 0.36, 1)',
        bezierControlPoints: [0.22, 1, 0.36, 1],
        springApproximation: solveSpringFromCubicBezier([0.22, 1, 0.36, 1], 800),
        cssRule: `animation: ${kfName} 800ms cubic-bezier(0.22, 1, 0.36, 1) both;`
      });
    }
  }

  if (motions.length === 0) {
    const preset = PRESET_MOTION_CURVES['snappyMicroInteraction']!;
    motions.push({
      id: 'motion-1',
      trigger: 'hover',
      property: 'transform, box-shadow, background-color',
      durationMs: preset.durationMs,
      easingCss: preset.easingCss,
      bezierControlPoints: preset.bezier,
      springApproximation: preset.spring,
      cssRule: `transition: transform, box-shadow, background-color ${preset.durationMs}ms ${preset.easingCss};`
    });
  }

  const reducedMotionCssFallback = [
    '@media (prefers-reduced-motion: reduce) {',
    '  *, *::before, *::after {',
    '    animation-duration: 0.01ms !important;',
    '    animation-iteration-count: 1 !important;',
    '    transition-duration: 0.01ms !important;',
    '    scroll-behavior: auto !important;',
    '  }',
    '}'
  ].join('\n');

  return {
    motions,
    keyframes,
    scrollTimelines,
    svgMorphs,
    reducedMotionCssFallback
  };
}
