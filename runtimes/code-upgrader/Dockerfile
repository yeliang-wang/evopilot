FROM node:22-alpine

RUN apk add --no-cache ca-certificates git openssh-client python3

WORKDIR /app
ENV EVOPILOT_RUN_MODE=prod
ENV EVOPILOT_CODE_UPGRADER_PORT=3000
ENV EVOPILOT_CODE_UPGRADER_DATA_ROOT=/var/lib/evopilot-code-upgrader

COPY package.json package-lock.json ./
COPY packages ./packages
COPY scripts ./scripts
RUN npm ci && npm run build --workspaces --if-present && npm prune --omit=dev
RUN rm -rf /usr/local/lib/node_modules/npm /usr/local/bin/npm /usr/local/bin/npx
ENV NODE_ENV=production

EXPOSE 3000
CMD ["node", "scripts/internal-code-upgrader.mjs"]
