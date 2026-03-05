import { MemoryLoader } from './loader.js';
import { VectorStore } from './vectorStore.js';
import { MemoryConfig, MemorySearchResult } from '../types.js';
import { countTokens } from './tokenizer.js';

export class SemanticSearch {
  private loader: MemoryLoader;
  private vectorStore: VectorStore;

  constructor(private config: MemoryConfig) {
    this.loader = new MemoryLoader(config);
    this.vectorStore = new VectorStore(config);
  }

  async initialize(): Promise<void> {
    // Load vector cache
    await this.vectorStore.load();

    // Index any topics that aren't cached yet
    await this.indexAllTopics();
  }

  async indexAllTopics(): Promise<void> {
    const topics = await this.loader.loadAllTopics();

    for (const topic of topics) {
      const metadata = this.loader.parseMetadata(topic.content);
      const updated = metadata.updated || new Date().toISOString().split('T')[0];

      await this.vectorStore.addOrUpdateTopic(
        topic.name,
        topic.content,
        topic.keywords,
        updated
      );
    }

    await this.vectorStore.save();
  }

  async indexTopic(topicName: string): Promise<void> {
    const topic = await this.loader.loadTopic(topicName);
    if (!topic) return;

    const metadata = this.loader.parseMetadata(topic.content);
    const updated = metadata.updated || new Date().toISOString().split('T')[0];

    await this.vectorStore.addOrUpdateTopic(
      topicName,
      topic.content,
      topic.keywords,
      updated
    );

    await this.vectorStore.save();
  }

  async searchSemantic(
    query: string,
    maxTopics: number = 3
  ): Promise<MemorySearchResult> {
    // Find similar topics using embeddings
    const results = await this.vectorStore.searchSimilar(query, maxTopics);
    const matchedTopics = results.map(r => r.topicName);

    // Load INDEX
    const index = await this.loader.loadIndex();
    let content = `# INDEX\n\n${index}\n\n`;

    // Load matched topics
    const topics = await this.loader.loadTopics(matchedTopics);

    for (const topic of topics) {
      content += `# TOPIC: ${topic.name}\n\n${topic.content}\n\n`;
    }

    const tokenCount = countTokens(content);

    return {
      matchedTopics,
      content,
      tokenCount,
    };
  }

  async searchHybrid(
    query: string,
    maxTopics: number = 3
  ): Promise<MemorySearchResult> {
    // Extract keywords from query
    const keywords = this.extractKeywords(query);

    // Hybrid search: combine semantic + keyword matching
    const results = await this.vectorStore.hybridSearch(query, keywords, maxTopics);
    const matchedTopics = results.map(r => r.topicName);

    // Load INDEX
    const index = await this.loader.loadIndex();
    let content = `# INDEX\n\n${index}\n\n`;

    // Load matched topics
    const topics = await this.loader.loadTopics(matchedTopics);

    for (const topic of topics) {
      content += `# TOPIC: ${topic.name}\n\n${topic.content}\n\n`;
    }

    const tokenCount = countTokens(content);

    return {
      matchedTopics,
      content,
      tokenCount,
    };
  }

  private extractKeywords(query: string): string[] {
    const stopWords = new Set([
      'the', 'a', 'an', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for',
      'of', 'with', 'by', 'from', 'as', 'is', 'are', 'was', 'were', 'be',
      'have', 'has', 'had', 'do', 'does', 'did', 'can', 'could', 'will',
      'would', 'should', 'may', 'might', 'must', 'i', 'you', 'we', 'they',
      'this', 'that', 'these', 'those', 'how', 'what', 'when', 'where',
      'why', 'which', 'who', 'fix', 'add', 'update', 'change', 'create',
    ]);

    return query
      .toLowerCase()
      .replace(/[^\w\s]/g, ' ')
      .split(/\s+/)
      .filter(word => word.length > 2 && !stopWords.has(word));
  }

  async getVectorStats() {
    return this.vectorStore.getStats();
  }

  async rebuildIndex(): Promise<void> {
    await this.vectorStore.clear();
    await this.indexAllTopics();
  }
}
