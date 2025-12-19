# Test Combinations

## I. Create New Project / Create Function

### Workspace Project Test Matrix:

| No. | Language | Runtime | Programming Model | Comment |
|-----|----------|---------|-------------------|---------|
| I   | TS       | Node    | v3                |  Skip unless special requirements  |
| II  | TS       | Node    | v4                |         |
| III | Python   | Python  | v1                |  Skip unless special requirements  |
| IV  | Python   | Python  | v2                |         |
| V   | C#       | .NET    | isolated          |         |
| VI  | C#       | .NET    | in-proc           |         |

## II. Debug
TBD

## III. Create Function App / Deployment

### Create / Deploy Test Matrix:

| No. | Workspace Project | Connection Type   | Operating System | Plan Type              | Comment |
|-----|-------------------|-------------------|------------------|------------------------|---------|
| 1   | I                 | Managed Identity  | Linux            | Flex Consumption       | Skip    |
| 2   | I                 | Managed Identity  | Windows          | Flex Consumption       | Skip    |
| 4   | I                 | Managed Identity  | Windows          | Premium                | Skip    |
| 5   | I                 | Managed Identity  | Linux            | Consumption (Legacy)   | Skip    |
| 6   | I                 | Managed Identity  | Windows          | Consumption (Legacy)   | Skip    |
| 7   | I                 | Managed Identity  | Linux            | App Service            | Skip    |
| 8   | I                 | Managed Identity  | Windows          | App Service            | Skip    |
| 9   | I                 | Secrets           | Linux            | Flex Consumption       | Skip    |
| 10  | I                 | Secrets           | Windows          | Flex Consumption       | Skip    |
| 11  | I                 | Secrets           | Linux            | Premium                | Skip    |
| 12  | I                 | Secrets           | Windows          | Premium                | Skip    |
| 13  | I                 | Secrets           | Linux            | Consumption (Legacy)   | Skip    |
| 14  | I                 | Secrets           | Windows          | Consumption (Legacy)   | Skip    |
| 15  | I                 | Secrets           | Linux            | App Service            | Skip    |
| 16  | I                 | Secrets           | Windows          | App Service            | Skip    |
| 17  | II                | Managed Identity  | Linux            | Flex Consumption       |         |
| 18  | II                | Managed Identity  | Windows          | Flex Consumption       |         |
| 19  | II                | Managed Identity  | Linux            | Premium                |         |
| 20  | II                | Managed Identity  | Windows          | Premium                |         |
| 21  | II                | Managed Identity  | Linux            | Consumption (Legacy)   |         |
| 22  | II                | Managed Identity  | Windows          | Consumption (Legacy)   |         |
| 23  | II                | Managed Identity  | Linux            | App Service            |         |
| 24  | II                | Managed Identity  | Windows          | App Service            |         |
| 25  | II                | Secrets           | Linux            | Flex Consumption       |         |
| 26  | II                | Secrets           | Windows          | Flex Consumption       |         |
| 27  | II                | Secrets           | Linux            | Premium                |         |
| 28  | II                | Secrets           | Windows          | Premium                |         |
| 29  | II                | Secrets           | Linux            | Consumption (Legacy)   |         |
| 30  | II                | Secrets           | Windows          | Consumption (Legacy)   |         |
| 31  | II                | Secrets           | Linux            | App Service            |         |
| 32  | II                | Secrets           | Windows          | App Service            |         |
| 33  | III               | Managed Identity  | Linux            | Flex Consumption       | Skip    |
| 34  | III               | Managed Identity  | Windows          | Flex Consumption       | Skip    |
| 35  | III               | Managed Identity  | Linux            | Premium                | Skip    |
| 36  | III               | Managed Identity  | Windows          | Premium                | Skip    |
| 37  | III               | Managed Identity  | Linux            | Consumption (Legacy)   | Skip    |
| 38  | III               | Managed Identity  | Windows          | Consumption (Legacy)   | Skip    |
| 39  | III               | Managed Identity  | Linux            | App Service            | Skip    |
| 40  | III               | Managed Identity  | Windows          | App Service            | Skip    |
| 41  | III               | Secrets           | Linux            | Flex Consumption       | Skip    |
| 42  | III               | Secrets           | Windows          | Flex Consumption       | Skip    |
| 43  | III               | Secrets           | Linux            | Premium                | Skip    |
| 44  | III               | Secrets           | Windows          | Premium                | Skip    |
| 45  | III               | Secrets           | Linux            | Consumption (Legacy)   | Skip    |
| 46  | III               | Secrets           | Windows          | Consumption (Legacy)   | Skip    |
| 47  | III               | Secrets           | Linux            | App Service            | Skip    |
| 48  | III               | Secrets           | Windows          | App Service            | Skip    |
| 49  | IV                | Managed Identity  | Linux            | Flex Consumption       |         |
| 50  | IV                | Managed Identity  | Windows          | Flex Consumption       |         |
| 51  | IV                | Managed Identity  | Linux            | Premium                |         |
| 52  | IV                | Managed Identity  | Windows          | Premium                |         |
| 53  | IV                | Managed Identity  | Linux            | Consumption (Legacy)   |         |
| 54  | IV                | Managed Identity  | Windows          | Consumption (Legacy)   |         |
| 55  | IV                | Managed Identity  | Linux            | App Service            |         |
| 56  | IV                | Managed Identity  | Windows          | App Service            |         |
| 57  | IV                | Secrets           | Linux            | Flex Consumption       |         |
| 58  | IV                | Secrets           | Windows          | Flex Consumption       |         |
| 59  | IV                | Secrets           | Linux            | Premium                |         |
| 60  | IV                | Secrets           | Windows          | Premium                |         |
| 61  | IV                | Secrets           | Linux            | Consumption (Legacy)   |         |
| 62  | IV                | Secrets           | Windows          | Consumption (Legacy)   |         |
| 63  | IV                | Secrets           | Linux            | App Service            |         |
| 64  | IV                | Secrets           | Windows          | App Service            |         |
| 65  | V                 | Managed Identity  | Linux            | Flex Consumption       |         |
| 66  | V                 | Managed Identity  | Windows          | Flex Consumption       |         |
| 67  | V                 | Managed Identity  | Linux            | Premium                |         |
| 68  | V                 | Managed Identity  | Windows          | Premium                |         |
| 69  | V                 | Managed Identity  | Linux            | Consumption (Legacy)   |         |
| 70  | V                 | Managed Identity  | Windows          | Consumption (Legacy)   |         |
| 71  | V                 | Managed Identity  | Linux            | App Service            |         |
| 72  | V                 | Managed Identity  | Windows          | App Service            |         |
| 73  | V                 | Secrets           | Linux            | Flex Consumption       |         |
| 74  | V                 | Secrets           | Windows          | Flex Consumption       |         |
| 75  | V                 | Secrets           | Linux            | Premium                |         |
| 76  | V                 | Secrets           | Windows          | Premium                |         |
| 77  | V                 | Secrets           | Linux            | Consumption (Legacy)   |         |
| 78  | V                 | Secrets           | Windows          | Consumption (Legacy)   |         |
| 79  | V                 | Secrets           | Linux            | App Service            |         |
| 80  | V                 | Secrets           | Windows          | App Service            |         |
| 81  | VI                | Managed Identity  | Linux            | Flex Consumption       |         |
| 82  | VI                | Managed Identity  | Windows          | Flex Consumption       |         |
| 83  | VI                | Managed Identity  | Linux            | Premium                |         |
| 84  | VI                | Managed Identity  | Windows          | Premium                |         |
| 85  | VI                | Managed Identity  | Linux            | Consumption (Legacy)   |         |
| 86  | VI                | Managed Identity  | Windows          | Consumption (Legacy)   |         |
| 87  | VI                | Managed Identity  | Linux            | App Service            |         |
| 88  | VI                | Managed Identity  | Windows          | App Service            |         |
| 89  | VI                | Secrets           | Linux            | Flex Consumption       |         |
| 90  | VI                | Secrets           | Windows          | Flex Consumption       |         |
| 91  | VI                | Secrets           | Linux            | Premium                |         |
| 92  | VI                | Secrets           | Windows          | Premium                |         |
| 93  | VI                | Secrets           | Linux            | Consumption (Legacy)   |         |
| 94  | VI                | Secrets           | Windows          | Consumption (Legacy)   |         |
| 95  | VI                | Secrets           | Linux            | App Service            |         |
| 96  | VI                | Secrets           | Windows          | App Service            |         |
