# Durable Azure Storage — Test Plan

## I. Create New Project / Create Function

### Workspace Project Test Matrix:

| No. | Language | Runtime | Programming Model | Comment |
|-----|----------|---------|-------------------|---------|
| 1   | TS       | Node    | v4                |         |
| 2   | Python   | Python  | v2                |         |

## II. Debug
TBD

## III. Create Function App / Deployment

### Create / Deploy Test Matrix:

| No. | Workspace Project | Connection Type   | Operating System | Plan Type              | Comment |
|-----|-------------------|-------------------|------------------|------------------------|---------|
| 1   | 1                 | Managed Identity  | Linux            | Flex Consumption       |         |
| 2   | 1                 | Managed Identity  | Linux            | Premium                |         |
| 3   | 1                 | Managed Identity  | Windows          | Premium                |         |
| 4   | 1                 | Managed Identity  | Linux            | Consumption (Legacy)   |         |
| 5   | 1                 | Managed Identity  | Windows          | Consumption (Legacy)   |         |
| 6   | 1                 | Managed Identity  | Linux            | App Service            |         |
| 7   | 1                 | Managed Identity  | Windows          | App Service            |         |
| 8   | 1                 | Secrets           | Linux            | Flex Consumption       |         |
| 9   | 1                 | Secrets           | Linux            | Premium                |         |
| 10  | 1                 | Secrets           | Windows          | Premium                |         |
| 11  | 1                 | Secrets           | Linux            | Consumption (Legacy)   |         |
| 12  | 1                 | Secrets           | Windows          | Consumption (Legacy)   |         |
| 13  | 1                 | Secrets           | Linux            | App Service            |         |
| 14  | 1                 | Secrets           | Windows          | App Service            |         |
| 15  | 2                 | Managed Identity  | Linux            | Flex Consumption       |         |
| 16  | 2                 | Managed Identity  | Linux            | Premium                |         |
| 17  | 2                 | Managed Identity  | Windows          | Premium                |         |
| 18  | 2                 | Managed Identity  | Linux            | Consumption (Legacy)   |         |
| 19  | 2                 | Managed Identity  | Windows          | Consumption (Legacy)   |         |
| 20  | 2                 | Managed Identity  | Linux            | App Service            |         |
| 21  | 2                 | Managed Identity  | Windows          | App Service            |         |
| 22  | 2                 | Secrets           | Linux            | Flex Consumption       |         |
| 23  | 2                 | Secrets           | Linux            | Premium                |         |
| 24  | 2                 | Secrets           | Windows          | Premium                |         |
| 25  | 2                 | Secrets           | Linux            | Consumption (Legacy)   |         |
| 26  | 2                 | Secrets           | Windows          | Consumption (Legacy)   |         |
| 27  | 2                 | Secrets           | Linux            | App Service            |         |
| 28  | 2                 | Secrets           | Windows          | App Service            |         |
