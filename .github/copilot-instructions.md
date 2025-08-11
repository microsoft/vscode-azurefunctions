# GitHub Copilot Instructions for Azure Functions Extension

## Repository Overview
This is the **Azure Functions extension for Visual Studio Code**, which enables developers to create, debug, and deploy Azure Functions directly from VS Code. The extension supports multiple programming languages including JavaScript, TypeScript, Python, C#, Java, and PowerShell.

## Setup Steps for Contributors

### Prerequisites
1. **Node.js**: Install Node.js 18+ (LTS recommended)
2. **Visual Studio Code**: Latest stable version
3. **Azure Functions Core Tools**: Install version 4+ globally
   ```bash
   npm install -g azure-functions-core-tools@4 --unsafe-perm true
   ```
4. **Git**: For version control and branch management

### Development Environment Setup
1. **Clone the repository**:
   ```bash
   git clone https://github.com/microsoft/vscode-azurefunctions.git
   cd vscode-azurefunctions
   ```

2. **Install dependencies**:
   ```bash
   npm install
   ```

3. **Build the extension**:
   ```bash
   npm run compile
   ```

4. **Run tests** (optional but recommended):
   ```bash
   npm test
   ```

### VS Code Development Setup
1. **Open in VS Code**: Open the repository folder in VS Code
2. **Install recommended extensions**: VS Code will prompt to install workspace extensions
3. **Configure debugging**: Use F5 to launch Extension Development Host
4. **Build task**: Use Ctrl+Shift+P → "Tasks: Run Build Task" for continuous compilation

### GitHub Automation Setup (Maintainers)
1. **GitHub CLI**: Install `gh` CLI tool for issue management
2. **Node.js scripts**: Use automation scripts in `scripts/` directory
3. **VS Code tasks**: Leverage predefined tasks in `.vscode/tasks.json`

### Environment Variables (Optional)
- `AZURE_FUNCTIONS_EXTENSION_VERSION`: For testing specific extension versions
- `AZCODE_FUNCTIONS_TIMEOUT`: Adjust operation timeouts for slower environments

### Testing Different Scenarios
1. **Local Functions**: Test with various triggers (HTTP, Timer, Blob, etc.)
2. **Multiple Runtimes**: Test across Node.js, Python, .NET, Java
3. **Azure Integration**: Test deployment and remote debugging features

## Architecture & Structure

### Key Directories
- `src/` - Main extension source code (TypeScript)
- `test/` - Unit and integration tests
- `resources/` - Static assets, templates, and backup templates
- `scripts/` - Automation scripts for issue management and analysis
- `.vscode/tasks.json` - VS Code tasks for GitHub automation

### Core Components
- **Extension Entry Point**: `src/extension.ts`
- **Tree Providers**: Handle Azure resource tree views
- **Command Handlers**: Located in `src/commands/`
- **Templates**: Function templates in `src/templates/`
- **Debug Support**: Debug configuration in `src/debug/`

## Development Guidelines

### Code Standards
- Use TypeScript with strict type checking
- Follow existing naming conventions (camelCase for functions, PascalCase for classes)
- Maintain consistent error handling patterns
- Use localization for user-facing strings via `src/localize.ts`
- Prefer async/await over Promises for readability

### Testing Requirements
- Write unit tests for new functionality in `test/` directory
- Use existing test utilities like `assertThrowsAsync.ts` and `runWithSetting.ts`
- Ensure template counts are updated when adding new function templates
- Test across multiple Azure Functions runtime versions

### Issue Management Automation

#### Issue Quality Standards
When analyzing GitHub issues, prioritize these criteria:
1. **Template Completion**: Issues should use the provided template with "Does this occur consistently?" answered
2. **Reproduction Steps**: Clear, step-by-step instructions that are actionable
3. **Error Details**: Complete error messages, not truncated or vague descriptions
4. **Environment Information**: Extension version, VS Code version, OS details

#### Automated Response Patterns
- For incomplete issues: Request specific missing information (repro steps, error details, environment)
- For template violations: Guide users to fill out required fields
- For duplicate reports: Link to existing issues when patterns match
- Always maintain a helpful, professional tone in automated responses

#### VS Code Tasks Usage
Use the predefined tasks for efficient issue management:
- `GitHub: Find Issues with Telemetry Data` - Locate issues with diagnostic info
- `GitHub: Find Issues with Error Messages` - Find issues with specific error patterns
- `GitHub: AI Analyze Issue Quality` - Analyze individual issues for completeness
- `GitHub: AI Analyze and Respond to Issue` - Automated triage and response

## Extension-Specific Context

### Azure Functions Integration
- Support for Functions Core Tools CLI (`func` command)
- Integration with Azure account authentication
- Template management for multiple language runtimes
- Local development server integration

