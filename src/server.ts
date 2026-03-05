import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  Tool,
} from '@modelcontextprotocol/sdk/types.js';
import { z } from 'zod';
import path from 'path';
import os from 'os';
import { MemoryLoader } from './memory/loader.js';
import { MemoryWriter } from './memory/writer.js';
import { MemorySearch } from './memory/search.js';
import { MemoryPruner } from './memory/pruner.js';
import { MemoryStatsCollector } from './memory/stats.js';
import { MemoryConfig } from './types.js';

export class SharedMemoryServer {
  private server: Server;
  private config: MemoryConfig;
  private loader: MemoryLoader;
  private writer: MemoryWriter;
  private search: MemorySearch;
  private pruner: MemoryPruner;
  private stats: MemoryStatsCollector;

  constructor(contextPath?: string) {
    // Default to current working directory or home/.ai-context
    const defaultPath = contextPath ||
      process.env.AI_CONTEXT_PATH ||
      path.join(process.cwd(), '.ai-context');

    this.config = {
      contextPath: defaultPath,
      indexFile: 'INDEX.mdl',
      topicsDir: 'topics',
      maxIndexTokens: 500,
      maxTopicTokens: 800,
    };

    this.loader = new MemoryLoader(this.config);
    this.writer = new MemoryWriter(this.config);
    this.search = new MemorySearch(this.config);
    this.pruner = new MemoryPruner(this.config);
    this.stats = new MemoryStatsCollector(this.config);

    this.server = new Server(
      {
        name: 'shared-memory-mcp',
        version: '1.0.0',
      },
      {
        capabilities: {
          tools: {},
        },
      }
    );

    this.setupToolHandlers();
  }

