import fs from 'fs/promises';
import path from 'path';
import { MemoryConfig } from '../types.js';
import { countTokens } from './tokenizer.js';
import { CCLSessionMeta, CCLIndex } from './cclWriter.js';

export interface CCLSession {
  meta: CCLSessionMeta;
  content: string;
}

export interface CCLLoadResult {
  sessions: CCLSession[];
  totalTokens: number;
}

export class CCLLoader {
  private sessionsDir: string;

  constructor(private config: MemoryConfig) {
    this.sessionsDir = path.join(config.contextPath, 'sessions');
  }

  /**
   * List all session metadata from the index (no file reads)
   */
  async listSessions(): Promise<CCLSessionMeta[]> {
    const indexPath = path.join(this.sessionsDir, 'index.json');
    try {
      const content = await fs.readFile(indexPath, 'utf-8');
      const index: CCLIndex = JSON.parse(content);
      return index.sessions || [];
    } catch {
      return [];
    }
  }

  /**
   * Load a single session file by name
   */
  async loadSessionFile(fileName: string): Promise<string | null> {
    const filePath = path.join(this.sessionsDir, fileName);
    try {
      return await fs.readFile(filePath, 'utf-8');
    } catch {
      return null;
    }
  }

  /**
   * Load the N most recent sessions
   */
  async loadRecent(count: number = 3): Promise<CCLLoadResult> {
    const all = await this.listSessions();
    return this.hydrateSessions(all.slice(0, count));
  }

  /**
   * Load sessions whose topic matches the given keyword
   */
  async loadByTopic(topic: string): Promise<CCLLoadResult> {
    const all = await this.listSessions();
    const lower = topic.toLowerCase();
    const matched = all.filter(
      s =>
        s.topic.toLowerCase().includes(lower) ||
        s.file.toLowerCase().includes(lower)
    );
    return this.hydrateSessions(matched);
  }

  /**
   * Load sessions from a specific date (YYYY-MM-DD)
   */
  async loadByDate(date: string): Promise<CCLLoadResult> {
    const all = await this.listSessions();
    const matched = all.filter(s => s.date === date);
    return this.hydrateSessions(matched);
  }

  /**
   * Load all sessions that contain discovered gotchas (! entries)
   */
  async loadGotchas(): Promise<CCLLoadResult> {
    const all = await this.listSessions();
    const matched = all.filter(s => s.hasGotchas);
    return this.hydrateSessions(matched);
  }

  /**
   * Load all sessions with unresolved open questions (? entries)
   */
  async loadOpen(): Promise<CCLLoadResult> {
    const all = await this.listSessions();
    const matched = all.filter(s => s.hasOpen);
    return this.hydrateSessions(matched);
  }

  /**
   * Load all sessions with external constraint context (CONTEXT: entries)
   */
  async loadConstraints(): Promise<CCLLoadResult> {
    const all = await this.listSessions();
    const matched = all.filter(s => s.hasContext);
    return this.hydrateSessions(matched);
  }

  /**
   * Load all sessions with rejected alternatives (✗ entries)
   */
  async loadRejections(): Promise<CCLLoadResult> {
    const all = await this.listSessions();
    const matched = all.filter(s => s.hasRejections);
    return this.hydrateSessions(matched);
  }

  /**
   * Summarize all sessions — token counts, topic list, date range,
   * counts of gotchas / rejections / open questions
   */
  async getSummary(): Promise<{
    totalSessions: number;
    totalTokens: number;
    dateRange: { earliest: string; latest: string } | null;
    topics: string[];
    gotchaCount: number;
    rejectionCount: number;
    openCount: number;
  }> {
    const all = await this.listSessions();

    if (all.length === 0) {
      return {
        totalSessions: 0,
        totalTokens: 0,
        dateRange: null,
        topics: [],
        gotchaCount: 0,
        rejectionCount: 0,
        openCount: 0,
      };
    }

    const totalTokens = all.reduce((sum, s) => sum + (s.tokenCount || 0), 0);
    const dates = all.map(s => s.date).sort();

    return {
      totalSessions: all.length,
      totalTokens,
      dateRange: {
        earliest: dates[0],
        latest: dates[dates.length - 1],
      },
      topics: [...new Set(all.map(s => s.topic))],
      gotchaCount: all.filter(s => s.hasGotchas).length,
      rejectionCount: all.filter(s => s.hasRejections).length,
      openCount: all.filter(s => s.hasOpen).length,
    };
  }

  private async hydrateSessions(metas: CCLSessionMeta[]): Promise<CCLLoadResult> {
    const sessions: CCLSession[] = [];
    let totalTokens = 0;

    for (const meta of metas) {
      const content = await this.loadSessionFile(meta.file);
      if (content) {
        sessions.push({ meta, content });
        totalTokens += meta.tokenCount || countTokens(content);
      }
    }

    return { sessions, totalTokens };
  }
}
