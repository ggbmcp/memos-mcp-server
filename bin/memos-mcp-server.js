#!/usr/bin/env node

import { spawn } from 'child_process';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { readFileSync } from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Path to the main server file
const serverPath = join(__dirname, '..', 'src', 'index.js');

// Parse command line arguments
const args = process.argv.slice(2);

// Check for help flag
if (args.includes('--help') || args.includes('-h')) {
  console.log(`
Memos MCP Server

Usage:
  npx memos-mcp-server [options]

Options:
  --help, -h     Show this help message
  --version, -v  Show version information
  --env <path>   Path to .env file (default: .env)

Environment Variables:
  MEMOS_SERVER_URL    Memos server URL (e.g., http://localhost:5230)
  MEMOS_API_TOKEN     Memos API token
  DEFAULT_VISIBILITY  Default visibility for new memos (public/private)
  DEFAULT_RESOURCE_LIMIT Default resource limit for queries

Examples:
  npx @ggbmcp/memos-mcp-server
  MEMOS_SERVER_URL=http://localhost:5230 MEMOS_API_TOKEN=your_token npx @ggbmcp/memos-mcp-server

For more information, visit: https://github.com/ggbmcp/memos-mcp-server
  `);
  process.exit(0);
}

// Check for version flag
if (args.includes('--version') || args.includes('-v')) {
  try {
    const packageJsonPath = join(__dirname, '..', 'package.json');
    const packageJson = JSON.parse(readFileSync(packageJsonPath, 'utf-8'));
    console.log(`memos-mcp-server v${packageJson.version}`);
    process.exit(0);
  } catch (error) {
    console.error('Error reading package.json:', error.message);
    process.exit(1);
  }
}

// Check for custom env file
let envFile = '.env';
const envIndex = args.indexOf('--env');
if (envIndex !== -1 && args[envIndex + 1]) {
  envFile = args[envIndex + 1];
}

// Set environment variable for dotenv
process.env.DOTENV_CONFIG_PATH = envFile;

// Start the server
const serverProcess = spawn('node', [serverPath], {
  stdio: 'inherit',
  env: process.env
});

// Handle process termination
serverProcess.on('close', (code) => {
  process.exit(code);
});

serverProcess.on('error', (err) => {
  console.error('Failed to start server:', err);
  process.exit(1);
});

// Handle SIGINT (Ctrl+C)
process.on('SIGINT', () => {
  serverProcess.kill('SIGINT');
});