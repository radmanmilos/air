using TaskBoard.Core.Models;
using TaskBoard.Core.Storage;
using Xunit;
using System.IO;
using System.Text.Json;

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

    [Fact]
    public void Load_WhitespaceFile_Throws()
    {
        var path = Path.GetTempFileName();
        File.WriteAllText(path, "   ");
        var store = new JsonTaskStore();
        Assert.Throws<JsonException>(() => store.Load(path));
        File.Delete(path);
    }

    [Fact]
    public void SaveAndLoad_PreservesTags()
    {
        var path = Path.GetTempFileName();
        var store = new JsonTaskStore();
        var tasks = new List<TaskItem> { new() { Title = "t", Tags = new() { "a", "b" } } };
        store.Save(path, tasks);
        var loaded = store.Load(path);
        Assert.Equal(2, loaded[0].Tags.Count);
        File.Delete(path);
    }
}