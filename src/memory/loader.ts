import fs from 'fs/promises';
import path from 'path';
import { TopicFile, MemoryMetadata, MemoryConfig } from '../types.js';
import { countTokens } from './tokenizer.js';

export class MemoryLoader {
  constructor(private config: MemoryConfig) {}

  async loadIndex(): Promise<string> {
    try {
      const indexPath = path.join(this.config.contextPath, this.config.indexFile);
      const content = await fs.readFile(indexPath, 'utf-8');
      return content;
    } catch (error) {
      throw new Error(`Failed to load INDEX: ${error}`);
    }
  }

  async listTopics(): Promise<string[]> {
    try {
      const topicsPath = path.join(this.config.contextPath, this.config.topicsDir);
      const files = await fs.readdir(topicsPath);
      return files
        .filter(f => f.endsWith('.mdl') && f !== '_template.mdl')
        .map(f => f.replace('.mdl', ''));
    } catch (error) {
      return [];
    }
  }

  async loadTopic(topicName: string): Promise<TopicFile | null> {
    try {
      const topicPath = path.join(
        this.config.contextPath,
        this.config.topicsDir,
        `${topicName}.mdl`
      );
      const content = await fs.readFile(topicPath, 'utf-8');
      const metadata = this.parseMetadata(content);
      const tokens = countTokens(content);

      return {
        name: topicName,
        path: topicPath,
        keywords: metadata.keywords || [],
        priority: metadata.priority || 'medium',
        content,
        tokenCount: tokens,
      };
    } catch (error) {
      return null;
    }
  }

  async loadTopics(topicNames: string[]): Promise<TopicFile[]> {
    const topics = await Promise.all(
      topicNames.map(name => this.loadTopic(name))
    );
    return topics.filter((t): t is TopicFile => t !== null);
  }

  async loadAllTopics(): Promise<TopicFile[]> {
    const topicNames = await this.listTopics();
    return this.loadTopics(topicNames);
  }

  parseMetadata(content: string): MemoryMetadata {
    const metaMatch = content.match(/@meta:\s*(.+)/);
    if (!metaMatch) return {};

    const metaStr = metaMatch[1];
    const metadata: MemoryMetadata = {};

    // Parse keywords
    const keywordsMatch = metaStr.match(/keywords=\[?([^\]|\n]+)\]?/);
    if (keywordsMatch) {
      metadata.keywords = keywordsMatch[1].split(',').map(k => k.trim());
    }

    // Parse priority
    const priorityMatch = metaStr.match(/priority=(high|medium|low)/);
    if (priorityMatch) {
      metadata.priority = priorityMatch[1] as 'high' | 'medium' | 'low';
    }

    // Parse updated date
    const updatedMatch = metaStr.match(/updated=(\d{4}-\d{2}-\d{2})/);
    if (updatedMatch) {
      metadata.updated = updatedMatch[1];
    }

    return metadata;
  }

  async getTopicKeywords(topicName: string): Promise<string[]> {
    const topic = await this.loadTopic(topicName);
    return topic?.keywords || [];
  }

  async findTopicsByKeywords(keywords: string[]): Promise<string[]> {
    const allTopics = await this.listTopics();
    const matchedTopics: Array<{ name: string; score: number }> = [];

    for (const topicName of allTopics) {
      const topicKeywords = await this.getTopicKeywords(topicName);
      let score = 0;

      for (const keyword of keywords) {
        const keywordLower = keyword.toLowerCase();
        for (const topicKeyword of topicKeywords) {
          if (topicKeyword.toLowerCase().includes(keywordLower) ||
              keywordLower.includes(topicKeyword.toLowerCase())) {
            score++;
          }
        }
      }

      if (score > 0) {
        matchedTopics.push({ name: topicName, score });
      }
    }

    // Sort by score descending
    matchedTopics.sort((a, b) => b.score - a.score);
    return matchedTopics.map(t => t.name);
  }
}
