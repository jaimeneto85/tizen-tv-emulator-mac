using System.Collections.Immutable;
using System.Reflection;
using System.Reflection.Metadata;
using System.Reflection.PortableExecutable;
using System.Text.Json;

namespace Tvemu.Metadata;

public sealed record ApiMember(string Name, string Signature, bool Public, string? Constant = null, int Flags = 0, string? IdentitySignature = null);
public sealed record ApiType(string Name, string Assembly, string BaseType, TypeAttributes Attributes, IReadOnlyList<ApiMember> Members, string BaseAssembly = "");
public sealed record InspectionItem(string Assembly, string Type, string? Member, string Status);

public sealed class SignatureNames(bool exactIdentity = false) : ISignatureTypeProvider<string, object?>
{
    public string GetArrayType(string elementType, ArrayShape shape) => elementType + "[" + new string(',', shape.Rank - 1) + "]";
    public string GetByReferenceType(string elementType) => elementType + "&";
    public string GetFunctionPointerType(MethodSignature<string> signature) => "fn(" + string.Join(',', signature.ParameterTypes) + ")->" + signature.ReturnType;
    public string GetGenericInstantiation(string genericType, ImmutableArray<string> typeArguments) => genericType + "<" + string.Join(',', typeArguments) + ">";
    public string GetGenericMethodParameter(object? genericContext, int index) => "!!" + index;
    public string GetGenericTypeParameter(object? genericContext, int index) => "!" + index;
    public string GetModifiedType(string modifier, string unmodifiedType, bool isRequired) => unmodifiedType + (isRequired ? " modreq(" : " modopt(") + modifier + ")";
    public string GetPinnedType(string elementType) => elementType;
    public string GetPointerType(string elementType) => elementType + "*";
    public string GetPrimitiveType(PrimitiveTypeCode typeCode) => typeCode switch { PrimitiveTypeCode.Void => "System.Void", PrimitiveTypeCode.Boolean => "System.Boolean", PrimitiveTypeCode.Char => "System.Char", PrimitiveTypeCode.SByte => "System.SByte", PrimitiveTypeCode.Byte => "System.Byte", PrimitiveTypeCode.Int16 => "System.Int16", PrimitiveTypeCode.UInt16 => "System.UInt16", PrimitiveTypeCode.Int32 => "System.Int32", PrimitiveTypeCode.UInt32 => "System.UInt32", PrimitiveTypeCode.Int64 => "System.Int64", PrimitiveTypeCode.UInt64 => "System.UInt64", PrimitiveTypeCode.Single => "System.Single", PrimitiveTypeCode.Double => "System.Double", PrimitiveTypeCode.String => "System.String", PrimitiveTypeCode.IntPtr => "System.IntPtr", PrimitiveTypeCode.UIntPtr => "System.UIntPtr", PrimitiveTypeCode.Object => "System.Object", _ => typeCode.ToString() };
    public string GetSZArrayType(string elementType) => elementType + "[]";
    public string GetTypeFromDefinition(MetadataReader reader, TypeDefinitionHandle handle, byte rawTypeKind)
    {
        var type = reader.GetTypeDefinition(handle);
        var parent = type.GetDeclaringType();
        var name = parent.IsNil ? Join(reader.GetString(type.Namespace), reader.GetString(type.Name)) : GetTypeFromDefinition(reader, parent, 0) + "/" + reader.GetString(type.Name);
        return Identity(name, reader.GetString(reader.GetAssemblyDefinition().Name), rawTypeKind);
    }
    public string GetTypeFromReference(MetadataReader reader, TypeReferenceHandle handle, byte rawTypeKind)
    {
        var type = reader.GetTypeReference(handle);
        var name = type.ResolutionScope.Kind == HandleKind.TypeReference ? GetTypeFromReference(reader, (TypeReferenceHandle)type.ResolutionScope, 0) + "/" + reader.GetString(type.Name) : Join(reader.GetString(type.Namespace), reader.GetString(type.Name));
        var scope = type.ResolutionScope;
        while (scope.Kind == HandleKind.TypeReference) scope = reader.GetTypeReference((TypeReferenceHandle)scope).ResolutionScope;
        var assembly = scope.Kind == HandleKind.AssemblyReference ? reader.GetString(reader.GetAssemblyReference((AssemblyReferenceHandle)scope).Name) : reader.GetString(reader.GetAssemblyDefinition().Name);
        return Identity(name, assembly, rawTypeKind);
    }
    public string GetTypeFromSpecification(MetadataReader reader, object? genericContext, TypeSpecificationHandle handle, byte rawTypeKind) => reader.GetTypeSpecification(handle).DecodeSignature(this, genericContext);
    public string TypeName(MetadataReader reader, EntityHandle handle) => handle.Kind switch { HandleKind.TypeDefinition => GetTypeFromDefinition(reader, (TypeDefinitionHandle)handle, 0), HandleKind.TypeReference => GetTypeFromReference(reader, (TypeReferenceHandle)handle, 0), HandleKind.TypeSpecification => GetTypeFromSpecification(reader, null, (TypeSpecificationHandle)handle, 0), _ => "" };
    public static string Method(string name, MethodSignature<string> signature) => (signature.Header.IsInstance ? "instance " : "static ") + name + "``" + signature.GenericParameterCount + "(" + string.Join(',', signature.ParameterTypes) + "):" + signature.ReturnType;
    private string Identity(string name, string assembly, byte kind)
    {
        if (!exactIdentity || kind == 0) return name;
        if (assembly is "mscorlib" or "netstandard" or "System" || assembly.StartsWith("System.", StringComparison.Ordinal)) assembly = "framework";
        return $"[{assembly}]{(kind == 0x11 ? "valuetype" : "class")}:{name}";
    }
    private static string Join(string ns, string name) => ns.Length == 0 ? name : ns + "." + name;
}

