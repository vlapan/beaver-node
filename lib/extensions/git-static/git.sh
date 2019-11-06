#!/usr/bin/env bash

set -ex

REPOS=%{path}
NAME=%{name}
URL=%{url}

if [ -d ${REPOS}/${NAME} ]; then
    cd ${REPOS}/${NAME}
    git pull --prune
else
    cd ${REPOS}
    git clone ${URL} ${NAME}
fi
