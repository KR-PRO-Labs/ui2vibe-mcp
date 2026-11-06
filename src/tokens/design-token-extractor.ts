import type {
  ColorSemanticRole,
  ColorToken,
  DesignTokenSet,
  ElevationToken,
  OklchColor,
  RadiusToken,
  SpacingToken,
  TypographyToken,
  UiReferenceSnapshot
} from '../types/ui-domain.js';

interface RgbaColor {
  r: number;
  g: number;
  b: number;
  a: number;
}

const NAMED_COLORS: Record<string, string> = {
  white: '#ffffff',
  black: '#000000',
  slate: '#64748b',
  indigo: '#6366f1',
  blue: '#3b82f6',
  emerald: '#10b981',
  violet: '#7c3aed',
  red: '#ef4444',
  amber: '#f59e0b'
};

function clamp(val: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, val));
}

function toHexByte(n: number): string {
  return clamp(Math.round(n), 0, 255).toString(16).padStart(2, '0');
}

export function parseCssColorToRgba(raw: string): RgbaColor | null {
  const trimmed = raw.trim().toLowerCase();
  if (!trimmed || trimmed === 'transparent' || trimmed === 'inherit' || trimmed === 'currentcolor' || trimmed === 'none') {
    return null;
  }

  const namedHex = NAMED_COLORS[trimmed];
  const target = namedHex ?? trimmed;

  if (target.startsWith('#')) {
    const hex = target.slice(1);
    if (hex.length === 3) {
      const r = parseInt((hex[0] ?? '0') + (hex[0] ?? '0'), 16);
      const g = parseInt((hex[1] ?? '0') + (hex[1] ?? '0'), 16);
      const b = parseInt((hex[2] ?? '0') + (hex[2] ?? '0'), 16);
      return { r, g, b, a: 1 };
    }
    if (hex.length === 6 || hex.length === 8) {
      const r = parseInt(hex.slice(0, 2), 16);
      const g = parseInt(hex.slice(2, 4), 16);
      const b = parseInt(hex.slice(4, 6), 16);
      const a = hex.length === 8 ? Number((parseInt(hex.slice(6, 8), 16) / 255).toFixed(3)) : 1;
      if ([r, g, b].some((v) => Number.isNaN(v))) return null;
      return { r, g, b, a };
    }
    return null;
  }

  const rgbMatch = target.match(/^rgba?\(\s*([0-9.]+)\s*[, ]\s*([0-9.]+)\s*[, ]\s*([0-9.]+)(?:\s*[,/]\s*([0-9.]+%?))?\s*\)$/);
  if (rgbMatch) {
    const r = Number(rgbMatch[1]);
    const g = Number(rgbMatch[2]);
    const b = Number(rgbMatch[3]);
    let a = 1;
    if (rgbMatch[4] !== undefined) {
      const rawA = rgbMatch[4];
      a = rawA.endsWith('%') ? Number(rawA.slice(0, -1)) / 100 : Number(rawA);
    }
    return {
      r: clamp(Math.round(r), 0, 255),
      g: clamp(Math.round(g), 0, 255),
      b: clamp(Math.round(b), 0, 255),
      a: clamp(Number(a.toFixed(3)), 0, 1)
    };
  }

  const hslMatch = target.match(/^hsla?\(\s*([0-9.]+)(?:deg)?\s*[, ]\s*([0-9.]+)%\s*[, ]\s*([0-9.]+)%(?:\s*[,/]\s*([0-9.]+%?))?\s*\)$/);
  if (hslMatch) {
    const h = ((Number(hslMatch[1]) % 360) + 360) % 360;
    const s = clamp(Number(hslMatch[2]) / 100, 0, 1);
    const l = clamp(Number(hslMatch[3]) / 100, 0, 1);
    let a = 1;
    if (hslMatch[4] !== undefined) {
      const rawA = hslMatch[4];
      a = rawA.endsWith('%') ? Number(rawA.slice(0, -1)) / 100 : Number(rawA);
    }
    const c = (1 - Math.abs(2 * l - 1)) * s;
    const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
    const m = l - c / 2;
    let rPrime = 0;
    let gPrime = 0;
    let bPrime = 0;
    if (h < 60) [rPrime, gPrime, bPrime] = [c, x, 0];
    else if (h < 120) [rPrime, gPrime, bPrime] = [x, c, 0];
    else if (h < 180) [rPrime, gPrime, bPrime] = [0, c, x];
    else if (h < 240) [rPrime, gPrime, bPrime] = [0, x, c];
    else if (h < 300) [rPrime, gPrime, bPrime] = [x, 0, c];
    else [rPrime, gPrime, bPrime] = [c, 0, x];

    return {
      r: clamp(Math.round((rPrime + m) * 255), 0, 255),
      g: clamp(Math.round((gPrime + m) * 255), 0, 255),
      b: clamp(Math.round((bPrime + m) * 255), 0, 255),
      a: clamp(Number(a.toFixed(3)), 0, 1)
    };
  }

  const oklchMatch = target.match(
    /^oklch\(\s*([0-9.]+%?)\s+([0-9.]+)\s+([0-9.]+)(?:deg)?(?:\s*\/\s*([0-9.]+%?))?\s*\)$/
  );
  if (oklchMatch) {
    const rawL = oklchMatch[1] ?? '0';
    const l = rawL.endsWith('%') ? Number(rawL.slice(0, -1)) / 100 : Number(rawL);
    const c = Number(oklchMatch[2]);
    const h = Number(oklchMatch[3]);
    let a = 1;
    if (oklchMatch[4] !== undefined) {
      const rawA = oklchMatch[4];
      a = rawA.endsWith('%') ? Number(rawA.slice(0, -1)) / 100 : Number(rawA);
    }
    const hex = oklchToHex({
      l: clamp(l, 0, 1),
      c: clamp(c, 0, 0.4),
      h: ((h % 360) + 360) % 360,
      alpha: clamp(Number(a.toFixed(3)), 0, 1)
    });
    const parsedHex = parseCssColorToRgba(hex);
    if (parsedHex) {
      return { ...parsedHex, a: clamp(Number(a.toFixed(3)), 0, 1) };
    }
  }

  return null;
}

