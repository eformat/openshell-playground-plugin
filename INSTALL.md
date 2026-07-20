# OpenShell Playground Plugin — Installation Guide

## Prerequisites

### OpenShift Cluster

- OpenShift 4.14+ with cluster-admin access
- `oc` CLI logged in as cluster-admin
- `helm` 3.x installed

### Agent Sandbox Operator

The plugin requires the Agent Sandbox Operator, which provides the sandbox CRDs.

Install via OperatorHub:

1. Open the OpenShift Console
2. Navigate to **Operators > OperatorHub**
3. Search for **Agent Sandbox Operator**
4. Click **Install** and follow the prompts (defaults are fine)
5. Wait for the operator to reach `Succeeded` state:

```bash
oc get csv -n agent-sandbox-system
```

Verify the CRDs exist:

```bash
oc get crd sandboxtemplates.extensions.agents.x-k8s.io
oc get crd sandboxwarmpools.extensions.agents.x-k8s.io
```

Both should return without error. If the CRDs are missing, the Helm chart will install but gateways and sandboxes will not function.

---

## Install the Helm Chart

Requires **cluster-admin**. The chart creates ClusterRoles, ClusterRoleBindings, a ConsolePlugin CR, and a privileged SCC binding.

```bash
helm upgrade --install openshell-playground-plugin \
  chart/openshell-playground-plugin \
  -n openshell-playground-plugin \
  --create-namespace
```

Or using the Makefile shortcut:

```bash
make helm-install
```

### What Gets Created

**Plugin namespace** (`openshell-playground-plugin`):

| Resource | Name | Purpose |
|----------|------|---------|
| Deployment | `openshell-playground-plugin` | Go backend + static frontend assets |
| Service | `openshell-playground-plugin` | ClusterIP on port 9443 with auto-generated TLS serving cert |
| ServiceAccount | `openshell-playground-plugin` | Plugin identity for K8s API access |
| ConsolePlugin | `openshell-playground-plugin` | Registers the plugin with the OpenShift Console |
| Job (hook) | `openshell-playground-plugin-enable` | Patches the console operator to enable the plugin |

**Cluster-scoped RBAC** (3 ClusterRoles + 3 ClusterRoleBindings):

| ClusterRole | Grants |
|-------------|--------|
| `...-enable` | Patch `consoles.operator.openshift.io` (enable the plugin) |
| `...-auth` | Create TokenReviews and SubjectAccessReviews (user auth validation) |
| `...-openshell` | List namespaces/pods, exec into pods, manage sandbox CRDs, create/delete ClusterRoleBindings at runtime |

### Verify Installation

```bash
# Plugin pod running
oc get pods -n openshell-playground-plugin

# ConsolePlugin registered
oc get consoleplugin openshell-playground-plugin

# Plugin enabled in console
oc get consoles.operator.openshift.io cluster -o jsonpath='{.spec.plugins}'
```

Refresh the OpenShift Console. Navigate to **OpenShell > Playground** in the left navigation.

---

## Configuration Overrides

Key `values.yaml` settings:

```yaml
# Plugin container image
image:
  repository: quay.io/eformat/openshell-playground-plugin
  tag: latest

# Gateway defaults (used by the Helm-managed gateway, if enabled)
gateway:
  enabled: true
  namespace: openshell-playground
  image:
    repository: quay.io/eformat/openshell-gateway
    tag: v0.0.85

# Pre-deploy a SandboxTemplate (optional)
sandboxTemplate:
  enabled: true
  name: hermes-agent
  image: quay.io/eformat/hermes-openshell:latest
  supervisorImage: quay.io/eformat/openshell-supervisor:v0.0.85

# Pre-deploy a warm pool (optional, disabled by default)
warmPool:
  enabled: false
  replicas: 1
```

Override at install time:

```bash
helm upgrade --install openshell-playground-plugin \
  chart/openshell-playground-plugin \
  -n openshell-playground-plugin \
  --create-namespace \
  --set gateway.enabled=false \
  --set sandboxTemplate.enabled=false
```

---

## Security Notes

- **Privileged SCC**: Sandbox pods run with `system:openshift:scc:privileged` to support OpenShell's network namespace isolation and supervisor binary. This is the most security-sensitive permission.
- **Runtime ClusterRoleBindings**: The plugin SA creates ClusterRoleBindings dynamically when users deploy gateways to new namespaces. This grants the gateway SA permissions to manage sandbox CRDs.
- **User authentication**: All API requests pass through the OpenShift Console proxy with `UserToken` authorization. The plugin backend uses the logged-in user's token for namespace-scoped operations and its own SA token only for cluster-scoped operations (ClusterRoleBindings, SCC bindings).

---

## Post-Install: Using the Plugin

1. Open the OpenShift Console and navigate to **OpenShell > Playground**
2. Select a namespace from the dropdown
3. Click **+ Gateway** to deploy a gateway for an agent type (Claude, Codex, OpenCode, Copilot, Pi, Hermes)
4. Register a provider on the gateway (Anthropic, OpenAI, Google Vertex AI)
5. Set the model and click **Deploy Sandbox**
6. Click **Terminal** on a running sandbox to open an interactive shell
7. The terminal auto-configures environment variables for the agent type (TLS certs, proxy, inference endpoint)

### Supported Agent Types

| Agent | Sandbox Image | Notes |
|-------|--------------|-------|
| Claude Code | `base` | Works with Anthropic or Vertex AI provider |
| Codex | `base` | OpenAI provider, auto-generates config.toml |
| OpenCode | `base` | Auto-discovers models, generates opencode.json |
| Copilot | `base` | BYOK mode via COPILOT_PROVIDER_BASE_URL |
| Pi | `pi` | Auto-generates ~/.pi/agent/models.json |
| Hermes | custom image | Uses quay.io/eformat/hermes-openshell-playground:latest |
| Ollama | `ollama` | Bundled Ollama server + Claude Code + Codex |

---

## Uninstall

```bash
helm uninstall openshell-playground-plugin -n openshell-playground-plugin
oc delete namespace openshell-playground-plugin
```

To also remove gateways deployed by users, delete their namespaces or the `openshell-*` StatefulSets/Services within them.
