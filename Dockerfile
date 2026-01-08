FROM node:18 

RUN apt-get update && apt-get install -y tini

WORKDIR /app 

RUN npm i ts-node -g
RUN npm i typescript -g

COPY package.json yarn.lock tsconfig.json /app/
COPY patches /app/patches

RUN yarn 

COPY src /app/src 
COPY bin /app/bin
COPY views /app/views
COPY version.json /app/version.json

RUN npx tsc 

ENTRYPOINT ["/usr/bin/tini", "--"]

CMD ["node", "bin/www"]