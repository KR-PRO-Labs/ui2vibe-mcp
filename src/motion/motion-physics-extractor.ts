import type {
  KeyframeAnimationSpec,
  MotionPhysicsReport,
  MotionSpec,
  SpringApproximation,
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

export function extractMotionPhysics(snapshot: UiReferenceSnapshot): MotionPhysicsReport {
  const motions: MotionSpec[] = [];
  const keyframes: KeyframeAnimationSpec[] = [];
  let motionCount = 0;

  const inspectDeclarations = (
    decls: Record<string, string>,
    trigger: MotionSpec['trigger']
  ): void => {
    const transitionShorthand = decls['transition'];
    const transitionProp = decls['transition-property'];
    const transitionDuration = decls['transition-duration'];
    const transitionEasing = decls['transition-timing-function'];
    const hasTransform = Boolean(decls['transform']);

    if (transitionShorthand || transitionProp || transitionDuration || hasTransform) {
      motionCount += 1;
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
    const cssKeyframeBlock = `@keyframes ${kfName} {\n${stepLines.join('\n')}\n}`;
    keyframes.push({
      name: kfName,
      durationMs: 400,
      easingCss: 'cubic-bezier(0.16, 1, 0.3, 1)',
      steps,
      cssKeyframeBlock
    });

    motionCount += 1;
    const bezier: [number, number, number, number] = [0.16, 1, 0.3, 1];
    motions.push({
      id: `motion-${motionCount}`,
      trigger: 'keyframe',
      property: kfName,
      durationMs: 400,
      easingCss: 'cubic-bezier(0.16, 1, 0.3, 1)',
      bezierControlPoints: bezier,
      springApproximation: solveSpringFromCubicBezier(bezier, 400),
      cssRule: `animation: ${kfName} 400ms cubic-bezier(0.16, 1, 0.3, 1) both;`
    });
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
    reducedMotionCssFallback
  };
}
