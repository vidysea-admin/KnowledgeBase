#!/usr/bin/env bash
# Remote CI only: owned disposable network/database/volume and readonly helper mounts.
set -Eeuo pipefail
mkdir -p docker-evidence
exec > >(tee docker-evidence/smoke.log) 2>&1
suffix="${GITHUB_RUN_ID:?}-${GITHUB_RUN_ATTEMPT:?}"
db_suffix="${GITHUB_RUN_ID}_${GITHUB_RUN_ATTEMPT}"
[[ "$db_suffix" =~ ^[0-9_]{1,40}$ ]] || exit 1
network="lkb-docker-$suffix"
mongo="lkb-mongo-$suffix"
api="lkb-api-$suffix"
web="lkb-web-$suffix"
refusal="lkb-refusal-$suffix"
seed="lkb-seed-$suffix"
assets="lkb-assets-$suffix"
native="lkb-native-$suffix"
migration="lkb-migration-$suffix"
state_init="lkb-state-init-$suffix"
transcript="lkb-transcript-$suffix"
automation="lkb-automation-$suffix"
worker_config="lkb-worker-config-$suffix"
source_jobs="lkb-source-jobs-$suffix"
state="lkb-state-$suffix"
api_image="lkb-api:ci-$suffix"
web_image="lkb-web:ci-$suffix"
build_image="lkb-build:ci-$suffix"
tools_image="lkb-tools:ci-$suffix"
helper="$PWD/scripts/qa/container-workflows"
url='mongodb://docker-smoke-mongo:27017/?replicaSet=rs0'
database="lkb_work_container_$db_suffix"
cleanup() {
  result=$?
  trap - EXIT INT TERM
  owned_containers=("$api" "$web" "$mongo" "$refusal" "$seed" "$assets" "$native" "$migration" "$state_init" "$transcript" "$automation" "$worker_config" "$source_jobs")
  for container in "${owned_containers[@]}"; do
    timeout 5 docker logs --tail 1000 "$container" > "docker-evidence/$container.log" 2>&1 || true
  done
  # At most 145s for all cleanup caps, below the outer 180s kill grace. Include anonymous Mongo volumes.
  timeout 45 docker rm -f -v "${owned_containers[@]}" >/dev/null 2>&1 || true
  timeout 15 docker network rm "$network" >/dev/null 2>&1 || true
  label=$(timeout 5 docker volume inspect --format '{{index .Labels "lkb.ci-run"}}' "$state" 2>/dev/null || true)
  if [[ "$label" == "$suffix" ]]; then timeout 15 docker volume rm "$state" >/dev/null 2>&1 || true; fi
  exit "$result"
}
trap cleanup EXIT
trap 'exit 130' INT
trap 'exit 143' TERM
MONGODB_URL="$url" MONGODB_DB="$database" OLLAMA_API_KEY=ci-public-placeholder-unused GEMINI_API_KEY=ci-public-placeholder-unused \
  timeout 30 docker compose --env-file /dev/null config > docker-evidence/compose.yaml
timeout 900 docker build --progress=plain -t "$api_image" .
timeout 900 docker build --progress=plain --target web --build-arg VITE_API_BASE_URL=https://ci-fixture.invalid -t "$web_image" .
timeout 300 docker build --progress=plain --target build -t "$build_image" .
timeout 300 docker build --progress=plain --target worker-tools -t "$tools_image" .
[[ "$(timeout 10 docker image inspect --format '{{.Config.User}}' "$api_image")" == node ]]
[[ "$(timeout 10 docker image inspect --format '{{.Config.User}}' "$tools_image")" == node ]]
timeout 60 docker run --rm --name "$assets" --network none --mount "type=bind,src=$helper,dst=/ci,readonly" "$api_image" node /ci/runtime-assets.mjs | tee docker-evidence/runtime-assets.json
timeout 90 docker run --rm --name "$native" --network none --mount "type=bind,src=$helper,dst=/ci,readonly" "$tools_image" node /ci/native-tools.mjs | tee docker-evidence/native-tools.json
timeout 60 docker run --rm --name "$worker_config" --network none --mount "type=bind,src=$helper,dst=/ci,readonly" \
  -e LKB_SOURCE_INTAKE=1 -e LKB_SOURCE_JOB_DIR=/ci-state/sources -e 'LKB_SOURCE_WORKER_TENANTS=["ci-a"]' \
  -e MONGODB_URL="$url" -e MONGODB_DB="$database" -e LKB_SOURCE_INTAKE_MODEL=gemini-ci-fixture \
  -e GEMINI_API_KEY=ci-public-placeholder-unused "$tools_image" \
  node --import /ci/provider-guard.mjs apps/api/dist/source-worker.js --check-config | tee docker-evidence/worker-config.json
