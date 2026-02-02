export const AGENT_PORT = 13338;
export const DEV_SERVER_PORT = 3000;

export const IGNORED_DIRS = ['node_modules', '.git', '.next', 'dist', 'build', '.cache', '.turbo', '.pnpm-store', '.yarn', '.pnp'];

export const BINARY_EXTENSIONS = new Set([
  '.ico', '.png', '.jpg', '.jpeg', '.gif', '.bmp', '.webp', '.svg',
  '.woff', '.woff2', '.ttf', '.otf', '.eot',
  '.pdf', '.zip', '.tar', '.gz', '.mp3', '.mp4', '.avi', '.mov',
  '.exe', '.dll', '.so', '.dylib',
]);

export const TEXT_EXTENSIONS = new Set([
  '.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs',
  '.json', '.yaml', '.yml', '.toml',
  '.md', '.mdx', '.txt', '.csv',
  '.html', '.htm', '.css', '.scss', '.sass', '.less',
  '.xml', '.svg',
  '.sh', '.bash', '.zsh',
  '.py', '.rb', '.go', '.rs', '.java', '.kt',
  '.sql', '.graphql', '.gql',
  '.env', '.gitignore', '.dockerignore',
  '.editorconfig', '.prettierrc', '.eslintrc',
]);

export const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB
export const MAX_FILES_LIST = 500;

export const DOCKER_LABELS = {
  managed: 'drape.managed',
  project: 'drape.project',
} as const;
