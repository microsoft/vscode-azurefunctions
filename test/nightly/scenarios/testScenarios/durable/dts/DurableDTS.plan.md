# Durable Task Scheduler - Test Plan

## I. Create New Project / Create Function

### Workspace Project Test Matrix:

| No. | Language | Runtime | Programming Model | Comment |
|-----|----------|---------|-------------------|---------|
| 1   | TS       | Node    | v4                |         |
| 2   | Python   | Python  | v2                |         |
| 3   | C#       | .NET    | isolated          |         |
| 4   | C#       | .NET    | in-proc           |         |

## II. Debug
TBD

## III. Create Function App / Deployment

### Create / Deploy Test Matrix:

| Workspace Project | Connection Type   | Operating System | Plan Type         | Comment |
|-------------------|-------------------|------------------|-------------------|---------|
| 1                 | Managed Identity  | Linux            | Flex Consumption  |         |
| 1                 | Managed Identity  | Linux            | Premium           |         |
| 1                 | Managed Identity  | Windows          | Premium           |         |
| 1                 | Secrets           | Linux            | Flex Consumption  |         |
| 1                 | Secrets           | Linux            | Premium           |         |
| 1                 | Secrets           | Windows          | Premium           |         |
| 2                 | Managed Identity  | Linux            | Flex Consumption  |         |
| 2                 | Managed Identity  | Windows          | Flex Consumption  |         |
| 2                 | Managed Identity  | Linux            | Premium           |         |
| 2                 | Managed Identity  | Windows          | Premium           |         |
| 2                 | Secrets           | Linux            | Flex Consumption  |         |
| 2                 | Secrets           | Windows          | Flex Consumption  |         |
| 2                 | Secrets           | Linux            | Premium           |         |
| 2                 | Secrets           | Windows          | Premium           |         |
| 3                 | Managed Identity  | Linux            | Flex Consumption  |         |
| 3                 | Managed Identity  | Windows          | Flex Consumption  |         |
| 3                 | Managed Identity  | Linux            | Premium           |         |
| 3                 | Managed Identity  | Windows          | Premium           |         |
| 3                 | Secrets           | Linux            | Flex Consumption  |         |
| 3                 | Secrets           | Windows          | Flex Consumption  |         |
| 3                 | Secrets           | Linux            | Premium           |         |
| 3                 | Secrets           | Windows          | Premium           |         |
| 4                 | Managed Identity  | Linux            | Flex Consumption  |         |
| 4                 | Managed Identity  | Windows          | Flex Consumption  |         |
| 4                 | Managed Identity  | Linux            | Premium           |         |
| 4                 | Managed Identity  | Windows          | Premium           |         |
| 4                 | Secrets           | Linux            | Flex Consumption  |         |
| 4                 | Secrets           | Windows          | Flex Consumption  |         |
| 4                 | Secrets           | Linux            | Premium           |         |
| 4                 | Secrets           | Windows          | Premium           |         |
