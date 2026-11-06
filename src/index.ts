#!/usr/bin/env node
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
import { createUi2VibeServer } from './server.js';

export * from './types/ui-domain.js';
export * from './capture/ui-reference-capturer.js';
export * from './tokens/design-token-extractor.js';
export * from './layout/layout-skeleton-decomposer.js';
export * from './motion/motion-physics-extractor.js';
export * from './synthesizer/vibe-component-synthesizer.js';
export * from './audit/ui-fidelity-auditor.js';
export * from './server.js';

export async function main(): Promise<void> {
  const server = createUi2VibeServer();
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

const currentPath = fileURLToPath(import.meta.url);
const entryPath = process.argv[1] ? resolve(process.argv[1]) : '';
if (currentPath === entryPath) {
  main().catch((err: unknown) => {
    process.stderr.write(`Fatal error in ui2vibe-mcp server: ${String(err)}\n`);
    process.exit(1);
  });
}
