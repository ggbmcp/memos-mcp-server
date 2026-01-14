import axios from "axios";

export class MemosClient {
  constructor(baseURL, apiToken) {
    if (!baseURL) {
      throw new Error("MEMOS_SERVER_URL is required");
    }
    if (!apiToken) {
      throw new Error("MEMOS_API_TOKEN is required");
    }

    this.client = axios.create({
      baseURL,
      headers: {
        "Authorization": `Bearer ${apiToken}`,
        "Content-Type": "application/json",
      },
    });
  }

  // Helper method to format response
  formatResponse(data, message = "Success") {
    return {
      content: [
        {
          type: "text",
          text: JSON.stringify({ message, data }, null, 2),
        },
      ],
    };
  }

  // Helper method to extract tags from content
  extractTags(content) {
    // Match # followed by any word characters (including Unicode/Chinese)
    const tagRegex = /#([\p{L}\p{N}_]+)/gu;
    const tags = [];
    let match;
    while ((match = tagRegex.exec(content)) !== null) {
      tags.push(match[1]);
    }
    return tags;
  }

  // Helper method to check if content is a todo
  isTodo(content) {
    const lowerContent = content.toLowerCase();
    // Check for todo patterns (with or without numbers)
    const todoPatterns = [
      /^\d*\.?\s*-\s*\[\s*\]/i,      // 1. - [ ] or - [ ]
      /^\d*\.?\s*-\s*\[\s*x\s*\]/i,  // 1. - [x] or - [x]
      /^\d*\.?\s*\[\s*\]/i,          // 1. [ ] or [ ]
      /^\d*\.?\s*\[\s*x\s*\]/i,      // 1. [x] or [x]
      /^\d*\.?\s*todo:/i,            // 1. TODO: or TODO:
      /^\d*\.?\s*待办:/i,            // 1. 待办: or 待办:
    ];

    return todoPatterns.some(pattern => pattern.test(lowerContent));
  }

  // Helper method to normalize ID for API calls
  // API returns IDs like "memos/UBdArrBLsjXTZVtqGdqLcg" but API calls need "UBdArrBLsjXTZVtqGdqLcg"
  normalizeIdForApi(id) {
    if (!id) return id;
    if (id.startsWith("memos/")) {
      return id.substring(6); // 去掉 "memos/" 前缀
    }
    return id;
  }

