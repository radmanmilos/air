import type { ModelToolDefinition } from '../../models/types';

// Authoritative tool definitions mirrored from the internal local-worker registry
// (packages/local-worker/air_local/tools). Evaluation uses these for model-visible
// tool-calling context and deterministic argument validation; it must not execute
// real tools.
export const EVAL_TOOL_DEFINITIONS: ModelToolDefinition[] = [
  { type: 'function', function: { name: 'read_file', description: 'Read the contents of a text file inside the job root.', parameters: { type: 'object', properties: { path: { type: 'string' }, max_chars: { type: 'integer' } }, required: ['path'] } } },
  { type: 'function', function: { name: 'write_file', description: 'Write (overwrite) a file inside the job root.', parameters: { type: 'object', properties: { path: { type: 'string' }, content: { type: 'string' } }, required: ['path', 'content'] } } },
  { type: 'function', function: { name: 'append_file', description: 'Append content to a file inside the job root.', parameters: { type: 'object', properties: { path: { type: 'string' }, content: { type: 'string' } }, required: ['path', 'content'] } } },
  { type: 'function', function: { name: 'list_dir', description: 'List files and directories inside the job root.', parameters: { type: 'object', properties: { path: { type: 'string' } }, required: [] } } },
  { type: 'function', function: { name: 'search_files', description: 'Search file contents by regex inside the job root.', parameters: { type: 'object', properties: { pattern: { type: 'string' }, path: { type: 'string' }, max_results: { type: 'integer' } }, required: ['pattern'] } } },
  { type: 'function', function: { name: 'file_info', description: 'Get metadata about a file or directory.', parameters: { type: 'object', properties: { path: { type: 'string' } }, required: ['path'] } } },
  { type: 'function', function: { name: 'run_shell', description: 'Run one allowlisted command (argv, no shell) inside the job root. Requires shell access to be enabled for the job.', parameters: { type: 'object', properties: { command: { type: 'string' }, cwd: { type: 'string' }, timeout: { type: 'integer' } }, required: ['command'] } } },
  { type: 'function', function: { name: 'web_search', description: 'Search the web and return result titles, links, and snippets.', parameters: { type: 'object', properties: { query: { type: 'string' }, max_results: { type: 'integer' } }, required: ['query'] } } },
  { type: 'function', function: { name: 'web_fetch', description: 'Fetch a URL and return its text content.', parameters: { type: 'object', properties: { url: { type: 'string' }, max_chars: { type: 'integer' } }, required: ['url'] } } },
  { type: 'function', function: { name: 'git_status', description: 'Show git status.', parameters: { type: 'object', properties: { cwd: { type: 'string' } }, required: [] } } },
  { type: 'function', function: { name: 'git_diff', description: 'Show git diff (staged optional).', parameters: { type: 'object', properties: { cwd: { type: 'string' }, staged: { type: 'boolean' } }, required: [] } } },
  { type: 'function', function: { name: 'git_branch', description: 'Create/switch branch (name) or show the current branch.', parameters: { type: 'object', properties: { name: { type: 'string' }, cwd: { type: 'string' } }, required: [] } } },
  { type: 'function', function: { name: 'git_commit', description: 'Commit all tracked changes with a message.', parameters: { type: 'object', properties: { message: { type: 'string' }, cwd: { type: 'string' } }, required: ['message'] } } },
  { type: 'function', function: { name: 'git_log', description: 'Show recent git commits.', parameters: { type: 'object', properties: { cwd: { type: 'string' }, n: { type: 'integer' } }, required: [] } } },
  { type: 'function', function: { name: 'run_tests', description: 'Run pytest in the job root.', parameters: { type: 'object', properties: { cwd: { type: 'string' }, pattern: { type: 'string' } }, required: [] } } },
  { type: 'function', function: { name: 'ensure_ollama_online', description: 'Start Ollama if offline and wait up to the timeout.', parameters: { type: 'object', properties: { timeout: { type: 'integer' } }, required: [] } } },
  { type: 'function', function: { name: 'is_ollama_online', description: 'Check whether Ollama is currently online.', parameters: { type: 'object', properties: {}, required: [] } } },
  { type: 'function', function: { name: 'analyze_code', description: 'Analyze Python code for lint, complexity, and security issues.', parameters: { type: 'object', properties: { path: { type: 'string', description: 'File or folder path to analyze' } }, required: ['path'] } } },
  { type: 'function', function: { name: 'check_dependencies', description: 'Check if required packages from requirements.txt are installed.', parameters: { type: 'object', properties: { path: { type: 'string', description: 'Path to requirements.txt or project folder' } }, required: ['path'] } } },
  { type: 'function', function: { name: 'count_lines', description: 'Count lines of code/text in a project folder.', parameters: { type: 'object', properties: { path: { type: 'string', description: 'Folder path to analyze' } }, required: ['path'] } } },
  { type: 'function', function: { name: 'generate_tests', description: 'Generate pytest tests for all Python files in a project folder.', parameters: { type: 'object', properties: { folder: { type: 'string', description: 'Project folder path' } }, required: ['folder'] } } },
  { type: 'function', function: { name: 'run_project_tests', description: 'Run pytest on a project\'s test suite.', parameters: { type: 'object', properties: { folder: { type: 'string', description: 'Project folder path' } }, required: ['folder'] } } },
  { type: 'function', function: { name: 'list_templates', description: 'List available project scaffolding templates.', parameters: { type: 'object', properties: {}, required: [] } } },
  { type: 'function', function: { name: 'scaffold_project', description: 'Scaffold a new project from a template.', parameters: { type: 'object', properties: { template: { type: 'string', description: 'Template name (file_search, cli_tool, api_service, documentation)' }, folder: { type: 'string', description: 'Target folder path' } }, required: ['template', 'folder'] } } },
  { type: 'function', function: { name: 'generate_docs', description: 'Generate README.md, ARCHITECTURE.md, and API.md for a project.', parameters: { type: 'object', properties: { folder: { type: 'string', description: 'Project folder path' } }, required: ['folder'] } } },
];

export const EVAL_TOOL_REGISTRY = new Map(EVAL_TOOL_DEFINITIONS.map((t) => [t.function.name, t]));
