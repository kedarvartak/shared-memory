import { pipeline } from '@xenova/transformers';

export class EmbeddingGenerator {
  private static instance: EmbeddingGenerator;
  private pipeline: any = null;
  private initPromise: Promise<void> | null = null;

  private constructor() {}

  static getInstance(): EmbeddingGenerator {
    if (!EmbeddingGenerator.instance) {
      EmbeddingGenerator.instance = new EmbeddingGenerator();
    }
    return EmbeddingGenerator.instance;
  }

  async initialize(): Promise<void> {
    if (this.pipeline) return;

    if (this.initPromise) {
      await this.initPromise;
      return;
    }

    this.initPromise = (async () => {
      // Use a lightweight but effective model
      // all-MiniLM-L6-v2: 384 dimensions, fast, good quality
      this.pipeline = await pipeline(
        'feature-extraction',
        'Xenova/all-MiniLM-L6-v2'
      );
    })();

    await this.initPromise;
  }

  async generateEmbedding(text: string): Promise<number[]> {
    await this.initialize();

    if (!this.pipeline) {
      throw new Error('Embedding pipeline not initialized');
    }

    const output = await this.pipeline(text, {
      pooling: 'mean',
      normalize: true,
    });

    // Convert to array
    const embedding = Array.from(output.data) as number[];
    return embedding;
  }

  async generateEmbeddings(texts: string[]): Promise<number[][]> {
    await this.initialize();

    const embeddings = await Promise.all(
      texts.map(text => this.generateEmbedding(text))
    );

    return embeddings;
  }

  // Cosine similarity (normalized vectors, so just dot product)
  cosineSimilarity(a: number[], b: number[]): number {
    if (a.length !== b.length) {
      throw new Error('Vectors must have same length');
    }

    let dotProduct = 0;
    for (let i = 0; i < a.length; i++) {
      dotProduct += a[i] * b[i];
    }

    return dotProduct;
  }

  cleanup() {
    this.pipeline = null;
    this.initPromise = null;
  }
}
