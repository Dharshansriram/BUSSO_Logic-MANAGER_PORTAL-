
FROM node:22-bookworm-slim

WORKDIR /app

# Install Node dependencies
COPY package*.json ./
RUN npm ci

# Copy project source
COPY . .

# Build React frontend
RUN npm run build

# Production environment
ENV NODE_ENV=production

# Remove development dependencies
RUN npm prune --omit=dev

# Start Express application
CMD ["npm", "start"]
