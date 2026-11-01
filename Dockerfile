# Generic image for every Go service. Build with:
#   docker build --build-arg SERVICE=planning --build-arg VERSION=0.1.0 .
# One Dockerfile for all services keeps the build DRY; the only variable
# part is which cmd/<SERVICE> gets compiled.

ARG GO_VERSION=1.23

FROM golang:${GO_VERSION}-alpine AS build
ARG SERVICE
ARG VERSION=dev
WORKDIR /src
# Cache module downloads separately from source changes.
COPY go.mod go.sum ./
RUN go mod download
COPY . .
RUN CGO_ENABLED=0 GOOS=linux go build \
      -trimpath -ldflags "-s -w -X main.version=${VERSION}" \
      -o /out/service ./cmd/${SERVICE}

# distroless: no shell, no package manager, runs as non-root (uid 65532).
FROM gcr.io/distroless/static-debian12:nonroot
ARG SERVICE
LABEL org.opencontainers.image.title="shotlyst-${SERVICE}"
COPY --from=build /out/service /service
EXPOSE 8080
ENTRYPOINT ["/service"]
