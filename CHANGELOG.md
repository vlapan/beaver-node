# Changelog

All notable changes to this project will be documented in this file.

## [0.1.293] - 2025-10-30

### 🚀 Features

- *(utils/fs)* Add ability to set custom filter for `findFile` function

### 🐛 Bug Fixes

- *(https)* Compare fully redacted versions
- *(passwd)* Correct file variable debug
- *(nginx)* Respect `location` on target
- *(acme)* Move expired cleanup from worker to extension
- *(nginx)* Remove broken symbolic links, and clean up certs in `acme` export path before certificates generation

### 🎨 Styling

- *(https)* Add missing semicolon

### ⚙️ Miscellaneous Tasks

- Deps up, migrate to `yargs v18`
- Deps up, migrate to `express v5.1`
- Deps up, migrate to `supports-color v10`
- Deps up

## [0.1.292] - 2025-10-22

### 🚀 Features

- *(cleanConfig)* Redact `csr`s in `services.pki.authorities`

## [0.1.291] - 2025-10-22

### 🚀 Features

- *(cleanConfig)* + add redaction of some values in `monitoring.notify` and `services.git.repositories`

### 🐛 Bug Fixes

- *(ipfw)* Ability to close access to `ssh`/`http` services with acls

### ⚙️ Miscellaneous Tasks

- Deps up

## [0.1.290] - 2025-09-08

### 🐛 Bug Fixes

- *(ipfw)* Port forward access tables take5

### ⚙️ Miscellaneous Tasks

- Deps up

## [0.1.289] - 2025-09-04

### 🐛 Bug Fixes

- *(ipfw)* Port forward access tables take4

### ⚙️ Miscellaneous Tasks

- Deps up

## [0.1.288] - 2025-09-01

### 🐛 Bug Fixes

- *(ipfw)* Port forward access tables take3

### ⚙️ Miscellaneous Tasks

- Deps up

## [0.1.287] - 2025-09-01

### 🐛 Bug Fixes

- *(ipfw)* Port forward access tables take2

## [0.1.286] - 2025-08-27

### 🐛 Bug Fixes

- *(ipfw)* Reorder port forward access tables

## [0.1.285] - 2025-08-27

### 🚀 Features

- *(ipfw)* Port forward access

## [0.1.284] - 2025-05-19

### 🐛 Bug Fixes

- *(acme)* Server and pull should start even when there is no config yet

### ⚙️ Miscellaneous Tasks

- Deps up

### Example

- Add missing

## [0.1.283] - 2025-04-11

### 🐛 Bug Fixes

- *(dns)* Split long `TXT` records

### ⚙️ Miscellaneous Tasks

- Deps up

## [0.1.282] - 2025-04-01

### 🐛 Bug Fixes

- *(nginx)* Process `acls` in `static` block

### ⚙️ Miscellaneous Tasks

- Deps up

## [0.1.281] - 2025-03-03

### 🐛 Bug Fixes

- *(openssl)* Make proper algo with hash.name

### ⚙️ Miscellaneous Tasks

- Deps up

## [0.1.280] - 2025-02-20

### 🐛 Bug Fixes

- *(git-static)* Remove trace `-x` from `git.sh`

### ⚙️ Miscellaneous Tasks

- Deps up

## [0.1.279] - 2025-02-12

### 🐛 Bug Fixes

- *(https)* Reload ssl/root-ca certificates

### ⚙️ Miscellaneous Tasks

- Deps up

## [0.1.278] - 2025-02-10

### 🐛 Bug Fixes

- *(git-static)* Replace url in the config before pulling

### ⚙️ Miscellaneous Tasks

- Deps up

## [0.1.277] - 2025-01-16

### 🐛 Bug Fixes

- *(nginx)* Add acme `well-known` location only if preset is `acmeHttp` type
- *(nginx)* Set `Host` header explicitly to proxified request, so it would work if header is changed in the upper scope

### ⚙️ Miscellaneous Tasks

- Deps up

## [0.1.276] - 2025-01-12

### 🐛 Bug Fixes

- *(extensions)* Correct hook path
- *(extensions)* Pass `output_path` to `hook` script as `env` variable
- *(extensions)* `provided`, `default` and `directory` hook types, some changes to debug output

