"""Tests for autonomy planner (Phase 4 - sub-cycle 3b)."""
import re
from src.autonomy.planner import plan


def test_plan_returns_list():
    """Verify planner returns a list of steps."""
    result = plan("Read config.yaml, write file")
    
    # Should return a list
    assert isinstance(result, list), "plan() should return a list"
    
    # Should be non-empty
    assert len(result) > 0, "Plan should have at least one step"


def test_plan_step_format():
    """Verify each step is a string."""
    result = plan("simple task")
    
    for step in result:
        assert isinstance(step, str), f"Step should be string, got {type(step)}"


def test_plan_empty_goal():
    """Test planner with empty goal - should return minimal steps."""
    result = plan("")
    
    # Should still handle gracefully (possibly empty list)
    assert isinstance(result, list)


if __name__ == "__main__":
    test_plan_returns_list()
    test_plan_step_format()
    test_plan_empty_goal()
    print("All planner tests passed!")
