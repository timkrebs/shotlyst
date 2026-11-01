# Shotlyst — developer entrypoints. Every target is used by CI too, so
# keep them boring and deterministic.

SERVICES := identity gear planning sun media export
VERSION  ?= $(shell git describe --tags --always --dirty 2>/dev/null || echo dev)
REGISTRY ?= ghcr.io/timkrebs/shotlyst
SVC      ?= planning

.PHONY: dev test lint gen migrate build docker docker-all helm-lint clean

## dev: run the whole stack locally with hot reload (http://localhost:8080)
dev:
	docker compose up --build

## test: Go + web unit/integration tests (Postgres/MinIO via testcontainers)
test:
	go test ./... -count=1
	cd web && npm test -- --run

## lint: static checks incl. duplicated-code and doc-comment rules
lint:
	golangci-lint run ./...
	cd web && npm run lint && npm run typecheck

## gen: sqlc for every service + OpenAPI TypeScript clients
gen:
	@for s in $(SERVICES); do \
		if [ -f services/$$s/sqlc.yaml ]; then (cd services/$$s && sqlc generate); fi; \
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

## helm-lint: lint the chart and render it to catch template errors
helm-lint:
	helm lint deploy/helm/shotlyst
	helm template shotlyst deploy/helm/shotlyst > /dev/null

clean:
	rm -rf bin web/dist
