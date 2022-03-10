# beaver

## Run in Docker

### Build
```
docker build --tag beaver-node .
```
### Run
```
docker run --rm -i beaver-node -h "hostname" -e "www" < structure.json > config.tar
```