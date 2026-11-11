# Example 3: API Usage

This example demonstrates using MGAI's FastAPI interface for programmatic access.

## Start the Server

```bash
python -m src.interfaces.api --port 8000
```

Or from CLI (`mgai serve api` command if available).

## Health Check

```bash
curl http://localhost:8000/health
```

Expected response: `{"status": "healthy", "version": "1.0.0"}`

## List Models

```bash
curl -X POST http://localhost:8000/models
```

Response includes available Ollama models with capabilities (vision, tools, embedding).

## List Available Tools

```bash
curl http://localhost:8000/tools/list
```

Returns JSON schema of all registered tools (files, shell, web, memory).

## Chat with Agent

Send a POST request to `/chat`:

```bash
curl -X POST http://localhost:8000/chat \
  -H "Content-Type: application/json" \
  -d '{"message": "What Python files are in this directory?", "model": "qwen3.5:4b"}'
```

## Run Tools Programmatically

```python
import requests

# List files
files = requests.post("http://localhost:8000/tools/files", json={"action": "list_dir"})
print(files.json())

# Read file content
content = requests.post("http://localhost:8000/tools/files", json={
    "action": "read_file",
    "path": "README.md"
})
print(content.json())

# Run shell command (requires approval gate)
result = requests.post("http://localhost:8000/tools/shell", json={
    "command": "ls -la",
    "cwd": ".",
    "auto_approve": False  # Requires user confirmation
})
print(result.json())
```

## Web Dashboard UI

Open `http://localhost:8000/ui` in browser for a visual dashboard showing:
- Model status and capabilities
- Available tools with schemas
- Recent activity log
- Quick action buttons for common operations

---

*API requires running FastAPI server. See README.md for install instructions.*