public static class MetadataApi
{
    public static IReadOnlyList<ApiType> Read(string path)
    {
        using var stream = File.OpenRead(path);
        using var pe = new PEReader(stream);
        var reader = pe.GetMetadataReader();
        var names = new SignatureNames();
        var identities = new SignatureNames(true);
        var assembly = reader.GetString(reader.GetAssemblyDefinition().Name);
        var result = new List<ApiType>();
        foreach (var handle in reader.TypeDefinitions)
        {
            var type = reader.GetTypeDefinition(handle);
            var members = new List<ApiMember>();
            foreach (var methodHandle in type.GetMethods())
            {
                var method = reader.GetMethodDefinition(methodHandle);
                var name = reader.GetString(method.Name);
                var access = method.Attributes & MethodAttributes.MemberAccessMask;
                members.Add(new(name, SignatureNames.Method(name, method.DecodeSignature(names, null)), access is MethodAttributes.Public or MethodAttributes.Family or MethodAttributes.FamORAssem, null, (int)(method.Attributes & (MethodAttributes.Static | MethodAttributes.Abstract | MethodAttributes.Virtual | MethodAttributes.Final)), SignatureNames.Method(name, method.DecodeSignature(identities, null))));
            }
            foreach (var fieldHandle in type.GetFields())
            {
                var field = reader.GetFieldDefinition(fieldHandle);
                var name = reader.GetString(field.Name);
                var access = field.Attributes & FieldAttributes.FieldAccessMask;
                var constant = field.GetDefaultValue();
                members.Add(new(name, name + ":" + field.DecodeSignature(names, null), access is FieldAttributes.Public or FieldAttributes.Family or FieldAttributes.FamORAssem, constant.IsNil ? null : Convert.ToHexString(reader.GetBlobBytes(reader.GetConstant(constant).Value)), (int)(field.Attributes & (FieldAttributes.Static | FieldAttributes.Literal | FieldAttributes.InitOnly)), name + ":" + field.DecodeSignature(identities, null)));
            }
            result.Add(new(names.GetTypeFromDefinition(reader, handle, 0), assembly, type.BaseType.IsNil ? "" : names.TypeName(reader, type.BaseType), type.Attributes, members, DeclaringAssembly(reader, type.BaseType, assembly)));
        }
        return result;
    }