### Common Issue Patterns
1. **Template/Project Creation**: Issues with `func init` or project scaffolding
2. **Debugging**: Local debugging configuration problems
3. **Deployment**: Azure deployment and configuration issues
4. **Authentication**: Azure sign-in and subscription access problems
5. **Core Tools**: Compatibility issues with Azure Functions Core Tools versions

### Dependencies & External Tools
- **Azure Functions Core Tools**: Required for local development
- **Azure CLI**: Used for Azure resource management
- **Language-specific runtimes**: Node.js, Python, .NET, Java
- **Docker**: For containerized function development

## Code Review Guidelines

### Priority Areas for Review
- Security: Ensure no credentials or sensitive data in code
- Performance: Minimize Azure API calls and optimize tree refresh operations
- User Experience: Maintain consistency with VS Code UX patterns
- Error Handling: Provide actionable error messages with resolution guidance

### Common Patterns to Check
- Proper disposal of Azure clients and resources
- Consistent telemetry data collection for diagnostics
- Correct handling of workspace vs. global state
- Proper cancellation token usage for long-running operations

## Release Considerations

### Breaking Changes
- Always document breaking changes in CHANGELOG.md
- Consider backward compatibility with older Azure Functions runtime versions
- Test against multiple VS Code versions when possible

### Template Updates
- Update backup templates in `resources/backupTemplates/` when Azure publishes new templates
- Verify template functionality across supported language stacks
- Update template count tests when adding/removing templates

## Troubleshooting Automation

### Issue Analysis Scripts
The repository includes Node.js scripts for automated issue analysis:
- `scripts/analyze-issue-quality.js` - Evaluates issue completeness
- `scripts/analyze-and-respond.js` - Provides automated responses to incomplete issues

### Common Resolution Patterns
1. **Missing Environment Info**: Request Azure Functions extension version, VS Code version, OS
2. **Vague Error Messages**: Ask for complete error text from Developer Console
3. **Reproduction Issues**: Guide users to provide step-by-step instructions
4. **Template Problems**: Direct users to proper issue template usage

## AI Assistant Behavior

### When Analyzing Code
- Consider Azure Functions runtime compatibility
- Check for proper telemetry and error handling
- Ensure localization support for user-facing strings
- Verify proper async/await patterns

### When Handling Issues
- Use the automated analysis scripts first
- Focus on gathering missing diagnostic information
- Provide specific, actionable next steps
- Link to relevant documentation when appropriate

### When Suggesting Improvements
- Prioritize user experience and developer productivity
- Consider performance impact on extension activation
- Maintain consistency with existing VS Code extension patterns
- Focus on reducing support burden through better error messages

---

*This file helps GitHub Copilot understand the specific context, patterns, and requirements of the Azure Functions VS Code extension repository for more accurate and helpful assistance.*

## Advanced Codebase Insights & Implementation Details

### Critical Bug Patterns Discovered

#### Slot Name Display Inconsistency (Issue #4582)
**Root Cause**: `ResolvedFunctionAppResource.ts` line ~138
- **Problem**: Uses `this.dataModel.name` for all slots (production + deployment)
- **Fix**: Check `this._site?.isSlot` and use `this._site.slotName` for deployment slots
- **Impact**: Users cannot distinguish deployment slots in VS Code tree view vs Azure portal
```typescript
// Correct implementation:
public get label(): string {
    if (this._site?.isSlot && this._site.slotName) {
        return this._site.slotName;
    }
    return this.dataModel.name;
}
```

#### Template Fallback Silent Failure (Issue #4607)
**Root Cause**: `CentralTemplateProvider` silently falls back to backup templates
- **Problem**: No user notification when CDN templates unavailable
- **Impact**: Users unknowingly use outdated templates (backup updated every couple months vs CDN updated regularly)
- **Enhancement**: Add toast notification and retry option when fallback occurs

### Func CLI Path Detection Enhancements (Issue #4606)

#### Current Implementation Analysis
- **Setting exists**: `azureFunctions.funcCliPath` already implemented
- **Default behavior**: Falls back to `'func'` (PATH-based detection)
- **Enhancement opportunity**: Add automatic detection in common installation locations

#### Enhanced Detection Logic Implemented
```typescript
// Auto-detection paths by platform:
// Windows: %APPDATA%/npm/func.cmd, Program Files locations
// macOS: /usr/local/bin/func, /opt/homebrew/bin/func (Apple Silicon)
// Linux: /usr/local/bin/func, ~/.npm-global/bin/func
// Project-local: node_modules/.bin/func
```

