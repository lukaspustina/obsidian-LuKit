# The verb contract of obsidian-LuKit (pdt-adlc ADR 0008).
#
# Migrated from a Makefile on 2026-08-18. `help` is gone — `just --list` builds
# the listing from these comments, which is why the contract names `help` as the
# one thing that does not belong.
#
# `lint` was `tsc --noEmit`, which is a type check rather than a linter. It keeps
# the name the contract asks for and gains a `typecheck` alias, because that is
# what it does.

default: adlc-verify

# --- the contract ------------------------------------------------------------

# What the ADLC gate runs: types and the suite. Both refute; neither needs a
# network or a browser.
adlc-verify: lint test

# Everything. The bundle is here and not in adlc-verify: it produces an artefact
# rather than refuting a change, and `build` type-checks anyway.
check: lint test build

test: deps
    npm run test

# node_modules is a real prerequisite and the Makefile never said so; it also
# called `tsc` bare, which only worked where node_modules/.bin was already on
# PATH. `npx` resolves it from the project.
[private]
deps:
    #!/usr/bin/env bash
    set -euo pipefail
    [ -d node_modules ] || npm ci

# Typecheck without emitting.
lint: deps
    npx tsc --noEmit

alias typecheck := lint

# --- build -------------------------------------------------------------------

# Typecheck and bundle main.js + cli.js.
build: deps
    npm run build

# Bundle in watch mode, no typecheck.
dev:
    npm run dev

install:
    npm ci

clean:
    rm -f main.js cli.js

# --- operational -------------------------------------------------------------
#
# Unreachable from adlc-verify or check, deliberately: a gate must not publish.

# Install the plugin into a vault: just local-install /path/to/vault
local-install vault: build
    @test -d "{{vault}}/.obsidian" || { echo "Error: {{vault}} is not an Obsidian vault" >&2; exit 1; }
    mkdir -p "{{vault}}/.obsidian/plugins/lukit"
    cp main.js manifest.json styles.css "{{vault}}/.obsidian/plugins/lukit/"

# Build, test, commit, tag and publish: just release 1.2.3
release version:
    npm version {{version}} --no-git-tag-version
    node version-bump.mjs
    npm run build
    npm run test
    git add package.json manifest.json versions.json
    git commit -m "{{version}}"
    git tag -a {{version}} -m "{{version}}"
    git push origin master {{version}}
    gh release create {{version}} main.js manifest.json styles.css --title "{{version}}" --generate-notes
