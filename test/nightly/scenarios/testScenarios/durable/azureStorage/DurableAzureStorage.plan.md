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
| 16  | 2                 | Managed Identity  | Linux            | Premium                |             |
| 17  | 2                 | Managed Identity  | Linux            | Consumption (Legacy)   |             |
| 18  | 2                 | Managed Identity  | Linux            | App Service            |             |
| 19  | 2                 | Secrets           | Linux            | Flex Consumption       |             |
| 20  | 2                 | Secrets           | Linux            | Premium                |             |
| 21  | 2                 | Secrets           | Linux            | Consumption (Legacy)   |             |
| 22  | 2                 | Secrets           | Linux            | App Service            |             |
| 23  | 3                 | Managed Identity  | Linux            | Flex Consumption       |             |
| 24  | 3                 | Managed Identity  | Linux            | Premium                |             |
| 25  | 3                 | Managed Identity  | Windows          | Premium                |             |
| 26  | 3                 | Managed Identity  | Linux            | Consumption (Legacy)   |             |
| 27  | 3                 | Managed Identity  | Windows          | Consumption (Legacy)   |             |
| 28  | 3                 | Managed Identity  | Linux            | App Service            |             |
| 29  | 3                 | Managed Identity  | Windows          | App Service            |             |
| 30  | 3                 | Secrets           | Linux            | Flex Consumption       |             |
| 31  | 3                 | Secrets           | Linux            | Premium                |             |
| 32  | 3                 | Secrets           | Windows          | Premium                |             |
| 33  | 3                 | Secrets           | Linux            | Consumption (Legacy)   |             |
| 34  | 3                 | Secrets           | Windows          | Consumption (Legacy)   |             |
| 35  | 3                 | Secrets           | Linux            | App Service            |             |
| 36  | 3                 | Secrets           | Windows          | App Service            |             |
