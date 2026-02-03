import { Router } from 'express';
import { asyncHandler } from '../middleware/async-handler';
import { ValidationError } from '../middleware/error-handler';
import { fileService } from '../services/file.service';
import { workspaceService } from '../services/workspace.service';
import { sessionService } from '../services/session.service';
import { aiProviderService } from '../services/ai-provider.service';
import { log } from '../utils/logger';

// In-memory task store for project creation
interface CreationTask {
  id: string;
  projectId: string;
  status: 'running' | 'completed' | 'failed';
  progress: number;
  message: string;
  step: string;
  error?: string;
  result?: any;
}
const creationTasks = new Map<string, CreationTask>();

export const workstationRouter = Router();

// GET /workstation/:projectId/files
workstationRouter.get('/:projectId/files', asyncHandler(async (req, res) => {
  const { projectId } = req.params;
  const result = await fileService.listAllFiles(projectId);
  res.json({ success: true, files: result.data || [] });
}));

// POST /workstation/read-file
workstationRouter.post('/read-file', asyncHandler(async (req, res) => {
  const { projectId, filePath, path: fp } = req.body;
  const file = filePath || fp;
  if (!projectId || !file) throw new ValidationError('projectId and filePath required');

  const result = await fileService.readFile(projectId, file);
  if (!result.success) return res.status(404).json(result);

  res.json({
    success: true,
    content: result.data!.content,
    path: result.data!.path,
    size: result.data!.size,
    lines: result.data!.content.split('\n').length,
  });
}));

// POST /workstation/write-file
workstationRouter.post('/write-file', asyncHandler(async (req, res) => {
  const { projectId, filePath, path: fp, content } = req.body;
  const file = filePath || fp;
  if (!projectId || !file) throw new ValidationError('projectId and filePath required');

  const result = await fileService.writeFile(projectId, file, content || '');
  if (!result.success) return res.status(500).json(result);

  // Notify agent for hot reload
  const session = await sessionService.getByProjectId(projectId);
  if (session?.agentUrl) {
    fileService.notifyAgent(session.agentUrl, file, content || '').catch(() => {});
  }

  res.json({ success: true, message: 'File written' });
}));

// POST /workstation/edit-file
workstationRouter.post('/edit-file', asyncHandler(async (req, res) => {
  const { projectId, filePath, oldString, newString } = req.body;
  if (!projectId || !filePath || oldString === undefined) {
    throw new ValidationError('projectId, filePath, and oldString required');
  }

  const readResult = await fileService.readFile(projectId, filePath);
  if (!readResult.success) return res.status(404).json(readResult);

  const content = readResult.data!.content;
  if (!content.includes(oldString)) {
    return res.status(400).json({ success: false, error: 'oldString not found in file' });
  }

  const newContent = content.replace(oldString, newString || '');
  await fileService.writeFile(projectId, filePath, newContent);

  const session = await sessionService.getByProjectId(projectId);
  if (session?.agentUrl) {
    fileService.notifyAgent(session.agentUrl, filePath, newContent).catch(() => {});
  }

  res.json({ success: true, message: 'File edited' });
}));

// POST /workstation/undo-file
workstationRouter.post('/undo-file', asyncHandler(async (req, res) => {
  const { projectId, filePath, content } = req.body;
  if (!projectId || !filePath) throw new ValidationError('projectId and filePath required');

  await fileService.writeFile(projectId, filePath, content || '');
  res.json({ success: true, message: 'File restored' });
}));

// POST /workstation/create-folder
workstationRouter.post('/create-folder', asyncHandler(async (req, res) => {
  const { projectId, folderPath } = req.body;
  if (!projectId || !folderPath) throw new ValidationError('projectId and folderPath required');

  const result = await fileService.createFolder(projectId, folderPath);
  res.json(result);
}));

