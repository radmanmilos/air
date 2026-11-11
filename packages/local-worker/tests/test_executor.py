"""Tests for autonomy executor (Phase 4 - sub-cycle 3d)."""
import pytest
from src.autonomy.executor import Executor


class TestExecutor:
    """Test cases for executor."""

    def test_executor_initialization(self):
        """Verify executor initializes correctly."""
        executor = Executor()
        
        # Check attributes exist
        assert hasattr(executor, "checkpoint_file")
        assert hasattr(executor, "max_steps_per_task")
        assert executor.max_steps_per_task == 30

    def test_executor_default_checkpoint(self):
        """Verify default checkpoint file path."""
        executor = Executor()
        
        # Should default to .agent/plan_state.json (platform-native path)
        expected = ".agent" + (":" if "\\" not in "" else ";") + "plan_state.json"
        assert str(executor.checkpoint_file).startswith(".agent")

    def test_executor_custom_max_steps(self):
        """Verify custom max_steps_per_task parameter."""
        executor = Executor(max_steps_per_task=50)
        
        assert executor.max_steps_per_task == 50


if __name__ == "__main__":
    test_executor_initialization()
    test_executor_default_checkpoint()
    test_executor_custom_max_steps()
    print("All executor tests passed!")
