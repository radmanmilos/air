using TaskBoard.Core.Models;
using Xunit;

namespace TaskBoard.Core.Tests;

public class TaskItemTests
{
    [Fact]
    public void NewTask_DefaultsToTodo()
    {
        var t = new TaskItem();
        Assert.Equal(TaskItemStatus.Todo, t.Status);
    }

    [Fact]
    public void NewTask_CreatedAtIsSet()
    {
        var t = new TaskItem();
        Assert.NotEqual(default, t.CreatedAt);
    }

    [Fact]
    public void NewTask_CompletedAtIsNull()
    {
        var t = new TaskItem();
        Assert.Null(t.CompletedAt);
    }

    [Fact]
    public void NewTask_TagsDefaultEmpty()
    {
        var t = new TaskItem();
        Assert.Empty(t.Tags);
    }
}
