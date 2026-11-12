#!/usr/bin/env bash
set -euo pipefail

run_id=${1:?Usage: ./deploy/deliver.sh GITHUB_RUN_ID}
[[ "$run_id" =~ ^[0-9]+$ ]] || { echo "A numeric workflow run ID is required." >&2; exit 1; }
repo=kaizer03/bits-wilp-cc-sem3-scalable-services-assign1-equipment-service
root=$(cd "$(dirname "$0")/.." && pwd)
cd "$root"
export KUBECONFIG="${RESOURCE_DESK_KUBECONFIG:-$HOME/.kube/resource-desk.yaml}"
context=resource-desk
namespace=resource-desk

for command in gh git docker minikube kubectl shasum; do
  command -v "$command" >/dev/null || { echo "Missing command: $command" >&2; exit 1; }
done
[[ -z "$(git status --porcelain)" ]] || { echo "The source checkout must be clean." >&2; exit 1; }
gh run watch "$run_id" --repo "$repo" --exit-status --compact
revision=$(gh run view "$run_id" --repo "$repo" --json headSha --jq .headSha)
event=$(gh run view "$run_id" --repo "$repo" --json event --jq .event)
branch=$(gh run view "$run_id" --repo "$repo" --json headBranch --jq .headBranch)
[[ "$event" == push || "$event" == workflow_dispatch ]] || { echo "Only main-branch builds can be delivered." >&2; exit 1; }
[[ "$branch" == main && "$revision" == "$(git rev-parse HEAD)" ]] || { echo "Run revision must match this main checkout." >&2; exit 1; }

kubectl --context="$context" -n "$namespace" get secret database-credentials >/dev/null
kubectl --context="$context" -n "$namespace" rollout status deployment/equipment-db --timeout=60s
kubectl --context="$context" -n "$namespace" rollout status deployment/booking-db --timeout=60s
old_equipment=$(kubectl --context="$context" -n "$namespace" get deployment equipment -o jsonpath='{.spec.template.spec.containers[0].image}')
old_booking=$(kubectl --context="$context" -n "$namespace" get deployment booking -o jsonpath='{.spec.template.spec.containers[0].image}')
work=$(mktemp -d "${TMPDIR:-/tmp}/resource-desk-delivery.XXXXXX")
deployment_started=false
finish() {
  status=$?
  if [[ "$status" != 0 && "$deployment_started" == true ]]; then
    echo "Delivery failed; restoring previous application images." >&2
    kubectl --context="$context" -n "$namespace" set image deployment/equipment "equipment=$old_equipment" || true
    kubectl --context="$context" -n "$namespace" set image deployment/booking "booking=$old_booking" || true
    kubectl --context="$context" -n "$namespace" rollout status deployment/equipment --timeout=120s || true
    kubectl --context="$context" -n "$namespace" rollout status deployment/booking --timeout=120s || true
  fi
  rm -rf "$work"
  exit "$status"
}
trap finish EXIT

for service in equipment booking; do
  folder="$work/$service"
  gh run download "$run_id" --repo "$repo" --name "$service-image" --dir "$folder"
  [[ "$(cat "$folder/revision.txt")" == "$revision" && "$(cat "$folder/service.txt")" == "$service" ]] || { echo "Artifact metadata mismatch." >&2; exit 1; }
  (cd "$folder" && shasum -a 256 -c image.sha256)
  docker load -i "$folder/image.tar.gz"
  image="resource-desk/$service:ci-${revision:0:12}"
  [[ "$(docker image inspect "$image" --format '{{.Architecture}}')" == arm64 ]] || { echo "The local delivery image must be ARM64." >&2; exit 1; }
  [[ "$(docker image inspect "$image" --format '{{index .Config.Labels "org.opencontainers.image.revision"}}')" == "$revision" ]] || { echo "Image revision mismatch." >&2; exit 1; }
  minikube -p "$context" image load "$image"
done

deployment_started=true
for service in equipment booking; do
  kubectl --context="$context" -n "$namespace" set image "deployment/$service" "$service=resource-desk/$service:ci-${revision:0:12}"
  kubectl --context="$context" -n "$namespace" rollout status "deployment/$service" --timeout=120s
done
kubectl --context="$context" -n "$namespace" exec deployment/equipment -- node -e \
  'Promise.all([fetch("http://equipment:4180/health/ready"),fetch("http://booking:4181/health/ready")]).then(rs=>{if(rs.some(r=>!r.ok))process.exit(1);console.log("Both services are ready.")}).catch(()=>process.exit(1))'
kubectl --context="$context" -n "$namespace" get deployments,pods
echo "Delivered workflow $run_id at revision $revision to $context/$namespace."
