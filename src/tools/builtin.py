"""Register all built-in tools into a Registry."""
from __future__ import annotations

from src.tools.registry import Registry, Tool
from src.tools import files, shell, web, git_tools
from src.tools import guardrail_tools
from src.memory import tools as mem_tools
from src.senses import tools as sense_tools


def build_registry() -> Registry:
    r = Registry()

    r.register(Tool(
        name="read_file",
        description="Read the contents of a text file.",
        parameters={"type": "object", "properties": {"path": {"type": "string"}, "max_chars": {"type": "integer"}}, "required": ["path"]},
        func=files.read_file,
    ))
    r.register(Tool(
        name="write_file",
        description="Write (overwrite) a file with given content. Creates parent dirs.",
        parameters={"type": "object", "properties": {"path": {"type": "string"}, "content": {"type": "string"}}, "required": ["path", "content"]},
        func=files.write_file,
    ))
    r.register(Tool(
        name="append_file",
        description="Append content to a file.",
        parameters={"type": "object", "properties": {"path": {"type": "string"}, "content": {"type": "string"}}, "required": ["path", "content"]},
        func=files.append_file,
    ))
    r.register(Tool(
        name="list_dir",
        description="List files and directories in a path.",
        parameters={"type": "object", "properties": {"path": {"type": "string"}}, "required": []},
        func=files.list_dir,
    ))
    r.register(Tool(
        name="search_files",
        description="Search file contents by regex pattern.",
        parameters={"type": "object", "properties": {"pattern": {"type": "string"}, "path": {"type": "string"}, "max_results": {"type": "integer"}}, "required": ["pattern"]},
        func=files.search_files,
    ))
    r.register(Tool(
        name="file_info",
        description="Get metadata about a file or directory.",
        parameters={"type": "object", "properties": {"path": {"type": "string"}}, "required": ["path"]},
        func=files.file_info,
    ))
    r.register(Tool(
        name="run_shell",
        description="Run a shell command in a working directory. Use for builds, tests, git, etc.",
        parameters={"type": "object", "properties": {"command": {"type": "string"}, "cwd": {"type": "string"}, "timeout": {"type": "integer"}}, "required": ["command"]},
        func=shell.run_shell,
        requires_approval=True,
    ))
    r.register(Tool(
        name="web_search",
        description="Search the web (DuckDuckGo).",
        parameters={"type": "object", "properties": {"query": {"type": "string"}, "max_results": {"type": "integer"}}, "required": ["query"]},
        func=web.web_search,
    ))
    r.register(Tool(
        name="web_fetch",
        description="Fetch a URL and return its text content.",
        parameters={"type": "object", "properties": {"url": {"type": "string"}, "max_chars": {"type": "integer"}}, "required": ["url"]},
        func=web.web_fetch,
    ))

    # git / self-improvement tools
    r.register(Tool(name="git_status", description="Show git status.", parameters={"type": "object", "properties": {"cwd": {"type": "string"}}, "required": []}, func=git_tools.git_status))
    r.register(Tool(name="git_diff", description="Show git diff (staged optional).", parameters={"type": "object", "properties": {"cwd": {"type": "string"}, "staged": {"type": "boolean"}}, "required": []}, func=git_tools.git_diff))
    r.register(Tool(name="git_branch", description="Create/switch branch (name) or show current branch.", parameters={"type": "object", "properties": {"name": {"type": "string"}, "cwd": {"type": "string"}}, "required": []}, func=git_tools.git_branch))
    r.register(Tool(name="git_commit", description="Commit all changes with a message.", parameters={"type": "object", "properties": {"message": {"type": "string"}, "cwd": {"type": "string"}}, "required": ["message"]}, func=git_tools.git_commit))
    r.register(Tool(name="git_log", description="Show recent git commits.", parameters={"type": "object", "properties": {"cwd": {"type": "string"}, "n": {"type": "integer"}}, "required": []}, func=git_tools.git_log))
    r.register(Tool(name="run_tests", description="Run pytest in a directory.", parameters={"type": "object", "properties": {"cwd": {"type": "string"}, "pattern": {"type": "string"}}, "required": []}, func=git_tools.run_tests))

    # memory tools
    r.register(Tool(name="remember", description="Store a fact or note in long-term memory.", parameters={"type": "object", "properties": {"text": {"type": "string"}}, "required": ["text"]}, func=mem_tools.remember))
    r.register(Tool(name="recall", description="Retrieve relevant memories for a query.", parameters={"type": "object", "properties": {"query": {"type": "string"}, "top_k": {"type": "integer"}}, "required": ["query"]}, func=mem_tools.recall))
    r.register(Tool(name="index_file", description="Index a file into long-term memory (RAG).", parameters={"type": "object", "properties": {"path": {"type": "string"}}, "required": ["path"]}, func=mem_tools.index_file))
    r.register(Tool(name="memory_count", description="Count stored memories.", parameters={"type": "object", "properties": {}, "required": []}, func=mem_tools.memory_count))

    r.register(Tool(name="check_guardrails", description="Check if current git changes violate guardrails (protected files, diff size).", parameters={"type": "object", "properties": {"cwd": {"type": "string"}}, "required": []}, func=guardrail_tools.check_guardrails))

    # senses
    r.register(Tool(name="describe_image", description="Describe/understand an image file (vision).", parameters={"type": "object", "properties": {"path": {"type": "string"}, "question": {"type": "string"}}, "required": ["path"]}, func=sense_tools.describe_image))
    r.register(Tool(name="speak", description="Speak text aloud via TTS.", parameters={"type": "object", "properties": {"text": {"type": "string"}, "output_path": {"type": "string"}}, "required": ["text"]}, func=sense_tools.speak))
    r.register(Tool(name="listen", description="Listen via microphone for N seconds and return transcription.", parameters={"type": "object", "properties": {"seconds": {"type": "number"}}, "required": []}, func=sense_tools.listen))
    r.register(Tool(name="transcribe_file", description="Transcribe an audio file to text.", parameters={"type": "object", "properties": {"path": {"type": "string"}}, "required": ["path"]}, func=sense_tools.transcribe))

    return r
