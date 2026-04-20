#!/bin/bash
# ============================================================
# Oracle VPS Network Diagnostic Script
# Run this on your VPS: bash /tmp/diagnose.sh
# ============================================================

echo "═══════════════════════════════════════"
echo "1. CHECKING WHAT'S LISTENING"
echo "═══════════════════════════════════════"
sudo ss -tlnp | grep -E ':(80|443|8000)\s'
# Shows which ports have a process listening

echo ""
echo "═══════════════════════════════════════"
echo "2. CHECKING IPTABLES RULES"
echo "═══════════════════════════════════════"
sudo iptables -L INPUT -n --line-numbers | head -30
# Shows the OS-level firewall rules

echo ""
echo "═══════════════════════════════════════"
echo "3. CHECKING IF PORT 80 IS ALLOWED IN IPTABLES"
echo "═══════════════════════════════════════"
sudo iptables -L INPUT -n | grep -E 'dpt:(80|443|8000)'
# If empty = port is not explicitly allowed (might be blocked)

echo ""
echo "═══════════════════════════════════════"
echo "4. CHECKING CLOUD INIT / OCI METADATA"
echo "═══════════════════════════════════════"
curl -s http://169.254.169.254/opc/v1/vnics/ 2>/dev/null | head -5 || echo "Metadata not available"

echo ""
echo "═══════════════════════════════════════"
echo "5. PUBLIC IP"
echo "═══════════════════════════════════════"
curl -s ifconfig.me
echo ""

echo ""
echo "═══════════════════════════════════════"
echo "6. OCI CLI CHECK"
echo "═══════════════════════════════════════"
which oci 2>/dev/null && echo "OCI CLI is installed" || echo "OCI CLI not installed"
