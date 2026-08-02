# Getting Started

<span class="badge">Topics: Overview, Layout, Workspaces, First Steps</span>

OpenShell Playground is an OpenShift Console plugin that lets you deploy AI coding agent sandboxes and interact with them through embedded terminals. It uses a single **gateway** per namespace with multiple **workspaces** — each workspace has its own inference route, so different agent types can use different models and providers from the same gateway pod.

![images/overview.png](images/overview.png)

---

## Page Layout

The playground is divided into four main areas:

| Area | Purpose |
|------|---------|
| **Workspaces** (top-left) | Manage workspaces, register providers, set models, deploy sandboxes |
| **Agent List** (top-right) | View deployed sandboxes with workspace column, open terminals, delete sandboxes |
| **Gateway TUI** (bottom-left) | Single gateway terminal — press `w` to cycle workspaces |
| **Sandbox Terminals** (bottom-right) | Interactive terminals connected to agent sandboxes |

---

## Quick Start

1. **Select a namespace** from the dropdown at the top
2. **Deploy the gateway** — click "Deploy Gateway" (deploys the gateway pod + a `default` workspace)
3. **Add a workspace** — click `+ Workspace` and choose an agent type (e.g. Claude Code)
4. **Register a provider** — select the workspace tab, click `+ New provider`, enter credentials
5. **Set a model** and click **Deploy Sandbox**
6. Click **Terminal** on the running sandbox to open an interactive shell
7. Run the agent command shown in the terminal prompt (e.g. `claude --bare`)

---

## Workspace Switching in the TUI

The Gateway TUI shows one workspace at a time. Click inside the TUI panel, **you must be in the sandboxes tab within the TUI panel** and press **`w`** to cycle through workspaces. The header shows the current workspace:

```
Current Gateway: gateway [user] (Healthy) | Workspace: claude | Dashboard
```

---

## Next Steps

- [Workspace Configuration](gateways) — workspaces, providers, and inference routing
- [Provider Configuration](providers) — set up API credentials
- [Agent List & Sandboxes](agent-list) — manage your deployed sandboxes
