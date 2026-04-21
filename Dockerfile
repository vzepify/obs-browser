# Use Node.js LTS as base image
FROM node:18-alpine

# Install FFmpeg for streaming support
RUN apk add --no-cache ffmpeg

# Set working directory
WORKDIR /app

# Copy package files
COPY package*.json ./

# Install dependencies
RUN npm install --production

# Copy application files
COPY . .

# Expose port (Railway will override this with $PORT)
EXPOSE 3000

# Start the application
CMD ["node", "server.js"]
