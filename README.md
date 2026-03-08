# Shared Memory MCP

Persistent, cross-session AI memory architecture using Compressed Conversation Logs (CCL) and multi-block organization for scalable, token-efficient context management.

## Architecture Overview

### Session Mode Workflow

![Session Mode Workflow](https://via.placeholder.com/600x400.png?text=Session+Mode+Workflow)

The system operates in three distinct modes:

- **CREATE**: Initialize new conversation sessions with write access
- **LOAD**: Browse existing sessions in read-only mode for reference
- **EDIT**: Modify and update existing session logs

### CCL Architecture

![CCL Architecture](https://via.placeholder.com/600x600.png?text=CCL+Architecture)

Conversation data flows through a compression pipeline:

1. AI conversation produces raw messages
2. CCL Writer compresses and saves to session files
3. Metadata index enables efficient filtering
4. CCL Loader selectively loads relevant sessions
5. Token-efficient context feeds back to AI

### Multi-Block Memory Architecture

![Multi-Block Memory](https://via.placeholder.com/600x400.png?text=Multi-Block+Architecture)

Memory blocks provide isolated contexts for different projects, services, or features. Blocks can be selected independently or combined for cross-cutting workflows.

## Comparison with Standard Approaches

### Memory Persistence

| Aspect                | Standard Approach           | Shared Memory MCP                     |
| --------------------- | --------------------------- | ------------------------------------- |
| Persistence mechanism | Ephemeral context window    | External file-based CCL storage       |
| Session continuity    | Lost between sessions       | Full persistence across sessions      |
| IDE portability       | Context lost on IDE switch  | Shared across all MCP-compatible IDEs |
| Token consumption     | 15,000-25,000 per query     | 1,200-2,000 per query                 |
| Quality degradation   | Begins after 1,000 messages | No degradation                        |

### Memory Organization

| Aspect               | Standard Approach            | Shared Memory MCP                      |
| -------------------- | ---------------------------- | -------------------------------------- |
| Structure            | Flat, chronological messages | Hierarchical blocks by project/service |
| Context isolation    | Single global context        | Independent memory blocks              |
| Scalability          | Limited by context window    | Unlimited with lazy loading            |
| Query efficiency     | Full context scan            | Indexed metadata lookup                |
| Cross-project memory | None                         | Selective block loading                |

### Format Efficiency

| Format           | Token Count | Compression Ratio | Example                                                                                                                                                 |
| ---------------- | ----------- | ----------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Natural language | 50 tokens   | Baseline          | "The authentication system uses JWT tokens. Access tokens expire after 15 minutes. Refresh tokens expire after 7 days. Implementation: src/auth/jwt.ts" |
| Markdown         | 35 tokens   | 30% reduction     | "## Auth\n- JWT tokens\n- Access: 15m\n- Refresh: 7d\n- File: `src/auth/jwt.ts`"                                                                        |
| CCL notation     | 12 tokens   | 76% reduction     | "auth: JWT \| src/auth/jwt.ts \| tokens(15m/7d)"                                                                                                        |

## Core Features

### Compressed Conversation Log (CCL) Format

Symbolic notation system optimized for token efficiency:

```
✓  Decided / implemented
✗  Tried and rejected
!  Discovered gotcha / non-obvious bug
?  Open / unresolved / deferred
>  Code written or file changed
Q: Question posed
A: Answer / resolution
CONTEXT: External constraint
```

Example CCL entry:

```
2024-03-07 | auth-refactor
✓ JWT refresh rotation | Redis TTL = 7d
✗ Session cookies | CORS complications
! Token validation fails silently on exp mismatch
> src/auth/jwt.ts | validateToken() added exp check
? Should we implement token revocation list?
CONTEXT: Mobile clients cannot reliably store HttpOnly cookies
```

### Multi-Block Organization

```
.ai-memory/
└── blocks/
    ├── auth-service/
    │   ├── block.json
    │   ├── sessions/
    │   │   ├── index.json
    │   │   ├── 2024-03-01.ccl
    │   │   └── 2024-03-07.ccl
    ├── api-gateway/
    └── frontend/
```

Each block maintains:

- Independent session history
- Isolated metadata index
- Block-specific configuration

### Session Modes

**CREATE Mode**

- Initialize new conversation sessions
- Automatic compression and metadata extraction
- Write access enabled

**LOAD Mode**

- Read-only session browsing
- Filter by date, topic, gotchas, or open questions
- Zero modification risk

**EDIT Mode**

- Modify existing sessions
- Update metadata and content
- Maintains version history

## Installation

### Method 1: NPX (Recommended)

You can run the server directly using `npx`. This ensures you are always using the latest version without manual installation.

```json
{
  "mcpServers": {
    "shared-memory": {
      "command": "npx",
      "args": ["-y", "shared-memory-mcp"],
      "env": {
        "AI_MEMORY_PATH": "/path/to/your/memory/directory"
      }
    }
  }
}
```

### Method 2: Global Installation

Install the package globally using npm:

```bash
npm install -g shared-memory-mcp
```

After installation, determine the absolute path to the binary:

```bash
which shared-memory-mcp
```

## Configuration

### Claude Code

To add the server to Claude Code, execute the following command:

```bash
claude mcp add shared-memory --transport stdio -- shared-memory-mcp
```

### Cursor / VS Code

1. Navigate to Settings.
2. Select the MCP section.
3. Add a new MCP server and provide the following configuration:

**Using npx:**

```json
{
  "command": "npx",
  "args": ["-y", "shared-memory-mcp"],
  "env": {
    "AI_MEMORY_PATH": "/absolute/path/to/memory"
  }
}
```

**Using Global Binary:**

```json
{
  "command": "shared-memory-mcp",
  "env": {
    "AI_MEMORY_PATH": "/absolute/path/to/memory"
  }
}
```

## MCP Tools Reference

### Block Management

| Tool                   | Description             | Parameters             |
| ---------------------- | ----------------------- | ---------------------- |
| `memory_create_block`  | Create new memory block | `name`, `description?` |
| `memory_list_blocks`   | List all blocks         | None                   |
| `memory_select_blocks` | Set active blocks       | `blocks: string[]`     |
| `memory_delete_block`  | Remove block            | `name`                 |

### Session Operations

| Tool                   | Description           | Parameters                       |
| ---------------------- | --------------------- | -------------------------------- |
| `memory_set_mode`      | Set session mode      | `mode: 'create'\|'load'\|'edit'` |
| `memory_save_session`  | Save CCL session      | `block`, `topic`, `content`      |
| `memory_load_sessions` | Load sessions         | `block`, `filter?`               |
| `memory_list_sessions` | List session metadata | `block`                          |

### Session Filters

- `recent`: N most recent sessions (default: 3)
- `topic:<keyword>`: Filter by topic match
- `date:YYYY-MM-DD`: Sessions from specific date
- `gotchas`: Sessions with discovered bugs
- `open`: Sessions with unresolved questions
- `constraints`: Sessions with external context notes
- `rejections`: Sessions documenting rejected approaches

## Workflow Example

```typescript
// Initialize block
memory_create_block({ name: "auth-service" });
memory_select_blocks({ blocks: ["auth-service"] });

// Start session
memory_set_mode({ mode: "create" });

// After conversation work...
memory_save_session({
  block: "auth-service",
  topic: "JWT refresh rotation",
  content: `
✓ Implemented token refresh rotation
✗ Rejected sliding window approach
! Redis TTL must match refresh expiry
> src/auth/jwt.ts | Added rotateRefreshToken()
? Need to handle concurrent refresh requests?
CONTEXT: Mobile clients may retry failed refreshes
`,
});

// Later session - load relevant history
memory_set_mode({ mode: "load" });
memory_load_sessions({
  block: "auth-service",
  filter: "topic:JWT",
});
```

## Technical Specifications

### Stack

- TypeScript 5.3+
- Node.js 18+
- @modelcontextprotocol/sdk 1.0+
- tiktoken 1.0+ (token counting)
- zod 3.24+ (schema validation)

### Performance Metrics

| Metric               | Value                   |
| -------------------- | ----------------------- |
| Average session size | 200-400 tokens          |
| Compression ratio    | 76% vs natural language |
| Lazy load overhead   | < 50ms per session      |
| Index lookup time    | < 10ms                  |
| Memory footprint     | < 5MB per 100 sessions  |

### File Structure

```
src/
├── index.ts              # Entry point
├── server.ts             # MCP server implementation
├── types.ts              # TypeScript definitions
└── memory/
    ├── blockManager.ts   # Block lifecycle management
    ├── blockContext.ts   # Per-block state management
    ├── cclWriter.ts      # Session compression and saving
    ├── cclLoader.ts      # Session filtering and loading
    └── tokenizer.ts      # Token counting utilities
```

## Use Cases

### Long-Running Projects

Maintain consistent AI context across weeks or months of development without context window degradation.

### Multi-Service Architectures

Isolate memory for microservices, frontend, infrastructure, and documentation in separate blocks.

### Team Collaboration

Share .ai-memory directories via Git for consistent AI context across team members.

### Cross-IDE Workflows

Switch between VS Code, Cursor, Windsurf, or Claude Desktop while maintaining full conversation history.

### Bug Investigation

Query past sessions for similar issues, gotchas, and proven solutions using topic and symbol filters.

## License

MIT

## Repository

https://github.com/kedarvartak/shared-memory
