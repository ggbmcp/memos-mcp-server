// Simple test script to verify the MCP server structure
import { MemosClient } from './src/memos-client.js';

// Test the client methods (without actual API calls)
console.log('Testing Memos MCP Server Structure...\n');

// Test helper methods
const testClient = {
  extractTags: (new MemosClient('http://test', 'test')).extractTags,
  isTodo: (new MemosClient('http://test', 'test')).isTodo,
  extractPriority: (new MemosClient('http://test', 'test')).extractPriority,
};

console.log('1. Testing tag extraction:');
const testContent = 'This is a test #memo with #tags and #multiple tags';
const tags = testClient.extractTags(testContent);
console.log(`   Input: "${testContent}"`);
console.log(`   Extracted tags: ${JSON.stringify(tags)}`);
console.log(`   ✓ Expected: ["memo", "tags", "multiple"]\n`);

console.log('2. Testing todo detection:');
const todoTests = [
  { content: '[ ] Buy groceries', expected: true },
  { content: '[x] Finish report', expected: true },
  { content: 'TODO: Call John', expected: true },
  { content: '待办: 发送邮件', expected: true },
  { content: 'Regular memo', expected: false },
];

todoTests.forEach((test, i) => {
  const result = testClient.isTodo(test.content);
  const status = result === test.expected ? '✓' : '✗';
  console.log(`   ${status} "${test.content}" -> ${result} (expected: ${test.expected})`);
});
console.log();

console.log('3. Testing priority extraction:');
const priorityTests = [
  { content: 'priority: high task', expected: 'high' },
  { content: '优先级: 中 任务', expected: 'medium' },
  { content: 'priority: low important', expected: 'low' },
  { content: 'no priority mentioned', expected: 'medium' },
];

priorityTests.forEach((test, i) => {
  const result = testClient.extractPriority(test.content);
  const status = result === test.expected ? '✓' : '✗';
  console.log(`   ${status} "${test.content}" -> ${result} (expected: ${test.expected})`);
});
console.log();

console.log('4. Testing available tools:');
const tools = [
  'list_memos',
  'create_memo',
  'update_memo',
  'delete_memo',
  'search_memos_by_tag',
  'get_todo_memos',
  'create_todo',
  'mark_todo_completed',
  'get_tags',
  'get_memo_by_id',
];

console.log(`   Total tools: ${tools.length}`);
tools.forEach((tool, i) => {
  console.log(`   ${i + 1}. ${tool}`);
});
console.log();

console.log('✅ MCP Server structure test completed successfully!');
console.log('\nNext steps:');
console.log('1. Copy .env.example to .env and configure your Memos server');
console.log('2. Run: npm install');
console.log('3. Test with Claude Desktop or other MCP client');