ARG RUN

FROM node:24-alpine@sha256:5fa278c599dbba0c8f873d8717d50ecbb57c5ae6a53b7ab240c25135e0b65995 as builderenv

WORKDIR /app

# some packages require a build step
RUN apk add --no-cache build-base

# install dependencies
COPY package.json /app/package.json
COPY yarn.lock /app/yarn.lock
RUN yarn

# build the app
COPY . /app
RUN yarn build

# remove devDependencies, keep only used dependencies
RUN yarn install --frozen-lockfile --production

########################## END OF BUILD STAGE ##########################

FROM node:24-alpine@sha256:5fa278c599dbba0c8f873d8717d50ecbb57c5ae6a53b7ab240c25135e0b65995

# NODE_ENV is used to configure some runtime options, like JSON logger
ENV NODE_ENV production

# We use Tini to handle signals and PID1 (https://github.com/krallin/tini, read why here https://github.com/krallin/tini/issues/8)
RUN apk add --no-cache tini

WORKDIR /app
# Copy only what the runtime needs: the compiled app, production dependencies, and the
# default config. Copying the whole build stage would bake the source tree (and anything
# else present at build time) into the shipped image.
COPY --from=builderenv /app/package.json /app/package.json
COPY --from=builderenv /app/node_modules /app/node_modules
COPY --from=builderenv /app/dist /app/dist
COPY --from=builderenv /app/.env.default /app/.env.default

# Run as the unprivileged user provided by the node image; the service only needs to
# listen on its port and read the files copied above.
USER node

# Please _DO NOT_ use a custom ENTRYPOINT because it may prevent signals
# (i.e. SIGTERM) to reach the service
# Read more here: https://aws.amazon.com/blogs/containers/graceful-shutdowns-with-ecs/
#            and: https://www.ctl.io/developers/blog/post/gracefully-stopping-docker-containers/
ENTRYPOINT ["/sbin/tini", "--"]
# Run the program under Tini
CMD [ "/usr/local/bin/node", "--trace-warnings", "--abort-on-uncaught-exception", "--unhandled-rejections=strict", "dist/index.js" ]
