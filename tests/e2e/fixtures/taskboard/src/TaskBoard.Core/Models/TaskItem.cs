namespace TaskBoard.Core.Models;

public enum TaskItemStatus { Todo, Done }

public class TaskItem
{
    public int Id { get; set; }
    public string Title { get; set; } = "";
    public List<string> Tags { get; set; } = new();
    public TaskItemStatus Status { get; set; } = TaskItemStatus.Todo;
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
    public DateTime? CompletedAt { get; set; }
}
