# Production image for the PWA: build with Node, serve the static bundle
# with unprivileged nginx on :8080 (same port as every Go service, so the
# Helm template and probes stay uniform). Build context is web/.
FROM --platform=$BUILDPLATFORM node:22-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npm run build

FROM nginxinc/nginx-unprivileged:1.27-alpine
ARG VERSION=dev
LABEL org.opencontainers.image.title="shotlyst-web" \
      org.opencontainers.image.version="${VERSION}" \
      org.opencontainers.image.source="https://github.com/timkrebs/shotlyst"
COPY docker/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/dist /usr/share/nginx/html
EXPOSE 8080
