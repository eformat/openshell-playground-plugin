IMG ?= quay.io/eformat/openshell-playground-plugin:0.0.95-dev
CHART_NAME ?= openshell-playground-plugin
NAMESPACE ?= openshell-playground-plugin
OPENSHELL_SRC ?= $(HOME)/git/OpenShell
GATEWAY_IMG ?= quay.io/eformat/openshell-gateway:0.0.95-dev
DEPLOYER_IMG ?= quay.io/eformat/openshell-deployer:0.0.95-dev

.PHONY: compile
compile:
	yarn build

.PHONY: go-build
go-build:
	cd backend && CGO_ENABLED=0 go build -o backend .

.PHONY: podman-login
podman-login:
	podman login quay.io

.PHONY: podman-build
podman-build: compile
	podman build -t $(IMG) .

.PHONY: podman-build-nocompile
podman-build-nocompile:
	podman build -t $(IMG) .

.PHONY: podman-build-nocache
podman-build-nocache: compile
	podman build --no-cache -t $(IMG) .

.PHONY: podman-push
podman-push: podman-build
	podman push $(IMG)

.PHONY: podman-push-nocompile
podman-push-nocompile: podman-build-nocompile
	podman push $(IMG)

.PHONY: podman-push-nocache
podman-push-nocache: podman-build-nocache
	podman push $(IMG)

.PHONY: deploy
deploy: podman-push-nocache
	oc rollout restart deployment/$(CHART_NAME) -n $(NAMESPACE)
	oc rollout status deployment/$(CHART_NAME) -n $(NAMESPACE) --timeout=60s

.PHONY: helm-install
helm-install:
	helm upgrade --install $(CHART_NAME) chart/$(CHART_NAME) -n $(NAMESPACE) --create-namespace

.PHONY: helm-uninstall
helm-uninstall:
	helm uninstall $(CHART_NAME) -n $(NAMESPACE)

.PHONY: helm-template
helm-template:
	helm template $(CHART_NAME) chart/$(CHART_NAME) -n $(NAMESPACE)

# Build the openshell-gateway binary from source and push as GATEWAY_IMG.
# Requires a libstdc++.so symlink workaround (no dev package on this host).
# Source: /home/mike/git/data-agent-ctf/Makefile build-gateway target.
.PHONY: build-gateway
build-gateway:
	mkdir -p /tmp/custom-libs && ln -sf /usr/lib64/libstdc++.so.6 /tmp/custom-libs/libstdc++.so
	cd $(OPENSHELL_SRC) && RUSTFLAGS="-L /tmp/custom-libs" cargo build --release -p openshell-server
	cp $(OPENSHELL_SRC)/target/release/openshell-gateway /tmp/openshell-gateway
	cp /usr/lib64/libz3.so.4.15 /tmp/libz3.so.4.15
	cp /usr/lib64/libgmp.so.10 /tmp/libgmp.so.10
	printf 'FROM gcr.io/distroless/cc-debian13:latest\nWORKDIR /app\nCOPY openshell-gateway /usr/local/bin/openshell-gateway\nCOPY libz3.so.4.15 /usr/lib/x86_64-linux-gnu/libz3.so.4.15\nCOPY libgmp.so.10 /usr/lib/x86_64-linux-gnu/libgmp.so.10\nUSER 1000:1000\nEXPOSE 8080\nENTRYPOINT ["/usr/local/bin/openshell-gateway"]\nCMD ["--bind-address", "0.0.0.0", "--port", "8080"]\n' > /tmp/Containerfile.gateway
	podman build --no-cache -t $(GATEWAY_IMG) -f /tmp/Containerfile.gateway /tmp/
	podman push $(GATEWAY_IMG)

.PHONY: deploy-gateway
deploy-gateway: build-gateway
	oc delete pod -n demo -l app=openshell --ignore-not-found
	oc rollout status statefulset/openshell -n demo --timeout=90s

# Build the openshell CLI binary and push updated deployer image.
# Uses v0.0.94 as base to preserve ttyd; falls back to building from ubi10
# with ttyd downloaded from GitHub if v0.0.94 is not available on the registry.
.PHONY: build-deployer
build-deployer:
	mkdir -p /tmp/custom-libs && ln -sf /usr/lib64/libstdc++.so.6 /tmp/custom-libs/libstdc++.so
	cd $(OPENSHELL_SRC) && RUSTFLAGS="-L /tmp/custom-libs" cargo build --release -p openshell-cli
	cp $(OPENSHELL_SRC)/target/release/openshell /tmp/openshell
	cp /usr/lib64/libz3.so.4.15 /tmp/libz3.so.4.15
	cp /usr/lib64/libgmp.so.10 /tmp/libgmp.so.10
	printf 'FROM registry.access.redhat.com/ubi10/ubi-minimal\nCOPY openshell /usr/bin/openshell\nCOPY libz3.so.4.15 /usr/lib64/libz3.so.4.15\nCOPY libgmp.so.10 /usr/lib64/libgmp.so.10\nRUN microdnf install -y --nodocs bash python3 tar gzip && microdnf clean all && curl -sL "https://mirror.openshift.com/pub/openshift-v4/x86_64/clients/ocp/stable-4.21/openshift-client-linux.tar.gz" | tar xz -C /usr/bin oc kubectl && curl -fsSL "https://github.com/tsl0922/ttyd/releases/download/1.7.7/ttyd.x86_64" -o /usr/bin/ttyd && chmod +x /usr/bin/ttyd\n' > /tmp/Containerfile.deployer
	podman build --no-cache -t $(DEPLOYER_IMG) -f /tmp/Containerfile.deployer /tmp/
	podman push $(DEPLOYER_IMG)

.PHONY: clean
clean:
	rm -rf dist
	rm -f backend/backend
