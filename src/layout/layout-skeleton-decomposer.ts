import type {
  LayoutSkeleton,
  LayoutSkeletonNode,
  ResponsiveBreakpointRule,
  SemanticLandmarkTag,
  UiDomNode,
  UiReferenceSnapshot
} from '../types/ui-domain.js';

const BREAKPOINT_WIDTHS: Record<'sm' | 'md' | 'lg' | 'xl', number> = {
  sm: 640,
  md: 768,
  lg: 1024,
  xl: 1280
};

const VALID_SEMANTIC_TAGS = new Set<SemanticLandmarkTag>([
  'header',
  'nav',
  'main',
  'section',
  'article',
  'aside',
  'footer',
  'button',
  'a',
  'input',
  'form',
  'h1',
  'h2',
  'h3',
  'p',
  'span',
  'div'
]);

function parseNumericPx(val: string | undefined): number | undefined {
  if (!val) return undefined;
  const trimmed = val.trim();
  if (trimmed.endsWith('px')) {
    const n = parseFloat(trimmed.slice(0, -2));
    return Number.isNaN(n) ? undefined : n;
  }
  if (trimmed.endsWith('rem')) {
    const n = parseFloat(trimmed.slice(0, -3));
    return Number.isNaN(n) ? undefined : n * 16;
  }
  const plain = Number(trimmed);
  return Number.isNaN(plain) ? undefined : plain;
}

function inferSemanticTag(node: UiDomNode, isRoot: boolean): SemanticLandmarkTag {
  const lowerTag = node.tag.toLowerCase() as SemanticLandmarkTag;
  if (VALID_SEMANTIC_TAGS.has(lowerTag) && lowerTag !== 'div') {
    return lowerTag;
  }

  const roleAttr = node.attributes['role']?.toLowerCase();
  if (roleAttr === 'navigation') return 'nav';
  if (roleAttr === 'banner') return 'header';
  if (roleAttr === 'main') return 'main';
  if (roleAttr === 'complementary') return 'aside';
  if (roleAttr === 'contentinfo') return 'footer';
  if (roleAttr === 'button') return 'button';

  const joinedClasses = `${node.attributes['id'] ?? ''} ${node.classes.join(' ')}`.toLowerCase();
  if (/(?:^|[-_\s])(header|masthead|topbar)(?:$|[-_\s])/.test(joinedClasses)) return 'header';
  if (/(?:^|[-_\s])(nav|navbar|menubar)(?:$|[-_\s])/.test(joinedClasses)) return 'nav';
  if (/(?:^|[-_\s])(footer|bottom-bar)(?:$|[-_\s])/.test(joinedClasses)) return 'footer';
  if (/(?:^|[-_\s])(sidebar|aside|drawer)(?:$|[-_\s])/.test(joinedClasses)) return 'aside';
  if (/(?:^|[-_\s])(card|feature-card|tile|post|item)(?:$|[-_\s])/.test(joinedClasses)) return 'article';
  if (
    /(?:^|[-_\s])(btn|button|cta)(?:$|[-_\s])/.test(joinedClasses) ||
    node.attributes['onclick'] ||
    node.attributes['onClick']
  ) {
    return 'button';
  }
  if (/(?:^|[-_\s])(hero|section|panel)(?:$|[-_\s])/.test(joinedClasses)) {
    return 'section';
  }

  if (isRoot) {
    return 'section';
  }
  if (node.children.length === 0 && node.textContent.length > 0) {
    return 'p';
  }
  return 'div';
}

function isRedundantWrapper(node: UiDomNode): boolean {
  if (node.tag.toLowerCase() !== 'div') return false;
  if (node.children.length !== 1) return false;
  if (node.textContent.trim().length > 0) return false;
  if (node.attributes['role'] || node.attributes['aria-label']) return false;
  const inferred = inferSemanticTag(node, false);
  if (inferred !== 'div') return false;
  return true;
}

function extractResponsiveRules(computedStyles: Record<string, string>): ResponsiveBreakpointRule[] {
  const byBp = new Map<'sm' | 'md' | 'lg' | 'xl', Record<string, string>>();
  for (const [k, v] of Object.entries(computedStyles)) {
    const match = k.match(/^@media-(sm|md|lg|xl)-(.+)$/);
    if (match) {
      const bp = match[1] as 'sm' | 'md' | 'lg' | 'xl';
      const prop = match[2];
      if (prop) {
        const current = byBp.get(bp) ?? {};
        current[prop] = v;
        byBp.set(bp, current);
      }
    }
  }

  const rules: ResponsiveBreakpointRule[] = [];
  for (const [bp, decls] of byBp.entries()) {
    rules.push({
      breakpoint: bp,
      minWidthPx: BREAKPOINT_WIDTHS[bp],
      declarations: decls
    });
  }
  return rules.sort((a, b) => a.minWidthPx - b.minWidthPx);
}

