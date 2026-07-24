# ---------- Etapa 1: build & test ----------
FROM node:20.19-alpine AS build
WORKDIR /app

# Copiamos solo los manifiestos primero (aprovecha cache de Docker)
COPY package.json package-lock.json ./
RUN npm ci

# Copiamos el resto del codigo
COPY . .

# Si las pruebas fallan, el build entero falla aqui y no sigue
RUN npm test

# ---------- Etapa 2: imagen final minima ----------
FROM node:20.19-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production

# Copiamos solo las dependencias de produccion (mas liviano)
COPY package.json package-lock.json ./
RUN npm ci --omit=dev

# Copiamos solo el codigo necesario para ejecutar, incluida public/
COPY --from=build /app/server.js ./server.js
COPY --from=build /app/db.js ./db.js
COPY --from=build /app/public ./public

EXPOSE 3000
CMD ["node", "server.js"]