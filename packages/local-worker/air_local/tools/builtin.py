"""Register the retained built-in tools into a :class:`Registry`.

Only the tools AIR actually drives are registered. AIR's memory, senses,
plugin, guardrail, and project-execution tools were intentionally dropped.
"""
from __future__ import annotations

from air_local.scaffold import doc_generator, templates, test_generator
from air_local.tools import code_analysis, files, git, ollama_tools, shell, web
from air_local.tools.registry import Registry, Tool

_OBJECT = {"type": "object", "properties": {}, "required": []}


def build_registry() -> Registry:
    r = Registry()

    # ----- files -----
    r.register(
        Tool(
            name="read_file",
            description="Read the contents of a text file inside the job root.",
            parameters={
                "type": "object",
                "properties": {
                    "path": {"type": "string"},
                    "max_chars": {"type": "integer"},
                },
                "required": ["path"],
            },
            func=files.read_file,
        )
    )
    r.register(
        Tool(
            name="write_file",
            description="Write (overwrite) a file inside the job root.",
            parameters={
                "type": "object",
                "properties": {
                    "path": {"type": "string"},
                    "content": {"type": "string"},
                },
                "required": ["path", "content"],
            },
            func=files.write_file,
        )
    )
    r.register(
        Tool(
            name="append_file",
            description="Append content to a file inside the job root.",
            parameters={
                "type": "object",
                "properties": {
                    "path": {"type": "string"},
                    "content": {"type": "string"},
                },
                "required": ["path", "content"],
            },
            func=files.append_file,
        )
    )
    r.register(
        Tool(
            name="list_dir",
            description="List files and directories inside the job root.",
            parameters={
                "type": "object",
                "properties": {"path": {"type": "string"}},
                "required": [],
            },
            func=files.list_dir,
        )
    )
    r.register(
        Tool(
            name="search_files",
            description="Search file contents by regex inside the job root.",
            parameters={
                "type": "object",
                "properties": {
                    "pattern": {"type": "string"},
                    "path": {"type": "string"},
                    "max_results": {"type": "integer"},
                },
                "required": ["pattern"],
            },
            func=files.search_files,
        )
    )
    r.register(
        Tool(
            name="file_info",
            description="Get metadata about a file or directory.",
            parameters={
                "type": "object",
                "properties": {"path": {"type": "string"}},
                "required": ["path"],
            },
            func=files.file_info,
        )
    )

    # ----- shell -----
    r.register(
        Tool(
            name="run_shell",
            description=(
                "Run one allowlisted command (argv, no shell) inside the job root. "
                "Requires shell access to be enabled for the job."
            ),
            parameters={
                "type": "object",
                "properties": {
                    "command": {"type": "string"},
                    "cwd": {"type": "string"},
                    "timeout": {"type": "integer"},
                },
                "required": ["command"],
            },
            func=shell.run_shell,
        )
    )

    # ----- web -----
    r.register(
        Tool(
            name="web_search",
            description="Search the web and return result titles, links, and snippets.",
            parameters={
                "type": "object",
                "properties": {
                    "query": {"type": "string"},
                    "max_results": {"type": "integer"},
                },
                "required": ["query"],
            },
            func=web.web_search,
        )
    )
    r.register(
        Tool(
            name="web_fetch",
            description="Fetch a URL and return its text content.",
            parameters={
                "type": "object",
                "properties": {
                    "url": {"type": "string"},
                    "max_chars": {"type": "integer"},
                },
                "required": ["url"],
            },
            func=web.web_fetch,
        )
    )

    # ----- git -----
    r.register(
        Tool(
            name="git_status",
            description="Show git status.",
            parameters={
                "type": "object",
                "properties": {"cwd": {"type": "string"}},
                "required": [],
            },
            func=git.git_status,
        )
    )
    r.register(
        Tool(
            name="git_diff",
            description="Show git diff (staged optional).",
            parameters={
                "type": "object",
                "properties": {
                    "cwd": {"type": "string"},
                    "staged": {"type": "boolean"},
                },
                "required": [],
            },
            func=git.git_diff,
        )
    )
    r.register(
        Tool(
            name="git_branch",
            description="Create/switch branch (name) or show the current branch.",
            parameters={
                "type": "object",
                "properties": {
                    "name": {"type": "string"},
                    "cwd": {"type": "string"},
                },
                "required": [],
            },
            func=git.git_branch,
        )
    )
    r.register(
        Tool(
            name="git_commit",
            description="Commit all tracked changes with a message.",
            parameters={
                "type": "object",
                "properties": {
                    "message": {"type": "string"},
                    "cwd": {"type": "string"},
                },
                "required": ["message"],
            },
            func=git.git_commit,
        )
    )
    r.register(
        Tool(
            name="git_log",
            description="Show recent git commits.",
            parameters={
                "type": "object",
                "properties": {
                    "cwd": {"type": "string"},
                    "n": {"type": "integer"},
                },
                "required": [],
            },
            func=git.git_log,
        )
    )
    r.register(
        Tool(
            name="run_tests",
            description="Run pytest in the job root.",
            parameters={
                "type": "object",
                "properties": {
                    "cwd": {"type": "string"},
                    "pattern": {"type": "string"},
                },
                "required": [],
            },
            func=git.run_tests,
        )
    )

    # ----- ollama lifecycle -----
    r.register(
        Tool(
            name="ensure_ollama_online",
            description="Start Ollama if offline and wait up to the timeout.",
            parameters={
                "type": "object",
                "properties": {"timeout": {"type": "integer"}},
                "required": [],
            },
            func=ollama_tools.ensure_ollama_online,
        )
    )
    r.register(
        Tool(
            name="is_ollama_online",
            description="Check whether Ollama is currently online.",
            parameters=_OBJECT,
            func=ollama_tools.is_ollama_online,
        )
    )

    # ----- code analysis -----
    code_analysis.register_tools(r)

    # ----- scaffolding -----
    r.register(
        Tool(
            name="generate_tests",
            description="Generate pytest tests for all Python files in a project folder.",
            parameters={
                "type": "object",
                "properties": {
                    "folder": {"type": "string", "description": "Project folder path"}
                },
                "required": ["folder"],
            },
            func=test_generator.generate_tests_for_project,
        )
    )
    r.register(
        Tool(
            name="run_project_tests",
            description="Run pytest on a project's test suite.",
            parameters={
                "type": "object",
                "properties": {
                    "folder": {"type": "string", "description": "Project folder path"}
                },
                "required": ["folder"],
            },
            func=test_generator.run_tests_for_project,
        )
    )
    r.register(
        Tool(
            name="list_templates",
            description="List available project scaffolding templates.",
            parameters=_OBJECT,
            func=templates.list_templates,
        )
    )
    r.register(
        Tool(
            name="scaffold_project",
            description="Scaffold a new project from a template.",
            parameters={
                "type": "object",
                "properties": {
                    "template": {
                        "type": "string",
                        "description": (
                            "Template name (file_search, cli_tool, api_service, documentation)"
                        ),
                    },
                    "folder": {"type": "string", "description": "Target folder path"},
                },
                "required": ["template", "folder"],
            },
            func=templates.scaffold_project,
        )
    )
    r.register(
        Tool(
            name="generate_docs",
            description="Generate README.md, ARCHITECTURE.md, and API.md for a project.",
            parameters={
                "type": "object",
                "properties": {
                    "folder": {"type": "string", "description": "Project folder path"}
                },
                "required": ["folder"],
            },
            func=doc_generator.generate_all_docs,
        )
    )

    return r