timeout 150 docker run --rm --name "$source_jobs" --network none \
  --mount "type=bind,src=$PWD/qa/issues.T045WORKER.jsonl,dst=/app/qa/issues.T045WORKER.jsonl,readonly" "$build_image" \
  node --test --test-reporter=tap --test-concurrency=1 --test-timeout=30000 --import tsx \
  apps/api/src/source-intake/jobs/jobs.test.ts apps/api/src/source-intake/jobs/privacy.test.ts | tee docker-evidence/source-jobs.tap
grep -Eq '^# pass [1-9][0-9]*$' docker-evidence/source-jobs.tap
grep -Eq '^# fail 0$' docker-evidence/source-jobs.tap
timeout 30 docker run --rm --name "$migration" --network none "$build_image" node -e "require.resolve('migrate-mongo'); require.resolve('./migrations/20261014100000-transcript-reviews.cjs')"
timeout 20 docker network create --internal "$network" >/dev/null
timeout 30 docker run -d --name "$mongo" --network "$network" --network-alias docker-smoke-mongo mongo:7 --replSet rs0 --bind_ip_all >/dev/null
ready=false
for attempt in {1..30}; do
  if timeout 10 docker exec "$mongo" mongosh --quiet --eval 'quit(db.adminCommand({ping:1}).ok ? 0 : 1)' >/dev/null 2>&1; then ready=true; break; fi
  sleep 2
done
[[ "$ready" == true ]]
timeout 15 docker exec "$mongo" mongosh --quiet --eval 'rs.initiate({_id:"rs0",members:[{_id:0,host:"docker-smoke-mongo:27017"}]})'
ready=false
for attempt in {1..30}; do
  if timeout 10 docker exec "$mongo" mongosh --quiet --eval 'quit(db.hello().isWritablePrimary ? 0 : 1)' >/dev/null 2>&1; then ready=true; break; fi
  sleep 2
done
[[ "$ready" == true ]]
set +e
timeout 15 docker run --name "$refusal" --network none -e MONGODB_URL="$url" "$api_image" > docker-evidence/unset-db.log 2>&1
refusal_status=$?
set -e
[[ "$refusal_status" == 1 ]]
grep -q MONGODB_DB docker-evidence/unset-db.log
timeout 60 docker run --rm --name "$migration" --network "$network" \
  -e MONGODB_URL="$url" -e MONGODB_DB="$database" "$build_image" \
  node scripts/qa/container-workflows/scratch-apply-migration.mjs | tee docker-evidence/scratch-migration.json
timeout 60 docker run --name "$seed" --network "$network" --mount "type=bind,src=$helper,dst=/ci,readonly" \
  -e MONGODB_URL="$url" -e MONGODB_DB="$database" "$api_image" node /ci/seed.mjs | tee docker-evidence/seed.json
timeout 20 docker volume create --label "lkb.ci-run=$suffix" "$state" >/dev/null
timeout 30 docker run --rm --name "$state_init" --network none --user root --mount "type=volume,src=$state,dst=/ci-state" "$api_image" \
  sh -c 'mkdir -p /ci-state/hosting /ci-state/sources && chown 1000:1000 /ci-state/hosting /ci-state/sources && chmod 0700 /ci-state/hosting /ci-state/sources'
