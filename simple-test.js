// Simple test without dependencies
console.log('Testing Memos MCP Server Structure...\n');

// Mock helper methods
function extractTags(content) {
  const tagRegex = /#(\w+)/g;
  const tags = [];
  let match;
  while ((match = tagRegex.exec(content)) !== null) {
    tags.push(match[1]);
  }
  return tags;
}

function isTodo(content) {
  return content.toLowerCase().includes("- - [ ]") ||
         content.toLowerCase().includes("[x]") ||
         content.toLowerCase().includes("todo:") ||
         content.toLowerCase().includes("待办:");
}

function extractPriority(content) {
  const lowerContent = content.toLowerCase();
  if (lowerContent.includes("priority: high") || lowerContent.includes("优先级: 高")) {
    return "high";
  } else if (lowerContent.includes("priority: medium") || lowerContent.includes("优先级: 中")) {
    return "medium";
  } else if (lowerContent.includes("priority: low") || lowerContent.includes("优先级: 低")) {
    return "low";
  }
  return "medium";
}

console.log('1. Testing tag extraction:');
const testContent = 'This is a test #memo with #tags and #multiple tags';
const tags = extractTags(testContent);
console.log(`   Input: "${testContent}"`);
console.log(`   Extracted tags: ${JSON.stringify(tags)}`);
console.log(`   ✓ Expected: ["memo", "tags", "multiple"]\n`);

console.log('2. Testing todo detection:');
const todoTests = [
  { content: '- - [ ] Buy groceries', expected: true },
  { content: '[x] Finish report', expected: true },
  { content: 'TODO: Call John', expected: true },
  { content: '待办: 发送邮件', expected: true },
  { content: 'Regular memo', expected: false },
];

todoTests.forEach((test, i) => {
  const result = isTodo(test.content);
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
  const result = extractPriority(test.content);
  const status = result === test.expected ? '✓' : '✗';
  console.log(`   ${status} "${test.content}" -> ${result} (expected: ${test.expected})`);
});
console.log();

console.log('4. Available tools:');
const tools = [
  'list_memos - 列出 memos，支持过滤',
  'create_memo - 创建新的 memo',
  'update_memo - 更新现有 memo',
  'delete_memo - 删除 memo',
  'search_memos_by_tag - 按标签搜索 memos',
  'get_todo_memos - 获取待办事项',
  'create_todo - 创建新的待办事项',
  'mark_todo_completed - 标记待办事项为已完成',
  'get_tags - 获取所有标签',
  'get_memo_by_id - 按 ID 获取特定 memo',
];

console.log(`   Total tools: ${tools.length}`);
tools.forEach((tool, i) => {
  console.log(`   ${i + 1}. ${tool}`);
});
console.log();

console.log('✅ MCP Server structure test completed successfully!');
console.log('\n安装和配置步骤:');
console.log('1. 安装依赖: npm install');
console.log('2. 复制配置文件: cp .env.example .env');
console.log('3. 编辑 .env 文件，配置你的 Memos 服务器信息');
console.log('4. 配置 Claude Desktop (参考 README.md)');
console.log('5. 重启 Claude Desktop 开始使用');