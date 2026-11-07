"""FastAPI server for MGAI agent interface with minimal UI.

Reuses the canonical `app` from `src.interfaces.api` and only adds the
HTML dashboard route on top, so endpoints are defined in one place.
"""
from __future__ import annotations

from fastapi import FastAPI

from src.interfaces.api import app

# Simple HTML file for UI dashboard
HTML_FILE = """<!DOCTYPE html>
<html>
<head>
    <title>MGAI Dashboard</title>
    <style>
        body { font-family: -apple-system, sans-serif; margin: 20px; background: #1a1a2e; color: #eee; }
        h1 { color: #00d9ff; }
        .card { background: #16213e; padding: 15px; border-radius: 8px; margin: 10px 0; border-left: 4px solid #00d9ff; }
        pre { white-space: pre-wrap; font-size: 12px; overflow-x: auto; }
    </style>
</head>
<body>
    <h1>MGAI Dashboard 🚀</h1>

    <div class="card">
        <h3>📊 Status</h3>
        <pre id="status"></pre>
    </div>

    <div class="card">
        <h3>🤖 Models</h3>
        <ul id="models-list"></ul>
    </div>

    <div class="card">
        <h3>🛠️ Tools</h3>
        <pre id="tools-list"></pre>
    </div>

    <script>
        async function refresh() {
            try {
                const [statusRes, modelsRes, toolsRes] = await Promise.all([
                    fetch('/health'),
                    fetch('/models'),
                    fetch('/tools/list', {method: 'POST'})
                ]);

                const status = await statusRes.json();
                const models = await modelsRes.json();
                const tools = await toolsRes.json();

                document.getElementById('status').innerText = JSON.stringify(status, null, 2);
                document.getElementById('models-list').innerHTML = '';
                if (models.models) {
                    models.models.forEach(m => {
                        const li = document.createElement('li');
                        li.textContent = m.name || m.model || JSON.stringify(m);
                        document.getElementById('models-list').appendChild(li);
                    });
                } else {
                    document.getElementById('models-list').innerHTML = '<li>No models found</li>';
                }

                document.getElementById('tools-list').innerText = JSON.stringify(tools, null, 2);
            } catch (e) {
                console.error('Error refreshing:', e);
            }
        }

        setInterval(refresh, 5000);
        refresh();
    </script>
</body>
</html>"""


@app.get("/")
async def ui_root():
    """Serve the UI dashboard (overrides the JSON root from api.py)."""
    return HTML_FILE


if __name__ == "__main__":
    import uvicorn
    print("🚀 Starting MGAI Dashboard API...")
    print("   Visit http://127.0.0.1:8000 in your browser")
    print("   Press Ctrl+C to stop")
    uvicorn.run(app, host="127.0.0.1", port=8000)