  private setupToolHandlers() {
    // List available tools
    this.server.setRequestHandler(ListToolsRequestSchema, async () => {
      const tools: Tool[] = [
        {
          name: 'memory_load',
          description: 'Load INDEX and optionally specific topic files. Returns memory content optimized for token efficiency.',
          inputSchema: {
            type: 'object',
            properties: {
              topics: {
                type: 'array',
                items: { type: 'string' },
                description: 'Optional list of topic names to load (e.g., ["auth", "api"]). If not provided, only INDEX is loaded.',
              },
            },
          },
        },
        {
          name: 'memory_search',
          description: 'Search memory by keywords and automatically load relevant topics. More efficient than loading everything.',
          inputSchema: {
            type: 'object',
            properties: {
              query: {
                type: 'string',
                description: 'Search query with keywords (e.g., "authentication jwt tokens")',
              },
              maxTopics: {
                type: 'number',
                description: 'Maximum number of topics to load (default: 3)',
                default: 3,
              },
            },
            required: ['query'],
          },
        },
        {
          name: 'memory_update',
          description: 'Update a specific line in a memory file. Use this for surgical edits to minimize token usage.',
          inputSchema: {
            type: 'object',
            properties: {
              file: {
                type: 'string',
                description: 'File name (e.g., "INDEX.mdl" or "auth")',
              },
              line: {
                type: 'number',
                description: 'Line number to update (1-indexed)',
              },
              content: {
                type: 'string',
                description: 'New content for the line',
              },
            },
            required: ['file', 'line', 'content'],
          },
        },
        {
          name: 'memory_append',
          description: 'Append content to a specific section in a memory file.',
          inputSchema: {
            type: 'object',
            properties: {
              file: {
                type: 'string',
                description: 'File name (e.g., "INDEX.mdl" or "auth")',
              },
              section: {
                type: 'string',
                description: 'Section name (e.g., "PATTERNS", "IMPLEMENTATION")',
              },
              content: {
                type: 'string',
                description: 'Content to append',
              },
            },
            required: ['file', 'section', 'content'],
          },
        },
        {
          name: 'memory_delete',
          description: 'Delete a line or section from a memory file.',
          inputSchema: {
            type: 'object',
            properties: {
              file: {
                type: 'string',
                description: 'File name (e.g., "INDEX.mdl" or "auth")',
              },
              line: {
                type: 'number',
                description: 'Line number to delete (optional, use this OR section)',
              },
              section: {
                type: 'string',
                description: 'Section name to delete (optional, use this OR line)',
              },
            },
            required: ['file'],
          },
        },
        {
          name: 'memory_create_topic',
          description: 'Create a new topic file from template.',
          inputSchema: {
            type: 'object',
            properties: {
              name: {
                type: 'string',
                description: 'Topic name (e.g., "deploy", "testing")',
              },
              keywords: {
                type: 'array',
                items: { type: 'string' },
                description: 'Keywords for this topic (used for search matching)',
              },
              priority: {
                type: 'string',
                enum: ['high', 'medium', 'low'],
                description: 'Topic priority (default: medium)',
                default: 'medium',
              },
            },
            required: ['name', 'keywords'],
          },
        },
        {
          name: 'memory_stats',
          description: 'Get token counts and statistics for all memory files. Use this to monitor memory efficiency.',
          inputSchema: {
            type: 'object',
            properties: {},
          },
        },
        {
          name: 'memory_prune',
          description: 'Automatically prune old entries from the CURRENT section in INDEX.',
          inputSchema: {
            type: 'object',
            properties: {
              daysToKeep: {
                type: 'number',
                description: 'Number of days to keep (default: 7)',
                default: 7,
              },
            },
          },
        },
        {
          name: 'memory_list_topics',
          description: 'List all available topic files.',
          inputSchema: {
            type: 'object',
            properties: {},
          },
        },
      ];

      return { tools };
    });

    // Handle tool calls
    this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
      try {
        const { name, arguments: args } = request.params;

        switch (name) {
          case 'memory_load': {
            const topics = (args?.topics as string[]) || [];
            const index = await this.loader.loadIndex();
            let content = index;
            const loadedTopics: string[] = [];

            if (topics.length > 0) {
              const topicFiles = await this.loader.loadTopics(topics);
              for (const topic of topicFiles) {
                content += `\n\n# TOPIC: ${topic.name}\n\n${topic.content}`;
                loadedTopics.push(topic.name);
              }
            }

            return {
              content: [
                {
                  type: 'text',
                  text: JSON.stringify({
                    success: true,
                    loadedTopics,
                    content,
                  }, null, 2),
                },
              ],
            };
          }

          case 'memory_search': {
            const query = args?.query as string;
            const maxTopics = (args?.maxTopics as number) || 3;

            if (!query) {
              throw new Error('query is required');
            }

            const result = await this.search.search(query, maxTopics);

            return {
              content: [
                {
                  type: 'text',
                  text: JSON.stringify({
                    success: true,
                    matchedTopics: result.matchedTopics,
                    tokenCount: result.tokenCount,
                    content: result.content,
                  }, null, 2),
                },
              ],
            };
          }

          case 'memory_update': {
            const file = args?.file as string;
            const line = args?.line as number;
            const content = args?.content as string;

            if (!file || !line || content === undefined) {
              throw new Error('file, line, and content are required');
            }

            await this.writer.updateLine(file, line, content);

            return {
              content: [
                {
                  type: 'text',
                  text: JSON.stringify({
                    success: true,
                    message: `Updated ${file} line ${line}`,
                  }),
                },
              ],
            };
          }

          case 'memory_append': {
            const file = args?.file as string;
            const section = args?.section as string;
            const content = args?.content as string;

            if (!file || !section || !content) {
              throw new Error('file, section, and content are required');
            }

            await this.writer.appendToSection(file, section, content);

            return {
              content: [
                {
                  type: 'text',
                  text: JSON.stringify({
                    success: true,
                    message: `Appended to ${file} section ${section}`,
                  }),
                },
              ],
            };
          }

          case 'memory_delete': {
            const file = args?.file as string;
            const line = args?.line as number | undefined;
            const section = args?.section as string | undefined;

            if (!file) {
              throw new Error('file is required');
            }

            if (line !== undefined) {
              await this.writer.deleteLine(file, line);
              return {
                content: [
                  {
                    type: 'text',
                    text: JSON.stringify({
                      success: true,
                      message: `Deleted ${file} line ${line}`,
                    }),
                  },
                ],
              };
            } else if (section) {
              await this.writer.deleteSection(file, section);
              return {
                content: [
                  {
                    type: 'text',
                    text: JSON.stringify({
                      success: true,
                      message: `Deleted ${file} section ${section}`,
                    }),
                  },
                ],
              };
            } else {
              throw new Error('Either line or section must be provided');
            }
          }

          case 'memory_create_topic': {
            const topicName = args?.name as string;
            const keywords = args?.keywords as string[];
            const priority = (args?.priority as string) || 'medium';

            if (!topicName || !keywords) {
              throw new Error('name and keywords are required');
            }

            await this.writer.createTopic(topicName, keywords, priority);

            return {
              content: [
                {
                  type: 'text',
                  text: JSON.stringify({
                    success: true,
                    message: `Created topic ${topicName}`,
                    file: `topics/${topicName}.mdl`,
                  }),
                },
              ],
            };
          }

          case 'memory_stats': {
            const stats = await this.stats.getStats();
            const health = await this.stats.checkHealth();

            return {
              content: [
                {
                  type: 'text',
                  text: JSON.stringify({
                    success: true,
                    stats,
                    health,
                  }, null, 2),
                },
              ],
            };
          }

          case 'memory_prune': {
            const daysToKeep = (args?.daysToKeep as number) || 7;
            const pruned = await this.pruner.pruneCurrentSection(daysToKeep);

            return {
              content: [
                {
                  type: 'text',
                  text: JSON.stringify({
                    success: true,
                    message: `Pruned ${pruned} old entries`,
                    daysToKeep,
                  }),
                },
              ],
            };
          }

          case 'memory_list_topics': {
            const topics = await this.loader.listTopics();

            return {
              content: [
                {
                  type: 'text',
                  text: JSON.stringify({
                    success: true,
                    topics,
                  }, null, 2),
                },
              ],
            };
          }

          default:
            throw new Error(`Unknown tool: ${name}`);
        }
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify({
                success: false,
                error: errorMessage,
              }),
            },
          ],
          isError: true,
        };
      }
    });
  }

  async start() {
    const transport = new StdioServerTransport();
    await this.server.connect(transport);
    console.error('Shared Memory MCP Server running on stdio');
    console.error(`Context path: ${this.config.contextPath}`);
  }
}
