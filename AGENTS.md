# Supported Agents

This document covers all agent types supported by the OpenShell Playground plugin, their configuration, sandbox images, and terminal setup.

## Architecture

Each agent type runs on its own **per-agent-type gateway**. OpenShell has one inference route per gateway, so each agent gets its own provider and model configuration via `inference.local`.

When a user opens a sandbox terminal, the plugin:

1. Connects to the sandbox pod via K8s exec WebSocket
2. Enters the sandbox network namespace via `nsenter --net`
3. Sources a shell rcfile that configures TLS, proxy, and inference environment variables
4. Runs agent-specific setup (config files, model discovery)

## Common Environment

All agents share these base environment variables set by the rcfile:

| Variable | Value | Purpose |
|----------|-------|---------|
| `HTTPS_PROXY` | `http://10.200.0.1:3128` | Route through OpenShell supervisor proxy |
| `SSL_CERT_FILE` | `/etc/openshell-tls/ca-bundle.pem` | Trust gateway's self-signed TLS CA |
| `NODE_EXTRA_CA_CERTS` | `/etc/openshell-tls/openshell-ca.pem` | Node.js TLS trust |
| `CODEX_CA_CERTIFICATE` | `/etc/openshell-tls/ca-bundle.pem` | Codex (Rust) TLS trust |
| `ANTHROPIC_BASE_URL` | `https://inference.local` | Claude API routing |
| `OPENAI_BASE_URL` | `https://inference.local/v1` | OpenAI API routing |
| `OPENAI_API_KEY` | `unused` | Required by SDKs, gateway handles actual auth |
| `CLAUDE_CODE_DISABLE_EXPERIMENTAL_BETAS` | `1` | Avoids Vertex AI 400 errors from unsupported fields |

Process cleanup: `set +m` disables job control so child processes stay in bash's process group. `trap 'kill 0' EXIT` ensures agents are killed when the terminal disconnects.

---

## Claude Code

| | |
|---|---|
| **Sandbox image** | `base` (`ghcr.io/nvidia/openshell-community/sandboxes/base:latest`) |
| **Providers** | Google Vertex AI, Anthropic |
| **Terminal command** | `claude --bare` |
| **Terminal setup** | Base env only — Claude Code reads `ANTHROPIC_BASE_URL` natively |

### Provider Notes

- **Vertex AI**: Register with GCP Project ID, Region, and Service Account JSON. The gateway mints OAuth tokens internally using `--from-gcloud-adc`.
- **Anthropic**: Direct API key.

### Known Issues

- `CLAUDE_CODE_DISABLE_EXPERIMENTAL_BETAS=1` is required for Vertex AI to avoid 400 errors from the `context_management` field.
- The theme detection query (OSC 11) hangs in xterm.js — `OPENSHELL_THEME=dark` is set in the gateway's ttyd sidecar.

---

## Codex

| | |
|---|---|
| **Sandbox image** | `base` |
| **Providers** | OpenAI, OpenAI-compatible (vLLM, MaaS) |
| **Terminal command** | `codex --full-auto` |
| **Terminal setup** | Auto-generates `/sandbox/.codex/config.toml` |

### Auto-Configuration

The rcfile creates a Codex config with a custom `openshell` provider:

```toml
model_provider = "openshell"

[model_providers.openshell]
name = "OpenShell Inference"
base_url = "https://inference.local/v1"
env_key = "OPENAI_API_KEY"
supports_websockets = false
```

WebSocket transport is disabled because OPA policy blocks `wss://inference.local/v1/responses`. SSE streaming is used instead.

### Known Issues

- Codex is a Rust binary — `NODE_TLS_REJECT_UNAUTHORIZED` does not work. Use `SSL_CERT_FILE` and `CODEX_CA_CERTIFICATE` for TLS trust.
- The `gpt-5.4-codex` model ID does not exist. Use `gpt-5.4`.

---

## OpenCode

| | |
|---|---|
| **Sandbox image** | `base` |
| **Providers** | Any (via OpenAI-compatible endpoint) |
| **Terminal command** | `opencode` (new) or `opencode -c` (resume) |
| **Terminal setup** | Auto-discovers models, generates `/sandbox/opencode.json` |

### Auto-Configuration

The rcfile queries `inference.local/v1/models` and generates:

```json
{
  "provider": {
    "openai-compatible": {
      "npm": "@ai-sdk/openai-compatible",
      "options": {
        "baseURL": "https://inference.local/v1",
        "apiKey": "unused"
      },
      "models": { "<model-id>": { "name": "<model-id>" } }
    }
  }
}
```

### Known Issues

- OpenCode's SQLite database can corrupt if the process is force-killed (`kill -9`). The rcfile includes an auto-recovery check that deletes the database if it fails a `SELECT 1` probe.
- Session resume (`opencode -c`) works if the workspace PVC persists session data at `/sandbox/.local/share/opencode/`.

---

## GitHub Copilot CLI

| | |
|---|---|
| **Sandbox image** | `base` |
| **Providers** | Any (BYOK mode — no GitHub login needed) |
| **Terminal command** | `copilot` |
| **Terminal setup** | Sets `COPILOT_PROVIDER_BASE_URL` and auto-detects model |

