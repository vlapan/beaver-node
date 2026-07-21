#!/bin/sh

DIR="$(cd "$(dirname "$0")" && pwd)"
mkdir -p "${DIR}/routes"

# 1. Discover existing kernel routing table entries for the target interface
NETSTAT_CURRENT="$(netstat -rn | awk '$3 ~ /UHS/ && $4 == "tap-l6" {print $1}')"
export NETSTAT_CURRENT

# 2. Collect files representing local target network allocations
ROUTES_RAW=$(printf '%s\n' "${DIR}"/routes/* 2>/dev/null)

# 3. Perform a three-way state intersection via AWK to reconcile network changes
echo "${ROUTES_RAW}" | awk -v rr="${DIR}/routes-remote" '
    BEGIN {
        # Initialize the active kernel route inventory from the environment
        nc = ENVIRON["NETSTAT_CURRENT"]
        split(nc, tmp, /[ \n\t]+/)
        for (i in tmp) {
            if (length(tmp[i]) > 0) active[tmp[i]] = 1
        }
    }

    # Data Source A: Parse peer-advertised routes allowed for selection
    FILENAME == rr {
        if (length($1) > 0) remote[$1] = 1
        next
    }

    # Data Source B: Parse local metadata configuration paths from standard input
    {
        if (length($0) == 0) next

        # Isolate target properties using localized record structures
        split($0, fields, /ip=|,,*mask=|,/)
        ip   = fields[2]
        mask = fields[3]

        # Apply fallback host routing prefix if network mask is absent
        if (length(mask) == 0) mask = 32

        # Map localized configuration presence to track network state
        folder_has[ip] = 1

        # Intersection Rule: Queue paths requiring instantiation
        if ((ip in remote) && !(ip in active)) {
            print "+", ip, mask
        }
    }

    END {
        # Intersection Rule: Queue orphan entries requiring eviction
        for (ip in active) {
            if (!(ip in folder_has)) {
                print "-", ip, "0"
            }
        }
    }
' "${DIR}/routes-remote" - | while read -r ACTION IP MASK _; do
    # 4. Mutate kernel state dynamically based on the calculated adjustments
    case "${ACTION}" in
        +) route add "${IP}/${MASK}" -iface tap-l6 ;;
        -) route delete "${IP}" -iface tap-l6 ;;
    esac
done
