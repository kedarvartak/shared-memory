# PageIndex vs Vector Embeddings: Analysis for Shared Memory MCP

## Executive Summary

**Recommendation**: Implement PageIndex-inspired reasoning-based retrieval as the PRIMARY method, keep vector search as fallback.

**Why**: Our memory structure is ALREADY hierarchical and document-like, making PageIndex a perfect fit.

---

## What is PageIndex?

PageIndex is a "vectorless RAG" approach that replaces vector embeddings with:

1. **Tree Structure Generation**: Documents → hierarchical tree with summaries
2. **LLM Reasoning**: Give LLM the tree, ask it to reason about relevant nodes
3. **Selective Retrieval**: Load only nodes the LLM identifies as relevant

### Key Innovation

Instead of: `query → embedding → cosine similarity → top-k`

PageIndex does: `query → LLM analyzes tree structure → reasoned selection → retrieve`

---

## Why PageIndex is PERFECT for Our Use Case

### 1. We Already Have Tree Structure!

```
INDEX.mdl (root)
├── @meta
├── STACK
├── ARCH
│   ├── auth: JWT | src/auth/jwt.ts
│   ├── api: REST+tRPC | src/api
│   └── db: Prisma | src/db
├── PATTERNS
├── CURRENT
└── TOPICS → auth api db deploy

topics/
├── auth.mdl
│   ├── OVERVIEW
│   ├── IMPLEMENTATION
│   ├── PATTERNS
│   └── ERRORS
├── api.mdl
└── db.mdl
```

This is EXACTLY the tree structure PageIndex expects!

### 2. Relationships Matter

**Vector approach**:
- Treats topics independently
- "auth" and "api" might both match, but why?
- No understanding of connections

**PageIndex approach**:
- LLM sees: "INDEX mentions auth handles JWT, api has /auth endpoints"
- Reasons: "Query about JWT → need auth topic (primary) + api topic (has auth endpoints)"
- **Understands relationships**

### 3. Token Efficiency

**Current vector approach**:
```
Query: "JWT expiry"
→ Compute embedding (100ms)
→ Compare with all topics (50ms)
→ Load top 3 topics (~2000 tokens)
```

**PageIndex approach**:
```
Query: "JWT expiry"
→ Load INDEX only (500 tokens)
→ LLM reasons: "auth topic handles JWT" (50 tokens)
→ Load only auth topic (~800 tokens)
Total: 1350 tokens vs 2000+ tokens
```

**Better targeting = fewer tokens loaded**

### 4. Explainability

**Vector search output**:
```json
{
  "matchedTopics": ["auth", "api"],
  "scores": [0.82, 0.65]
}
```
Why 0.82? Why not 0.75? Unclear.

**PageIndex output**:
```json
{
  "reasoning": "The query asks about JWT expiry. Based on INDEX,
                the 'auth' topic handles JWT tokens with expiry
                configuration (15m/7d). The 'api' topic has auth
                endpoints that might use these tokens.",
  "selectedTopics": ["auth", "api"]
}
```

**We can see the reasoning!**

---

## How PageIndex Works (Simplified)

### Step 1: Tree Generation

```javascript
// We already have this structure!
const tree = {
  "title": "INDEX",
  "node_id": "root",
  "summary": "Core project memory with stack, architecture, patterns",
  "children": [
    {
      "node_id": "auth",
      "title": "Authentication",
      "summary": "JWT-based auth with refresh tokens, OAuth integration",
      "keywords": ["auth", "jwt", "oauth", "tokens"]
    },
    {
      "node_id": "api",
      "title": "API Endpoints",
      "summary": "REST and tRPC endpoints with Zod validation",
      "keywords": ["api", "rest", "trpc", "endpoints"]
    }
  ]
}
```

### Step 2: Reasoning-Based Retrieval

```typescript
const prompt = `
You are given a tree structure of project memory.
Each node has: id, title, summary, keywords

Query: "${userQuery}"

Tree structure:
${JSON.stringify(tree, null, 2)}

