# Generic image for every Go service. Build with:
#   docker build --build-arg SERVICE=identity --build-arg VERSION=0.1.0 .
# One Dockerfile for all services keeps the build DRY; the only variable
# part is which cmd/<SERVICE> gets compiled. The build stage runs on the
# builder's own platform and cross-compiles, so building linux/amd64 images
# on an arm64 laptop needs no emulation.

ARG GO_VERSION=1.26

FROM --platform=$BUILDPLATFORM golang:${GO_VERSION}-alpine AS build
ARG SERVICE
ARG VERSION=dev
ARG TARGETOS=linux
ARG TARGETARCH
WORKDIR /src
# Cache module downloads separately from source changes.
COPY go.mod go.sum ./
RUN --mount=type=cache,target=/go/pkg/mod go mod download
COPY . .
RUN --mount=type=cache,target=/go/pkg/mod --mount=type=cache,target=/root/.cache/go-build \
    test -n "${SERVICE}" && \
    CGO_ENABLED=0 GOOS=${TARGETOS} GOARCH=${TARGETARCH} go build \
      -trimpath -ldflags "-s -w -X main.version=${VERSION}" \
      -o /out/service ./cmd/${SERVICE}

# distroless: no shell, no package manager, runs as non-root (uid 65532).
# Time zone data is compiled into the binary (pkg/app imports time/tzdata).
FROM gcr.io/distroless/static-debian12:nonroot
ARG SERVICE
ARG VERSION=dev
LABEL org.opencontainers.image.title="shotlyst-${SERVICE}" \
      org.opencontainers.image.version="${VERSION}" \
      org.opencontainers.image.source="https://github.com/timkrebs/shotlyst"
COPY --from=build /out/service /service
USER 65532:65532
EXPOSE 8080
ENTRYPOINT ["/service"]
