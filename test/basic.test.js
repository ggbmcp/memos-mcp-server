#!/usr/bin/env node

import { existsSync, readFileSync } from 'fs';
import { join } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = join(__filename, '..');

console.log('Running basic package tests...\n');

let passed = 0;
let failed = 0;

function test(name, condition) {
  if (condition) {
    console.log(`✅ ${name}`);
    passed++;
  } else {
    console.log(`❌ ${name}`);
    failed++;
  }
}

// Test 1: Check package.json exists
test('package.json exists', existsSync(join(__dirname, '..', 'package.json')));

// Test 2: Check package.json is valid JSON
try {
  const packageJson = JSON.parse(readFileSync(join(__dirname, '..', 'package.json'), 'utf-8'));
  test('package.json is valid JSON', true);

  // Test 3: Check required fields
  test('package.json has name field', !!packageJson.name);
  test('package.json has version field', !!packageJson.version);
  test('package.json has bin field', !!packageJson.bin);
  test('package.json has main field', !!packageJson.main);

  // Test 4: Check bin field points to existing file
  if (packageJson.bin && packageJson.bin['memos-mcp-server']) {
    const binPath = join(__dirname, '..', packageJson.bin['memos-mcp-server']);
    test('bin file exists', existsSync(binPath));
  }
} catch (error) {
  test('package.json is valid JSON', false);
}

// Test 5: Check required directories exist
test('src directory exists', existsSync(join(__dirname, '..', 'src')));
test('bin directory exists', existsSync(join(__dirname, '..', 'bin')));

// Test 6: Check required files exist
test('README.md exists', existsSync(join(__dirname, '..', 'README.md')));
test('LICENSE exists', existsSync(join(__dirname, '..', 'LICENSE')));
test('.env.example exists', existsSync(join(__dirname, '..', '.env.example')));
test('claude-desktop-config.json exists', existsSync(join(__dirname, '..', 'claude-desktop-config.json')));

// Test 7: Check source files exist
test('src/index.js exists', existsSync(join(__dirname, '..', 'src', 'index.js')));
test('src/memos-client.js exists', existsSync(join(__dirname, '..', 'src', 'memos-client.js')));

console.log('\n' + '='.repeat(50));
console.log(`Results: ${passed} passed, ${failed} failed`);

if (failed > 0) {
  console.log('\n❌ Some tests failed. Please fix the issues before publishing.');
  process.exit(1);
} else {
  console.log('\n✅ All tests passed! Package is ready for publishing.');
  process.exit(0);
}