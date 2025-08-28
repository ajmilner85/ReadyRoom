# Use the official Node.js runtime as the base image
FROM node:20-alpine

# Set the working directory inside the container
WORKDIR /app

# Copy package files
COPY package*.json ./

# Install dependencies
RUN npm ci --only=production

# Copy the server code and supabaseClient
COPY . .

# Copy the Discord bot from parent directory
COPY ../SDOBot/discordBot.js ./discordBot.js

# Expose port 3001
EXPOSE 3001

# Command to run the server
CMD ["node", "index.js"]