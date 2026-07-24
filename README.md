# Inventario App — CI/CD, Kubernetes y Estrategias de Despliegue

Práctica de laboratorio de Sistemas Distribuidos: pipeline completo de CI/CD para `inventario-app` (interfaz web + API REST + base de datos local en JSON), con empaquetado Docker, publicación automática vía GitHub Actions, despliegue en Kubernetes con rolling update, estrategia Blue-Green, y componentes adicionales de buenas prácticas (Secrets, Readiness con arranque lento, escaneo de seguridad con Trivy).

**Repositorio:** https://github.com/Daft4Less/inventario-app
**Imagen publicada:** `ghcr.io/daft4less/inventario-app`

## Integrantes

- Daniela (dani5G)
- Jose Salamea (Daft4Less)

## Requisitos previos

- Docker Desktop
- Minikube
- kubectl
- Node.js 20+
- Git
- Cuenta de GitHub

## 1. Correr la app en local (sin Docker)

```bash
git clone https://github.com/Daft4Less/inventario-app.git
cd inventario-app
npm install
npm start
```

La app queda disponible en `http://localhost:3000`. Rutas disponibles:

- `GET /` — interfaz web
- `GET /health` — estado de salud (soporta arranque lento simulado, ver sección 7.2)
- `GET /version` — versión, color y hostname
- `GET /api/products` — listado de productos
- `GET /api/secret-check` — confirma si la API_KEY fue cargada (ver sección 7.1)

Correr las pruebas:

```bash
npm test
```

## 2. Construir y probar la imagen Docker localmente

El `Dockerfile` es multi-stage:

- Etapa `build`: instala dependencias y corre `npm test`. Si las pruebas fallan, el build se detiene ahí y no se genera imagen.
- Etapa `runtime`: imagen final mínima. Solo copia `server.js`, `db.js` y `public/`, e instala únicamente dependencias de producción. Además elimina explícitamente `npm`, `npx`, `corepack` y `yarn` (no se necesitan para ejecutar `node server.js`), reduciendo la superficie de vulnerabilidades.

```bash
docker build -t inventario-app:local .
docker run -d -p 3000:3000 --name inventario-local inventario-app:local
curl http://localhost:3000/
curl http://localhost:3000/health
curl http://localhost:3000/version
curl http://localhost:3000/api/products
docker stop inventario-local
docker rm inventario-local
```

## 3. CI/CD con GitHub Actions

El workflow `.github/workflows/ci-cd.yml` tiene dos jobs encadenados, cumpliendo el principio fail-fast:

- **build-test**: instala dependencias (`npm ci`) y corre `npm test`.
- **build-push**: solo se ejecuta si `build-test` tuvo éxito (`needs: build-test`). Construye la imagen localmente (sin publicarla), la escanea con Trivy, y solo si el escaneo no encuentra vulnerabilidades `CRITICAL`, la etiqueta y la publica en `ghcr.io` (con el hash del commit y con `latest`).

Cada `git push` a `main` dispara el pipeline automáticamente. Se verifica en la pestaña **Actions** del repositorio en GitHub.

Nota técnica: el nombre del repositorio se normaliza a minúsculas dentro del workflow (`${GITHUB_REPOSITORY,,}`), ya que ghcr.io exige nombres de imagen en minúsculas.

## 4. Despliegue base en Kubernetes (rolling update)

Manifiestos: `k8s/deployment.yaml`, `k8s/service.yaml`.

```bash
minikube start
kubectl apply -f k8s/deployment.yaml
kubectl apply -f k8s/service.yaml
kubectl rollout status deployment/inventario-app
kubectl get pods
kubectl get service inventario-app-service
```

El Deployment usa `strategy: RollingUpdate` con `maxUnavailable: 1` y `maxSurge: 1`, y 2 réplicas mínimas. Los pods llevan la etiqueta `tier: base`, que los distingue de los Deployments de Blue-Green (sección 6) y evita que el Service base les envíe tráfico por error.

Para acceder al servicio en Windows con el driver Docker de Minikube (necesario dejar la terminal abierta mientras se usa):

```bash
minikube service inventario-app-service --url
```

Con la URL/puerto que entregue ese comando, en otra terminal:

