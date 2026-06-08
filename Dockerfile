FROM node:20-alpine AS client-build
WORKDIR /app/client
COPY client/package*.json ./
RUN npm install
COPY client ./
RUN npm run build

FROM node:20-alpine AS server-build
WORKDIR /app/server
COPY server/package*.json ./
RUN npm install --omit=dev
COPY server ./

FROM node:20-alpine
ENV NODE_ENV=production
WORKDIR /app
COPY --from=server-build /app/server ./server
COPY --from=client-build /app/client/dist ./client/dist
EXPOSE 8080
CMD ["node", "server/src/index.js"]