// POST /workstation/delete-file
workstationRouter.post('/delete-file', asyncHandler(async (req, res) => {
  const { projectId, filePath } = req.body;
  if (!projectId || !filePath) throw new ValidationError('projectId and filePath required');

  const result = await fileService.deleteFile(projectId, filePath);
  res.json(result);
}));

// POST /workstation/list-directory
workstationRouter.post('/list-directory', asyncHandler(async (req, res) => {
  const { projectId, directory } = req.body;
  if (!projectId) throw new ValidationError('projectId required');

  const result = await fileService.listFiles(projectId, directory || '');
  res.json({ success: true, files: result.data || [] });
}));

// POST /workstation/glob-files
workstationRouter.post('/glob-files', asyncHandler(async (req, res) => {
  const { projectId, pattern } = req.body;
  if (!projectId || !pattern) throw new ValidationError('projectId and pattern required');

  const result = await fileService.glob(projectId, pattern);
  res.json({ success: true, files: result.data || [] });
}));

// POST /workstation/search-files
workstationRouter.post('/search-files', asyncHandler(async (req, res) => {
  const { projectId, pattern } = req.body;
  if (!projectId || !pattern) throw new ValidationError('projectId and pattern required');

  const result = await fileService.grep(projectId, pattern);
  res.json({
    success: true,
    results: result.data || [],
    totalCount: result.data?.length || 0,
    truncated: false,
  });
}));

// POST /workstation/execute-command
workstationRouter.post('/execute-command', asyncHandler(async (req, res) => {
  const { projectId, command, userId } = req.body;
  const uid = userId || 'anonymous';
  if (!projectId || !command) throw new ValidationError('projectId and command required');

  const result = await workspaceService.exec(projectId, uid, command);
  res.json({ success: true, ...result });
}));

// POST /workstation/read-multiple-files
workstationRouter.post('/read-multiple-files', asyncHandler(async (req, res) => {
  const { projectId, filePaths } = req.body;
  if (!projectId || !Array.isArray(filePaths)) throw new ValidationError('projectId and filePaths required');

  const results = await Promise.all(
    filePaths.map(async (fp: string) => {
      const r = await fileService.readFile(projectId, fp);
      return { path: fp, success: r.success, content: r.data?.content, error: r.error };
    })
  );

  res.json({
    success: true,
    results,
    totalFiles: results.length,
    successCount: results.filter(r => r.success).length,
  });
}));

// POST /workstation/edit-multiple-files
workstationRouter.post('/edit-multiple-files', asyncHandler(async (req, res) => {
  const { projectId, edits } = req.body;
  if (!projectId || !Array.isArray(edits)) throw new ValidationError('projectId and edits required');

  const results = [];
  for (const edit of edits) {
    try {
      if (edit.type === 'write') {
        await fileService.writeFile(projectId, edit.filePath, edit.content || '');
        results.push({ path: edit.filePath, success: true });
      } else if (edit.type === 'edit') {
        const read = await fileService.readFile(projectId, edit.filePath);
        if (read.success && read.data) {
          const newContent = read.data.content.replace(edit.oldString, edit.newString || '');
          await fileService.writeFile(projectId, edit.filePath, newContent);
          results.push({ path: edit.filePath, success: true });
        } else {
          results.push({ path: edit.filePath, success: false, error: 'File not found' });
        }
      }
    } catch (e: any) {
      results.push({ path: edit.filePath, success: false, error: e.message });
    }
  }

  res.json({ success: true, results, totalFiles: results.length });
}));

// DELETE /workstation/:projectId
workstationRouter.delete('/:projectId', asyncHandler(async (req, res) => {
  const { projectId } = req.params;
  const userId = (req.query.userId as string) || req.body?.userId || 'anonymous';
  await workspaceService.release(projectId, userId);
  await fileService.deleteProject(projectId);
  res.json({ success: true, message: 'Project deleted' });
}));

