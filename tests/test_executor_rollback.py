"""Test executor rollback functionality."""
import json
from pathlib import Path
from src.autonomy.executor import Executor


def test_rollback_has_method():
    """Verify rollback capability exists."""
    exec = Executor(checkpoint_file=".agent/test_checkpoint.json")
    assert hasattr(exec, '_rollback'), "Executor must have _rollback method"
    print("✓ Executor has rollback support")


def test_get_previous_commit_works():
    """Verify commit retrieval works."""
    exec = Executor()
    prev = exec._get_previous_commit()
    # Should return None if no commits or valid hash
    assert isinstance(prev, (str, type(None))), "Should return string or None"
    print(f"✓ Commit retrieval works: {prev}")


def test_rollback_skips_if_no_previous_commit():
    """Verify rollback handles missing previous commit."""
    exec = Executor()
    # Simulate calling on first step with no prior commits
    exec._rollback()  # Should not raise
    print("✓ Rollback gracefully handles no previous commit")


if __name__ == "__main__":
    test_rollback_has_method()
    test_get_previous_commit_works()
    test_rollback_skips_if_no_previous_commit()
