# Enterprise Auth Microservice & Container Security Hardening

A production Node.js JWT authentication microservice hardened through multi-stage container builds, vulnerability elimination (Trivy), and least-privilege execution contexts.

---

## 📊 Security Remediation Results

| Metric | Baseline (`Dockerfile.vulnerable`) | Hardened (`Dockerfile`) |
| :--- | :--- | :--- |
| **Base Image** | `node:16-buster` | `gcr.io/distroless/nodejs20-debian12:nonroot` |
| **Node.js CVEs** | **44 (High / Critical)** | **0** |
| **OS Attack Surface** | Full Debian package suite (~400+ MB) | Distroless minimal runtime (~130 MB) |
| **Shell Access** | `/bin/bash`, `/bin/sh` enabled | **None (Distroless)** |
| **Execution User** | `root` (UID 0) | `nonroot` (UID 65532) |

---

## 🛠 Architecture & Hardening Strategies

1. **Multi-Stage Build Pattern:** Confines package managers (`npm`), caches, and build-time tooling to a transient builder stage (`node:20-alpine`).
2. **Distroless Runtime:** The final image contains only runtime binaries and dependencies—eliminating shell and package manager escape vectors.
3. **Non-Root Execution:** Enforces `USER nonroot:nonroot` (UID 65532) to prevent privilege escalation to the host Kubernetes node.
4. **Automated CI/CD Gate:** GitHub Actions workflow automatically builds, scans with Trivy, and uploads SARIF reports to GitHub Security.

---

## 🚀 Local Quickstart

### Run Hardened Container
```bash
docker build -f Dockerfile -t enterprise-auth-service:hardened .
docker run -d -p 3000:3000 --name auth-api enterprise-auth-service:hardened