    private static string DeclaringAssembly(MetadataReader reader, EntityHandle handle, string localAssembly)
    {
        if (handle.IsNil) return "";
        if (handle.Kind == HandleKind.TypeDefinition) return localAssembly;
        if (handle.Kind == HandleKind.TypeReference)
        {
            var scope = reader.GetTypeReference((TypeReferenceHandle)handle).ResolutionScope;
            return scope.Kind == HandleKind.AssemblyReference ? reader.GetString(reader.GetAssemblyReference((AssemblyReferenceHandle)scope).Name) : DeclaringAssembly(reader, scope, localAssembly);
        }
        if (handle.Kind == HandleKind.TypeSpecification)
        {
            var blob = reader.GetBlobReader(reader.GetTypeSpecification((TypeSpecificationHandle)handle).Signature);
            if (blob.ReadSignatureTypeCode() == SignatureTypeCode.GenericTypeInstance) { blob.ReadSignatureTypeCode(); return DeclaringAssembly(reader, blob.ReadTypeHandle(), localAssembly); }
        }
        return localAssembly;
    }

    public static IReadOnlyList<InspectionItem> Inspect(string appPath, string shimDirectory)
    {
        var types = Directory.GetFiles(shimDirectory, "Tizen*.dll").SelectMany(Read).ToDictionary(t => (t.Assembly, t.Name));
        using var stream = File.OpenRead(appPath);
        using var pe = new PEReader(stream);
        var reader = pe.GetMetadataReader();
        var names = new SignatureNames();
        var identities = new SignatureNames(true);
        var result = new List<InspectionItem>();
        string AssemblyOf(EntityHandle handle)
        {
            if (handle.Kind == HandleKind.TypeReference)
            {
                var scope = reader.GetTypeReference((TypeReferenceHandle)handle).ResolutionScope;
                return scope.Kind == HandleKind.AssemblyReference ? reader.GetString(reader.GetAssemblyReference((AssemblyReferenceHandle)scope).Name) : AssemblyOf(scope);
            }
            if (handle.Kind == HandleKind.TypeSpecification)
            {
                var blob = reader.GetBlobReader(reader.GetTypeSpecification((TypeSpecificationHandle)handle).Signature);
                var code = blob.ReadSignatureTypeCode();
                if (code == SignatureTypeCode.GenericTypeInstance) { blob.ReadSignatureTypeCode(); return AssemblyOf(blob.ReadTypeHandle()); }
            }
            return "";
        }
        foreach (var handle in reader.TypeReferences)
        {
            var assembly = AssemblyOf(handle);
            if (!assembly.StartsWith("Tizen", StringComparison.Ordinal)) continue;
            var name = names.TypeName(reader, handle);
            result.Add(new(assembly, name, null, types.TryGetValue((assembly, name), out var resolvedType) && IsVisible(resolvedType) ? "supported" : "missing"));
        }
        foreach (var handle in reader.MemberReferences)
        {
            var member = reader.GetMemberReference(handle);
            var assembly = AssemblyOf(member.Parent);
            if (!assembly.StartsWith("Tizen", StringComparison.Ordinal)) continue;
            var typeName = names.TypeName(reader, member.Parent);
            var name = reader.GetString(member.Name);
            var signature = member.GetKind() == MemberReferenceKind.Method ? SignatureNames.Method(name, member.DecodeMethodSignature(names, null)) : name + ":" + member.DecodeFieldSignature(names, null);
            var identity = member.GetKind() == MemberReferenceKind.Method ? SignatureNames.Method(name, member.DecodeMethodSignature(identities, null)) : name + ":" + member.DecodeFieldSignature(identities, null);
            var exactTypeName = identities.TypeName(reader, member.Parent);
            var found = Resolve(types, assembly, typeName, signature, identity, exactTypeName);
            result.Add(new(assembly, typeName, signature, found ? "supported" : "missing"));
        }
        return result.Distinct().OrderBy(x => x.Assembly).ThenBy(x => x.Type).ThenBy(x => x.Member).ToArray();
    }

    public static bool IsVisible(ApiType type) => (type.Attributes & TypeAttributes.VisibilityMask) is TypeAttributes.Public or TypeAttributes.NestedPublic or TypeAttributes.NestedFamily or TypeAttributes.NestedFamORAssem;