timeout 30 docker run -d --name "$api" --network "$network" \
  --mount "type=bind,src=$helper,dst=/ci,readonly" --mount "type=volume,src=$state,dst=/ci-state" \
  -e MONGODB_URL="$url" -e MONGODB_DB="$database" -e WATCH_TENANTS= \
  -e GEMINI_API_KEY=ci-public-placeholder-unused -e CORS_ORIGINS=https://ci-fixture.invalid \
  -e LKB_SOURCE_INTAKE=1 -e LKB_SOURCE_JOB_DIR=/ci-state/sources -e 'LKB_SOURCE_WORKER_TENANTS=["ci-a","ci-b"]' \
  -e LKB_HOSTING_STATE_DIR=/ci-state/hosting \
  -e LKB_HOSTING_ENCRYPTION_KEY=1111111111111111111111111111111111111111111111111111111111111111 \
  -e 'LKB_HOSTING_BOOTSTRAP_ADMINS={"ci-a":["ci-key-a"],"ci-b":["ci-key-b"]}' \
  -e 'LKB_HOSTING_WEBHOOK_ORIGINS=["https://ci-fixture.invalid"]' \
  "$api_image" node --import /ci/provider-guard.mjs /app/apps/api/dist/server.js >/dev/null
ready=false
for attempt in {1..60}; do
  status=$(timeout 10 docker inspect --format '{{.State.Health.Status}}' "$api")
  [[ "$status" != unhealthy ]] || exit 1
  if [[ "$status" == healthy ]]; then ready=true; break; fi
  running=$(timeout 10 docker inspect --format '{{.State.Running}}' "$api")
  [[ "$running" == true ]] || exit 1
  sleep 2
done
[[ "$ready" == true ]]
timeout 120 docker exec "$api" node /ci/mounted-smoke.mjs | tee docker-evidence/mounted-api.json
timeout 15 docker cp "$api:/tmp/lkb-ci-provider-calls.json" docker-evidence/provider-boundary.json
timeout 30 docker restart "$api" >/dev/null
ready=false
for attempt in {1..60}; do
  status=$(timeout 10 docker inspect --format '{{.State.Health.Status}}' "$api")
  [[ "$status" != unhealthy ]] || exit 1
  if [[ "$status" == healthy ]]; then ready=true; break; fi
  [[ "$(timeout 10 docker inspect --format '{{.State.Running}}' "$api")" == true ]] || exit 1
  sleep 2
done
[[ "$ready" == true ]]
timeout 60 docker exec "$api" node /ci/reload-smoke.mjs | tee docker-evidence/reloaded-api.json
timeout 150 docker run --rm --name "$transcript" --network "$network" -e LKB_T054_MONGO_RUN=1 -e LKB_T054_MONGO_URL="$url" \
  -e LKB_T054_MONGO_DB="t054_test_$db_suffix" "$build_image" \
  node --test --test-reporter=tap --test-concurrency=1 --import tsx apps/api/src/transcript-review/mongodb.integration.test.ts | tee docker-evidence/transcript-mongo.tap
grep -Eq '^# pass [1-9][0-9]*$' docker-evidence/transcript-mongo.tap
grep -Eq '^# fail 0$' docker-evidence/transcript-mongo.tap
timeout 150 docker run --rm --name "$automation" --network "$network" -e LKB_CONTAINER_MONGO_URL="$url" \
  -e LKB_CONTAINER_AUTOMATION_DB="lkb_work_automation_$db_suffix" "$build_image" \
  node --import tsx scripts/qa/container-workflows/mongo-proofs.mjs | tee docker-evidence/automation-mongo.json
timeout 30 docker run -d --name "$web" -p 127.0.0.1:18080:80 "$web_image" >/dev/null
ready=false
for attempt in {1..30}; do
  if curl --fail --silent --connect-timeout 2 --max-time 5 http://127.0.0.1:18080/ -o docker-evidence/web-root.html; then ready=true; break; fi
  sleep 2
done
[[ "$ready" == true ]]
curl --fail --silent --connect-timeout 2 --max-time 5 http://127.0.0.1:18080/settings -o docker-evidence/web-spa.html
grep -q 'id="root"' docker-evidence/web-root.html
cmp docker-evidence/web-root.html docker-evidence/web-spa.html
echo 'Scoped isolated image checks completed; real capture/providers/source acceptance remain separate gates.'
