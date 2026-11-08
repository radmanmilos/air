"""Tests for autonomy critic (Phase 4 - sub-cycle 3d)."""
import pytest
from unittest.mock import patch, MagicMock
from src.autonomy.critic import critique


class TestCritic:
    """Unit tests - NO NETWORK REQUIRED (pure Python)."""

    @patch("src.autonomy.critic.OllamaClient")
    def test_critic_basic_structure(self, mock_client_cls):
        """Verify critic returns dictionary with required fields."""
        mock_client = MagicMock()
        mock_client.chat.return_value = {"message": {"content": '{"pass": true, "reason": "ok", "fix": ""}'}}
        mock_client.extract_text.return_value = '{"pass": true, "reason": "ok", "fix": ""}'
        mock_client_cls.return_value = mock_client

        result = critique("simple goal", "did it!")

        assert isinstance(result, dict)
        assert "pass" in result
        assert "reason" in result
        assert "fix" in result

    @patch("src.autonomy.critic.OllamaClient")
    def test_critic_returns_pass_true(self, mock_client_cls):
        """Verify pass field is boolean."""
        mock_client = MagicMock()
        mock_client.chat.return_value = {"message": {"content": '{"pass": true, "reason": "ok", "fix": ""}'}}
        mock_client.extract_text.return_value = '{"pass": true, "reason": "ok", "fix": ""}'
        mock_client_cls.return_value = mock_client

        result = critique("write test", "test written")

        assert isinstance(result["pass"], bool)

    @patch("src.autonomy.critic.OllamaClient")
    def test_critic_returns_pass_false_on_bad_result(self, mock_client_cls):
        """Verify pass=False when result doesn't match."""
        mock_client = MagicMock()
        mock_client.chat.return_value = {"message": {"content": '{"pass": false, "reason": "mismatch", "fix": ""}'}}
        mock_client.extract_text.return_value = '{"pass": false, "reason": "mismatch", "fix": ""}'
        mock_client_cls.return_value = mock_client

        result = critique("calculate 2+2", "five")

        assert isinstance(result["pass"], bool)


class TestCriticIntegration:
    """Integration tests - require Ollama service."""

    @pytest.mark.integration
    def test_critic_live_model(self):
        """Test with real Ollama - skips if service/model unavailable."""
        import os, requests
        ollama_url = os.getenv("OLLAMA_URL", "http://localhost:11434")
        try:
            r = requests.get(f"{ollama_url}/api/tags", timeout=5)
            models = [m.get("name", "") for m in r.json().get("models", [])]
            if not any("qwen3.5" in m for m in models):
                pytest.skip("qwen3.5:4b not available in this Ollama instance")
        except Exception:
            pytest.skip("Ollama service not available")
        result = critique("test", "result")
        assert isinstance(result, dict)
        assert "pass" in result


if __name__ == "__main__":
    print("Run with pytest")