#### Validation Improvements
- **Browse dialog**: Added UI option to manually select func executable
- **Path validation**: Verify executable exists and responds to `--version`
- **Better error messages**: Clear guidance when custom paths invalid

### Architecture Deep Dive

#### Tree Item Hierarchy & Data Flow
```
SlotTreeItem (UI representation)
├── SlotContainerTreeItemBase (base functionality)
├── ResolvedFunctionAppResource (core data/logic)
│   ├── ParsedSite (Azure site data)
│   ├── FunctionAppModel (simplified data model)
│   └── Child items: Functions, Settings, Files, etc.
```

**Key Insight**: `SlotTreeItem` delegates `label` to `SlotContainerTreeItemBase.label` → `ResolvedFunctionAppResource.label`

#### Template System Architecture Details
- **Primary**: CDN templates (latest, frequently updated)
- **Fallback**: `resources/backupTemplates/` (updated every couple months)
- **Cache location**: Local template cache with CDN update checks
- **Critical path**: `CentralTemplateProvider` handles template management
- **Failure mode**: Silent fallback without user notification (enhancement needed)

#### Debug Provider Integration
- **Multiple providers**: NodeDebugProvider, PythonDebugProvider, JavaDebugProvider, etc.
- **Task coordination**: FuncTaskProvider coordinates with debug providers
- **Core dependency**: All debugging relies on func CLI being available and working
- **Port conflict handling**: Currently requires manual configuration (no auto-resolution)

### Extension Configuration Patterns

#### Settings Architecture
- **Setting key format**: `azureFunctions.{settingName}`
- **Scope support**: Both workspace and global settings supported
- **Validation pattern**: Settings validated at usage time, not pre-emptively
- **Override hierarchy**: Workspace settings override global settings

#### Telemetry Patterns
```typescript
// Standard telemetry tracking pattern:
context.telemetry.properties.{propertyName} = 'value';
// Examples:
context.telemetry.properties.funcCliSource = 'setting' | 'autoDetected' | 'default' | 'browsed';
context.telemetry.properties.dialogResult = input.title;
```

### Error Handling & User Experience Patterns

#### Current Pain Points Identified
1. **Generic error messages**: "Resource failed to resolve" (not actionable)
2. **Silent failures**: Template fallback, path detection issues
3. **Poor error recovery**: Limited guidance on resolution steps
4. **Version mismatch confusion**: Runtime vs Core Tools version differences

#### Best Practices for Extensions
- **Error message format**: Include specific action user should take
- **Fallback notification**: Always notify users when fallback behavior occurs
- **Validation timing**: Validate at appropriate time (not too early, not too late)
- **Recovery options**: Provide multiple paths to resolution (install, browse, configure)

### Testing Strategy Insights

#### Test Categories & Coverage
- **Unit tests**: `test/` directory - fast, isolated component testing
- **Integration tests**: `test/nightly/` - full end-to-end with live Azure services
- **Template validation**: Automated testing of template functionality across runtimes
- **Manual testing workflow**: Extension Development Host (F5) for UI testing

#### Test Automation Patterns
```typescript
// Test utilities to leverage:
- assertThrowsAsync.ts: Async exception testing
- runWithSetting.ts: Test with temporary setting changes
- Template count validation: Update when adding/removing templates
```

### Performance & Resource Management

#### Extension Activation Strategy
- **Lazy loading**: Azure resources loaded on-demand
- **Background operations**: Template updates, Azure API calls
- **Resource disposal**: Proper cleanup of Azure clients and file handles
- **Memory management**: Large file operations (deployment) use streaming

#### API Call Optimization
- **Caching strategy**: Site data, templates, application settings cached locally
- **Refresh triggers**: Manual refresh, time-based expiration, error recovery
- **Batch operations**: Multiple API calls combined when possible
- **Error handling**: Graceful degradation when Azure services unavailable

### Common Development Pitfalls

#### TypeScript Patterns to Follow
- **Strict type checking**: Use proper types, avoid `any` when possible
- **Async/await consistency**: Prefer async/await over Promise chains
- **Error propagation**: Use proper error handling with context
- **Localization**: All user-facing strings through `localize()` function

#### Extension-Specific Gotchas
- **Context management**: ActionContext vs IActionContext vs ISubscriptionActionContext
- **WorkspaceFolder handling**: Can be string path or WorkspaceFolder object
- **Tree refresh timing**: Manual refresh needed after data changes
- **Setting scope**: Global vs workspace settings have different behavior

### Integration Points & Dependencies

#### Azure SDK Integration
- **Client creation**: Use `createWebSiteClient()` for Azure operations
- **Authentication**: Integrated with Azure Account extension
- **Resource management**: Proper disposal of Azure clients
- **API versioning**: Handle different Azure API versions gracefully

