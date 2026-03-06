import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  ListPromptsRequestSchema,
  GetPromptRequestSchema,
  ListResourcesRequestSchema,
  ReadResourceRequestSchema,
  Tool,
} from '@modelcontextprotocol/sdk/types.js';
import path from 'path';
import { BlockManager } from './memory/blockManager.js';
import { BlockContext } from './memory/blockContext.js';

export class SharedMemoryServer {
  private server: Server;
  private memoryRoot: string;
  private blockManager: BlockManager;
  private blockContexts: Map<string, BlockContext> = new Map();

  constructor(memoryRoot?: string) {
    this.memoryRoot = memoryRoot ||
      process.env.AI_MEMORY_PATH ||
      path.join(process.cwd(), '.ai-memory');

    this.blockManager = new BlockManager(this.memoryRoot);

    this.server = new Server(
      {
        name: 'shared-memory-mcp',
        version: '3.0.0',
      },
      {
        capabilities: {
          tools: {},
          prompts: {},
          resources: {},
        },
      }
    );

    this.setupToolHandlers();
    this.setupPromptHandlers();
    this.setupResourceHandlers();
  }

  /**
   * Get or create a block context for the given block name
   */
  private getBlockContext(blockName: string): BlockContext {
    if (!this.blockContexts.has(blockName)) {
      this.blockContexts.set(blockName, new BlockContext(this.memoryRoot, blockName));
    }
    return this.blockContexts.get(blockName)!;
  }