export function decomposeLayoutSkeleton(snapshot: UiReferenceSnapshot): LayoutSkeleton {
  const landmarksUsed = new Set<SemanticLandmarkTag>();
  const allBreakpoints: ResponsiveBreakpointRule[] = [];
  let prunedWrapperCount = 0;

  function transformNode(rawNode: UiDomNode, isRoot: boolean): LayoutSkeletonNode {
    let current = rawNode;
    let collapsed = 0;
    const mergedStyles: Record<string, string> = { ...current.computedStyles };
    const mergedClasses = [...current.classes];

    while (isRedundantWrapper(current) && current.children[0]) {
      const child = current.children[0];
      collapsed += 1;
      prunedWrapperCount += 1;
      Object.assign(mergedStyles, child.computedStyles);
      mergedClasses.push(...child.classes);
      current = {
        ...child,
        classes: Array.from(new Set(mergedClasses)),
        computedStyles: mergedStyles
      };
    }

    const semanticTag = inferSemanticTag(current, isRoot);
    landmarksUsed.add(semanticTag);

    const display = current.computedStyles['display'] ?? 'block';
    let layoutMode: 'flex' | 'grid' | 'block' | 'inline-flex' = 'block';
    if (display === 'flex') layoutMode = 'flex';
    else if (display === 'inline-flex') layoutMode = 'inline-flex';
    else if (display === 'grid') layoutMode = 'grid';

    const flexDirRaw = current.computedStyles['flex-direction'];
    const flexDirection =
      flexDirRaw === 'column' ||
      flexDirRaw === 'row' ||
      flexDirRaw === 'row-reverse' ||
      flexDirRaw === 'column-reverse'
        ? flexDirRaw
        : layoutMode === 'flex' || layoutMode === 'inline-flex'
          ? 'row'
          : undefined;

    const gapPx = parseNumericPx(current.computedStyles['gap']) ?? 0;
    const maxWidthPx = parseNumericPx(current.computedStyles['max-width']);
    const isInteractive =
      semanticTag === 'button' ||
      semanticTag === 'a' ||
      semanticTag === 'input' ||
      Boolean(current.attributes['onClick'] || current.attributes['onclick']);

    const explicitMinW =
      parseNumericPx(current.computedStyles['min-width']) ??
      parseNumericPx(current.computedStyles['width']);
    const explicitMinH =
      parseNumericPx(current.computedStyles['min-height']) ??
      parseNumericPx(current.computedStyles['height']);

    const minWidthPx = explicitMinW ?? (isInteractive ? 44 : undefined);
    const minHeightPx = explicitMinH ?? (isInteractive ? 44 : undefined);

    const responsiveRules = extractResponsiveRules(current.computedStyles);
    allBreakpoints.push(...responsiveRules);

    const children = current.children.map((ch) => transformNode(ch, false));

    return {
      id: current.id,
      originalTag: rawNode.tag,
      semanticTag,
      collapsedWrapperCount: collapsed,
      layoutMode,
      flexDirection,
      gridTemplateColumns: current.computedStyles['grid-template-columns'],
      gapPx,
      maxWidthPx,
      minWidthPx,
      minHeightPx,
      aspectRatio: current.computedStyles['aspect-ratio'],
      isInteractive,
      textContent: current.textContent,
      ariaRole: current.attributes['role'],
      responsiveRules,
      children
    };
  }

  let rootSkeleton: LayoutSkeletonNode;
  if (snapshot.rootNodes.length === 0) {
    landmarksUsed.add('section');
    rootSkeleton = {
      id: 'node-root',
      originalTag: 'div',
      semanticTag: 'section',
      collapsedWrapperCount: 0,
      layoutMode: 'flex',
      flexDirection: 'column',
      gapPx: 16,
      isInteractive: false,
      textContent: '',
      responsiveRules: [],
      children: []
    };
  } else if (snapshot.rootNodes.length === 1 && snapshot.rootNodes[0]) {
    rootSkeleton = transformNode(snapshot.rootNodes[0], true);
  } else {
    landmarksUsed.add('main');
    rootSkeleton = {
      id: 'node-root',
      originalTag: 'div',
      semanticTag: 'main',
      collapsedWrapperCount: 0,
      layoutMode: 'flex',
      flexDirection: 'column',
      gapPx: 16,
      isInteractive: false,
      textContent: '',
      responsiveRules: [],
      children: snapshot.rootNodes.map((n) => transformNode(n, false))
    };
  }

  function countNodes(n: LayoutSkeletonNode): number {
    return 1 + n.children.reduce((acc, ch) => acc + countNodes(ch), 0);
  }

  const totalPrunedNodes = countNodes(rootSkeleton);

  return {
    root: rootSkeleton,
    totalOriginalNodes: snapshot.flatNodes.length,
    totalPrunedNodes,
    prunedWrapperCount,
    responsiveBreakpoints: allBreakpoints,
    semanticLandmarksUsed: Array.from(landmarksUsed)
  };
}
