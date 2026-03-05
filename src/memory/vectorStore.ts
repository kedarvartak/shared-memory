import fs from 'fs/promises';
import path from 'path';
import { MemoryConfig } from '../types.js';
import { EmbeddingGenerator } from './embeddings.js';

export interface VectorEntry {
  topicName: string;
  content: string;
  embedding: number[];
  keywords: string[];
  updated: string;
}

export class VectorStore {
  private embeddings: Map<string, VectorEntry> = new Map();
  private cachePath: string;
  private embeddingGenerator: EmbeddingGenerator;
  private isDirty: boolean = false;

  constructor(private config: MemoryConfig) {
    this.cachePath = path.join(config.contextPath, '.vector-cache.json');
    this.embeddingGenerator = EmbeddingGenerator.getInstance();
  }

  async load(): Promise<void> {
    try {
      const data = await fs.readFile(this.cachePath, 'utf-8');
      const cached = JSON.parse(data);

      for (const entry of cached) {
        this.embeddings.set(entry.topicName, entry);
      }
    } catch (error) {
      // Cache doesn't exist yet, that's fine
    }
  }

  async save(): Promise<void> {
    if (!this.isDirty) return;

    const entries = Array.from(this.embeddings.values());
    await fs.writeFile(
      this.cachePath,
      JSON.stringify(entries, null, 2),
      'utf-8'
    );

    this.isDirty = false;
  }

  async addOrUpdateTopic(
    topicName: string,
    content: string,
    keywords: string[],
    updated: string
  ): Promise<void> {
    const existing = this.embeddings.get(topicName);

    // Check if we need to regenerate embedding
    if (existing && existing.updated === updated) {
      return; // Already up to date
    }

    // Generate embedding for the content
    const embedding = await this.embeddingGenerator.generateEmbedding(content);

    this.embeddings.set(topicName, {
      topicName,
      content,
      embedding,
      keywords,
      updated,
    });

    this.isDirty = true;
  }

  async searchSimilar(
    queryText: string,
    topN: number = 3
  ): Promise<Array<{ topicName: string; similarity: number }>> {
    const queryEmbedding = await this.embeddingGenerator.generateEmbedding(queryText);

    const results: Array<{ topicName: string; similarity: number }> = [];

    for (const [topicName, entry] of this.embeddings.entries()) {
      const similarity = this.embeddingGenerator.cosineSimilarity(
        queryEmbedding,
        entry.embedding
      );

      results.push({ topicName, similarity });
    }

    // Sort by similarity descending
    results.sort((a, b) => b.similarity - a.similarity);

    return results.slice(0, topN);
  }

  async hybridSearch(
    queryText: string,
    keywords: string[],
    topN: number = 3
  ): Promise<Array<{ topicName: string; score: number }>> {
    // Get semantic similarity scores
    const queryEmbedding = await this.embeddingGenerator.generateEmbedding(queryText);

    const results: Array<{ topicName: string; score: number }> = [];

    for (const [topicName, entry] of this.embeddings.entries()) {
      // Semantic similarity (0-1)
      const semanticScore = this.embeddingGenerator.cosineSimilarity(
        queryEmbedding,
        entry.embedding
      );

      // Keyword matching score (0-1)
      let keywordScore = 0;
      for (const keyword of keywords) {
        const keywordLower = keyword.toLowerCase();
        for (const topicKeyword of entry.keywords) {
          if (
            topicKeyword.toLowerCase().includes(keywordLower) ||
            keywordLower.includes(topicKeyword.toLowerCase())
          ) {
            keywordScore += 1;
          }
        }
      }

      // Normalize keyword score
      const maxKeywordScore = Math.max(keywords.length, entry.keywords.length);
      const normalizedKeywordScore = maxKeywordScore > 0
        ? keywordScore / maxKeywordScore
        : 0;

      // Hybrid score: 70% semantic + 30% keyword
      const hybridScore = (semanticScore * 0.7) + (normalizedKeywordScore * 0.3);

      results.push({ topicName, score: hybridScore });
    }

    // Sort by score descending
    results.sort((a, b) => b.score - a.score);

    return results.slice(0, topN);
  }

  hasTopic(topicName: string): boolean {
    return this.embeddings.has(topicName);
  }

  async delete(topicName: string): Promise<void> {
    if (this.embeddings.delete(topicName)) {
      this.isDirty = true;
    }
  }

  async clear(): Promise<void> {
    this.embeddings.clear();
    this.isDirty = true;
    await this.save();
  }

  getStats(): {
    totalTopics: number;
    embeddingDimension: number;
    cacheSize: number;
  } {
    const firstEntry = Array.from(this.embeddings.values())[0];
    return {
      totalTopics: this.embeddings.size,
      embeddingDimension: firstEntry?.embedding.length || 0,
      cacheSize: this.embeddings.size,
    };
  }
}
