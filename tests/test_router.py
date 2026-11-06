"""Tests for Router.pick method."""
import pytest
from src.core.router import Router


class TestRouterPick:
    """Test cases for Router.pick capability selection."""

    def setup_method(self):
        """Initialize router instance before each test."""
        self.router = Router()

    def test_pick_default_returns_qwen35_4b(self):
        """Test that default capability returns qwen3.5:4b model."""
        result = self.router.pick("default")
        assert result == "qwen3.5:4b"

    def test_pick_code_returns_qwen25_coder_7b(self):
        """Test that code capability returns qwen2.5-coder:7b model."""
        result = self.router.pick("code")
        assert result == "qwen2.5-coder:7b"

    def test_pick_coder_returns_qwen25_coder_7b(self):
        """Test that coder capability returns qwen2.5-coder:7b model."""
        result = self.router.pick("coder")
        assert result == "qwen2.5-coder:7b"

    def test_pick_programming_returns_qwen25_coder_7b(self):
        """Test that programming capability returns qwen2.5-coder:7b model."""
        result = self.router.pick("programming")
        assert result == "qwen2.5-coder:7b"

    def test_pick_reason_returns_deepseek_r1_1_5b(self):
        """Test that reason capability returns deepseek-r1:1.5b model."""
        result = self.router.pick("reason")
        assert result == "deepseek-r1:1.5b"

    def test_pick_plan_returns_deepseek_r1_1_5b(self):
        """Test that plan capability returns deepseek-r1:1.5b model."""
        result = self.router.pick("plan")
        assert result == "deepseek-r1:1.5b"

    def test_pick_critique_returns_deepseek_r1_1_5b(self):
        """Test that critique capability returns deepseek-r1:1.5b model."""
        result = self.router.pick("critique")
        assert result == "deepseek-r1:1.5b"

    def test_pick_think_fast_returns_deepseek_r1_1_5b(self):
        """Test that think_fast capability returns deepseek-r1:1.5b model."""
        result = self.router.pick("think_fast")
        assert result == "deepseek-r1:1.5b"

    def test_pick_embed_returns_nomic_embed_text(self):
        """Test that embed capability returns nomic-embed-text model."""
        result = self.router.pick("embed")
        assert result == "nomic-embed-text"

    def test_pick_embedding_returns_nomic_embed_text(self):
        """Test that embedding capability returns nomic-embed-text model."""
        result = self.router.pick("embedding")
        assert result == "nomic-embed-text"