function extractColorCandidatesFromCssValue(rawVal: string): string[] {
  const direct = parseCssColorToRgba(rawVal);
  if (direct) return [rawVal.trim()];

  const matches = rawVal.match(
    /#[0-9a-fA-F]{3,8}\b|(?:rgba?|hsla?|oklch)\([^)]+\)/g
  );
  return matches ? matches.map((m) => m.trim()) : [];
}

export function rgbaToHex(rgba: RgbaColor): string {
  return `#${toHexByte(rgba.r)}${toHexByte(rgba.g)}${toHexByte(rgba.b)}`;
}

function srgbChannelToLinear(c255: number): number {
  const v = clamp(c255 / 255, 0, 1);
  return v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
}

function linearChannelToSrgb(lin: number): number {
  const v = clamp(lin, 0, 1);
  const encoded = v <= 0.0031308 ? 12.92 * v : 1.055 * Math.pow(v, 1 / 2.4) - 0.055;
  return clamp(Math.round(encoded * 255), 0, 255);
}

export function computeRelativeLuminance(colorInput: string): number {
  const rgba = parseCssColorToRgba(colorInput);
  if (!rgba) return 0;
  const rLin = srgbChannelToLinear(rgba.r);
  const gLin = srgbChannelToLinear(rgba.g);
  const bLin = srgbChannelToLinear(rgba.b);
  return Number((0.2126 * rLin + 0.7152 * gLin + 0.0722 * bLin).toFixed(4));
}

