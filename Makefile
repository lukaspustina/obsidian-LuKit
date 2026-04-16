.PHONY: install build dev test lint clean release help

help: ## Show this help
	@grep -E '^[a-zA-Z_-]+:.*##' $(MAKEFILE_LIST) | awk 'BEGIN {FS = ":.*##"}; {printf "  %-10s %s\n", $$1, $$2}'

install: ## Install dependencies
	npm ci

build: ## Typecheck and bundle main.js + cli.js
	npm run build

dev: ## Bundle in watch mode (no typecheck)
	npm run dev

test: ## Run all tests
	npm run test

lint: ## Typecheck without emitting
	tsc --noEmit

clean: ## Remove build artifacts
	rm -f main.js cli.js

local-install: build ## Install plugin into a vault (VAULT=/path/to/vault)
	@test -n "$(VAULT)" || (echo "Error: set VAULT=/path/to/vault" && exit 1)
	@test -d "$(VAULT)/.obsidian" || (echo "Error: $(VAULT) is not an Obsidian vault" && exit 1)
	mkdir -p "$(VAULT)/.obsidian/plugins/lukit"
	cp main.js manifest.json styles.css "$(VAULT)/.obsidian/plugins/lukit/"

release: ## Build, test, commit, tag and publish (V=x.y.z)
	@test -n "$(V)" || (echo "Error: set V=x.y.z" && exit 1)
	npm version $(V) --no-git-tag-version
	node version-bump.mjs
	npm run build
	npm run test
	git add package.json manifest.json versions.json
	git commit -m "$(V)"
	git tag -a $(V) -m "$(V)"
	git push origin master $(V)
	gh release create $(V) main.js manifest.json styles.css --title "$(V)" --generate-notes