#### VS Code Extension API Usage
- **Tree providers**: Custom tree views for Azure resources
- **Task providers**: Integration with VS Code task system
- **Debug providers**: Custom debug configurations per language
- **Setting contributions**: Declarative settings in package.json

#### External Tool Dependencies
- **Azure Functions Core Tools**: Version detection and validation critical
- **Language runtimes**: Node.js, Python, .NET, Java version compatibility
- **Package managers**: npm, brew, apt integration for Core Tools installation
- **Docker**: Container support for advanced scenarios

### Maintenance & Support Patterns

#### Issue Triage Automation
- **Quality indicators**: Template completion, reproduction steps, error details
- **Response patterns**: Request missing information, link to existing issues
- **Telemetry usage**: Leverage diagnostic data for issue analysis
- **Common resolutions**: Documented troubleshooting steps for frequent issues

#### Release Management
- **Breaking changes**: Always document in CHANGELOG.md
- **Backward compatibility**: Consider older Azure Functions runtime versions
- **Template synchronization**: Update backup templates when Azure publishes new ones
- **Cross-platform testing**: Windows, macOS, Linux compatibility validation

### Code Quality & Review Patterns

#### Effective Bug Detection Methods
1. **Static analysis approach**: Search for property usage patterns across codebase
   - Example: `grep_search` for `isSlot`, `slotName` revealed slot name bug
   - Look for inconsistent property usage between similar components
2. **Architecture understanding**: Follow data flow through component hierarchy
   - SlotTreeItem → SlotContainerTreeItemBase → ResolvedFunctionAppResource
   - Delegate pattern means bugs can hide in parent classes
3. **Cross-reference validation**: Compare VS Code implementation with Azure portal behavior
   - Slot names should match between extension tree view and Azure portal

#### Code Review Focus Areas
- **Property delegation chains**: Verify correct property usage through inheritance
- **Error message actionability**: Ensure users can resolve issues based on error text
- **Setting validation**: Check if custom settings are properly validated and used
- **Silent failure detection**: Look for operations that fail without user notification
- **Cross-platform compatibility**: File paths, executable detection, path separators

#### Implementation Quality Indicators
```typescript
// Good: Specific, actionable error messages
throw new Error(localize('invalidFuncExecutable', 'The selected file is not a valid Azure Functions Core Tools executable. Please select the correct func executable.'));

// Poor: Generic, non-actionable errors
throw new Error('Resource failed to resolve');

// Good: User notification of fallback behavior
vscode.window.showWarningMessage(localize('templateFallback', 'Unable to fetch latest templates, using backup templates'));

// Poor: Silent fallback without notification
// (just falls back to backup templates with no user awareness)
```

#### Testing Strategy for Complex Components
- **Component isolation**: Test individual classes separate from VS Code integration
- **Mock external dependencies**: Azure clients, file system, external processes
- **Edge case coverage**: Network failures, permission issues, corrupted data
- **Cross-language validation**: Ensure features work across all supported runtimes

### Debugging & Troubleshooting Strategies

#### Extension Development Debugging
- **Extension Host**: F5 launches isolated VS Code instance for testing
- **Developer Console**: Help → Toggle Developer Tools → Console for runtime errors
- **Output channels**: Extension logs appear in "Azure Functions" output channel
- **Telemetry validation**: Check `context.telemetry.properties` for diagnostic data

#### Common Investigation Techniques
1. **Function flow tracing**: Start from user action, follow through command handlers
2. **Setting precedence**: Check workspace vs global setting resolution
3. **External tool validation**: Verify func CLI, Azure CLI, language runtimes work independently
4. **Network dependency isolation**: Test with/without internet connectivity
5. **Permission boundary testing**: Test with restricted file system permissions

#### Production Issue Diagnosis
- **Telemetry correlation**: Match user reports with telemetry data patterns
- **Environment reconstruction**: Replicate user's OS, tool versions, settings
- **Progressive isolation**: Disable features systematically to isolate root cause
- **Cross-platform verification**: Test issue reproduction on multiple operating systems

### GitHub Integration & Automated Workflows

#### MCP Server Integration Patterns
- **Issue creation**: Use `mcp_github_create_issue` for automated enhancement requests
- **Issue triage**: `mcp_github_add_issue_comment` for structured troubleshooting responses
- **PR review**: Automated code analysis and comment posting on pull requests
- **Label management**: Apply consistent labels ("enhancement", "core-tools", "templates", "user-experience")

#### Effective Issue Creation Templates

