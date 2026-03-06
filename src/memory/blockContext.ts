import { MemoryConfig } from '../types.js';
import { MemoryLoader } from './loader.js';
import { MemoryWriter } from './writer.js';
import { MemoryPruner } from './pruner.js';
import { MemoryStatsCollector } from './stats.js';
import path from 'path';

/**
 * Context for a specific memory block with its own loader, writer, pruner, and stats
 */
export class BlockContext {
  public loader: MemoryLoader;
  public writer: MemoryWriter;
  public pruner: MemoryPruner;
  public stats: MemoryStatsCollector;
  public config: MemoryConfig;

  constructor(memoryRoot: string, blockName: string) {
    const blockPath = path.join(memoryRoot, 'blocks', blockName);

    this.config = {
      memoryRoot,
      blockName,
      contextPath: blockPath,
      indexFile: 'INDEX.mdl',
      topicsDir: 'topics',
      maxIndexTokens: 500,
      maxTopicTokens: 800,
    };

    this.loader = new MemoryLoader(this.config);
    this.writer = new MemoryWriter(this.config);
    this.pruner = new MemoryPruner(this.config);
    this.stats = new MemoryStatsCollector(this.config);
  }
}
