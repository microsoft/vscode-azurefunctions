---
applyTo: "package.json,package.nls.json,src/commands/registerCommands.ts,src/commands/createNewProject/verifyIsProject.ts,src/tree/**,src/workspace/**,src/FunctionAppResolver.ts,src/LocalResourceProvider.ts"
---

# Command and resource explorer instructions

## Contributions and registration

- `package.json`: command IDs/titles, views, menus, `when` clauses, keybindings, activation, settings, problem matchers.
- `package.nls.json`: localized contribution text.
- `src/commands/registerCommands.ts`: most command dispatch; Azure Resources actions normally use `registerCommandWithTreeNodeUnwrapping`.
- Change visible contribution behavior in contribution files, dispatch/arguments in registration, product behavior in mapped handler.

## Discovery and tree ownership

- `src/commands/createNewProject/verifyIsProject.ts`: `host.json` project-root discovery, `projectSubpath`, multi-project prompt.
- `src/workspace/listLocalProjects.ts`: initialized/uninitialized/invalid projects, compiled output paths.
- `src/workspace/listLocalFunctions.ts`: classic `function.json` reading or running-host query for isolated/native/Python v2/Node v4.
- `src/LocalResourceProvider.ts`, `src/tree/localProject/**`: workspace resources, local functions/settings, watchers, host-event refresh.
- `src/FunctionAppResolver.ts`: Resource Graph discovery, cache, duplicate names, regular/containerized model selection.
- `src/tree/ResolvedFunctionAppResource.ts`: lazy site initialization, remote functions, identities, settings, files, logs, deployments, slots.
- `src/tree/SlotTreeItem.ts`: adapter from resolved resources/slots to legacy command expectations.
- `src/tree/remoteProject/**`: remote function listing, keys, function behavior.
- `src/tree/projectContextValues.ts`: local/remote, access, resource context composition.

Context-value changes can silently break menus and pickers. Search all `package.json` `when` clauses, regular expressions, `pickAppResource` calls before editing.

Preserve lazy initialization, masking, paging/retries, narrow refresh, disposal, slots, Flex restrictions, containerized resources, both Azure Resources APIs.
