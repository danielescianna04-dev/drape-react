export type GitProvider = 'github' | 'gitlab' | 'bitbucket' | 'gitea' | 'unknown';

export interface ParsedGitUrl {
  provider: GitProvider;
  owner: string;
  repo: string;
  fullName: string;
}

export const parseGitUrl = (url: string): ParsedGitUrl => {
  const lowerUrl = url.toLowerCase();
  let provider: GitProvider = 'unknown';
  let owner = 'unknown';
  let repo = url.split('/').pop()?.replace('.git', '') || 'repository';

  if (lowerUrl.includes('github.com')) {
    provider = 'github';
    const match = url.match(/github\.com\/([^\/]+)\/([^\/\?#]+)/);
    if (match) {
      owner = match[1];
      repo = match[2].replace('.git', '');
    }
  } else if (lowerUrl.includes('gitlab.com') || lowerUrl.includes('gitlab.')) {
    provider = 'gitlab';
    const match = url.match(/gitlab[^\/]*\/([^\/]+)\/([^\/\?#]+)/);
    if (match) {
      owner = match[1];
      repo = match[2].replace('.git', '');
    }
  } else if (lowerUrl.includes('bitbucket.org') || lowerUrl.includes('bitbucket.')) {
    provider = 'bitbucket';
    const match = url.match(/bitbucket[^\/]*\/([^\/]+)\/([^\/\?#]+)/);
    if (match) {
      owner = match[1];
      repo = match[2].replace('.git', '');
    }
  } else if (lowerUrl.endsWith('.git') || lowerUrl.includes('/git/')) {
    provider = 'gitea';
    const match = url.match(/\/([^\/]+)\/([^\/\?#]+?)(?:\.git)?$/);
    if (match) {
      owner = match[1];
      repo = match[2];
    }
  }

  return { provider, owner, repo, fullName: `${owner}/${repo}` };
};

export const checkRepoAccess = async (
  token: string | null,
  parsed: ParsedGitUrl
): Promise<{ accessible: boolean; status: number }> => {
  try {
    let apiUrl: string;
    const headers: Record<string, string> = {};

    switch (parsed.provider) {
      case 'github':
        apiUrl = `https://api.github.com/repos/${parsed.owner}/${parsed.repo}`;
        headers.Accept = 'application/vnd.github.v3+json';
        if (token) headers.Authorization = `token ${token}`;
        break;
      case 'gitlab':
        apiUrl = `https://gitlab.com/api/v4/projects/${encodeURIComponent(parsed.fullName)}`;
        if (token) headers['PRIVATE-TOKEN'] = token;
        break;
      case 'bitbucket':
        apiUrl = `https://api.bitbucket.org/2.0/repositories/${parsed.owner}/${parsed.repo}`;
        if (token) headers.Authorization = `Basic ${btoa(token)}`;
        break;
      default:
        return { accessible: true, status: 200 };
    }

    const response = await fetch(apiUrl, { headers });
    return {
      accessible: response.status >= 200 && response.status < 400,
      status: response.status,
    };
  } catch (e) {
    console.warn('📥 [checkRepoAccess] Network error:', e);
    return { accessible: false, status: 0 };
  }
};
