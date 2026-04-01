#!/bin/bash

# Script to setup SSL certificates for Condenser development
# Usage: setup-cert.sh [--steamdeck]
# Examples:
#   setup-cert.sh                    # Local development
#   setup-cert.sh --steamdeck        # Steam Deck development

STEAM_DECK_MODE=false
STEAM_DECK_IP="steamdeck"

# Parse arguments
while [[ $# -gt 0 ]]; do
    case $1 in
        --steamdeck)
            STEAM_DECK_MODE=true
            shift
            ;;
        --help|-h)
            echo "Usage: $0 [--steamdeck]"
            echo "Examples:"
            echo "  $0                    # Local development"
            echo "  $0 --steamdeck        # Steam Deck development"
            exit 0
            ;;
        -*)
            echo "Unknown option: $1"
            echo "Use --help for usage information"
            exit 1
            ;;
        *)
            echo "Unexpected argument: $1"
            echo "Use --help for usage information"
            exit 1
            ;;
    esac
done

# Get development server IP (if available)
get_dev_ip() {
    # Try to get IPv4 address from network interfaces
    # On macOS, common interfaces are en0, en1, etc.
    for iface in en0 en1 en2 en3 en4 en5 en6 en7 en8 en9; do
        if ifconfig "$iface" 2>/dev/null | grep -q 'status: active'; then
            ip=$(ifconfig "$iface" 2>/dev/null | grep 'inet ' | grep -v '127.0.0.1' | awk '{print $2}' | head -1)
            if [ -n "$ip" ]; then
                echo "$ip"
                return 0
            fi
        fi
    done
    
    # Fallback: try any interface with an IP
    ip=$(ifconfig 2>/dev/null | grep 'inet ' | grep -v '127.0.0.1' | awk '{print $2}' | head -1)
    if [ -n "$ip" ]; then
        echo "$ip"
        return 0
    fi
    
    return 1
}

DEV_IP=$(get_dev_ip)

# Always include base domains
DOMAINS=("localhost" "127.0.0.1" "::1")

# Add development IP if available
if [ -n "$DEV_IP" ]; then
    DOMAINS+=("$DEV_IP")
fi

echo "Generating certificates for: ${DOMAINS[*]}"

# Create certs directory
mkdir -p certs

# Install mkcert CA
mkcert -install

# Generate certificate
mkcert -key-file certs/key.pem -cert-file certs/cert.pem "${DOMAINS[@]}"

if [ "$STEAM_DECK_MODE" = true ]; then
    echo "Setting up SSL certificate on Steam Deck at $STEAM_DECK_IP"
    echo "Development server IP: $DEV_IP"

    # Get the CA certificate location
    CA_CERT=$(mkcert -CAROOT)/rootCA.pem

    if [ ! -f "$CA_CERT" ]; then
        echo "Error: CA certificate not found. Run certificate generation first."
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
    echo "Adding to system trust store..."
    if ! ssh -t deck@$STEAM_DECK_IP "sudo cp /tmp/condenser-rootCA.pem /etc/ca-certificates/trust-source/anchors/condenser-rootCA.crt && sudo trust extract-compat"; then
        echo "Warning: Failed to add certificate to system trust store"
    fi

    # Add to NSS database for Steam browser
    echo "Adding to NSS database for Steam browser..."
    if ! ssh deck@$STEAM_DECK_IP "mkdir -p ~/.pki/nssdb && certutil -d sql:~/.pki/nssdb -A -n 'Condenser Development CA' -t 'TCu,Cu,Tu' -i /tmp/condenser-rootCA.pem 2>/dev/null"; then
        echo "Warning: NSS database setup failed - Steam may need to be restarted"
    fi

    # Try to add to Steam's certificate store if it exists
    echo "Checking for Steam certificate store..."
    ssh deck@$STEAM_DECK_IP "find ~/.steam -name '*.db' -o -name '*cert*' 2>/dev/null | head -5" || true

    # Clean up
    ssh deck@$STEAM_DECK_IP "rm /tmp/condenser-rootCA.pem"

    # Verify certificate installation
    echo "Verifying certificate installation..."
    if ssh deck@$STEAM_DECK_IP "ls -la /etc/ca-certificates/trust-source/anchors/condenser-rootCA.crt"; then
        echo "✓ Certificate added to system trust store"
    else
        echo "✗ Certificate not found in system trust store"
    fi

    if ssh deck@$STEAM_DECK_IP "certutil -d sql:~/.pki/nssdb -L | grep 'Condenser Development CA'"; then
        echo "✓ Certificate found in NSS database"
    else
        echo "✗ Certificate not found in NSS database"
    fi

    echo "Certificate installed successfully!"
    echo "Setup complete! The Steam Deck should now trust certificates from your development server."
    echo "IMPORTANT: You may need to restart Steam on the Steam Deck for certificate changes to take effect."
    echo "Test by navigating to https://$DEV_IP:3000 and https://$DEV_IP:3001 in the Steam Deck browser."
else
    echo "Certificate generated successfully for localhost development!"
fi
echo "WebSocket connections should now work without certificate errors."