  // List memos
  async listMemos({ limit = 20, offset = 0, tag, content, visibility, includeArchived = false } = {}) {
    try {
      // Build query parameters
      const params = {};

      // Memos API uses different parameter names
      if (limit) params.pageSize = limit;
      if (offset) params.offset = offset;
      if (visibility) params.visibility = visibility;

      // Try different API endpoints based on memos version
      let memos = [];
      let apiVersion = "unknown";

      try {
        // Try v1 API first (newer versions)
        const response = await this.client.get("/api/v1/memos", { params });

        // Handle Google Keep style response
        if (response.data && response.data.memos && Array.isArray(response.data.memos)) {
          memos = response.data.memos;
          apiVersion = "v1-google-keep";
        } else if (Array.isArray(response.data)) {
          memos = response.data;
          apiVersion = "v1-array";
        } else {
          memos = [];
          apiVersion = "v1-unknown";
        }
      } catch (error) {
        try {
          // Try older API
          const response = await this.client.get("/api/memo", { params });
          if (Array.isArray(response.data)) {
            memos = response.data;
            apiVersion = "legacy-array";
          } else {
            memos = [];
            apiVersion = "legacy-unknown";
          }
        } catch (fallbackError) {
          // Try without params if they cause issues
          try {
            const response = await this.client.get("/api/v1/memos");
            if (response.data && response.data.memos && Array.isArray(response.data.memos)) {
              memos = response.data.memos;
              apiVersion = "v1-google-keep-no-params";
            } else if (Array.isArray(response.data)) {
              memos = response.data;
              apiVersion = "v1-array-no-params";
            } else {
              memos = [];
              apiVersion = "v1-unknown-no-params";
            }
          } catch (finalError) {
            try {
              const response = await this.client.get("/api/memo");
              if (Array.isArray(response.data)) {
                memos = response.data;
                apiVersion = "legacy-array-no-params";
              } else {
                memos = [];
                apiVersion = "legacy-unknown-no-params";
              }
            } catch (lastError) {
              throw new Error(`Failed to fetch memos: ${error.message}. Also tried fallbacks: ${fallbackError.message}, ${finalError.message}, ${lastError.message}`);
            }
          }
        }
      }

      console.error(`[DEBUG] Using API version: ${apiVersion}, Found ${memos.length} raw memos`);

      // Apply filters if provided
      if (tag) {
        memos = memos.filter(memo => {
          const memoContent = memo.content || "";
          const memoTags = memo.tags || [];
          return memoContent.includes(`#${tag}`) || memoTags.includes(tag);
        });
      }

      if (content) {
        const searchTerm = content.toLowerCase();
        memos = memos.filter(memo => {
          const memoContent = memo.content || "";
          return memoContent.toLowerCase().includes(searchTerm);
        });
      }

      if (!includeArchived) {
        memos = memos.filter(memo => {
          const state = memo.state || memo.rowStatus;
          return !state || state === "NORMAL" || state === "ACTIVE" || state === "DEFAULT";
        });
      }

      // Apply limit after filtering
      memos = memos.slice(0, limit);

      // Format response
      const formattedMemos = memos.map(memo => {
        // Extract ID from name field (Google Keep style) or use id field
        let id = memo.id;
        if (!id && memo.name) {
          // For Google Keep style API, use the full name as ID
          id = memo.name;
        }

        // Handle different timestamp formats
        let createdAt = null;
        if (memo.createdTs) {
          createdAt = new Date(memo.createdTs * 1000).toISOString();
        } else if (memo.createdAt) {
          createdAt = memo.createdAt;
        } else if (memo.createTime) {
          createdAt = memo.createTime;
        }

        let updatedAt = null;
        if (memo.updatedTs) {
          updatedAt = new Date(memo.updatedTs * 1000).toISOString();
        } else if (memo.updatedAt) {
          updatedAt = memo.updatedAt;
        } else if (memo.updateTime) {
          updatedAt = memo.updateTime;
        }

        const memoContent = memo.content || "";
        const memoVisibility = memo.visibility || "private";
        const memoPinned = memo.pinned || false;
        const memoState = memo.state || memo.rowStatus || "NORMAL";

        // Extract tags and remove duplicates
        const extractedTags = this.extractTags(memoContent);
        const uniqueTags = [...new Set(extractedTags)];

        return {
          id: id || 0,
          name: memo.name || "",
          content: memoContent,
          tags: uniqueTags,
          isTodo: this.isTodo(memoContent),
          createdAt,
          updatedAt,
          visibility: memoVisibility,
          pinned: memoPinned,
          state: memoState,
          raw: apiVersion.startsWith("v1-google-keep") ? {
            name: memo.name,
            state: memo.state,
            creator: memo.creator,
            createTime: memo.createTime,
            updateTime: memo.updateTime,
            displayTime: memo.displayTime,
            nodes: memo.nodes,
            attachments: memo.attachments,
            relations: memo.relations,
            reactions: memo.reactions,
            property: memo.property,
            snippet: memo.snippet
          } : undefined
        };
      });

      return this.formatResponse({
        count: formattedMemos.length,
        memos: formattedMemos,
        apiVersion,
      }, `Found ${formattedMemos.length} memos`);
    } catch (error) {
      console.error(`[ERROR] listMemos failed: ${error.message}`);
      throw new Error(`Failed to list memos: ${error.message}`);
    }
  }

