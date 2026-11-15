// Replays golden/<name>.input.json through the exported C# and compares each snapshot with
// golden/<name>.snapshots.json by exact string equality of canonical JSON.
//   npm run parity -w engine   (generates Generated/*.cs, then runs: dotnet run --project engine/csharp-parity)
using System;
using System.Collections.Generic;
using System.IO;
using System.Text.Json;
using ForkLab;

static class Parity
{
    static int Main(string[] args)
    {
        string golden = Path.Combine(AppContext.BaseDirectory, "../../../../golden");
        var cases = new Dictionary<string, Func<GraphProgram>> {
            { "jump", () => new Mechanic_Jump() }, { "dodge", () => new Mechanic_Dodge() }, { "collect", () => new Mechanic_Collect() },
            { "shooter", () => new Mechanic_Shooter() }, { "grove", () => new Mechanic_Grove() }, { "hurdle", () => new Mechanic_Hurdle() }, { "ledges", () => new Mechanic_Ledges() }, { "siege", () => new Mechanic_Siege() }, { "gunners", () => new Mechanic_Gunners() },
        };
        string generated = Path.Combine(AppContext.BaseDirectory, "../../../Generated");
        int failures = 0;
        foreach (var kv in cases)
        {
            string dir = File.Exists(Path.Combine(golden, kv.Key + ".input.json")) ? golden : generated;
            var input = JsonDocument.Parse(File.ReadAllText(Path.Combine(dir, kv.Key + ".input.json"))).RootElement;
            var expected = JsonDocument.Parse(File.ReadAllText(Path.Combine(dir, kv.Key + ".snapshots.json"))).RootElement;
            uint seed = input.GetProperty("seed").GetUInt32();
            int ticks = input.GetProperty("ticks").GetInt32();
            var changes = new List<int[]>();
            foreach (var rec in input.GetProperty("inputs").EnumerateArray()) changes.Add(new[] { rec[0].GetInt32(), rec[1].GetInt32() });
            var sim = new Sim(seed, kv.Value());
            var got = new List<string>();
            int ci = 0; uint mask = 0;
            for (int t = 0; t < ticks && sim.Status == "running"; t++)
            {
                while (ci < changes.Count && changes[ci][0] <= t) { mask = (uint)changes[ci][1]; ci++; }
                sim.StepTick(mask);
                if (sim.Tick % 60 == 0) got.Add(sim.SnapshotJson());
            }
            string last = sim.SnapshotJson();
            if (got.Count == 0 || got[got.Count - 1] != last) got.Add(last);
            var exp = new List<string>();
            foreach (var s in expected.EnumerateArray()) exp.Add(Canonical(s));
            bool ok = exp.Count == got.Count;
            for (int i = 0; ok && i < exp.Count; i++) if (exp[i] != got[i]) { ok = false; Console.WriteLine($"{kv.Key}: first mismatch at snapshot {i}\n  ts: {exp[i]}\n  cs: {got[i]}"); }
            Console.WriteLine($"parity.golden_{kv.Key}: {(ok ? "ok" : "FAIL")}");
            if (!ok) failures++;
        }
        return failures;
    }

    // Canonical JSON (sorted keys, no whitespace) of a parsed snapshot, matching engine/src/hash.ts canonical().
    static string Canonical(JsonElement e)
    {
        switch (e.ValueKind)
        {
            case JsonValueKind.Object:
                var props = new List<JsonProperty>(e.EnumerateObject());
                props.Sort((a, b) => string.CompareOrdinal(a.Name, b.Name));
                var parts = new List<string>();
                foreach (var p in props) parts.Add(JsonSerializer.Serialize(p.Name) + ":" + Canonical(p.Value));
                return "{" + string.Join(",", parts) + "}";
            case JsonValueKind.Array:
                var items = new List<string>();
                foreach (var x in e.EnumerateArray()) items.Add(Canonical(x));
                return "[" + string.Join(",", items) + "]";
            case JsonValueKind.String: return JsonSerializer.Serialize(e.GetString());
            case JsonValueKind.True: return "true";
            case JsonValueKind.False: return "false";
            default: return e.GetRawText();
        }
    }
}
