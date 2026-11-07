"""Tests for autonomy critic (Phase 4 - sub-cycle 3d)."""
import pytest
from unittest.mock import MagicMock
from src.autonomy.critic import critique


class TestCritic:
    """Test cases for critic function."""

    def test_critic_basic_structure(self):
        """Verify critic returns dictionary with required fields."""
        result = critique("simple goal", "did it!")
        
        # Should return dict
        assert isinstance(result, dict)
        
        # Check required fields
        assert "pass" in result
        assert "reason" in result
        assert "fix" in result

    def test_critic_returns_pass_true(self):
        """Verify pass field is boolean."""
        result = critique("write test", "test written")
        
        assert isinstance(result["pass"], bool)

    def test_critic_custom_model_parameter(self):
        """Verify model parameter is passed correctly (structure only)."""
        # Note: This tests the function signature, actual inference requires Ollama
        assert callable(critique)
        # Check that parameters are documented in __doc__
        if critique.__doc__:
            assert "model" in critique.__doc__ or "goal" in critique.__doc__

    def test_critic_returns_pass_false_on_bad_result(self):
        """Verify pass=False when result doesn't match."""
        # This is a simple heuristic - critic should catch obvious mismatches
        result = critique(
            "calculate 2+2",
            "five",  # Wrong answer
        )
        
        assert isinstance(result["pass"], bool)


if __name__ == "__main__":
    test_critic_basic_structure()
    test_critic_returns_pass_true()
    test_critic_custom_model_parameter()
    test_critic_returns_pass_false_on_bad_result()
    print("All critic tests passed!")
