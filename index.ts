// Copyright 2016-2025, Pulumi Corporation.  All rights reserved.

import * as pulumi from "@pulumi/pulumi";
import * as k8s from "@pulumi/kubernetes";
import * as k8sjs from "./k8sjs";
import * as fs from "fs";

const config = new pulumi.Config();

const redisLeader = new k8sjs.ServiceDeployment("redis-leader", {
    image: "redis",
    ports: [6379],
});

const redisReplica = new k8sjs.ServiceDeployment("redis-replica", {
    image: "pulumi/guestbook-redis-replica",
    ports: [6379],
});

// Deploy Redis Exporter for redis-leader with Prometheus annotations
const redisExporterLeader = new k8s.apps.v1.Deployment("redis-exporter-leader", {
    metadata: { name: "redis-exporter-leader" },
    spec: {
        replicas: 1,
        selector: { matchLabels: { app: "redis-exporter-leader" } },
        template: {
            metadata: { 
                labels: { app: "redis-exporter-leader" },
                annotations: { 
                    "prometheus.io/scrape": "true",
                    "prometheus.io/port": "9121",
                },
            },
            spec: {
                containers: [{
                    name: "redis-exporter",
                    image: "oliver006/redis_exporter:v1.67.0",
                    env: [
                        { name: "REDIS_ADDR", value: "redis-leader:6379" },
                    ],
                    ports: [{ containerPort: 9121 }],
                }],
            },
        },
    },
});

const redisExporterLeaderService = new k8s.core.v1.Service("redis-exporter-leader", {
    metadata: {
        name: "redis-exporter-leader",
        labels: { app: "redis-exporter-leader" },
    },
    spec: {
        ports: [{ port: 9121, targetPort: 9121 }],
        selector: { app: "redis-exporter-leader" },
    },
});

// Deploy Redis Exporter for redis-replica with Prometheus annotations
const redisExporterReplica = new k8s.apps.v1.Deployment("redis-exporter-replica", {
    metadata: { name: "redis-exporter-replica" },
    spec: {
        replicas: 1,
        selector: { matchLabels: { app: "redis-exporter-replica" } },
        template: {
            metadata: { 
                labels: { app: "redis-exporter-replica" },
                annotations: { 
                    "prometheus.io/scrape": "true",
                    "prometheus.io/port": "9121",
                },                
            },
            spec: {
                containers: [{
                    name: "redis-exporter",
                    image: "oliver006/redis_exporter:v1.67.0",
                    env: [
                        { name: "REDIS_ADDR", value: "redis-replica:6379" },
                    ],
                    ports: [{ containerPort: 9121 }],
                }],
            },
        },
    },
});

const redisExporterReplicaService = new k8s.core.v1.Service("redis-exporter-replica", {
    metadata: {
        name: "redis-exporter-replica",
        labels: { app: "redis-exporter-replica" },
    },
    spec: {
        ports: [{ port: 9121, targetPort: 9121 }],
        selector: { app: "redis-exporter-replica" },
    },
});

const frontend = new k8sjs.ServiceDeployment("frontend", {
    replicas: 3,
    image: "pulumi/guestbook-php-redis",
    ports: [80],
    allocateIpAddress: true,
    isMinikube: config.getBoolean("isMinikube"),
    
});

export let frontendIp = frontend.ipAddress;

// =====================================================================
// Monitoring: Deploy Prometheus and Grafana via Helm Charts in default namespace
// =====================================================================

// Deploy Prometheus using the official Helm chart in the default namespace.
const prometheus = new k8s.helm.v3.Chart("prometheus", {
    namespace: "default",
    chart: "prometheus",
    version: "27.3.1",
    fetchOpts: {
        repo: "https://prometheus-community.github.io/helm-charts",
    },
    values: {
    },
});

// Deploy Grafana using its official Helm chart in the default namespace.
// Use NodePort when running on Minikube; otherwise, use LoadBalancer.
// Disable PSP creation to avoid using the deprecated API.
const grafana = new k8s.helm.v3.Chart("grafana", {
    namespace: "default",
    chart: "grafana",
    version: "8.10.1",
    fetchOpts: {
        repo: "https://grafana.github.io/helm-charts",
    },
    values: {
        fullnameOverride: "grafana",
        service: {
            type: config.getBoolean("isMinikube") ? "NodePort" : "LoadBalancer",
            port: 80,
        },
        // Set default admin credentials.
        adminUser: "admin",
        adminPassword: "admin123",
        // Disable PodSecurityPolicy creation to avoid deprecated API issues.
        podSecurityPolicy: {
            enabled: false,
        },
        sidecar: {
            dashboards: {
                enabled: true,
            },
        },
        datasources: {
            "datasources.yaml": {
                apiVersion: 1,
                datasources: [
                    {
                        name: "prometheus",
                        type: "prometheus",
                        access: "proxy",
                        url: "http://prometheus-server:80",
                        isDefault: true,
                    },
                ],
            },
        },
    },
});
const dashboardJson = fs.readFileSync("763_rev6.json", "utf8");
const grafanaDashboard = new k8s.core.v1.ConfigMap("grafana-dashboard", {
    metadata: {
        name: "grafana-dashboard",
        labels: {
            grafana_dashboard: "1",
        },
    },
    data: {
        "my-dashboard.json": dashboardJson,
    },
});

// Extract the Grafana Service to output its access details.
const grafanaService = grafana.getResource("v1/Service", "grafana");

// For Minikube, output instructions to use the minikube command; otherwise, output the service URL.
const isMinikube = config.getBoolean("isMinikube");
let grafanaUrlOutput: pulumi.Output<string>;

if (isMinikube) {
    grafanaUrlOutput = pulumi.output("Please run: `minikube service grafana` to access Grafana.");
} else {
    grafanaUrlOutput = grafanaService.status.apply(status => {
        const ingress = status?.loadBalancer?.ingress?.[0];
        if (ingress) {
            if (ingress.ip) {
                return `http://${ingress.ip}`;
            } else if (ingress.hostname) {
                return `http://${ingress.hostname}`;
            }
        }
        return "Grafana URL not yet available. Please check the service status.";
    });
}

// Export Grafana access details.
export const grafanaAdminUser = "admin";
export const grafanaAdminPassword = "admin123";
export const grafanaUrl = grafanaUrlOutput;
