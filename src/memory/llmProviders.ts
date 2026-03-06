/**
 * LLM Provider implementations for reasoning-based search
 *
 * Implement the LLMProvider interface for your preferred LLM service.
 * These providers are used by ReasoningSearch to analyze memory structure.
 */

import { LLMProvider } from './reasoningSearch.js';

/**
 * Claude (Anthropic) provider
 * Recommended for best reasoning quality
 */
export class ClaudeProvider implements LLMProvider {
  private apiKey: string;
  private model: string;
  private baseUrl: string;

  constructor(
    apiKey: string,
    model: string = 'claude-3-5-sonnet-20241022',
    baseUrl: string = 'https://api.anthropic.com'
  ) {
    this.apiKey = apiKey;
    this.model = model;
    this.baseUrl = baseUrl;
  }

  async complete(prompt: string): Promise<string> {
    const response = await fetch(`${this.baseUrl}/v1/messages`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': this.apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: this.model,
        max_tokens: 1024,
        messages: [
          {
            role: 'user',
            content: prompt,
          },
        ],
      }),
    });

    if (!response.ok) {
      throw new Error(`Claude API error: ${response.statusText}`);
    }

    const data = await response.json() as { content: Array<{ text: string }> };
    return data.content[0].text;
  }
}

/**
 * OpenAI (GPT) provider
 * Good alternative, slightly faster
 */
export class OpenAIProvider implements LLMProvider {
  private apiKey: string;
  private model: string;
  private baseUrl: string;

  constructor(
    apiKey: string,
    model: string = 'gpt-4o-mini',
    baseUrl: string = 'https://api.openai.com/v1'
  ) {
    this.apiKey = apiKey;
    this.model = model;
    this.baseUrl = baseUrl;
  }

  async complete(prompt: string): Promise<string> {
    const response = await fetch(`${this.baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify({
        model: this.model,
        messages: [
          {
            role: 'user',
            content: prompt,
          },
        ],
        temperature: 0,
        max_tokens: 1024,
      }),
    });

    if (!response.ok) {
      throw new Error(`OpenAI API error: ${response.statusText}`);
    }

    const data = await response.json() as { choices: Array<{ message: { content: string } }> };
    return data.choices[0].message.content;
  }
}

/**
 * Local Ollama provider
 * For offline/local deployments
 */
export class OllamaProvider implements LLMProvider {
  private baseUrl: string;
  private model: string;

  constructor(model: string = 'llama3.2', baseUrl: string = 'http://localhost:11434') {
    this.model = model;
    this.baseUrl = baseUrl;
  }

  async complete(prompt: string): Promise<string> {
    const response = await fetch(`${this.baseUrl}/api/generate`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: this.model,
        prompt,
        stream: false,
      }),
    });

    if (!response.ok) {
      throw new Error(`Ollama API error: ${response.statusText}`);
    }

    const data = await response.json() as { response: string };
    return data.response;
  }
}

/**
 * Mock provider for testing
 * Returns keyword-based reasoning without actual LLM
 */
export class MockLLMProvider implements LLMProvider {
  async complete(prompt: string): Promise<string> {
    // Extract query from prompt
    const queryMatch = prompt.match(/## User Query\n(.+)/);
    const query = queryMatch ? queryMatch[1].trim() : '';

    // Extract available topics
    const topicsMatch = prompt.match(/Available Topics\n([\s\S]+?)##/);
    const topicsText = topicsMatch ? topicsMatch[1] : '';

    // Simple keyword matching
    const queryWords = query.toLowerCase().split(/\s+/);
    const topics: string[] = [];

    const topicMatches = topicsText.matchAll(/\*\*(.+?)\*\*\s+\((.+?)\)/g);
    for (const match of topicMatches) {
      const topicId = match[2];
      const topicText = match[1].toLowerCase();

      if (queryWords.some((word) => topicText.includes(word))) {
        topics.push(topicId);
      }
    }

    return JSON.stringify({
      reasoning: `Keyword analysis: Found ${topics.length} topics matching query keywords.`,
      selectedTopics: topics.slice(0, 3),
    });
  }
}

/**
 * Factory function to create provider from environment variables
 */
export function createLLMProvider(): LLMProvider | undefined {
  // Check for API keys in environment
  if (process.env.ANTHROPIC_API_KEY) {
    return new ClaudeProvider(
      process.env.ANTHROPIC_API_KEY,
      process.env.CLAUDE_MODEL
    );
  }

  if (process.env.OPENAI_API_KEY) {
    return new OpenAIProvider(
      process.env.OPENAI_API_KEY,
      process.env.OPENAI_MODEL
    );
  }

  // Try Ollama (assumes it's running locally)
  if (process.env.USE_OLLAMA === 'true') {
    return new OllamaProvider(
      process.env.OLLAMA_MODEL,
      process.env.OLLAMA_BASE_URL
    );
  }

  // No LLM configured - will use keyword fallback
  return undefined;
}
