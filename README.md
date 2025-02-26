## Deployment Instructions

1. **Clone the repository:**

   ```bash
   git clone git@github.com:matheus-swenson/alvorada-k8s-test.git
   cd alvorada-k8s-test

2. **Install Dependencies:**
    ```bash
    npm install

3. **Configure Pulumi**
    ```bash
    pulumi config set isMinikube true

4. **Deploy the Stack**
    ```bash
    pulumi up

## Grafana Access

After deployment, Grafana is exposed in the default namespace.

If using Minikube:
Grafana is exposed via NodePort. To access Grafana, run:
    ```bash
    minikube service kube-prometheus-stack-grafana

Admin Credentials:
Username: admin
Password: admin123

## Verifying Guestbook Metrics in Prometheus
To verify that Prometheus is correctly scraping metrics from your Guestbook components:

Access the Prometheus UI

Use port-forwarding or minikube:


kubectl port-forward svc/kube-prometheus-stack-prometheus 9090:80 -n default
minikube service prometheus-server

Then open http://localhost:9090 in your browser.

# Run Metric Queries

Some example queries:

redis_blocked_clients

As the application dont have the metrics endpoint publishing metrics I have focused in collect metrics from the backend.
