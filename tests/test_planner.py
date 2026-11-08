"""Tests for autonomy planner (Phase 4 - sub-cycle 3b)."""
from unittest.mock import patch, MagicMock
from src.autonomy.planner import plan


@patch("src.autonomy.planner.OllamaClient")
def test_plan_returns_list(mock_client_cls):
    """Verify planner returns a list of steps."""
    mock_client = MagicMock()
    mock_client.chat.return_value = {"message": {"content": '["step1","step2"]'}}
    mock_client.extract_text.return_value = '["step1","step2"]'
    mock_client_cls.return_value = mock_client

    result = plan("Read config.yaml, write file")

    assert isinstance(result, list)
    assert len(result) > 0


@patch("src.autonomy.planner.OllamaClient")
def test_plan_step_format(mock_client_cls):
    """Verify each step is a string."""
    mock_client = MagicMock()
    mock_client.chat.return_value = {"message": {"content": '["simple task"]'}}
    mock_client.extract_text.return_value = '["simple task"]'
    mock_client_cls.return_value = mock_client

    result = plan("simple task")

    for step in result:
        assert isinstance(step, str)


@patch("src.autonomy.planner.OllamaClient")
def test_plan_empty_goal(mock_client_cls):
    """Test planner with empty goal - should return minimal steps."""
    mock_client = MagicMock()
    mock_client.chat.return_value = {"message": {"content": '[]'}}
    mock_client.extract_text.return_value = '[]'
    mock_client_cls.return_value = mock_client

    result = plan("")

    assert isinstance(result, list)