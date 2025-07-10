# ---- Fase única, Node LTS ----
FROM node:20-slim

# Cria diretório de trabalho
WORKDIR /app

# Copia apenas package.json/package-lock p/ cache de dependências
COPY package*.json ./

# Instala só dependências de produção
RUN npm ci --omit=dev

# Copia o restante do código
COPY . .

# Porta padrão do Cloud Run
EXPOSE 8080

# Comando de inicialização
CMD ["npm", "start"]
