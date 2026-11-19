#!/bin/sh
# Compile Helm Ops (iPhone) pour le simulateur, l'installe et le lance.
set -e
SRC="$(cd "$(dirname "$0")" && pwd)"
OUT="$SRC/build/HelmOps.app"
rm -rf "$SRC/build"; mkdir -p "$OUT"
ARCH=$(uname -m)
xcrun -sdk iphonesimulator swiftc -swift-version 5 -O -parse-as-library \
  -target "$ARCH-apple-ios17.0-simulator" \
  -Xlinker -sectcreate -Xlinker __TEXT -Xlinker __entitlements -Xlinker "$SRC/entitlements.plist" "$SRC"/Sources/*.swift -o "$OUT/HelmOps"
# Icône (catalogue d'images)
xcrun actool "$SRC/Sources/Assets.xcassets" --compile "$OUT" --platform iphonesimulator --minimum-deployment-target 17.0 --app-icon AppIcon --output-partial-info-plist "$SRC/build/icon.plist" >/dev/null
cat > "$OUT/Info.plist" <<PL
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
<key>CFBundleName</key><string>Helm Ops</string>
<key>CFBundleDisplayName</key><string>Helm Ops</string>
<key>CFBundleIdentifier</key><string>com.jarrige.helmops.ios</string>
<key>CFBundleExecutable</key><string>HelmOps</string>
<key>CFBundlePackageType</key><string>APPL</string>
<key>CFBundleShortVersionString</key><string>1.0</string>
<key>CFBundleVersion</key><string>1</string>
<key>CFBundleSupportedPlatforms</key><array><string>iPhoneSimulator</string></array>
<key>MinimumOSVersion</key><string>17.0</string>
<key>UIDeviceFamily</key><array><integer>1</integer></array>
<key>UILaunchScreen</key><dict/>
<key>CFBundleURLTypes</key><array><dict><key>CFBundleURLSchemes</key><array><string>helmops</string></array></dict></array>
<key>CFBundleDevelopmentRegion</key><string>fr</string>
<key>CFBundleIcons</key><dict><key>CFBundlePrimaryIcon</key><dict><key>CFBundleIconFiles</key><array><string>AppIcon60x60</string></array><key>CFBundleIconName</key><string>AppIcon</string></dict></dict>
</dict></plist>
PL
codesign --force -s - "$OUT" >/dev/null
echo "OK : $OUT"
if [ "$1" = "run" ]; then
  xcrun simctl install booted "$OUT"
  xcrun simctl launch booted com.jarrige.helmops.ios
fi