### ⚙️ Miscellaneous Tasks

- Deps up

## [0.1.275] - 2025-01-09

### 🐛 Bug Fixes

- *(openssl)* Empty `san`, copy `cn` from `subject`

## [0.1.274] - 2025-01-09

### 🚀 Features

- Add `passwd` module, generate `passwd` file from `structure`

### 🐛 Bug Fixes

- *(openssl)* Use `webcrypto` for `csr` signing, copy `san` from `csr`
- *(git-static)* Use shallow clone, etc...

### 🚜 Refactor

- *(openssl)* Use `Set` and other optimizations

### ⚙️ Miscellaneous Tasks

- Deps up

## [0.1.273] - 2024-12-12

### 🐛 Bug Fixes

- *(ssl)* Generate simple certificate serial when legacy sha-1 hash used

### ⚙️ Miscellaneous Tasks

- Deps up

## [0.1.272] - 2024-11-28

### 🐛 Bug Fixes

- *(dns)* Add `NS` records for `acme` to local views

### 🎨 Styling

- Fix missing trailing comma

### ⚙️ Miscellaneous Tasks

- Deps up

### Example

- Add `passwd` for daemon test

## [0.1.271] - 2024-11-14

### 🐛 Bug Fixes

- *(dns)* Add `acme.conf` to lan views

### ⚙️ Miscellaneous Tasks

- Deps up

## [0.1.270] - 2024-11-06

### 🐛 Bug Fixes

- *(notificator)* Change timer key

### ⚙️ Miscellaneous Tasks

- Deps up

## [0.1.269] - 2024-11-05

### 🐛 Bug Fixes

- *(git-static)* Return 403 when got bad secret
- *(git-static)* BodyRaw, lower-case headers

## [0.1.268] - 2024-11-05

### 🚀 Features

- *(nginx)* If route has static then create separate nginx server for `.*` and 404 all static on subdomains
- *(git-static)* Initial webhook secret check
- *(structure)* Add `name` property
- *(extensions)* Run hooks from `hook.d` path
- Merge configs

### 🐛 Bug Fixes

- *(nginx)* `acme` and `git-static` entrypoints add `allow all;`
- *(openssl)* Create symlink to certificates with hash, use plain version in nginx
- *(openssl)* Unlink before symlink
- *(nginx)* No static on subdomains

### ⚙️ Miscellaneous Tasks

- Deps up

## [0.1.267] - 2024-10-31

### 🐛 Bug Fixes

- *(git-static)* Check zone on repository itself against zone on server itself, check if zones intersects one with another
- *(package.json)* Corepack adds packageManager field
- *(tinc)* Treat zone as array and check for intersection
- *(git-static)* Pass getConfig function instead of config object, fix for updateHook
- *(git-static)* Better error processing

### ⚙️ Miscellaneous Tasks

- Deps up

### Example

- Add missing block from trust

## [0.1.266] - 2024-10-28

### 🐛 Bug Fixes

- *(git-static)* Respect zones when add servers for git pull notification
- *(git-static)* `disableGitStatic` argument only disables daemon, add `disableGitStaticPull` to disable git pull on extension run

### 🎨 Styling

- *(utils/structure)* Add trailling comma and semicolon

### ⚙️ Miscellaneous Tasks

- Deps up

## [0.1.265] - 2024-10-27

### 🚀 Features

- *(nginx)* Add ability to specify `target.access`
- *(nginx)* Generate XFF for `target.trust`

### ⚙️ Miscellaneous Tasks

- Deps up

## [0.1.264] - 2024-10-26

### 🚀 Features

- *(nginx)* Use `acls` for `target.nginx.deny`
- Acls could include acls

### Example

- Add real acl to nginx.trust

## [0.1.263] - 2024-10-25

### 🚀 Features

- *(nginx)* Add acls for XFF to `routing.options.nginx.trust`

### Example

- Update

## [0.1.262] - 2024-10-24

### 🐛 Bug Fixes

- *(ipfw)* Get `server.wan3` for `externalIp` if `location.wan3` is not defined, and update example

## [0.1.261] - 2024-10-23

### Example

- Update for myx commits

## [0.1.260] - 2024-10-23