```bash
curl http://127.0.0.1:PUERTO/health
curl http://127.0.0.1:PUERTO/version
curl http://127.0.0.1:PUERTO/api/products
```

Para actualizar los pods a la última imagen publicada sin recrear el Deployment:

```bash
kubectl rollout restart deployment/inventario-app
kubectl rollout status deployment/inventario-app
```

## 5. Observación: pérdida de datos al recrear un pod

La base de datos de esta app es un archivo JSON (`data/products.json`) que vive dentro del sistema de archivos del propio contenedor, sin volumen persistente.

```bash
# 1. Crear un producto desde la interfaz web (http://127.0.0.1:PUERTO)
# 2. Confirmar que existe:
curl http://127.0.0.1:PUERTO/api/products

# 3. Identificar y borrar un pod:
kubectl get pods
kubectl delete pod <nombre-del-pod>

# 4. Confirmar que Kubernetes recreo el pod:
kubectl get pods

# 5. Volver a consultar los productos:
curl http://127.0.0.1:PUERTO/api/products
```

El producto creado en el paso 1 desaparece: el pod nuevo es un contenedor distinto, arrancado desde la misma imagen, y la base de datos se vuelve a sembrar desde cero (`SEED` en `db.js`). Esto es un comportamiento esperado dado el diseño de la app (sin `PersistentVolume`) y se analiza en el informe de la Parte II.

## 6. Segunda estrategia de despliegue: Blue-Green

Manifiestos en `k8s/blue-green/`: `deployment-blue.yaml`, `deployment-green.yaml`, `service.yaml`.

Se usan dos Deployments independientes (`inventario-app-blue`, `inventario-app-green`), cada uno con sus propias variables `APP_COLOR`/`APP_VERSION`, y un Service (`inventario-app-bluegreen-service`) cuyo `selector` se cambia manualmente entre `color: blue` y `color: green` para cortar el tráfico de forma instantánea, sin tocar los pods.

```bash
kubectl apply -f k8s/blue-green/deployment-blue.yaml
kubectl apply -f k8s/blue-green/deployment-green.yaml
kubectl apply -f k8s/blue-green/service.yaml

kubectl get pods -l app=inventario-app
kubectl get deployments
kubectl get service inventario-app-bluegreen-service
```

Acceder al servicio:

```bash
minikube service inventario-app-bluegreen-service --url
curl http://127.0.0.1:PUERTO/version
```

Cortar el tráfico de blue a green (comando confirmado funcional en CMD de Windows):

```bash
kubectl patch service inventario-app-bluegreen-service -p "{\"spec\":{\"selector\":{\"app\":\"inventario-app\",\"color\":\"green\"}}}"
curl http://127.0.0.1:PUERTO/version
```

Volver de green a blue:

```bash
kubectl patch service inventario-app-bluegreen-service -p "{\"spec\":{\"selector\":{\"app\":\"inventario-app\",\"color\":\"blue\"}}}"
curl http://127.0.0.1:PUERTO/version
```

Verificar el selector activo en cualquier momento:

```bash
kubectl get service inventario-app-bluegreen-service -o yaml
```

## 7. Componentes adicionales de buenas prácticas

### 7.1 Manejo de secretos

La API_KEY se crea directamente en el clúster con `kubectl`, nunca en un archivo versionado en Git:

```bash
kubectl create secret generic inventario-app-secret --from-literal=API_KEY=<valor-ficticio>
kubectl get secret inventario-app-secret
kubectl describe secret inventario-app-secret
```

`k8s/deployment.yaml` la consume vía `secretKeyRef` (no en texto plano):

```yaml
env:
  - name: API_KEY
    valueFrom:
      secretKeyRef:
        name: inventario-app-secret
        key: API_KEY
```

La app expone `GET /api/secret-check`, que responde `{"apiKeyLoaded": true/false}` sin revelar el valor real, confirmando que la aplicación consume el Secret correctamente:

```bash
curl http://127.0.0.1:PUERTO/api/secret-check
```

Verificación de que el valor de la credencial nunca queda en el historial de Git:

```bash
git log --all -p -- k8s/ | findstr "API_KEY"
```

