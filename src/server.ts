import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import {
  CallToolRequestSchema,
  ListResourcesRequestSchema,
  ListToolsRequestSchema,
  ReadResourceRequestSchema
} from '@modelcontextprotocol/sdk/types.js';
import { z } from 'zod';
import { auditUiFidelity } from './audit/ui-fidelity-auditor.js';
import { captureUiReference } from './capture/ui-reference-capturer.js';
import { decomposeLayoutSkeleton } from './layout/layout-skeleton-decomposer.js';
import { extractMotionPhysics, PRESET_MOTION_CURVES } from './motion/motion-physics-extractor.js';
import { synthesizeVibeComponent } from './synthesizer/vibe-component-synthesizer.js';
import { extractDesignTokens } from './tokens/design-token-extractor.js';
import type { TargetUiFramework } from './types/ui-domain.js';

const ReferenceInputSchema = z.object({
  markup: z.string().min(1, 'Markup snippet (HTML/JSX/Vue/Svelte) is required'),
  css: z.string().optional(),
  sourceFrameworkHint: z.enum(['html', 'jsx', 'vue', 'svelte']).optional(),
  componentName: z.string().optional()
});

const SynthesizeInputSchema = ReferenceInputSchema.extend({
  targetFramework: z
    .enum(['react-tailwind', 'react-css-vars', 'vanilla-css', 'vue-tailwind', 'svelte-css'])
    .optional(),
  workspacePackageJson: z.string().optional(),
  includeDarkTheme: z.boolean().optional()
});

export const UI_ABSORPTION_WORKFLOW_GUIDE = `# UI2Vibe Absorption Workflow Guide

1. **Capture (\`capture_ui_reference\`)**: Feed any reference HTML/JSX/Vue snippet, SVG markup, and CSS rules into the normalizer to inspect DOM hierarchy, container queries (\`@container\`), subgrid declarations, SVG paths, and pseudo-state hooks (\`:hover\`, \`:focus-visible\`, \`:active\`, dark mode).
2. **Tokenize (\`extract_design_tokens\`)**: Convert sRGB/Hex/HSL colors into perceptual OKLCH space, auto-synthesize dark mode counterparts, and quantize spacing to an 8pt grid.
3. **Decompose (\`decompose_layout_skeleton\`)**: Collapse redundant wrapper \`div\` chains into semantic HTML5 landmarks (\`header\`, \`nav\`, \`main\`, \`section\`, \`article\`, \`aside\`, \`footer\`), resolving container query boundaries and CSS Subgrid axes.
4. **Extract Physics (\`extract_motion_physics\`)**: Solve physical harmonic oscillator spring parameters (\`stiffness\`, \`damping\`, \`mass\`) from \`cubic-bezier\` transitions, extract scroll-driven timelines (\`animation-timeline: view()\`), and synthesize SVG path morphing (\`d: path(...)\`) with normalized cubic bezier commands.
5. **Synthesize (\`synthesize_vibe_component\`)**: Emit a zero-dependency component for \`react-tailwind\`, \`react-css-vars\`, \`vanilla-css\`, \`vue-tailwind\`, or \`svelte-css\` with container query classes and scroll timeline fallbacks.
6. **Audit (\`audit_ui_fidelity\`)**: Verify WCAG 2.1 AA/AAA contrast ratios, >=44x44px touch targets, \`prefers-reduced-motion\` fallbacks, \`@supports\` scroll-timeline fallbacks, and CLS layout stability.
`;

export function executeUi2VibeTool(
  toolName: string,
  rawArgs: unknown
): Record<string, unknown> {
  switch (toolName) {
    case 'capture_ui_reference': {
      const parsed = ReferenceInputSchema.parse(rawArgs);
      const snapshot = captureUiReference(parsed);
      return { snapshot };
    }
    case 'extract_design_tokens': {
      const parsed = ReferenceInputSchema.parse(rawArgs);
      const snapshot = captureUiReference(parsed);
      const tokens = extractDesignTokens(snapshot);
      return { tokens };
    }
    case 'decompose_layout_skeleton': {
      const parsed = ReferenceInputSchema.parse(rawArgs);
      const snapshot = captureUiReference(parsed);
      const layout = decomposeLayoutSkeleton(snapshot);
      return { layout };
    }
    case 'extract_motion_physics': {
      const parsed = ReferenceInputSchema.parse(rawArgs);
      const snapshot = captureUiReference(parsed);
      const motion = extractMotionPhysics(snapshot);
      return { motion };
    }
    case 'synthesize_vibe_component': {
      const parsed = SynthesizeInputSchema.parse(rawArgs);
      const snapshot = captureUiReference(parsed);
      const tokens = extractDesignTokens(snapshot);
      const layout = decomposeLayoutSkeleton(snapshot);
      const motion = extractMotionPhysics(snapshot);
      const synthesized = synthesizeVibeComponent(snapshot, tokens, layout, motion, {
        targetFramework: parsed.targetFramework as TargetUiFramework | undefined,
        componentName: parsed.componentName,
        workspacePackageJson: parsed.workspacePackageJson,
        includeDarkTheme: parsed.includeDarkTheme
      });
      return { synthesized, tokens, layout, motion };
    }
    case 'audit_ui_fidelity': {
      const parsed = SynthesizeInputSchema.parse(rawArgs);
      const snapshot = captureUiReference(parsed);
      const tokens = extractDesignTokens(snapshot);
      const layout = decomposeLayoutSkeleton(snapshot);
      const motion = extractMotionPhysics(snapshot);
      const synthesized = synthesizeVibeComponent(snapshot, tokens, layout, motion, {
        targetFramework: parsed.targetFramework as TargetUiFramework | undefined,
        componentName: parsed.componentName,
        workspacePackageJson: parsed.workspacePackageJson,
        includeDarkTheme: parsed.includeDarkTheme
      });
      const audit = auditUiFidelity(tokens, layout, motion, synthesized);
      return { audit, synthesized };
    }
    default:
      throw new Error(`Unknown tool: ${toolName}`);
  }
}

