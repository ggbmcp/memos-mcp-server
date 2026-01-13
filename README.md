# Memos MCP Server

一个用于 [Memos](https://github.com/usememos/memos) 笔记应用的 Model Context Protocol (MCP) 服务器。通过这个 MCP 服务器，你可以在 Claude Desktop 或其他 MCP 客户端中直接与你的 Memos 实例交互。

## 功能特性

### 核心功能
- ✅ **查询 Memos** - 列出、搜索和过滤 memos
- ✅ **新增 Memos** - 创建新的 memos，支持标签和可见性设置
- ✅ **修改 Memos** - 更新现有 memos 的内容、标签和属性
- ✅ **删除 Memos** - 删除指定的 memo

### 增强功能
- ✅ **标签搜索** - 根据标签搜索 memos
- ✅ **待办事项管理** - 识别和管理 todo 项目
- ✅ **标签统计** - 获取所有标签及其使用频率
- ✅ **智能识别** - 自动识别 todo 项目和优先级

## 安装和配置

### 方法一：使用 npx（推荐）
```bash
# 直接运行（需要设置环境变量）
MEMOS_SERVER_URL=http://localhost:5230 MEMOS_API_TOKEN=your_token npx @ggbmcp/memos-mcp-server

# 或者使用 .env 文件
# 1. 创建 .env 文件
echo "MEMOS_SERVER_URL=http://localhost:5230" > .env
echo "MEMOS_API_TOKEN=your_token_here" >> .env

# 2. 运行
npx @ggbmcp/memos-mcp-server

# 查看帮助
npx @ggbmcp/memos-mcp-server --help

# 查看版本
npx @ggbmcp/memos-mcp-server --version
```

### 方法二：本地安装
```bash
# 克隆仓库
git clone https://github.com/ggbmcp/memos-mcp-server.git
cd memos-mcp-server

# 安装依赖
npm install

# 配置环境变量
cp .env.example .env
# 编辑 .env 文件，填写你的配置

# 运行服务器
npm start
```

编辑 `.env` 文件：
```env
# Memos 服务器地址（例如：http://localhost:5230）
MEMOS_SERVER_URL=http://localhost:5230

# Memos API Token（从 Memos 设置中获取）
MEMOS_API_TOKEN=your_api_token_here

# 可选：新 memo 的默认可见性（public/private）
DEFAULT_VISIBILITY=private
```

### 3. 获取 API Token
1. 登录你的 Memos 实例
2. 进入设置页面
3. 在 "API" 部分生成或复制 API Token

## 配置 Claude Desktop

### 方法一：使用 npx 配置（推荐）
1. 打开 Claude Desktop 设置
2. 进入 "Developer" 选项卡
3. 点击 "Edit Config" 按钮
4. 添加以下配置：

```json
{
  "mcpServers": {
    "memos": {
      "command": "npx",
      "args": ["@ggbmcp/memos-mcp-server"],
      "env": {
        "MEMOS_SERVER_URL": "http://localhost:5230",
        "MEMOS_API_TOKEN": "your_api_token_here"
      }
    }
  }
}
```

### 方法二：使用本地路径配置
```json
{
  "mcpServers": {
    "memos": {
      "command": "node",
      "args": ["/path/to/memos-mcp-server/src/index.js"],
      "env": {
        "MEMOS_SERVER_URL": "http://localhost:5230",
        "MEMOS_API_TOKEN": "your_api_token_here"
      }
    }
  }
}
```

### 方法二：直接编辑配置文件
配置文件通常位于：
- **macOS**: `~/Library/Application Support/Claude/claude_desktop_config.json`
- **Windows**: `%APPDATA%\Claude\claude_desktop_config.json`
- **Linux**: `~/.config/Claude/claude_desktop_config.json`

## 可用工具

### 1. `list_memos`
列出 memos，支持多种过滤选项。

**参数：**
- `limit` (可选): 返回的最大数量（默认: 20）
- `offset` (可选): 分页偏移量（默认: 0）
- `tag` (可选): 按标签过滤
- `content` (可选): 在内容中搜索
- `visibility` (可选): 按可见性过滤（public/private）
- `includeArchived` (可选): 包含已归档的 memos（默认: false）

**示例：**
```
列出最近的 10 个 memos
搜索包含 "项目" 的 memos
显示所有带有 #todo 标签的 memos
```

### 2. `create_memo`
创建新的 memo。

**参数：**
- `content` (必需): memo 内容（支持 Markdown）
- `tags` (可选): 标签数组（不需要 # 前缀）
- `visibility` (可选): 可见性（public/private，默认: private）
- `pinned` (可选): 是否置顶（默认: false）

**示例：**
```
创建一个关于项目计划的 memo
添加标签 ["项目", "计划"]
```

### 3. `update_memo`
更新现有的 memo。

**参数：**
- `id` (必需): 要更新的 memo ID
- `content` (必需): 新的内容
- `tags` (可选): 新的标签数组
- `visibility` (可选): 新的可见性
- `pinned` (可选): 新的置顶状态

### 4. `delete_memo`
删除 memo。

**参数：**
- `id` (必需): 要删除的 memo ID

### 5. `search_memos_by_tag`
按特定标签搜索 memos。

**参数：**
- `tag` (必需): 要搜索的标签（不需要 # 前缀）
- `limit` (可选): 最大结果数（默认: 20）

### 6. `get_todo_memos`
获取标记为待办事项的 memos。

**参数：**
- `limit` (可选): 最大结果数（默认: 20）
- `includeCompleted` (可选): 包含已完成的待办事项（默认: false）

### 7. `create_todo`
创建新的待办事项。

**参数：**
- `title` (必需): 待办事项标题
- `description` (可选): 详细描述
- `tags` (可选): 标签数组
- `priority` (可选): 优先级（low/medium/high，默认: medium）

### 8. `mark_todo_completed`
将待办事项标记为已完成。

**参数：**
- `id` (必需): 待办事项 memo 的 ID

### 9. `get_tags`
获取所有使用的标签。

**参数：**
- `limit` (可选): 返回的最大标签数

### 10. `get_memo_by_id`
按 ID 获取特定的 memo。

**参数：**
- `id` (必需): memo ID

## Todo 识别规则

MCP 服务器会自动识别 todo 项目：

1. **待办标记**：
   - `[ ]` 开头的行
   - `[x]` 开头的行（已完成）
   - 包含 "todo:" 或 "待办:" 的内容

2. **优先级识别**：
   - `priority: high` 或 `优先级: 高` → 高优先级
   - `priority: medium` 或 `优先级: 中` → 中优先级
   - `priority: low` 或 `优先级: 低` → 低优先级

## 使用示例

### 基本使用
```
列出我最近的 5 个 memos
创建一个关于会议记录的 memo
搜索所有带有 #项目 标签的 memos
```

### 待办事项管理
```
显示我所有的待办事项
创建一个高优先级的待办事项：完成项目报告
将 ID 为 123 的待办事项标记为已完成
```

### 标签管理
```
查看我最常用的标签
查找所有带有 #学习 标签的 memos
```

## 故障排除

### 常见问题

1. **连接失败**
   - 检查 `MEMOS_SERVER_URL` 是否正确
   - 确保 Memos 服务正在运行
   - 验证 API Token 是否有效

2. **API 端点不匹配**
   - 服务器会自动尝试 v1 和旧版 API 端点
   - 如果仍然失败，可能需要根据你的 Memos 版本调整 API 路径

3. **权限问题**
   - 确保 API Token 有足够的权限执行操作
   - 检查 memo 的可见性设置

### 调试模式
要启用调试，可以设置环境变量：
```bash
NODE_DEBUG=mcp node src/index.js
```

## 开发

### 项目结构
```
memos-mcp-server/
├── src/
│   ├── index.js          # MCP 服务器主文件
│   └── memos-client.js   # Memos API 客户端
├── package.json
├── .env.example
└── README.md
```

### 添加新功能
1. 在 `index.js` 的 `ListToolsRequestSchema` 处理器中添加工具定义
2. 在 `memos-client.js` 中实现对应的 API 方法
3. 在 `CallToolRequestSchema` 处理器中添加工具调用逻辑

## 许可证

MIT License