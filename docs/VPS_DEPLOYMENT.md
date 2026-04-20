# Linux Server Deployment — From Zero to Production

> **Goal**: After reading this, you'll understand Linux process management, systemd, nginx,
> and deployment deeply enough that Docker will feel like "oh, it's just automating what I already know."
> 
> This isn't a "copy-paste commands" guide. Every command is explained at the WHY level.
>
> **Status**: ✅ Deployed on Oracle Cloud VPS (`140.238.143.166`) using Cloudflare Tunnel.

---

## Table of Contents

1. [The Mental Model — What "Deploying" Actually Means](#the-mental-model)
2. [Processes — The Foundation of Everything](#processes)
3. [SSH — Your Remote Terminal](#ssh)
4. [Setting Up the Server](#setting-up-the-server)
5. [Deploying Jarvis Backend](#deploying-jarvis-backend)
6. [systemd — The Process Supervisor](#systemd)
7. [nginx — The Reverse Proxy (Theory + Why It Failed)](#nginx)
8. [Cloudflare Tunnel — What Actually Worked](#cloudflare-tunnel)
9. [Logs & Monitoring](#logs--monitoring)
10. [The Complete Picture](#the-complete-picture)
11. [How This Connects to Docker](#how-this-connects-to-docker)

---

## The Mental Model

### What Happens When You Run `uvicorn app.main:app`

On your Windows PC:
```
You open terminal → type command → uvicorn starts → you see logs
You close terminal → uvicorn dies
You go to sleep → your PC sleeps → API is gone
```

On a server in production:
```
Server is always on (24/7, no sleep)
API must survive:
  - Your SSH session disconnecting
  - The process crashing
  - The server rebooting
  - Memory leaks over time
  - Multiple processes hogging the same port
```

**"Deploying" = making your app run reliably 24/7 without you babysitting it.**

### Our Actual Architecture (What's Running Right Now)

```
┌──────────────────────────────────────────────────────────┐
│  User's Browser                                          │
│  https://xxxxx.trycloudflare.com/health                  │
└──────────────────────┬───────────────────────────────────┘
                       │ HTTPS (Cloudflare handles this)
                       ▼
┌──────────────────────────────────────────────────────────┐
│  Cloudflare Edge Network                                 │
│  - Free HTTPS (SSL/TLS termination)                      │
│  - DDoS protection built-in                              │
│  - Global CDN                                            │
└──────────────────────┬───────────────────────────────────┘
                       │ Encrypted tunnel (OUTBOUND from VPS)
                       ▼
┌──────────────────────────────────────────────────────────┐
│  cloudflared (Tunnel Agent)                               │
│  - Runs on VPS as systemd service                        │
│  - Creates OUTBOUND connection to Cloudflare             │
│  - No inbound ports needed!                              │
│  - Forwards traffic to localhost:8000                    │
└──────────────────────┬───────────────────────────────────┘
                       │ HTTP (localhost only)
                       ▼
┌──────────────────────────────────────────────────────────┐
│  uvicorn (ASGI Server)                                   │
│  - Runs your FastAPI app                                 │
│  - Managed by systemd (auto-restart on crash)            │
│  - Logs go to journald                                   │
│  - Binds to 127.0.0.1:8000 (localhost only)             │
└──────────────────────┬───────────────────────────────────┘
                       │
                       ▼
┌──────────────────────────────────────────────────────────┐
│  FastAPI App (app.main:app)                               │
│  - Your Python code                                      │
│  - ChromaDB (jarvis.db) on persistent disk               │
└──────────────────────────────────────────────────────────┘
```

**Why this stack?**
- nginx was our first plan, but Oracle Cloud's deep packet inspection blocked inbound HTTP (explained in the [nginx section](#nginx))
- Cloudflare Tunnel bypasses all cloud firewalls by using OUTBOUND connections
- systemd keeps both uvicorn and cloudflared running 24/7

---

## Processes — The Foundation of Everything

Before systemd makes sense, you need to understand Linux processes.

### What IS a Process?

A process is a running program. When you type `uvicorn app.main:app`, Linux:

1. Creates a new process (allocates memory, assigns a PID)
2. Loads the uvicorn binary into memory
3. uvicorn starts executing (imports your Python code, opens port 8000)
4. The process is now "running" and has a unique **PID** (Process ID)

```bash
# See all running processes
ps aux

# Output:
# USER   PID  %CPU %MEM  COMMAND
# root     1   0.0  0.1  /sbin/init          ← PID 1 = systemd (always)
# root   432   0.0  0.3  /usr/sbin/sshd      ← SSH server
# ubuntu 1234  2.1  1.5  uvicorn app.main:app ← Your API
# ubuntu 1235  0.5  0.8  python3 ...          ← Worker process
```

### Foreground vs. Background Processes

```bash
# FOREGROUND: Process is attached to your terminal
# If you close the terminal → process dies
# If you press Ctrl+C → process dies
uvicorn app.main:app
# You can't type anything else — terminal is "occupied"

# BACKGROUND: Detach with & at the end
uvicorn app.main:app &
# Terminal is free — you can type other commands
# But the process STILL dies if you close SSH!

# WHY? Because of "signals". When you close SSH:
#   1. SSH sends SIGHUP (Signal Hangup) to all child processes
#   2. Your uvicorn receives SIGHUP
#   3. Default SIGHUP behavior = terminate
#   4. uvicorn dies

# PARTIAL FIX: nohup (no hangup)
nohup uvicorn app.main:app &
# Now SIGHUP is ignored — process survives SSH disconnect
# But: if it crashes, it stays dead. No auto-restart.
# And: no easy way to stop/start/check status
# And: logs go to nohup.out (no rotation, grows forever)
```

### The Problem Tree

```
"I want my API to run permanently"
    │
    ├── Just run it in terminal?
    │   └── ❌ Dies when you close SSH
    │
    ├── Use nohup?
    │   └── ❌ Dies on crash, no auto-restart, messy logs
    │
    ├── Use screen/tmux?
    │   └── ❌ Better, but still no auto-restart, no boot start
    │
    └── Use systemd? ✅
        ├── Auto-restart on crash
        ├── Auto-start on boot
        ├── Clean start/stop/restart commands
        ├── Structured logging with journald
        ├── Resource limits (CPU, memory)
        └── Dependency management (start after network is up)
```

---

## SSH — Your Remote Terminal

### What IS SSH?

SSH (Secure Shell) gives you a terminal on a remote machine. It's like opening PowerShell, but the commands run on the VPS — not your PC.

```bash
# Connect to your VPS
ssh ubuntu@140.238.143.166

# What happens:
# 1. Your PC connects to port 22 on the VPS
# 2. SSH encrypts the connection (TLS-like, but SSH protocol)
# 3. You authenticate (password or SSH key)
# 4. You get a bash shell running ON the VPS
# 5. Every command you type runs on the VPS
```

### SSH Keys (How to Login Without a Password)

```bash
# On your Windows PC — generate a key pair
ssh-keygen -t ed25519 -C "dinesh@jarvis"
# This creates:
#   ~/.ssh/id_ed25519      ← PRIVATE key (NEVER share this)
#   ~/.ssh/id_ed25519.pub  ← PUBLIC key (safe to share)

# Copy your public key to the VPS
ssh-copy-id ubuntu@140.238.143.166
# Or manually:
# 1. Copy the contents of id_ed25519.pub
# 2. SSH into the VPS
# 3. Paste into ~/.ssh/authorized_keys

# Now you can login without a password:
ssh ubuntu@140.238.143.166
# No password prompt! The SSH key proves your identity.
```

**Why keys are better than passwords**:
- Can't be brute-forced (2^256 possible keys vs. dictionary attacks)
- No password sent over the network
- Can revoke a specific key without changing the password

---

## Setting Up the Server

### Step 1: First Login & System Update

```bash
# SSH into your VPS
ssh ubuntu@140.238.143.166

# First thing on any new server: UPDATE EVERYTHING
sudo apt update && sudo apt upgrade -y

# WHAT THIS DOES:
# apt update    → Downloads the latest package LIST (like refreshing Maven Central)
# apt upgrade   → Installs newer versions of installed packages
# -y            → Auto-confirm (don't ask "do you want to continue?")
# sudo          → Run as root (admin). Like "Run as Administrator" on Windows.

# WHY?
# Servers ship with outdated packages. Security patches are released daily.
# An unpatched server is an open door for attackers.
```

### Step 2: Install Required Software

```bash
# Install Python and required tools
sudo apt install -y python3 python3-venv python3-pip git

# Check versions
python3 --version    # Should be 3.10+ 
git --version        # Should work

# WHAT IS python3-venv?
# The module that creates virtual environments.
# Ubuntu DOESN'T include it by default (unlike Windows/Mac Python).
# Without it: "python3 -m venv" fails with "No module named venv"

# Install Cloudflare Tunnel agent
curl -L https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-amd64.deb -o cloudflared.deb
sudo dpkg -i cloudflared.deb
rm cloudflared.deb
```

### Step 3: Clone & Set Up Jarvis

```bash
# Clone your repo (as ubuntu user — our actual setup)
cd ~
git clone https://github.com/YOUR_USERNAME/jarvis.git
cd jarvis

# Set up Python virtual environment
python3 -m venv venv
source venv/bin/activate

# Install dependencies
pip install -r requirements.txt

# Create .env file with your real API key
cat > .env << 'EOF'
GEMINI_API_KEY=your-actual-key-here
EOF

# Test that it works
uvicorn app.main:app --host 127.0.0.1 --port 8000
# You should see "Jarvis API started" — Ctrl+C to stop
```

> **Note on dedicated users**: In a corporate environment, you'd create a
> separate `jarvis` user (`sudo useradd -r -s /bin/bash -m jarvis`) for
> the Principle of Least Privilege. For our personal VPS, running as
> `ubuntu` is fine. The systemd services below use `User=ubuntu`.

---

## systemd — The Process Supervisor

### What IS systemd?

systemd is the **init system** for Linux — it's PID 1, the very first process that starts when Linux boots. It's the parent of ALL other processes.

```
Linux Boot Sequence:
  1. BIOS/UEFI runs
  2. Bootloader (GRUB) loads the Linux kernel
  3. Kernel starts → launches PID 1 = systemd
  4. systemd reads its config files → starts services:
     - networking
     - SSH server
     - cron (scheduled tasks)
     - jarvis-api service     ← our API
     - jarvis-tunnel service  ← our Cloudflare tunnel
```

**systemd IS the Linux equivalent of "Windows Services".** When you see services in `services.msc` on Windows (like MySQL, Apache, etc.), those are managed by Windows Service Control Manager. On Linux, systemd does the same job.

### Key Concepts

| Concept | What It Means |
|---------|--------------|
| **Unit** | A thing systemd manages (service, timer, mount point, etc.) |
| **Service** | A unit that runs a process (like your API) |
| **Unit file** | The config file that describes the service (`.service` file) |
| **Target** | A group of units (like "multi-user mode" = all non-GUI services) |
| **journald** | systemd's logging system (replaces syslog) |

### Service 1: jarvis-api.service (uvicorn)

```bash
sudo tee /etc/systemd/system/jarvis-api.service << 'EOF'
# ══════════════════════════════════════════════════════════════
# /etc/systemd/system/jarvis-api.service
# ══════════════════════════════════════════════════════════════
# 
# This file tells systemd HOW to run your API.
# Think of it as a "Dockerfile" for systemd — it describes:
#   - What to run
#   - As which user
#   - When to start
#   - What to do when it crashes
#
# In Spring Boot terms, this is like the service wrapper
# that runs your JAR as a Windows Service or Linux daemon.

[Unit]
# ── METADATA ──────────────────────────────────────────────
# Description: Shows up in `systemctl status` and logs
Description=Jarvis Knowledge Vault API

# After: Don't start this service UNTIL these are ready.
# network.target = networking is up (we need to bind to a port)
# 
# This is like Spring Boot's @DependsOn — your API depends
# on the network being available.
After=network.target

# Wants: "I'd like these to be running, but don't fail if they're not"
# (vs. Requires: "MUST be running or I won't start")
Wants=network-online.target

[Service]
# ── WHAT TO RUN ───────────────────────────────────────────

# Type=simple: systemd considers the service "started" as soon as
# the ExecStart process launches. This is correct for uvicorn
# because it starts listening immediately.
#
# Other types:
#   forking:  The process forks a child and exits (like Apache httpd)
#   oneshot:  Runs once and exits (like a migration script)
#   notify:   Process sends "I'm ready" signal to systemd (advanced)
Type=simple

# User/Group: Run as 'ubuntu' user.
# In production, you'd create a dedicated user (e.g., 'jarvis')
# for the Principle of Least Privilege.
User=ubuntu
Group=ubuntu

# WorkingDirectory: cd into this before running ExecStart.
# Your app uses relative paths (./jarvis.db) so this is critical.
WorkingDirectory=/home/ubuntu/jarvis

# Environment: Set environment variables.
# PATH must include the venv/bin so Python uses the right packages.
Environment=PATH=/home/ubuntu/jarvis/venv/bin:/usr/local/bin:/usr/bin
Environment=PYTHONUNBUFFERED=1

# PYTHONUNBUFFERED=1:
# By default, Python buffers stdout. This means log messages
# are held in memory and written in batches. In production,
# if your app crashes, the LAST log messages (the important ones!)
# are lost because they're still in the buffer.
#
# PYTHONUNBUFFERED=1 forces Python to write logs immediately.
# Like System.out.flush() after every println in Java.

# ── THE ACTUAL COMMAND ────────────────────────────────────
ExecStart=/home/ubuntu/jarvis/venv/bin/uvicorn app.main:app --host 127.0.0.1 --port 8000

# WHY --host 127.0.0.1 AND NOT 0.0.0.0?
#   0.0.0.0 = Listen on ALL network interfaces (accessible from outside)
#   127.0.0.1 = Listen on LOCALHOST ONLY (only this machine can connect)
#
# We use 127.0.0.1 because cloudflared connects locally.
# The tunnel handles all internet-facing traffic.
# uvicorn never touches the internet directly.
#
#   Internet → Cloudflare → cloudflared → uvicorn (localhost:8000)

# ── RESTART POLICY ────────────────────────────────────────

# Restart=on-failure: Restart ONLY if the process crashes (exit code ≠ 0).
# Does NOT restart on clean shutdown (systemctl stop).
#
# We use on-failure instead of always because:
# - If you do "systemctl stop", you WANT it to stay stopped
# - If it crashes, you want it to come back
# - The tunnel URL stays the same as long as services don't restart
Restart=on-failure

# RestartSec: Wait 10 seconds before restarting.
# WHY WAIT?
#   If your app crashes immediately on startup (e.g., bad config),
#   without RestartSec, systemd would restart it 1000 times per second.
#   That's a "restart loop" — it wastes CPU and floods logs.
#   10 seconds gives you time to see the error and fix it.
RestartSec=10

# StartLimitBurst + StartLimitIntervalSec: Rate limit restarts.
# "If the service restarts 5 times within 60 seconds, STOP trying."
# This prevents infinite restart loops from eating your server.
StartLimitBurst=5
StartLimitIntervalSec=60

[Install]
# WantedBy: Which "target" should start this service.
# multi-user.target = "normal server mode" (boot without GUI)
# This means: start jarvis-api whenever the server boots up.
#
# In Windows terms: this is like setting a service to "Automatic" startup.
WantedBy=multi-user.target
EOF
```

### Service 2: jarvis-tunnel.service (cloudflared)

```bash
sudo tee /etc/systemd/system/jarvis-tunnel.service << 'EOF'
# ══════════════════════════════════════════════════════════════
# /etc/systemd/system/jarvis-tunnel.service
# ══════════════════════════════════════════════════════════════
#
# This runs the Cloudflare Tunnel that exposes our API to the internet.
# The tunnel creates an OUTBOUND connection to Cloudflare — no inbound
# ports need to be open on the VPS.
#
# IMPORTANT: The trycloudflare.com URL stays the same as long as this
# service doesn't restart. If it DOES restart (crash recovery), you'll
# get a new random URL. Check it with:
#   bash /home/ubuntu/tunnel-url.sh

[Unit]
Description=Jarvis Cloudflare Tunnel

# After + Requires: Don't start the tunnel until the API is running.
# If jarvis-api stops, this service also stops.
# This is like Spring Boot's @DependsOn — tunnel depends on API.
After=jarvis-api.service
Requires=jarvis-api.service

[Service]
Type=simple
User=ubuntu

# --no-autoupdate: Prevents cloudflared from updating itself.
# An auto-update would restart the process → new URL.
# We want maximum uptime on the same URL.
ExecStart=/usr/local/bin/cloudflared tunnel --url http://127.0.0.1:8000 --no-autoupdate

# on-failure: Only restart if it crashes. Don't restart on clean stop.
# RestartSec=30: Wait 30 seconds — give Cloudflare time to clean up
# the old tunnel before we create a new one.
Restart=on-failure
RestartSec=30

[Install]
WantedBy=multi-user.target
EOF
```

### Helper Script: Get Current Tunnel URL

```bash
# Create a script to extract the URL from tunnel logs
cat > /home/ubuntu/tunnel-url.sh << 'SCRIPT'
#!/bin/bash
# Extracts the current trycloudflare.com URL from tunnel service logs
URL=$(sudo journalctl -u jarvis-tunnel --no-pager -n 50 | grep -oP 'https://[a-z0-9-]+\.trycloudflare\.com' | tail -1)
if [ -z "$URL" ]; then
    echo "No tunnel URL found. Is jarvis-tunnel running?"
    echo "Check: sudo systemctl status jarvis-tunnel"
else
    echo "Current tunnel URL: $URL"
fi
SCRIPT
chmod +x /home/ubuntu/tunnel-url.sh
```

### Start Everything

```bash
# Reload systemd configs
sudo systemctl daemon-reload

# Enable both services (start on boot)
sudo systemctl enable jarvis-api jarvis-tunnel

# Start the API first
sudo systemctl start jarvis-api
sleep 2  # Wait for uvicorn to bind

# Start the tunnel
sudo systemctl start jarvis-tunnel
sleep 5  # Wait for tunnel to connect

# Get the tunnel URL
bash /home/ubuntu/tunnel-url.sh
# Output: Current tunnel URL: https://xxxxx.trycloudflare.com

# Verify both are running
sudo systemctl status jarvis-api jarvis-tunnel
```

### systemd Commands — Your Control Panel

```bash
# ── LOAD THE SERVICE ──────────────────────────────────────
# After creating/editing the .service file, tell systemd to re-read it
sudo systemctl daemon-reload
# Like refreshing the service registry. Without this, systemd
# uses the OLD version of your file.

# ── ENABLE (Start on Boot) ────────────────────────────────
sudo systemctl enable jarvis-api
# Creates a symlink so it starts automatically on boot.
# This is like setting "Startup Type: Automatic" in Windows Services.
# DOES NOT start it right now — just marks it for boot.

# ── START ─────────────────────────────────────────────────
sudo systemctl start jarvis-api
# Starts the service NOW.

# ── STOP ──────────────────────────────────────────────────
sudo systemctl stop jarvis-api
# Sends SIGTERM to the process (graceful shutdown).
# Your lifespan shutdown code runs ("Goodbye!").

# ── RESTART ───────────────────────────────────────────────
sudo systemctl restart jarvis-api
# Stop + Start. Use after deploying new code.
# ⚠️  Restarting jarvis-tunnel gives you a NEW URL!

# ── STATUS ────────────────────────────────────────────────
sudo systemctl status jarvis-api
# Shows:
#   - Active: running/stopped/failed
#   - PID
#   - Memory usage
#   - Last few log lines
#   - How long it's been running

# ── LOGS ──────────────────────────────────────────────────
sudo journalctl -u jarvis-api -f
# -u jarvis-api → only show logs for this service
# -f           → follow (like tail -f) — live log stream
# Press Ctrl+C to stop watching

sudo journalctl -u jarvis-api --since "1 hour ago"
# Show logs from the last hour

sudo journalctl -u jarvis-api -n 50
# Show last 50 lines
```

### The Lifecycle — What Happens

```
Server boots up
    ↓
systemd starts (PID 1)
    ↓
systemd reads all .service files
    ↓
jarvis-api.service has WantedBy=multi-user.target
    ↓
systemd starts jarvis-api after network.target
    ↓
uvicorn starts → binds to 127.0.0.1:8000
    ↓
jarvis-tunnel.service requires jarvis-api
    ↓
systemd starts jarvis-tunnel after jarvis-api
    ↓
cloudflared creates outbound tunnel to Cloudflare
    ↓
Cloudflare assigns a trycloudflare.com URL
    ↓
API is publicly accessible via HTTPS ✅
    ↓
(5 hours later) Python exception → uvicorn crashes
    ↓
systemd detects: "process exited with code 1"
    ↓
Restart=on-failure → wait 10 seconds → restart uvicorn
    ↓
API is running again ✅
    ↓
jarvis-tunnel was also stopped (Requires=jarvis-api)
    ↓
systemd restarts tunnel → NEW URL assigned
    ↓
Check new URL: bash /home/ubuntu/tunnel-url.sh
```

---

## nginx — The Reverse Proxy (Theory + Why It Failed)

> **Note**: nginx is NOT part of our final setup. It was our first plan but
> Oracle Cloud's network blocked it. This section explains what nginx IS
> and WHY it failed — important knowledge for any deployment.

### What IS nginx?

nginx (pronounced "engine-X") is a web server. In most setups, it's a **reverse proxy** — it sits BETWEEN the internet and your app.

### Why Use nginx? (On Normal Servers)

```
# Option A: Uvicorn directly exposed (BAD on normal servers)
Internet → uvicorn:8000
Problems:
  ❌ No HTTPS (browsers show "Not Secure")
  ❌ No rate limiting (DDoS will kill your server)
  ❌ No static file serving (uvicorn is slow at this)
  ❌ Port 8000 looks unprofessional (jarvis-api.com:8000)

# Option B: nginx as reverse proxy (GOOD on normal servers)
Internet → nginx:80/443 → uvicorn:127.0.0.1:8000
Benefits:
  ✅ HTTPS termination (nginx handles SSL)
  ✅ Rate limiting built-in
  ✅ Standard ports (80/443 — no :8000 needed)
  ✅ Can load-balance multiple uvicorn workers
```

### What IS a "Reverse Proxy"?

```
FORWARD PROXY (like a VPN):
  You → Proxy → Internet
  "I want to hide MY identity from the website"
  Example: Corporate proxy, VPN

REVERSE PROXY (like nginx):
  Internet → Proxy → Your App
  "I want to hide MY SERVER from the internet"
  Example: nginx, HAProxy, Cloudflare
```

### Why nginx Failed on Our Oracle VPS

We set up nginx correctly. It was listening on port 80. iptables allowed port 80. But:

```
HTTP request from your PC:

Your PC ──── TCP SYN ──────→ Oracle Cloud Network ──→ VPS
         ← TCP SYN-ACK ───← (port 80 is open)   ←──
         ──── HTTP GET ────→ Oracle Cloud Network ──✗── RESET
                                    ↑
                        Oracle's DEEP PACKET INSPECTION
                        saw HTTP data and killed it.
                        
                        TCP handshake passed (SYN/SYN-ACK)
                        but actual HTTP data was RESET.
                        
                        nginx never saw the request.
                        nginx error log was empty.
```

**Oracle Cloud has THREE firewalls**, not one:

```
Layer 1: Security List (cloud console)
  → Controls which ports accept TCP connections
  → Port 80 was OPEN here (Test-NetConnection returned True)

Layer 2: iptables (OS-level)
  → We fixed this by adding ACCEPT rules for port 80
  → Port 80 was OPEN here after our fix

Layer 3: VNIC / Deep Packet Inspection
  → Oracle inspects the CONTENT of packets, not just ports
  → TCP handshake passes (that's just SYN/ACK flags)
  → But HTTP request data gets RESET
  → We CANNOT control this without Oracle Console access
  → This is why curl showed: "connection was reset" AFTER sending the request
```

**The smoking gun** from the verbose curl output:
```
* Established connection     ← TCP handshake OK ✅ (Layer 1 & 2 passed)
> GET /health HTTP/1.1       ← Request sent ✅
* Request completely sent off
* Recv failure: Connection was reset  ← Layer 3 killed it ❌
```

### The Lesson

> **On Oracle Cloud free tier without console access**: Don't fight the firewall.
> Use an outbound tunnel (Cloudflare, ngrok, etc.) to bypass it entirely.
>
> **On AWS, GCP, DigitalOcean, or your own server**: nginx works great.
> The standard setup is nginx → uvicorn, exactly as described above.

### Disabling nginx (Already Done)

```bash
# We disabled nginx since Cloudflare Tunnel replaced it
sudo systemctl stop nginx
sudo systemctl disable nginx
# nginx config is still at /etc/nginx/sites-available/jarvis
# if you ever need it on a different server
```

---

## Cloudflare Tunnel — What Actually Worked

### Why It Bypasses Everything

The key insight: **direction of connection**.

```
NGINX (inbound — blocked):
  Internet ──→ Oracle firewall ──✗──→ VPS port 80
  Direction: INBOUND (internet → VPS)
  Oracle can block this at any layer.

CLOUDFLARE TUNNEL (outbound — works):
  VPS ──→ Oracle firewall ──→ Cloudflare servers
  Direction: OUTBOUND (VPS → internet)
  Oracle NEVER blocks outbound — your VPS needs internet for:
    - apt update (package updates)
    - pip install (Python packages)
    - git clone (code)
    - DNS resolution
    - Everything else
  Blocking outbound would make the server useless.

THEN:
  User ──→ Cloudflare servers ──→ [through tunnel] ──→ VPS:8000
  The user talks to Cloudflare, Cloudflare forwards through the
  existing outbound tunnel. Oracle never sees inbound HTTP.
```

### How Cloudflare Tunnel Works (Under the Hood)

```
Step 1: cloudflared starts on your VPS
    ↓
Step 2: Creates a WebSocket connection OUTBOUND to Cloudflare edge
    (This is just HTTPS to Cloudflare — always allowed)
    ↓
Step 3: Cloudflare assigns a random subdomain
    (e.g., respected-executed-treatment-briefing.trycloudflare.com)
    ↓
Step 4: Cloudflare creates DNS records pointing to their edge
    ↓
Step 5: User visits the URL
    → Request hits Cloudflare's edge servers
    → Cloudflare finds the tunnel connected from your VPS
    → Forwards the request through the WebSocket tunnel
    → cloudflared receives it, forwards to localhost:8000
    → uvicorn processes it, sends response back
    → Response travels back through the tunnel
    → User gets the response

The VPS never receives inbound traffic.
Everything flows through the OUTBOUND WebSocket.
```

### Quick Tunnel vs. Named Tunnel

| Feature | Quick Tunnel (our setup) | Named Tunnel |
|---------|------------------------|--------------|
| URL | Random (changes on restart) | Fixed (your domain) |
| Account needed | No | Yes (free Cloudflare account) |
| Command | `cloudflared tunnel --url ...` | `cloudflared tunnel run ...` |
| HTTPS | ✅ Free, automatic | ✅ Free, automatic |
| Persistence | URL lives as long as process runs | URL is permanent |
| Best for | Personal tools, development | Production, shared services |

### Getting the Current URL

```bash
# After starting/restarting the tunnel, get the URL:
bash /home/ubuntu/tunnel-url.sh

# Or manually from the logs:
sudo journalctl -u jarvis-tunnel -n 30 | grep trycloudflare
```

---

## Logs & Monitoring

### Viewing Logs

```bash
# ── Jarvis API logs ───────────────────────────────────────
sudo journalctl -u jarvis-api -f          # Live tail
sudo journalctl -u jarvis-api -n 100      # Last 100 lines
sudo journalctl -u jarvis-api --since "1 hour ago"
sudo journalctl -u jarvis-api -p err      # Only errors

# ── Cloudflare Tunnel logs ────────────────────────────────
sudo journalctl -u jarvis-tunnel -f       # Live tail
sudo journalctl -u jarvis-tunnel -n 30    # Last 30 lines

# ── Both services together ────────────────────────────────
sudo journalctl -u jarvis-api -u jarvis-tunnel -f
```

### Log Rotation (Preventing Disk Full)

systemd's journald automatically rotates logs. But you can configure it:

```bash
# /etc/systemd/journald.conf
# SystemMaxUse=500M    ← Max 500MB of logs total
# MaxRetentionSec=30d  ← Delete logs older than 30 days
```

### Quick Health Check Script

```bash
# Create a simple monitoring script
cat > /home/ubuntu/healthcheck.sh << 'EOF'
#!/bin/bash
STATUS=$(curl -s -o /dev/null -w "%{http_code}" http://127.0.0.1:8000/health)
if [ "$STATUS" != "200" ]; then
    echo "$(date): Jarvis API is DOWN (HTTP $STATUS)" >> /home/ubuntu/monitor.log
    sudo systemctl restart jarvis-api
fi
EOF
chmod +x /home/ubuntu/healthcheck.sh

# Run it every 5 minutes with cron
crontab -e
# Add this line:
# */5 * * * * /home/ubuntu/healthcheck.sh
```

---

## The Complete Picture

### Full Deployment Checklist (What We Actually Did)

```bash
# 1. SSH into VPS
ssh ubuntu@140.238.143.166

# 2. Update system
sudo apt update && sudo apt upgrade -y

# 3. Install dependencies
sudo apt install -y python3 python3-venv python3-pip git

# 4. Install cloudflared
curl -L https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-amd64.deb -o cloudflared.deb
sudo dpkg -i cloudflared.deb && rm cloudflared.deb

# 5. Clone and set up app
cd ~
git clone https://github.com/YOUR_USERNAME/jarvis.git
cd jarvis
python3 -m venv venv
source venv/bin/activate
pip install -r requirements.txt
echo "GEMINI_API_KEY=your-key" > .env

# 6. Create systemd services
# (paste jarvis-api.service and jarvis-tunnel.service from above)
sudo systemctl daemon-reload
sudo systemctl enable jarvis-api jarvis-tunnel

# 7. Start services
sudo systemctl start jarvis-api
sleep 2
sudo systemctl start jarvis-tunnel
sleep 5

# 8. Get your URL
bash /home/ubuntu/tunnel-url.sh

# 9. Disable nginx (not needed with tunnel)
sudo systemctl stop nginx
sudo systemctl disable nginx

# 10. Update frontend .env.local on your PC
# API_URL=https://xxxxx.trycloudflare.com
```

### Updating Code (Deploy New Version)

```bash
# SSH into VPS
ssh ubuntu@140.238.143.166

# Pull latest code
cd ~/jarvis
git pull origin main

# Install any new dependencies
source venv/bin/activate
pip install -r requirements.txt

# Restart ONLY the API (not the tunnel — keeps same URL!)
sudo systemctl restart jarvis-api

# Verify it's running
sudo systemctl status jarvis-api
```

> ⚠️ **IMPORTANT**: Only restart `jarvis-api`, NOT `jarvis-tunnel`.
> Restarting the tunnel gives you a new URL. The tunnel automatically
> reconnects to the restarted API because it's on localhost.
>
> ...Actually, since `jarvis-tunnel` has `Requires=jarvis-api`, stopping
> the API also stops the tunnel. To avoid this, just do a quick restart:
> `sudo systemctl restart jarvis-api` — the tunnel stays connected
> because the restart is fast enough.

---

## How This Connects to Docker

### The Aha Moment

After understanding everything above, Docker becomes obvious:

```
WITHOUT DOCKER (what we just did):
  1. SSH into server
  2. Install Python 3.12
  3. Install pip packages
  4. Create venv
  5. Clone code
  6. Set env vars
  7. Create systemd service
  8. Set up cloudflared tunnel
  9. Hope it works the same as on your laptop 🤞

WITH DOCKER:
  1. Write a Dockerfile (instructions to build the environment)
  2. docker build (creates an image with Python + packages + code)
  3. docker run (starts the container — like a lightweight VM)
  4. Done. Works EXACTLY the same everywhere.
```

### Docker = systemd + venv + apt, Automated

| Manual Deployment | Docker Equivalent |
|-------------------|-------------------|
| `apt install python3` | `FROM python:3.12` |
| `python3 -m venv venv` | (built into the image) |
| `pip install -r requirements.txt` | `RUN pip install -r requirements.txt` |
| `git clone ...` | `COPY . /app` |
| systemd service file | `docker run --restart=always` |
| `uvicorn app.main:app` | `CMD ["uvicorn", "app.main:app"]` |
| Environment variables | `docker run -e GEMINI_API_KEY=...` |

```dockerfile
# Dockerfile — THIS replaces steps 2-6 from our manual deployment
FROM python:3.12-slim

WORKDIR /app
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
COPY . .

CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
```

```bash
# Build the image (creates the environment)
docker build -t jarvis-api .

# Run it (like systemd — auto-restart, auto-start on boot)
docker run -d \
    --name jarvis \
    --restart=always \
    -p 8000:8000 \
    -e GEMINI_API_KEY=your-key \
    -v jarvis-data:/app/jarvis.db \
    jarvis-api
```

### The Key Insight

> **Docker doesn't replace systemd. Docker IS systemd + venv + apt + filesystem isolation, packaged together.**
>
> If you understand systemd service files, you understand 80% of what Docker does.
>  - `Restart=always` → `--restart=always`
>  - `User=jarvis` → Container runs as non-root
>  - `WorkingDirectory=` → `WORKDIR`
>  - `Environment=` → `-e` flag
>  - `ExecStart=` → `CMD`
>
> Docker adds one thing systemd doesn't: **image portability**.
> A Docker image works on ANY machine with Docker installed.
> A systemd service requires manual setup on each server.

---

## Quick Reference Card

```bash
# ── systemd ───────────────────────────────────────
sudo systemctl start jarvis-api       # Start API
sudo systemctl stop jarvis-api        # Stop API
sudo systemctl restart jarvis-api     # Restart API (tunnel stays)
sudo systemctl status jarvis-api      # Status + recent logs
sudo systemctl enable jarvis-api      # Start on boot
sudo systemctl disable jarvis-api     # Don't start on boot
sudo systemctl daemon-reload          # Reload service files

# ── Tunnel ────────────────────────────────────────
sudo systemctl start jarvis-tunnel    # Start tunnel
sudo systemctl stop jarvis-tunnel     # Stop tunnel
sudo systemctl status jarvis-tunnel   # Check tunnel status
bash /home/ubuntu/tunnel-url.sh       # Get current URL

# ── journald (logs) ──────────────────────────────
sudo journalctl -u jarvis-api -f      # Live API logs
sudo journalctl -u jarvis-tunnel -f   # Live tunnel logs
sudo journalctl -u jarvis-api -n 100  # Last 100 API log lines
sudo journalctl -u jarvis-api -p err  # Only errors

# ── Process management ───────────────────────────
ps aux | grep uvicorn                 # Find uvicorn processes
ps aux | grep cloudflared             # Find tunnel process
kill -15 PID                          # Graceful shutdown (SIGTERM)
kill -9 PID                           # Force kill (SIGKILL, last resort)
htop                                  # Interactive process viewer

# ── Deploy new code ──────────────────────────────
cd ~/jarvis && git pull origin main
source venv/bin/activate && pip install -r requirements.txt
sudo systemctl restart jarvis-api     # DON'T restart tunnel!
```
