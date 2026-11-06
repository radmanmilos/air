"""Self-improvement workflow: agent improves this project's own codebase safely."""
from __future__ import annotations

import subprocess
from pathlib import Path

from src.autonomy.planner import plan
from src.autonomy.executor import Executor
from src.autonomy.critic import critique
from src.tools.git_tools import git_branch, git_status, run_tests


def self_improve(goal: str, base_branch: str = "master") -> dict:
    # 1. create a working branch
    branch_name = "self-improve/" + goal.lower().replace(" ", "-")[:40]
    branch_name = "".join(c for c in branch_name if c.isalnum() or c in "-_/")
    print(f"Creating branch {branch_name}")
    print(git_branch(branch_name))

    # 2. plan
    steps = plan(goal)
    print("Plan:")
    for s in steps:
        print(" -", s)

    # 3. execute
    executor = Executor()
    results = executor.run_plan(goal, steps)

    # 4. run tests
    test_out = run_tests(".")
    print("TESTS:\n", test_out)

    # 5. critique
    combined = "\n".join(r["result"] for r in results)
    verdict = critique(goal, combined + "\n\nTESTS:\n" + test_out)
    print("CRITIQUE:", verdict)

    # 6. commit only if tests pass (exit 0) and critic passes
    tests_ok = "EXIT: 0" in test_out
    if tests_ok and verdict.get("pass"):
        from src.tools.git_tools import git_commit
        msg = f"self-improve: {goal}"
        print(git_commit(msg))
        return {"status": "committed", "branch": branch_name, "verdict": verdict}
    else:
        print("Not committing: tests or critic failed. Branch left for review.")
        return {"status": "not_committed", "branch": branch_name, "verdict": verdict, "tests_ok": tests_ok}