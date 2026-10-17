#!/usr/bin/env bash
#
# Builds Barkdown, packages it as a notarized DMG and publishes it as a GitHub release.
#
# Usage: scripts/release.sh [--draft] [--skip-publish] [version]
#
#   version         Defaults to the project's MARKETING_VERSION.
#   --draft         Create the GitHub release as a draft.
#   --skip-publish  Stop after verifying the DMG; nothing is uploaded.
#
# One-time setup:
#   - A "Developer ID Application" certificate in your keychain
#     (Xcode ▸ Settings ▸ Accounts ▸ Manage Certificates ▸ + ▸ Developer ID Application).
#   - Notarization credentials stored in the keychain:
#       xcrun notarytool store-credentials barkdown-notary \
#         --apple-id <apple-id> --team-id L3FVX7V5JT --password <app-specific-password>
#   - The GitHub CLI signed in (gh auth login).
#
# Environment:
#   NOTARY_PROFILE  Keychain profile for notarytool (default: barkdown-notary).
#   DEVELOPER_DIR   Xcode to build with (default: /Applications/Xcode.app/Contents/Developer).

set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

PROJECT="Barkdown.xcodeproj"
SCHEME="Barkdown"
APP_NAME="Barkdown"
TEAM_ID="L3FVX7V5JT"
BUILD_DIR="$ROOT/build"
NOTARY_PROFILE="${NOTARY_PROFILE:-barkdown-notary}"
export DEVELOPER_DIR="${DEVELOPER_DIR:-/Applications/Xcode.app/Contents/Developer}"

DRAFT=false
PUBLISH=true
VERSION=""

for arg in "$@"; do
  case "$arg" in
    --draft) DRAFT=true ;;
    --skip-publish) PUBLISH=false ;;
    -h|--help) sed -n '3,21p' "$0" | sed 's/^# \{0,1\}//'; exit 0 ;;
    -*) echo "Unknown option: $arg" >&2; exit 64 ;;
    *) VERSION="$arg" ;;
  esac
done

step() { printf '\n\033[1;34m==> %s\033[0m\n' "$*"; }
fail() { printf '\033[1;31merror:\033[0m %s\n' "$*" >&2; exit 1; }

# --- Preflight -----------------------------------------------------------------

step "Checking prerequisites"

[[ -d "$DEVELOPER_DIR" ]] || fail "Xcode not found at $DEVELOPER_DIR (set DEVELOPER_DIR)."

SIGNING_IDENTITY="$(security find-identity -v -p codesigning \
  | sed -n "s/.*\"\(Developer ID Application: .*($TEAM_ID)\)\"/\1/p" | head -1)"
[[ -n "$SIGNING_IDENTITY" ]] || fail "No \"Developer ID Application\" certificate for team $TEAM_ID in your keychain."
echo "Signing identity: $SIGNING_IDENTITY"

if [[ -z "$VERSION" ]]; then
  VERSION="$(xcodebuild -project "$PROJECT" -scheme "$SCHEME" -configuration Release -showBuildSettings 2>/dev/null \
    | awk '$1 == "MARKETING_VERSION" { print $3; exit }')"
  [[ -n "$VERSION" ]] || fail "Couldn't read MARKETING_VERSION; pass the version as an argument."
fi
TAG="v$VERSION"
DMG="$BUILD_DIR/$APP_NAME-$VERSION.dmg"
echo "Version: $VERSION"

if $PUBLISH; then
  command -v gh >/dev/null || fail "The GitHub CLI (gh) is required to publish. Use --skip-publish to only build."
  gh auth status >/dev/null 2>&1 || fail "gh isn't signed in. Run: gh auth login"
  if gh release view "$TAG" >/dev/null 2>&1; then
    fail "GitHub release $TAG already exists. Bump MARKETING_VERSION or pass a different version."
  fi
  COMMIT="$(git rev-parse HEAD)"
  [[ -n "$(git branch -r --contains "$COMMIT" 2>/dev/null)" ]] \
    || fail "HEAD ($(git rev-parse --short HEAD)) isn't pushed to GitHub. Push it first so the release tag points at it."
  if [[ -n "$(git status --porcelain)" ]]; then
    echo "warning: you have uncommitted changes; they'll be in the DMG but not in the tagged source." >&2
  fi
fi

# --- 1. Archive and export with Developer ID -----------------------------------

step "Archiving $SCHEME $VERSION"
rm -rf "$BUILD_DIR/$APP_NAME.xcarchive" "$BUILD_DIR/export" "$BUILD_DIR/dmg" "$DMG"
mkdir -p "$BUILD_DIR"
xcodebuild archive \
  -project "$PROJECT" -scheme "$SCHEME" -configuration Release \
  -destination "generic/platform=macOS" \
  -archivePath "$BUILD_DIR/$APP_NAME.xcarchive" \
  -quiet

step "Exporting with Developer ID signing"
xcodebuild -exportArchive \
  -archivePath "$BUILD_DIR/$APP_NAME.xcarchive" \
  -exportOptionsPlist "$ROOT/ExportOptions.plist" \
  -exportPath "$BUILD_DIR/export" \
  -allowProvisioningUpdates \
  -quiet
APP="$BUILD_DIR/export/$APP_NAME.app"
[[ -d "$APP" ]] || fail "Export didn't produce $APP."
codesign --verify --deep --strict "$APP"

# --- 2. Build the DMG ------------------------------------------------------------

step "Creating $(basename "$DMG")"
mkdir -p "$BUILD_DIR/dmg"
cp -R "$APP" "$BUILD_DIR/dmg/"
ln -s /Applications "$BUILD_DIR/dmg/Applications"
diskutil image create from --format UDZO --volumeName "$APP_NAME" "$BUILD_DIR/dmg" "$DMG" >/dev/null
rm -rf "$BUILD_DIR/dmg"

# --- 3. Sign, notarize and staple ------------------------------------------------

step "Signing the DMG"
codesign --sign "$SIGNING_IDENTITY" --timestamp "$DMG"

step "Notarizing (this usually takes a few minutes)"
xcrun notarytool submit "$DMG" --keychain-profile "$NOTARY_PROFILE" --wait \
  || fail "Notarization failed. See the log with: xcrun notarytool log <submission-id> --keychain-profile $NOTARY_PROFILE"

step "Stapling the notarization ticket"
xcrun stapler staple "$DMG"

# --- 4. Verify -------------------------------------------------------------------

step "Verifying Gatekeeper acceptance"
spctl -a -t open --context context:primary-signature -v "$DMG"

if ! $PUBLISH; then
  step "Done: $DMG"
  exit 0
fi

# --- 5. Publish to GitHub --------------------------------------------------------

step "Publishing GitHub release $TAG"
release_args=("$TAG" "$DMG" --title "$APP_NAME $VERSION" --generate-notes --target "$COMMIT")
$DRAFT && release_args+=(--draft)
gh release create "${release_args[@]}"

step "Done: $DMG"
