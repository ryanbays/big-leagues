# Use official Node image
FROM node:lts-alpine3.24

# Set working directory inside container
WORKDIR /app

# Copy dependency files first (better caching)
COPY package*.json ./

# Install dependencies
RUN npm install --production

# Copy rest of the project
COPY . .

# Start the app
CMD ["node", "index.js"]