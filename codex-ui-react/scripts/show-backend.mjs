#!/usr/bin/env node
// Show which backend server is configured

import { readFileSync } from 'fs';
import { resolve } from 'path';

const envPath = resolve(process.cwd(), '.env');
let bridgePort = '3457';

try {
  const envContent = readFileSync(envPath, 'utf8');
  const match = envContent.match(/^BRIDGE_PORT=(\d+)/m);
  if (match) {
    bridgePort = match[1];
  }
} catch {
  // .env file doesn't exist, use default
}

if (bridgePort === '3458') {
  console.log('🔧 Using RUST backend server (port 3458)');
} else {
  console.log('📦 Using TYPESCRIPT backend server (port 3457)');
}
