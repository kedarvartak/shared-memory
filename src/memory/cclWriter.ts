import fs from "fs/promises";
import path from "path";
import { MemoryConfig } from "../types.js";
import { countTokens } from "./tokenizer.js";

export interface CCLSessionMeta {
  file: string;
  date: string;
  time: string;
  block: string;
  topic: string;
  tokenCount: number;
  hasRejections: boolean;
  hasGotchas: boolean;
  hasOpen: boolean;
  hasContext: boolean;
}

export interface CCLIndex {
  sessions: CCLSessionMeta[];
}

export class CCLWriter {
  private sessionsDir: string;

  constructor(private config: MemoryConfig) {
    this.sessionsDir = path.join(config.contextPath, "sessions");
  }

  async ensureSessionsDir(): Promise<void> {
    await fs.mkdir(this.sessionsDir, { recursive: true });
  }

  /**
   * Save a compressed conversation session as a .ccl file.
   * content should already be formatted by the AI using CCL notation.
   */
  async saveSession(topic: string, content: string): Promise<CCLSessionMeta> {
    await this.ensureSessionsDir();

    const now = new Date();
    const date = now.toISOString().split("T")[0]; // YYYY-MM-DD
    const time = now.toTimeString().slice(0, 5).replace(":", ""); // HHMM
    const safeTopicName = topic
      .toLowerCase()
      .replace(/[^a-z0-9]/g, "-")
      .replace(/-+/g, "-")
      .replace(/^-|-$/g, "")
      .slice(0, 30);

    const fileName = `${date}-${time}-${safeTopicName}.ccl`;
    const filePath = path.join(this.sessionsDir, fileName);

    // Build full CCL file with header
    const header = [
      `=${date} ${this.config.blockName || ""} [${topic}]=`,
      `@meta: block=${this.config.blockName || ""} | date=${date} | time=${time} | topic=${topic}`,
      "",
    ].join("\n");

    const fullContent = header + content.trim() + "\n";

    await fs.writeFile(filePath, fullContent, "utf-8");

    const tokenCount = countTokens(fullContent);

    const meta: CCLSessionMeta = {
      file: fileName,
      date,
      time,
      block: this.config.blockName || "",
      topic,
      tokenCount,
      hasRejections: content.includes("✗"),
      hasGotchas: content.includes("!"),
      hasOpen: content.includes("?"),
      hasContext: content.toUpperCase().includes("CONTEXT:"),
    };

    await this.updateIndex(meta);

    return meta;
  }

  /**
   * Append to an existing session file (e.g. mid-conversation checkpoints)
   */
  async appendToSession(fileName: string, content: string): Promise<void> {
    const filePath = path.join(this.sessionsDir, fileName);
    const existing = await fs.readFile(filePath, "utf-8");
    const updated = existing.trimEnd() + "\n" + content.trim() + "\n";
    await fs.writeFile(filePath, updated, "utf-8");

    // Update token count in index
    const newCount = countTokens(updated);
    await this.updateIndexTokenCount(fileName, newCount);
  }

  private async updateIndex(meta: CCLSessionMeta): Promise<void> {
    const indexPath = path.join(this.sessionsDir, "index.json");
    let index: CCLIndex = { sessions: [] };

    try {
      const content = await fs.readFile(indexPath, "utf-8");
      index = JSON.parse(content);
    } catch {
      // index doesn't exist yet, start fresh
    }

    index.sessions.push(meta);

    // Keep sorted by date+time descending (newest first)
    index.sessions.sort((a, b) => {
      const keyA = `${a.date}-${a.time}`;
      const keyB = `${b.date}-${b.time}`;
      return keyB.localeCompare(keyA);
    });

    await fs.writeFile(indexPath, JSON.stringify(index, null, 2), "utf-8");
  }

  private async updateIndexTokenCount(
    fileName: string,
    newCount: number,
  ): Promise<void> {
    const indexPath = path.join(this.sessionsDir, "index.json");
    try {
      const content = await fs.readFile(indexPath, "utf-8");
      const index: CCLIndex = JSON.parse(content);
      const session = index.sessions.find((s) => s.file === fileName);
      if (session) {
        session.tokenCount = newCount;
        await fs.writeFile(indexPath, JSON.stringify(index, null, 2), "utf-8");
      }
    } catch {
      // index may not exist, safe to ignore
    }
  }

  async deleteSession(fileName: string): Promise<void> {
    const filePath = path.join(this.sessionsDir, fileName);
    await fs.rm(filePath, { force: true });

    // Remove from index
    const indexPath = path.join(this.sessionsDir, "index.json");
    try {
      const content = await fs.readFile(indexPath, "utf-8");
      const index: CCLIndex = JSON.parse(content);
      index.sessions = index.sessions.filter((s) => s.file !== fileName);
      await fs.writeFile(indexPath, JSON.stringify(index, null, 2), "utf-8");
    } catch {
      // safe to ignore
    }
  }
}
