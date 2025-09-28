# FROM node:22-alpine

# WORKDIR /app

# COPY package*.json ./
# COPY prisma ./prisma/

# RUN npm install


# COPY . .

# RUN npm run build

# EXPOSE 3000

# ENV PORT=3000
# ENV NODE_ENV=production

# CMD ["npm", "run", "start:prod"]

# Use the official Node.js image as the base image
FROM node:20

# Set the working directory inside the container
WORKDIR /usr/src/app

# Copy package.json and package-lock.json to the working directory
COPY package*.json ./
COPY prisma ./prisma/

# Install the application dependencies
RUN npm install

# Copy the rest of the application files
COPY . .

# Build the NestJS application
RUN npm run build

# Expose the application port
EXPOSE 3000

# Command to run the application
CMD ["node", "dist/src/main"]