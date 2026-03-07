import fs from 'fs/promises';
import path from 'path';

export interface MemoryBlock {
  name: string;
  path: string;
  description?: string;
  created?: string;
  updated?: string;
}

export type SessionMode = 'create' | 'load' | 'edit';

export class BlockManager {
  private memoryRoot: string;
  private selectedBlocks: Set<string> = new Set();
  private sessionMode: SessionMode | null = null;

  constructor(memoryRoot: string) {
    this.memoryRoot = memoryRoot;
  }

  setSessionMode(mode: SessionMode): void {
    this.sessionMode = mode;
  }

  getSessionMode(): SessionMode | null {
    return this.sessionMode;
  }

  /**
   * Initialize memory directory structure
   */
  async initialize(): Promise<void> {
    const blocksDir = path.join(this.memoryRoot, 'blocks');
    await fs.mkdir(blocksDir, { recursive: true });
  }

  /**
   * Create a new memory block
   */
  async createBlock(name: string, description?: string): Promise<MemoryBlock> {
    const blockPath = path.join(this.memoryRoot, 'blocks', name);

    // Check if block already exists
    try {
      await fs.access(blockPath);
      throw new Error(`Memory block "${name}" already exists`);
    } catch (error: any) {
      if (error.code !== 'ENOENT') throw error;
    }

    // Create block directory structure
    await fs.mkdir(blockPath, { recursive: true });
    await fs.mkdir(path.join(blockPath, 'sessions'), { recursive: true });

    const today = new Date().toISOString().split('T')[0];

    // Create block metadata file
    const metadata: MemoryBlock = {
      name,
      path: blockPath,
      description,
      created: today,
      updated: today,
    };

    await fs.writeFile(
      path.join(blockPath, 'block.json'),
      JSON.stringify(metadata, null, 2),
      'utf-8'
    );

    return metadata;
  }

  /**
   * List all available blocks
   */
  async listBlocks(): Promise<MemoryBlock[]> {
    const blocksDir = path.join(this.memoryRoot, 'blocks');

    try {
      const entries = await fs.readdir(blocksDir, { withFileTypes: true });
      const blocks: MemoryBlock[] = [];

      for (const entry of entries) {
        if (entry.isDirectory()) {
          const blockPath = path.join(blocksDir, entry.name);
          const metadataPath = path.join(blockPath, 'block.json');

          try {
            const metadataContent = await fs.readFile(metadataPath, 'utf-8');
            const metadata = JSON.parse(metadataContent);
            blocks.push(metadata);
          } catch {
            // If no metadata file, create basic block info
            blocks.push({
              name: entry.name,
              path: blockPath,
            });
          }
        }
      }

      return blocks;
    } catch (error: any) {
      if (error.code === 'ENOENT') return [];
      throw error;
    }
  }

  /**
   * Get block by name
   */
  async getBlock(name: string): Promise<MemoryBlock | null> {
    const blockPath = path.join(this.memoryRoot, 'blocks', name);

    try {
      await fs.access(blockPath);
      const metadataPath = path.join(blockPath, 'block.json');

      try {
        const metadataContent = await fs.readFile(metadataPath, 'utf-8');
        return JSON.parse(metadataContent);
      } catch {
        return {
          name,
          path: blockPath,
        };
      }
    } catch {
      return null;
    }
  }

  /**
   * Delete a memory block
   */
  async deleteBlock(name: string): Promise<void> {
    const blockPath = path.join(this.memoryRoot, 'blocks', name);

    try {
      await fs.rm(blockPath, { recursive: true, force: true });
      this.selectedBlocks.delete(name);
    } catch (error: any) {
      if (error.code === 'ENOENT') {
        throw new Error(`Memory block "${name}" not found`);
      }
      throw error;
    }
  }

  /**
   * Update block metadata
   */
  async updateBlockMetadata(name: string, updates: Partial<MemoryBlock>): Promise<void> {
    const block = await this.getBlock(name);
    if (!block) {
      throw new Error(`Memory block "${name}" not found`);
    }

    const updated = {
      ...block,
      ...updates,
      updated: new Date().toISOString().split('T')[0],
    };

    const metadataPath = path.join(block.path, 'block.json');
    await fs.writeFile(
      metadataPath,
      JSON.stringify(updated, null, 2),
      'utf-8'
    );
  }

  /**
   * Select blocks for the current session
   */
  selectBlocks(blockNames: string[]): void {
    this.selectedBlocks = new Set(blockNames);
  }

  /**
   * Get currently selected blocks
   */
  getSelectedBlocks(): string[] {
    return Array.from(this.selectedBlocks);
  }

  /**
   * Get block path for file operations
   */
  getBlockPath(blockName: string): string {
    return path.join(this.memoryRoot, 'blocks', blockName);
  }
}
