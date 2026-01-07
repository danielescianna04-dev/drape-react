import axios from 'axios';
import { useFileCacheStore } from '../cache/fileCacheStore';

export interface ToolCall {
  tool: 'read_file' | 'write_file' | 'edit_file' | 'list_files' | 'search_in_files' | 'execute_command' | 'git_command' | 'read_multiple_files' | 'edit_multiple_files' | 'create_folder' | 'delete_file';
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

    // Remove edit_file calls
    cleaned = cleaned.replace(/edit_file\s*\([^)]+\)/g, '');

    // Remove list_files calls
    cleaned = cleaned.replace(/list_files\s*\([^)]*\)/g, '');

    // Remove search_in_files calls
    cleaned = cleaned.replace(/search_in_files\s*\([^)]+\)/g, '');

    // Remove execute_command calls
    cleaned = cleaned.replace(/execute_command\s*\([^)]+\)/g, '');

    // Remove git_command calls
    cleaned = cleaned.replace(/git_command\s*\([^)]+\)/g, '');

    // Remove read_multiple_files calls
    cleaned = cleaned.replace(/read_multiple_files\s*\(\s*\[[^\]]+\]\s*\)/g, '');

    // Remove edit_multiple_files calls
    cleaned = cleaned.replace(/edit_multiple_files\s*\(\s*\[[\s\S]*?\]\s*\)/g, '');

    // Remove create_folder and mkdir calls
    cleaned = cleaned.replace(/(?:create_folder|mkdir)\s*\([^)]+\)/g, '');

    // Remove delete_file and rm calls
    cleaned = cleaned.replace(/(?:delete_file|rm)\s*\([^)]+\)/g, '');

    // Remove markdown code blocks (```markdown ... ```) ONLY if they contain file content
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

    // Pattern per edit_file(path, oldString, newString)
    const editFileMatches = text.matchAll(/edit_file\s*\(\s*([^,]+)\s*,\s*(.+?)\s*,\s*(.+?)\s*\)/gs);
    for (const match of editFileMatches) {
      const path = match[1].replace(/['"]/g, '').trim();
      const oldString = match[2].trim();
      const newString = match[3].trim();
      toolCalls.push({
        tool: 'edit_file',
        args: { filePath: path, oldString, newString }
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

    // Pattern per execute_command(command)
    const executeMatches = text.matchAll(/execute_command\s*\(\s*([^)]+)\s*\)/g);
    for (const match of executeMatches) {
      const command = match[1].replace(/^['"]|['"]$/g, '').trim();
      toolCalls.push({
        tool: 'execute_command',
        args: { command }
      });
    }

    // Pattern per comandi bash nei code blocks - convertili in tool calls
    // Rileva grep -r "pattern" e convertilo in search_in_files
    const grepMatches = text.matchAll(/```(?:bash)?\s*\n\s*grep\s+-r\s+["']([^"']+)["']\s+\.\s*\n```/g);
    for (const match of grepMatches) {
      const pattern = match[1].trim();
      toolCalls.push({
        tool: 'search_in_files',
        args: { pattern }
      });
    }

    // Pattern per git_command(gitCommand)
    const gitMatches = text.matchAll(/git_command\s*\(\s*([^)]+)\s*\)/g);
    for (const match of gitMatches) {
      const gitCommand = match[1].replace(/^['"]|['"]$/g, '').trim();
      toolCalls.push({
        tool: 'git_command',
        args: { gitCommand }
      });
    }

    // Pattern per read_multiple_files([file1, file2, ...])
    const readMultipleMatches = text.matchAll(/read_multiple_files\s*\(\s*\[([^\]]+)\]\s*\)/g);
    for (const match of readMultipleMatches) {
      const filesStr = match[1];
      const filePaths = filesStr.split(',').map(f => f.replace(/['"]/g, '').trim());
      toolCalls.push({
        tool: 'read_multiple_files',
        args: { filePaths }
      });
    }

    // Pattern per edit_multiple_files([{type: 'write', filePath: '...', content: '...'}, ...])
    const editMultipleMatches = text.matchAll(/edit_multiple_files\s*\(\s*\[([\s\S]*?)\]\s*\)/g);
    for (const match of editMultipleMatches) {
      const editsStr = match[1];
      try {
        // Parse the JSON array of edits
        const edits = JSON.parse(`[${editsStr}]`);
        toolCalls.push({
          tool: 'edit_multiple_files',
          args: { edits }
        });
      } catch (error) {
        console.error('Failed to parse edit_multiple_files:', error);
      }
    }

    // Pattern per create_folder(path) o mkdir(path)
    const createFolderMatches = text.matchAll(/(?:create_folder|mkdir)\s*\(\s*([^)]+)\s*\)/g);
    for (const match of createFolderMatches) {
      const path = match[1].replace(/['"]/g, '').trim();
      toolCalls.push({
        tool: 'create_folder',
        args: { folderPath: path }
      });
    }

    // Pattern per delete_file(path) o rm(path)
    const deleteFileMatches = text.matchAll(/(?:delete_file|rm)\s*\(\s*([^)]+)\s*\)/g);
    for (const match of deleteFileMatches) {
      const path = match[1].replace(/['"]/g, '').trim();
      toolCalls.push({
        tool: 'delete_file',
        args: { filePath: path }
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

        case 'edit_file':
          return await this.editFile(
            projectId,
            toolCall.args.filePath,
            toolCall.args.oldString,
            toolCall.args.newString
          );

        case 'list_files':
          return await this.listFiles(projectId, toolCall.args.directory);

        case 'search_in_files':
          return await this.searchInFiles(projectId, toolCall.args.pattern);

        case 'execute_command':
          return await this.executeCommand(projectId, toolCall.args.command);

        case 'git_command':
          return await this.gitCommand(projectId, toolCall.args.gitCommand);

        case 'read_multiple_files':
          return await this.readMultipleFiles(projectId, toolCall.args.filePaths);

        case 'edit_multiple_files':
          return await this.editMultipleFiles(projectId, toolCall.args.edits);

        case 'create_folder':
          return await this.createFolder(projectId, toolCall.args.folderPath);

        case 'delete_file':
          return await this.deleteFile(projectId, toolCall.args.filePath);

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
      const actualFile = response.data.actualFilePath || filePath;
      return `Reading: ${actualFile}\n${lines} lines\n\n${response.data.content}`;
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
      // Invalidate file cache so FileExplorer shows updated files
      useFileCacheStore.getState().clearCache(projectId);
      console.log(`📁 [ToolService] Cache invalidated after write: ${filePath}`);

      const diffInfo = response.data.diffInfo;

      if (diffInfo) {
        // Use diff from backend (includes context lines)
        return `Write ${filePath}\n└─ Added ${diffInfo.added} lines\n\n${diffInfo.diff}`;
      } else {
        // Fallback if no diffInfo
        const lines = content.split('\n');
        const totalLines = lines.length;
        const preview = lines.slice(0, 10).map((line, i) => `+ ${line}`).join('\n');
        const hasMore = totalLines > 10;
        return `Write ${filePath}\n└─ Added ${totalLines} lines\n\n${preview}${hasMore ? `\n\n... ${totalLines - 10} more lines` : ''}`;
      }
    } else {
      return `Error: ${response.data.error}`;
    }
  }

  /**
   * Edit file using search & replace (like Claude Code)
   */
  private static async editFile(
    projectId: string,
    filePath: string,
    oldString: string,
    newString: string
  ): Promise<string> {
    const response = await axios.post(
      `${this.API_URL}/workstation/edit-file`,
      { projectId, filePath, oldString, newString }
    );

    if (response.data.success) {
      // Invalidate file cache so FileExplorer shows updated files
      useFileCacheStore.getState().clearCache(projectId);
      console.log(`📁 [ToolService] Cache invalidated after edit: ${filePath}`);

      const diffInfo = response.data.diffInfo;

      if (diffInfo) {
        return `Edit ${filePath}\n└─ +${diffInfo.added} -${diffInfo.removed} lines\n\n${diffInfo.diff}`;
      } else {
        return `Edit ${filePath}\n└─ File updated successfully`;
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
   * Execute bash command in repository - Returns output in command format
   */
  private static async executeCommand(
    projectId: string,
    command: string
  ): Promise<string> {
    const response = await axios.post(
      `${this.API_URL}/workstation/execute-command`,
      { projectId, command }
    );

    if (response.data.success) {
      const stdout = response.data.stdout || '';
      const stderr = response.data.stderr || '';

      let output = `$ ${command}\n`;
      if (stdout) output += stdout;
      if (stderr) output += `\n${stderr}`;

      return output.trim();
    } else {
      const stderr = response.data.stderr || response.data.error || 'Command failed';
      return `$ ${command}\nError: ${stderr}`;
    }
  }

  /**
   * Execute git command in repository - Returns formatted output
   */
  private static async gitCommand(
    projectId: string,
    gitCommand: string
  ): Promise<string> {
    const response = await axios.post(
      `${this.API_URL}/workstation/git-command`,
      { projectId, gitCommand }
    );

    if (response.data.success) {
      const stdout = response.data.stdout || '';
      const stderr = response.data.stderr || '';

      let output = `git ${gitCommand}\n`;
      if (stdout) output += stdout;
      if (stderr) output += `\n${stderr}`;

      return output.trim();
    } else {
      const stderr = response.data.stderr || response.data.error || 'Git command failed';
      return `git ${gitCommand}\nError: ${stderr}`;
    }
  }

  /**
   * Read multiple files at once - Returns formatted output with all files
   */
  private static async readMultipleFiles(
    projectId: string,
    filePaths: string[]
  ): Promise<string> {
    const response = await axios.post(
      `${this.API_URL}/workstation/read-multiple-files`,
      { projectId, filePaths }
    );

    if (response.data.success) {
      const results = response.data.results;
      let output = `Reading ${results.length} files...\n\n`;

      for (const result of results) {
        if (result.success) {
          output += `=== ${result.filePath} (${result.lines} lines) ===\n${result.content}\n\n`;
        } else {
          output += `=== ${result.filePath} ===\nError: ${result.error}\n\n`;
        }
      }

      return output.trim();
    } else {
      return `Error reading files: ${response.data.error}`;
    }
  }

  /**
   * Edit multiple files atomically - Returns formatted output
   */
  private static async editMultipleFiles(
    projectId: string,
    edits: Array<{type: 'write' | 'edit', filePath: string, content?: string, oldString?: string, newString?: string}>
  ): Promise<string> {
    const response = await axios.post(
      `${this.API_URL}/workstation/edit-multiple-files`,
      { projectId, edits }
    );

    if (response.data.success) {
      // Invalidate file cache so FileExplorer shows updated files
      useFileCacheStore.getState().clearCache(projectId);
      console.log(`📁 [ToolService] Cache invalidated after edit_multiple_files`);

      const results = response.data.results;
      let output = `Editing ${results.length} files atomically...\n\n`;

      for (const result of results) {
        if (result.success) {
          if (result.type === 'write') {
            output += `Write ${result.filePath}\n└─ Added ${result.lines} lines\n\n`;
          } else if (result.type === 'edit') {
            output += `Edit ${result.filePath}\n└─ File updated successfully\n\n`;
          }
        }
      }

      return output.trim();
    } else {
      return `Error: ${response.data.error}${response.data.rolledBack ? ' (changes rolled back)' : ''}`;
    }
  }

  /**
   * Create a folder - Returns formatted output
   */
  private static async createFolder(
    projectId: string,
    folderPath: string
  ): Promise<string> {
    const response = await axios.post(
      `${this.API_URL}/workstation/create-folder`,
      { projectId, folderPath }
    );

    if (response.data.success) {
      // Invalidate file cache so FileExplorer shows the new folder
      useFileCacheStore.getState().clearCache(projectId);
      console.log(`📁 [ToolService] Cache invalidated after create_folder: ${folderPath}`);
      return `Created folder: ${folderPath}`;
    } else {
      return `Error: ${response.data.error}`;
    }
  }

  /**
   * Delete a file or folder - Returns formatted output
   */
  private static async deleteFile(
    projectId: string,
    filePath: string
  ): Promise<string> {
    const response = await axios.post(
      `${this.API_URL}/workstation/delete-file`,
      { projectId, filePath }
    );

    if (response.data.success) {
      // Invalidate file cache so FileExplorer reflects the deletion
      useFileCacheStore.getState().clearCache(projectId);
      console.log(`📁 [ToolService] Cache invalidated after delete_file: ${filePath}`);
      return `Deleted: ${filePath}`;
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
