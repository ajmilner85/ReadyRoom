# Use the official Node.js runtime as the base image
FROM node:20-alpine

# Set the working directory inside the container
WORKDIR /app

# Copy package files
COPY package*.json ./

# Install dependencies
RUN npm ci --only=production

# Copy all application code
COPY . .

# Expose port 3001 for the HTTP server
EXPOSE 3001

# Command to run the combined server (which includes the Discord bot)
CMD ["node", "index.js"]