# Durable Azure Storage Test Plan

## I. Create New Project / Create Function

### Workspace Project Test Matrix

| No. | Language | Runtime | Programming Model | Comment                            |
|-----|----------|---------|-------------------|------------------------------------|
| 1   | JS       | Node    | v4                |                                    |
| 2   | Python   | Python  | v2                |                                    |
| 3   | C#       | .NET    | isolated          |                                    |
| 4   | C#       | .NET    | in-proc           |                                    |

## II. Debug
TBD

## III. Create Function App / Deployment

### Create / Deploy Test Matrix

| No. | Workspace Project | Connection Type   | Operating System | Plan Type              | Comment     |
|-----|-------------------|-------------------|------------------|------------------------|-------------|
| 1   | 1                 | Managed Identity  | Linux            | Flex Consumption       |             |
| 2   | 1                 | Managed Identity  | Linux            | Premium                |             |
| 3   | 1                 | Managed Identity  | Windows          | Premium                |             |
| 4   | 1                 | Managed Identity  | Linux            | Consumption (Legacy)   |             |
| 5   | 1                 | Managed Identity  | Windows          | Consumption (Legacy)   |             |
| 6   | 1                 | Managed Identity  | Linux            | App Service            |             |
| 7   | 1                 | Managed Identity  | Windows          | App Service            |             |
| 8   | 1                 | Secrets           | Linux            | Flex Consumption       |             |
| 9   | 1                 | Secrets           | Linux            | Premium                |             |
| 10  | 1                 | Secrets           | Windows          | Premium                |             |
| 11  | 1                 | Secrets           | Linux            | Consumption (Legacy)   |             |
| 12  | 1                 | Secrets           | Windows          | Consumption (Legacy)   |             |
| 13  | 1                 | Secrets           | Linux            | App Service            |             |
| 14  | 1                 | Secrets           | Windows          | App Service            |             |
| 15  | 2                 | Managed Identity  | Linux            | Flex Consumption       |             |
| 16  | 2                 | Managed Identity  | Windows          | Premium                |             |
| 17  | 2                 | Secrets           | Linux            | Flex Consumption       |             |
| 18  | 2                 | Secrets           | Windows          | Premium                |             |
| 19  | 2                 | Secrets           | Linux            | Consumption (Legacy)   |             |
| 20  | 2                 | Secrets           | Windows          | App Service            |             |
| 21  | 3                 | Managed Identity  | Linux            | Flex Consumption       |             |
| 22  | 3                 | Managed Identity  | Windows          | Premium                |             |
| 23  | 3                 | Secrets           | Linux            | Flex Consumption       |             |
| 24  | 3                 | Secrets           | Windows          | Premium                |             |
| 25  | 3                 | Secrets           | Linux            | Consumption (Legacy)   |             |
| 26  | 3                 | Secrets           | Windows          | App Service            |             |
| 27  | 4                 | Managed Identity  | Linux            | Flex Consumption       |             |
| 28  | 4                 | Managed Identity  | Windows          | Premium                |             |
| 29  | 4                 | Secrets           | Linux            | Flex Consumption       |             |
| 30  | 4                 | Secrets           | Windows          | Premium                |             |
| 31  | 4                 | Secrets           | Linux            | Consumption (Legacy)   |             |
| 32  | 4                 | Secrets           | Windows          | App Service            |             |
