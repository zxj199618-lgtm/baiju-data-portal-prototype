FROM node:22-alpine
WORKDIR /app
COPY scripts/analysis-gateway.cjs ./analysis-gateway.cjs
COPY scripts/gateway-auth.cjs ./gateway-auth.cjs
COPY scripts/numeric-check.cjs ./numeric-check.cjs
COPY scripts/attribution-calc.cjs ./attribution-calc.cjs
COPY scripts/analysis-tools.cjs ./analysis-tools.cjs
COPY scripts/usage-quota.cjs ./usage-quota.cjs
COPY scripts/semantic-layer.cjs ./semantic-layer.cjs
COPY scripts/feedback-store.cjs ./feedback-store.cjs
COPY scripts/org-store.cjs ./org-store.cjs
COPY semantic ./semantic
COPY index.html share.html ./
COPY assets ./assets
ENV PORT=8787 DATA_DIR=/app/data PUBLIC_DIR=/app
# 解压 Skill 包用的 unzip 来自基础镜像自带的 busybox（node:22-alpine 已包含），不要再 apk add：
# 国内服务器访问 Alpine 软件源经常超时，会让发版在构建阶段失败
RUN mkdir -p /app/data && chown node:node /app/data
VOLUME /app/data
EXPOSE 8787
USER node
CMD ["node", "analysis-gateway.cjs"]
