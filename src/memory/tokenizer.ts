import { encoding_for_model } from 'tiktoken';

let encoder: ReturnType<typeof encoding_for_model> | null = null;

function getEncoder() {
  if (!encoder) {
    encoder = encoding_for_model('gpt-4');
  }
  return encoder;
}

export function countTokens(text: string): number {
  try {
    const enc = getEncoder();
    const tokens = enc.encode(text);
    return tokens.length;
  } catch (error) {
    // Fallback: rough estimate (1 token ≈ 4 chars)
    return Math.ceil(text.length / 4);
  }
}

export function truncateToTokenLimit(text: string, maxTokens: number): string {
  const enc = getEncoder();
  const tokens = enc.encode(text);

  if (tokens.length <= maxTokens) {
    return text;
  }

  const truncatedTokens = tokens.slice(0, maxTokens);
  return new TextDecoder().decode(enc.decode(truncatedTokens));
}

export function cleanup() {
  if (encoder) {
    encoder.free();
    encoder = null;
  }
}
