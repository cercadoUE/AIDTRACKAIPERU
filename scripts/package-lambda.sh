#!/usr/bin/env bash
# Genera .lambda-package/ con la salida standalone de Next.js lista para AWS Lambda + Lambda Web Adapter.
set -euo pipefail
cd "$(dirname "$0")/.."

npm run build
OUT=.lambda-package
rm -rf "$OUT"
mkdir -p "$OUT"
cp -R .next/standalone/. "$OUT/"
mkdir -p "$OUT/.next/static"
cp -R .next/static/. "$OUT/.next/static/"
[ -d public ] && cp -R public "$OUT/public"

cat > "$OUT/run.sh" <<'EOF'
#!/bin/sh
# Lambda Web Adapter arranca este script y reenvía las solicitudes HTTP al puerto indicado.
exec node server.js
EOF
chmod +x "$OUT/run.sh"

# Verificaciones de seguridad del artefacto: no debe contener datos locales, CSV crudos ni credenciales.
if find "$OUT" -path "*/node_modules" -prune -o \( -name "db.json" -o -name "*.csv" -o -name ".env*" \) -print | grep -q .; then
  echo "ERROR: el paquete contiene archivos que no deben desplegarse" >&2
  find "$OUT" -path "*/node_modules" -prune -o \( -name "db.json" -o -name "*.csv" -o -name ".env*" \) -print >&2
  exit 1
fi
[ -f "$OUT/node_modules/highs/build/highs.wasm" ] || { echo "ERROR: falta highs.wasm en el paquete" >&2; exit 1; }
echo "Paquete listo: $OUT ($(du -sh "$OUT" | cut -f1))"
