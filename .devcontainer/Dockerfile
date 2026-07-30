FROM node:24-bookworm-slim

# git lo necesita el devcontainer para su integración de control de versiones;
# ca-certificates, el registro de pnpm sobre HTTPS.
RUN apt-get update \
 && apt-get install -y --no-install-recommends git ca-certificates \
 && rm -rf /var/lib/apt/lists/*

RUN corepack enable

WORKDIR /workspace
