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
    const tagRegex = /#(\w+)/g;
    const tags = [];
    let match;
    while ((match = tagRegex.exec(content)) !== null) {
      tags.push(match[1]);
    }
    return tags;
  }

  // Helper method to check if content is a todo
  isTodo(content) {
    return content.toLowerCase().includes("- - [ ]") ||
           content.toLowerCase().includes("[x]") ||
           content.toLowerCase().includes("todo:") ||
           content.toLowerCase().includes("待办:");
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

        return {
          id: id || 0,
          name: memo.name || "",
          content: memoContent,
          tags: this.extractTags(memoContent),
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
        const tagString = tags.map(tag => `#${tag}`).join(" ");
        finalContent = `${content}\n\n${tagString}`;
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

      return this.formatResponse({
        id: id || 0,
        name: memo.name || "",
        content: memo.content || finalContent,
        tags: this.extractTags(memo.content || finalContent),
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
      try {
        response = await this.client.get("/api/v1/memos");
      } catch (error) {
        response = await this.client.get("/api/memo");
      }
      let memos = response.data || [];

      // Filter for todos
      memos = memos.filter(memo => this.isTodo(memo.content));

      // Filter out completed todos if needed
      if (!includeCompleted) {
        memos = memos.filter(memo =>
          !memo.content.toLowerCase().includes("[x]") &&
          !memo.content.toLowerCase().includes("完成")
        );
      }

      // Limit results
      memos = memos.slice(0, limit);

      // Parse todo items
      const todos = memos.map(memo => {
        const content = memo.content;
        const isCompleted = content.toLowerCase().includes("[x]") ||
                           content.toLowerCase().includes("完成");

        // Extract todo title (first line or todo marker)
        let title = content.split('\n')[0];
        if (title.includes("- - [ ]") || title.includes("[x]")) {
          title = title.replace(/\[[ x]\]\s*/, "").trim();
        }

        return {
          id: memo.id,
          title,
          content,
          isCompleted,
          tags: this.extractTags(content),
          createdAt: memo.createdTs ? new Date(memo.createdTs * 1000).toISOString() : null,
          priority: this.extractPriority(content),
        };
      });

      return this.formatResponse({
        count: todos.length,
        todos,
      }, `Found ${todos.length} todo items`);
    } catch (error) {
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

  // Create todo
  async createTodo({ title, description = "", tags = [], priority = "medium" }) {
    try {
      // Format todo content
      let content = `- - [ ] ${title}`;
      if (description) {
        content += `\n\n${description}`;
      }

      // Add priority tag
      content += `\n\npriority: ${priority}`;

      // Add tags
      if (tags.length > 0) {
        const tagString = tags.map(tag => `#${tag}`).join(" ");
        content += `\n${tagString}`;
      }

      // Add todo tag
      content += `\n#todo`;

      return await this.createMemo({
        content,
        tags: [...tags, "todo"],
        visibility: "private",
      });
    } catch (error) {
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
      content = content.replace("- - [ ]", "[x]");
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

      return this.formatResponse({
        id: memoId || id,
        name: directMemo.name || "",
        content: directMemo.content || "",
        tags: this.extractTags(directMemo.content || ""),
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