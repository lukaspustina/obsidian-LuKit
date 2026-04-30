import { parseDateString, dateFormatHint } from "./date-format";
import type { DateLocale } from "./date-format";

export type TextResult =
	| { ok: true; text: string }
	| { ok: false; error: string };

export type TextDateResult =
	| { ok: true; text: string; date: Date }
	| { ok: false; error: string };

export function validateText(text: string): TextResult {
	const trimmed = text.trim();
	if (trimmed.length === 0) {
		return { ok: false, error: "Text required." };
	}
	return { ok: true, text: trimmed };
}

export function validateTextAndDate(
	text: string,
	dateText: string,
	locale: DateLocale,
): TextDateResult {
	const trimmed = text.trim();
	if (trimmed.length === 0) {
		return { ok: false, error: "Text required." };
	}
	const date = parseDateString(dateText.trim(), locale);
	if (date === null) {
		return { ok: false, error: `Invalid date — expected ${dateFormatHint(locale)}` };
	}
	return { ok: true, text: trimmed, date };
}
