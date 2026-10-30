---
description: "Architecture-first issue prioritization, VS Code/Playwright verified fixes, and PR/release tracking"
applyTo: "**"
---

# GitHub issue triage and verified fixes

Use this workflow when asked to investigate, prioritize, or fix GitHub issues.
Triage alone does not authorize implementation. Start the fix workflow only for
an issue the user selected or authorized you to select. Documentation-only tasks,
including updates to these instructions, do not require UI reproduction.

## Architecture-first triage

1. Read `AGENTS.md`, `.github/copilot-instructions.md`, and the relevant subsystem
   files in `.github/instructions` before estimating fix confidence. Understand
   the extension's ownership boundaries rather than judging by issue titles.
2. Establish the repository, review date, and checkout revision. Compare with the
   current default branch before describing a report as still applicable. Do not
   switch branches, overwrite local work, or assume the checkout is current.
3. Retrieve the live open-issue inventory. Screen titles and labels, then inspect
   shortlisted reports, reproduction steps, discussions, assignments, and linked
   PRs. Check both this repository and relevant upstream work. Distinguish an open
   PR, a merged fix, and a closed-but-unmerged attempt; a comment saying "fixed"
   is not proof that the fix exists in current code.
4. Trace candidates through contribution/API -> registration -> command or wizard
   -> service/resource model -> result and refresh -> existing tests. Determine
   whether the cause belongs here, in shared Azure Tools packages, upstream
   templates, Core Tools, a language worker, or the Azure service.
5. Produce two independent rankings with clickable issue links and concise
   evidence. Rank fix confidence by root-cause clarity, ownership, scope,
   compatibility risk, reproduction quality, and regression-test feasibility.
   Rank value by failure severity, affected workflows and users, frequency, and
   available workarounds. Do not confuse an easy fix with a valuable fix.
6. Explain uncertainty, active work, duplicates, and apparently resolved or
   upstream-owned reports. State how many issues were screened versus examined
   deeply; do not imply every report was reproduced. Label confidence scores and
   impact estimates as judgments, not measured probabilities or usage data.

## Required issue fix workflow

### 1. Use VS Code through Playwright

- Drive the actual VS Code UI with Playwright using the available VS Code/Electron
  or browser automation setup. Do not substitute a mock UI, a direct API call, or
  a standalone script for the requested VS Code reproduction.
- Use an isolated test workspace/profile where possible. Verify the intended
  workspace and extension version/revision are running; distinguish the installed
  release from an Extension Development Host loading this checkout.
- A disposable remote container, sandbox, or VM may replace the local machine.
  It must run actual VS Code with the required extensions and Playwright; headless
  Linux needs a display server such as Xvfb. Match the report's OS and extension
  host placement; Linux container evidence does not verify Windows/macOS-specific
  behavior.
- Record relevant prerequisites: OS, VS Code and extension versions, runtime,
  programming model, Core Tools, hosting plan, and project layout.
- If automation, authentication, or required services are unavailable, report the
  concrete blocker. Do not bypass permissions, use production resources, or claim
  UI verification. Obtain authorization before creating or mutating Azure
  resources, and use disposable test resources.

### 2. Reproduce the issue and submit a before screenshot

- Follow the issue's actual entry point and steps in VS Code, including the
  relevant command palette, tree menu, wizard, task, or debugger interaction.
- Confirm the observable failure described in the report. Capture the relevant
  VS Code UI with Playwright and submit the screenshot to the user before editing
  product code. Include concise steps and expected versus actual behavior.
- Show enough context to identify the command, target, and failure. For a
  nonvisual failure, show the relevant safe Output, Problems, or terminal state.
- If it does not reproduce, record the attempts and environment differences.
  Report that outcome rather than making a speculative fix or fabricating before
  evidence.

### 3. Attempt a focused fix

- Investigate the root cause and make the smallest complete change under the
  repository and subsystem instructions. Preserve supported platforms, local and
  remote workflows, public contracts, and shared-helper conventions.
- Add a deterministic regression test where practical and run the smallest
  relevant existing checks. Tests supplement, but do not replace, UI evidence.
- Build when needed and reload/relaunch the development extension so the next
  reproduction uses the changed source rather than an installed or stale bundle.
  Never manually edit or commit generated `main.js`.

### 4. Repeat the reproduction and submit proof

- Reset to an equivalent starting state and repeat the same steps through VS Code
  with Playwright. Keep inputs, project layout, settings, and resources comparable;
  do not hide the defect with an unrelated workaround or cached successful state.
- Verify the exact expected outcome, not merely the absence of an error toast.
  For example, confirm the selected deployment slot, completed deployment,
  expected function response, or debugger breakpoint.
- If fixed, capture and submit an after screenshot showing that outcome. Use the
  same relevant view as the before screenshot when practical, and identify which
  build/revision was verified.
- If the failure remains, continue investigating and repeat the fix/verification
  cycle. Report unresolved behavior or blockers plainly; do not present a partial
  improvement as a verified fix.

## Pull request creation and release tracking

When authorized to create or update a product-fix PR:

- Find the existing tracking issue and compare its reported scenario and expected
  outcome with the verified fix. Include a separate `Fix #1234` line in the PR
  body for each issue fully resolved. Use `Fix owner/repo#1234` for an issue in
  another repository. A plain link or `Refs` reference does not automatically
  close the issue; the closing keyword takes effect when the PR merges into the
  default branch.
- Do not use a closing keyword for a related, partially addressed, or unverified
  report. Use `Refs #1234` and explain what remains instead. If no existing issue
  tracks the verified defect, state that explicitly rather than inventing an
  issue number or claiming an unrelated report is fixed.
- Confirm the current release target using the live milestones and release plan.
  Reuse the existing milestone for the release being prepared, and assign both
  the tracking issue and fixing PR to it. Do not select an already released
  version or create a duplicate milestone. Ask if the intended release is unclear.
- Add a concise, user-facing fix entry to `CHANGELOG.md` under the existing
  `Unreleased` or upcoming release's `Fixed` section, creating that section if
  needed and following the surrounding format. Link the issue and PR when known;
  do not place a new fix under an already shipped release.
- Before reporting the PR ready, read back its closing-issue linkage and the
  issue/PR milestone assignments, and confirm the changelog entry is included in
  the PR diff. Preserve existing description content and reproduction evidence.
  Do not manually close the issue before the fixing PR merges.

## Screenshot evidence and completion

- Store screenshots in the session artifact directory, outside the repository,
  with distinct names such as `issue-4354-before.png` and `issue-4354-after.png`.
  Do not commit screenshots, traces, temporary projects, or automation profiles
  unless explicitly requested.
- Use synthetic test data and sanitized views. Inspect screenshots before sharing;
  exclude credentials, connection strings, app-setting values, customer content,
  identifying resource names, account details, and user paths. Do not alter the
  observed behavior or manufacture evidence when cropping or redacting.
- Submit actual viewable images with descriptive captions, not just filenames or
  a statement that screenshots were taken. Default to this conversation; publish
  to a GitHub issue or PR only when requested. Use supported media-attachment
  tooling and verify hosted attachments are present when publishing.
- A verified fix requires the reproduced failure and before screenshot, the code
  change, applicable regression checks, and the repeated VS Code reproduction
  with an after screenshot proving the expected outcome. If any part is missing,
  explicitly state what remains unverified.
- Clean up only the temporary files, profiles, processes, and test resources
  created for the reproduction, while retaining submitted evidence.
