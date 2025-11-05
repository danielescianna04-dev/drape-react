import axios from 'axios';

export interface ToolCall {
  tool: 'read_file' | 'write_file' | 'list_files' | 'search_in_files';
  args: Record<string, any>;
}

export class ToolService {
  private static API_URL = process.env.EXPO_PUBLIC_API_URL;

  /**
   * Remove tool call syntax from AI response text
   * Cleans up the response by removing read_file(...), write_file(...), etc.
   * Also removes descriptions about file content and markdown blocks
   */
  static removeToolCallsFromText(text: string): string {
    let cleaned = text;

    // Remove read_file calls
    cleaned = cleaned.replace(/read_file\s*\([^)]+\)/g, '');

    // Remove write_file calls (more complex with potential multi-line content)
    cleaned = cleaned.replace(/write_file\s*\([^)]+\)/g, '');

    // Remove list_files calls
    cleaned = cleaned.replace(/list_files\s*\([^)]*\)/g, '');

    // Remove search_in_files calls
    cleaned = cleaned.replace(/search_in_files\s*\([^)]+\)/g, '');

    // Remove "Il contenuto del file è:" and similar phrases
    cleaned = cleaned.replace(/Il contenuto del file è:\s*/gi, '');
    cleaned = cleaned.replace(/Ecco il contenuto:\s*/gi, '');
    cleaned = cleaned.replace(/Il file contiene:\s*/gi, '');

    // Remove markdown code blocks (```markdown ... ```)
    cleaned = cleaned.replace(/```[a-z]*\s*[\s\S]*?```/g, '');

    // Clean up any extra whitespace or "usando" phrases
    cleaned = cleaned.replace(/\s*usando\s*/gi, ' ');
    cleaned = cleaned.replace(/\s{2,}/g, ' ');
    cleaned = cleaned.trim();

    return cleaned;
  }

  /**
   * Detect tool calls from AI response text
   * Looks for patterns like: read_file(path) or write_file(path, content)
   */
  static detectToolCalls(text: string): ToolCall[] {
    const toolCalls: ToolCall[] = [];

    // Pattern per read_file(path)
    const readFileMatches = text.matchAll(/read_file\s*\(\s*([^)]+)\s*\)/g);
    for (const match of readFileMatches) {
      const path = match[1].replace(/['"]/g, '').trim();
      toolCalls.push({
        tool: 'read_file',
        args: { filePath: path }
      });
    }

    // Pattern per write_file(path, content) - più complesso
    const writeFileMatches = text.matchAll(/write_file\s*\(\s*([^,]+)\s*,\s*(.+?)\s*\)/gs);
    for (const match of writeFileMatches) {
      const path = match[1].replace(/['"]/g, '').trim();
      const content = match[2].trim();
      toolCalls.push({
        tool: 'write_file',
        args: { filePath: path, content }
      });
    }

    // Pattern per list_files(directory)
    const listFilesMatches = text.matchAll(/list_files\s*\(\s*([^)]*)\s*\)/g);
    for (const match of listFilesMatches) {
      const directory = match[1] ? match[1].replace(/['"]/g, '').trim() : '.';
      toolCalls.push({
        tool: 'list_files',
        args: { directory }
      });
    }

    // Pattern per search_in_files(pattern)
    const searchMatches = text.matchAll(/search_in_files\s*\(\s*([^)]+)\s*\)/g);
    for (const match of searchMatches) {
      const pattern = match[1].replace(/['"]/g, '').trim();
      toolCalls.push({
        tool: 'search_in_files',
        args: { pattern }
      });
    }

    return toolCalls;
  }

  /**
   * Execute a tool call
   */
  static async executeTool(
    projectId: string,
    toolCall: ToolCall
  ): Promise<string> {
    try {
      switch (toolCall.tool) {
        case 'read_file':
          return await this.readFile(projectId, toolCall.args.filePath);

        case 'write_file':
          return await this.writeFile(
            projectId,
            toolCall.args.filePath,
            toolCall.args.content
          );

        case 'list_files':
          return await this.listFiles(projectId, toolCall.args.directory);

        case 'search_in_files':
          return await this.searchInFiles(projectId, toolCall.args.pattern);

        default:
          return `Error: Unknown tool ${toolCall.tool}`;
      }
    } catch (error: any) {
      return `Error executing ${toolCall.tool}: ${error.message}`;
    }
  }

  /**
   * Read file content - Returns output in command format
   */
  private static async readFile(
    projectId: string,
    filePath: string
  ): Promise<string> {
    const response = await axios.post(
      `${this.API_URL}/workstation/read-file`,
      { projectId, filePath }
    );

    if (response.data.success) {
      const lines = response.data.content.split('\n').length;
      return `Reading: ${filePath}\n${lines} lines\n\n${response.data.content}`;
    } else {
      return `Error: ${response.data.error}`;
    }
  }

  /**
   * Write file content - Returns output in command format with file preview
   */
  private static async writeFile(
    projectId: string,
    filePath: string,
    content: string
  ): Promise<string> {
    const response = await axios.post(
      `${this.API_URL}/workstation/write-file`,
      { projectId, filePath, content }
    );

    if (response.data.success) {
      const diffInfo = response.data.diffInfo;

      if (diffInfo) {
        // Use diff from backend (includes context lines)
        return `Edit ${filePath}\n└─ Added ${diffInfo.added} lines\n\n${diffInfo.diff}`;
      } else {
        // Fallback if no diffInfo
        const lines = content.split('\n');
        const totalLines = lines.length;
        const preview = lines.slice(0, 10).map((line, i) => `+ ${line}`).join('\n');
        const hasMore = totalLines > 10;
        return `Edit ${filePath}\n└─ Added ${totalLines} lines\n\n${preview}${hasMore ? `\n\n... ${totalLines - 10} more lines` : ''}`;
      }
    } else {
      return `Error: ${response.data.error}`;
    }
  }

  /**
   * List files in directory - Returns output in command format
   */
  private static async listFiles(
    projectId: string,
    directory: string = '.'
  ): Promise<string> {
    const response = await axios.post(
      `${this.API_URL}/workstation/list-directory`,
      { projectId, directory }
    );

    if (response.data.success) {
      const fileList = response.data.files
        .map((f: any) => `${f.type === 'directory' ? 'd' : '-'}  ${f.name}`)
        .join('\n');
      return `Listing: ${directory}\n${response.data.files.length} items\n\n${fileList}`;
    } else {
      return `Error: ${response.data.error}`;
    }
  }

  /**
   * Search in files - Returns output in command format
   */
  private static async searchInFiles(
    projectId: string,
    pattern: string
  ): Promise<string> {
    const response = await axios.post(
      `${this.API_URL}/workstation/search-files`,
      { projectId, pattern }
    );

    if (response.data.success) {
      const results = response.data.results;
      if (results.length === 0) {
        return `Searching: "${pattern}"\n0 matches found`;
      }
      const resultList = results
        .slice(0, 10) // Limit to 10 results
        .map((r: any) => `${r.file}: ${r.match}`)
        .join('\n');
      return `Searching: "${pattern}"\n${results.length} matches found\n\n${resultList}`;
    } else {
      return `Error: ${response.data.error}`;
    }
  }

  /**
   * Process AI response and execute any detected tool calls
   * Returns enriched response with tool results
   */
  static async processResponseWithTools(
    aiResponse: string,
    projectId: string
  ): Promise<string> {
    const toolCalls = this.detectToolCalls(aiResponse);

    if (toolCalls.length === 0) {
      return aiResponse;
    }

    console.log('🔧 Detected tool calls:', toolCalls);

    let enrichedResponse = aiResponse;

    // Execute each tool call and append results
    for (const toolCall of toolCalls) {
      const result = await this.executeTool(projectId, toolCall);
      enrichedResponse += `\n\n${result}`;
    }

    return enrichedResponse;
  }
}
