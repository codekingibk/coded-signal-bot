---
name: Project handoff files
description: Where preserved files can appear after moving a conversation into a project.
---

After a conversation becomes a project, files preserved from the temporary conversation workspace may be available under `.local/conversation-workspace/files` rather than at the project root.

**Why:** The handoff can restore the generated project scaffold first and preserve the uploaded project separately, so assuming every uploaded file was already copied into the root can lead to missing-app or duplicate-work errors.

**How to apply:** Check the preserved-files path when an uploaded project or artifact is missing after handoff, then copy only the project files needed into the active workspace.