### 🚀 Features

- *(nginx)* `noWildcard` option on a route target

## [0.1.259] - 2024-10-22

### 🐛 Bug Fixes

- *(https)* Add static layers to `approve`

## [0.1.258] - 2024-10-22

### 🐛 Bug Fixes

- *(ipfw)* Replace to real externalIp

## [0.1.257] - 2024-10-22

### 🐛 Bug Fixes

- *(ipfw)* Use second `nat instance` for nat dynamic rules

### ⚙️ Miscellaneous Tasks

- Deps up

### Example

- Add `service.pki.authorities[zone0]` for `pki2.example.com`

## [0.1.256] - 2024-10-21

### 🐛 Bug Fixes

- *(nginx)* `ssl-external` alias
- *(nginx)* Nginx.allow didn't clone object

## [0.1.255] - 2024-10-18

### 🐛 Bug Fixes

- *(nginx)* `ssl-external` alias
- *(nginx)* `ssl-external` alias

### ⚙️ Miscellaneous Tasks

- Deps up

## [0.1.254] - 2024-10-16

### 🐛 Bug Fixes

- *(ipfw)* Add `nat 1 delete` to fix nat instance problem

## [0.1.253] - 2024-10-15

### 🚀 Features

- *(git-static)* Add zones support
- *(ipfw)* Tmp table and swap

### ⚙️ Miscellaneous Tasks

- Deps up

## [0.1.252] - 2024-10-11

### 🚀 Features

- *(nginx)* Generate xff map

### 🐛 Bug Fixes

- *(ipfw)* Separate `nat 1 config`

## [0.1.251] - 2024-10-10

### 🚀 Features

- *(nginx)* Make use of `acls` in `target.nginx.allow`

### 🐛 Bug Fixes

- Fallback to `dns.acl` if there no `acls` for a while
- *(acls)* Entries with just comment, more tests
- *(nginx)* For redirect to `https` instead of `$server_name$request_uri` use `$host$request_uri` to keep subdomain from request
- *(ipfw)* Enable `set` after `swap` just in case if it was manually disabled before

### ⚡ Performance

- *(ipfw)* Change method of applying `ipfw` rules from separated commands to whole bunch to one `cat ... | ipfw /dev/stdin`

### ⚙️ Miscellaneous Tasks

- Deps up

## [0.1.250] - 2024-10-09

### 🚀 Features

- Make `acls` more global, move `config.routing.options.dns.acl` => `config.routing.options.acls`
- *(ipfw)* Custom tables, and acls for beaver and tinc fw-protection
- *(nginx)* Ability to disable `http2` for all or specific targets

### 🐛 Bug Fixes

- *(importantMessages)* Little bit more visible
- *(openssl)* Hash short
- *(openssl)* Crl newline in the file end
- *(openssl)* Serial to date.now
- *(openssl)* Revert to old function
- *(nginx)* Correct certificate expiry date in deferred notifications
- *(openssl)* Fix issuer in new certificate generator function
- *(openssl)* Use new certificate generator function
- *(dns)* Separate key to ip resolver
- *(dns)* Use align in `allow-recursion` block
- *(utils/structure)* Rename 'ip' => 'value'
- *(dns)* Add `acl` only if used
- *(utils/structure)* Remove item as object with comment, not needed for now anyway

### 🚜 Refactor

- *(ipfw)* Change table `5`/`6` names to more self-explaining `tinc-tap-l6-hosts-remote`/`tinc-tap-l6-hosts-local`, and use `create or-flush` instead of just `flush` to fix deprecation warning about table autocreating
- Remove `authenticate-pam` from dependenices, if needed then it could be installed globally, use of other authentication methods such as `pam_helper` is preferable

### 🧪 Testing

- *(example)* Add asn parsed files for all crt/csr
- *(example)* Add comments example inside `allow-transfer` and `also-notify`

### ⚙️ Miscellaneous Tasks

- Deps up

## [0.1.249] - 2024-09-23

### 🐛 Bug Fixes

- *(git-static)* Git clean as well
- *(git-static)* Run reset and clean with --quiet
- *(notificator)* Use new `from` for `notificator.notify`
- *(argv)* `dnsPath` => `dnsPrefixMaster` and `dnsSlavePath` => `dnsPrefixSlave`

