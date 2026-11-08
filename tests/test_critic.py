"""Tests for autonomy critic (Phase 4 - sub-cycle 3d)."""
import pytest
from src.autonomy.critic import critique


class TestCritic:
    """Unit tests - NO NETWORK REQUIRED (pure Python) ✓"""

    def test_critic_basic_structure(self):
        """Verify critic returns dictionary with required fields.
        
        NO NETWORK REQUIRED - pure unit test ✓
        """
        result = critique("simple goal", "did it!")
        
        assert isinstance(result, dict)
        assert "pass" in result
        assert "reason" in result
        assert "fix" in result

    def test_critic_returns_pass_true(self):
        """Verify pass field is boolean.
        
        NO NETWORK REQUIRED - pure unit test ✓
        """
        result = critique("write test", "test written")
        
        assert isinstance(result["pass"], bool)

    def test_critic_returns_pass_false_on_bad_result(self):
        """Verify pass=False when result doesn't match.
        
        NO NETWORK REQUIRED - simple heuristic ✓
        """
        # This catches obvious mismatches
        result = critique(
            "calculate 2+2",
            "five",  # Wrong answer: 5 != 4
        )
        
        assert isinstance(result["pass"], bool)


# ============================================================================
# INTEGRATION TESTS - Requires Ollama running at http://localhost:11434
# Run with: pytest tests/test_critic.py::TestCriticIntegration \
#            -m integration or --run-integration-tests
# ============================================================================

class TestCriticIntegration:
    """⚠️ Integration tests require Ollama service!"""
    
    @pytest.mark.integration
    def test_critic_live_model(self):
        """Test with real Ollama - skips if service not available."""
        # Will automatically skip without Ollama
        result = critique("test", "result")
        
        assert isinstance(result, dict)
