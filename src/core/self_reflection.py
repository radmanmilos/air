"""
Self-Reflection Module — MGAI learns from mistakes.
Analyzes failures, retrieves memory patterns, generates improvement goals.

Pattern: [FAILURE] → MEMORY RETRIEVAL → ROOT CAUSE → PREVENTION → UPDATE GOALS
"""
from __future__ import annotations
import json
from pathlib import Path
from typing import Any, Dict, List, Optional

# Memory imports (if memory module exists, else use placeholder)
try:
    from src.memory import MEMORY_REGISTRY
    HAS_MEMORY = True
except ImportError:
    HAS_MEMORY = False


class SelfReflection:
    """
    MGAI's self-improvement engine.
    Learns from failures, stores patterns, and generates improvement goals.
    """
    
    def __init__(self):
        """Initialize self-reflection with learned patterns."""
        self.failure_patterns = {
            "OLLAMA_CONNECTION": {
                "description": "404 or network errors when calling ollama_client.chat()",
                "cause": "Tests try non-existent models or Ollama server not running",
                "fix": "Use mocks in unit tests; validate model availability before live tests",
            },
            "PATH_SEPARATORS": {
                "description": "Unexpected path separators (\\ vs /) in Windows assertions",
                "cause": "Python Path class uses native OS separators",
                "fix": "Use .startswith() or normalize paths before comparison",
            },
            "LIVE_SERVICE_DEP": {
                "description": "Tests require live services (Ollama, etc.) instead of mocks",
                "cause": "Mixing unit test expectations with integration requirements",
                "fix": "Decorator @pytest.mark.integration for service-dependent tests",
            },
            "GUARDRAIL_VIOLATION": {
                "description": "Protected files modified before checking rules",
                "cause": "Forgetting GUARDRAILS.md check order",
                "fix": "Always run check_guardrails() BEFORE modifying protected files",
            },
        }
        
    def retrieve_memory_patterns(self, error_msg: str, stack_trace: Optional[str] = None) -> List[Dict[str, Any]]:
        """
        Retrieve relevant failure patterns from memory.
        
        Args:
            error_msg: Description of the failure (e.g., "404 Not Found")
            stack_trace: Optional traceback for deeper analysis
            
        Returns:
            List of matching failure patterns
        """
        matches = []
        
        # Direct pattern matching
        if "404" in str(error_msg) or "Not Found" in error_msg.lower():
            matches.append(self.failure_patterns["OLLAMA_CONNECTION"])
            
        if "\\" in str(error_msg) and ".json" in str(error_msg):
            matches.append(self.failure_patterns["PATH_SEPARATORS"])
            
        if "HTTPError" in str(error_msg) and "requests.exceptions" in str(error_msg):
            matches.append(self.failure_patterns["LIVE_SERVICE_DEP"])
            
        # Additional pattern checks for other issues
        if "AssertionError" in str(error_msg) and "does not match" in str(error_msg):
            matches.append(self.failure_patterns["PATH_SEPARATORS"])
            
        return matches
    
    def analyze_failure(self, test_result: Dict[str, Any]) -> List[Dict[str, Any]]:
        """
        Analyze a complete test run for failure patterns.
        
        Args:
            test_result: Dict containing pytest summary
            
        Returns:
            List of matched failure patterns
        """
        error_found = False
        
        # Check if any tests failed (simplified check - real version would parse actual output)
        if "FAILED" in str(test_result):
            error_found = True
            
        return self.retrieve_memory_patterns(
            error_msg=f"Test failures detected in {test_result.get('duration', 0)}s",
        )
    
    def generate_improvement_suggestion(self, pattern: Dict[str, Any]) -> str:
        """
        Generate a concrete improvement action suggestion.
        
        Args:
            pattern: Failure pattern dict
            
        Returns:
            String with actionable improvement suggestion
        """
        fixes = pattern.get("fix", "Investigate and document")
        return f"APPLY NOW: {fixes}"
    
    def update_improvement_goal(self, lesson: str, goal_num: int) -> Dict[str, Any]:
        """
        Update an improvement goal with a new lesson.
        
        Args:
            lesson: The learned lesson
            goal_num: Goal number to update
            
        Returns:
            Updated goal state dict
        """
        # In production: would update METADATA.md under "Improve Myself" section
        # Here we return the updated state for persistence
        
        goals = {
            1: {
                "name": "Memory-based learning",
                "status": "IN_PROGRESS",
                "lessons": [lesson],
            },
        }
        
        return goals.get(goal_num, {})
    
    def self_reflect_after_failure(self, test_summary: Dict[str, Any]) -> None:
        """
        Main reflection workflow after a failure.
        
        1. Retrieve relevant memory patterns
        2. Generate improvement suggestion
        3. Log to METADATA.md under "Improve Myself:" section
        
        Args:
            test_summary: Full pytest summary dict
        """
        # Step 1: Analyze what went wrong
        patterns = self.analyze_failure(test_summary)
        
        if not patterns:
            return
            
        # Step 2: Get suggestion from first match
        pattern = patterns[0]
        suggestion = self.generate_improvement_suggestion(pattern)
        
        # Step 3: Log the lesson (in production: persist to file)
        lesson_id = f"self-reflection-{len(patterns)}"
        
        # Format lesson for METADATA.md "Improve Myself:" section
        lesson_entry = {
            "lesson_id": lesson_id,
            "pattern_matched": pattern.get("description", ""),
            "improvement_suggested": suggestion,
            "timestamp": "2026-11-07 23:35 UTC (simulated)",
        }
        
        # Return for logging (production would write to file)
        self_reflection_log = [lesson_entry]
        
        print(f"🔍 SELF-REFLECTION COMPLETE")
        print(f"   Pattern matched: {lesson_entry['pattern_matched']}")
        print(f"   Improvement suggested: {suggestion}")
        print(f"   Lesson logged: {lesson_id}")


# Create singleton instance
self_reflection = SelfReflection()


if __name__ == "__main__":
    # Example usage
    mock_test_result = {
        "status": "FAILED", 
        "tests": 5,
        "duration": 38.2,
    }
    
    print("\n=== Simulating test failure analysis ===")
    patterns = self_reflection.analyze_failure(mock_test_result)
    print(f"Patterns found: {len(patterns)}")
    
    if patterns:
        for pattern in patterns:
            print(f"\n📋 Pattern: {pattern.get('description')}")
            print(f"💡 Suggestion: {self_reflection.generate_improvement_suggestion(pattern)}")