### 🎨 Styling

- Change utf8 signs in notifications

### ⚙️ Miscellaneous Tasks

- Deps up

## [0.1.248] - 2024-09-16

### 🐛 Bug Fixes

- *(git-static)* Git reset before pulling

### 🚜 Refactor

- *(git-static)* Use double-quotes with variables

### ⚙️ Miscellaneous Tasks

- Deps up

## [0.1.247] - 2024-09-12

### 🚀 Features

- *(configuration)* Apply all "*.json" from "home/conf.d" directory to the same object, and apply main config after

### 🐛 Bug Fixes

- *(configuration)* Pass new layered object to config.set
- *(configuration)* Improve static configs

### ⚙️ Miscellaneous Tasks

- Deps up

## [0.1.246] - 2024-09-11

### 🚀 Features

- *(dns)* Respect dns prefix options in structure, prefix.master and prefix.slave to replace same args

### 🐛 Bug Fixes

- *(dns)* DnsPath/dnsSlavePath options
- *(dns)* Remove unnecessary prefix "/usr/local/etc/namedb" from some paths

## [0.1.245] - 2024-09-10

### 🐛 Bug Fixes

- *(utils)* Fix generateCertificate importKey algo

## [0.1.244] - 2024-09-10

### 🚀 Features

- *(extensions)* Argv.tar to get gzipped tar piped to stdout

### 🐛 Bug Fixes

- *(utils)* ConvertSubjectToObject function, for later
- *(nodemailer)* Create transport lazily on the first job

### 🚜 Refactor

- Rename required function "hash" => "getHash"
- *(acme)* Some optimizations to the extension
- *(nginx)* Some optimizations to the extension
- *(app)* Load daemons lazily
- *(acme)* Optimize workdir/export directories checking

### ⚙️ Miscellaneous Tasks

- Deps up

## [0.1.243] - 2024-09-09

### 🚀 Features

- *(acme)* Ability to set custom acme directory for presets
- *(utils)* New function "generateCertificate", uses crypto+x509 to create new certificate and sign it by provided issuer key

### 🐛 Bug Fixes

- *(acme)* Pass externalAccountBinding
- *(acme)* Clone array before use
- *(utils)* Ability to set return string length for the hash function
- *(openssl)* Make openssl.generate use new utils generateCertificate function that uses crypto+x509 instead of separate shell openssl process executing
- *(example)* Add generated home directory to the example output
- *(acme)* Sort acme config output, make it deterministic
- *(acme)* Parallel process of the routes

### 🚜 Refactor

- *(utils)* Move compareHost sort helper to common utils

### 🧪 Testing

- *(example)* Update beaver-test shell script, that produces example output

### ⚙️ Miscellaneous Tasks

- Deps up

## [0.1.242] - 2024-09-08

### 🐛 Bug Fixes

- Remove appendReason from overseer and monitor
- *(https)* Webui table style for explainer
- *(https)* Update webui table style for explainer
- *(webui)* Import explainer.css
- *(https)* Update webui table style for explainer
- *(https)* Update webui table style for explainer
- *(acme)* Pass provider and type

### ⚙️ Miscellaneous Tasks

- Update dep 'clean-yaumnrc'
- Deps up

## [0.1.241] - 2024-09-06

### 🚀 Features

- *(https)* Monitoring popup with coloring instead of just link

### 🐛 Bug Fixes

- *(acme)* Add failback to checkMigrate function
- *(notificator)* Separate certificate notifications
- *(https)* Add padding to explainer
- *(notificator)* Fix notifications sorting

### ⚙️ Miscellaneous Tasks

- Deps up
- Update dep 'clean-yaumnrc'

## [0.1.240] - 2024-09-05

### 🚜 Refactor

- Migrate 'node-forge' => '@peculiar/x509', acme EC certificates

### 🧪 Testing

- *(example)* Cleanup after tinc zones change

### ⚙️ Miscellaneous Tasks

- Update dep 'clean-yaumnrc'
- Deps up

## [0.1.239] - 2024-09-04

### 🐛 Bug Fixes

- *(notificator)* Show process owner in daemonStarted notification