**Concise Issue Template** (preferred for most issues):
```markdown
## Description
[Clear explanation of the problem from user perspective, including specific symptoms and impact]

## Root Cause Analysis
[Technical analysis of the problem with specific locations and explanations]
### [Component/System Name]
- **Location**: [File path and line numbers]
- **Issue**: [What's wrong technically]
- **Current behavior**: [What actually happens]

### [Additional components as needed]
- **Location**: [File path and line numbers]
- **Process**: [How the system currently works]
- **Issue**: [What's missing or broken]

## Reproduction Steps
1. [Step-by-step instructions]
2. [With specific inputs/actions]
3. [Clear expected vs actual results]
4. **Result**: [What actually happens]
5. **Expected**: [What should happen]

---
**Environment**
- **Extension version**: [Version info]
- **VS Code version**: [Version info]
- **Azure Functions runtime**: [Runtime versions affected]
- **Languages affected**: [Programming languages impacted]
```

**Full Issue Template** (for complex issues requiring comprehensive analysis):
```markdown
**Root Cause Analysis**: Clear technical explanation of the problem
**Implementation Considerations**: Specific technical requirements and constraints
**Impact**: User experience consequences and frequency
**Telemetry Integration**: How to track usage and effectiveness
**Cross-Platform Requirements**: Windows, macOS, Linux considerations
```

#### Automated Response Patterns for Customer Issues
1. **Environment assessment**: Request extension version, VS Code version, OS, func CLI version
2. **Reproduction validation**: Ask for step-by-step instructions and consistency check
3. **Configuration review**: Check debug configuration, tasks.json, launch.json
4. **Diagnostic data**: Request Developer Console output and extension logs
5. **Workaround provision**: Provide immediate temporary solutions when possible

#### Issue Quality Validation Automation
```javascript
// Script patterns for issue analysis:
- Template completion checking: Verify required fields filled
- Reproduction steps validation: Ensure actionable instructions provided
- Environment information completeness: Check for version details
- Error message specificity: Validate concrete error details vs vague descriptions
```

### Advanced Implementation Techniques

#### Multi-Platform Path Detection Strategy
```typescript
// Enhanced func CLI detection approach:
const pathCandidates = [
    // Package manager globals
    process.env.APPDATA + '/npm/func.cmd',           // Windows npm global
    '/usr/local/bin/func',                           // Unix-like global
    '/opt/homebrew/bin/func',                        // macOS Apple Silicon brew

    // Project-local installations
    'node_modules/.bin/func',                        // Local npm install

    // User-specific installations
    os.homedir() + '/.npm-global/bin/func',         // Custom npm prefix
    os.homedir() + '/bin/func'                       // User local bin
];
```

#### UI Enhancement Patterns
- **Progressive disclosure**: Start with simple options, reveal advanced ones on demand
- **Validation feedback**: Immediately validate user input and provide feedback
- **Recovery options**: Always provide multiple paths to resolve issues (install, browse, configure)
- **Context preservation**: Remember user choices across sessions

#### Error Recovery Best Practices
```typescript
// Multi-level fallback strategy:
try {
    return await primaryMethod();
} catch (primaryError) {
    try {
        return await fallbackMethod();
    } catch (fallbackError) {
        // Notify user of both attempts and provide manual options
        return await userGuidedRecovery(primaryError, fallbackError);
    }
}
```

### File Organization & Architectural Patterns

#### Core Directory Structure Insights
```
src/
├── commands/           # User-facing command implementations
│   ├── appSettings/   # Settings upload/download, connection string management
│   ├── deploy/        # Deployment logic, Core Tools integration
│   ├── createFunction/ # Function creation wizards and templates
│   └── logstream/     # Log streaming and monitoring
├── funcCoreTools/     # Core Tools detection, installation, validation
├── templates/         # Template system (CDN + backup fallback)
├── tree/              # Azure resource tree view components
├── debug/             # Debug providers for different language runtimes
├── utils/             # Shared utilities (dotnet, cp, env, etc.)
└── vsCodeConfig/      # VS Code integration (settings, tasks)
```

#### Key Architectural Principles
- **Separation of concerns**: Commands, tree views, debug providers are isolated
- **Language-agnostic core**: Base functionality works across all runtimes
- **Lazy loading**: Azure resources and templates loaded on-demand
- **Graceful degradation**: Features continue working with limited functionality when dependencies unavailable

#### Critical File Relationships
```typescript
// Extension activation chain:
extension.ts → extensionVariables.ts → tree/AzureAccountTreeItemWithProjects.ts
                ↓
        Commands registration → debug/FuncTaskProvider.ts
                ↓
        Template system → templates/CentralTemplateProvider.ts
```

#### Settings Integration Patterns
- **Package.json contributions**: Declarative settings with localization keys
- **Runtime access**: `getWorkspaceSetting()` for accessing user preferences
- **Scope handling**: Workspace settings override global settings
- **Validation strategy**: Validate at usage time, not on setting change

