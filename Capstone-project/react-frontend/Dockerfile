FROM node:20-slim

WORKDIR /app

# Copy package files and install
COPY package*.json ./
RUN npm install

# Copy application code
COPY . .

# Expose Vite dev port
EXPOSE 5173

# Run in dev mode with host flag to allow access from outside the container
CMD ["npm", "run", "dev", "--", "--host"]
