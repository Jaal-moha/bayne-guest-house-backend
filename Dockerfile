FROM node:22

# Set the working directory inside the container
WORKDIR /usr/src/app

# Copy package.json and package-lock.json to the working directory
COPY package*.json ./
COPY prisma ./prisma/

# Install the application dependencies
RUN npm ci

# Copy the rest of the application files
COPY . .

# Build the NestJS application
RUN npm run build

# Expose the application port
EXPOSE 3000

# Command to run the application
CMD ["npm", "run", "start:prod"]

HEALTHCHECK --interval=5m --timeout=3s \
  CMD node -e "fetch('http://localhost:' + (process.env.PORT || '3000') + '/health').then((response) => process.exit(response.ok ? 0 : 1)).catch(() => process.exit(1))"
