# How Websites Detect & Block Scrapers — Deep Dive

> **Why this matters**: You'll face this in EVERY project that fetches web data.
> Understanding this at a deep level separates junior scraping code from production-grade systems.

---

## Table of Contents

1. [The Arms Race](#the-arms-race)
2. [Layer 1: HTTP Headers — The Easiest Check](#layer-1-http-headers)
3. [Layer 2: TLS Fingerprinting — The Invisible Check](#layer-2-tls-fingerprinting)
4. [Layer 3: JavaScript Challenges — The Browser Test](#layer-3-javascript-challenges)
5. [Layer 4: Browser Fingerprinting — The Identity Check](#layer-4-browser-fingerprinting)
6. [Layer 5: Behavioral Analysis — The Human Test](#layer-5-behavioral-analysis)
7. [The Evasion Toolkit — Libraries & Techniques](#the-evasion-toolkit)
8. [Decision Matrix: What to Use When](#decision-matrix)
9. [What We Did in Jarvis & Why](#what-we-did-in-jarvis)

---

## The Arms Race

Every web scraping story is an arms race between two sides:

```
SCRAPERS                          WEBSITES
─────────                         ────────
Send HTTP request ───────────────→ "Is this a real browser?"
                                        │
                        ┌───────────────┤
                        ▼               ▼
                    YES: 200 OK     NO: 403 Forbidden
                    (serve page)    (block the bot)
```

Websites don't want bots because:
- **Cost**: Each request costs server resources (CPU, bandwidth, database queries)
- **Competition**: Competitors scrape your prices, inventory, content
- **Abuse**: Spam bots, credential stuffing, DDoS
- **Legal**: GDPR, copyright, terms of service

So they add layers of detection. Each layer catches more sophisticated bots:

```
Layer 5: Behavioral analysis (mouse moves, scroll patterns)
Layer 4: Browser fingerprinting (canvas, WebGL, fonts)
Layer 3: JavaScript challenges (Cloudflare, PerimeterX)
Layer 2: TLS fingerprinting (JA3/JA4 hashes)
Layer 1: HTTP headers (User-Agent, Accept, Order)
─────────────────────────────────────────────────
Layer 0: IP rate limiting (too many requests = blocked)
```

**Most websites only use Layers 0-1.** Only high-value targets (airlines, ticketing, e-commerce) use Layer 2+. Let's go through each.

---

## Layer 1: HTTP Headers

### What the Website Checks

When your browser visits `https://example.com`, it sends these headers:

```http
GET / HTTP/1.1
Host: example.com
User-Agent: Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36
Accept: text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8
Accept-Language: en-US,en;q=0.5
Accept-Encoding: gzip, deflate, br
Connection: keep-alive
Upgrade-Insecure-Requests: 1
Sec-Fetch-Dest: document
Sec-Fetch-Mode: navigate
Sec-Fetch-Site: none
Sec-Fetch-User: ?1
```

When Python's `requests` library visits the same URL:

```http
GET / HTTP/1.1
Host: example.com
User-Agent: python-requests/2.31.0
Accept: */*
Accept-Encoding: gzip, deflate
Connection: keep-alive
```

### The Differences That Get You Caught

| Signal | Real Browser | Python requests |
|--------|-------------|-----------------|
| User-Agent | Chrome/120 with full platform info | `python-requests/2.31.0` 🚨 |
| Accept | Complex with priorities (`q=0.9`) | Just `*/*` 🚨 |
| Accept-Language | `en-US,en;q=0.5` | Missing entirely 🚨 |
| Sec-Fetch-* | Present (4 headers) | Missing entirely 🚨 |
| Header ORDER | Specific order | Different order 🚨 |
| Accept-Encoding | `gzip, deflate, br` (brotli) | `gzip, deflate` (no brotli) |

A website just checks: "Does this look like a real browser?" → No → 403.

### The Fix Most People Try (And Why It's Not Enough)

```python
# ❌ Everyone's first attempt — just set User-Agent
headers = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) ..."
}
requests.get(url, headers=headers)
```

This works on ~60% of sites. But smart sites check MORE than just User-Agent:

```python
# ✅ Better: Include ALL headers a real browser would send
headers = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 ...",
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8",
    "Accept-Language": "en-US,en;q=0.5",
    "Accept-Encoding": "gzip, deflate, br",
    "Connection": "keep-alive",
    "Upgrade-Insecure-Requests": "1",
    "Sec-Fetch-Dest": "document",
    "Sec-Fetch-Mode": "navigate",
    "Sec-Fetch-Site": "none",
    "Sec-Fetch-User": "?1",
    "Cache-Control": "max-age=0",
}
```

### Why Header ORDER Matters

This blew my mind when I first learned it.

HTTP headers are technically unordered. But in practice:
- Chrome ALWAYS sends headers in a specific order
- Firefox sends them in a DIFFERENT order
- Python `requests` sends them in yet ANOTHER order

Some CDNs (like Cloudflare) check header order:

```http
# Chrome always sends: Host → User-Agent → Accept → Accept-Language → ...
# Python requests sends: User-Agent → Accept → Accept-Encoding → Connection → Host

# The website sees: "Claims to be Chrome, but header order is wrong" → 403
```

**This is why even setting all the right header VALUES isn't enough — they need to be in the right ORDER.**

Python `requests` uses a `dict` for headers. Dicts in Python 3.7+ preserve insertion order, so you CAN control the order — but the library itself adds some headers internally in its own order.

---

## Layer 2: TLS Fingerprinting

### This Is The One That Gets Everyone

This is the layer you mentioned — **TLS fingerprinting**. It's the #1 reason your scraper gets 403'd even with perfect headers.

### What Is TLS?

When you visit `https://example.com`, before any HTTP is sent, your browser and the server do a "TLS handshake" to set up encryption:

```
Your Browser                          Server
     │                                  │
     │──── CLIENT HELLO ───────────────→│  "Hi, I support these 
     │     • TLS version: 1.3          │   ciphers and extensions"
     │     • Cipher suites: [list]     │
     │     • Extensions: [list]        │
     │     • Supported groups: [list]  │
     │     • Signature algorithms      │
     │                                  │
     │←─── SERVER HELLO ───────────────│  "OK, let's use this cipher"
     │                                  │
     │←──→ KEY EXCHANGE ──────────────→│
     │                                  │
     │     🔒 Encrypted connection     │
     │     NOW send HTTP headers       │
```

### The JA3 Fingerprint

In 2017, security researchers from Salesforce created **JA3** — a technique to fingerprint clients based on their TLS Client Hello message.

The JA3 hash is computed from:
1. TLS version
2. Cipher suites (the list and ORDER)
3. Extensions (the list and ORDER)
4. Elliptic curves (supported groups)
5. Elliptic curve point formats

```
Chrome 120:     JA3 = 773,4865-4866-4867-49195-49199-...,0-23-65281-...
Firefox 121:    JA3 = 771,4865-4867-4866-49195-49199-...,0-23-65281-...
Python requests: JA3 = 771,4866-4867-4865-49196-49200-...,0-23-65281-...
curl:           JA3 = 771,4865-4866-4867-49195-49199-...,0-11-10-35-...
```

**Each JA3 hash is essentially a unique fingerprint for the software making the request.**

### How Cloudflare Uses This

```
1. Request arrives at Cloudflare
2. Cloudflare reads the TLS Client Hello → computes JA3 hash
3. Checks: Does this JA3 match a known browser?
   - Chrome JA3? ✅ Pass
   - Firefox JA3? ✅ Pass
   - Python-requests JA3? ❌ BLOCK → 403
   - curl JA3? ❌ BLOCK → 403
4. THEN check HTTP headers (User-Agent, etc.)
```

**Key insight**: TLS fingerprinting happens BEFORE HTTP headers are even sent. You can set `User-Agent: Chrome/120` all you want — Cloudflare already knows you're Python because of the TLS handshake.

### Why You Can't Fix This With `requests`

Python's `requests` uses `urllib3` which uses Python's built-in `ssl` module. The `ssl` module creates TLS handshakes in Python's way — not Chrome's way. You have NO control over:
- Which cipher suites are offered
- What ORDER they're offered in
- Which TLS extensions are sent
- How the ALPN negotiation works

It's like wearing a Chrome mask but having Python's skeleton — X-ray (TLS fingerprint) reveals the truth.

### JA4 — The Next Generation

JA3 has been partially superseded by **JA4** (2023), which includes:
- More data points (ALPN, SNI, signature algorithms)
- Harder to spoof
- Better at distinguishing similar clients

---

## Layer 3: JavaScript Challenges

### The "Are You a Browser?" Test

Cloudflare, PerimeterX (now HUMAN), Akamai, and others use JavaScript challenges:

```html
<!-- What the server initially returns (not the real page) -->
<html>
<head><title>Just a moment...</title></head>
<body>
  <h1>Checking your browser...</h1>
  <script>
    // This script does several things:
    // 1. Checks if JavaScript can execute (bots using requests can't)
    // 2. Solves a math challenge (proof of work)
    // 3. Checks browser APIs (window, navigator, document)
    // 4. Sets a __cf_bm cookie
    // 5. Redirects to the real page with the cookie
    
    var challenge = computeChallenge();  // CPU-intensive math
    document.cookie = "__cf_bm=" + challenge;
    window.location.reload();
  </script>
</body>
</html>
```

```
Request 1: GET /page → "Checking your browser..." (JS challenge)
           Script runs → Solves challenge → Sets cookie

Request 2: GET /page (with cookie) → Real page content ✅
```

**Python's `requests` can't execute JavaScript.** It gets the challenge page and stops. This is exactly what happened with `0de5.net/explore` — we got the HTML shell but no content because the real content is rendered by React (which is JavaScript).

### The Difference Between "JS Rendering" and "JS Challenge"

- **JS Rendering** (React, Next.js, Vue): The content IS the JavaScript. Without running it, you just get `<div id="root"></div>`. This is NOT an anti-bot measure — it's just how the site is built.

- **JS Challenge** (Cloudflare Under Attack Mode): The content requires solving a CHALLENGE first. Even headless browsers need to wait and solve it. This IS an anti-bot measure.

Both require JavaScript execution, but for different reasons.

---

## Layer 4: Browser Fingerprinting

### Beyond HTTP — Testing the Browser Itself

When a headless browser (Playwright, Puppeteer, Selenium) passes the JS challenge, websites go deeper:

```javascript
// Sites run JavaScript like this to detect bots:

// 1. WebDriver flag
navigator.webdriver  
// Real Chrome: undefined or false
// Selenium: true 🚨
// Playwright: true (without stealth) 🚨

// 2. Chrome object
window.chrome
// Real Chrome: {runtime: {...}, ...}
// Headless Chrome: undefined 🚨

// 3. Canvas fingerprint
const canvas = document.createElement('canvas');
const ctx = canvas.getContext('2d');
ctx.fillText('Hello', 10, 10);
canvas.toDataURL();
// Real browser: unique hash based on GPU
// Headless: known hash for headless Chrome 🚨

// 4. WebGL renderer
const gl = canvas.getContext('webgl');
gl.getParameter(gl.RENDERER);
// Real: "ANGLE (Intel HD Graphics 620)"
// Headless: "Google SwiftShader" 🚨

// 5. Plugin count
navigator.plugins.length
// Real Chrome: 3-5 plugins
// Headless: 0 🚨

// 6. Languages
navigator.languages
// Real: ["en-US", "en"]
// Headless: [] or ["en"] 🚨

// 7. Screen resolution consistency
window.screen.width × window.screen.height
window.outerWidth × window.outerHeight
// Real: outer < screen (browser chrome takes space)
// Headless: outer = screen (no browser UI) 🚨

// 8. Permissions API
navigator.permissions.query({name: "notifications"})
// Real: "prompt" or "denied"
// Headless: throws error 🚨
```

**Websites collect 50+ of these signals and compute a "bot score".** If enough signals fail → blocked.

### The `navigator.webdriver` Example

This is the most famous one:

```javascript
// In a real browser, this is false:
console.log(navigator.webdriver); // false

// In Selenium/Playwright, this is true:
console.log(navigator.webdriver); // true

// Websites literally do:
if (navigator.webdriver) {
    // BLOCK — this is a bot
    window.location = "/captcha";
}
```

This is why Selenium gets caught so easily out of the box.

---

## Layer 5: Behavioral Analysis

### The Final Boss

Even if you pass all other checks, advanced sites analyze your BEHAVIOR:

```
Bot behavior:                    Human behavior:
├── Requests every 0.1s          ├── Random delays (2-10 seconds)
├── Goes straight to target page ├── Browses around first
├── No mouse movement            ├── Mouse moves in curves
├── No scrolling                 ├── Scrolls through content
├── Visits 0 images/CSS          ├── Browser loads everything
├── Linear timing                ├── Variable timing
└── Same IP, 1000 requests/hour  └── Reasonable request rate
```

Airlines and ticketing sites (Ticketmaster, airline booking) use this heavily. They track:
- Mouse movement patterns (bots move in straight lines, humans in curves)
- Scroll behavior
- Time between actions
- Keystroke dynamics
- Whether you load images and CSS (real browsers do)

---

## The Evasion Toolkit

### Level 0: Basic — `requests` with Good Headers

```python
# Works on ~60% of sites
import requests

headers = {
    "User-Agent": "Mozilla/5.0 ...",
    "Accept": "text/html,...",
    "Accept-Language": "en-US,en;q=0.5",
}
response = requests.get(url, headers=headers)
```

**Beats**: Layer 0-1 (basic header checks)
**Fails against**: TLS fingerprinting, JS challenges

---

### Level 1: `httpx` — Better HTTP Client

```python
# httpx supports HTTP/2, which browsers use
# Some sites check: "You claim to be Chrome but use HTTP/1.1?" → 403
import httpx

client = httpx.Client(http2=True)
response = client.get(url, headers=headers)
```

**Beats**: Sites that check HTTP version
**Fails against**: Full TLS fingerprinting

---

### Level 2: `curl_cffi` — TLS Fingerprint Spoofing ⭐

```python
# THE library for TLS fingerprinting evasion
# It wraps curl (C library) and can impersonate specific browsers
from curl_cffi import requests as curl_requests

# This sends the EXACT TLS fingerprint of Chrome 120
response = curl_requests.get(
    url,
    impersonate="chrome120",  # Magic parameter
)
# The JA3 hash now matches real Chrome 120!
```

**How `curl_cffi` works under the hood**:
1. It uses `curl` (C library) instead of Python's `ssl` module
2. `curl` is patched to send specific TLS Client Hello messages
3. The cipher suite list, order, and extensions match the target browser
4. The JA3 hash is now identical to a real Chrome browser
5. Header order is also matched

**Supported impersonation targets**:
```python
# Chrome versions
"chrome99", "chrome100", "chrome101", ..., "chrome120", "chrome124"

# Firefox versions  
"firefox99", "firefox100", ..., "firefox120"

# Safari
"safari15_3", "safari15_5", "safari17_0"

# Edge
"edge99", "edge101"
```

**Beats**: Layers 0-2 (headers + TLS fingerprinting)
**Fails against**: JS challenges (still can't execute JS)
**Install**: `pip install curl_cffi`

---

### Level 3: `tls-client` — Go-Based TLS Spoofing

```python
# Alternative to curl_cffi — uses a Go library for TLS
import tls_client

session = tls_client.Session(
    client_identifier="chrome_120",
    random_tls_extension_order=True,  # Randomize to avoid detection
)

response = session.get(url, headers=headers)
```

**How it differs from curl_cffi**:
- Uses a Go library (`utls`) instead of curl
- Supports HTTP/2 push
- `random_tls_extension_order` adds noise to prevent pattern detection
- Slightly better at evading JA4

**Install**: `pip install tls-client`

---

### Level 4: Playwright / Puppeteer — Real Browser

```python
# Nuclear option: use an actual browser
from playwright.sync_api import sync_playwright

with sync_playwright() as p:
    browser = p.chromium.launch(headless=True)
    page = browser.new_page()
    page.goto("https://example.com")
    
    # Wait for JS to render
    page.wait_for_load_state("networkidle")
    
    # Now get the fully-rendered content
    content = page.content()
    text = page.inner_text("body")
    
    browser.close()
```

**Beats**: Layers 0-3 (headers, TLS, JS rendering)
**Fails against**: Browser fingerprinting (navigator.webdriver is true)
**Heavy**: Downloads Chromium (~150MB), slow to start

---

### Level 5: `playwright-stealth` / `undetected-chromedriver` — Stealth Browser

```python
# Playwright with stealth patches
from playwright.sync_api import sync_playwright
from playwright_stealth import stealth_sync

with sync_playwright() as p:
    browser = p.chromium.launch(headless=True)
    page = browser.new_page()
    
    # Apply stealth patches:
    # - Sets navigator.webdriver = false
    # - Adds fake plugins (3+)
    # - Fixes WebGL renderer string
    # - Adds chrome.runtime object
    # - Fixes permissions API
    # - Randomizes canvas fingerprint
    stealth_sync(page)
    
    page.goto("https://example.com")
    content = page.inner_text("body")
```

```python
# Or for Selenium — undetected-chromedriver
import undetected_chromedriver as uc

driver = uc.Chrome()  
# Automatically:
# - Patches navigator.webdriver
# - Uses real Chrome (not chromedriver)
# - Randomizes fingerprints
# - Handles Cloudflare challenges

driver.get("https://example.com")
text = driver.page_source
```

**Beats**: Layers 0-4 
**Fails against**: Advanced behavioral analysis
**Install**: `pip install playwright-stealth` or `pip install undetected-chromedriver`

---

### Level 6: Services — Let Someone Else Handle It

When the target is too hard (Cloudflare Enterprise, PerimeterX, Akamai Bot Manager):

| Service | What It Does | Price |
|---------|-------------|-------|
| **Jina Reader** (`r.jina.ai`) | Renders JS, returns Markdown | Free (rate-limited) |
| **ScrapingBee** | Manages browsers, proxies, CAPTCHAs | $49/mo |
| **Browserless** | Headless Chrome as a service | $10/mo |
| **Bright Data** | Residential proxies + browser | $$$$ |
| **Zenrows** | Anti-bot bypass API | $49/mo |

**This is what we used in Jarvis** — Jina Reader does the hard work for us.

---

## Decision Matrix

```
"I need to scrape a website. What should I use?"

Is the site static HTML (blog, docs, wiki)?
 └── YES → requests + BeautifulSoup ✅ (Jarvis Stage 1)
 └── NO ↓

Is it a JS-rendered SPA (React, Vue, Next.js)?
 └── YES → Is it behind Cloudflare/anti-bot?
              └── NO → Jina Reader or Playwright ✅ (Jarvis Stage 2)
              └── YES ↓

Is it behind Cloudflare or similar?
 └── YES → Does it block TLS fingerprints?
              └── NO → curl_cffi with impersonate ✅
              └── YES → Does it have JS challenges?
                          └── NO → curl_cffi ✅
                          └── YES → playwright-stealth or undetected-chromedriver ✅

Still blocked? 
 └── Use a scraping service (ScrapingBee, Zenrows)
```

### Quick Reference Table

| Technique | Bypasses | Speed | Complexity | Dependencies |
|-----------|----------|-------|------------|-------------|
| `requests` + headers | Basic header checks | ⚡ Fast | Low | None |
| `httpx` (HTTP/2) | HTTP version checks | ⚡ Fast | Low | httpx |
| `curl_cffi` | TLS fingerprinting | ⚡ Fast | Medium | curl_cffi (includes C lib) |
| `tls-client` | TLS fingerprinting | ⚡ Fast | Medium | tls-client (includes Go lib) |
| Playwright | JS rendering | 🐢 Slow (~3s) | Medium | Chromium (~150MB) |
| Playwright + stealth | Browser fingerprinting | 🐢 Slow (~3s) | High | Chromium + patches |
| `undetected-chromedriver` | Everything except behavior | 🐢 Slow | Medium | Chrome browser |
| Jina Reader API | JS rendering (delegated) | 🐌 Slow (~5s) | None | Just HTTP |
| Scraping services | Almost everything | Varies | Low (API call) | None (but costs money) |

---

## What We Did in Jarvis & Why

### Our Problem
```
https://www.0de5.net/explore → React app → BeautifulSoup gets empty shell → 92 chars
```

### What We Initially Tried
```python
# Attempt 1: Direct scrape with browser User-Agent
requests.get(url, headers={"User-Agent": "Chrome/120..."})
# Result: Got HTML but it's a React shell — only 92 chars of text

# Attempt 2: Jina Reader with browser User-Agent  
requests.get("https://r.jina.ai/" + url, headers={"User-Agent": "Chrome/120..."})
# Result: 403 Forbidden!
```

### Why the 403 Happened

Jina Reader's server (probably behind Cloudflare) detected the mismatch:
```
TLS fingerprint: Python-requests (JA3 hash = abc123...)
User-Agent header: "Chrome/120.0.0.0"

Cloudflare thinks: "TLS says Python, but User-Agent says Chrome?
                    That's suspicious. BLOCK." → 403
```

**The irony**: Setting a Chrome User-Agent made us MORE suspicious, not less! 
The TLS fingerprint already revealed we're Python. Claiming to be Chrome on top 
of that looks like we're TRYING to be deceptive → blocked.

### The Fix
```python
# Don't send User-Agent at all — let requests send its default
requests.get("https://r.jina.ai/" + url, headers={"Accept": "text/plain"})
# Result: 200 OK ✅

# WHY: Python-requests default UA = "python-requests/2.31.0"
# TLS fingerprint = Python
# User-Agent = Python
# Everything is CONSISTENT → Jina treats it as a normal API call
```

### The Lesson

> **Consistency is more important than spoofing.**
> 
> If your TLS fingerprint says "Python" but your User-Agent says "Chrome",
> you look MORE suspicious than just being honest about being Python.
> 
> Only spoof if you can spoof ALL layers consistently.
> Use `curl_cffi` (which spoofs TLS + headers together) or use your real identity.

---

## Summary — Rules of Web Scraping

1. **Start simple** — `requests` works on most sites. Don't over-engineer.
2. **Consistency matters** — If you spoof User-Agent, you need to spoof TLS too. Half-spoofing is worse than no spoofing.
3. **TLS fingerprinting is invisible** — You can't see it, debug it, or change it with `requests`. You need `curl_cffi` or a real browser.
4. **JavaScript rendering ≠ anti-bot** — React/Next.js sites aren't blocking you. They just need JS to render. Use Jina or Playwright.
5. **Escalate gradually** — requests → curl_cffi → Playwright → service. Each step adds complexity.
6. **Respect rate limits** — Even if you CAN bypass detection, hammering a site will get your IP blocked. Add delays.
7. **Use services for the hard stuff** — Your time is worth more than $49/mo. If a site is hard to scrape, let ScrapingBee do it.
