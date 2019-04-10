#!/usr/bin/env bash

set -ex

# NAME=%{prefix}
# ROUTE=%{route}
# ROOTNAME=%{prefixRoot}
# SUBJECT="%{subject}"
# TEMPPASS=%{tempPass}
# KEYSIZE=%{keySize}
# SIGNATUREALGORITHM=%{signatureAlgorithm}
# EXPIRATIONDAYS=%{expirationDays}
# INCLUDEROOTCA=%{includeRootCA}
# SERIAL=%{serial}

# [ -f ${NAME}.key.original ] || {
# 	openssl genrsa -des3 -passout ${TEMPPASS} -out ${NAME}.key.original ${KEYSIZE}
# 	openssl rsa -passin ${TEMPPASS} -in ${NAME}.key.original -out ${NAME}.key
# }
# [ -f ${NAME}.csr ] || openssl req -new -batch -subj "${SUBJECT}" -key ${NAME}.key -out ${NAME}.csr
# [ -f ${NAME}.raw-crt ] || openssl x509 -req -${SIGNATUREALGORITHM} -days ${EXPIRATIONDAYS} -in ${NAME}.csr -CA ${ROOTNAME}.ca-crt -CAkey ${ROOTNAME}.ca-key -set_serial ${SERIAL} -out ${NAME}.raw-crt
# if [ ! -f ${NAME}.crt ]; then
# 	cat ${NAME}.raw-crt ${ROOTNAME}.ca-crt > ${NAME}.crt
# 	if [ "${INCLUDEROOTCA}" = "true" ] && [ -f ${ROOTNAME}.ca ]; then
# 		echo >> ${NAME}.crt
# 		cat ${ROOTNAME}.ca >> ${NAME}.crt
# 	fi
# fi

#[ -f ${NAME}.crt ] && openssl x509 -in ${NAME}.crt -out ${NAME}.pem -outform PEM


ROOTNAME=%{prefixRoot}
IMCT="${ROOTNAME}.ca-crt"
IMKY="${ROOTNAME}.ca-key"
[ -f "$IMCT" ] || {
    echo "FATAL: can't create CN - intermediate is not available: $IMCT"
    exit 1
}
[ -f "$IMKY" ] || {
    echo "FATAL: can't create CN - intermediate is not available: $IMKY"
    exit 1
}

NAME=%{prefix}
ROUTE=%{route}

CNCT="${NAME}.crt"
CNKY="${NAME}.key"
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
SUBJ="%{subject}"
SERIAL=%{serial}

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

        [dn]
        $(echo $SUBJ | tr '/' '\n' | sed '/^$/d' | grep -v ^ext: | sed '/^$/d')

        [req_ext]
        subjectKeyIdentifier=hash
        #authorityKeyIdentifier=keyid,issuer
        keyUsage=nonRepudiation, digitalSignature, keyEncipherment
        basicConstraints=CA:FALSE
        extendedKeyUsage=serverAuth, clientAuth
        $(echo $SUBJ  | tr '/' '\n' | sed '/^$/d' | grep ^ext: | cut -d: -f2- | sed '/^$/d')
EOF
)"
echo ">>>>>> CNF:\n$CNF\n<<<<<<"

SUBJECT="$(echo $SUBJ | tr '/' '\n' | sed '/^$/d' | grep -v ^ext: | sed '/^$/d' | sed 's/^/\//g' | tr -d '\n')"
if [ "$TYPE" = "RSA" ]; then
    CSR="$(
        openssl req -newkey rsa:$BITS -nodes -batch -$ALGM -extensions req_ext -keyout "$CNKY" -config <(echo "$CNF")
    )"
else
    openssl ecparam -name $CURV -genkey -out "$CNKY"
    CSR="$(
        openssl req -new -key "$CNKY" -batch -extensions req_ext -config <(echo "$CNF") -subj "$SUBJECT" -subject
    )"
fi
echo ">>>>>> CSR:\n$(openssl req -in <(echo "$CSR") -text -noout)\n<<<<<<"

KEY="$(
    openssl x509 -req -$ALGM -days $DAYS -in <(echo "$CSR") -CA "$IMCT" -CAkey "$IMKY" -set_serial $SERIAL -extfile <(echo "$CNF") -extensions req_ext
)"
echo ">>>>>> CNCT:\n$(openssl x509 -in <(echo "$KEY") -text)\n<<<<<<"
(echo "$KEY" ; echo "" ; cat "$IMCT") > "$CNCT"