export function computeContrastRatio(hexA: string, hexB: string): number {
  const lumA = computeRelativeLuminance(hexA);
  const lumB = computeRelativeLuminance(hexB);
  const lighter = Math.max(lumA, lumB);
  const darker = Math.min(lumA, lumB);
  return Number(((lighter + 0.05) / (darker + 0.05)).toFixed(2));
}

export function hexToOklch(colorInput: string): OklchColor {
  const rgba = parseCssColorToRgba(colorInput) ?? { r: 0, g: 0, b: 0, a: 1 };
  const r = srgbChannelToLinear(rgba.r);
  const g = srgbChannelToLinear(rgba.g);
  const b = srgbChannelToLinear(rgba.b);

  const l = 0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b;
  const m = 0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b;
  const s = 0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b;

  const l_ = Math.cbrt(l);
  const m_ = Math.cbrt(m);
  const s_ = Math.cbrt(s);

  const L = 0.2104542553 * l_ + 0.793617785 * m_ - 0.0040720468 * s_;
  const A = 1.9779984951 * l_ - 2.428592205 * m_ + 0.4505937099 * s_;
  const B = 0.0259040371 * l_ + 0.7827717662 * m_ - 0.808675766 * s_;

  const C = Math.sqrt(A * A + B * B);
  let H = (Math.atan2(B, A) * 180) / Math.PI;
  if (H < 0) H += 360;

  return {
    l: Number(clamp(L, 0, 1).toFixed(4)),
    c: Number(clamp(C, 0, 0.4).toFixed(4)),
    h: C < 0.0001 ? 0 : Number(H.toFixed(2)),
    alpha: rgba.a
  };
}

export function oklchToHex(oklch: OklchColor): string {
  const hRad = (oklch.h * Math.PI) / 180;
  const A = oklch.c * Math.cos(hRad);
  const B = oklch.c * Math.sin(hRad);

  const l_ = oklch.l + 0.3963377774 * A + 0.2158037573 * B;
  const m_ = oklch.l - 0.1055613458 * A - 0.0638541728 * B;
  const s_ = oklch.l - 0.0894841775 * A - 1.291485548 * B;

  const l = l_ * l_ * l_;
  const m = m_ * m_ * m_;
  const s = s_ * s_ * s_;

  const rLin = +4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s;
  const gLin = -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s;
  const bLin = -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s;

  return rgbaToHex({
    r: linearChannelToSrgb(rLin),
    g: linearChannelToSrgb(gLin),
    b: linearChannelToSrgb(bLin),
    a: oklch.alpha
  });
}

export function synthesizeDarkCounterpart(oklch: OklchColor, role: ColorSemanticRole): OklchColor {
  if (role === 'background') {
    return {
      l: oklch.l > 0.5 ? 0.16 : 0.96,
      c: Number(Math.min(oklch.c, 0.03).toFixed(4)),
      h: oklch.h,
      alpha: oklch.alpha
    };
  }
  if (role === 'surface' || role === 'glass') {
    return {
      l: oklch.l > 0.5 ? 0.22 : 0.92,
      c: Number(Math.min(oklch.c, 0.04).toFixed(4)),
      h: oklch.h,
      alpha: oklch.alpha
    };
  }
  if (role === 'text-primary') {
    return {
      l: oklch.l < 0.5 ? 0.95 : 0.18,
      c: Number(Math.min(oklch.c, 0.02).toFixed(4)),
      h: oklch.h,
      alpha: oklch.alpha
    };
  }
  if (role === 'text-muted') {
    return {
      l: oklch.l < 0.5 ? 0.74 : 0.42,
      c: Number(Math.min(oklch.c, 0.03).toFixed(4)),
      h: oklch.h,
      alpha: oklch.alpha
    };
  }
  if (role === 'border') {
    return {
      l: oklch.l > 0.5 ? 0.3 : 0.85,
      c: Number(Math.min(oklch.c, 0.03).toFixed(4)),
      h: oklch.h,
      alpha: oklch.alpha
    };
  }
  // accent
  return {
    l: Number(clamp(oklch.l < 0.65 ? oklch.l + 0.12 : oklch.l - 0.08, 0.55, 0.82).toFixed(4)),
    c: Number(clamp(oklch.c * 1.05, 0.08, 0.28).toFixed(4)),
    h: oklch.h,
    alpha: oklch.alpha
  };
}

