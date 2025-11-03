set dotenv-load

# Cloudflare credentials (set these as environment variables)
CF_ZONE_ID := env_var_or_default("CF_ZONE_ID", "")
CF_API_TOKEN := env_var_or_default("CF_API_TOKEN", "")

dev:
    npm run dev

build:
    @echo "\nBuilding application..."
    npm run build

deploy target: build
    @echo "\nDeploying application..."
    rsync -av --delete --progress dist/ {{target}}:~/fevela/
    @just purge-cache

purge-cache:
    @echo "\nPurging Cloudflare cache... for zone {{CF_ZONE_ID}}"
    @curl -s -X POST "https://api.cloudflare.com/client/v4/zones/{{CF_ZONE_ID}}/purge_cache" \
        -H "Authorization: Bearer {{CF_API_TOKEN}}" \
        -H "Content-Type: application/json" \
        --data '{"purge_everything":true}' \
        | jq -r 'if .success then "✅ Cache purged successfully" else "‼️ Error: " + (.errors[0].message // "Unknown error") end'