export function readUi2VibeResource(uri: string): { mimeType: string; text: string } {
  if (uri === 'ui2vibe://presets/motion-curves') {
    return {
      mimeType: 'application/json',
      text: JSON.stringify(PRESET_MOTION_CURVES, null, 2)
    };
  }
  if (uri === 'ui2vibe://guide/ui-absorption-workflow') {
    return {
      mimeType: 'text/markdown',
      text: UI_ABSORPTION_WORKFLOW_GUIDE
    };
  }
  throw new Error(`Unknown resource URI: ${uri}`);
}

export function createUi2VibeServer(): Server {
  const server = new Server(
    {
      name: '@kr-pro-labs/ui2vibe-mcp',
      version: '1.0.0'
    },
    {
      capabilities: {
        tools: {},
        resources: {}
      }
    }
  );

  server.setRequestHandler(ListToolsRequestSchema, async () => ({
    tools: [
      {
        name: 'capture_ui_reference',
        description:
          'Normalize HTML/JSX/Vue/Svelte markup, inline styles, CSS rules, and Tailwind utility classes into a structured UiReferenceSnapshot with pseudo-state hooks.',
        inputSchema: {
          type: 'object',
          properties: {
            markup: { type: 'string', description: 'HTML, JSX, Vue, or Svelte markup snippet' },
            css: { type: 'string', description: 'Optional stylesheet or CSS rules' },
            sourceFrameworkHint: {
              type: 'string',
              enum: ['html', 'jsx', 'vue', 'svelte']
            },
            componentName: { type: 'string' }
          },
          required: ['markup']
        }
      },
      {
        name: 'extract_design_tokens',
        description:
          'Extract perceptual OKLCH color tokens, synthesized dark-mode counterparts, 8pt grid spacing tokens, typography scales, border radii, and glassmorphism elevations.',
        inputSchema: {
          type: 'object',
          properties: {
            markup: { type: 'string' },
            css: { type: 'string' },
            componentName: { type: 'string' }
          },
          required: ['markup']
        }
      },
      {
        name: 'decompose_layout_skeleton',
        description:
          'Prune redundant wrapper div chains (div-soup) into semantic HTML5 landmarks and infer Flex/Grid axes and responsive breakpoints.',
        inputSchema: {
          type: 'object',
          properties: {
            markup: { type: 'string' },
            css: { type: 'string' }
          },
          required: ['markup']
        }
      },
      {
        name: 'extract_motion_physics',
        description:
          'Extract CSS transitions, cubic-bezier curves, and @keyframes, solving physical spring parameters (stiffness, damping, mass, settlingTimeMs).',
        inputSchema: {
          type: 'object',
          properties: {
            markup: { type: 'string' },
            css: { type: 'string' }
          },
          required: ['markup']
        }
      },
      {
        name: 'synthesize_vibe_component',
        description:
          'Synthesize a zero-dependency, accessible UI component for react-tailwind, react-css-vars, vanilla-css, vue-tailwind, or svelte-css with CSS Custom Properties.',
        inputSchema: {
          type: 'object',
          properties: {
            markup: { type: 'string' },
            css: { type: 'string' },
            componentName: { type: 'string' },
            targetFramework: {
              type: 'string',
              enum: ['react-tailwind', 'react-css-vars', 'vanilla-css', 'vue-tailwind', 'svelte-css']
            },
            workspacePackageJson: { type: 'string' }
          },
          required: ['markup']
        }
      },
      {
        name: 'audit_ui_fidelity',
        description:
          'Audit WCAG 2.1 AA/AAA contrast ratios, >=44x44px touch targets, prefers-reduced-motion guardrails, CLS stability, and overall UI fidelity score (0-100).',
        inputSchema: {
          type: 'object',
          properties: {
            markup: { type: 'string' },
            css: { type: 'string' },
            componentName: { type: 'string' },
            targetFramework: {
              type: 'string',
              enum: ['react-tailwind', 'react-css-vars', 'vanilla-css', 'vue-tailwind', 'svelte-css']
            }
          },
          required: ['markup']
        }
      }
    ]
  }));

  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name, arguments: args } = request.params;
    const output = executeUi2VibeTool(name, args ?? {});
    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify(output, null, 2)
        }
      ]
    };
  });

  server.setRequestHandler(ListResourcesRequestSchema, async () => ({
    resources: [
      {
        uri: 'ui2vibe://presets/motion-curves',
        name: 'UI2Vibe Physical Motion & Spring Presets',
        mimeType: 'application/json',
        description: 'Physical spring and cubic-bezier reference curves for UI micro-interactions.'
      },
      {
        uri: 'ui2vibe://guide/ui-absorption-workflow',
        name: 'UI2Vibe 6-Stage UI Absorption Workflow Guide',
        mimeType: 'text/markdown',
        description: 'End-to-end guide for absorbing reference UI designs into host applications.'
      }
    ]
  }));

  server.setRequestHandler(ReadResourceRequestSchema, async (request) => {
    const resource = readUi2VibeResource(request.params.uri);
    return {
      contents: [
        {
          uri: request.params.uri,
          mimeType: resource.mimeType,
          text: resource.text
        }
      ]
    };
  });

  return server;
}
