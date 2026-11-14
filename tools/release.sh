#!/bin/sh

if ! git cliff --version > /dev/null 2>&1; then
    echo "ERROR: no 'cliff' available!" >&2
    exit 1
fi

git restore --staged .
VERSION="$(node tools/version.js --bump)"
echo "${VERSION}"
git cliff --tag "${VERSION}" -o
git add package.json
git add CHANGELOG.md
# git commit -m 'chore: version bump'
# git tag v${VERSION}
# git push
# git push --tags
