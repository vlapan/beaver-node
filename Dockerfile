FROM node:17
COPY . /usr/src/beaver-node

RUN apt update && apt install -y libpam0g-dev
RUN yarn global add file:/usr/src/beaver-node

ENTRYPOINT [ "/usr/local/bin/beaver-export" ]