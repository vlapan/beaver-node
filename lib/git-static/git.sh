#!/bin/sh

set -e

REPOS=%{path}
NAME=%{name}
URL=%{url}

export GIT_TERMINAL_PROMPT=0
export GIT_HTTP_LOW_SPEED_LIMIT=1000
export GIT_HTTP_LOW_SPEED_TIME=20

if [ -d "${REPOS}/${NAME}" ]; then
    git -C "${REPOS}/${NAME}" config --replace-all remote.origin.url "${URL}"
    git -C "${REPOS}/${NAME}" reset --hard --quiet
    git -C "${REPOS}/${NAME}" clean -df --quiet
    git -C "${REPOS}/${NAME}" pull --prune --rebase
else
    git clone --depth 1 --shallow-submodules --no-tags -- "${URL}" "${REPOS}/${NAME}"
fi
