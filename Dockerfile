FROM node:16-bullseye
ADD . /root
WORKDIR /root
RUN npm install &&\
 curl -o chat/DS_Sholom_Medium.ttf https://rus-shrift.ru/Original/DS_Sholom_Medium.ttf
ENTRYPOINT ["./main.js"]
