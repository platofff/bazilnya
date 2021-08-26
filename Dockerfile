FROM node:16-bullseye
ADD . /root
WORKDIR /root
RUN npm install
ENTRYPOINT ["./main.js"]
