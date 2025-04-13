#!/bin/bash
set -e
set -x
cd "$(dirname "$0")/../"
pnpm link @sie-js/serial serialport-bindings-webserial
