# Durable Azure Storage Test Plan

## I. Create New Project / Create Function

### Workspace Project Test Matrix

| No. | Language | Runtime | Programming Model | Comment                            |
|-----|----------|---------|-------------------|------------------------------------|
| 1   | TS       | Node    | v4                |                                    |
| 2   | Python   | Python  | v2                |                                    |
| 3   | C#       | .NET    | isolated          |                                    |
| 4   | C#       | .NET    | in-proc           |                                    |

## II. Debug
TBD

## III. Create Function App / Deployment

### Create / Deploy Test Matrix

| No. | Workspace Project | Connection Type   | Operating System | Plan Type              | Comment     |
|-----|-------------------|-------------------|------------------|------------------------|-------------|
| 1   | 2                 | Managed Identity  | Linux            | Flex Consumption       |             |
| 2   | 2                 | Managed Identity  | Linux            | Premium                |             |
| 3   | 2                 | Managed Identity  | Windows          | Premium                |             |
| 4   | 2                 | Managed Identity  | Linux            | Consumption (Legacy)   |             |
| 5   | 2                 | Managed Identity  | Windows          | Consumption (Legacy)   |             |
| 6   | 2                 | Managed Identity  | Linux            | App Service            |             |
| 7   | 2                 | Managed Identity  | Windows          | App Service            |             |
| 8   | 2                 | Secrets           | Linux            | Flex Consumption       |             |
| 9   | 2                 | Secrets           | Linux            | Premium                |             |
| 10  | 2                 | Secrets           | Windows          | Premium                |             |
| 11  | 2                 | Secrets           | Linux            | Consumption (Legacy)   |             |
| 12  | 2                 | Secrets           | Windows          | Consumption (Legacy)   |             |
| 13  | 2                 | Secrets           | Linux            | App Service            |             |
| 14  | 2                 | Secrets           | Windows          | App Service            |             |
| 15  | 4                 | Managed Identity  | Linux            | Flex Consumption       |             |
| 16  | 4                 | Managed Identity  | Linux            | Premium                |             |
| 17  | 4                 | Secrets           | Linux            | Flex Consumption       |             |
| 18  | 4                 | Secrets           | Linux            | Premium                |             |
| 19  | 5                 | Managed Identity  | Linux            | Flex Consumption       |             |
| 20  | 5                 | Managed Identity  | Linux            | Premium                |             |
| 21  | 5                 | Secrets           | Linux            | Flex Consumption       |             |
| 22  | 5                 | Secrets           | Linux            | Premium                |             |
| 23  | 6                 | Managed Identity  | Linux            | Flex Consumption       |             |
| 24  | 6                 | Managed Identity  | Linux            | Premium                |             |
| 25  | 6                 | Secrets           | Linux            | Flex Consumption       |             |
| 26  | 6                 | Secrets           | Linux            | Premium                |             |
