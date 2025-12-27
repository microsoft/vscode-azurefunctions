# Coding Instructions for GitHub Copilot

- Never commit or suggest changes to `main.js`.

## Code Review
The following instructions are only to be applied when performing a code review.

### Prompt file guide
<!-- Source: https://github.com/github/awesome-copilot/blob/main/.github/copilot-instructions.md -->
**Only apply to files that end in `.prompt.md`**

- [ ] The prompt has markdown front matter.
- [ ] The prompt has a `mode` field specified of either `agent` or `ask`.
- [ ] The prompt has a `description` field.
- [ ] The `description` field is not empty.
- [ ] The `description` field value is wrapped in single quotes.
- [ ] The file name is lower case, with words separated by hyphens.
- [ ] Encourage the use of `tools`, but it's not required.
- [ ] Strongly encourage the use of `model` to specify the model that the prompt is optimised for.

### Chat Mode file guide
<!-- Source: https://github.com/github/awesome-copilot/blob/main/.github/copilot-instructions.md -->
**Only apply to files that end in `.agent.md`**

- [ ] The chat mode has markdown front matter.
- [ ] The chat mode has a `description` field.
- [ ] The `description` field is not empty.
- [ ] The `description` field value is wrapped in single quotes.
- [ ] The file name is lower case, with words separated by hyphens.
- [ ] Encourage the use of `tools`, but it's not required.
- [ ] Strongly encourage the use of `model` to specify the model that the chat mode is optimised for.
