FROM node:22

# Set the working directory inside the container
WORKDIR /usr/src/app

# Copy package.json and package-lock.json to the working directory
COPY package*.json ./
COPY prisma ./prisma/

# Install the application dependencies
RUN npm ci --only=production

# Copy the rest of the application files
COPY . .

# Build the NestJS application
RUN npm run build

# Expose the application port
EXPOSE 3000

# Command to run the application
CMD ["npm", "run", "start:prod"]

HEALTHCHECK  --interval=5m --timeout=3s \
  CMD curl --fail --silent http://localhost:3000/health/ || exit 1