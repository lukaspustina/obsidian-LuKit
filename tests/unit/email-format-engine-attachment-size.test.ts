import { describe, it, expect } from "vitest";
import { formatAttachmentSize, IMAGE_PRESELECT_MIN_BYTES } from "../../src/features/email-filing/email-format-engine";

describe("formatAttachmentSize", () => {
	it("renders an unknown size as an empty string", () => {
		expect(formatAttachmentSize(-1)).toBe("");
		expect(formatAttachmentSize(undefined)).toBe("");
	});

	it("uses bytes below 1 kB", () => {
		expect(formatAttachmentSize(0)).toBe("0 B");
		expect(formatAttachmentSize(999)).toBe("999 B");
	});

	it("uses whole kB up to 1 MB", () => {
		expect(formatAttachmentSize(1_000)).toBe("1 kB");
		expect(formatAttachmentSize(40_000)).toBe("40 kB");
		expect(formatAttachmentSize(999_499)).toBe("999 kB");
	});

	it("uses one decimal from 1 MB up", () => {
		expect(formatAttachmentSize(1_000_000)).toBe("1.0 MB");
		expect(formatAttachmentSize(2_450_000)).toBe("2.5 MB");
	});

	it("labels the image preselect threshold in kB, so the row explains the default", () => {
		expect(formatAttachmentSize(IMAGE_PRESELECT_MIN_BYTES)).toBe("500 kB");
	});
});