export function quantizeTo8ptGrid(rawPx: number): SpacingToken {
  const safePx = Math.max(0, rawPx);
  let quantized: number;
  if (safePx === 0) {
    quantized = 0;
  } else if (safePx <= 6) {
    quantized = 4;
  } else {
    quantized = Math.max(8, Math.round(safePx / 8) * 8);
  }
  const remVal = Number((quantized / 16).toFixed(4));
  const multiplier = Number((quantized / 8).toFixed(2));
  return {
    name: `space-${quantized}`,
    rawPx: safePx,
    quantized8ptPx: quantized,
    rem: `${remVal}rem`,
    gridMultiplier: multiplier
  };
}

function parsePxValue(cssVal: string | undefined): number | null {
  if (!cssVal) return null;
  const trimmed = cssVal.trim();
  if (trimmed.endsWith('px')) {
    const n = parseFloat(trimmed.slice(0, -2));
    return Number.isNaN(n) ? null : n;
  }
  if (trimmed.endsWith('rem')) {
    const n = parseFloat(trimmed.slice(0, -3));
    return Number.isNaN(n) ? null : n * 16;
  }
  const plain = Number(trimmed);
  return Number.isNaN(plain) ? null : plain;
}

function classifyColorRole(
  propName: string,
  oklch: OklchColor,
  hasBackdropFilter: boolean
): ColorSemanticRole {
  if (hasBackdropFilter && oklch.alpha < 1 && propName.includes('background')) {
    return 'glass';
  }
  if (propName.includes('border') || propName.includes('outline')) {
    return hasBackdropFilter && oklch.alpha < 1 ? 'glass' : 'border';
  }
  if (propName === 'color') {
    return oklch.c < 0.05 && oklch.l > 0.45 && oklch.l < 0.75 ? 'text-muted' : 'text-primary';
  }
  if (oklch.c >= 0.09) {
    return 'accent';
  }
  if (propName.includes('background')) {
    return oklch.l > 0.93 || oklch.l < 0.18 ? 'background' : 'surface';
  }
  return 'surface';
}

