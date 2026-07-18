IMG ?= quay.io/eformat/openshell-playground-plugin:latest
CHART_NAME ?= openshell-playground-plugin
NAMESPACE ?= openshell-playground-plugin

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

.PHONY: podman-push
podman-push: podman-build
	podman push $(IMG)

.PHONY: podman-push-nocompile
podman-push-nocompile: podman-build-nocompile
	podman push $(IMG)

.PHONY: helm-install
helm-install:
	helm upgrade --install $(CHART_NAME) chart/$(CHART_NAME) -n $(NAMESPACE) --create-namespace

.PHONY: helm-uninstall
helm-uninstall:
	helm uninstall $(CHART_NAME) -n $(NAMESPACE)

.PHONY: helm-template
helm-template:
	helm template $(CHART_NAME) chart/$(CHART_NAME) -n $(NAMESPACE)

.PHONY: clean
clean:
	rm -rf dist
	rm -f backend/backend