#### Tree View Implementation Strategy
```typescript
// Delegation pattern in tree views:
SlotTreeItem extends SlotContainerTreeItemBase {
    // UI representation and VS Code integration
    public get label(): string { return this.resolved.label; }
    public get contextValue(): string { /* slot-specific logic */ }
}

SlotContainerTreeItemBase extends AzExtParentTreeItem {
    // Common functionality across container types
    public async loadMoreChildrenImpl(): Promise<AzExtTreeItem[]> {
        return this.resolved.loadMoreChildrenImpl();
    }
}

ResolvedFunctionAppResource extends ResolvedFunctionAppBase {
    // Core business logic and Azure integration
    public async refreshImpl(): Promise<void> { /* Azure API calls */ }
    public get label(): string { /* Site name logic */ }
}
```

### Advanced Development Patterns

#### Wizard Pattern Implementation
```typescript
// Multi-step user interaction pattern used throughout:
interface IWizardContext {
    language?: ProjectLanguage;
    version?: FuncVersion;
    template?: IFunctionTemplate;
}

// Steps are composable and reusable:
class LanguageStep extends AzureWizardPromptStep<IWizardContext> {
    public async prompt(): Promise<void> { /* user selection */ }
}

class VersionStep extends AzureWizardPromptStep<IWizardContext> {
    public async prompt(): Promise<void> { /* version selection */ }
}
```

#### Error Context Propagation
```typescript
// Consistent error handling with telemetry:
await callWithTelemetryAndErrorHandling('operationName', async (context: IActionContext) => {
    context.telemetry.properties.customProperty = 'value';
    try {
        await riskyOperation();
    } catch (error) {
        context.telemetry.properties.errorType = error.constructor.name;
        throw new Error(localize('userFriendlyMessage', 'What user should do'));
    }
});
```

#### Template System Multi-Source Strategy
```typescript
// Prioritized template source resolution:
async function getTemplates(): Promise<IFunctionTemplate[]> {
    try {
        return await getCdnTemplates();      // Latest from Azure CDN
    } catch (cdnError) {
        logWarning('CDN templates unavailable, using backup');
        notifyUser('Using backup templates'); // User notification enhancement
        return await getBackupTemplates();   // Local fallback
    }
}
```

### Performance Optimization Insights

#### Lazy Loading Implementation
- **Tree items**: Azure resources loaded only when expanded by user
- **Templates**: Downloaded on first use, cached locally
- **Debug providers**: Registered at activation, but language-specific logic loaded on demand
- **Application settings**: Fetched when tree item first expanded

#### Caching Strategy Details
```typescript
// Multi-level caching approach:
private _cachedVersion: FuncVersion | undefined;        // In-memory cache
private _cachedHostJson: IParsedHostJson | undefined;   // Session cache
// + Local file system cache for templates                // Persistent cache
```

#### Memory Management Patterns
- **Azure client disposal**: Properly dispose clients after operations
- **File handle management**: Use streaming for large file operations (deployment)
- **Event listener cleanup**: Remove listeners in extension deactivation
- **Background process management**: Track and clean up long-running operations

### Cross-Platform Development Guidelines

#### Platform-Specific Handling
```typescript
// File path construction:
const funcPath = os.platform() === 'win32'
    ? path.join(appData, 'npm', 'func.cmd')
    : path.join('/usr/local/bin', 'func');

// Executable validation:
if (os.platform() !== 'win32') {
    await fs.promises.access(funcPath, fs.constants.X_OK);
}
```

#### Package Manager Integration
- **npm**: Cross-platform, primary installation method
- **brew**: macOS-specific, handles Apple Silicon vs Intel automatically
- **apt/yum**: Linux distribution-specific handling
- **Manual installation**: Browser-based selection with validation

## Detailed Architecture & Component Knowledge

### Extension Activation & Core Components
- **Entry Point**: `src/extension.ts` - VS Code calls `activate()` which calls `activateInternal()`
- **Critical Initialization Steps**:
  - `registerCommands()` - Registers all extension commands (most critical step)
  - `createApiProvider()` - Enables other extensions to use Functions API
  - `registerDebugConfigurationProvider()` - Supports debugging for different runtimes
  - Debug providers registered for: node, python, java, ballerina, PowerShell
- **Debug Integration**: Uses Func Core Tools (`func` CLI) as emulator for local debugging
- **Language Detection**: Based on `projectLanguage` VS Code setting determined during project creation

