# Dockerfile para React + Vite + Nginx
FROM node:20-alpine AS builder

WORKDIR /app

# Copiar solo package primero (mejor cache)
COPY package*.json ./

# Instalar dependencias
RUN npm ci

# Copiar todo el código
COPY . .

# Build de producción
RUN npm run build

# Stage 2: Nginx
FROM nginx:alpine

# Copiar archivos estáticos del build
COPY --from=builder /app/dist /usr/share/nginx/html

# Copiar configuración de nginx para React Router
RUN echo 'server { \
    listen 80; \
    server_name localhost; \
    root /usr/share/nginx/html; \
    index index.html; \
    location / { \
        try_files $uri $uri/ /index.html; \
    } \
}' > /etc/nginx/conf.d/default.conf

EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]
