"""Dynamic Plugin System for MGAI.

Allows third-party tools to be dropped into a plugins/ directory and
automatically discovered, loaded, and registered with MGAI's tool registry.

Plugins are Python files that define a `register(registry)` function.
No protected files modified.
"""
from __future__ import annotations

import importlib
import importlib.util
import sys
from pathlib import Path
from typing import Any, Callable, Dict, List

from src.tools.registry import Registry, Tool


class Plugin:
    """Represents a loaded plugin."""

    def __init__(self, name: str, path: Path, module: Any):
        self.name = name
        self.path = path
        self.module = module
        self.registered_tools: List[str] = []


class PluginManager:
    """Discovers, loads, and manages MGAI plugins."""

    def __init__(self, plugins_dir: str = "plugins"):
        self.plugins_dir = Path(plugins_dir)
        self.plugins: Dict[str, Plugin] = {}
        self._loaded = False

    def discover(self) -> List[str]:
        """Scan the plugins directory for plugin files."""
        if not self.plugins_dir.exists():
            return []
        found: List[str] = []
        for f in sorted(self.plugins_dir.glob("*.py")):
            if f.name.startswith("_"):
                continue
            found.append(f.stem)
        return found

    def load(self, name: str) -> Plugin | None:
        """Load a single plugin by name."""
        if name in self.plugins:
            return self.plugins[name]

        path = self.plugins_dir / f"{name}.py"
        if not path.exists():
            return None

        spec = importlib.util.spec_from_file_location(
            f"mgaI_plugin_{name}", path)
        if spec is None or spec.loader is None:
            return None

        module = importlib.util.module_from_spec(spec)
        try:
            spec.loader.exec_module(module)
        except Exception as e:
            print(f"  [Plugin] Failed to load {name}: {e}")
            return None

        plugin = Plugin(name=name, path=path, module=module)
        self.plugins[name] = plugin
        return plugin

    def load_all(self) -> List[str]:
        """Load all discovered plugins."""
        loaded: List[str] = []
        for name in self.discover():
            if self.load(name):
                loaded.append(name)
        self._loaded = True
        return loaded

    def register_tools(self, registry: Registry) -> List[str]:
        """Register all tool-providing plugins with the registry."""
        registered: List[str] = []
        for name, plugin in self.plugins.items():
            register_fn = getattr(plugin.module, "register", None)
            if register_fn is None:
                continue
            try:
                # Plugin's register function receives the Registry
                register_fn(registry)
                # Track what was added
                before = set(registry.names())
                # We can't easily know what was added, so just track the plugin
                registered.append(name)
                plugin.registered_tools = list(
                    set(registry.names()) - set(registered)
                ) if registered else []
            except Exception as e:
                print(f"  [Plugin] Failed to register {name}: {e}")
        return registered

    def get_plugin(self, name: str) -> Plugin | None:
        return self.plugins.get(name)

    def list_plugins(self) -> List[Dict[str, Any]]:
        """List all loaded plugins with info."""
        result: List[Dict[str, Any]] = []
        for name, plugin in self.plugins.items():
            result.append({
                "name": name,
                "path": str(plugin.path),
                "tools": plugin.registered_tools,
                "has_register": hasattr(plugin.module, "register"),
            })
        return result


# Global plugin manager instance
plugin_manager = PluginManager()


def auto_load_plugins(registry: Registry) -> List[str]:
    """Discover, load, and register all plugins with the registry."""
    loaded = plugin_manager.load_all()
    registered = plugin_manager.register_tools(registry)
    return registered


# Convenience: create a sample plugin directory
def create_sample_plugin(plugins_dir: str = "plugins") -> str:
    """Create an example plugin file."""
    pdir = Path(plugins_dir)
    pdir.mkdir(parents=True, exist_ok=True)
    sample = pdir / "example_tool.py"
    sample.write_text('''"""Example MGAI plugin."""
from __future__ import annotations

from src.tools.registry import Registry, Tool


def greet(name: str = "world") -> str:
    return f"Hello, {name}! This is an MGAI plugin speaking."


def register(registry: Registry) -> None:
    registry.register(Tool(
        name="plugin_greet",
        description="Greet someone via an MGAI plugin.",
        parameters={
            "type": "object",
            "properties": {
                "name": {"type": "string", "description": "Name to greet",
                         "default": "world"}
            },
            "required": [],
        },
        func=greet,
    ))
''', encoding="utf-8")
    return str(sample)
