# Scenario Test Combinations

## I. Create New Project / Create Function

### Workspace Project Test Matrix

| No. | Language | Runtime | Programming Model | Comment                            | Selected    |
|-----|----------|---------|-------------------|------------------------------------|-------------|
| 1   | TS       | Node    | v3                |  Skip unless special requirements  |             |
| 2   | TS       | Node    | v4                |                                    |             |
| 3   | Python   | Python  | v1                |  Skip unless special requirements  |             |
| 4   | Python   | Python  | v2                |                                    |             |
| 5   | C#       | .NET    | isolated          |                                    |             |
| 6   | C#       | .NET    | in-proc           |                                    |             |

## II. Debug
TBD

## III. Create Function App / Deployment

### Create / Deploy Test Matrix

| No. | Workspace Project | Connection Type   | Operating System | Plan Type              | Comment     | Selected    |
|-----|-------------------|-------------------|------------------|------------------------|-------------|-------------|
| 1   | 1                 | Managed Identity  | Linux            | Flex Consumption       | Skip        |             |
| 2   | 1                 | Managed Identity  | Windows          | Flex Consumption       | Skip        |             |
| 3   | 1                 | Managed Identity  | Linux            | Premium                | Skip        |             |
| 4   | 1                 | Managed Identity  | Windows          | Premium                | Skip        |             |
| 5   | 1                 | Managed Identity  | Linux            | Consumption (Legacy)   | Skip        |             |
| 6   | 1                 | Managed Identity  | Windows          | Consumption (Legacy)   | Skip        |             |
| 7   | 1                 | Managed Identity  | Linux            | App Service            | Skip        |             |
| 8   | 1                 | Managed Identity  | Windows          | App Service            | Skip        |             |
| 9   | 1                 | Secrets           | Linux            | Flex Consumption       | Skip        |             |
| 10  | 1                 | Secrets           | Windows          | Flex Consumption       | Skip        |             |
| 11  | 1                 | Secrets           | Linux            | Premium                | Skip        |             |
| 12  | 1                 | Secrets           | Windows          | Premium                | Skip        |             |
| 13  | 1                 | Secrets           | Linux            | Consumption (Legacy)   | Skip        |             |
| 14  | 1                 | Secrets           | Windows          | Consumption (Legacy)   | Skip        |             |
| 15  | 1                 | Secrets           | Linux            | App Service            | Skip        |             |
| 16  | 1                 | Secrets           | Windows          | App Service            | Skip        |             |
| 17  | 2                 | Managed Identity  | Linux            | Flex Consumption       |             |             |
| 18  | 2                 | Managed Identity  | Windows          | Flex Consumption       | Not Offered |             |
| 19  | 2                 | Managed Identity  | Linux            | Premium                |             |             |
| 20  | 2                 | Managed Identity  | Windows          | Premium                |             |             |
| 21  | 2                 | Managed Identity  | Linux            | Consumption (Legacy)   |             |             |
| 22  | 2                 | Managed Identity  | Windows          | Consumption (Legacy)   |             |             |
| 23  | 2                 | Managed Identity  | Linux            | App Service            |             |             |
| 24  | 2                 | Managed Identity  | Windows          | App Service            |             |             |
| 25  | 2                 | Secrets           | Linux            | Flex Consumption       |             |             |
| 26  | 2                 | Secrets           | Windows          | Flex Consumption       | Not Offered |             |
| 27  | 2                 | Secrets           | Linux            | Premium                |             |             |
| 28  | 2                 | Secrets           | Windows          | Premium                |             |             |
| 29  | 2                 | Secrets           | Linux            | Consumption (Legacy)   |             |             |
| 30  | 2                 | Secrets           | Windows          | Consumption (Legacy)   |             |             |
| 31  | 2                 | Secrets           | Linux            | App Service            |             |             |
| 32  | 2                 | Secrets           | Windows          | App Service            |             |             |
| 33  | 3                 | Managed Identity  | Linux            | Flex Consumption       | Skip        |             |
| 34  | 3                 | Managed Identity  | Windows          | Flex Consumption       | Skip        |             |
| 35  | 3                 | Managed Identity  | Linux            | Premium                | Skip        |             |
| 36  | 3                 | Managed Identity  | Windows          | Premium                | Skip        |             |
| 37  | 3                 | Managed Identity  | Linux            | Consumption (Legacy)   | Skip        |             |
| 38  | 3                 | Managed Identity  | Windows          | Consumption (Legacy)   | Skip        |             |
| 39  | 3                 | Managed Identity  | Linux            | App Service            | Skip        |             |
| 40  | 3                 | Managed Identity  | Windows          | App Service            | Skip        |             |
| 41  | 3                 | Secrets           | Linux            | Flex Consumption       | Skip        |             |
| 42  | 3                 | Secrets           | Windows          | Flex Consumption       | Skip        |             |
| 43  | 3                 | Secrets           | Linux            | Premium                | Skip        |             |
| 44  | 3                 | Secrets           | Windows          | Premium                | Skip        |             |
| 45  | 3                 | Secrets           | Linux            | Consumption (Legacy)   | Skip        |             |
| 46  | 3                 | Secrets           | Windows          | Consumption (Legacy)   | Skip        |             |
| 47  | 3                 | Secrets           | Linux            | App Service            | Skip        |             |
| 48  | 3                 | Secrets           | Windows          | App Service            | Skip        |             |
| 49  | 4                 | Managed Identity  | Linux            | Flex Consumption       |             |             |
| 50  | 4                 | Managed Identity  | Windows          | Flex Consumption       | Not Offered |             |
| 51  | 4                 | Managed Identity  | Linux            | Premium                |             |             |
| 52  | 4                 | Managed Identity  | Windows          | Premium                |             |             |
| 53  | 4                 | Managed Identity  | Linux            | Consumption (Legacy)   |             |             |
| 54  | 4                 | Managed Identity  | Windows          | Consumption (Legacy)   |             |             |
| 55  | 4                 | Managed Identity  | Linux            | App Service            |             |             |
| 56  | 4                 | Managed Identity  | Windows          | App Service            |             |             |
| 57  | 4                 | Secrets           | Linux            | Flex Consumption       |             |             |
| 58  | 4                 | Secrets           | Windows          | Flex Consumption       | Not Offered |             |
| 59  | 4                 | Secrets           | Linux            | Premium                |             |             |
| 60  | 4                 | Secrets           | Windows          | Premium                |             |             |
| 61  | 4                 | Secrets           | Linux            | Consumption (Legacy)   |             |             |
| 62  | 4                 | Secrets           | Windows          | Consumption (Legacy)   |             |             |
| 63  | 4                 | Secrets           | Linux            | App Service            |             |             |
| 64  | 4                 | Secrets           | Windows          | App Service            |             |             |
| 65  | 5                 | Managed Identity  | Linux            | Flex Consumption       |             |             |
| 66  | 5                 | Managed Identity  | Windows          | Flex Consumption       | Not Offered |             |
| 67  | 5                 | Managed Identity  | Linux            | Premium                |             |             |
| 68  | 5                 | Managed Identity  | Windows          | Premium                |             |             |
| 69  | 5                 | Managed Identity  | Linux            | Consumption (Legacy)   |             |             |
| 70  | 5                 | Managed Identity  | Windows          | Consumption (Legacy)   |             |             |
| 71  | 5                 | Managed Identity  | Linux            | App Service            |             |             |
| 72  | 5                 | Managed Identity  | Windows          | App Service            |             |             |
| 73  | 5                 | Secrets           | Linux            | Flex Consumption       |             |             |
| 74  | 5                 | Secrets           | Windows          | Flex Consumption       | Not Offered |             |
| 75  | 5                 | Secrets           | Linux            | Premium                |             |             |
| 76  | 5                 | Secrets           | Windows          | Premium                |             |             |
| 77  | 5                 | Secrets           | Linux            | Consumption (Legacy)   |             |             |
| 78  | 5                 | Secrets           | Windows          | Consumption (Legacy)   |             |             |
| 79  | 5                 | Secrets           | Linux            | App Service            |             |             |
| 80  | 5                 | Secrets           | Windows          | App Service            |             |             |
| 81  | 6                 | Managed Identity  | Linux            | Flex Consumption       |             |             |
| 82  | 6                 | Managed Identity  | Windows          | Flex Consumption       | Not Offered |             |
| 83  | 6                 | Managed Identity  | Linux            | Premium                |             |             |
| 84  | 6                 | Managed Identity  | Windows          | Premium                |             |             |
| 85  | 6                 | Managed Identity  | Linux            | Consumption (Legacy)   |             |             |
| 86  | 6                 | Managed Identity  | Windows          | Consumption (Legacy)   |             |             |
| 87  | 6                 | Managed Identity  | Linux            | App Service            |             |             |
| 88  | 6                 | Managed Identity  | Windows          | App Service            |             |             |
| 89  | 6                 | Secrets           | Linux            | Flex Consumption       |             |             |
| 90  | 6                 | Secrets           | Windows          | Flex Consumption       | Not Offered |             |
| 91  | 6                 | Secrets           | Linux            | Premium                |             |             |
| 92  | 6                 | Secrets           | Windows          | Premium                |             |             |
| 93  | 6                 | Secrets           | Linux            | Consumption (Legacy)   |             |             |
| 94  | 6                 | Secrets           | Windows          | Consumption (Legacy)   |             |             |
| 95  | 6                 | Secrets           | Linux            | App Service            |             |             |
| 96  | 6                 | Secrets           | Windows          | App Service            |             |             |