### Function Core Tools Integration
- **Version Strategy**: All versions supported, but push users toward v4
- **Installation Detection**: Currently looks for `func` in system PATH
- **Missing Installation**: Extension helps users install automatically
- **Enhancement Needed**: Should support custom paths for func CLI installations (Issue #4601)
- **Version Validation**: Issues surface during operation rather than pre-validation
- **Common Problems**: Version mismatches not clearly communicated to users

### Template System Architecture
- **Primary Source**: CDN templates (updated regularly)
- **Backup System**: `resources/backupTemplates/` (updated every couple months)
- **Fallback Behavior**: Silent fallback to backup templates when CDN unavailable
- **Cache Strategy**: Templates cached locally, checked for updates against CDN
- **Failure Origin**: Template issues typically from CDN templates, not backups
- **Directory Structure**:
  - `src/templates/` - Template loading and CDN interaction code
  - `resources/backupTemplates/` - Offline fallback templates
- **Template Provider**: `CentralTemplateProvider` handles template management

### Tree View & Azure Resource Management
- **Core Components**:
  - `ResolvedFunctionAppResource` - Main tree item representing function apps
  - `SlotTreeItem` - Represents both production and deployment slots
- **Hierarchy**: Each SlotTreeItem contains a ResolvedFunctionAppResource
- **Azure Integration**: ResolvedFunctionAppResource contains full site payload and metadata
- **Failure Modes**:
  - Fails when Azure payload doesn't arrive correctly
  - Common causes: Azure service outages, user permission issues
  - Error message: "Resource failed to resolve" (not actionable for users)

### Project Language & Model System
- **Language Selection**: `InitVSCodeLanguageStep` handles language selection
- **Context**: Used for both new projects and `initProjectForVSCode` command
- **Supported Languages**: JavaScript, TypeScript, C#, F#, Python, Java, PowerShell, Ballerina, Custom
- **Python Models**:
  - v1 Model: Stricter template structure, traditional approach
  - v2 Model (Preview): Flexible structure, all functions in one file or separate files
- **Language Recovery**: Extension can reinitialize and re-prompt if `projectLanguage` setting corrupted
- **Language-Specific Steps**: Each language has dedicated initialization steps in `InitVSCodeStep/` directory

## Common Issue Patterns & Troubleshooting Guide

### 1. Deployment Issues (Most Common - ~40-50% of issues)

#### Zipping Failures
- **File permission issues** on user's machine
- **Large file sizes/memory constraints** during packaging
- **Special characters in file paths** causing zip corruption
- **Symlinks or file system edge cases** not handled properly
- **Zip stream implementation**: Extension uses zip stream for deployment to Kudu CDN - potential stream handling issues
- **Troubleshooting**: Check file permissions, verify path characters, examine project size

#### Upload Failures
- **Network timeouts** during large deployments
- **Authentication token expiration** during long uploads
- **Azure service throttling** under high load
- **Specific file types rejected** by Azure
- **Root cause unclear**: Upload failures to Azure are not well understood
- **Troubleshooting**: Check network stability, verify auth status, retry with smaller deployments

#### Key Commands
- `azureFunctions.deploy` - Most frequently used command with issues
- `azureFunctions.createFunctionApp` - Generally stable, fails mainly due to:
  - SKU limits in selected regions
  - Temporary Azure service outages

### 2. Debugging Issues (Second Most Common - ~30-40% of issues)

#### Port Conflicts
- **No automatic resolution** - users must manually configure
- **Configuration Location**: Users modify debug configuration in `tasks.json` where `func host start` command is defined
- **Default Strategy**: No automatic port conflict resolution implemented
- **User Action Required**: Manual port configuration in debug settings

#### Function Core Tools Problems
- **Version mismatches**: Not clearly communicated to users
- **Missing installations**: Extension provides clear "func tools not found" message with installation prompt
- **Path detection failures**: Only looks in system PATH
- **Error clarity**: Runtime errors provide guidance to users rather than pre-validation
- **Version strategy**: Uses whatever version is available, runtime failures surface version mismatch issues

#### Template Issues During Debug
- **Function templates not working correctly** during debug sessions
- **Template source**: Usually CDN template problems, not backup template issues
- **Silent failures**: Template fallback happens without user notification

#### VS Code Integration Issues
- **VS Code updates breaking debugger attachment**
- **Project configuration corruption**
- **Language detection failures**

### 3. Function App Creation Issues (Generally Stable - ~5-10% of issues)
- **SKU limits** in selected Azure regions
- **Temporary Azure service outages**
- **Subscription permission issues**

### 4. Template and Project Issues (~10-15% of issues)

#### CDN Template Failures
- **Behavior**: Silent fallback to backup templates when CDN unavailable
- **User Experience**: Users unaware they're getting older templates instead of latest
- **Update Frequency**: Backup templates updated every couple months
- **Enhancement needed**: User notification when fallback occurs (Issue #4603)
- **Detection**: No notification when fallback occurs

#### Python Model Confusion
- **v1 vs v2 model selection**: Users may choose wrong model for workflow
- **Current default**: v2 model (flexible structure)
- **v1 model status**: Being deprecated but still supported
- **User guidance**: Should default to v2 for new projects
- **Compatibility**: Different template structures can cause confusion

## Error Message Patterns & User Experience Issues

### Poor Error Messages
- **"Resource failed to resolve"**: Not actionable, doesn't guide user to solution
  - **User should try**: Check Azure permissions, re-authenticate, refresh tree view, verify internet connectivity
  - **Enhancement needed**: More specific error messages with actionable guidance
- **Core Tools version mismatches**: Unclear what user should do
- **Template fallback**: Silent failure, no user notification
- **Port conflicts**: No guidance on resolution steps

### Authentication & Azure Service Issues
- **Token expiration**: During long operations like deployment
- **Service outages**: Users see generic "failed to resolve" messages
- **Permission issues**: Unclear error messages about access problems

## API & Extension Integration

### External API Consumers
- **Azure Static Web Apps extension**: Uses Azure Functions API
- **API Importance**: Not critical to understand deeply for most troubleshooting
- **API Methods**: Focus on deployment and project management functions

### Most Critical Commands
1. **azureFunctions.deploy** - Most frequently used, highest failure rate
2. **azureFunctions.createFunctionApp** - Stable but important for initial setup
3. **initProjectForVSCode** - Used for project reinitialization

## Testing Strategy & Validation

### Test Categories
- **Regular Tests**: Run on every commit/PR in `test/` directory
- **Nightly Tests**: Long-running tests in `test/nightly/` directory
  - End-to-end tests with live Azure services
  - Run once per night in CI/CD pipeline
- **Template Validation**: Test suite verifies triggers work correctly

### Manual Testing Workflow
- **Extension Development Host**: F5 to launch test environment
- **UI Testing**: Manual walkthrough of common user workflows
- **Debug Testing**: Test various language runtimes and scenarios

### Template Count Validation
- **Template Tests**: Verify template counts when adding/removing templates
- **Backup Template Updates**: Must update backup templates when Azure publishes new templates
- **Cross-language Testing**: Verify templates work across Node.js, Python, .NET, Java

## Architecture Patterns & Code Standards

### Wizard Pattern Usage
- **AzureWizardPromptStep**: Used for user input steps (like language selection)
- **AzureWizardExecuteStep**: Used for execution steps (like file creation)
- **Context Objects**: `IProjectWizardContext` carries state through wizard steps
- **Language-Specific Flows**: Each language has dedicated wizard step implementations

### Debug Provider Pattern
- **Language-Specific Providers**: NodeDebugProvider, PythonDebugProvider, etc.
- **Registration**: All providers registered with VS Code debug system
- **Task Provider**: FuncTaskProvider coordinates with debug providers
- **Integration**: Uses Function Core Tools as local emulator

### Tree Item Architecture
- **Hierarchy**: Azure subscription → Resource Group → Function App → Slots
- **Data Loading**: Lazy loading of Azure resources
- **Refresh Strategy**: Manual and automatic refresh of tree items
- **Error Handling**: Graceful degradation when Azure services unavailable

## Automated Issue Triage Knowledge

### Issue Quality Indicators
**Good Issues Include**:
- Complete issue template with all fields filled
- "Does this occur consistently?" answered with Yes/No
- Detailed reproduction steps
- Complete error messages (not truncated)
- Environment information (extension version, VS Code version, OS)
- Code samples when relevant

**Poor Issues Lack**:
- Reproduction steps ("Repro steps:" left empty)
- Specific error messages (vague descriptions like "doesn't work")
- Environment details
- Consistency information

### Common Issue Template Violations
- **Copy-paste template without filling details**
- **Empty Action, Error type, Error Message fields**
- **Unanswered "Does this occur consistently?" question**
- **Vague titles like "function not working" without specifics**

### Automated Response Patterns
- **Template completion requests**: Ask for specific missing fields
- **Environment information requests**: Ask for extension version, VS Code version, OS
- **Reproduction step requests**: Guide users to provide step-by-step instructions
- **Error detail requests**: Ask for complete error messages from Developer Console

### Template JSON Structure Analysis
Looking at the template index file structure:
- **Bundle versions**: Maps extension bundle versions to template versions
- **CDN URLs**: Templates, bindings, and resources hosted on Azure CDN
- **Version mapping**: Each bundle version has corresponding template version
- **Localization**: Resources support locale-specific content

- Do not commit or suggest changes to `main.js` when those changes are automatically generated as part of the webpack build process.

