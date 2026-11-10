# Keine npm-Abhängigkeiten: Es wird nur Node.js benötigt.
FROM node:22-slim

ENV NODE_ENV=production \
    PORT=3000 \
    DB_FILE=/data/tischbuchung.db

WORKDIR /app
COPY package.json ./
COPY src ./src
COPY public ./public

# Die SQLite-Datei liegt in /data. Dort muss ein dauerhafter Speicher eingehängt sein,
# sonst gehen alle Reservierungen bei jedem Neustart verloren.
RUN mkdir -p /data && chown node:node /data
VOLUME /data
USER node

EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s \
  CMD node -e "fetch('http://127.0.0.1:'+process.env.PORT+'/healthz').then(r=>process.exit(r.ok?0:1),()=>process.exit(1))"

CMD ["node", "--disable-warning=ExperimentalWarning", "src/index.js"]
