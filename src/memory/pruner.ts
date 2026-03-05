import fs from 'fs/promises';
import { MemoryConfig } from '../types.js';
import { MemoryWriter } from './writer.js';

export class MemoryPruner {
  private writer: MemoryWriter;

  constructor(private config: MemoryConfig) {
    this.writer = new MemoryWriter(config);
  }

  async pruneCurrentSection(daysToKeep: number = 7): Promise<number> {
    const indexPath = `${this.config.contextPath}/${this.config.indexFile}`;
    const content = await fs.readFile(indexPath, 'utf-8');
    const lines = content.split('\n');

    let sectionStart = -1;
    let sectionEnd = -1;
    let pruned = 0;

    // Find CURRENT section
    for (let i = 0; i < lines.length; i++) {
      if (lines[i].includes('## CURRENT')) {
        sectionStart = i;
        break;
      }
    }

    if (sectionStart === -1) return 0;

    // Find section end
    for (let i = sectionStart + 1; i < lines.length; i++) {
      if (lines[i].startsWith('## ')) {
        sectionEnd = i;
        break;
      }
    }
    if (sectionEnd === -1) sectionEnd = lines.length;

    // Parse dates and prune old entries
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - daysToKeep);

    const newLines: string[] = [];
    for (let i = 0; i < lines.length; i++) {
      if (i < sectionStart || i >= sectionEnd) {
        newLines.push(lines[i]);
        continue;
      }

      const line = lines[i];
      const dateMatch = line.match(/(\d{4}-\d{2}-\d{2})/);

      if (dateMatch) {
        const lineDate = new Date(dateMatch[1]);
        if (lineDate >= cutoffDate) {
          newLines.push(line);
        } else {
          pruned++;
        }
      } else {
        newLines.push(line);
      }
    }

    await fs.writeFile(indexPath, newLines.join('\n'), 'utf-8');
    return pruned;
  }

  async removeDeprecatedSections(): Promise<string[]> {
    // Implementation for removing DEPRECATED sections across all files
    const removed: string[] = [];
    // This would scan all topic files and remove sections marked as deprecated
    return removed;
  }

  async consolidateDuplicates(): Promise<number> {
    // Implementation for finding and merging duplicate information
    return 0;
  }
}
