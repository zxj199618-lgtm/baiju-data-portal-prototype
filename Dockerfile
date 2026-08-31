FROM node:22-alpine
WORKDIR /app
COPY scripts/analysis-gateway.cjs ./analysis-gateway.cjs
ENV PORT=8787
EXPOSE 8787
USER node
CMD ["node", "analysis-gateway.cjs"]
