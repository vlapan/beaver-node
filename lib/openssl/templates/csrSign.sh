#!/usr/bin/env bash

set -ex

RTCA="%{rtca}"
IMCT="%{imct}"
IMKY="%{imky}"

NAME=%{prefix}
CSR="%{csr}"

CNCT="${NAME}.crt"
KEYSIZE=%{keySize}
if [[ $KEYSIZE =~ ^[0-9]+$ ]]; then
    TYPE=RSA
    BITS=$KEYSIZE
else
    TYPE=EC
    CURV=$KEYSIZE
    BITS=4096
fi
ALGM=%{signatureAlgorithm}
DAYS=%{expirationDays}
SERIAL=%{serial}
INCLUDEROOTCA=%{includeRootCA}

if [ -f "$CNCT" ]; then
    exit 0
fi

CNF="$(
    cat <<- EOF | sed 's/^[ \t]*//;s/[ ]*$//'
        [req]
        default_bits=$BITS
        default_md=$ALGM
        prompt=no
        encrypt_key=no
        distinguished_name=dn
        req_extensions=req_ext

        [req_ext]
        subjectKeyIdentifier=hash
        #authorityKeyIdentifier=keyid,issuer
        keyUsage=nonRepudiation, digitalSignature, keyEncipherment
        basicConstraints=CA:FALSE
        extendedKeyUsage=serverAuth, clientAuth
EOF
)"
echo ">>>>>> CNF:\n$CNF\n<<<<<<"

CRT="$(
    openssl x509 -req -$ALGM -days $DAYS -in <(echo "$CSR") -CA <(echo "$IMCT") -CAkey <(echo "$IMKY") -set_serial $SERIAL -extfile <(echo "$CNF") -extensions req_ext
)"
echo ">>>>>> CNCT:\n$(openssl x509 -in <(echo "$CRT") -text)\n<<<<<<"

(
    echo "$CRT"
    echo ""
    cat "$IMCT"
    if [ "${INCLUDEROOTCA}" = "true" -a -f "$RTCA" ]; then
        echo ""
        cat "$RTCA"
    fi
) > "$CNCT"
