#!/bin/bash

# Script to setup SSL certificate on Steam Deck for Condenser development
STEAM_DECK_IP=${1:-steamdeck}
DEV_SERVER_IP=$(node -e "const os = require('os'); const nets = os.networkInterfaces(); for (const name of Object.keys(nets)) { for (const net of nets[name]) { if (net.family === 'IPv4' && !net.internal) { console.log(net.address); process.exit(0); } } }")

echo "Setting up SSL certificate on Steam Deck at $STEAM_DECK_IP"
echo "Development server IP: $DEV_SERVER_IP"

# Get the CA certificate location
CA_CERT=$(mkcert -CAROOT)/rootCA.pem

if [ ! -f "$CA_CERT" ]; then
    echo "Error: CA certificate not found. Run 'npm run certs' first."
    exit 1
fi

echo "Found CA certificate at: $CA_CERT"

# Test SSH connection
echo "Testing SSH connection to Steam Deck..."
if ! ssh -o ConnectTimeout=5 deck@$STEAM_DECK_IP "echo 'SSH connection successful'" 2>/dev/null; then
    echo "Error: Cannot connect to Steam Deck via SSH."
    echo "Make sure SSH is enabled and you can connect with: ssh deck@$STEAM_DECK_IP"
    exit 1
fi

# Copy CA certificate to Steam Deck
echo "Copying CA certificate to Steam Deck..."
scp "$CA_CERT" deck@$STEAM_DECK_IP:/tmp/condenser-rootCA.pem

# Install certificate on Steam Deck
echo "Installing certificate on Steam Deck..."
echo "You will be prompted for the deck user password for sudo commands."

# Add certificate to system trust store (SteamOS/Arch Linux)
ssh -t deck@$STEAM_DECK_IP "sudo cp /tmp/condenser-rootCA.pem /etc/ca-certificates/trust-source/anchors/condenser-rootCA.crt"
ssh -t deck@$STEAM_DECK_IP "sudo trust extract-compat"

# Add to NSS database for Steam browser
ssh deck@$STEAM_DECK_IP "mkdir -p ~/.pki/nssdb"
ssh deck@$STEAM_DECK_IP "certutil -d sql:~/.pki/nssdb -A -n 'Condenser Development CA' -t 'TCu,Cu,Tu' -i /tmp/condenser-rootCA.pem 2>/dev/null || echo 'NSS database setup may be needed'"

# Clean up
ssh deck@$STEAM_DECK_IP "rm /tmp/condenser-rootCA.pem"

echo "Certificate installed successfully!"

echo "Setup complete! The Steam Deck should now trust certificates from your development server."
echo "Test by navigating to https://$DEV_SERVER_IP:3000 and https://$DEV_SERVER_IP:3001 in the Steam Deck browser."
echo "WebSocket connections should now work without certificate errors."