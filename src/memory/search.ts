import { MemoryLoader } from './loader.js';
import { MemoryConfig, MemorySearchResult } from '../types.js';
import { countTokens } from './tokenizer.js';

export class MemorySearch {
  private loader: MemoryLoader;

  constructor(private config: MemoryConfig) {
    this.loader = new MemoryLoader(config);
  }

  async search(query: string, maxTopics: number = 3): Promise<MemorySearchResult> {
    // Extract keywords from query
    const keywords = this.extractKeywords(query);

    // Load INDEX
    const index = await this.loader.loadIndex();
    let content = `# INDEX\n\n${index}\n\n`;

    // Find relevant topics
    const matchedTopics = await this.loader.findTopicsByKeywords(keywords);
    const topicsToLoad = matchedTopics.slice(0, maxTopics);

    // Load matched topics
    const topics = await this.loader.loadTopics(topicsToLoad);

    for (const topic of topics) {
      content += `# TOPIC: ${topic.name}\n\n${topic.content}\n\n`;
    }

    const tokenCount = countTokens(content);

    return {
      matchedTopics: topicsToLoad,
      content,
      tokenCount,
    };
  }

  async loadWithTopics(topicNames: string[]): Promise<MemorySearchResult> {
    const index = await this.loader.loadIndex();
    let content = `# INDEX\n\n${index}\n\n`;

    const topics = await this.loader.loadTopics(topicNames);

    for (const topic of topics) {
      content += `# TOPIC: ${topic.name}\n\n${topic.content}\n\n`;
    }

    const tokenCount = countTokens(content);

    return {
      matchedTopics: topicNames,
      content,
      tokenCount,
    };
  }

  private extractKeywords(query: string): string[] {
    // Simple keyword extraction
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
}
