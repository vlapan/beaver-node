#!/usr/bin/env bash

set -e

REPOS=%{path}
NAME=%{name}
URL=%{url}

export GIT_TERMINAL_PROMPT=0
export GIT_HTTP_LOW_SPEED_LIMIT=1000
export GIT_HTTP_LOW_SPEED_TIME=20

if [ -d "${REPOS}/${NAME}" ]; then
    cd "${REPOS}/${NAME}"
    git pull --prune --rebase
else
    cd "${REPOS}"
    git clone "${URL}" "${NAME}"
fi
