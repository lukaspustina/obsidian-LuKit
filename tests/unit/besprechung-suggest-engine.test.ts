import { describe, it, expect } from "vitest";
import {
	normalizeTitleTokens,
	suggestFilingTargets,
	type FiledRecord,
} from "../../src/features/besprechung/besprechung-suggest-engine";

const NOW = 1_700_000_000_000;
const DAY = 86_400_000;

describe("normalizeTitleTokens", () => {
	it("strips the Besprechung prefix, trailing date groups, the 'call' stopword, and length-1 tokens", () => {
		expect(
			normalizeTitleTokens("Besprechung - Call Jonas Klein, 25.03.2026, 25.03.2026"),
		).toEqual(["jonas", "klein"]);
	});

	it("returns [] for an empty string without throwing", () => {
		expect(normalizeTitleTokens("")).toEqual([]);
	});

	it("preserves umlauts, splits on hyphens, drops numeric and stopword tokens", () => {
		expect(normalizeTitleTokens("Müller-Schmidt 11 mit Team")).toEqual([
			"müller",
			"schmidt",
			"team",
		]);
	});
});

describe("suggestFilingTargets", () => {
	it("ranks a recurring target top from history with reason 'history' or 'both'", () => {
		const corpus: FiledRecord[] = [
			{ rawTitle: "Compliance & IT", target: "Vorgang - Informationssicherheit", filedAt: NOW },
			{ rawTitle: "Compliance & IT", target: "Vorgang - Informationssicherheit", filedAt: NOW },
		];
		const result = suggestFilingTargets(
			"Compliance & IT",
			corpus,
			["Vorgang - Informationssicherheit", "Vorgang - Other"],
			{ now: NOW },
		);
		expect(result[0].target).toBe("Vorgang - Informationssicherheit");
		expect(["history", "both"]).toContain(result[0].reason);
	});

	it("suggests a Person note by name-match alone with an empty corpus", () => {
		const result = suggestFilingTargets(
			"Abstimmung Petra Schneider",
			[],
			["Person - Petra Schneider"],
			{ now: NOW },
		);
		expect(result).toHaveLength(1);
		expect(result[0].target).toBe("Person - Petra Schneider");
		expect(result[0].reason).toBe("name-match");
	});

	it("ignores selfNameStopwords tokens when matching", () => {
		const result = suggestFilingTargets(
			"Abstimmung Petra Schneider Mustermann",
			[],
			["Person - Mustermann"],
			{ now: NOW, selfNameStopwords: ["Mustermann"] },
		);
		// "mustermann" is filtered from both the title and the candidate name,
		// so the only remaining candidate-name token set is empty → no name-match.
		expect(result.find((r) => r.target === "Person - Mustermann")).toBeUndefined();
	});

	it("drops history targets that are not in candidateBasenames", () => {
		const corpus: FiledRecord[] = [
			{ rawTitle: "Board Meeting", target: "Protokolle Vorstand", filedAt: NOW },
		];
		const result = suggestFilingTargets("Board Meeting", corpus, ["Vorgang - A"], { now: NOW });
		expect(result.find((r) => r.target === "Protokolle Vorstand")).toBeUndefined();
	});

	it("ranks the more recently filed target higher when raw history is otherwise equal", () => {
		const corpus: FiledRecord[] = [
			{ rawTitle: "Sync", target: "Vorgang - Recent", filedAt: NOW },
			{ rawTitle: "Sync", target: "Vorgang - Old", filedAt: NOW - 400 * DAY },
		];
		const result = suggestFilingTargets(
			"Sync",
			corpus,
			["Vorgang - Recent", "Vorgang - Old"],
			{ now: NOW },
		);
		expect(result[0].target).toBe("Vorgang - Recent");
		const recent = result.find((r) => r.target === "Vorgang - Recent")!;
		const old = result.find((r) => r.target === "Vorgang - Old")!;
		expect(recent.score).toBeGreaterThan(old.score);
	});

	it("treats a null filedAt as the floor weight (ranks below a recent equal match)", () => {
		const corpus: FiledRecord[] = [
			{ rawTitle: "Sync", target: "Vorgang - Recent", filedAt: NOW },
			{ rawTitle: "Sync", target: "Vorgang - Undated", filedAt: null },
		];
		const result = suggestFilingTargets(
			"Sync",
			corpus,
			["Vorgang - Recent", "Vorgang - Undated"],
			{ now: NOW },
		);
		expect(result[0].target).toBe("Vorgang - Recent");
	});

	it("caps the result at maxSuggestions (default 3)", () => {
		const result = suggestFilingTargets(
			"alpha beta gamma delta",
			[],
			["Vorgang - Alpha", "Vorgang - Beta", "Vorgang - Gamma", "Vorgang - Delta"],
			{ now: NOW },
		);
		expect(result).toHaveLength(3);
	});

	it("returns [] when all scores are below minScore", () => {
		const result = suggestFilingTargets(
			"alpha",
			[],
			["Vorgang - Alpha Beta Gamma"],
			{ now: NOW },
		);
		expect(result).toEqual([]);
	});

	it("breaks ties on equal score and history by ascending target name", () => {
		const result = suggestFilingTargets(
			"alpha beta",
			[],
			["Vorgang - Beta", "Vorgang - Alpha"],
			{ now: NOW },
		);
		expect(result.map((r) => r.target)).toEqual(["Vorgang - Alpha", "Vorgang - Beta"]);
	});

	it("returns [] without throwing on empty inputs", () => {
		expect(suggestFilingTargets("", [], [], { now: NOW })).toEqual([]);
		expect(suggestFilingTargets("anything", [], [], { now: NOW })).toEqual([]);
	});
});
