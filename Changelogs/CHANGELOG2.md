# PageIndex vs Vector Embeddings: Analysis for Shared Memory MCP

## Executive Summary

**Recommendation:** Implement PageIndex-inspired reasoning-based retrieval as the primary method and keep vector search as a fallback.

**Why:** The memory structure is already hierarchical and document-like, making PageIndex a natural fit.

---

# What is PageIndex?

PageIndex is a vectorless RAG approach that replaces vector embeddings with:

1. **Tree Structure Generation:** Documents organized into a hierarchical tree with summaries
2. **LLM Reasoning:** The LLM analyzes the tree and determines relevant nodes
3. **Selective Retrieval:** Only nodes identified as relevant are loaded

### Key Innovation

Instead of:

```
query → embedding → cosine similarity → top-k
```

PageIndex performs:

```
query → LLM analyzes tree structure → reasoned selection → retrieve
```

---

# Why PageIndex Fits This Use Case

## 1. Existing Tree Structure

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

This structure already resembles the hierarchical model expected by PageIndex.

---

## 2. Relationships Between Topics

**Vector approach**

* Treats topics independently
* Multiple topics may match without clear reasoning
* Does not capture topic relationships

**PageIndex approach**

The LLM can reason about relationships between topics.

Example reasoning:

```
Query about JWT → authentication topic is primary
API topic may also be relevant because it contains auth endpoints
```

This enables dependency awareness across topics.

---

## 3. Token Efficiency

**Current vector approach**

```
Query: "JWT expiry"

→ Compute embedding (100 ms)
→ Compare with all topics (50 ms)
→ Load top 3 topics (~2000 tokens)
```

**PageIndex approach**

```
Query: "JWT expiry"

→ Load INDEX only (~500 tokens)
→ LLM reasoning identifies auth topic
→ Load only auth topic (~800 tokens)
```

Total tokens used: ~1350 instead of ~2000+.

Better targeting leads to fewer tokens loaded.

---

## 4. Explainability

**Vector search output**

```json
{
  "matchedTopics": ["auth", "api"],
  "scores": [0.82, 0.65]
}
```

The reasoning behind scores is not transparent.

**PageIndex output**

```json
{
  "reasoning": "The query asks about JWT expiry. The auth topic handles JWT tokens with expiry configuration (15m/7d). The API topic contains auth endpoints that may use these tokens.",
  "selectedTopics": ["auth", "api"]
}
```

This provides visible reasoning behind topic selection.

---

# How PageIndex Works

## Step 1: Tree Generation

```javascript
const tree = {
  title: "INDEX",
  node_id: "root",
  summary: "Core project memory with stack, architecture, and patterns",
  children: [
    {
      node_id: "auth",
      title: "Authentication",
      summary: "JWT-based authentication with refresh tokens and OAuth integration",
      keywords: ["auth", "jwt", "oauth", "tokens"]
    },
    {
      node_id: "api",
      title: "API Endpoints",
      summary: "REST and tRPC endpoints with Zod validation",
      keywords: ["api", "rest", "trpc", "endpoints"]
    }
  ]
}
```

---

## Step 2: Reasoning-Based Retrieval

```typescript
const prompt = `
You are given a tree structure of project memory.
Each node has id, title, summary, and keywords.

Query: "${userQuery}"

Tree structure:
${JSON.stringify(tree, null, 2)}

Analyze which nodes are relevant to answering the query.

Respond with JSON:
{
  "reasoning": "Step-by-step reasoning",
  "selectedTopics": ["topic1", "topic2"]
}
`;

const result = await callLLM(prompt);
```

The LLM analyzes the tree and selects relevant nodes.

---

## Step 3: Load Selected Content

```typescript
const selected = JSON.parse(result);

for (const topicId of selected.selectedTopics) {
  content += await loadTopic(topicId);
}
```

---

# Comparison Matrix

| Feature          | Vector Embeddings             | PageIndex                  | Preferred |
| ---------------- | ----------------------------- | -------------------------- | --------- |
| Setup            | Requires embedding model      | Uses existing LLM          | PageIndex |
| Structure        | Flat embeddings               | Hierarchical tree          | PageIndex |
| Relationships    | Not captured                  | Captured through reasoning | PageIndex |
| Explainability   | Opaque similarity scores      | Transparent reasoning      | PageIndex |
| Token usage      | Fixed loading pattern         | Selective loading          | PageIndex |
| Cold start speed | Model initialization required | Immediate                  | PageIndex |
| Warm performance | Faster                        | Slightly slower            | Vector    |
| Offline support  | Yes                           | Requires LLM               | Vector    |
| Accuracy         | Good                          | Higher                     | PageIndex |

