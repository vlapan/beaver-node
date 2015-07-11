#!/usr/bin/env bash

set -ex

NAME=%{prefix}
ROUTE=%{route}
ROOTNAME=%{prefixRoot}
SUBJECTPREFIX=%{subjectPrefix}
TEMPPASS=%{tempPass}
KEYSIZE=%{keySize}
SIGNATUREALGORITHM=%{signatureAlgorithm}
EXPIRATIONDAYS=%{expirationDays}
INCLUDEROOTCA=%{includeRootCA}
SERIAL=%{serial}

[ -f ${NAME}.key.original ] || {
	openssl genrsa -des3 -passout ${TEMPPASS} -out ${NAME}.key.original ${KEYSIZE}
	openssl rsa -passin ${TEMPPASS} -in ${NAME}.key.original -out ${NAME}.key
}
[ -f ${NAME}.csr ] || openssl req -new -batch -subj "${SUBJECTPREFIX}${ROUTE}" -key ${NAME}.key -out ${NAME}.csr
[ -f ${NAME}.raw.crt ] || openssl x509 -req -${SIGNATUREALGORITHM} -days ${EXPIRATIONDAYS} -in ${NAME}.csr -CA ${ROOTNAME}.crt -CAkey ${ROOTNAME}.key -set_serial ${SERIAL} -out ${NAME}.raw.crt
if [ ! -f ${NAME}.crt ]; then
	cat ${NAME}.raw.crt ${ROOTNAME}.crt > ${NAME}.crt
	if [ "${INCLUDEROOTCA}" = "true" ] && [ -f ${ROOTNAME}.ca ]; then
		cat ${ROOTNAME}.ca >> ${NAME}.crt
	fi
fi

#[ -f ${NAME}.crt ] && openssl x509 -in ${NAME}.crt -out ${NAME}.pem -outform PEM
