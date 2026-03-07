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

  /**
   * Throw if the current session mode is LOAD (read-only).
   * Called at the top of every write tool handler.
   */
  private assertWriteAccess(): void {
    const mode = this.blockManager.getSessionMode();
    if (mode === 'load') {
      throw new Error(
        'READ-ONLY: This session was started in LOAD mode. No writes are permitted. ' +
        'Start a new session and choose EDIT to make changes.'
      );
    }
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
        // ── Block Management Tools ──────────────────────────────────────────
        // ── CCL Session Log Tools ───────────────────────────────────────────
        {
          name: 'memory_save_session',
          description: `Save a compressed conversation log (CCL) for this session. Call this at the end of every session or after major decisions. Write content using CCL notation — DO NOT save things derivable from reading code. ONLY save what cannot be recovered without this conversation:

CCL NOTATION:
✓ decided/implemented [over: rejected-alt | why: reason]
✗ tried but rejected [why: reason | fix: what-replaced-it]
! discovered gotcha / non-obvious bug / surprise fact
? open / unresolved / deferred [context: why deferred]
> code written or file changed → path/to/file.ts:line
Q: question that had a non-obvious answer
A: the answer / resolution
CONTEXT: external constraint shaping code (legal, client, ops, team)

EXAMPLE:
✓ Redis for session cache [over: PG session store | why: lock contention @ 1k rps]
✗ Redis pub/sub for jobs [why: mem leak >10k jobs/hr | fix: BullMQ]
! JWT stored as ms not s → caused all refresh 401s
! AWS SES drops silently above 14/sec (docs say 14/min — wrong)
? rate limiting strategy → deferred Q2 [team split on approach]
> added redisClient wrapper → src/redis/client.ts
Q: why does CORS block OPTIONS?
A: cors() middleware must come before auth guard
CONTEXT: client legal mandates soft deletes on ALL user tables (hard deletes forbidden by contract)`,
          inputSchema: {
            type: 'object',
            properties: {
              block: {
                type: 'string',
                description: 'Block name to save the session under',
              },
              topic: {
                type: 'string',
                description: 'Short description of what this session covered (e.g. "JWT auth & Redis sessions")',
              },
              content: {
                type: 'string',
                description: 'The CCL-formatted session content using the notation described above',
              },
            },
            required: ['block', 'topic', 'content'],
          },
        },
        {
          name: 'memory_load_sessions',
          description: 'Load compressed conversation logs (CCL) from previous sessions. Use this to recall reasoning, rejected alternatives, gotchas, and constraints that cannot be recovered from code.',
          inputSchema: {
            type: 'object',
            properties: {
              block: {
                type: 'string',
                description: 'Block name',
              },
              filter: {
                type: 'string',
                enum: ['recent', 'topic', 'date', 'gotchas', 'open', 'rejections', 'constraints'],
                description: 'How to filter sessions. "recent" = last N sessions. "topic" = by topic keyword. "date" = by date. "gotchas" = sessions with discovered surprises. "open" = sessions with unresolved questions. "rejections" = sessions with rejected alternatives. "constraints" = sessions with external constraints.',
              },
              value: {
                type: 'string',
                description: 'Value for the filter. For "recent": number of sessions (e.g. "3"). For "topic": keyword. For "date": YYYY-MM-DD.',
              },
            },
            required: ['block', 'filter'],
          },
        },
        {
          name: 'memory_list_sessions',
          description: 'List all saved CCL session logs for a block, with metadata (date, topic, token count, flags for gotchas/rejections/open questions). Use this to decide which sessions to load.',
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
        // ── Session Mode ─────────────────────────────────────────────────────
        {
          name: 'memory_set_mode',
          description: `Set the session mode. MUST be called once at session start after the user picks their mode.

  CREATE — User wants to create a brand-new memory block. Writes are allowed.
  LOAD   — User wants to read existing memory only. All writes are BLOCKED server-side.
  EDIT   — User wants to read and update an existing memory block. All writes are allowed.

After calling this tool, load the block's memory automatically:
  - For LOAD/EDIT: call memory_load_sessions({block, filter: "recent", value: "3"})
  - For CREATE: call memory_create_block({name, description}) then start working`,
          inputSchema: {
            type: 'object',
            properties: {
              mode: {
                type: 'string',
                enum: ['create', 'load', 'edit'],
                description: 'create = new block, load = read-only, edit = read+write existing',
              },
              block: {
                type: 'string',
                description: 'Block name (required for load and edit modes)',
              },
            },
            required: ['mode'],
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
          // ── Session Mode Handler ───────────────────────────────────────────

          case 'memory_set_mode': {
            const mode = args?.mode as 'create' | 'load' | 'edit';
            const block = args?.block as string | undefined;

            if (!mode) throw new Error('mode is required');
            if ((mode === 'load' || mode === 'edit') && !block) {
              throw new Error(`block is required for mode="${mode}"`);
            }

            // Validate block exists for load/edit
            if (block) {
              const existing = await this.blockManager.getBlock(block);
              if (!existing) throw new Error(`Memory block "${block}" not found. Use memory_list_blocks() to see available blocks.`);
            }

            this.blockManager.setSessionMode(mode);
            if (block) this.blockManager.selectBlocks([block]);

            const modeDescriptions = {
              create: 'CREATE mode — you may create a new block and write freely.',
              load:   'LOAD mode — memory is available READ-ONLY. No writes will be accepted.',
              edit:   'EDIT mode — memory is loaded and you may read and write freely.',
            };

            return {
              content: [
                {
                  type: 'text',
                  text: JSON.stringify({
                    success: true,
                    mode,
                    block: block || null,
                    message: modeDescriptions[mode],
                    nextStep: mode === 'create'
                      ? `Call memory_create_block({name: "${block || '<name>'}", description: "..."}) to create your block.`
                      : `Call memory_load_sessions({block: "${block}", filter: "recent", value: "3"}) to load memory.`,
                  }, null, 2),
                },
              ],
            };
          }

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

          // ── CCL Session Log Handlers ────────────────────────────────────────

          case 'memory_save_session': {
            this.assertWriteAccess();
            const block = args?.block as string;
            const topic = args?.topic as string;
            const content = args?.content as string;

            if (!block || !topic || !content) {
              throw new Error('block, topic, and content are required');
            }

            const ctx = this.getBlockContext(block);
            const meta = await ctx.cclWriter.saveSession(topic, content);

            return {
              content: [
                {
                  type: 'text',
                  text: JSON.stringify({
                    success: true,
                    message: `Session saved: ${meta.file}`,
                    meta,
                  }, null, 2),
                },
              ],
            };
          }

          case 'memory_load_sessions': {
            const block = args?.block as string;
            const filter = args?.filter as string;
            const value = args?.value as string | undefined;

            if (!block || !filter) {
              throw new Error('block and filter are required');
            }

            const ctx = this.getBlockContext(block);
            let result;

            switch (filter) {
              case 'recent':
                result = await ctx.cclLoader.loadRecent(value ? parseInt(value, 10) : 3);
                break;
              case 'topic':
                if (!value) throw new Error('value (topic keyword) is required for filter=topic');
                result = await ctx.cclLoader.loadByTopic(value);
                break;
              case 'date':
                if (!value) throw new Error('value (YYYY-MM-DD) is required for filter=date');
                result = await ctx.cclLoader.loadByDate(value);
                break;
              case 'gotchas':
                result = await ctx.cclLoader.loadGotchas();
                break;
              case 'open':
                result = await ctx.cclLoader.loadOpen();
                break;
              case 'rejections':
                result = await ctx.cclLoader.loadRejections();
                break;
              case 'constraints':
                result = await ctx.cclLoader.loadConstraints();
                break;
              default:
                throw new Error(`Unknown filter: ${filter}. Use: recent, topic, date, gotchas, open, rejections, constraints`);
            }

            // Build a compact readable output: concatenate all session contents
            const combinedContent = result.sessions
              .map(s => s.content)
              .join('\n\n─────────────────────────────────────\n\n');

            return {
              content: [
                {
                  type: 'text',
                  text: JSON.stringify({
                    success: true,
                    block,
                    filter,
                    sessionsLoaded: result.sessions.length,
                    totalTokens: result.totalTokens,
                    content: combinedContent,
                  }, null, 2),
                },
              ],
            };
          }

          case 'memory_list_sessions': {
            const block = args?.block as string;

            if (!block) {
              throw new Error('block is required');
            }

            const ctx = this.getBlockContext(block);
            const sessions = await ctx.cclLoader.listSessions();
            const summary = await ctx.cclLoader.getSummary();

            return {
              content: [
                {
                  type: 'text',
                  text: JSON.stringify({
                    success: true,
                    block,
                    summary,
                    sessions,
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
        ],
      };
    });

    this.server.setRequestHandler(GetPromptRequestSchema, async (request) => {
      const { name } = request.params;

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
                    text: `SHARED MEMORY SYSTEM — SESSION START

No memory blocks exist yet. This is your first session.

Ask the user:
"I don't see any memory blocks yet. Would you like me to CREATE a new one? If so, what should it be called and what is it for?"

Once they answer, call:
  memory_set_mode({mode: "create"})
  memory_create_block({name: "<name>", description: "<what user said>"})

Then start working normally. Save your conversation at the end using memory_save_session().`,
                  },
                },
              ],
            };
          }

          const blockList = blocks
            .map(b => `  • ${b.name}${b.description ? ` — ${b.description}` : ''}${b.updated ? ` (last updated: ${b.updated})` : ''}`)
            .join('\n');

          return {
            messages: [
              {
                role: 'user',
                content: {
                  type: 'text',
                  text: `SHARED MEMORY SYSTEM — SESSION START

Available memory blocks:
${blockList}

Before doing anything else, ask the user:

"How would you like to work in this session?

  [1] CREATE  — Start a new memory block for a new project or feature
  [2] LOAD    — Load an existing block to read its context (read-only, no changes saved)
  [3] EDIT    — Load an existing block and update/improve it as we work

Please choose 1, 2, or 3."

Then call memory_set_mode() based on their choice:
  [1] CREATE → memory_set_mode({mode: "create"})
  [2] LOAD   → memory_set_mode({mode: "load",   block: "<block-name>"})
  [3] EDIT   → memory_set_mode({mode: "edit",   block: "<block-name>"})

For LOAD and EDIT: after calling memory_set_mode(), immediately load memory:
  memory_load_sessions({block: "<block-name>", filter: "recent", value: "3"})

For EDIT: at end of session, call memory_save_session() with the CCL-compressed conversation.
For LOAD: DO NOT call any write tools — server will reject them.`,
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

      throw new Error('Invalid memory URI or resource not found');
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
