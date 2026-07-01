import { describe, it, expect } from "vitest";
import {
	mineVorgangFilings,
	minedFilingsToFiledRecords,
	isCacheStale,
	ROUTING_CACHE_TTL_MS,
} from "../../src/features/email-filing/email-routing";

describe("mineVorgangFilings", () => {
	it("extracts sender + subject from an 'E-Mail von' heading", () => {
		const content = "# Inhalt\n##### E-Mail von Alice: Angebot, 01.06.2026\n- siehe […]";
		expect(mineVorgangFilings(content, "Müller GmbH")).toEqual([
			{ correspondent: "Alice", subject: "Angebot", target: "Müller GmbH" },
		]);
	});

	it("extracts subject (empty correspondent) from an 'E-Mail-Thread' heading", () => {
		const content = "##### E-Mail-Thread: Quartalsbericht, 2026-06-01";
		expect(mineVorgangFilings(content, "Vorgang X")).toEqual([
			{ correspondent: "", subject: "Quartalsbericht", target: "Vorgang X" },
		]);
	});

	it("returns [] when there are no email headings", () => {
		expect(mineVorgangFilings("# Inhalt\n- [[#Section, 01.01.2026]]", "X")).toEqual([]);
	});
});

describe("minedFilingsToFiledRecords", () => {
	it("uses the subject as rawTitle, appending the correspondent when present", () => {
		const records = minedFilingsToFiledRecords([
			{ correspondent: "Alice", subject: "Angebot", target: "Müller GmbH" },
			{ correspondent: "", subject: "Quartalsbericht", target: "Vorgang X" },
		]);
		expect(records).toEqual([
			{ rawTitle: "Angebot Alice", target: "Müller GmbH", filedAt: null },
			{ rawTitle: "Quartalsbericht", target: "Vorgang X", filedAt: null },
		]);
	});
});

describe("isCacheStale", () => {
	it("is stale when there is no cache", () => {
		expect(isCacheStale(undefined, 1_000_000)).toBe(true);
	});

	it("is fresh within the TTL", () => {
		const now = 1_000_000_000_000;
		const builtAt = new Date(now - ROUTING_CACHE_TTL_MS + 1000).toISOString();
		expect(isCacheStale(builtAt, now)).toBe(false);
	});

	it("is stale past the TTL", () => {
		const now = 1_000_000_000_000;
		const builtAt = new Date(now - ROUTING_CACHE_TTL_MS - 1000).toISOString();
		expect(isCacheStale(builtAt, now)).toBe(true);
	});
});