// POST /workstation/create
workstationRouter.post('/create', asyncHandler(async (req, res) => {
  const { projectId, repositoryUrl, githubToken, projectName } = req.body;
  if (!projectId) throw new ValidationError('projectId required');

  await fileService.ensureProjectDir(projectId);

  if (repositoryUrl) {
    await workspaceService.cloneRepository(projectId, repositoryUrl, githubToken);
  }

  const files = await workspaceService.listFiles(projectId);
  res.json({
    workstationId: projectId,
    status: 'active',
    message: 'Workstation created',
    repositoryUrl,
    filesCount: files.length,
    files,
  });
}));

// POST /workstation/create-with-template
workstationRouter.post('/create-with-template', asyncHandler(async (req, res) => {
  const { projectName, technology, description, userId, projectId } = req.body;
  if (!projectName) throw new ValidationError('projectName required');

  const id = projectId || `project-${Date.now()}`;
  await fileService.ensureProjectDir(id);

  // Create task entry
  const task: CreationTask = {
    id, projectId: id, status: 'running', progress: 5,
    message: 'Connecting to AI Engine...', step: 'Initializing',
  };
  creationTasks.set(id, task);

  // Run generation in background
  generateProject(id, projectName, technology || 'nextjs', description || '', task).catch(err => {
    log.error(`[CreateProject] Failed: ${err.message}`);
    task.status = 'failed';
    task.error = err.message;
    task.message = 'Generation failed';
  });

  res.json({ success: true, taskId: id, projectId: id, message: 'Template creation started' });
}));

// GET /workstation/templates
workstationRouter.get('/templates', (req, res) => {
  res.json({
    success: true,
    templates: [
      { id: 'nextjs', name: 'Next.js', description: 'React framework with SSR' },
      { id: 'vite-react', name: 'Vite + React', description: 'Fast React development' },
      { id: 'html', name: 'Static HTML', description: 'Simple HTML/CSS/JS' },
    ],
  });
});

// GET /workstation/create-status/:taskId
workstationRouter.get('/create-status/:taskId', asyncHandler(async (req, res) => {
  const task = creationTasks.get(req.params.taskId);
  if (!task) {
    return res.status(404).json({ success: false, error: 'Task not found' });
  }
  res.json({ success: true, task });
}));

/**
 * Background AI project generation using Gemini Flash
 */
