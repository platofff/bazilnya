FROM node:16-bullseye
ADD . /root
WORKDIR /root
RUN npm install &&\
 curl -o chat/DS_Sholom_Medium.ttf https://rus-shrift.ru/Original/DS_Sholom_Medium.ttf &&\
 curl -o chat/Apostol.ttf http://tapenik.ru/shrifti/Apostol2TYGRA.TTF &&\
 curl -o chat/Deutsch_Gothic.ttf https://rus-shrift.ru/Gothic/Deutsch_Gothic.ttf
ENTRYPOINT ["./main.js"]
