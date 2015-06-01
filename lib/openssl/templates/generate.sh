#!/usr/bin/env bash

set -e

NAME=%{prefix}
ROUTE=%{route}
ROOTNAME=%{prefixRoot}
SUBJECTPREFIX=%{subjectPrefix}
TEMPPASS=%{tempPass}

[ -f ${NAME}.key.original ] || {
	openssl genrsa -des3 -passout ${TEMPPASS} -out ${NAME}.key.original 2048
	openssl rsa -passin ${TEMPPASS} -in ${NAME}.key.original -out ${NAME}.key
}
[ -f ${NAME}.csr ] || openssl req -new -batch -subj "${SUBJECTPREFIX}${ROUTE}" -key ${NAME}.key -out ${NAME}.csr
[ -f ${NAME}.raw.crt ] || openssl x509 -req -sha256 -days 365 -in ${NAME}.csr -CA ${ROOTNAME}.crt -CAkey ${ROOTNAME}.key -CAcreateserial -out ${NAME}.raw.crt
[ -f ${NAME}.crt ] || cat ${NAME}.raw.crt ${ROOTNAME}.crt > ${NAME}.crt
[ -f ${NAME}.crt ] && openssl x509 -in ${NAME}.crt -out ${NAME}.pem -outform PEM