async function generateProject(
  projectId: string, projectName: string, technology: string, description: string, task: CreationTask
): Promise<void> {
  const update = (progress: number, message: string, step: string) => {
    task.progress = progress;
    task.message = message;
    task.step = step;
  };

  update(10, 'Preparing AI Model...', 'Configuration');

  const techMap: Record<string, string> = {
    nextjs: 'Next.js 14 with App Router, TypeScript, and Tailwind CSS',
    react: 'React with Vite, TypeScript, and Tailwind CSS',
    html: 'HTML5, CSS3, and vanilla JavaScript',
    vue: 'Vue 3 with Vite, TypeScript, and Tailwind CSS',
    'HTML/CSS/JS': 'HTML5, CSS3, and vanilla JavaScript',
  };
  const techDesc = techMap[technology] || techMap['nextjs'];

  update(20, 'Progettazione struttura...', 'AI Generating');

  const prompt = `Generate a complete ${techDesc} project called "${projectName}".
${description ? `Description: ${description}` : ''}

IMPORTANT: Return ONLY a valid JSON object with this exact structure:
{
  "files": [
    { "path": "relative/file/path.ext", "content": "file content here" }
  ]
}

Requirements:
- For HTML projects: do NOT include package.json, only include index.html, style.css, script.js
- For framework projects (Next.js, React, Vue): include package.json with project name "${projectName}" and all necessary dependencies
- Include a working main page with a professional, modern UI
- Use Italian language for user-facing text where appropriate
- Include proper configuration files (tsconfig.json, tailwind.config if applicable)
- For Next.js: use App Router (app/ directory), include layout.tsx and page.tsx
- For HTML: include index.html, style.css, script.js
- Make it immediately runnable with the dev server
- Do NOT include node_modules or lock files
- Keep it concise but functional

Return ONLY the JSON, no markdown fences, no explanation.`;

  update(30, 'Generazione componenti...', 'AI Generating');

  const models = ['gemini-2.5-flash', 'gemini-2.5-flash', 'gemini-2.5-flash'];
  const systemPrompt = 'You are a senior full-stack developer. You generate complete, working project scaffolds. Always return valid JSON.';
  const chatMessages = [{ role: 'user' as const, content: prompt }];
  const chatOptions = { temperature: 0.7, maxTokens: 32000 };

  try {
    let fullText = '';

    // Try models with retry
    for (let attempt = 0; attempt < models.length; attempt++) {
      try {
        fullText = '';
        const stream = aiProviderService.chatStream(models[attempt], chatMessages, undefined, systemPrompt, chatOptions);

        let chunkCount = 0;
        for await (const chunk of stream) {
          if (chunk.type === 'text') {
            fullText += chunk.text;
            chunkCount++;
            const genProgress = Math.min(70, 30 + chunkCount * 2);
            if (chunkCount % 5 === 0) {
              const messages = ['Generazione componenti...', 'Creazione pagine...', 'Scrittura stili CSS...', 'Configurazione routing...', 'Ottimizzazione codice...'];
              update(genProgress, messages[Math.floor(chunkCount / 5) % messages.length], 'AI Generating');
            }
          }
        }
        break; // Success — exit retry loop
      } catch (retryErr: any) {
        log.warn(`[CreateProject] Attempt ${attempt + 1} failed: ${retryErr.message}`);
        if (attempt === models.length - 1) throw retryErr;
        update(30, `Riprovo generazione (tentativo ${attempt + 2})...`, 'AI Generating');
        await new Promise(r => setTimeout(r, 2000)); // Wait 2s before retry
      }
    }

    update(75, 'Parsing Generated Code...', 'Processing');

    // Parse the JSON response
    let cleanJson = fullText.trim();
    // Remove markdown fences if present
    if (cleanJson.startsWith('```')) {
      cleanJson = cleanJson.replace(/^```(?:json)?\n?/, '').replace(/\n?```$/, '');
    }

    let parsed: { files: { path: string; content: string }[] };
    try {
      parsed = JSON.parse(cleanJson);
    } catch {
      // Try to extract JSON from the text
      const jsonMatch = cleanJson.match(/\{[\s\S]*"files"[\s\S]*\}/);
      if (jsonMatch) {
        parsed = JSON.parse(jsonMatch[0]);
      } else {
        throw new Error('AI returned invalid JSON');
      }
    }

    if (!parsed.files || !Array.isArray(parsed.files)) {
      throw new Error('AI response missing files array');
    }

    update(80, 'Formatting Files...', 'Processing');

    // Write files to NVMe
    const writtenFiles: string[] = [];
    for (let i = 0; i < parsed.files.length; i++) {
      const file = parsed.files[i];
      if (!file.path || file.content === undefined) continue;

      const progress = 80 + Math.floor((i / parsed.files.length) * 15);
      update(progress, `Creazione ${file.path}`, 'Creating files');

      await fileService.writeFile(projectId, file.path, file.content);
      writtenFiles.push(file.path);
    }

    update(95, 'Starting Workspace...', 'Finalizing');

    log.info(`[CreateProject] Generated ${writtenFiles.length} files for ${projectName}`);

    // Complete
    update(100, 'Project Created Successfully!', 'Complete');
    task.status = 'completed';
    task.result = {
      projectId,
      projectName,
      technology,
      templateDescription: description,
      files: writtenFiles,
    };

    // Clean up task after 5 minutes
    setTimeout(() => creationTasks.delete(projectId), 5 * 60 * 1000);
  } catch (err: any) {
    log.error(`[CreateProject] AI generation failed: ${err.message}`);
    task.status = 'failed';
    task.error = err.message;
    task.message = `Generation failed: ${err.message}`;
  }
}
