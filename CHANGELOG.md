# Changelog

All notable changes to this project will be documented in this file.

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
