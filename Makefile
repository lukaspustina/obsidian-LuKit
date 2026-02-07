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

release:
	@echo "Usage: make release V=1.2.3"
	@test -n "$(V)" || (echo "Error: set V=x.y.z" && exit 1)
	npm version $(V) --tag-version-prefix=v
	git push && git push --tags
