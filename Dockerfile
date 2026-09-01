FROM node:22-alpine
WORKDIR /app
COPY scripts/analysis-gateway.cjs ./analysis-gateway.cjs
ENV PORT=8787 DATA_DIR=/app/data
RUN mkdir -p /app/data && chown node:node /app/data && apk add --no-cache unzip
VOLUME /app/data
EXPOSE 8787
USER node
CMD ["node", "analysis-gateway.cjs"]
