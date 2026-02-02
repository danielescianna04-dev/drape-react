/**
 * Todo item interface
 */
export interface Todo {
  content: string;
  status: 'pending' | 'in_progress' | 'completed';
  activeForm: string;
}

/**
 * In-memory todo store per project
 * Maps projectId -> array of todos
 */
const todoStore = new Map<string, Todo[]>();

/**
 * Write/update todos for a project
 * @param projectId - The project ID
 * @param todos - Array of todo items
 * @returns Success message with todo count
 */
export function writeTodos(projectId: string, todos: Todo[]): string {
  // Validate todos
  for (const todo of todos) {
    if (!todo.content || !todo.status || !todo.activeForm) {
      return 'Error: Each todo must have content, status, and activeForm';
    }
    if (!['pending', 'in_progress', 'completed'].includes(todo.status)) {
      return `Error: Invalid status "${todo.status}". Must be pending, in_progress, or completed`;
    }
  }

  // Store todos
  todoStore.set(projectId, todos);

  // Count by status
  const pending = todos.filter(t => t.status === 'pending').length;
  const inProgress = todos.filter(t => t.status === 'in_progress').length;
  const completed = todos.filter(t => t.status === 'completed').length;

  return JSON.stringify({
    success: true,
    message: `Updated ${todos.length} todo(s): ${completed} completed, ${inProgress} in progress, ${pending} pending`,
    todos,
    summary: {
      total: todos.length,
      completed,
      in_progress: inProgress,
      pending,
    },
  }, null, 2);
}

/**
 * Get todos for a project
 * @param projectId - The project ID
 * @returns Array of todos (empty if none exist)
 */
export function getTodos(projectId: string): Todo[] {
  return todoStore.get(projectId) || [];
}

/**
 * Clear todos for a project
 * @param projectId - The project ID
 */
export function clearTodos(projectId: string): void {
  todoStore.delete(projectId);
}

/**
 * Get all projects with todos
 * @returns Array of project IDs that have todos
 */
export function getProjectsWithTodos(): string[] {
  return Array.from(todoStore.keys());
}
