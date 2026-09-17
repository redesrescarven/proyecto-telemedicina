# Stage 1: Build the React application with Vite
FROM node:20-alpine as build

# Establecer el directorio de trabajo
WORKDIR /app

# Copiar package.json y package-lock.json
COPY package*.json ./

# Instalar dependencias
RUN npm ci --legacy-peer-deps

# Copiar el resto del código de la aplicación
COPY . .

# Construir la aplicación React para producción con Vite
RUN npm run build

# Stage 2: Serve the application with Nginx
FROM nginx:alpine

# Copiar configuración de Nginx optimizada para SPA
COPY nginx.conf /etc/nginx/conf.d/default.conf

# Copiar los archivos construidos de Vite al directorio de Nginx
COPY --from=build /app/dist /usr/share/nginx/html

# Exponer el puerto 80
EXPOSE 80

# Comando para iniciar Nginx
CMD ["nginx", "-g", "daemon off;"]

