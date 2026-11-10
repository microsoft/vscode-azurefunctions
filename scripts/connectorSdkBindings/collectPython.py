# Copyright (c) Microsoft Corporation. All rights reserved.
# Licensed under the MIT License.

import importlib
import inspect
import json
import pkgutil
import sys
from typing import get_args, get_origin, get_type_hints

import azurefunctions.extensions.connectors as connectors
from azurefunctions.extensions.connectors._sdk_type import ConnectorSdkType


def sdk_models(annotation, module_name):
    if inspect.isclass(annotation) and annotation.__module__ == module_name:
        return {annotation}
    return {
        model
        for argument in get_args(annotation)
        for model in sdk_models(argument, module_name)
    }


def resolve_annotation(annotation, module):
    def payload_type():
        pass

    payload_type.__annotations__ = {"return": annotation}
    return get_type_hints(payload_type, globalns=vars(module))["return"]


bindings = {}
for entry in sorted(pkgutil.iter_modules(connectors.__path__), key=lambda entry: entry.name):
    if not entry.ispkg:
        continue
    adapter_module = importlib.import_module(f"{connectors.__name__}.{entry.name}")
    sdk = importlib.import_module(f"azure.connectors.{entry.name}")
    adapters = {}
    exported_adapters = {}
    for name, adapter in vars(adapter_module).items():
        if not inspect.isclass(adapter) or not issubclass(adapter, ConnectorSdkType):
            continue
        exported_adapters[name] = adapter
        for base in getattr(adapter, "__orig_bases__", ()):
            if get_origin(base) is ConnectorSdkType:
                for model in sdk_models(base, sdk.__name__):
                    adapters.setdefault(model, set()).add(name)
    for operation, metadata in sdk.TRIGGER_OPERATIONS.items():
        payload_name = metadata["callback_payload_type"]
        if not payload_name:
            continue
        payload = getattr(sdk, payload_name)
        annotation = get_type_hints(payload).get("value", payload) if inspect.isclass(payload) else payload
        annotation = resolve_annotation(annotation, sdk)
        models = sdk_models(annotation, sdk.__name__)
        exact_items = {model.__name__ for model in models if model.__name__ in adapters.get(model, ())}
        candidates = exact_items or ({payload_name} if payload_name in exported_adapters else {
            name for model in models for name in adapters.get(model, ())
        })
        if len(candidates) > 1:
            print(f"No unique Functions adapter for {entry.name}/{operation}; keeping raw input.", file=sys.stderr)
            continue
        if candidates:
            bindings.setdefault(entry.name, {})[operation] = {
                "importPath": adapter_module.__name__,
                "moduleName": entry.name,
                "itemType": candidates.pop(),
            }

if not bindings:
    raise ValueError("The SDKs expose no compatible Functions adapters.")
print(json.dumps(bindings, sort_keys=True))
