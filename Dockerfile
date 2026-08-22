FROM node:20-alpine

# Prisma's query engine needs OpenSSL on Alpine.
RUN apk add --no-cache openssl

# Documentation only: the production container runs with host networking, where
# published ports do not apply. The app binds to $HOST:$PORT instead.
EXPOSE 3000

WORKDIR /app

ENV NODE_ENV=production

COPY package.json package-lock.json* ./

# npm ci requires the tracked lockfile and gives a reproducible dependency tree.
# vite is retained despite --omit=dev because it is a required peer of
# @react-router/dev, which is a runtime dependency.
RUN npm ci --omit=dev && npm cache clean --force

COPY . .

# Generate the Prisma client into the image. This needs the schema, so it runs
# after COPY, and before the build because the server bundle imports the client.
# `prisma generate` does not need DATABASE_URL, so no build-time database value
# is baked into the image.
RUN npx prisma generate

RUN npm run build

# Serve only. Migrations are NOT run here: they execute as a separate one-off
# step in deploy/deploy.sh before this container is replaced, so a failed
# migration fails the deployment instead of crash-looping the container.
CMD ["npm", "run", "start"]
