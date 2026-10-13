---
applyTo: "src/extension.ts,src/vscode-azurefunctions.api.d.ts,src/commands/api/**,src/testApi.ts,src/agent/**,test/api.test.ts,test/utils/**"
---

# API and agent integration instructions

- `src/vscode-azurefunctions.api.d.ts`: supported external contract.
- `src/commands/api/**`: thin adapters to normal create-function, settings, tree behavior.
- `src/extension.ts`: `createApiProvider` implementation, conditional test API when `VSCODE_RUNNING_TESTS` set.
- `src/testApi.ts`: test-only boundary; never import from production code.
- `src/agent/agentIntegration.ts`: advertised agent commands, normal/queued wizard input, routing benchmarks.
- `test/api.test.ts`, `test/utils/testApiAccess.ts`: bundled extension boundary coverage.

Keep adapters thin so command palette, API, tests, agent invocation share product logic. Public API changes require declaration, provider implementation, API version/compatibility review, boundary tests.
