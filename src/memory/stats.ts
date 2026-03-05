import { MemoryLoader } from './loader.js';
import { MemoryConfig, MemoryStats } from '../types.js';
import { countTokens } from './tokenizer.js';
import fs from 'fs/promises';

export class MemoryStatsCollector {
  private loader: MemoryLoader;

  constructor(private config: MemoryConfig) {
    this.loader = new MemoryLoader(config);
  }

  async getStats(): Promise<MemoryStats> {
    const index = await this.loader.loadIndex();
    const indexTokens = countTokens(index);
    const indexLines = index.split('\n').length;

    const topics = await this.loader.listTopics();
    const files: MemoryStats['files'] = [
      {
        name: 'INDEX.mdl',
        tokens: indexTokens,
        lines: indexLines,
      },
    ];

    let totalTokens = indexTokens;

    for (const topicName of topics) {
      const topic = await this.loader.loadTopic(topicName);
      if (topic) {
        const tokens = topic.tokenCount || 0;
        const lines = topic.content.split('\n').length;

        files.push({
          name: `${topicName}.mdl`,
          tokens,
          lines,
        });

        totalTokens += tokens;
      }
    }

    return {
      indexTokens,
      topicsLoaded: topics,
      totalTokens,
      files,
    };
  }

  async checkHealth(): Promise<{
    healthy: boolean;
    warnings: string[];
  }> {
    const warnings: string[] = [];
    const stats = await this.getStats();

    // Check INDEX size
    if (stats.indexTokens > this.config.maxIndexTokens) {
      warnings.push(
        `INDEX exceeds ${this.config.maxIndexTokens} tokens (${stats.indexTokens})`
      );
    }

    // Check topic sizes
    for (const file of stats.files) {
      if (file.name !== 'INDEX.mdl' && file.tokens > this.config.maxTopicTokens) {
        warnings.push(
          `${file.name} exceeds ${this.config.maxTopicTokens} tokens (${file.tokens})`
        );
      }
    }

    return {
      healthy: warnings.length === 0,
      warnings,
    };
  }
}
