export interface MemoryMetadata {
  keywords?: string[];
  priority?: 'high' | 'medium' | 'low';
  updated?: string;
}

export interface TopicFile {
  name: string;
  path: string;
  keywords: string[];
  priority: string;
  content: string;
  tokenCount?: number;
}

export interface MemoryStats {
  indexTokens: number;
  topicsLoaded: string[];
  totalTokens: number;
  files: Array<{
    name: string;
    tokens: number;
    lines: number;
  }>;
}

export interface MemorySearchResult {
  matchedTopics: string[];
  content: string;
  tokenCount: number;
  reasoning?: string; // LLM reasoning for why topics were selected (PageIndex-style)
}

export interface MemoryConfig {
  contextPath: string;
  indexFile: string;
  topicsDir: string;
  maxIndexTokens: number;
  maxTopicTokens: number;
}
