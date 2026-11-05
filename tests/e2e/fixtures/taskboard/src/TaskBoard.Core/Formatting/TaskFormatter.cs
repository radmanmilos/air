using TaskBoard.Core.Models;

namespace TaskBoard.Core.Formatting;

public class TaskFormatter
{
    public string Format(List<TaskItem> tasks)
    {
        if (tasks.Count == 0) return "(no tasks)";
        var lines = new List<string> { "ID  Title            Status" };
        foreach (var t in tasks)
            lines.Add($"{t.Id,-3} {t.Title,-16} {t.Status}");
        return string.Join("\n", lines);
    }
}