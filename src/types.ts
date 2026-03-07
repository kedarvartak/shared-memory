/**
 * CCL (Compressed Conversation Log) notation symbols.
 * Used by the AI when writing CCL content via memory_save_session.
 *
 * ✓  decided / implemented
 * ✗  tried and rejected
 * !  discovered gotcha / surprise / non-obvious bug
 * ?  open / unresolved / deferred
 * >  code written or file changed
 * Q: question posed during conversation
 * A: answer / resolution
 * CONTEXT: external constraint shaping code decisions
 */
export interface CCLFormat {
  decided: '✓';
  rejected: '✗';
  gotcha: '!';
  open: '?';
  codeChange: '>';
  question: 'Q:';
  answer: 'A:';
  context: 'CONTEXT:';
}

export interface MemoryConfig {
  memoryRoot: string; // Root directory for all memory blocks (.ai-memory/)
  blockName?: string; // Current block being accessed
  contextPath: string; // Computed path to current block
}
