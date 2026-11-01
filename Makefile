# Shotlyst — developer entrypoints. Every target is used by CI too, so
# keep them boring and deterministic.

SERVICES := identity gear planning sun media export
VERSION  ?= $(shell git describe --tags --always --dirty 2>/dev/null || echo dev)
REGISTRY ?= ghcr.io/timkrebs/shotlyst
SVC      ?= planning
# web/node_modules can contain Go packages; keep them out of test runs.
GO_PKGS   = $(shell go list ./... | grep -v /node_modules/)
# Pinned code generator, run through the Go toolchain so nobody needs a
# global install and CI uses the same version.
SQLC     := go run github.com/sqlc-dev/sqlc/cmd/sqlc@v1.31.1

.PHONY: dev test lint gen migrate build docker docker-all helm-lint helm-snapshot clean

## dev: run the whole stack locally with hot reload (http://localhost:8080)
dev:
	docker compose up --build

## test: Go + web unit/integration tests (Postgres/MinIO via testcontainers)
# The testcontainers reaper is disabled because it fails on Podman; dbtest
# terminates its own container, so nothing leaks on Docker either.
test:
	TESTCONTAINERS_RYUK_DISABLED=true go test -count=1 $(GO_PKGS)
	cd web && npm test -- --run

## lint: static checks incl. duplicated-code and doc-comment rules
lint:
	golangci-lint run ./...
	cd web && npm run lint && npm run typecheck

## gen: sqlc for every service + OpenAPI TypeScript clients
gen:
	@for s in $(SERVICES); do \
		if [ -f services/$$s/sqlc.yaml ]; then (cd services/$$s && $(SQLC) generate) || exit 1; fi; \
	done
	cd web && npm run gen:api

## migrate: apply migrations for one service (SVC=planning)
migrate:
	go run ./cmd/$(SVC) migrate

## build: all service binaries + web bundle
build:
	@for s in $(SERVICES); do \
		CGO_ENABLED=0 go build -ldflags "-X main.version=$(VERSION)" -o bin/$$s ./cmd/$$s; \
	done
	cd web && npm run build

## docker: build one service image (SVC=planning)
docker:
	docker build --build-arg SERVICE=$(SVC) --build-arg VERSION=$(VERSION) \
		-t $(REGISTRY)-$(SVC):$(VERSION) .

## docker-all: build every service image
docker-all:
	@for s in $(SERVICES); do $(MAKE) docker SVC=$$s; done

CHART     := deploy/helm/shotlyst
SNAPSHOT  := $(CHART)/ci/snapshot.yaml
# Render as if the optional CRDs (CNPG, Prometheus Operator) were installed,
# so the snapshot covers every template.
HELM_TPL  := helm template shotlyst $(CHART) -n shotlyst -f $(CHART)/ci/test-values.yaml \
	--api-versions postgresql.cnpg.io/v1 \
	--api-versions monitoring.coreos.com/v1/ServiceMonitor \
	--api-versions monitoring.coreos.com/v1/PrometheusRule

## helm-lint: lint the chart and diff the rendered output against the snapshot
# (snapshot rendered with Helm 3 as in CI; -B ignores the blank lines Helm 4
# adds between documents, so the target works with either locally)
helm-lint:
	helm lint $(CHART) -f $(CHART)/ci/test-values.yaml
	$(HELM_TPL) | diff -uB $(SNAPSHOT) - || { echo "chart output changed; review and run 'make helm-snapshot'"; exit 1; }

## helm-snapshot: accept the current chart output as the new snapshot
helm-snapshot:
	$(HELM_TPL) > $(SNAPSHOT)

clean:
	rm -rf bin web/dist
