#!/bin/bash

cd "$(dirname "$0")"

git clone https://github.com/microsoft/playwright
cd playwright
git apply ../diff.patch
npm ci
npm run build
