# Copilot-Assisted Project Creation

## Overview

The Template Gallery webview includes a **Generate with Copilot** tab that lets users describe the function app they want in plain English. The extension sends the description to GitHub Copilot (via `vscode.lm`) and generates a custom project scaffold. A **dual-path UX** also offers a "Continue in Copilot Chat" option for users who prefer to iterate interactively in the Copilot Chat panel.

---

## Architecture

```
TemplateGalleryPanel  (WebviewPanel)
  │
  ├── Tab 1: Browse Templates
  │     └── lists templates from ProjectTemplateProvider
  │
  └── Tab 2: Generate with Copilot
        ├── Prompt text area
        │     └── [Generate] button
        │           ├── Sends prompt to vscode.lm (Copilot)
        │           ├── Shows "Generating…" spinner
        │           └── On success → displays generated project scaffold
        │
        └── [Continue in Copilot Chat] link (dual-path UX)
              └── Opens Copilot Chat with pre-filled query
```

---

## Source Files

| File | Role |
|---|---|
| `src/commands/createNewProject/TemplateGalleryPanel.ts` | Webview panel host — manages lifecycle, message routing, HTML generation |
| `resources/webviews/templateGallery/` | Static webview assets (HTML, CSS, JS) served to the WebviewPanel |

---

## TemplateGalleryPanel

### Singleton pattern

```typescript
TemplateGalleryPanel.currentPanel  // undefined when no panel is open
TemplateGalleryPanel.createOrShow(extensionUri)  // open or reveal
```

The panel is disposed when the user closes it, and `currentPanel` is set back to `undefined`.

### Webview ↔ Extension message protocol

Messages flow in both directions over `panel.webview.postMessage` / `panel.webview.onDidReceiveMessage`.

#### Webview → Extension messages

| `command` | Payload | Description |
|---|---|---|
| `generateWithCopilot` | `{ prompt: string }` | User clicked Generate; triggers LLM call |
| `openInCopilotChat` | `{ prompt: string }` | User clicked "Continue in Copilot Chat" |
| `cloneTemplate` | `{ templateId: string }` | User selected a template from the browse tab |
| `refreshTemplates` | — | User clicked Refresh |

#### Extension → Webview messages

| `command` | Payload | Description |
|---|---|---|
| `updateTemplates` | `{ templates: IProjectTemplate[] }` | Sends template list to render |
| `generationStarted` | — | Signals spinner start |
| `generationComplete` | `{ files: GeneratedFile[] }` | Generated project scaffold |
| `generationError` | `{ message: string }` | LLM or processing error |

---

## Generate with Copilot Flow

### 1. User submits prompt

Webview sends `generateWithCopilot` with the user's description string.

### 2. LLM invocation

```typescript
// Select best available Copilot model
let models = await vscode.lm.selectChatModels({ vendor: 'copilot', family: 'gpt-4o' });
if (!models.length) {
    models = await vscode.lm.selectChatModels({ vendor: 'copilot' });
}
```

If no Copilot model is available, the extension shows an error with an **Install GitHub Copilot** button that opens the Extensions search for `GitHub.copilot`.

### 3. System prompt

The extension builds a system prompt instructing the LLM to:
- Generate a complete Azure Functions project for the user's described use case.
- Include `host.json`, `local.settings.json`, source files for the target language, and `requirements.txt` / `package.json` as appropriate.
- Return a JSON array of `{ path, content }` objects.

### 4. Streaming response

The response is streamed and concatenated:

```typescript
const response = await model.sendRequest(messages, {}, token);
for await (const chunk of response.text) {
    rawResponse += chunk;
}
```

### 5. Result

Parsed JSON is sent back to the webview as `generationComplete`. The webview renders the file tree and a preview of each file. The user can then accept the scaffold to write it to disk.

---

## Dual-Path UX — "Continue in Copilot Chat"

Available in three places in the Generate tab:

1. **Prompt area** — a secondary link below the Generate button, visible before generation starts.
2. **Success state** — after generation, alongside "Accept" to let users iterate further.
3. **Error state** — as a fallback when LLM generation fails.

### Implementation

When the user clicks "Continue in Copilot Chat", the webview sends `openInCopilotChat` with the current prompt. The extension handles it:

```typescript
case 'openInCopilotChat': {
    const query = `Create an Azure Functions project: ${message.prompt}`;
    await vscode.commands.executeCommand('workbench.action.chat.open', {
        query,
        isPartialQuery: true,   // pre-fills the input without submitting
    });
    break;
}
```

`isPartialQuery: true` pre-fills the Copilot Chat input box with the prompt so the user can refine it before sending — avoiding an unwanted automatic submission.

### Confirmation panel

Before switching to Copilot Chat, a confirmation panel is shown in the webview explaining what will happen. This prevents accidental navigation away from the gallery. The user sees:

- What query will be sent to Copilot Chat
- A **Confirm** button to proceed
- A **Back** button to return to the Generate tab

---

## Webview Security

The WebviewPanel is configured with:

```typescript
enableScripts: true,
localResourceRoots: [extensionUri],
retainContextWhenHidden: true,  // preserves state when tab is hidden
```

All webview assets use `webview.asWebviewUri()` for correct VS Code sandbox URIs. No external network calls are made from the webview itself.

---

## Telemetry

| Property | Values | Description |
|---|---|---|
| `generationTrigger` | `'copilot'`, `'copilot-chat'` | Which path the user took |
| `llmModel` | model name string | Copilot model used |
| `generationSuccess` | `'true'`, `'false'` | Whether LLM call succeeded |
| `fileCount` | number | Number of files generated |
