# MDL Specification (Memory Description Language)

**Version**: 1.0
**Purpose**: Optimal token-efficient format for AI memory persistence

## Design Goals

1. ✅ Minimize token consumption (~60% less than markdown)
2. ✅ Maintain human readability
3. ✅ Structured and parseable
4. ✅ Support hierarchical data
5. ✅ Quick to scan and update

## Syntax Rules

### Basic Key-Value
```
key: value
```

### Inline Properties (pipe separator)
```
key: value1 | prop2:value2 | prop3:value3
```

### Lists (comma separator)
```
tags: frontend,backend,api
files: src/auth/*.ts,src/api/*.ts
```

### Nested Structure (indentation)
```
parent:
  child1: value
  child2: value
```

### Function-like Grouping
```
# Named parameters
tokens(access:15m, refresh:7d)

# Positional parameters
tokens(15m/7d)

# Mixed
cache(ttl:300s, keys:user:*,session:*)
```

### Metadata (@ prefix)
```
@meta: updated=2026-03-05 | priority=high
@deprecated: use new.mdl instead
```

### File Paths
```
src/path/to/file.ts
src/api/*.ts
src/api/**/*.test.ts
```

### Time Units
```
15m   → 15 minutes
7d    → 7 days
300s  → 300 seconds
2h    → 2 hours
30w   → 30 weeks
```

### Comments
```
# This is a comment
```

### Sections (markdown headers)
```
## SECTION NAME
```

### Special Markers
```
TODO: thing to do
FIXME: thing to fix
BREAKING: breaking change
DEPRECATED: old thing
❌ Don't do this
✅ Do this
```

## Token Optimization Techniques

### 1. Use Shorthand Keys
```
# BAD (verbose)
authentication: JWT
implementation: src/auth/jwt.ts

# GOOD (compact)
auth: JWT | impl:src/auth/jwt.ts
```

### 2. Inline Related Data
```
# BAD (multiple lines)
access_token:
  expiry: 15m
refresh_token:
  expiry: 7d

# GOOD (inline)
tokens: access:15m,refresh:7d
OR
tokens(access:15m, refresh:7d)
```

### 3. Use Symbols Over Words
```
# Instead of "and"
Node 20 + TypeScript 5

# Instead of "or"
admin|moderator|owner

# Instead of "greater than"
coverage>80%

# Instead of "range"
node:18-20
```

### 4. Omit Obvious Context
```
# BAD
file_location: src/auth/jwt.ts
database_connection: src/db/client.ts

# GOOD
auth: src/auth/jwt.ts
db: src/db/client.ts
```

### 5. Positional Notation
```
# When order is obvious
jwt(secret, algorithm, expiry)
vs
jwt(secret:xxx, algorithm:HS256, expiry:15m)
```

## File Structure

### INDEX.mdl (always loaded)
- Meta information
- Stack overview
- Architecture summary
- Patterns and conventions
- Current work (auto-pruned)
- Topic index with keywords

**Target size**: 50-100 lines (~500 tokens)

### Topic files (lazy loaded)
- Detailed information on specific area
- Implementation details
- Code locations
- Common patterns
- Known issues

**Target size**: 30-80 lines (~300-800 tokens)

## Update Protocol (for AI)

### Adding Information
```bash
# Add new line to section
Add to topics/auth.mdl:
  mfa: TOTP | src/auth/mfa.ts | lib:otplib

# Append to list
Update topics/auth.mdl:
  oauth: Google,GitHub → Google,GitHub,Microsoft
```

### Updating Information
```bash
# Change specific value
Update INDEX.mdl line 12:
  tokens(access:15m,refresh:7d) → tokens(access:30m,refresh:14d)

# Replace section
Replace topics/api.mdl section "## ENDPOINTS" with:
  [new content]
```

### Deleting Information
```bash
# Remove line
Delete topics/auth.mdl line 23

# Remove deprecated section
Delete topics/api.mdl section "## DEPRECATED"
```

## Parsing Strategy (for AI)

1. **Always load** INDEX.mdl first
2. **Extract keywords** from user query
3. **Match keywords** against topic index
4. **Load relevant** topic files
5. **Parse hierarchically** (sections → lines → inline properties)
6. **Update surgically** (edit specific lines, not entire files)

## Examples

### Before (Markdown - 180 tokens)
```markdown
# Database Configuration

We use PostgreSQL 16 with Prisma ORM.

## Connection
The database connection is established in src/db/client.ts.

## Migrations
Migrations are stored in prisma/migrations directory.
We use Prisma Migrate for managing schema changes.

## Query Patterns
- Always use transactions for multi-step operations
- Use select to limit fields and improve performance
- Use include carefully to avoid N+1 queries
```

### After (MDL - 65 tokens)
```mdl
## DB
db: PostgreSQL 16 + Prisma ORM
conn: src/db/client.ts
migrations: prisma/migrations | tool:Prisma Migrate

## PATTERNS
- Use transactions for multi-step ops
- Use select to limit fields (perf)
- Use include carefully (avoid N+1)
```

**Token reduction: 64%**

## Validation

To ensure optimal token usage:

1. **Measure tokens** for each file (use tokenizer)
2. **Target**: INDEX < 500 tokens, topics < 800 tokens
3. **Prune** outdated information weekly
4. **Compress** verbose sections
5. **Archive** rarely-used data

## Tools Support

This format is:
- ✅ Easy to parse (Python/Node/CLI)
- ✅ Git-friendly (clean diffs)
- ✅ Grep-friendly (flat structure)
- ✅ IDE-friendly (markdown-like syntax highlighting)
- ✅ Human-editable (clear syntax)