### Auto-Configuration

```bash
COPILOT_PROVIDER_BASE_URL=https://inference.local/v1
COPILOT_PROVIDER_API_KEY=unused
COPILOT_MODEL=<auto-detected from inference.local/v1/models>
```

BYOK mode skips GitHub authentication entirely. The agent runs fully offline against `inference.local`.

---

## Pi

| | |
|---|---|
| **Sandbox image** | `pi` (`ghcr.io/nvidia/openshell-community/sandboxes/pi:latest`) |
| **Providers** | Any (via OpenAI-compatible endpoint) |
| **Terminal command** | `pi` |
| **Terminal setup** | Auto-generates `~/.pi/agent/models.json` |

### Auto-Configuration

The rcfile queries `inference.local/v1/models` and generates a Pi models config:

```json
{
  "providers": {
    "openshell": {
      "baseUrl": "https://inference.local/v1",
      "api": "openai-completions",
      "apiKey": "unused",
      "compat": {
        "supportsDeveloperRole": false,
        "supportsReasoningEffort": false
      },
      "models": [{ "id": "<model-id>" }]
    }
  }
}
```

Select the model inside Pi with the `/model` command.

---

## Hermes Agent

| | |
|---|---|
| **Sandbox image** | `quay.io/eformat/hermes-openshell-playground:latest` (custom) |
| **Providers** | OpenAI-compatible (MaaS, vLLM) |
| **Terminal command** | `hermes chat` |
| **Terminal setup** | Pre-creates directories, fixes permissions |

### Custom Image

The official `nousresearch/hermes-agent` image requires `CAP_NET_ADMIN` / `CAP_SYS_ADMIN` for its own network isolation, which conflicts with OpenShell's supervisor. The custom image (`images/Containerfile.hermes`) adds `iproute2` and sets up the sandbox user:

```dockerfile
FROM docker.io/nousresearch/hermes-agent:v2026.7.7.2
RUN apt-get update -qq && apt-get install -y -qq iproute2
RUN groupadd -g 1001 sandbox && useradd -m -u 1001 -g sandbox -s /bin/bash -d /sandbox sandbox
RUN install -d -o sandbox -g sandbox /workspace /sandbox /sandbox/.hermes
RUN chmod -R a+rX /opt/hermes && ln -sf /opt/hermes/.venv/bin/hermes /usr/local/bin/hermes
ENV HERMES_HOME=/sandbox/.hermes TERM=xterm-256color
```

### Auto-Configuration

The rcfile creates all Hermes directories (`cron`, `sessions`, `logs/curator`, `memories`, `profiles`, `hooks`, `skills`, etc.) with `chmod 777` to handle PVC ownership mismatches. `HERMES_HOME` is exported.

The gateway's inference config sets `model.provider: openai-api` and `model.default: <model>`, which Hermes reads on startup.

---

## Ollama

| | |
|---|---|
| **Sandbox image** | `ollama` (`ghcr.io/nvidia/openshell-community/sandboxes/ollama:latest`) |
| **Providers** | Any (via inference.local) + local Ollama models |
| **Terminal command** | `ollama` (interactive TUI) |
| **Terminal setup** | Configures Codex + OpenCode for inference.local |

### Bundled Agents

The Ollama sandbox includes Claude Code, Codex, and OpenCode pre-installed. The rcfile configures all three:

- **Codex**: `/sandbox/.codex/config.toml` with `supports_websockets = false`
- **OpenCode**: `/sandbox/opencode.json` with models from `inference.local`
- **Claude Code**: Via base env vars

### Local vs Remote Models

The Ollama server auto-starts inside the sandbox. Users can:

- **Pull local models**: `ollama pull qwen3:8b` (requires GPU via `--gpu` flag)
- **Use remote inference**: Agents route through `inference.local` to the gateway's provider

The Ollama TUI's "Chat with a model" option uses locally pulled models only. The agent launchers (Claude Code, Codex, OpenCode) use `inference.local`.

### Notes

For container environments without GPU, Ollama provides limited value — the same agents are available on `base` sandbox gateways with remote inference. Ollama is most useful with `openshell sandbox create --from ollama --gpu`.

---

## Agent Type Configuration

Agent types are defined in `src/utils/types.ts` (`AGENT_TYPES` array). Each entry specifies:

| Field | Purpose |
|-------|---------|
| `name` | Internal identifier (e.g., `claude`, `codex`) |
| `displayName` | UI display name |
| `sandbox` | The `--from` value for `openshell sandbox create` — a community name or full image ref |
| `models` | Suggested model IDs shown in the Model input datalist |

Terminal setup is in `src/components/SandboxTerminals.tsx` — the `agentSetup()` function returns agent-specific rcfile content based on the `agentType` string.

---

## Adding a New Agent

1. Add an entry to `AGENT_TYPES` in `src/utils/types.ts` with the sandbox image and model suggestions
2. Add a setup constant and switch case in `src/components/SandboxTerminals.tsx`
3. If the agent needs a custom sandbox image, create a Containerfile in `images/` and push to your registry
4. If the sandbox image is not a community name, use the full image reference in the `sandbox` field
5. Build and deploy the plugin
