# backend/Dockerfile
# ✅ Usar Debian Slim (glibc compatible con Oracle Instant Client)
FROM node:20-slim

# Instalar dependencias del sistema para Oracle Thick Mode + herramientas útiles
RUN apt-get update && apt-get install -y \
    libaio1 \
    libnsl2 \
    libnss3 \
    libxi6 \
    libxtst6 \
    curl \
    ca-certificates \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Copiar package.json primero para aprovechar caché de npm
COPY package*.json ./

# Instalar dependencias de Node (incluye oracledb)
RUN npm install --production

# ✅ Variables de entorno para Oracle Thick Mode
ENV ORACLE_CLIENT_LIB_DIR=/opt/oracle/instantclient
ENV LD_LIBRARY_PATH=/opt/oracle/instantclient:${LD_LIBRARY_PATH}
ENV PATH=/opt/oracle/instantclient:${PATH}

# Copiar código de la aplicación
COPY src ./src
COPY config ./config

# Crear directorio para assets
RUN mkdir -p /app/assets

EXPOSE 4000

# Comando de inicio
CMD ["node", "src/server.js"]

