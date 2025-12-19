# Durable Task Scheduler (DTS) Test Scenarios

## I. Create New Project / Create Function

### Workspace Project Test Matrix:

| No. | Language | Runtime | Programming Model | Comment |
|-----|----------|---------|-------------------|---------|
| I   | TS       | Node    | v4                |         |
| II  | Python   | Python  | v2                |         |
| III | C#       | .NET    | isolated          |         |
| IV  | C#       | .NET    | in-proc           |         |

## II. Debug
TBD

## III. Create Function App / Deployment

### Create / Deploy Test Matrix:

| Workspace Project | Connection Type   | Operating System | Plan Type         | Comment |
|-------------------|-------------------|------------------|-------------------|---------|
| I                 | Managed Identity  | Linux            | Flex Consumption  |         |
| I                 | Managed Identity  | Windows          | Flex Consumption  |         |
| I                 | Managed Identity  | Linux            | Premium           |         |
| I                 | Managed Identity  | Windows          | Premium           |         |
| I                 | Secrets           | Linux            | Flex Consumption  |         |
| I                 | Secrets           | Windows          | Flex Consumption  |         |
| I                 | Secrets           | Linux            | Premium           |         |
| I                 | Secrets           | Windows          | Premium           |         |
| II                | Managed Identity  | Linux            | Flex Consumption  |         |
| II                | Managed Identity  | Windows          | Flex Consumption  |         |
| II                | Managed Identity  | Linux            | Premium           |         |
| II                | Managed Identity  | Windows          | Premium           |         |
| II                | Secrets           | Linux            | Flex Consumption  |         |
| II                | Secrets           | Windows          | Flex Consumption  |         |
| II                | Secrets           | Linux            | Premium           |         |
| II                | Secrets           | Windows          | Premium           |         |
| III               | Managed Identity  | Linux            | Flex Consumption  |         |
| III               | Managed Identity  | Windows          | Flex Consumption  |         |
| III               | Managed Identity  | Linux            | Premium           |         |
| III               | Managed Identity  | Windows          | Premium           |         |
| III               | Secrets           | Linux            | Flex Consumption  |         |
| III               | Secrets           | Windows          | Flex Consumption  |         |
| III               | Secrets           | Linux            | Premium           |         |
| III               | Secrets           | Windows          | Premium           |         |
| IV                | Managed Identity  | Linux            | Flex Consumption  |         |
| IV                | Managed Identity  | Windows          | Flex Consumption  |         |
| IV                | Managed Identity  | Linux            | Premium           |         |
| IV                | Managed Identity  | Windows          | Premium           |         |
| IV                | Secrets           | Linux            | Flex Consumption  |         |
| IV                | Secrets           | Windows          | Flex Consumption  |         |
| IV                | Secrets           | Linux            | Premium           |         |
| IV                | Secrets           | Windows          | Premium           |         |