Analyze which nodes are relevant to answering the query.
Consider:
- Direct keyword matches
- Conceptual relationships
- Dependencies between topics

Respond with JSON:
{
  "reasoning": "Your step-by-step thinking",
  "selectedTopics": ["topic1", "topic2"]
}
`;

const result = await callLLM(prompt);
// LLM reasons through the tree and selects relevant nodes
```

### Step 3: Load Selected Content

```typescript
const selected = JSON.parse(result);
for (const topicId of selected.selectedTopics) {
  content += await loadTopic(topicId);
}
```

---

## Comparison Matrix

| Feature | Vector Embeddings | PageIndex | Winner |
|---------|------------------|-----------|--------|
| **Setup** | Download 50MB model | Use existing LLM | PageIndex |
| **Structure** | Flat embeddings | Hierarchical tree | PageIndex |
| **Relationships** | None (independent) | Understands hierarchy | PageIndex |
| **Explainability** | Opaque scores | LLM reasoning | PageIndex |
| **Token usage** | Always load same amount | Selective loading | PageIndex |
| **Speed (cold)** | 2-3s model init | Instant | PageIndex |
| **Speed (warm)** | 100-200ms | 300-500ms | Vector |
| **Offline** | Yes | No (needs LLM) | Vector |
| **Accuracy** | Good | Excellent | PageIndex |

---

## Real-World Examples

### Example 1: Multi-Topic Query

**Query**: "How do we deploy the API to production?"

**Vector approach**:
```
Embeddings:
  deploy.mdl: 0.78
  api.mdl: 0.65
  db.mdl: 0.42

Loads: deploy, api (based on threshold)
```

**PageIndex approach**:
```
LLM reasoning:
"Query involves both deployment and API.
- deploy topic: has CI/CD and production deployment
- api topic: has API-specific configuration
- db topic: might have migration info (related)

Selected: deploy, api, db"

Loads: deploy, api, db (based on reasoning)
```

**Result**: PageIndex includes `db` (migrations needed for deployment) that vector search missed!

### Example 2: Synonym Handling

**Query**: "user login problems"

**Vector approach**:
```
"login" embedding similar to "auth" embedding
Score: 0.75
Loads: auth
```

**PageIndex approach**:
```
LLM reasoning:
"'login' relates to authentication.
INDEX shows auth topic handles JWT and OAuth.
API topic has /login endpoint.

Selected: auth, api"

Loads: auth, api (more complete)
```

### Example 3: Debugging Query

**Query**: "Why are users getting 401 errors?"

**Vector approach**:
```
"401" and "error" → generic matches
Loads: auth (0.68), api (0.65)
```

**PageIndex approach**:
```
LLM reasoning:
"401 = Unauthorized = authentication issue.
- auth topic: JWT validation, token expiry
- api topic: endpoint authentication middleware
- Common issue: token expiry or invalid refresh

Selected: auth (primary), api (related)"

Loads: auth, api with context
```

**Better**: LLM understands 401 = auth problem

---

## Implementation Plan

### Phase 1: Basic Tree Reasoning (Week 1)

```typescript
// New tool: memory_search_reasoning
async function memory_search_reasoning(query: string) {
  // 1. Load INDEX (our tree root)
  const index = await loader.loadIndex();

  // 2. Extract topic summaries from INDEX
  const tree = buildTreeFromIndex(index);

  // 3. LLM reasoning
  const prompt = `
    Query: ${query}
    Tree: ${JSON.stringify(tree)}

    Which topics are relevant? Why?
  `;

  const reasoning = await callLLM(prompt);

  // 4. Load selected topics
  const selected = parseReasoningResult(reasoning);
  return loadTopics(selected);
}
```

### Phase 2: Multi-Level Tree (Week 2)

```typescript
// Include topic sections in tree
const tree = {
  INDEX: {
    children: {
      auth: {
        sections: ["OVERVIEW", "IMPLEMENTATION", "ERRORS"]
      }
    }
  }
};

// LLM can select specific sections
// "Load auth.ERRORS section only"
```

