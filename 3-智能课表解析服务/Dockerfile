FROM node:22-alpine
WORKDIR /app
RUN apk add --no-cache poppler-utils
COPY package*.json ./
RUN npm ci --omit=dev
COPY server.cjs ./
ENV PORT=8788
EXPOSE 8788
CMD ["node", "server.cjs"]
