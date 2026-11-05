using TaskBoard.Core.Models;
using TaskBoard.Core.Services;
using TaskBoard.Core.Storage;
using TaskBoard.Core.Formatting;

class Program
{
    static void Main(string[] args)
    {
        var service = new TaskService();
        var store = new JsonTaskStore();
        var formatter = new TaskFormatter();

        if (args.Length == 0) { Console.WriteLine("Usage: add|list|done|tag"); return; }

        switch (args[0])
        {
            case "add":
                var title = args.Length > 1 ? args[1] : "Untitled";
                service.Add(title);
                Console.WriteLine($"Added: {title}");
                break;
            case "list":
                // BUG-4: crashes on empty list
                var tasks = service.List();
                Console.WriteLine(formatter.Format(tasks));
                break;
            case "done":
                if (args.Length > 1 && int.TryParse(args[1], out var id))
                    service.Complete(id);
                Console.WriteLine("Done.");
                break;
            case "tag":
                if (args.Length > 2 && int.TryParse(args[1], out var tid))
                {
                    var t = service.List().FirstOrDefault(x => x.Id == tid);
                    if (t != null) t.Tags.Add(args[2]);
                }
                Console.WriteLine("Tagged.");
                break;
            default:
                Console.WriteLine("Unknown command");
                break;
        }
    }
}