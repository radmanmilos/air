using TaskBoard.Core.Formatting;
using TaskBoard.Core.Models;
using Xunit;

namespace TaskBoard.Core.Tests;

public class TaskFormatterTests
{
    [Fact]
    public void Format_Empty_ReturnsNoTasks()
    {
        var f = new TaskFormatter();
        Assert.Equal("(no tasks)", f.Format(new()));
    }

    [Fact]
    public void Format_SingleTask()
    {
        var f = new TaskFormatter();
        var tasks = new List<TaskItem> { new() { Id = 1, Title = "Buy milk", Status = TaskItemStatus.Todo } };
        var text = f.Format(tasks);
        Assert.Contains("Buy milk", text);
        Assert.Contains("Todo", text);
    }

    [Fact]
    public void Format_MultipleTasks()
    {
        var f = new TaskFormatter();
        var tasks = new List<TaskItem>
        {
            new() { Id = 1, Title = "A", Status = TaskItemStatus.Todo },
            new() { Id = 2, Title = "B", Status = TaskItemStatus.Done }
        };
        var text = f.Format(tasks);
        Assert.Contains("A", text);
        Assert.Contains("B", text);
    }
}