  // Create memo
  async createMemo({ content, tags = [], visibility = "private", pinned = false }) {
    try {
      // Combine tags with content if provided
      let finalContent = content;
      if (tags && tags.length > 0) {
        // Extract tags already present in content
        const existingTags = this.extractTags(content);

        // Filter out tags that are already in content
        const newTags = tags.filter(tag => !existingTags.includes(tag));

        if (newTags.length > 0) {
          const tagString = newTags.map(tag => `#${tag}`).join(" ");
          // Check if content already ends with newline
          if (content.trim().endsWith('\n')) {
            finalContent = `${content.trim()}\n${tagString}`;
          } else {
            finalContent = `${content}\n\n${tagString}`;
          }
        } else {
          finalContent = content;
        }
      }

      console.error(`[DEBUG] Creating memo with content: ${finalContent.substring(0, 50)}...`);

      let response;
      let apiVersion = "unknown";
      try {
        // Try v1 API
        response = await this.client.post("/api/v1/memos", {
          content: finalContent,
          visibility,
          pinned,
        });
        apiVersion = "v1";
      } catch (error) {
        try {
          // Fallback to older API
          response = await this.client.post("/api/memo", {
            content: finalContent,
            visibility,
            pinned,
          });
          apiVersion = "legacy";
        } catch (fallbackError) {
          throw new Error(`Failed to create memo: ${error.message}. Also tried: ${fallbackError.message}`);
        }
      }

      console.error(`[DEBUG] Create response API version: ${apiVersion}`);

      const memo = response.data;
      let id = memo.id;
      if (!id && memo.name) {
        // For Google Keep style API, name is like "memos/Dmv2hiE3TxkopdRjJBk3nF"
        // We'll use the full name as ID
        id = memo.name;
      }

      let createdAt = null;
      if (memo.createdTs) {
        createdAt = new Date(memo.createdTs * 1000).toISOString();
      } else if (memo.createdAt) {
        createdAt = memo.createdAt;
      } else if (memo.createTime) {
        createdAt = memo.createTime;
      }

      // Extract tags and remove duplicates
      const extractedTags = this.extractTags(memo.content || finalContent);
      const uniqueTags = [...new Set(extractedTags)];

      return this.formatResponse({
        id: id || 0,
        name: memo.name || "",
        content: memo.content || finalContent,
        tags: uniqueTags,
        isTodo: this.isTodo(memo.content || finalContent),
        createdAt,
        visibility: memo.visibility || visibility,
        pinned: memo.pinned || pinned,
        apiVersion,
      }, "Memo created successfully");
    } catch (error) {
      console.error(`[ERROR] createMemo failed: ${error.message}`);
      throw new Error(`Failed to create memo: ${error.message}`);
    }
  }