export function extractDesignTokens(snapshot: UiReferenceSnapshot): DesignTokenSet {
  const colorByRoleAndHex = new Map<string, ColorToken>();
  const spacingMap = new Map<number, SpacingToken>();
  const radiiMap = new Map<number, RadiusToken>();
  const typographyMap = new Map<string, TypographyToken>();
  const elevationList: ElevationToken[] = [];

  const allStyleMaps: Record<string, string>[] = [
    ...snapshot.flatNodes.map((n) => n.computedStyles),
    ...Object.values(snapshot.rawCssRules),
    ...snapshot.pseudoStateHooks.map((h) => h.declarations)
  ];

  let colorIndex = 0;
  let elevationIndex = 0;

  for (const styles of allStyleMaps) {
    const hasBackdrop = Boolean(styles['backdrop-filter'] || styles['-webkit-backdrop-filter']);

    for (const [prop, val] of Object.entries(styles)) {
      if (
        prop === 'color' ||
        prop === 'background-color' ||
        prop === 'background' ||
        prop === 'border-color' ||
        prop === 'border' ||
        prop === 'outline-color' ||
        prop === 'outline'
      ) {
        const candidates = extractColorCandidatesFromCssValue(val);
        for (const candidate of candidates) {
          const rgba = parseCssColorToRgba(candidate);
          if (rgba) {
            const hex = rgbaToHex(rgba);
            const oklch = hexToOklch(candidate);
            const role = classifyColorRole(prop, oklch, hasBackdrop);
            const dedupeKey = `${role}:${hex}`;
            if (!colorByRoleAndHex.has(dedupeKey)) {
              colorIndex += 1;
              const darkOklch = synthesizeDarkCounterpart(oklch, role);
              const darkHex = oklchToHex(darkOklch);
              colorByRoleAndHex.set(dedupeKey, {
                name: `color-${role}-${colorIndex}`,
                raw: candidate,
                hex,
                oklch,
                relativeLuminance: computeRelativeLuminance(hex),
                role,
                darkCounterpartHex: darkHex,
                darkCounterpartOklch: darkOklch
              });
            }
          }
        }
      }

      if (
        prop === 'padding' ||
        prop === 'padding-left' ||
        prop === 'padding-right' ||
        prop === 'padding-top' ||
        prop === 'padding-bottom' ||
        prop === 'margin' ||
        prop === 'gap' ||
        prop === 'row-gap' ||
        prop === 'column-gap'
      ) {
        for (const token of val.split(/\s+/)) {
          const px = parsePxValue(token);
          if (px !== null && px > 0) {
            const sp = quantizeTo8ptGrid(px);
            if (!spacingMap.has(sp.quantized8ptPx)) {
              spacingMap.set(sp.quantized8ptPx, sp);
            }
          }
        }
      }

      if (prop === 'border-radius') {
        const px = parsePxValue(val);
        if (px !== null) {
          const roundedPx = Math.round(px);
          if (!radiiMap.has(roundedPx)) {
            radiiMap.set(roundedPx, {
              name: roundedPx >= 999 ? 'radius-pill' : `radius-${roundedPx}`,
              px: roundedPx,
              cssValue: `${roundedPx}px`
            });
          }
        }
      }

      if (prop === 'box-shadow' || prop === 'backdrop-filter') {
        const boxShadow = styles['box-shadow'] ?? '0 4px 12px rgba(0, 0, 0, 0.08)';
        const blurMatch = (styles['backdrop-filter'] ?? '').match(/blur\(([0-9.]+)px\)/);
        const blurPx = blurMatch?.[1] ? Number(blurMatch[1]) : 0;
        const exists = elevationList.some(
          (e) => e.boxShadow === boxShadow && e.backdropBlurPx === blurPx
        );
        if (!exists) {
          elevationIndex += 1;
          elevationList.push({
            name: `elevation-${elevationIndex}`,
            boxShadow,
            backdropBlurPx: blurPx,
            isGlassmorphism: blurPx > 0
          });
        }
      }
    }

    if (styles['font-size'] || styles['font-family'] || styles['font-weight']) {
      const fontSizePx = parsePxValue(styles['font-size']) ?? 16;
      const fontFamily = styles['font-family'] ?? 'Inter, system-ui, -apple-system, sans-serif';
      const fontWeight = Number(styles['font-weight'] ?? 400) || 400;
      const lineHeightRaw = styles['line-height'];
      let lineHeight = 1.5;
      if (lineHeightRaw) {
        const lhPx = parsePxValue(lineHeightRaw);
        lineHeight = lhPx && lhPx > 4 ? Number((lhPx / fontSizePx).toFixed(2)) : Number(lineHeightRaw) || 1.5;
      }
      const key = `${fontSizePx}-${fontWeight}`;
      if (!typographyMap.has(key)) {
        typographyMap.set(key, {
          name: `type-${Math.round(fontSizePx)}-${fontWeight}`,
          fontFamily,
          fontSizePx,
          fontSizeRem: `${Number((fontSizePx / 16).toFixed(4))}rem`,
          lineHeight,
          letterSpacingEm: fontSizePx >= 24 ? -0.02 : 0,
          fontWeight
        });
      }
    }
  }

  // Ensure accessible baseline tokens exist even for minimal snippets
  const colors = Array.from(colorByRoleAndHex.values());
  if (!colors.some((c) => c.role === 'background' || c.role === 'surface')) {
    const bgOklch = hexToOklch('#ffffff');
    const darkBg = synthesizeDarkCounterpart(bgOklch, 'background');
    colors.unshift({
      name: 'color-background-default',
      raw: '#ffffff',
      hex: '#ffffff',
      oklch: bgOklch,
      relativeLuminance: computeRelativeLuminance('#ffffff'),
      role: 'background',
      darkCounterpartHex: oklchToHex(darkBg),
      darkCounterpartOklch: darkBg
    });
  }
  if (!colors.some((c) => c.role === 'text-primary')) {
    const fgOklch = hexToOklch('#0f172a');
    const darkFg = synthesizeDarkCounterpart(fgOklch, 'text-primary');
    colors.push({
      name: 'color-text-primary-default',
      raw: '#0f172a',
      hex: '#0f172a',
      oklch: fgOklch,
      relativeLuminance: computeRelativeLuminance('#0f172a'),
      role: 'text-primary',
      darkCounterpartHex: oklchToHex(darkFg),
      darkCounterpartOklch: darkFg
    });
  }
  if (!colors.some((c) => c.role === 'accent')) {
    const accOklch = hexToOklch('#4f46e5');
    const darkAcc = synthesizeDarkCounterpart(accOklch, 'accent');
    colors.push({
      name: 'color-accent-default',
      raw: '#4f46e5',
      hex: '#4f46e5',
      oklch: accOklch,
      relativeLuminance: computeRelativeLuminance('#4f46e5'),
      role: 'accent',
      darkCounterpartHex: oklchToHex(darkAcc),
      darkCounterpartOklch: darkAcc
    });
  }

  if (spacingMap.size === 0) {
    spacingMap.set(16, quantizeTo8ptGrid(16));
  }
  if (radiiMap.size === 0) {
    radiiMap.set(12, { name: 'radius-12', px: 12, cssValue: '12px' });
  }
  if (typographyMap.size === 0) {
    typographyMap.set('16-400', {
      name: 'type-16-400',
      fontFamily: 'Inter, system-ui, -apple-system, sans-serif',
      fontSizePx: 16,
      fontSizeRem: '1rem',
      lineHeight: 1.5,
      letterSpacingEm: 0,
      fontWeight: 400
    });
  }

  const spacing = Array.from(spacingMap.values()).sort((a, b) => a.quantized8ptPx - b.quantized8ptPx);
  const radii = Array.from(radiiMap.values()).sort((a, b) => a.px - b.px);
  const typography = Array.from(typographyMap.values()).sort((a, b) => a.fontSizePx - b.fontSizePx);

  const rootVars: string[] = [];
  const darkVars: string[] = [];
  for (const c of colors) {
    rootVars.push(
      `  --${c.name}: ${c.hex}; /* oklch(${c.oklch.l} ${c.oklch.c} ${c.oklch.h}) */`
    );
    darkVars.push(
      `  --${c.name}: ${c.darkCounterpartHex}; /* oklch(${c.darkCounterpartOklch.l} ${c.darkCounterpartOklch.c} ${c.darkCounterpartOklch.h}) */`
    );
  }
  for (const sp of spacing) {
    rootVars.push(`  --${sp.name}: ${sp.rem}; /* ${sp.quantized8ptPx}px */`);
  }
  for (const r of radii) {
    rootVars.push(`  --${r.name}: ${r.cssValue};`);
  }

  const cssVariablesBlock = [
    ':root {',
    ...rootVars,
    '}',
    '',
    '.dark, [data-theme="dark"] {',
    ...darkVars,
    '}'
  ].join('\n');

  return {
    colors,
    typography,
    spacing,
    radii,
    elevations: elevationList,
    cssVariablesBlock
  };
}