---

# Real-World Examples

## Example 1: Multi-Topic Query

**Query**

```
How do we deploy the API to production?
```

**Vector approach**

```
deploy.mdl: 0.78
api.mdl: 0.65
db.mdl: 0.42
```

Loads: deploy and api.

**PageIndex reasoning**

```
Deployment requires CI/CD configuration.
API configuration may also be required.
Database migrations may be necessary during deployment.
```

Selected topics: deploy, api, db.

---

## Example 2: Synonym Handling

**Query**

```
user login problems
```

**Vector approach**

```
login similar to auth
Score: 0.75
Loads: auth
```

**PageIndex reasoning**

```
Login relates to authentication.
Auth topic handles JWT and OAuth.
API topic includes login endpoints.
```

Selected topics: auth, api.

---

## Example 3: Debugging Query

**Query**

```
Why are users getting 401 errors?
```

**Vector approach**

Loads generic error-related topics.

**PageIndex reasoning**

```
401 indicates unauthorized access.
Likely related to authentication or token validation.
Relevant topics: authentication logic and API middleware.
```

Selected topics: auth (primary), api.

---

# Implementation Plan

## Phase 1: Basic Tree Reasoning

```typescript
async function memory_search_reasoning(query: string) {

  const index = await loader.loadIndex();
  const tree = buildTreeFromIndex(index);

  const prompt = `
    Query: ${query}
    Tree: ${JSON.stringify(tree)}
    Which topics are relevant and why?
  `;

  const reasoning = await callLLM(prompt);
  const selected = parseReasoningResult(reasoning);

  return loadTopics(selected);
}
```

---

## Phase 2: Multi-Level Tree

```typescript
const tree = {
  INDEX: {
    children: {
      auth: {
        sections: ["OVERVIEW", "IMPLEMENTATION", "ERRORS"]
      }
    }
  }
};
```

The LLM can select individual sections instead of full topics.

---

## Phase 3: Hybrid Approach

```typescript
async function memory_search_hybrid(query: string) {

  const vectorCandidates = await vectorSearch(query, { maxTopics: 5 });

  const reasoningResult = await reasoningSearch(
    query,
    vectorCandidates
  );

  return reasoningResult;
}
```

This combines vector filtering with reasoning-based selection.

---

# Token Cost Analysis

## Scenario: Authentication Query

Vector approach:

```
INDEX: 500 tokens
Top topics: 2400 tokens
Total: 2900 tokens
```

PageIndex approach:

```
INDEX: 500 tokens
Reasoning prompt: 600 tokens
LLM response: 100 tokens
Relevant topics: 1600 tokens
Total: 2800 tokens
```

Savings are modest, but selection accuracy improves.

---

## Scenario: JWT Expiry Query

Vector approach:

```
INDEX: 500
auth: 800
api: 700
db: 600
Total: 2600 tokens
```

PageIndex approach:

```
INDEX: 500
Reasoning: 100
auth: 800
Total: 1400 tokens
```

Significant reduction due to selective retrieval.

---

# Challenges and Solutions

## LLM Latency

**Issue:** Reasoning adds approximately 300–500 ms.

**Solutions**

* Cache reasoning results
* Use smaller or faster models
* Begin reasoning in parallel with loading INDEX

---

## LLM Cost

**Issue:** Each reasoning step requires a model call.

**Solutions**

* Use low-cost models
* Cache common queries
* Use keyword search for simple queries

---

## Offline Support

**Issue:** Requires LLM connectivity.

**Solutions**

* Provide keyword search fallback
* Support local LLMs (Ollama, llama.cpp)
* Maintain vector search for offline scenarios

---

# Recommended Architecture

```typescript
async function memory_search(
  query: string,
  method: 'auto' | 'reasoning' | 'vector' | 'keyword' = 'auto'
) {

  if (method === 'auto') {
    if (isSimpleKeywordQuery(query)) {
      return keyword_search(query);
    } else {
      return reasoning_search(query);
    }
  }

  switch (method) {
    case 'reasoning':
      return reasoning_search(query);

    case 'vector':
      return vector_search(query);

    case 'keyword':
      return keyword_search(query);
  }
}
```

---

# Next Steps

1. Implement the `memory_search_reasoning` tool
2. Add a reasoning cache to reduce latency and cost
3. Benchmark accuracy against vector search
4. Implement hybrid mode combining vector filtering and reasoning

---

# Conclusion

PageIndex is a strong fit for this system because:

* The memory structure is already hierarchical
* Relationships between topics are important
* Reasoning provides explainability
* Selective loading reduces unnecessary tokens
* No embedding infrastructure is required
* The system can leverage existing LLM capabilities

