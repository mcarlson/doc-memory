export interface EmbeddingProvider {
  generate(text: string): Promise<number[]>;
  generateBatch(texts: string[]): Promise<number[][]>;
  dimension: number;
}
