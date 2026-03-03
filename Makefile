.PHONY: install build dev test lint clean release

install:
	npm ci

build:
	npm run build

dev:
	npm run dev

test:
	npm run test

lint:
	tsc --noEmit

clean:
	rm -f main.js cli.js

# Usage: make release V=1.2.3
release:
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
