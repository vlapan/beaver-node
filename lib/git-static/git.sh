#!/usr/bin/env bash

set -e

REPOS=%{path}
NAME=%{name}
URL=%{url}

export GIT_TERMINAL_PROMPT=0

if [ -d ${REPOS}/${NAME} ]; then
    cd ${REPOS}/${NAME}
    git pull --prune --rebase
else
    cd ${REPOS}
    git clone ${URL} ${NAME}
fi
