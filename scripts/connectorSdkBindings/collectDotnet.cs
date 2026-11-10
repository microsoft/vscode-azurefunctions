// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT License.

using System;
using System.Collections.Generic;
using System.Linq;
using System.Text.Json;
using Azure.Connectors.Sdk;

var bindings = new SortedDictionary<string, SortedDictionary<string, object>>(StringComparer.Ordinal);
foreach (var registry in typeof(TriggerCallbackPayload<>).Assembly.GetExportedTypes()
    .Where(type => type.IsAbstract && type.IsSealed && type.Name.EndsWith("Triggers", StringComparison.Ordinal)))
{
    var property = registry.GetProperty("Operations");
    if (property?.GetValue(null) is not IReadOnlyDictionary<string, Type> operations)
    {
        continue;
    }

    var connector = registry.Namespace!.Split('.')[3].ToLowerInvariant();
    var events = bindings[connector] = new(StringComparer.Ordinal);
    foreach (var (operation, payload) in operations)
    {
        events.Add(operation, new { @namespace = payload.Namespace, payloadType = payload.Name });
    }
}
if (bindings.Count == 0)
{
    throw new InvalidOperationException("The SDK exposes no typed trigger registries.");
}
Console.WriteLine(JsonSerializer.Serialize(bindings));
