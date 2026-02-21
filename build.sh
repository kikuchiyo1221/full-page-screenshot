#!/bin/bash

# Build script for Chrome Web Store packaging
# Creates a ZIP file ready for upload

set -e

EXTENSION_DIR="$(cd "$(dirname "$0")" && pwd)"
BUILD_DIR="${EXTENSION_DIR}/build"
ZIP_NAME="screenshot-extension.zip"

echo "Building Chrome Extension package..."

# Clean previous build
rm -rf "$BUILD_DIR"
mkdir -p "$BUILD_DIR"

# Files and directories to include
INCLUDE=(
  "manifest.json"
  "_locales"
  "icons/icon16.png"
  "icons/icon48.png"
  "icons/icon128.png"
  "popup"
  "scripts/background.js"
  "scripts/content.js"
  "scripts/content.css"
  "editor"
  "options"
)

# Copy files to build directory
for item in "${INCLUDE[@]}"; do
  if [ -e "$EXTENSION_DIR/$item" ]; then
    # Create parent directory if needed
    parent_dir=$(dirname "$BUILD_DIR/$item")
    mkdir -p "$parent_dir"
    cp -r "$EXTENSION_DIR/$item" "$BUILD_DIR/$item"
  fi
done

# Create ZIP
cd "$BUILD_DIR"
zip -r "../$ZIP_NAME" . -x "*.DS_Store" -x "*/.DS_Store"

# Cleanup
cd "$EXTENSION_DIR"
rm -rf "$BUILD_DIR"

echo ""
echo "Build complete!"
echo "Package created: $EXTENSION_DIR/$ZIP_NAME"
echo ""
echo "Next steps:"
echo "1. Go to https://chrome.google.com/webstore/devconsole"
echo "2. Pay \$5 one-time developer registration fee (if not already)"
echo "3. Click 'New Item' and upload $ZIP_NAME"
echo "4. Fill in store listing details and submit for review"
