# Container Image Security Audit & Remediation Runbook

## 1. Executive Summary
* **Target Microservice:** `enterprise-auth-service`
* **Scanning Engine:** Aqua Security Trivy (Vulnerability & Misconfiguration Detection)
* **Objective:** Audit the baseline container image, identify application-level and OS-level vulnerabilities, and refactor the build artifact into a hardened, production-ready image adhering to the principle of least privilege.

---

## 2. Baseline Image Security Posture (`Dockerfile.vulnerable`)

### Configuration Breakdown
* **Base Image:** `node:16-buster` (Debian 10 full distribution)
* **Runtime User Context:** `root` (UID `0`)
* **Package Management:** Native `npm` bundled within the production runtime
* **Shell Availability:** `/bin/sh`, `/bin/bash` active and accessible

### Trivy Scan Findings (Baseline)
A scan targeting severities `HIGH,CRITICAL` revealed a large attack footprint across two distinct vectors:

#### Operating System Flaws (Debian Buster Base)
* Widespread unpatched vulnerabilities across native packages (`libssl`, `ncurses-base`, `ncurses-bin`, `openssh-client`, `perl`, `python2.7`, `python3.7`, `wget`, `zlib1g`).
* Kernel-level CVEs including Use-After-Free (UAF), out-of-bounds memory writes, and privilege escalation vulnerabilities (e.g., `CVE-2024-1086`, `CVE-2024-26654`, `CVE-2024-27000`, `CVE-2024-36886`).
* Python runtimes containing critical XML External Entity (XXE) and URL sanitization flaws (`CVE-2022-48565`, `CVE-2022-0391`, `CVE-2020-10735`).

#### Application Dependency Flaws (`node-pkg`)
* **Total Vulnerabilities:** 44 (CRITICAL: 1, HIGH: 43)
* **Key Pinned Vulnerabilities:**
  * `jsonwebtoken: 8.5.1` — **CVE-2022-23539** (Unrestricted key type validation leading to legacy key usage and signature verification bypass).
  * `tar: 6.1.11` — **CVE-2026-59873** (CRITICAL: Denial of Service via crafted gzip bomb) and path traversal symlink overwrite vulnerabilities (`CVE-2026-23745`, `CVE-2026-23950`, `CVE-2026-24842`).
  * `body-parser: 1.19.0` — **CVE-2024-45590**, **CVE-2026-111181** (Denial of Service via unhandled decompression stream errors).
  * `path-to-regexp: 0.1.7` — **CVE-2024-45296**, **CVE-2024-52798**, **CVE-2026-4867** (Catastrophic backtracking regular expression ReDoS).
  * `brace-expansion: 1.1.11` & `2.0.1` — Multiple DoS vulnerabilities via stack exhaustion and uncontrolled recursion (`CVE-2026-102276`, `CVE-2026-102278`, `CVE-2026-13149`, `CVE-2026-14257`, `CVE-2026-69152`).
  * `qs: 6.7.0` — **CVE-2022-24999** (Prototype poisoning causing process termination/hangs).

---

## 3. Remediation Strategy & Implementation

To address both vulnerability layers without introducing runtime breaking changes, four architectural remediations were implemented:

### 1. Multi-Stage Build Architecture
Separated the build and compilation environments from the final production runtime:
* **Stage 1 (`builder`):** Uses `node:20-alpine` to install production dependencies deterministically using `npm ci --only=production`. Build caches, native compilers, and the npm CLI toolchain remain confined to this temporary layer.
* **Stage 2 (`runtime`):** Uses Google Container Registry's Distroless Node.js image (`gcr.io/distroless/nodejs20-debian12:nonroot`). Only production runtime artifacts (`node_modules`, `package.json`, `server.js`) are copied into this final image.

### 2. Elimination of Shell & OS Package Attack Surfaces
By adopting Google Distroless:
* No package managers exist in the runtime (`apt`, `apt-get`, `dpkg`, `apk`).
* No interactive shells exist (`/bin/sh`, `/bin/bash`). If an application component experiences an arbitrary code execution flaw, an attacker cannot spawn an interactive shell or download external payloads via `curl`/`wget`.
* Peripheral runtimes (Python, Perl, OpenSSH) are eliminated.

### 3. Application Dependency Modernization
Updated direct dependencies in `package.json` to patched semver releases:
* `jsonwebtoken`: Bumped from `8.5.1` to `^9.0.2` (Resolves CVE-2022-23539).
* `express`: Bumped from `4.17.1` to `^4.21.2` (Pulls patched sub-dependencies for `body-parser`, `qs`, `path-to-regexp`, and `send`).
* `helmet`: Bumped from `4.6.0` to `^8.0.0` (Enforces modern HTTP security headers).
* `dotenv`: Bumped to `^16.4.5`.
* Generated a clean, reproducible `package-lock.json` file.

### 4. Non-Root Security Context Enforcement
* Set `USER nonroot:nonroot` (UID `65532`).
* Enforces least-privilege execution, mitigating container-escape risks against the underlying host kernel.

---

## 4. Verification & Audit Comparison

### Audit Metrics Matrix

| Evaluation Vector | Baseline Image (`node:16-buster`) | Hardened Image (`distroless:nonroot`) | Impact |
| :--- | :--- | :--- | :--- |
| **Node.js Dependencies (`node-pkg`)** | 44 (HIGH: 43, CRITICAL: 1) | **0 High / 0 Critical** | **100% Remediation** |
| **OS Packages Present** | Full Debian package suite | Minimal runtime glibc/libssl dependencies | Stripped OS surface |
| **Shell Access** | `/bin/bash`, `/bin/sh` accessible | **None** | Attack vector closed |
| **Process Execution User** | `root` (UID `0`) | `nonroot` (UID `65532`) | Host containment enforced |
| **Lockfile Guarantee** | None (Unpinned `npm install`) | Deterministic `package-lock.json` via `npm ci` | Supply chain integrity |

### Remaining OS Findings Analysis (`libssl3`)
The final scan of `enterprise-auth-service:hardened` flagged 7 CVEs under `libssl3` (`3.0.18-1~deb12u2`) in Debian 12.13. 

* **Analysis:** These findings reside strictly in the upstream base image maintainer's OpenSSL shared library (`debian:12` glibc dependencies).
* **Mitigation:** The application code contains zero vulnerabilities, runs without root privileges, and has no accessible shell or file transfer binaries to facilitate an exploitation chain. Tracking upstream base image updates (`gcr.io/distroless/nodejs20-debian12`) via CI/CD rebuilds handles patch consumption as newer Debian 12 point releases are published.

---

## 5. Deployment & Execution Instructions

### Local Verification
```bash
# Build the hardened artifact
docker build -f Dockerfile -t enterprise-auth-service:hardened .

# Run container on dedicated host port
docker run -d -p 3000:3000 --name auth-api-hardened enterprise-auth-service:hardened

# Validate HTTP response
curl -i http://localhost:3000/healthz

# Confirm non-root context execution
docker inspect --format '{{.Config.User}}' enterprise-auth-service:hardened