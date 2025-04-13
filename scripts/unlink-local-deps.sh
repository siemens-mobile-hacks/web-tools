#!/bin/bash
set -e
set -x
cd "$(dirname "$0")/../"
pnpm unlink -r
pnpm unlink -r
