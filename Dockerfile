FROM nginx:alpine
RUN apk add --no-cache nginx-module-njs
