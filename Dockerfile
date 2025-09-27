from node:22-alpine

WORKDIR /app

COPY package*.json ./
COPY prisma ./prisma/

RUN npm install


COPY . .

RUN npm run build

EXPOSE 3000

ENV PORT=3000
ENV NODE_ENV=production

CMD ["npm", "run", "start:prod"]