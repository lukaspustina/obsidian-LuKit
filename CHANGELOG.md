# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added
- Besprechung: File pending notes — walks Besprechungen tagged with the configured pending tag (default `todo`) in FIFO order, picks a target Vorgang/Person/Bestellung/Bewerbung for each, files the summary and removes the tag. Picker also offers Skip, Don't file, and Stop+open virtual entries. Stamps `filed_into` and `filed_at` on filed Besprechungen for future automation.
- Besprechung: Add multiple summaries — re-opens the picker after each insertion (already-picked files hidden) until ESC; persists the search query across iterations.
- Besprechung: configurable pending order setting (oldest-first / newest-first) for the File pending workflow.
- Never abort summary insertion: when configured sections are missing, the available ones are still inserted and a `→ See full notes: [[Besprechung]] (missing: …)` line is appended; if all sections are missing the insertion is the link line alone.

### Fixed
- Vorgang: skip insertion if besprechung already linked in `# Inhalt` to avoid duplicate bullets/sections.
- Vorgang: strip trailing `]]` when parsing existing h5 dates so wikilink-form headers sort correctly.
- Vorgang: sort linked sections by note-name date when present, instead of falling back to the caller-supplied date that may not match the displayed entry.

## [1.12.4] - 2026-04-16

### Added
- Recognize Person, Bestellung, Bewerbung as section notes for besprechung summary (9870871)
- Add local-install Makefile target (2b4917b)

### Fixed
- Remove deprecated baseUrl, use project tsc in CI (e65e6f7)
