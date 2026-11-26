#!/bin/sh

set -e

export GIT_TERMINAL_PROMPT=0
export GIT_HTTP_LOW_SPEED_LIMIT=1000
export GIT_HTTP_LOW_SPEED_TIME=20

if [ -d "${REPOS}/${NAME}" ]; then
    git -C "${REPOS}/${NAME}" config --replace-all remote.origin.url "${URL}" >/dev/null 2>&1
    git -C "${REPOS}/${NAME}" reset --hard --quiet
    git -C "${REPOS}/${NAME}" clean -df --quiet

    TARGET_BRANCH="${BRANCH}"
    if [ -z "${TARGET_BRANCH}" ]; then
        CURRENT_BRANCH=$(git -C "${REPOS}/${NAME}" symbolic-ref --short -q HEAD || true)
        case "${CURRENT_BRANCH}" in
            main|master)
                TARGET_BRANCH="${CURRENT_BRANCH}"
                ;;
            *)
                TARGET_BRANCH=$(git -C "${REPOS}/${NAME}" ls-remote --symref origin HEAD | sed -n 's|^ref: refs/heads/\([^[:space:]]*\).*|\1|p')
                ;;
        esac
    fi

    if [ -z "${TARGET_BRANCH}" ]; then
        echo "could not determine target branch" >&2
        exit 1
    fi

    OLD_HEAD=$(git -C "${REPOS}/${NAME}" rev-parse HEAD 2>/dev/null || true)

    git -C "${REPOS}/${NAME}" fetch --prune --depth 1 origin "${TARGET_BRANCH}" >/dev/null 2>&1
    git -C "${REPOS}/${NAME}" checkout -B "${TARGET_BRANCH}" FETCH_HEAD >/dev/null 2>&1

    NEW_HEAD=$(git -C "${REPOS}/${NAME}" rev-parse HEAD 2>/dev/null || true)

    # Delete all local branches except the current target branch
    git -C "${REPOS}/${NAME}" for-each-ref --format='%(refname:short)' refs/heads/ | while read -r ITEM; do
        [ "${ITEM}" = "${TARGET_BRANCH}" ] || git -C "${REPOS}/${NAME}" branch -D "${ITEM}" --quiet || true
    done

    # Drop unreferenced git objects from old branches
    git -C "${REPOS}/${NAME}" prune --expire=now >/dev/null 2>&1 || true

    if [ "${OLD_HEAD}" = "${NEW_HEAD}" ] && [ -n "${OLD_HEAD}" ]; then
        echo "Already up to date."
    else
        echo "Updated to ${NEW_HEAD}."
    fi
else
    if [ -n "${BRANCH}" ]; then
        git clone --depth 1 --shallow-submodules --no-tags --branch "${BRANCH}" -- "${URL}" "${REPOS}/${NAME}"
    else
        git clone --depth 1 --shallow-submodules --no-tags -- "${URL}" "${REPOS}/${NAME}"
    fi
fi
