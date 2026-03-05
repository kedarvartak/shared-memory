# Changelog

## [1.1.0] - 2026-03-05

### Added

#### Semantic Vector Search
- **New tool**: `memory_search_semantic` - Search by meaning, not just keywords
- **New tool**: `memory_search_hybrid` - Combines semantic (70%) + keyword (30%) matching
- **New tool**: `memory_rebuild_index` - Rebuild vector search index

#### Technical Features
- AI embeddings using `all-MiniLM-L6-v2` model (384 dimensions)
- Vector similarity search with cosine similarity
- Automatic embedding caching (`.vector-cache.json`)
- Lazy loading: Model loads only on first semantic query
- Hybrid scoring: 70% semantic + 30% keyword matching

### Performance
- First query: 2-3 seconds (model download + initialization)
- Subsequent queries: 100-200ms
- Memory usage: ~100MB for model
- Cache size: ~1KB per topic

### Documentation
- New: [SEMANTIC_SEARCH.md](SEMANTIC_SEARCH.md) - Complete semantic search guide
- Examples of semantic vs keyword vs hybrid search
- Migration guide from keyword-only search
- Performance optimization tips

### Changed
- `memory_search` now returns `method: 'keyword'` in response
- Updated `.gitignore` to exclude `.vector-cache.json`

### Technical Details
- Model runs locally (no API keys needed)
- Works offline after first download
- Embedding cache persists across sessions
- Incremental indexing: Only new/updated topics re-embedded

---

## [1.0.0] - 2026-03-05

### Initial Release

#### Core Features
- **MCP Server** with 9 memory management tools
- **MDL Format**: Token-optimized memory format (~60% reduction vs markdown)
- **Lazy Loading**: Load only relevant topics, not everything
- **Keyword Search**: Simple but effective topic matching
- **Surgical Updates**: Edit specific lines, not entire files
- **Token Counting**: Accurate monitoring using tiktoken
- **Auto-Pruning**: Clean old entries automatically

#### Tools
1. `memory_load` - Load INDEX + specific topics
2. `memory_search` - Keyword-based search
3. `memory_update` - Update specific line
4. `memory_append` - Add to section
5. `memory_delete` - Remove line or section
6. `memory_create_topic` - Create new topic from template
7. `memory_stats` - Token counts & health check
8. `memory_prune` - Auto-remove old entries
9. `memory_list_topics` - List available topics

#### Documentation
- Complete README with examples
- MCP configuration for all major IDEs
- MDL format specification
- Contributing guidelines
- Quick reference card

#### Performance
- ~92% token reduction vs traditional approaches
- 100% memory persistence across sessions/IDEs
- Cross-IDE compatibility
- Git-friendly memory files

---

## Future Roadmap

### v1.2.0 (Planned)
- [ ] Multi-lingual embedding support
- [ ] Code-specific embeddings
- [ ] Relevance feedback learning
- [ ] Web UI for memory browsing

### v2.0.0 (Planned)
- [ ] Multi-project memory synchronization
- [ ] Team-level shared memory
- [ ] Analytics dashboard
- [ ] Memory templates for common stacks
- [ ] Embedding fine-tuning on project data
