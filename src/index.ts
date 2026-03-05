#!/usr/bin/env node

import { SharedMemoryServer } from './server.js';

async function main() {
  const contextPath = process.argv[2] || process.env.AI_CONTEXT_PATH;
  const server = new SharedMemoryServer(contextPath);
  await server.start();
}

main().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});
