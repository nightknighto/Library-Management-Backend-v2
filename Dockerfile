# Stage: base
FROM node:22.11.0-alpine AS base

ARG DATABASE_URL
ENV DATABASE_URL=${DATABASE_URL}

WORKDIR /app

# Copy the root package.json and package-lock.json files
COPY package*.json ./

# Install the dependencies with dev dependencies
RUN --mount=type=cache,target=/root/.npm npm install --force

# Copy the chosen app
COPY . .

# push the prisma schema to the database, seed the database, and generate the prisma client
RUN npm run prisma:push
RUN npm run prisma:seed
RUN npm run prisma:generate
RUN npm run prisma:generate -- --sql

# Build the shared packages
RUN npm run build

# --------------------------------------------
# Stage: Backend development
FROM node:22.11.0-alpine AS prod

WORKDIR /app

# Copy the root package.json and package-lock.json files
COPY package*.json ./

# Install production dependencies
RUN --mount=type=cache,target=/root/.npm npm install --force --omit=dev

COPY --from=base /app/node_modules/.prisma /app/node_modules/.prisma

COPY --from=base /app/dist ./dist

EXPOSE 3001

CMD ["node", "dist/index.js"]