### Phase 3: Hybrid Approach (Week 3)

```typescript
// Combine reasoning + vector for best results
async function memory_search_hybrid(query: string) {
  // Fast: Vector search for quick filtering
  const vectorCandidates = await vectorSearch(query, maxTopics: 5);

  // Accurate: LLM reasoning on candidates
  const reasoningResult = await reasoningSearch(
    query,
    candidates: vectorCandidates
  );

  return reasoningResult;
}
```

---

## Token Cost Analysis

### Scenario: "How do we handle authentication?"

**Vector approach**:
```
Embedding computation: 0 tokens (cached)
Load INDEX: 500 tokens
Load top 3 topics: 2400 tokens
Total: 2900 tokens
```

**PageIndex approach**:
```
Load INDEX: 500 tokens
LLM reasoning prompt: 600 tokens
LLM response: 100 tokens
Load 2 relevant topics: 1600 tokens
Total: 2800 tokens
```

**Savings**: ~100 tokens (3-5%)

**BUT**: More accurate selection means often loading fewer irrelevant topics!

### Scenario: "What's the JWT token expiry?"

**Vector approach** (loads 3 topics):
```
INDEX: 500
auth: 800 ✓ (relevant)
api: 700 ✗ (not needed for expiry)
db: 600 ✗ (not needed)
Total: 2600 tokens
```

**PageIndex approach** (loads 1 topic):
```
INDEX: 500
Reasoning: 100
auth: 800 ✓ (only relevant)
Total: 1400 tokens
```

**Savings**: 1200 tokens (46%)!

---

## Challenges & Solutions

### Challenge 1: LLM Latency

**Problem**: LLM call adds 300-500ms

**Solutions**:
- Cache reasoning results for similar queries
- Use faster models (Claude Haiku, GPT-4o-mini)
- Parallel: Start LLM reasoning while loading INDEX

### Challenge 2: LLM Costs

**Problem**: Each search = 1 LLM call

**Solutions**:
- Use cheaper models ($0.001 per query)
- Cache common queries
- Fallback to keyword search for simple queries

### Challenge 3: Offline Support

**Problem**: Requires LLM (not fully offline)

**Solutions**:
- Keep keyword search as offline fallback
- Local LLM option (Ollama, llama.cpp)
- Hybrid: Vector for offline, reasoning for online

---

## Recommended Architecture

```typescript
// memory_search (main entry point)
async function memory_search(query: string, method?: 'auto' | 'reasoning' | 'vector' | 'keyword') {
  if (method === 'auto') {
    // Decide based on query complexity
    if (isSimpleKeywordQuery(query)) {
      return keyword_search(query);
    } else {
      return reasoning_search(query);
    }
  }

  switch (method) {
    case 'reasoning':
      return reasoning_search(query);  // PageIndex-inspired
    case 'vector':
      return vector_search(query);      // Semantic embeddings
    case 'keyword':
      return keyword_search(query);     // Simple matching
  }
}
```

---

## Next Steps

1. **Implement `memory_search_reasoning` tool**
   - Build tree from INDEX
   - LLM reasoning prompt
   - Parse results and load topics

2. **Add reasoning cache**
   - Cache LLM responses for similar queries
   - Reduce costs and latency

3. **Benchmark**
   - Compare accuracy vs vector search
   - Measure token usage
   - Test on real queries

4. **Hybrid mode**
   - Use vector for initial filtering
   - Use reasoning for final selection
   - Best of both worlds

---

## Conclusion

**PageIndex is a BETTER fit for our use case** because:

✅ Our memory is already hierarchical (tree-like)
✅ Relationships between topics matter (auth ↔ api ↔ db)
✅ Explainability is valuable (know WHY topics selected)
✅ Can be more token-efficient (selective loading)
✅ No model download or embedding cache needed
✅ Leverages existing LLM (no new dependencies)

**Recommendation**:
- Implement PageIndex-inspired reasoning as PRIMARY method
- Keep vector search for specific use cases (offline, speed-critical)
- Default to reasoning for best accuracy

Let's build it! 🚀
