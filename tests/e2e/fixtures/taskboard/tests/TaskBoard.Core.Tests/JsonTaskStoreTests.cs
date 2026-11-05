using TaskBoard.Core.Models;
using TaskBoard.Core.Storage;
using Xunit;
using System.IO;

namespace TaskBoard.Core.Tests;

public class JsonTaskStoreTests
{
    [Fact]
    public void Load_EmptyFile_ReturnsEmptyList()
    {
        var path = Path.GetTempFileName();
        File.WriteAllText(path, "");
        var store = new JsonTaskStore();
        var result = store.Load(path);
        Assert.Empty(result);
        File.Delete(path);
    }

    [Fact]
    public void SaveAndLoad_RoundTrips()
    {
        var path = Path.GetTempFileName();
        var store = new JsonTaskStore();
        var tasks = new List<TaskItem> { new() { Title = "test" } };
        store.Save(path, tasks);
        var loaded = store.Load(path);
        Assert.Single(loaded);
        Assert.Equal("test", loaded[0].Title);
        File.Delete(path);
    }
}