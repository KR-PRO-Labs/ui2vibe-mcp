export type TargetUiFramework =
  | 'react-tailwind'
  | 'react-css-vars'
  | 'vanilla-css'
  | 'vue-tailwind'
  | 'svelte-css';

export type ColorSemanticRole =
  | 'background'
  | 'surface'
  | 'text-primary'
  | 'text-muted'
  | 'accent'
  | 'border'
  | 'glass';

export interface OklchColor {
  l: number;
  c: number;
  h: number;
  alpha: number;
}

export interface ColorToken {
  name: string;
  raw: string;
  hex: string;
  oklch: OklchColor;
  relativeLuminance: number;
  role: ColorSemanticRole;
  darkCounterpartHex: string;
  darkCounterpartOklch: OklchColor;
}

export interface TypographyToken {
  name: string;
  fontFamily: string;
  fontSizePx: number;
  fontSizeRem: string;
  lineHeight: number;
  letterSpacingEm: number;
  fontWeight: number;
}

export interface SpacingToken {
  name: string;
  rawPx: number;
  quantized8ptPx: number;
  rem: string;
  gridMultiplier: number;
}

export interface RadiusToken {
  name: string;
  px: number;
  cssValue: string;
}

export interface ElevationToken {
  name: string;
  boxShadow: string;
  backdropBlurPx: number;
  isGlassmorphism: boolean;
}

export interface DesignTokenSet {
  colors: ColorToken[];
  typography: TypographyToken[];
  spacing: SpacingToken[];
  radii: RadiusToken[];
  elevations: ElevationToken[];
  cssVariablesBlock: string;
}

export type PseudoStateType = 'hover' | 'focus-visible' | 'active' | 'dark' | 'disabled';

export interface PseudoStateHook {
  selector: string;
  state: PseudoStateType;
  declarations: Record<string, string>;
}

export interface UiDomNode {
  id: string;
  tag: string;
  classes: string[];
  attributes: Record<string, string>;
  inlineStyles: Record<string, string>;
  computedStyles: Record<string, string>;
  textContent: string;
  children: UiDomNode[];
}

export interface UiReferenceInput {
  markup: string;
  css?: string;
  sourceFrameworkHint?: 'html' | 'jsx' | 'vue' | 'svelte';
  componentName?: string;
}

export interface UiReferenceSnapshot {
  componentName: string;
  sourceFramework: 'html' | 'jsx' | 'vue' | 'svelte';
  rootNodes: UiDomNode[];
  flatNodes: UiDomNode[];
  rawCssRules: Record<string, Record<string, string>>;
  pseudoStateHooks: PseudoStateHook[];
  keyframesRaw: Record<string, Record<string, Record<string, string>>>;
  tailwindClassesDetected: string[];
}

export type SemanticLandmarkTag =
  | 'header'
  | 'nav'
  | 'main'
  | 'section'
  | 'article'
  | 'aside'
  | 'footer'
  | 'button'
  | 'a'
  | 'input'
  | 'form'
  | 'h1'
  | 'h2'
  | 'h3'
  | 'p'
  | 'span'
  | 'div';

export interface ResponsiveBreakpointRule {
  breakpoint: 'sm' | 'md' | 'lg' | 'xl';
  minWidthPx: number;
  declarations: Record<string, string>;
}

export interface LayoutSkeletonNode {
  id: string;
  originalTag: string;
  semanticTag: SemanticLandmarkTag;
  collapsedWrapperCount: number;
  layoutMode: 'flex' | 'grid' | 'block' | 'inline-flex';
  flexDirection?: 'row' | 'column' | 'row-reverse' | 'column-reverse';
  gridTemplateColumns?: string;
  gapPx: number;
  maxWidthPx?: number;
  minWidthPx?: number;
  minHeightPx?: number;
  aspectRatio?: string;
  isInteractive: boolean;
  textContent: string;
  ariaRole?: string;
  responsiveRules: ResponsiveBreakpointRule[];
  children: LayoutSkeletonNode[];
}

export interface LayoutSkeleton {
  root: LayoutSkeletonNode;
  totalOriginalNodes: number;
  totalPrunedNodes: number;
  prunedWrapperCount: number;
  responsiveBreakpoints: ResponsiveBreakpointRule[];
  semanticLandmarksUsed: SemanticLandmarkTag[];
}

export interface SpringApproximation {
  stiffness: number;
  damping: number;
  mass: number;
  dampingRatio: number;
  settlingTimeMs: number;
}

export interface MotionSpec {
  id: string;
  trigger: 'hover' | 'focus' | 'active' | 'mount' | 'scroll' | 'keyframe';
  property: string;
  durationMs: number;
  easingCss: string;
  bezierControlPoints: [number, number, number, number];
  springApproximation: SpringApproximation;
  cssRule: string;
}

export interface KeyframeAnimationSpec {
  name: string;
  durationMs: number;
  easingCss: string;
  steps: Record<string, Record<string, string>>;
  cssKeyframeBlock: string;
}

export interface MotionPhysicsReport {
  motions: MotionSpec[];
  keyframes: KeyframeAnimationSpec[];
  reducedMotionCssFallback: string;
}

export interface SynthesisOptions {
  targetFramework?: TargetUiFramework;
  componentName?: string;
  workspacePackageJson?: string;
  includeDarkTheme?: boolean;
}

export interface SynthesizedComponent {
  componentName: string;
  targetFramework: TargetUiFramework;
  themeCssVariables: string;
  tailwindConfigExtension: Record<string, unknown>;
  componentCode: string;
  zeroExternalDependencies: boolean;
  interactiveStatesIncluded: string[];
  reducedMotionGuardIncluded: boolean;
}

export interface ContrastPairAudit {
  foregroundToken: string;
  foregroundHex: string;
  backgroundToken: string;
  backgroundHex: string;
  contrastRatio: number;
  passesAA: boolean;
  passesAAA: boolean;
}

export interface TouchTargetAudit {
  nodeId: string;
  tag: string;
  widthPx: number;
  heightPx: number;
  passesMinimum44px: boolean;
}

export interface UiFidelityReport {
  fidelityScore: number;
  wcagContrastAudits: ContrastPairAudit[];
  allContrastPassesAA: boolean;
  touchTargetAudits: TouchTargetAudit[];
  allTouchTargetsPass: boolean;
  hasReducedMotionFallback: boolean;
  clsLayoutStable: boolean;
  zeroExternalDepsVerified: boolean;
  recommendations: string[];
}
