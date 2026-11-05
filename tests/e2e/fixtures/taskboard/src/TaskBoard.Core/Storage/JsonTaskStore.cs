using System.Text.Json;
using TaskBoard.Core.Models;

namespace TaskBoard.Core.Storage;

public class JsonTaskStore
{
    public List<TaskItem> Load(string path)
    {
        var json = File.ReadAllText(path);
        if (string.IsNullOrWhiteSpace(json))
            throw new JsonException("Empty file");
        return JsonSerializer.Deserialize<List<TaskItem>>(json) ?? new();
    }

    public void Save(string path, List<TaskItem> tasks)
    {
        var json = JsonSerializer.Serialize(tasks, new JsonSerializerOptions { WriteIndented = true });
        File.WriteAllText(path, json);
    }
}