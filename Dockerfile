FROM node:20-bookworm
ADD . /app
WORKDIR /app
RUN npm install
ENTRYPOINT ["./main.js"]
