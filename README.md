# Resource Desk

A shared equipment booking application for a department or small office. The equipment service owns the asset catalogue and serves a Bootstrap interface. A separate booking service owns reservations and prevents overlapping reservations for the same item, date and time slot.

## Services

| Service | Responsibility | Repository |
| --- | --- | --- |
| Equipment | Asset registration, catalogue queries, maintenance status and web interface | This repository |
| Booking | Reservations, cancellation, availability and duplicate request handling | [Booking service](https://github.com/kaizer03/bits-wilp-cc-sem3-scalable-services-assign1-booking-service) |

Each service has its own PostgreSQL database. Services communicate over HTTP; neither service reads the other's database. The interface uses Bootstrap 5.3 and Bootstrap Icons, served locally from installed packages.

```mermaid
flowchart LR
  Browser[Browser or Postman] --> Equipment[Equipment service]
  Equipment --> EquipmentDB[(Equipment database)]
  Equipment -->|Booking requests| Booking[Booking service]
  Booking -->|Validate equipment| Equipment
  Booking --> BookingDB[(Booking database)]
```

## Local deployment

Requirements: Docker with Compose and Git. The booking service is included as a submodule, pinned to an independently versioned commit. A recursive clone retrieves the complete application.

```sh
git clone --recurse-submodules https://github.com/kaizer03/bits-wilp-cc-sem3-scalable-services-assign1-equipment-service.git
cd bits-wilp-cc-sem3-scalable-services-assign1-equipment-service
printf 'EQUIPMENT_DB_PASSWORD=%s\nBOOKING_DB_PASSWORD=%s\n' "$(openssl rand -hex 24)" "$(openssl rand -hex 24)" > .env
docker compose up -d --build --wait
```

Interface and equipment API: <http://127.0.0.1:4180>. Direct booking API: <http://127.0.0.1:4181>. Database ports are not published. The initial catalogue contains five example assets. `docker compose stop` stops this application's containers and retains the data volumes.

For an existing checkout, `git submodule update --init --recursive` retrieves the pinned booking service. Both services retain their own source repository, dependency lockfile, database schema, Dockerfile and tests.

## Kubernetes deployment

Requirements: Docker, Minikube, kubectl, and the two locally built application images from the Compose deployment. The separate kubeconfig keeps this cluster independent of other local contexts.

```sh
mkdir -p "$HOME/.kube"
export KUBECONFIG="$HOME/.kube/resource-desk.yaml"
minikube start -p resource-desk --driver=docker --cpus=4 --memory=6144 --kubernetes-version=v1.34.1
minikube -p resource-desk image load resource-desk/equipment:1.0.0
minikube -p resource-desk image load resource-desk/booking:1.0.0
minikube -p resource-desk image load postgres:17-alpine
kubectl --context=resource-desk apply -f deploy/kubernetes/namespace.yaml
set -a
. ./.env
set +a
kubectl --context=resource-desk -n resource-desk create secret generic database-credentials \
  --from-literal=equipment-password="$EQUIPMENT_DB_PASSWORD" \
  --from-literal=booking-password="$BOOKING_DB_PASSWORD"
kubectl --context=resource-desk apply -f deploy/kubernetes/
kubectl --context=resource-desk apply -f services/booking/deploy/kubernetes/
kubectl --context=resource-desk -n resource-desk rollout status deployment/equipment
kubectl --context=resource-desk -n resource-desk rollout status deployment/booking
kubectl --context=resource-desk -n resource-desk port-forward service/equipment 14180:4180
```

The Kubernetes interface is available at <http://127.0.0.1:14180> while port forwarding runs. The direct booking API can be exposed in another terminal:

```sh
export KUBECONFIG="$HOME/.kube/resource-desk.yaml"
kubectl --context=resource-desk -n resource-desk port-forward service/booking 14181:4181
```

The deployment creates two application replicas per service and one persistent database per service. Database startup is awaited before application initialization. Health probes check each API and its own database.

```sh
minikube -p resource-desk addons enable dashboard
minikube -p resource-desk addons enable metrics-server
minikube -p resource-desk dashboard
kubectl --context=resource-desk -n resource-desk scale deployment/booking --replicas=3
```

The Minikube dashboard addon uses the archived Kubernetes Dashboard for this local exercise. It must remain locally accessible. Application replicas on one local node do not provide host-level fault tolerance; database replication is outside this implementation.

## Equipment API

| Method | Path | Operation |
| --- | --- | --- |
| GET | `/api/equipment` | List equipment |
| GET | `/api/equipment/:id` | Retrieve one asset |
| POST | `/api/equipment` | Register an asset |
| PATCH | `/api/equipment/:id` | Set operational or maintenance status |
| GET | `/health/live` | Process health |
| GET | `/health/ready` | Database readiness |

Asset registration accepts `assetTag`, `name`, `category`, `location`, and optional `description`. Asset tags are unique. Status updates accept `{"status":"maintenance"}` or `{"status":"operational"}`. Invalid input returns 400; unknown assets return 404; duplicate tags return 409.

The interface forwards `/api/bookings` and `/api/availability` requests to the booking service. Direct service access is also supported. `X-Request-ID` correlates service logs; `X-Instance-ID` identifies the responding API instance. The Postman collection `BITS WILP CC Sem 3 Assign1` in `postman/` groups requests under Equipment Service and Booking Service, including catalogue, reservations, availability, validation, cancellation and health checks. `equipmentBaseUrl` defaults to `http://127.0.0.1:14180`; `bookingBaseUrl` defaults to `http://127.0.0.1:14181`. For Compose, use ports 4180 and 4181 respectively.

## Tests

Node.js 24 or newer and a PostgreSQL test database are required. The test database name must end in `_test`; tests refuse other database names.

```sh
npm ci
TEST_DATABASE_URL=postgres://postgres:password@127.0.0.1:5432/equipment_test npm test
```

Tests cover persisted catalogue entries, unique asset tags, invalid input, maintenance status and catalogue availability during a booking-service outage. They create test records only in the configured test database.

## Structure

```text
src/                 API, database initialization and HTTP handling
public/              Bootstrap interface and application interactions
db/                  Catalogue schema and initial assets
test/                Equipment API tests
deploy/kubernetes/   Equipment API and database resources
postman/             API request collection
services/booking/    Independently versioned booking service submodule
```

## Scope

The application assumes a trusted local department environment. Authentication and user roles are not implemented; management and cancellation actions are available to anyone with local access. Every asset represents one physical item. Reservations use fixed morning and afternoon slots in Asia/Kolkata. Maintenance status is checked when a new booking is requested; changing status does not cancel existing reservations. Inventory checkout, payments and notifications are outside the application.
