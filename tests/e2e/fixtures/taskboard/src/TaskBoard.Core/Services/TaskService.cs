using TaskBoard.Core.Models;

namespace TaskBoard.Core.Services;

public class TaskService
{
    private readonly List<TaskItem> _tasks = new();
    private int _nextId = 1;

    public TaskItem Add(string title, List<string>? tags = null)
    {
        var task = new TaskItem { Id = _nextId++, Title = title, Tags = tags ?? new() };
        _tasks.Add(task);
        return task;
    }

    public void Complete(int id)
    {
        var task = _tasks.FirstOrDefault(t => t.Id == id);
        if (task != null)
        {
            task.Status = TaskItemStatus.Done;
        }
    }

    public List<TaskItem> FilterByTag(string tag)
    {
        return _tasks.Where(t => t.Tags.Contains(tag)).ToList();
    }

    public List<TaskItem> List() => _tasks.ToList();
}