  private setupToolHandlers() {
    // List available tools
    this.server.setRequestHandler(ListToolsRequestSchema, async () => {
      const tools: Tool[] = [
        {
          name: 'memory_create_block',
          description: 'Create a new memory block for a specific service/project/feature. Each block has its own INDEX and topics.',
          inputSchema: {
            type: 'object',
            properties: {
              name: {
                type: 'string',
                description: 'Block name (e.g., "auth-service", "api-gateway", "frontend")',
              },
              description: {
                type: 'string',
                description: 'What this block is for',
              },
            },
            required: ['name'],
          },
        },
        {
          name: 'memory_list_blocks',
          description: 'List all available memory blocks.',
          inputSchema: {
            type: 'object',
            properties: {},
          },
        },
        {
          name: 'memory_select_blocks',
          description: 'Select which memory blocks to work with in this session. You will be prompted to select blocks at session start.',
          inputSchema: {
            type: 'object',
            properties: {
              blocks: {
                type: 'array',
                items: { type: 'string' },
                description: 'Array of block names to select',
              },
            },
            required: ['blocks'],
          },
        },
        {
          name: 'memory_delete_block',
          description: 'Delete a memory block permanently.',
          inputSchema: {
            type: 'object',
            properties: {
              name: {
                type: 'string',
                description: 'Block name to delete',
              },
            },
            required: ['name'],
          },
        },
        {
          name: 'memory_load',
          description: 'Load INDEX and optionally specific topic files from a memory block.',
          inputSchema: {
            type: 'object',
            properties: {
              block: {
                type: 'string',
                description: 'Block name to load from',
              },
              topics: {
                type: 'array',
                items: { type: 'string' },
                description: 'Optional list of topic names to load',
              },
            },
            required: ['block'],
          },
        },
        {
          name: 'memory_update',
          description: 'Update a specific line in a memory file within a block.',
          inputSchema: {
            type: 'object',
            properties: {
              block: {
                type: 'string',
                description: 'Block name',
              },
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
            required: ['block', 'file', 'line', 'content'],
          },
        },
        {
          name: 'memory_append',
          description: 'Append content to a specific section in a memory file within a block.',
          inputSchema: {
            type: 'object',
            properties: {
              block: {
                type: 'string',
                description: 'Block name',
              },
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
            required: ['block', 'file', 'section', 'content'],
          },
        },
        {
          name: 'memory_delete',
          description: 'Delete a line or section from a memory file within a block.',
          inputSchema: {
            type: 'object',
            properties: {
              block: {
                type: 'string',
                description: 'Block name',
              },
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
            required: ['block', 'file'],
          },
        },
        {
          name: 'memory_create_topic',
          description: 'Create a new topic file within a memory block.',
          inputSchema: {
            type: 'object',
            properties: {
              block: {
                type: 'string',
                description: 'Block name',
              },
              name: {
                type: 'string',
                description: 'Topic name (e.g., "deploy", "testing")',
              },
              keywords: {
                type: 'array',
                items: { type: 'string' },
                description: 'Keywords for this topic',
              },
              priority: {
                type: 'string',
                enum: ['high', 'medium', 'low'],
                description: 'Topic priority (default: medium)',
                default: 'medium',
              },
            },
            required: ['block', 'name', 'keywords'],
          },
        },
        {
          name: 'memory_stats',
          description: 'Get token counts and statistics for a memory block.',
          inputSchema: {
            type: 'object',
            properties: {
              block: {
                type: 'string',
                description: 'Block name',
              },
            },
            required: ['block'],
          },
        },
        {
          name: 'memory_prune',
          description: 'Automatically prune old entries from the CURRENT section in a block\'s INDEX.',
          inputSchema: {
            type: 'object',
            properties: {
              block: {
                type: 'string',
                description: 'Block name',
              },
              daysToKeep: {
                type: 'number',
                description: 'Number of days to keep (default: 7)',
                default: 7,
              },
            },
            required: ['block'],
          },
        },
        {
          name: 'memory_list_topics',
          description: 'List all available topic files in a memory block.',
          inputSchema: {
            type: 'object',
            properties: {
              block: {
                type: 'string',
                description: 'Block name',
              },
            },
            required: ['block'],
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
          case 'memory_create_block': {
            const blockName = args?.name as string;
            const description = args?.description as string | undefined;

            if (!blockName) {
              throw new Error('name is required');
            }

            await this.blockManager.initialize();
            const block = await this.blockManager.createBlock(blockName, description);

            return {
              content: [
                {
                  type: 'text',
                  text: JSON.stringify({
                    success: true,
                    message: `Created memory block "${blockName}"`,
                    block,
                  }, null, 2),
                },
              ],
            };
          }

          case 'memory_list_blocks': {
            const blocks = await this.blockManager.listBlocks();

            return {
              content: [
                {
                  type: 'text',
                  text: JSON.stringify({
                    success: true,
                    blocks,
                    selected: this.blockManager.getSelectedBlocks(),
                  }, null, 2),
                },
              ],
            };
          }

          case 'memory_select_blocks': {
            const blockNames = args?.blocks as string[];

            if (!Array.isArray(blockNames) || blockNames.length === 0) {
              throw new Error('blocks array is required');
            }

            // Verify all blocks exist
            for (const name of blockNames) {
              const block = await this.blockManager.getBlock(name);
              if (!block) {
                throw new Error(`Memory block "${name}" not found`);
              }
            }

            this.blockManager.selectBlocks(blockNames);

            return {
              content: [
                {
                  type: 'text',
                  text: JSON.stringify({
                    success: true,
                    message: `Selected blocks: ${blockNames.join(', ')}`,
                    selected: blockNames,
                  }),
                },
              ],
            };
          }

          case 'memory_delete_block': {
            const blockName = args?.name as string;

            if (!blockName) {
              throw new Error('name is required');
            }

            await this.blockManager.deleteBlock(blockName);
            this.blockContexts.delete(blockName);

            return {
              content: [
                {
                  type: 'text',
                  text: JSON.stringify({
                    success: true,
                    message: `Deleted memory block "${blockName}"`,
                  }),
                },
              ],
            };
          }

          case 'memory_load': {
            const block = args?.block as string;
            const topics = (args?.topics as string[]) || [];

            if (!block) {
              throw new Error('block is required');
            }

            const ctx = this.getBlockContext(block);
            const index = await ctx.loader.loadIndex();
            let content = index;
            const loadedTopics: string[] = [];

            if (topics.length > 0) {
              const topicFiles = await ctx.loader.loadTopics(topics);
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
                    block,
                    loadedTopics,
                    content,
                  }, null, 2),
                },
              ],
            };
          }

          case 'memory_update': {
            const block = args?.block as string;
            const file = args?.file as string;
            const line = args?.line as number;
            const content = args?.content as string;

            if (!block || !file || !line || content === undefined) {
              throw new Error('block, file, line, and content are required');
            }

            const ctx = this.getBlockContext(block);
            await ctx.writer.updateLine(file, line, content);

            return {
              content: [
                {
                  type: 'text',
                  text: JSON.stringify({
                    success: true,
                    message: `Updated ${block}/${file} line ${line}`,
                  }),
                },
              ],
            };
          }

          case 'memory_append': {
            const block = args?.block as string;
            const file = args?.file as string;
            const section = args?.section as string;
            const content = args?.content as string;

            if (!block || !file || !section || !content) {
              throw new Error('block, file, section, and content are required');
            }

            const ctx = this.getBlockContext(block);
            await ctx.writer.appendToSection(file, section, content);

            return {
              content: [
                {
                  type: 'text',
                  text: JSON.stringify({
                    success: true,
                    message: `Appended to ${block}/${file} section ${section}`,
                  }),
                },
              ],
            };
          }

          case 'memory_delete': {
            const block = args?.block as string;
            const file = args?.file as string;
            const line = args?.line as number | undefined;
            const section = args?.section as string | undefined;

            if (!block || !file) {
              throw new Error('block and file are required');
            }

            const ctx = this.getBlockContext(block);

            if (line !== undefined) {
              await ctx.writer.deleteLine(file, line);
              return {
                content: [
                  {
                    type: 'text',
                    text: JSON.stringify({
                      success: true,
                      message: `Deleted ${block}/${file} line ${line}`,
                    }),
                  },
                ],
              };
            } else if (section) {
              await ctx.writer.deleteSection(file, section);
              return {
                content: [
                  {
                    type: 'text',
                    text: JSON.stringify({
                      success: true,
                      message: `Deleted ${block}/${file} section ${section}`,
                    }),
                  },
                ],
              };
            } else {
              throw new Error('Either line or section must be provided');
            }
          }

          case 'memory_create_topic': {
            const block = args?.block as string;
            const topicName = args?.name as string;
            const keywords = args?.keywords as string[];
            const priority = (args?.priority as string) || 'medium';

            if (!block || !topicName || !keywords) {
              throw new Error('block, name, and keywords are required');
            }

            const ctx = this.getBlockContext(block);
            await ctx.writer.createTopic(topicName, keywords, priority);

            return {
              content: [
                {
                  type: 'text',
                  text: JSON.stringify({
                    success: true,
                    message: `Created topic ${topicName} in block ${block}`,
                    file: `${block}/topics/${topicName}.mdl`,
                  }),
                },
              ],
            };
          }

          case 'memory_stats': {
            const block = args?.block as string;

            if (!block) {
              throw new Error('block is required');
            }

            const ctx = this.getBlockContext(block);
            const stats = await ctx.stats.getStats();
            const health = await ctx.stats.checkHealth();

            return {
              content: [
                {
                  type: 'text',
                  text: JSON.stringify({
                    success: true,
                    block,
                    stats,
                    health,
                  }, null, 2),
                },
              ],
            };
          }

          case 'memory_prune': {
            const block = args?.block as string;
            const daysToKeep = (args?.daysToKeep as number) || 7;

            if (!block) {
              throw new Error('block is required');
            }

            const ctx = this.getBlockContext(block);
            const pruned = await ctx.pruner.pruneCurrentSection(daysToKeep);

            return {
              content: [
                {
                  type: 'text',
                  text: JSON.stringify({
                    success: true,
                    block,
                    message: `Pruned ${pruned} old entries`,
                    daysToKeep,
                  }),
                },
              ],
            };
          }

          case 'memory_list_topics': {
            const block = args?.block as string;

            if (!block) {
              throw new Error('block is required');
            }

            const ctx = this.getBlockContext(block);
            const topics = await ctx.loader.listTopics();

            return {
              content: [
                {
                  type: 'text',
                  text: JSON.stringify({
                    success: true,
                    block,
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

  private setupPromptHandlers() {
    this.server.setRequestHandler(ListPromptsRequestSchema, async () => {
      return {
        prompts: [
          {
            name: 'session-start',
            description: 'Initialize new coding session - prompts block selection and loads memory',
          },
          {
            name: 'save-decision',
            description: 'Save important decisions and implementations to memory',
            arguments: [
              {
                name: 'block',
                description: 'Which block to save to',
                required: true,
              },
              {
                name: 'topic',
                description: 'Topic area (auth, api, db, etc)',
                required: true,
              },
              {
                name: 'content',
                description: 'What to remember (compact, token-efficient)',
                required: true,
              },
            ],
          },
          {
            name: 'periodic-save',
            description: 'Periodic checkpoint to save conversation progress',
          },
        ],
      };
    });

    this.server.setRequestHandler(GetPromptRequestSchema, async (request) => {
      const { name, arguments: args } = request.params;

      switch (name) {
        case 'session-start': {
          const blocks = await this.blockManager.listBlocks();

          if (blocks.length === 0) {
            return {
              messages: [
                {
                  role: 'user',
                  content: {
                    type: 'text',
                    text: `MULTI-BLOCK MEMORY SYSTEM ACTIVE

No memory blocks exist yet. Use memory_create_block() to create your first block.

Examples:
- memory_create_block({name: "auth-service", description: "Authentication microservice"})
- memory_create_block({name: "frontend", description: "React frontend app"})
- memory_create_block({name: "api-gateway", description: "API gateway service"})

Each block has its own INDEX and topics, allowing you to organize memory by service/project/feature.`,
                  },
                },
              ],
            };
          }

          const blockList = blocks.map(b => `- ${b.name}${b.description ? `: ${b.description}` : ''}`).join('\n');

          return {
            messages: [
              {
                role: 'user',
                content: {
                  type: 'text',
                  text: `MULTI-BLOCK MEMORY SYSTEM ACTIVE

Available memory blocks:
${blockList}

STEP 1: SELECT BLOCKS
Use memory_select_blocks({blocks: ["block1", "block2"]}) to choose which blocks to work with.

STEP 2: LOAD MEMORY
Use memory_load({block: "block-name"}) to load INDEX and topics.

AUTO-SAVE DURING WORK:
- Decisions made → memory_append({block, file, section, content})
- Features implemented → memory_append()
- Bugs fixed → memory_append()
- Important discussions → memory_append()

FORMAT: compact MDL (topic: detail|detail|detail)
CHECKPOINT: Every 50 messages, save progress`,
                },
              },
            ],
          };
        }

        case 'save-decision': {
          const block = args?.block as string;
          const topic = args?.topic as string;
          const content = args?.content as string;

          return {
            messages: [
              {
                role: 'user',
                content: {
                  type: 'text',
                  text: `Save this to memory:

BLOCK: ${block}
TOPIC: ${topic}
CONTENT: ${content}

Use memory_append({block: "${block}", file: "INDEX.mdl", section: "...", content: "..."}) to save. Use compact MDL format.`,
                },
              },
            ],
          };
        }

        case 'periodic-save': {
          const selected = this.blockManager.getSelectedBlocks();

          return {
            messages: [
              {
                role: 'user',
                content: {
                  type: 'text',
                  text: `Checkpoint: Review conversation and save important information to memory.

Selected blocks: ${selected.length > 0 ? selected.join(', ') : 'none'}

Extract:
- Key decisions made
- Features implemented
- Solutions to problems
- Important patterns/conventions

Use memory_append() for each item, specifying the correct block. Keep it compact.`,
                },
              },
            ],
          };
        }

        default:
          throw new Error(`Unknown prompt: ${name}`);
      }
    });
  }

  private setupResourceHandlers() {
    this.server.setRequestHandler(ListResourcesRequestSchema, async () => {
      const blocks = await this.blockManager.listBlocks();
      const resources = [];

      // Add block list resource
      resources.push({
        uri: 'memory://blocks',
        name: 'Memory Blocks',
        description: 'List of all available memory blocks',
        mimeType: 'application/json',
      });

      // Add resources for each block
      for (const block of blocks) {
        resources.push({
          uri: `memory://${block.name}/INDEX`,
          name: `${block.name} Index`,
          description: `Core memory index for ${block.name}`,
          mimeType: 'text/plain',
        });

        // Add topics for this block
        const ctx = this.getBlockContext(block.name);
        const topics = await ctx.loader.listTopics();
        for (const topic of topics) {
          resources.push({
            uri: `memory://${block.name}/${topic}`,
            name: `${block.name}/${topic}`,
            description: `${topic} topic in ${block.name}`,
            mimeType: 'text/plain',
          });
        }
      }

      return { resources };
    });

    this.server.setRequestHandler(ReadResourceRequestSchema, async (request) => {
      const uri = request.params.uri;

      if (uri === 'memory://blocks') {
        const blocks = await this.blockManager.listBlocks();
        return {
          contents: [
            {
              uri,
              mimeType: 'application/json',
              text: JSON.stringify({
                blocks,
                selected: this.blockManager.getSelectedBlocks(),
              }, null, 2),
            },
          ],
        };
      }

      const match = uri.match(/^memory:\/\/([^/]+)\/(.+)$/);
      if (!match) {
        throw new Error('Invalid memory URI');
      }

      const [, blockName, identifier] = match;
      const ctx = this.getBlockContext(blockName);

      if (identifier === 'INDEX') {
        const content = await ctx.loader.loadIndex();
        return {
          contents: [
            {
              uri,
              mimeType: 'text/plain',
              text: content,
            },
          ],
        };
      } else {
        const topic = await ctx.loader.loadTopic(identifier);
        if (!topic) {
          throw new Error(`Topic not found: ${identifier}`);
        }

        return {
          contents: [
            {
              uri,
              mimeType: 'text/plain',
              text: topic.content,
            },
          ],
        };
      }
    });
  }

  async start() {
    await this.blockManager.initialize();
    const transport = new StdioServerTransport();
    await this.server.connect(transport);
    console.error('Shared Memory MCP Server (Multi-Block) running on stdio');
    console.error(`Memory root: ${this.memoryRoot}`);
  }
}