    public static IReadOnlyList<string> CheckConformance(string shimDirectory, params string[] referenceDirectories)
    {
        var references = referenceDirectories.Where(Directory.Exists).Select(directory => Directory.GetFiles(directory, "Tizen*.dll").SelectMany(Read).ToDictionary(t => (t.Assembly, t.Name))).ToArray();
        if (references.Length == 0) return new[] { "SKIP: Tizen reference assemblies not installed" };
        var failures = new List<string>();
        foreach (var type in Directory.GetFiles(shimDirectory, "Tizen*.dll").SelectMany(Read).Where(IsVisible))
        {
            var candidates = references.Select(reference => reference.GetValueOrDefault((type.Assembly, type.Name))).OfType<ApiType>().ToArray();
            if (candidates.Length == 0) { failures.Add($"TYPE {type.Assembly} {type.Name}: absent from references"); continue; }
            if (!candidates.Any(candidate => candidate.BaseType == type.BaseType)) failures.Add($"BASE {type.Name}: shim {type.BaseType}; reference {string.Join(" | ", candidates.Select(c => c.BaseType).Distinct())}");
            var shape = TypeAttributes.ClassSemanticsMask;
            if (!candidates.Any(candidate => (candidate.Attributes & shape) == (type.Attributes & shape))) failures.Add($"SHAPE {type.Name}: class/interface mismatch");
            foreach (var member in type.Members.Where(member => member.Public))
            {
                var matches = candidates.SelectMany(candidate => candidate.Members).Where(candidate => candidate.Public && candidate.Signature == member.Signature && candidate.IdentitySignature == member.IdentitySignature).ToArray();
                if (matches.Length == 0) { failures.Add($"MEMBER {type.Name}::{member.Signature}: absent from references"); continue; }
                if (member.Constant is not null && !matches.Any(candidate => candidate.Constant == member.Constant)) failures.Add($"CONSTANT {type.Name}::{member.Signature}: shim {member.Constant}; reference {string.Join(" | ", matches.Select(m => m.Constant))}");
                if (!member.Signature.Contains("``", StringComparison.Ordinal) && !matches.Any(candidate => candidate.Flags == member.Flags)) failures.Add($"FIELD FLAGS {type.Name}::{member.Signature}: shim {member.Flags}; reference {string.Join(" | ", matches.Select(m => m.Flags))}");
            }
        }
        return failures;
    }

    public static bool Resolve(IReadOnlyDictionary<(string Assembly, string Name), ApiType> types, string assembly, string name, string signature, string? exactSignature = null, string? exactTypeName = null)
    {
        var seen = new HashSet<string>();
        while (seen.Add(assembly + ":" + name))
        {
            var generic = name.IndexOf('<');
            var definition = generic < 0 ? name : name[..generic];
            if (!types.TryGetValue((assembly, definition), out var type) || !IsVisible(type)) return false;
            var arguments = generic < 0 ? [] : SplitArguments(name[(generic + 1)..^1]);
            var exactGeneric = exactTypeName?.IndexOf('<') ?? -1;
            var exactArguments = exactGeneric < 0 ? arguments : SplitArguments(exactTypeName![(exactGeneric + 1)..^1]);
            string Substitute(string value, bool exact = false)
            {
                var substitutions = exact ? exactArguments : arguments;
                for (var i = substitutions.Length - 1; i >= 0; i--) value = System.Text.RegularExpressions.Regex.Replace(value, @"(?<!!)\!" + i + @"(?!\d)", _ => substitutions[i]);
                return value;
            }
            if (type.Members.Any(m => m.Public && Substitute(m.Signature) == signature && (exactSignature is null || m.IdentitySignature is not null && Substitute(m.IdentitySignature, true) == exactSignature))) return true;
            if (signature.Contains(" .ctor``", StringComparison.Ordinal)) return false;
            name = Substitute(type.BaseType);
            var baseAssembly = string.IsNullOrEmpty(type.BaseAssembly) ? assembly : type.BaseAssembly;
            if (!types.TryGetValue((baseAssembly, name.Split('<')[0]), out var next)) return false;
            assembly = next.Assembly;
        }
        return false;
    }

    private static string[] SplitArguments(string text)
    {
        var result = new List<string>();
        var depth = 0;
        var start = 0;
        for (var i = 0; i < text.Length; i++)
        {
            if (text[i] == '<' || text[i] == '[') depth++;
            if (text[i] == '>' || text[i] == ']') depth--;
            if (text[i] == ',' && depth == 0) { result.Add(text[start..i]); start = i + 1; }
        }
        result.Add(text[start..]);
        return result.ToArray();
    }
}
