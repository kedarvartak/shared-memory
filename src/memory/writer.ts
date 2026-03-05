import fs from 'fs/promises';
import path from 'path';
import { MemoryConfig } from '../types.js';

export class MemoryWriter {
  constructor(private config: MemoryConfig) {}

  async updateLine(file: string, lineNumber: number, newContent: string): Promise<void> {
    const filePath = this.resolveFilePath(file);
    const content = await fs.readFile(filePath, 'utf-8');
    const lines = content.split('\n');

    if (lineNumber < 1 || lineNumber > lines.length) {
      throw new Error(`Line number ${lineNumber} out of range (1-${lines.length})`);
    }

    lines[lineNumber - 1] = newContent;
    await fs.writeFile(filePath, lines.join('\n'), 'utf-8');
  }

  async appendToSection(file: string, section: string, content: string): Promise<void> {
    const filePath = this.resolveFilePath(file);
    const fileContent = await fs.readFile(filePath, 'utf-8');
    const lines = fileContent.split('\n');

    // Find section
    let sectionIndex = -1;
    for (let i = 0; i < lines.length; i++) {
      if (lines[i].trim() === `## ${section}`) {
        sectionIndex = i;
        break;
      }
    }

    if (sectionIndex === -1) {
      throw new Error(`Section "## ${section}" not found in ${file}`);
    }

    // Find next section or end of file
    let nextSectionIndex = lines.length;
    for (let i = sectionIndex + 1; i < lines.length; i++) {
      if (lines[i].startsWith('## ')) {
        nextSectionIndex = i;
        break;
      }
    }

    // Insert content before next section
    lines.splice(nextSectionIndex, 0, content);
    await fs.writeFile(filePath, lines.join('\n'), 'utf-8');
  }

  async deleteLine(file: string, lineNumber: number): Promise<void> {
    const filePath = this.resolveFilePath(file);
    const content = await fs.readFile(filePath, 'utf-8');
    const lines = content.split('\n');

    if (lineNumber < 1 || lineNumber > lines.length) {
      throw new Error(`Line number ${lineNumber} out of range (1-${lines.length})`);
    }

    lines.splice(lineNumber - 1, 1);
    await fs.writeFile(filePath, lines.join('\n'), 'utf-8');
  }

  async deleteSection(file: string, section: string): Promise<void> {
    const filePath = this.resolveFilePath(file);
    const content = await fs.readFile(filePath, 'utf-8');
    const lines = content.split('\n');

    let sectionStart = -1;
    let sectionEnd = -1;

    // Find section start
    for (let i = 0; i < lines.length; i++) {
      if (lines[i].trim() === `## ${section}`) {
        sectionStart = i;
        break;
      }
    }

    if (sectionStart === -1) {
      throw new Error(`Section "## ${section}" not found in ${file}`);
    }

    // Find section end (next section or EOF)
    sectionEnd = lines.length;
    for (let i = sectionStart + 1; i < lines.length; i++) {
      if (lines[i].startsWith('## ')) {
        sectionEnd = i;
        break;
      }
    }

    // Remove section
    lines.splice(sectionStart, sectionEnd - sectionStart);
    await fs.writeFile(filePath, lines.join('\n'), 'utf-8');
  }

  async replaceSection(file: string, section: string, newContent: string): Promise<void> {
    const filePath = this.resolveFilePath(file);
    const content = await fs.readFile(filePath, 'utf-8');
    const lines = content.split('\n');

    let sectionStart = -1;
    let sectionEnd = -1;

    // Find section
    for (let i = 0; i < lines.length; i++) {
      if (lines[i].trim() === `## ${section}`) {
        sectionStart = i;
        break;
      }
    }

    if (sectionStart === -1) {
      throw new Error(`Section "## ${section}" not found in ${file}`);
    }

    // Find section end
    sectionEnd = lines.length;
    for (let i = sectionStart + 1; i < lines.length; i++) {
      if (lines[i].startsWith('## ')) {
        sectionEnd = i;
        break;
      }
    }

    // Replace section content (keep header)
    const newLines = [`## ${section}`, ...newContent.split('\n')];
    lines.splice(sectionStart, sectionEnd - sectionStart, ...newLines);
    await fs.writeFile(filePath, lines.join('\n'), 'utf-8');
  }

  async createTopic(topicName: string, keywords: string[], priority: string = 'medium'): Promise<void> {
    const topicPath = path.join(
      this.config.contextPath,
      this.config.topicsDir,
      `${topicName}.mdl`
    );

    const today = new Date().toISOString().split('T')[0];
    const template = `# ${topicName.charAt(0).toUpperCase() + topicName.slice(1)} Memory
# Loaded when: ${keywords.join(', ')} mentioned

@meta: keywords=${keywords.join(',')},${topicName} | priority=${priority} | updated=${today}

## OVERVIEW
# Brief description of this topic area

## IMPLEMENTATION
# Technical details, file locations, libraries used

## PATTERNS
# Common patterns, conventions, best practices

## EXAMPLES
# Code examples, usage patterns

## ERRORS
# Common errors and how to handle them

## AVOID
# Anti-patterns, known issues, gotchas

## TODO
# Outstanding tasks related to this topic
`;

    await fs.writeFile(topicPath, template, 'utf-8');
  }

  async updateMetadata(file: string, updates: Record<string, string>): Promise<void> {
    const filePath = this.resolveFilePath(file);
    const content = await fs.readFile(filePath, 'utf-8');
    const lines = content.split('\n');

    // Find @meta line
    let metaLineIndex = -1;
    for (let i = 0; i < lines.length; i++) {
      if (lines[i].startsWith('@meta:')) {
        metaLineIndex = i;
        break;
      }
    }

    if (metaLineIndex === -1) {
      throw new Error(`@meta not found in ${file}`);
    }

    let metaLine = lines[metaLineIndex];

    // Update each field
    for (const [key, value] of Object.entries(updates)) {
      const regex = new RegExp(`${key}=[^|\\n]+`);
      if (regex.test(metaLine)) {
        metaLine = metaLine.replace(regex, `${key}=${value}`);
      } else {
        // Add new field
        metaLine = metaLine.replace('@meta:', `@meta: ${key}=${value} |`);
      }
    }

    lines[metaLineIndex] = metaLine;
    await fs.writeFile(filePath, lines.join('\n'), 'utf-8');
  }

  private resolveFilePath(file: string): string {
    if (file === 'INDEX.mdl' || file === 'index') {
      return path.join(this.config.contextPath, this.config.indexFile);
    }

    // Assume it's a topic file
    const fileName = file.endsWith('.mdl') ? file : `${file}.mdl`;
    return path.join(this.config.contextPath, this.config.topicsDir, fileName);
  }
}
