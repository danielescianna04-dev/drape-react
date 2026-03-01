import { fileService } from '../services/file.service';
import { log } from '../utils/logger';

interface SkillDefinition {
  name: string;
  description: string;
  content: string;
}

const SKILL_DIRS = ['.drape/skills', '.agents/skills', '.claude/skills'];

/**
 * Parse a skill markdown file with optional YAML frontmatter.
 */
function parseSkillFile(raw: string, filename: string): { name: string; description: string; body: string } {
  const frontmatterMatch = raw.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/);
  if (frontmatterMatch) {
    const fm = frontmatterMatch[1];
    const body = frontmatterMatch[2].trim();
    const name = fm.match(/name:\s*(.+)/)?.[1]?.trim() || filename.replace('.md', '');
    const description = fm.match(/description:\s*(.+)/)?.[1]?.trim() || '';
    return { name, description, body };
  }
  return { name: filename.replace('.md', ''), description: '', body: raw };
}

/**
 * Discover all available skills in standard directories.
 */
export async function discoverSkills(projectId: string): Promise<SkillDefinition[]> {
  const skills: SkillDefinition[] = [];

  for (const dir of SKILL_DIRS) {
    try {
      const listing = await fileService.listFiles(projectId, dir);
      if (!listing.success || !listing.data) continue;

      for (const entry of listing.data) {
        if (!entry.path.endsWith('.md')) continue;

        const filename = entry.path.split('/').pop() || entry.path;
        const filePath = `${dir}/${filename}`;
        const content = await fileService.readFile(projectId, filePath);
        if (content.success && content.data?.content) {
          const { name, description, body } = parseSkillFile(content.data.content, filename);
          skills.push({ name, description, content: body });
        }
      }
    } catch {
      // Directory doesn't exist — skip
    }
  }

  return skills;
}

/**
 * Load a specific skill by name.
 */
export async function loadSkill(projectId: string, skillName: string): Promise<string | null> {
  const skills = await discoverSkills(projectId);
  const skill = skills.find(s => s.name.toLowerCase() === skillName.toLowerCase());
  if (skill) {
    log.info(`[SkillLoader] Loaded skill: ${skill.name}`);
    return skill.content;
  }
  return null;
}
