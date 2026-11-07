"""FastAPI server for MGAI agent interface."""

from fastapi import FastAPI, HTTPException
from pydantic import BaseModel
from typing import List, Optional, Any

from src.core.ollama_client import OllamaClient
from src.tools.builtin import build_registry


app = FastAPI(title="MGAI API", version="1.0")


def get_tool_schemas() -> list[dict]:
    """Get all registered tool schemas."""
    registry = build_registry()
    return registry.schemas()


@app.get("/info")
async def info():
    """API info endpoint."""
    return {
        "name": "MGAI API Server",
        "version": "1.0",
        "endpoints": [
            "GET /",
            "GET /info",
            "POST /chat",
            "GET /models",
            "POST /tools/list",
            "GET /health",
        ]
    }


@app.get("/models")
def list_models():
    """List available Ollama models."""
    try:
        client = OllamaClient()
        models = client.list_models()
        return {"models": models}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to list models: {str(e)}")


@app.post("/chat")
def chat(
    model_name: str,
    message: str,
    images: Optional[List[str]] = None,
    system_prompt: Optional[str] = None,
):
    """Send a chat request to the Ollama model."""
    try:
        client = OllamaClient()
        response = client.chat(model_name, message, images, system_prompt)
        return {"role": "assistant", "content": response.get("message", {}).get("content", "")}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Chat failed: {str(e)}")


@app.post("/tools/list")
def list_tools():
    """List all registered tools with their schemas."""
    try:
        tool_schemas = get_tool_schemas()
        return {"tools": tool_schemas}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to list tools: {str(e)}")


# Health check endpoint
@app.get("/health")
async def health_check():
    """Health check endpoint."""
    return {"status": "healthy", "service": "mgai-api"}
