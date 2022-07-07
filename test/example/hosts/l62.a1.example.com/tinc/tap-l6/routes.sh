#!/bin/sh
DIR=$(dirname -- "$(readlink -f -- "$0";)")
NETSTAT_CURRENT=$(netstat -rn | grep -e 'UHS.*tap-l6' | cut -d' ' -f1)
ROUTES=$(ls $DIR/routes)
ROUTES_REMOTE=$(cat $DIR/routes-remote)
for ITEM in $ROUTES; do
    IP=$(echo $ITEM | cut -d= -f2 | cut -d, -f1)
    MASK=$(echo $ITEM | cut -d= -f3)
    echo $ROUTES_REMOTE | grep -q $IP || continue
    echo $NETSTAT_CURRENT | grep -q $IP && continue
    route add "$IP/$MASK" -interface tap-l6
done
for IP in $NETSTAT_CURRENT; do
    echo $ROUTES | grep -q $IP || route delete $IP -interface tap-l6
done