### 🚜 Refactor

- Fix 'unicorn/prefer-date-now'
- *(overseer)* Let => const

### ⚙️ Miscellaneous Tasks

- Deps up
- Upgrade 'acme-client' dep to v5

## [0.1.238] - 2024-09-02

### 🚀 Features

- *(dns)* Add @zone to 'allow-transfer' resolver

### 🐛 Bug Fixes

- *(overseer)* Fix mail message CURRENT view
- *(monitor)* Use location wans instead of wan3smart

## [0.1.237] - 2024-09-02

### 🚜 Refactor

- *(monitor)* Rewrite monitor a bit

### ⚙️ Miscellaneous Tasks

- Deps up

## [0.1.236] - 2024-08-29

### 🐛 Bug Fixes

- *(overseer)* Notification mail blocks CURRENT/PREVIOUSLY should only color line which changed status
- *(overseer)* Log status changes with fail reason
- *(acme)* Remove async/await that was added by mistake

### 🚜 Refactor

- *(overseer)* Better log

## [0.1.235] - 2024-08-29

### 🐛 Bug Fixes

- *(overseer)* Change '\n' to '<br>' in the html message
- *(monitor)* Reformat subject for tests

## [0.1.234] - 2024-08-29

### 🐛 Bug Fixes

- *(tinc)* Use main tinc process PID when syslog in hooks
- *(tinc)* Use 'local7.info' facility.level when syslog in hooks

## [0.1.233] - 2024-08-29

### 🚀 Features

- *(sshConfig)* Add sshConfig module, generates ssh_config for the infrastructure
- *(overseer)* New log argument --overseer-log, if specified then state changes will be logged to the file provided in that argument
- *(overseer)* Print tests count

## [0.1.232] - 2024-08-28

### 🐛 Bug Fixes

- *(overseer)* Fix notification message section PREVIOUSLY
- *(monitor)* Check wan3 exists before adding fwd tests
- *(monitor)* Check that url starts with 'http' on static test entry
- *(monitor)* Sort tests by name, host, ip, port

### 🚜 Refactor

- *(overseer)* Function to color line by status

## [0.1.231] - 2024-08-28

### 🚀 Features

- *(monitor)* ".protocol" and ".path"
- *(overseer)* Notification message made of three blocks DIFF/CURRENT/PREVIOUSLY
- *(monitor)* Respect zones on locations

### 🐛 Bug Fixes

- *(monitor)* Ssh-fwd, service ports from table, remove duplicates, refactor a bit
- *(app)* Exit early on error if not in daemon mode

### 🧪 Testing

- *(example)* Set different tcpShift on the servers
- *(example)* Change routing.types.unix['22/tcp']=27 port
- *(example)* Change monitoring parameters
- *(example)* Add monitor to TargetStatic

## [0.1.230] - 2024-08-26

### 🚀 Features

- New module for important messages on configuration, importantMessages
- *(importantMessages)* Notify about root certificates soon expiration
- Location.zone to separate tinc networks

### 🐛 Bug Fixes

- *(https)* Wait until the daemon have started
- *(overseer)* Do not use test reason when making diff
- *(overseer)* Default to append test reason
- *(cleanConfig)* Fix fresh generation detection (without previous state)
- *(extensions)* Reverse check for exit code of a hook ">0" => "=== 0"
- *(tinc)* Multiple tinc networks, but it's still won't work until some other changes

### 🚜 Refactor

- *(overseer)* Fs.*Sync => async
- *(https)* Authentication functions to separate middleware

### 🎨 Styling

- *(cleanConfig)* Prefix all messages with "Diff:"

### 🧪 Testing

- *(example)* Add two more locations and some servers to them

### ⚙️ Miscellaneous Tasks

- Deps up

## [0.1.229] - 2024-08-25

### 🚀 Features

- *(https)* Jwt authentication method
- *(https)* Pam_helper authentication method

### 🐛 Bug Fixes

- *(https)* Move "clear-site-data" get:/logout => post:/login, add delay to logout post request
- *(https)* Logout update
- *(https)* Fix "/approve" body params passing
- *(https)* Pam add bad authentication delay

### 🚜 Refactor

