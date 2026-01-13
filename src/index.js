#!/usr/bin/env node

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import dotenv from "dotenv";
import { MemosClient } from "./memos-client.js";

// Load environment variables
dotenv.config();

// Create MCP server
const server = new Server(
  {
    name: "memos-mcp-server",
    version: "1.0.0",
  },
  {
    capabilities: {
      tools: {},
    },
  }
);

// Initialize Memos client
const memosClient = new MemosClient(
  process.env.MEMOS_SERVER_URL || "http://localhost:5230",
  process.env.MEMOS_API_TOKEN
);

// List available tools
server.setRequestHandler(ListToolsRequestSchema, async () => {
  return {
    tools: [
      {
        name: "list_memos",
        description: "List memos with optional filtering by tags, content, or status",
        inputSchema: {
          type: "object",
          properties: {
            limit: {
              type: "number",
              description: "Maximum number of memos to return (default: 20)",
            },
            offset: {
              type: "number",
              description: "Offset for pagination (default: 0)",
            },
            tag: {
              type: "string",
              description: "Filter memos by tag",
            },
            content: {
              type: "string",
              description: "Search in memo content",
            },
            visibility: {
              type: "string",
              enum: ["public", "private"],
              description: "Filter by visibility",
            },
            includeArchived: {
              type: "boolean",
              description: "Include archived memos (default: false)",
            },
          },
        },
      },
      {
        name: "create_memo",
        description: "Create a new memo",
        inputSchema: {
          type: "object",
          required: ["content"],
          properties: {
            content: {
              type: "string",
              description: "The content of the memo (supports markdown)",
            },
            tags: {
              type: "array",
              items: { type: "string" },
              description: "Tags for the memo (without # prefix)",
            },
            visibility: {
              type: "string",
              enum: ["public", "private"],
              description: "Visibility of the memo (default: private)",
            },
            pinned: {
              type: "boolean",
              description: "Pin the memo (default: false)",
            },
          },
        },
      },
      {
        name: "update_memo",
        description: "Update an existing memo",
        inputSchema: {
          type: "object",
          required: ["id", "content"],
          properties: {
            id: {
              type: "string",
              description: "ID of the memo to update (can be number or string like 'memos/...')",
            },
            content: {
              type: "string",
              description: "New content of the memo",
            },
            tags: {
              type: "array",
              items: { type: "string" },
              description: "New tags for the memo",
            },
            visibility: {
              type: "string",
              enum: ["public", "private"],
              description: "New visibility",
            },
            pinned: {
              type: "boolean",
              description: "Pin status",
            },
          },
        },
      },
      {
        name: "delete_memo",
        description: "Delete a memo",
        inputSchema: {
          type: "object",
          required: ["id"],
          properties: {
            id: {
              type: "string",
              description: "ID of the memo to delete (can be number or string like 'memos/...')",
            },
          },
        },
      },
      {
        name: "search_memos_by_tag",
        description: "Search memos by specific tag",
        inputSchema: {
          type: "object",
          required: ["tag"],
          properties: {
            tag: {
              type: "string",
              description: "Tag to search for (without # prefix)",
            },
            limit: {
              type: "number",
              description: "Maximum results (default: 20)",
            },
          },
        },
      },
      {
        name: "get_todo_memos",
        description: "Get memos marked as todo items",
        inputSchema: {
          type: "object",
          properties: {
            limit: {
              type: "number",
              description: "Maximum results (default: 20)",
            },
            includeCompleted: {
              type: "boolean",
              description: "Include completed todos (default: false)",
            },
          },
        },
      },
      {
        name: "create_todo",
        description: "Create a new todo item",
        inputSchema: {
          type: "object",
          required: ["title"],
          properties: {
            title: {
              type: "string",
              description: "Title of the todo item",
            },
            description: {
              type: "string",
              description: "Detailed description",
            },
            tags: {
              type: "array",
              items: { type: "string" },
              description: "Tags for the todo",
            },
            priority: {
              type: "string",
              enum: ["low", "medium", "high"],
              description: "Priority level",
            },
          },
        },
      },
      {
        name: "mark_todo_completed",
        description: "Mark a todo as completed",
        inputSchema: {
          type: "object",
          required: ["id"],
          properties: {
            id: {
              type: "string",
              description: "ID of the memo/todo to mark as completed (can be number or string like 'memos/...')",
            },
          },
        },
      },
      {
        name: "get_tags",
        description: "Get all tags used in memos",
        inputSchema: {
          type: "object",
          properties: {
            limit: {
              type: "number",
              description: "Maximum number of tags to return",
            },
          },
        },
      },
      {
        name: "get_memo_by_id",
        description: "Get a specific memo by ID",
        inputSchema: {
          type: "object",
          required: ["id"],
          properties: {
            id: {
              type: "string",
              description: "ID of the memo to retrieve (can be number or string like 'memos/...')",
            },
          },
        },
      },
    ],
  };
});

// Handle tool calls
server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;

  try {
    switch (name) {
      case "list_memos":
        return await memosClient.listMemos(args);

      case "create_memo":
        return await memosClient.createMemo(args);

      case "update_memo":
        return await memosClient.updateMemo(args);

      case "delete_memo":
        return await memosClient.deleteMemo(args);

      case "search_memos_by_tag":
        return await memosClient.searchMemosByTag(args);

      case "get_todo_memos":
        return await memosClient.getTodoMemos(args);

      case "create_todo":
        return await memosClient.createTodo(args);

      case "mark_todo_completed":
        return await memosClient.markTodoCompleted(args);

      case "get_tags":
        return await memosClient.getTags(args);

      case "get_memo_by_id":
        return await memosClient.getMemoById(args);

      default:
        throw new Error(`Unknown tool: ${name}`);
    }
  } catch (error) {
    return {
      content: [
        {
          type: "text",
          text: `Error: ${error.message}`,
        },
      ],
      isError: true,
    };
  }
});

// Start server
async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("Memos MCP server running on stdio");
}

main().catch((error) => {
  console.error("Server error:", error);
  process.exit(1);
});