using System.Text.Json;
using Tvemu.Metadata;
if (args.Length == 0) return 1;
if (args[0] == "--conformance")
{
    var failures = MetadataApi.CheckConformance(args[1], args[2..]);
    foreach (var failure in failures) Console.WriteLine(failure);
    Console.WriteLine($"Conformance mismatches: {failures.Count(f => !f.StartsWith("SKIP:", StringComparison.Ordinal))}");
    return failures.Any(f => !f.StartsWith("SKIP:", StringComparison.Ordinal)) ? 1 : 0;
}
foreach (var path in args)
    foreach (var type in MetadataApi.Read(path))
    {
        Console.WriteLine($"TYPE {type.Assembly} {type.Name} : {type.BaseType} [{type.Attributes}]");
        foreach (var member in type.Members.Where(m => m.Public)) Console.WriteLine($"  {member.Signature}" + (member.Constant is null ? "" : " = " + member.Constant));
    }
return 0;
