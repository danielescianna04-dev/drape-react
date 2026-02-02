import { Router } from 'express';
import path from 'path';
import { asyncHandler } from '../middleware/async-handler';
import { ValidationError } from '../middleware/error-handler';
import { config } from '../config';
import { execShell } from '../utils/helpers';
import { log } from '../utils/logger';

export const gitRouter = Router();

function projectDir(projectId: string): string {
  return path.join(config.projectsRoot, projectId);
}

function getAuthUrl(url: string, token?: string): string {
  if (token && url.includes('github.com') && !url.includes('@')) {
    return url.replace('https://', `https://${token}@`);
  }
  return url;
}

// GET /git/status/:projectId
gitRouter.get('/status/:projectId', asyncHandler(async (req, res) => {
  const dir = projectDir(req.params.projectId);

  const [statusResult, branchResult, logResult] = await Promise.all([
    execShell('git status --porcelain 2>/dev/null || echo ""', dir),
    execShell('git branch --show-current 2>/dev/null || echo ""', dir),
    execShell('git log --oneline -10 2>/dev/null || echo ""', dir),
  ]);

  const isGitRepo = statusResult.exitCode === 0;
  const branch = branchResult.stdout.trim();
  const lines = statusResult.stdout.trim().split('\n').filter(Boolean);

  const changes = {
    staged: lines.filter(l => l[0] !== ' ' && l[0] !== '?').map(l => l.substring(3)),
    modified: lines.filter(l => l[1] === 'M').map(l => l.substring(3)),
    untracked: lines.filter(l => l.startsWith('??')).map(l => l.substring(3)),
    deleted: lines.filter(l => l[1] === 'D' || l[0] === 'D').map(l => l.substring(3)),
  };

  const commits = logResult.stdout.trim().split('\n').filter(Boolean).map(line => {
    const [hash, ...msgParts] = line.split(' ');
    return { hash, message: msgParts.join(' ') };
  });

  res.json({
    success: true,
    isGitRepo,
    branch,
    currentBranch: branch,
    changes,
    status: statusResult.stdout,
    hasChanges: lines.length > 0,
    commits,
  });
}));

// POST /git/fetch/:projectId
gitRouter.post('/fetch/:projectId', asyncHandler(async (req, res) => {
  const dir = projectDir(req.params.projectId);
  const token = req.headers.authorization?.replace('Bearer ', '');

  // Set auth if token provided
  if (token) {
    const remote = await execShell('git remote get-url origin 2>/dev/null || echo ""', dir);
    const url = remote.stdout.trim();
    if (url) {
      await execShell(`git remote set-url origin "${getAuthUrl(url, token)}"`, dir);
    }
  }

  const result = await execShell('git fetch --all 2>&1', dir, 30000);
  res.json({ success: result.exitCode === 0, message: 'Fetch complete', output: result.stdout, error: result.stderr });
}));

// POST /git/pull/:projectId
gitRouter.post('/pull/:projectId', asyncHandler(async (req, res) => {
  const dir = projectDir(req.params.projectId);
  const token = req.headers.authorization?.replace('Bearer ', '');

  if (token) {
    const remote = await execShell('git remote get-url origin 2>/dev/null || echo ""', dir);
    const url = remote.stdout.trim();
    if (url) await execShell(`git remote set-url origin "${getAuthUrl(url, token)}"`, dir);
  }

  const result = await execShell('git pull 2>&1', dir, 60000);
  res.json({ success: result.exitCode === 0, message: 'Pull complete', output: result.stdout, error: result.stderr });
}));

// POST /git/push/:projectId
gitRouter.post('/push/:projectId', asyncHandler(async (req, res) => {
  const dir = projectDir(req.params.projectId);
  const token = req.headers.authorization?.replace('Bearer ', '');

  if (token) {
    const remote = await execShell('git remote get-url origin 2>/dev/null || echo ""', dir);
    const url = remote.stdout.trim();
    if (url) await execShell(`git remote set-url origin "${getAuthUrl(url, token)}"`, dir);
  }

  const result = await execShell('git push 2>&1', dir, 60000);
  res.json({ success: result.exitCode === 0, message: 'Push complete', output: result.stdout, error: result.stderr });
}));

// POST /git/commit/:projectId
gitRouter.post('/commit/:projectId', asyncHandler(async (req, res) => {
  const dir = projectDir(req.params.projectId);
  const { message, files } = req.body;
  if (!message) throw new ValidationError('message required');

  // Stage files
  if (files && Array.isArray(files) && files.length > 0) {
    for (const file of files) {
      await execShell(`git add "${file}"`, dir);
    }
  } else {
    await execShell('git add -A', dir);
  }

  const result = await execShell(`git commit -m "${message.replace(/"/g, '\\"')}" 2>&1`, dir);
  res.json({ success: result.exitCode === 0, message: 'Commit created', output: result.stdout, error: result.stderr });
}));

// POST /git/checkout/:projectId
gitRouter.post('/checkout/:projectId', asyncHandler(async (req, res) => {
  const dir = projectDir(req.params.projectId);
  const { branch, create } = req.body;
  if (!branch) throw new ValidationError('branch required');

  const cmd = create ? `git checkout -b "${branch}" 2>&1` : `git checkout "${branch}" 2>&1`;
  const result = await execShell(cmd, dir);
  res.json({ success: result.exitCode === 0, message: `Checked out ${branch}`, output: result.stdout });
}));

// GET /git/branches/:projectId
gitRouter.get('/branches/:projectId', asyncHandler(async (req, res) => {
  const dir = projectDir(req.params.projectId);
  const result = await execShell('git branch 2>/dev/null || echo ""', dir);
  const current = await execShell('git branch --show-current 2>/dev/null || echo ""', dir);

  const branches = result.stdout.trim().split('\n')
    .filter(Boolean)
    .map(b => b.trim().replace(/^\* /, ''));

  res.json({ success: true, branches, current: current.stdout.trim() });
}));

// POST /git/init/:projectId
gitRouter.post('/init/:projectId', asyncHandler(async (req, res) => {
  const dir = projectDir(req.params.projectId);
  const { repoUrl } = req.body;
  const token = req.headers.authorization?.replace('Bearer ', '');

  const results: string[] = [];

  const init = await execShell('git init 2>&1', dir);
  results.push(init.stdout);

  await execShell('git add -A 2>&1', dir);
  const commit = await execShell('git commit -m "Initial commit" 2>&1', dir);
  results.push(commit.stdout);

  if (repoUrl) {
    const authUrl = getAuthUrl(repoUrl, token);
    await execShell(`git remote add origin "${authUrl}" 2>&1`, dir);
    await execShell('git branch -M main 2>&1', dir);
    const push = await execShell('git push -u origin main 2>&1', dir, 60000);
    results.push(push.stdout);
  }

  res.json({ success: true, message: 'Git initialized', results });
}));

// POST /git/stash/:projectId
gitRouter.post('/stash/:projectId', asyncHandler(async (req, res) => {
  const dir = projectDir(req.params.projectId);
  const { action, message } = req.body;

  let cmd: string;
  switch (action) {
    case 'push': cmd = message ? `git stash push -m "${message}" 2>&1` : 'git stash push 2>&1'; break;
    case 'pop': cmd = 'git stash pop 2>&1'; break;
    case 'list': cmd = 'git stash list 2>&1'; break;
    default: throw new ValidationError('action must be push, pop, or list');
  }

  const result = await execShell(cmd, dir);
  res.json({ success: result.exitCode === 0, message: `Stash ${action} complete`, output: result.stdout });
}));
