# syntax=docker/dockerfile:1
#
# One OpenSwarm workflow run, then exit. Build context is the REPO ROOT, not this
# directory, because the image needs backend/ and requirements.lock:
#
#   docker build --platform linux/amd64 -f openswarm-runner/Dockerfile -t openswarm-runner .
#
# Layout the image commits to (all three are load-bearing, backend code resolves
# them with zero changes when OPENSWARM_PACKAGED=1):
#   /app/backend      the FastAPI orchestrator
#   /app/router       9router's standalone server, found by p_find_9router_dir()
#   /app/python-env   UV_PYTHON target probed by tools_lib/mcp_config.py

ARG PYTHON_VERSION=3.13
ARG NODE_VERSION=20
ARG ROUTER_VERSION=0.3.60
ARG UV_VERSION=0.11.8

FROM node:${NODE_VERSION}-bookworm-slim AS node

# 9router 0.3.60 is pure JavaScript; --ignore-scripts skips a postinstall that only rebuilds a native addon the standalone server never loads.
FROM node AS router
ARG ROUTER_VERSION
WORKDIR /stage
RUN printf '{"name":"router-stage","version":"0.0.0","private":true}\n' > package.json \
 && npm install "9router@${ROUTER_VERSION}" --no-save --no-audit --no-fund --silent --ignore-scripts \
 && test -f node_modules/9router/app/server.js \
 && test -z "$(find node_modules/9router -name '*.node' -print -quit)"

FROM python:${PYTHON_VERSION}-slim-bookworm AS uv
ARG UV_VERSION
ARG TARGETARCH
RUN set -eux; \
    apt-get update && apt-get install -y --no-install-recommends curl ca-certificates; \
    case "${TARGETARCH}" in \
      amd64) triple=x86_64-unknown-linux-gnu; sha=56dd1b66701ecb62fe896abb919444e4b83c5e8645cca953e6ddd496ff8a0feb ;; \
      arm64) triple=aarch64-unknown-linux-gnu; sha=eee8dd658d20e5ac85fec9c2326b6cbc9d83a1eef09ef07433e58698ac849591 ;; \
      *) echo "unsupported TARGETARCH ${TARGETARCH}" >&2; exit 1 ;; \
    esac; \
    curl -fsSL -o /tmp/uv.tar.gz "https://github.com/astral-sh/uv/releases/download/${UV_VERSION}/uv-${triple}.tar.gz"; \
    echo "${sha}  /tmp/uv.tar.gz" | sha256sum -c -; \
    mkdir -p /stage; \
    tar -xzf /tmp/uv.tar.gz -C /stage --strip-components=1

# Wheels only: the runtime image ships no compiler, so a source build here is a build-time failure rather than a 3am surprise.
FROM python:${PYTHON_VERSION}-slim-bookworm AS pydeps
COPY backend/requirements.lock /tmp/requirements.lock
RUN pip install --no-cache-dir --require-hashes --only-binary=:all: \
      --prefix=/opt/pydeps -r /tmp/requirements.lock

FROM python:${PYTHON_VERSION}-slim-bookworm

RUN set -eux; \
    apt-get update; \
    apt-get install -y --no-install-recommends git ca-certificates; \
    rm -rf /var/lib/apt/lists/*

COPY --from=node /usr/local/bin/node /usr/local/bin/node
COPY --from=pydeps /opt/pydeps /usr/local
COPY --from=router /stage/node_modules/9router/app /app/router

COPY backend /app/backend
COPY openswarm-runner/runner /app/runner

# After backend/, never before: mcp_config.resolve_command probes uv-bin last, and the repo's own copy is Mach-O.
COPY --from=uv /stage/uv /app/backend/uv-bin/uv
COPY --from=uv /stage/uvx /app/backend/uv-bin/uvx

RUN set -eux; \
    if ls /app/backend/.env* >/dev/null 2>&1; then echo "a dotenv reached the image; fix Dockerfile.dockerignore" >&2; exit 1; fi; \
    mkdir -p /app/python-env/bin; \
    ln -s /usr/local/bin/python3 /app/python-env/bin/python3; \
    find /app/backend -name '__pycache__' -type d -prune -exec rm -rf {} +; \
    useradd --create-home --uid 10001 --shell /usr/sbin/nologin runner; \
    mkdir -p /data; \
    chown -R runner:runner /app /data

USER runner
WORKDIR /app
ENV HOME=/home/runner \
    PYTHONPATH=/app \
    PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1 \
    OPENSWARM_HEADLESS=1 \
    OPENSWARM_PACKAGED=1 \
    OPENSWARM_DATA_ROOT=/data/openswarm \
    OPENSWARM_HOST=127.0.0.1 \
    OPENSWARM_PORT=8324 \
    DATA_DIR=/data/9router \
    NODE_ENV=production

ENTRYPOINT ["python3", "-m", "runner.main"]