- *(https)* Change setAuthenticated to receive user name
- *(https)* AuthFilePath => bobotAuthPath

### ⚙️ Miscellaneous Tasks

- Deps up

## [0.1.228] - 2024-08-22

### 🚀 Features

- *(dns)* Resolve locations key in allow-transfer values to net3/wan36/lans
- *(dns)* Options.dns.acl can define list that can be used for "allow-transfer" option in a zone definition, generates separate acls in bind9 configs as well

### 🐛 Bug Fixes

- *(acme)* Check master domains list, throw error if mirrorDomainSuffix exists but it is not in the list, or if mirrorDomainSuffix does not exist but route/altNames are not in the list
- *(app)* Add daemons to the list of promises and wait for initialization at the end
- *(cleanConfig)* Remove spaces offset from diff message

### 🚜 Refactor

- *(acme)* Change to non-negated condition
- *(acme)* Some minor changes
- *(dns)* Use processAppendKey when generating allow-transfer for slave-zone

### 🎨 Styling

- *(dns)* Align comments in output

### 🧪 Testing

- *(acme)* Add mirrorDomainSuffix target and empty ssl preset
- *(acme)* Add mirrorDomainSuffix missing parts

### ⚙️ Miscellaneous Tasks

- Deps up

## [0.1.227] - 2024-08-14

### 🚀 Features

- *(argv)* Add authenticationMethods argument
- *(https)* Add passwd authentication method
- *(https)* Set and log used authentication method on success

### 🐛 Bug Fixes

- *(https)* Export single named object, module.exports = M
- *(https)* WWW-Authenticate header, double quote realm and add charset
- *(https)* Separate pamAuth to basic steps
- *(https)* Make 'authenticate-pam' to be optional dependency
- *(eslint)* Add unicorn plugin
- *(https)* Log enabled authentication methods
- *(https)* Move "favicon.ico" before auth
- *(https)* Unauthorized respond from "checkAuthorization" function
- *(https)* Make logout better
- *(eslint)* Correct some unicorn rules
- *(eslint)* Allow empty catch block
- *(eslint)* Allow catch error name 'e', 'unicorn/catch-error-name'
- *(eslint)* Turn off 'unicorn/prefer-string-replace-all' rule
- *(eslint)* Turn off 'unicorn/prefer-module' rule
- *(eslint)* Separate default eslint and stylistic rules
- *(https)* Check and enable authentication methods on server start
- *(https)* Respect the order of requested authentication methods
- *(https)* Use separate log token for authentication messages
- *(https)* Logout page, change return code "401" => "200" to fix Safari lag
- *(https)* Defer module loading required for the requested authentication method
- *(app)* Await till https server starts
- *(https)* Delay response on bad authentication

### 🚜 Refactor

- Cleanup
- *(utils)* Separate sleep argument parser to function "parseMs"
- Prefer the "node:" protocol when importing builtin modules
- *(https)* Correct authentication names
- Remove unused catch binding
- Compare with `undefined` directly instead of using `typeof`
- Prefer `.at(…)` over `[….length - index]`
- Strings must use singlequote
- Enforce explicitly comparing the length or size property of a value
- Arrow function used ambiguously with a conditional expression

### 🎨 Styling

- Format ".babelrc.js"
- Format ".prettierrc.js"
- Format "package.json"
- *(https)* Format "style.css"
- *(eslint)* Format 'eslint.config.js' file
- *(https)* Fix catch error name and comment

### 🧪 Testing

- *(example)* Fix 'notificator' static output
- *(https)* Add bad authentication method to daemon for testing

### ⚙️ Miscellaneous Tasks

- Deps up

### Build

- *(tools)* Rename "version-bump.js" => "version.js", default to get version from latest git tag, bump only when option is set
- *(changelog)* Add git-cliff config
- *(changelog)* Add "changelog" script to "package.json", it runs git-cliff that generates "CHANGELOG.md"

### Refacor

- Enforce consistent case for text encoding identifiers, 'utf-8' and etc => 'utf8'

## [0.1.226] - 2024-07-28

### 🚀 Features

- *(https)* New endpoint - "/versions", to get running process versions

### ⚙️ Miscellaneous Tasks

- Deps up

<!-- generated by git-cliff -->
