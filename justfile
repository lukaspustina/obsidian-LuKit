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

# The suite. The second reporter prints one `ADLC-RAN <path>` line per executed
# test file (ADR 0003): vitest has no introspection flag the gate can ask, so the
# runner reports what it ran and `adlc attest` scrapes it.
test: deps
    npx vitest run --reporter=default --reporter=./tests/helpers/adlc-ran-reporter.ts

# Coverage as a single figure. `adlc code-metrics` takes the LAST percentage in
# the output, so the v8 text table cannot be used — its last row is one file, not
# the total. json-summary plus one printed line is the whole point.
# The thresholds in vitest.config.ts make a run below them exit 1, and the figure
# still has to be printed — `adlc code-metrics` reads a percentage whatever the
# exit code, but only if the recipe gets that far. So: keep the exit code, print
# the figure first.
test-cov: deps
    #!/usr/bin/env bash
    set -uo pipefail
    npx vitest run --coverage.enabled --coverage.reporter=json-summary
    rc=$?
    node -e 'console.log(require("./coverage/coverage-summary.json").total.lines.pct + "%")'
    exit $rc

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
