using TaskBoard.Core.Models;
using TaskBoard.Core.Services;
using Xunit;

namespace TaskBoard.Core.Tests;

public class TaskServiceTests
{
    [Fact]
    public void Complete_SetsCompletedAt()
    {
        var svc = new TaskService();
        var t = svc.Add("test");
        svc.Complete(t.Id);
        Assert.NotNull(svc.List().First(x => x.Id == t.Id).CompletedAt);
    }

    [Fact]
    public void FilterByTag_IsCaseInsensitive()
    {
        var svc = new TaskService();
        svc.Add("t1", new() { "Work" });
        Assert.Single(svc.FilterByTag("work"));
    }

    [Fact]
    public void Add_CreatesTask()
    {
        var svc = new TaskService();
        var t = svc.Add("hello");
        Assert.Equal("hello", t.Title);
        Assert.Equal(TaskItemStatus.Todo, t.Status);
    }

    [Fact]
    public void List_ReturnsAll()
    {
        var svc = new TaskService();
        svc.Add("a"); svc.Add("b");
        Assert.Equal(2, svc.List().Count);
    }

    [Fact]
    public void Add_AssignsIncrementingIds()
    {
        var svc = new TaskService();
        var a = svc.Add("a");
        var b = svc.Add("b");
        Assert.Equal(a.Id + 1, b.Id);
    }

    [Fact]
    public void Complete_SetsStatusDone()
    {
        var svc = new TaskService();
        var t = svc.Add("test");
        svc.Complete(t.Id);
        Assert.Equal(TaskItemStatus.Done, svc.List().First(x => x.Id == t.Id).Status);
    }
}
