# openshell-playground-plugin

An OpenShift Console dynamic plugin for deploying and interacting with [OpenShell](https://docs.nvidia.com/openshell/latest/) agent sandboxes. Adds the **Playground**, **Governance**, and **Help** pages to the OpenShift web console under the **OpenShell** sidebar section.

## Prerequisites

- OpenShift 4.12+ cluster with `oc` configured (`oc whoami` should succeed)
- OpenShell operator installed in the cluster
- [Helm 3](https://helm.sh/docs/intro/install/) — for first-time installation
- [Podman](https://podman.io/) — only needed when building from source
- [Node.js](https://nodejs.org/) 18+ and [Yarn](https://classic.yarnpkg.com/) — only needed when building from source

---

## Quick Install (pre-built image)

The plugin is published to `quay.io/eformat/openshell-playground-plugin`. Install it with Helm:

```bash
helm upgrade --install openshell-playground-plugin chart/openshell-playground-plugin \
  -n openshell-playground-plugin \
  --create-namespace
```

This creates the namespace, deploys the plugin server, registers the `ConsolePlugin` resource, and enables the plugin in the OpenShift console.

To verify:

```bash
oc rollout status deployment/openshell-playground-plugin \
  -n openshell-playground-plugin --timeout=60s
```

The **OpenShell** section appears in the console sidebar after the plugin loads (may take 30–60 seconds for the console to pick up the new plugin).

---

## Build and Deploy from Source

### 1. Configure the image target

Edit the `IMG` variable at the top of `Makefile` to point to a registry you can push to:

```makefile
IMG ?= quay.io/<your-org>/openshell-playground-plugin:latest
```

Update `chart/openshell-playground-plugin/values.yaml` to match:

```yaml
image:
  repository: quay.io/<your-org>/openshell-playground-plugin
  tag: latest
```

### 2. Log in to the registry

```bash
podman login quay.io
```

### 3. Build, push, and roll out

```bash
make deploy
```

This runs the full pipeline:

1. **`yarn build`** — compiles TypeScript and bundles the frontend into `dist/`
2. **`podman build`** — builds a two-stage container image (Go 1.23 backend + UBI 9 runtime)
3. **`podman push`** — pushes the image to the registry
4. **`oc rollout restart`** — triggers a rolling restart of the plugin deployment
5. **`oc rollout status`** — waits for the new pod to become ready

### 4. First-time Helm install (if not already installed)

```bash
make helm-install
```

Subsequent code changes only need `make deploy` — the deployment restarts automatically.

---

## Development Workflow

| Command | Description |
|---|---|
| `yarn build` | Compile TypeScript frontend only |
| `make go-build` | Compile Go backend binary locally (requires Go 1.22+) |
| `make podman-build` | Build container image without pushing |
| `make podman-push` | Build and push without rolling out |
| `make deploy` | Full pipeline: build → push → rollout restart |
| `make helm-install` | First-time Helm install |
| `make helm-uninstall` | Remove the plugin from the cluster |

---

## Project Structure

```
chart/                  Helm chart for cluster deployment
backend/                Go reverse-proxy server (serves frontend + proxies kubectl exec)
src/
  components/           React page and UI components
  utils/                API client and TypeScript types
  docs/                 Markdown help content
console-extensions.json Plugin route and navigation declarations
Containerfile           Two-stage container build (Go builder + UBI 9 runtime)
```

---

## Architecture

The plugin is an OpenShift Console dynamic plugin. It consists of:

- **Frontend** — React + PatternFly v6, bundled by Webpack and served as static assets from the plugin pod
- **Backend** — A Go HTTP server that proxies requests to the Kubernetes API, executes `openshell` CLI commands inside the gateway pod via `kubectl exec`, and serves the frontend bundle over TLS

All API calls from the browser go to `/api/proxy/plugin/openshell-playground-plugin/backend/api/...`, which the console proxies to the plugin pod's backend server.

The **Governance** page surfaces OPA network policy state by exec-ing `openshell policy list` and `openshell rule get` into the gateway pod, then parsing the text output.