  // Update memo
  async updateMemo({ id, content, tags, visibility, pinned }) {
    try {
      if (!id) {
        throw new Error("Memo ID is required for update");
      }

      const updateData = {};

      // 处理内容更新：如果提供了tags，需要将标签合并到内容中
      let finalContent = content;
      if (tags !== undefined) {
        // 用户明确提供了tags参数（可能是空数组[]，表示清除所有标签）
        if (content !== undefined) {
          // 移除内容中现有的标签
          const contentWithoutTags = content.replace(/#\w+/g, '').trim();
          // 如果有新标签，添加到内容末尾
          if (tags.length > 0) {
            const tagString = tags.map(tag => `#${tag}`).join(" ");
            finalContent = contentWithoutTags + (contentWithoutTags ? "\n\n" : "") + tagString;
          } else {
            // tags为空数组，只保留清理后的内容（移除所有标签）
            finalContent = contentWithoutTags;
          }
        }
        // 同时设置tags字段，以保持API兼容性
        updateData.tags = tags;
      }

      if (content !== undefined) {
        updateData.content = finalContent;
      }

      if (visibility !== undefined) {
        updateData.visibility = visibility;
      }

      if (pinned !== undefined) {
        updateData.pinned = pinned;
      }

      console.error(`[DEBUG] Updating memo ${id} with data:`, JSON.stringify(updateData));

      let response;
      let apiVersion = "unknown";

      // 规范化 ID 用于 API 调用
      const normalizedId = this.normalizeIdForApi(id);
      console.error(`[DEBUG] Original ID: ${id}, Normalized ID for API: ${normalizedId}`);

      try {
        // 首先尝试 PATCH
        response = await this.client.patch(`/api/v1/memos/${normalizedId}`, updateData);
        apiVersion = "v1-patch";
      } catch (patchError) {
        try {
          // 如果 PATCH 失败，尝试 PUT
          response = await this.client.put(`/api/v1/memos/${normalizedId}`, updateData);
          apiVersion = "v1-put";
        } catch (putError) {
          throw new Error(`Failed to update memo. Tried: PATCH (${patchError.message}), PUT (${putError.message})`);
        }
      }

      console.error(`[DEBUG] Update successful using API version: ${apiVersion}`);

      // Handle different response formats
      const memo = response.data;

      // 检查响应是否是 HTML（表示 API 调用失败）
      // 但旧版 API (/api/memo) 可能返回字符串响应
      if (typeof memo === 'string') {
        if (memo.includes('<!doctype html>')) {
          throw new Error(`Update API returned HTML page instead of JSON. The memo may not exist or the API endpoint is incorrect. API version: ${apiVersion}`);
        } else if (apiVersion.startsWith("legacy")) {
          // 旧版 API 可能返回简单的字符串响应，如 "OK"
          console.error(`[DEBUG] Legacy API returned string response: ${memo.substring(0, 100)}`);
          // 对于旧版 API，我们假设成功
        }
      }

      // 验证响应数据
      if (!memo) {
        throw new Error("Update API returned empty response");
      }

      // 对于某些 API 版本，需要检查响应是否包含必要的字段
      if (apiVersion.startsWith("legacy") && (!memo.id && !memo.name)) {
        console.error(`[WARNING] Legacy API update may not have succeeded. Response:`, JSON.stringify(memo).substring(0, 200));
      }
      let updatedAt = null;
      if (memo.updatedTs) {
        updatedAt = new Date(memo.updatedTs * 1000).toISOString();
      } else if (memo.updatedAt) {
        updatedAt = memo.updatedAt;
      } else if (memo.updateTime) {
        updatedAt = memo.updateTime;
      }

      let memoId = memo.id;
      if (!memoId && memo.name) {
        // For Google Keep style API, use the full name as ID
        memoId = memo.name;
      }

      // 优先使用响应中的 tags 字段，否则从内容中提取
      const responseTags = memo.tags || this.extractTags(memo.content || content || "");

      return this.formatResponse({
        id: memoId || id,
        name: memo.name || "",
        content: memo.content || content,
        tags: responseTags,
        isTodo: this.isTodo(memo.content || content || ""),
        updatedAt,
        visibility: memo.visibility || visibility || "private",
        pinned: memo.pinned || pinned || false,
        apiVersion,
      }, "Memo updated successfully");
    } catch (error) {
      console.error(`[ERROR] updateMemo failed: ${error.message}`);
      throw new Error(`Failed to update memo: ${error.message}`);
    }
  }

  // Delete memo
  async deleteMemo({ id }) {
    try {
      if (!id) {
        throw new Error("Memo ID is required for deletion");
      }

      console.error(`[DEBUG] Deleting memo ${id}`);

      let apiVersion = "unknown";

      // 规范化 ID 用于 API 调用
      const normalizedId = this.normalizeIdForApi(id);
      console.error(`[DEBUG] Original ID: ${id}, Normalized ID for API: ${normalizedId}`);

      try {
        // 使用规范化后的 ID 进行删除
        await this.client.delete(`/api/v1/memos/${normalizedId}`);
        apiVersion = "v1";
      } catch (deleteError) {
        throw new Error(`Failed to delete memo: ${deleteError.message}`);
      }

      console.error(`[DEBUG] Delete successful using API version: ${apiVersion}`);

      // 对于某些 API，可能需要验证删除是否真的成功
      // 可以尝试获取被删除的 memo 来验证
      if (apiVersion === "legacy") {
        console.error(`[DEBUG] Legacy API used for deletion, verification may be needed`);
      }

      return this.formatResponse({
        id,
        apiVersion,
      }, "Memo deleted successfully");
    } catch (error) {
      console.error(`[ERROR] deleteMemo failed: ${error.message}`);
      throw new Error(`Failed to delete memo: ${error.message}`);
    }
  }

  // Search memos by tag
  async searchMemosByTag({ tag, limit = 20 }) {
    try {
      if (!tag) {
        throw new Error("Tag is required for search");
      }

      console.error(`[DEBUG] Searching memos by tag: #${tag}`);

      // Use listMemos with tag filter
      const result = await this.listMemos({ tag, limit });

      // Parse the result
      const resultData = JSON.parse(result.content[0].text);

      return this.formatResponse({
        tag,
        count: resultData.data.count,
        memos: resultData.data.memos,
        apiVersion: resultData.data.apiVersion,
      }, `Found ${resultData.data.count} memos with tag #${tag}`);
    } catch (error) {
      console.error(`[ERROR] searchMemosByTag failed: ${error.message}`);
      throw new Error(`Failed to search memos by tag: ${error.message}`);
    }
  }

  // Get todo memos
  async getTodoMemos({ limit = 20, includeCompleted = false } = {}) {
    try {
      let response;
      let apiVersion = "unknown";
      try {
        response = await this.client.get("/api/v1/memos");
        apiVersion = "v1";
      } catch (error) {
        try {
          response = await this.client.get("/api/memo");
          apiVersion = "legacy";
        } catch (fallbackError) {
          throw new Error(`Failed to fetch memos: ${error.message}. Also tried: ${fallbackError.message}`);
        }
      }

      // Handle different response formats
      let memos = [];
      if (response.data && response.data.memos && Array.isArray(response.data.memos)) {
        // Google Keep style API: { memos: [...] }
        memos = response.data.memos;
        apiVersion = apiVersion + "-google-keep";
      } else if (Array.isArray(response.data)) {
        // Direct array response
        memos = response.data;
        apiVersion = apiVersion + "-array";
      } else {
        // Unknown format
        console.error(`[DEBUG] Unknown API response format for getTodoMemos:`, typeof response.data);
        memos = [];
        apiVersion = apiVersion + "-unknown";
      }

      console.error(`[DEBUG] getTodoMemos using API version: ${apiVersion}, Found ${memos.length} raw memos`);

      // Filter for todos
      memos = memos.filter(memo => {
        const memoContent = memo.content || "";
        return this.isTodo(memoContent);
      });

      // Filter out completed todos if needed
      if (!includeCompleted) {
        memos = memos.filter(memo => {
          const memoContent = memo.content || "";
          return !memoContent.toLowerCase().includes("[x]") &&
                 !memoContent.toLowerCase().includes("完成");
        });
      }

      // Limit results
      memos = memos.slice(0, limit);

      // Parse todo items - extract multiple todos from each memo
      const allTodoItems = [];

      memos.forEach(memo => {
        const content = memo.content || "";

        // Extract multiple todo items from the content
        const todoItems = this.extractTodoItems(content);

        // Handle different timestamp formats for the parent memo
        let memoCreatedAt = null;
        if (memo.createdTs) {
          memoCreatedAt = new Date(memo.createdTs * 1000).toISOString();
        } else if (memo.createdAt) {
          memoCreatedAt = memo.createdAt;
        } else if (memo.createTime) {
          memoCreatedAt = memo.createTime;
        }

        // Extract tags from the entire content
        const memoTags = this.extractTags(content);
        const memoPriority = this.extractPriority(content);

        // Extract ID from name field (Google Keep style) or use id field
        let memoId = memo.id;
        if (!memoId && memo.name) {
          // For Google Keep style API, use the full name as ID
          memoId = memo.name;
        }

        // Create todo items for each extracted todo
        todoItems.forEach((todoItem, index) => {
          allTodoItems.push({
            id: memoId || 0,
            name: memo.name || "",
            memoId: memoId || 0, // Parent memo ID
            memoName: memo.name || "", // Parent memo name
            title: todoItem.title,
            description: todoItem.description,
            content: todoItem.description ? `${todoItem.title}\n\n${todoItem.description}` : todoItem.title,
            isCompleted: todoItem.isCompleted,
            tags: memoTags, // Use parent memo's tags
            createdAt: memoCreatedAt,
            priority: memoPriority,
            lineNumber: todoItem.lineNumber,
            itemIndex: index + 1,
            totalItems: todoItems.length,
          });
        });

        // If no structured todo items were found but the memo is marked as a todo,
        // create a single todo item from the entire memo
        if (todoItems.length === 0 && this.isTodo(content)) {
          const lines = content.split('\n');
          const firstLine = lines[0].trim();
          let title = firstLine;

          // Clean up todo markers from title
          title = title.replace(/^-\s*\[\s*[ x]\s*\]\s*/i, '')
                      .replace(/^\[\s*[ x]\s*\]\s*/i, '')
                      .replace(/^todo:\s*/i, '')
                      .replace(/^待办:\s*/i, '')
                      .trim();

          const description = lines.slice(1).join('\n').trim();
          const isCompleted = content.toLowerCase().includes('[x]') ||
                             content.toLowerCase().includes('完成');

          allTodoItems.push({
            id: memoId || 0,
            name: memo.name || "",
            memoId: memoId || 0,
            memoName: memo.name || "",
            title: title || 'Untitled Todo',
            description,
            content: description ? `${title}\n\n${description}` : title,
            isCompleted,
            tags: memoTags,
            createdAt: memoCreatedAt,
            priority: memoPriority,
            lineNumber: 1,
            itemIndex: 1,
            totalItems: 1,
          });
        }
      });

      // Apply limit to the total number of todo items (not memos)
      const limitedTodoItems = allTodoItems.slice(0, limit);

      return this.formatResponse({
        count: limitedTodoItems.length,
        totalMemos: memos.length,
        totalTodoItems: allTodoItems.length,
        todos: limitedTodoItems,
        apiVersion,
      }, `Found ${limitedTodoItems.length} todo items from ${memos.length} memos`);
    } catch (error) {
      console.error(`[ERROR] getTodoMemos failed: ${error.message}`);
      throw new Error(`Failed to get todo memos: ${error.message}`);
    }
  }

  // Extract priority from content
  extractPriority(content) {
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

  // Format multiple todo items into a single memo content
  formatMultipleTodos(todos, commonTags = [], commonPriority = "medium") {
    if (!todos || todos.length === 0) {
      throw new Error("No todo items provided");
    }

    let content = "";

    // Add each todo item
    todos.forEach((todo, index) => {
      const todoTitle = todo.title || `待办事项 ${index + 1}`;
      const todoDescription = todo.description || "";
      const isCompleted = todo.isCompleted || false;
      const todoPriority = todo.priority || commonPriority;

      // Use correct format: checkbox before text, no numbers
      const checkbox = isCompleted ? "- [x]" : "- [ ]";

      if (index > 0) {
        content += "\n";
      }

      // Check if description already contains priority
      const descriptionLower = todoDescription.toLowerCase();
      const hasPriorityInDescription =
        descriptionLower.includes("priority:") ||
        descriptionLower.includes("优先级:");

      // Add todo with priority on same line if specified and not default and not already in description
      if (todoPriority !== "medium" && todoPriority !== commonPriority && !hasPriorityInDescription) {
        // Show priority in bold on same line
        content += `${checkbox} ${todoTitle} **priority: ${todoPriority}**`;
      } else {
        content += `${checkbox} ${todoTitle}`;
      }

      // Add description with single line break if exists
      if (todoDescription) {
        content += `\n${todoDescription}`;
      }
    });

    // Add common priority only if specified and not default
    if (commonPriority !== "medium") {
      // Check if content already ends with newline
      if (content.endsWith('\n')) {
        content += `\n**共同优先级: ${commonPriority}**`;
      } else {
        content += `\n\n**共同优先级: ${commonPriority}**`;
      }
    }

    // Add common tags and todo tag
    const allTags = [...commonTags, "todo"];
    if (allTags.length > 0) {
      const tagString = allTags.map(tag => `#${tag}`).join(" ");
      // Check if content already ends with newline
      if (content.endsWith('\n')) {
        content += `\n${tagString}`;
      } else {
        content += `\n\n${tagString}`;
      }
    }

    return content;
  }

  // Extract multiple todo items from content
  extractTodoItems(content) {
    const items = [];
    const lines = content.split('\n');

    // Patterns to match todo items
    const todoPatterns = [
      /^-\s*\[\s*\]\s*(.+)$/i,      // - [ ] something
      /^-\s*\[\s*x\s*\]\s*(.+)$/i,   // - [x] something
      /^\[\s*\]\s*(.+)$/i,           // [ ] something
      /^\[\s*x\s*\]\s*(.+)$/i,       // [x] something
      /^(\d+\.\s*)?todo:\s*(.+)$/i,  // TODO: something or 5. TODO: something
      /^(\d+\.\s*)?待办:\s*(.+)$/i,  // 待办: something or 5. 待办: something
      // Also match numbered items but we'll clean up the number prefix
      /^(\d+\.\s*)?-\s*\[\s*\]\s*(.+)$/i, // 1. - [ ] something or - [ ] something
      /^(\d+\.\s*)?-\s*\[\s*x\s*\]\s*(.+)$/i, // 1. - [x] something or - [x] something
      /^(\d+\.\s*)?\[\s*\]\s*(.+)$/i,   // 1. [ ] something or [ ] something
      /^(\d+\.\s*)?\[\s*x\s*\]\s*(.+)$/i, // 1. [x] something or [x] something
    ];

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();

      // Check if line matches any todo pattern
      for (const pattern of todoPatterns) {
        const match = line.match(pattern);
        if (match) {
          // Determine which capture group contains the title
          // For patterns with optional number prefix: match[1] = number, match[2] = title
          // For patterns without number prefix: match[1] = title
          let title = '';
          if (match[2] !== undefined) {
            // Pattern has number prefix (match[1] may be "1. " or undefined)
            title = match[2].trim();
          } else {
            // Pattern without number prefix
            title = match[1].trim();
          }

          const isCompleted = line.toLowerCase().includes('[x]');

          // Try to get description from next lines (until next todo or empty line)
          let description = '';
          let j = i + 1;
          while (j < lines.length &&
                 !todoPatterns.some(p => p.test(lines[j].trim())) &&
                 lines[j].trim() !== '') {
            description += (description ? '\n' : '') + lines[j].trim();
            j++;
          }

          items.push({
            title,
            description,
            isCompleted,
            lineNumber: i + 1,
          });
          break;
        }
      }
    }

    // If no structured todo items found but content contains todo markers,
    // treat the entire content as one todo item
    if (items.length === 0 && this.isTodo(content)) {
      const lines = content.split('\n');
      const firstLine = lines[0].trim();
      let title = firstLine;

      // Clean up todo markers from title
      title = title.replace(/^-\s*\[\s*[ x]\s*\]\s*/i, '')
                   .replace(/^\[\s*[ x]\s*\]\s*/i, '')
                   .replace(/^todo:\s*/i, '')
                   .replace(/^待办:\s*/i, '')
                   .trim();

      const description = lines.slice(1).join('\n').trim();
      const isCompleted = content.toLowerCase().includes('[x]') ||
                         content.toLowerCase().includes('完成');

      items.push({
        title: title || 'Untitled Todo',
        description,
        isCompleted,
        lineNumber: 1,
      });
    }

    return items;
  }

  // Create todo - supports single todo or multiple todos
  async createTodo({ title, description = "", tags = [], priority = "medium", todos }) {
    try {
      let content;
      let finalTags = [...tags, "todo"];
      let shouldAddTagsViaCreateMemo = true; // Flag to control tag addition

      // Check if we're creating multiple todos
      if (todos && Array.isArray(todos) && todos.length > 0) {
        // Create multiple todos in one memo
        console.error(`[DEBUG] Creating ${todos.length} todos in one memo`);

        // Use the new formatMultipleTodos function
        content = this.formatMultipleTodos(todos, tags, priority);

        // For multiple todos, we might want to add a title/header
        if (title) {
          content = `${title}\n\n${content}`;
        }

        // Tags are already added in formatMultipleTodos, so don't add them again
        shouldAddTagsViaCreateMemo = false;
      } else if (title) {
        // Single todo (backward compatibility)
        console.error(`[DEBUG] Creating single todo: ${title}`);

        // Check if description already contains priority
        const descriptionLower = description.toLowerCase();
        const hasPriorityInDescription =
          descriptionLower.includes("priority:") ||
          descriptionLower.includes("优先级:");

        // Format todo content with priority on same line if not default and not already in description
        if (priority !== "medium" && !hasPriorityInDescription) {
          content = `- [ ] ${title} **priority: ${priority}**`;
        } else {
          content = `- [ ] ${title}`;
        }

        if (description) {
          content += `\n${description}`;
        }

        // Note: Tags will be added by createMemo function
        // We don't add them here to avoid duplication
      } else {
        throw new Error("Either 'title' or 'todos' parameter is required");
      }

      return await this.createMemo({
        content,
        tags: shouldAddTagsViaCreateMemo ? finalTags : [],
        visibility: "private",
      });
    } catch (error) {
      console.error(`[ERROR] createTodo failed: ${error.message}`);
      throw new Error(`Failed to create todo: ${error.message}`);
    }
  }

  // Mark todo as completed
  async markTodoCompleted({ id }) {
    try {
      // First get the memo
      let response;
      const normalizedId = this.normalizeIdForApi(id);

      try {
        response = await this.client.get(`/api/v1/memos/${normalizedId}`);
      } catch (error) {
        response = await this.client.get(`/api/memo/${normalizedId}`);
      }
      const memo = response.data;

      if (!memo) {
        throw new Error(`Memo with ID ${id} not found`);
      }

      // Update content to mark as completed
      let content = memo.content;
      content = content.replace("- [ ]", "- [x]");
      content = content.replace(/todo:/i, "完成:");

      // Update the memo
      return await this.updateMemo({
        id,
        content,
      });
    } catch (error) {
      throw new Error(`Failed to mark todo as completed: ${error.message}`);
    }
  }

  // Get all tags
  async getTags({ limit = 50 } = {}) {
    try {
      // Use listMemos to get all memos
      const result = await this.listMemos({ limit: 1000 }); // Get more memos for tag analysis
      const resultData = JSON.parse(result.content[0].text);
      const memos = resultData.data.memos || [];

      console.error(`[DEBUG] Analyzing tags from ${memos.length} memos`);

      // Extract all unique tags
      const tagSet = new Set();
      memos.forEach(memo => {
        const tags = this.extractTags(memo.content || "");
        tags.forEach(tag => tagSet.add(tag));
      });

      const tags = Array.from(tagSet).slice(0, limit);

      // Count tag usage
      const tagCounts = {};
      tags.forEach(tag => {
        tagCounts[tag] = memos.filter(memo =>
          (memo.content || "").includes(`#${tag}`)
        ).length;
      });

      // Sort by count (descending)
      const sortedTags = tags.sort((a, b) => (tagCounts[b] || 0) - (tagCounts[a] || 0));

      return this.formatResponse({
        count: sortedTags.length,
        tags: sortedTags.map(tag => ({
          name: tag,
          count: tagCounts[tag] || 0,
        })),
        apiVersion: resultData.data.apiVersion,
      }, `Found ${sortedTags.length} unique tags`);
    } catch (error) {
      console.error(`[ERROR] getTags failed: ${error.message}`);
      throw new Error(`Failed to get tags: ${error.message}`);
    }
  }

  // Get memo by ID
  async getMemoById({ id }) {
    try {
      if (!id) {
        throw new Error("Memo ID is required");
      }

      console.error(`[DEBUG] Getting memo by ID: ${id}`);

      // First try to get from list (more reliable for Google Keep style API)
      const listResult = await this.listMemos({ limit: 100 });
      const listData = JSON.parse(listResult.content[0].text);
      const memos = listData.data.memos || [];

      // Find memo by ID - 支持多种 ID 格式
      const normalizedIdForSearch = this.normalizeIdForApi(id);
      const memo = memos.find(m =>
        m.id === id ||
        m.name === id ||
        m.id === `memos/${normalizedIdForSearch}` ||
        m.name === `memos/${normalizedIdForSearch}` ||
        m.id === normalizedIdForSearch ||
        m.name === normalizedIdForSearch
      );

      if (memo) {
        console.error(`[DEBUG] Found memo in list using API version: ${listData.data.apiVersion}`);
        return this.formatResponse({
          id: memo.id,
          name: memo.name || "",
          content: memo.content || "",
          tags: memo.tags || [],
          isTodo: memo.isTodo || false,
          createdAt: memo.createdAt,
          updatedAt: memo.updatedAt,
          visibility: memo.visibility || "private",
          pinned: memo.pinned || false,
          state: memo.state || "NORMAL",
          apiVersion: listData.data.apiVersion,
        }, "Memo retrieved successfully");
      }

      // If not found in list, try direct API calls
      let response;
      let apiVersion = "unknown";

      // 规范化 ID 用于 API 调用
      const normalizedId = this.normalizeIdForApi(id);

      try {
        // Try v1 API first
        response = await this.client.get(`/api/v1/memos/${normalizedId}`);
        apiVersion = "v1-direct";
      } catch (error) {
        try {
          // Try older API
          response = await this.client.get(`/api/memo/${normalizedId}`);
          apiVersion = "legacy-direct";
        } catch (fallbackError) {
          try {
            // Try Google Keep style API - use the name directly
            response = await this.client.get(`/api/v1/memos/${normalizedId}`);
            apiVersion = "v1-google-keep-direct";
          } catch (googleKeepError) {
            throw new Error(`Memo with ID ${id} not found. Also tried direct APIs: ${error.message}, ${fallbackError.message}, ${googleKeepError.message}`);
          }
        }
      }

      const directMemo = response.data;
      if (!directMemo) {
        throw new Error(`Memo with ID ${id} not found`);
      }

      console.error(`[DEBUG] Found memo using direct API version: ${apiVersion}`);

      // Handle different timestamp formats
      let createdAt = null;
      if (directMemo.createdTs) {
        createdAt = new Date(directMemo.createdTs * 1000).toISOString();
      } else if (directMemo.createdAt) {
        createdAt = directMemo.createdAt;
      } else if (directMemo.createTime) {
        createdAt = directMemo.createTime;
      }

      let updatedAt = null;
      if (directMemo.updatedTs) {
        updatedAt = new Date(directMemo.updatedTs * 1000).toISOString();
      } else if (directMemo.updatedAt) {
        updatedAt = directMemo.updatedAt;
      } else if (directMemo.updateTime) {
        updatedAt = directMemo.updateTime;
      }

      let memoId = directMemo.id;
      if (!memoId && directMemo.name) {
        // For Google Keep style API, use the full name as ID
        memoId = directMemo.name;
      }

      // Extract tags and remove duplicates
      const extractedTags = this.extractTags(directMemo.content || "");
      const uniqueTags = [...new Set(extractedTags)];

      return this.formatResponse({
        id: memoId || id,
        name: directMemo.name || "",
        content: directMemo.content || "",
        tags: uniqueTags,
        isTodo: this.isTodo(directMemo.content || ""),
        createdAt,
        updatedAt,
        visibility: directMemo.visibility || "private",
        pinned: directMemo.pinned || false,
        state: directMemo.state || directMemo.rowStatus || "NORMAL",
        apiVersion,
      }, "Memo retrieved successfully");
    } catch (error) {
      console.error(`[ERROR] getMemoById failed: ${error.message}`);
      throw new Error(`Failed to get memo: ${error.message}`);
    }
  }
}