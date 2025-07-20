#!/bin/bash

# Certificate Installation Helper
# Helps install the self-signed certificate in various browsers/systems

CERT_FILE="$(dirname "$0")/sc-mgr.crt"

echo "🔐 SSL Certificate Installation Helper"
echo "======================================"

if [[ ! -f "$CERT_FILE" ]]; then
    echo "❌ Certificate file not found: $CERT_FILE"
    exit 1
fi

echo "📍 Certificate location: $CERT_FILE"
echo ""

echo "🌐 To trust this certificate in browsers:"
echo ""

echo "Chrome/Chromium:"
echo "1. Go to chrome://settings/certificates"
echo "2. Click 'Authorities' tab"
echo "3. Click 'Import' and select: $CERT_FILE"
echo "4. Check 'Trust this certificate for identifying websites'"
echo ""

echo "Firefox:"
echo "1. Go to about:preferences#privacy"
echo "2. Scroll to 'Certificates' and click 'View Certificates'"
echo "3. Click 'Authorities' tab, then 'Import'"
echo "4. Select: $CERT_FILE"
echo "5. Check 'Trust this CA to identify websites'"
echo ""

echo "macOS System:"
echo "1. Double-click: $CERT_FILE"
echo "2. Add to 'System' keychain"
echo "3. Open Keychain Access, find 'sc-mgr.local'"
echo "4. Double-click > Trust > 'Always Trust'"
echo ""

echo "Linux System:"
echo "sudo cp '$CERT_FILE' /usr/local/share/ca-certificates/sc-mgr.crt"
echo "sudo update-ca-certificates"
echo ""

echo "⚠️  Remember: Self-signed certificates show security warnings"
echo "   For production, use certificates from a trusted CA"
echo ""
