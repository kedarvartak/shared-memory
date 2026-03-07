import { MemoryConfig } from '../types.js';
import { CCLWriter } from './cclWriter.js';
import { CCLLoader } from './cclLoader.js';
import path from 'path';

/**
 * Context for a specific memory block with its own CCL session log.
 */
export class BlockContext {
  public cclWriter: CCLWriter;
  public cclLoader: CCLLoader;
  public config: MemoryConfig;

  constructor(memoryRoot: string, blockName: string) {
    const blockPath = path.join(memoryRoot, 'blocks', blockName);

    this.config = {
      memoryRoot,
      blockName,
      contextPath: blockPath,
    };

    this.cclWriter = new CCLWriter(this.config);
    this.cclLoader = new CCLLoader(this.config);
  }
}