Este comando solo debe mostrar referencias a `secretKeyRef` y al nombre del campo (`API_KEY`), nunca un valor de credencial en texto plano.

**Nota:** cada clúster de Minikube es independiente. Cada integrante que despliegue este proyecto debe crear su propio Secret localmente con el comando de arriba antes de aplicar `k8s/deployment.yaml`.

### 7.2 Readiness con arranque lento

`server.js` define `STARTUP_DELAY_SECONDS` (variable de entorno) y registra `SERVER_START_TIME` al arrancar el proceso. Mientras no hayan transcurrido `STARTUP_DELAY_SECONDS` segundos desde el arranque, `GET /health` responde `503` con `{"status":"starting"}`, simulando una conexión lenta a base de datos.

`k8s/deployment.yaml` define `STARTUP_DELAY_SECONDS: "15"` y ajusta el `readinessProbe` (`initialDelaySeconds: 5`, `periodSeconds: 5`, `failureThreshold: 6`) para tolerar ese arranque sin que Kubernetes elimine el pod.

Para observar el comportamiento:

```bash
kubectl delete pod <nombre-de-un-pod-base>
kubectl get pods -l app=inventario-app --watch
```

El pod nuevo aparece primero como `0/1` (respondiendo 503 en `/health`) y pasa a `1/1` una vez transcurridos los 15 segundos. También se puede confirmar revisando los eventos del pod:

```bash
kubectl describe pod <nombre-del-pod-nuevo>
```

Debe verse un evento `Warning Unhealthy ... Readiness probe failed: HTTP probe failed with statuscode: 503` seguido de que el pod pasa a `Ready: True`.

**Nota:** aumentar el número de réplicas no resuelve el arranque lento de un pod individual — cada pod nuevo pasa igualmente por sus propios `STARTUP_DELAY_SECONDS` antes de estar listo. Más réplicas aporta capacidad adicional para atender tráfico, pero no acelera el arranque de cada instancia ni sustituye el ajuste correcto del `readinessProbe`.

### 7.3 Escaneo de seguridad con Trivy

El job `build-push` del workflow construye la imagen localmente (`push: false, load: true`), la escanea con la acción `aquasecurity/trivy-action`, y solo si el escaneo no encuentra vulnerabilidades de severidad `CRITICAL` (`exit-code: '1'`, `ignore-unfixed: true`), la etiqueta y la publica en ghcr.io. Si Trivy encuentra una vulnerabilidad `CRITICAL`, el job falla y la imagen no llega a publicarse.

La imagen final del Dockerfile elimina explícitamente `npm`, `npx`, `corepack` y `yarn` en la etapa `runtime`, ya que la imagen en producción solo necesita el binario `node` para ejecutar `node server.js`. Esto reduce la superficie de vulnerabilidades heredadas de la imagen base de Node.

El resultado del escaneo se revisa en la pestaña **Actions** de GitHub, dentro del job `build-push`, paso "Escanear imagen con Trivy".

## 8. Estructura del repositorio

```
inventario-app/
├── .github/workflows/ci-cd.yml   # Pipeline CI/CD
├── Dockerfile                     # Build multi-stage
├── .dockerignore
├── server.js / db.js / public/    # Codigo de la aplicacion
├── server.test.js                 # Pruebas
├── k8s/
│   ├── deployment.yaml            # Deployment base (rolling update)
│   ├── service.yaml               # Service base
│   └── blue-green/
│       ├── deployment-blue.yaml
│       ├── deployment-green.yaml
│       └── service.yaml
└── README.md
```

## 9. Reproducción completa end-to-end (resumen)

```bash
git clone https://github.com/Daft4Less/inventario-app.git
cd inventario-app
minikube start
kubectl create secret generic inventario-app-secret --from-literal=API_KEY=demo-key
kubectl apply -f k8s/deployment.yaml
kubectl apply -f k8s/service.yaml
kubectl apply -f k8s/blue-green/deployment-blue.yaml
kubectl apply -f k8s/blue-green/deployment-green.yaml
kubectl apply -f k8s/blue-green/service.yaml
kubectl rollout status deployment/inventario-app
minikube service inventario-app-service --url
minikube service inventario-app-bluegreen-service --url
```
