export type DateLocale = "de" | "en" | "iso";

export const DATE_LOCALE_LABELS: Record<DateLocale, string> = {
	de: "German (DD.MM.YYYY)",
	en: "English (MM/DD/YYYY)",
	iso: "ISO (YYYY-MM-DD)",
};

const GERMAN_WEEKDAYS = ["So", "Mo", "Di", "Mi", "Do", "Fr", "Sa"];
const ENGLISH_WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

export function formatDate(date: Date, locale: DateLocale): string {
	const day = String(date.getDate()).padStart(2, "0");
	const month = String(date.getMonth() + 1).padStart(2, "0");
	const year = date.getFullYear();

	switch (locale) {
		case "de":
			return `${day}.${month}.${year}`;
		case "en":
			return `${month}/${day}/${year}`;
		case "iso":
			return `${year}-${month}-${day}`;
	}
}

export function formatWeekday(date: Date, locale: DateLocale): string | null {
	switch (locale) {
		case "de":
			return GERMAN_WEEKDAYS[date.getDay()];
		case "en":
			return ENGLISH_WEEKDAYS[date.getDay()];
		case "iso":
			return null;
	}
}

export function parseDateString(str: string, locale: DateLocale): Date | null {
	switch (locale) {
		case "de": {
			const match = /^(\d{2})\.(\d{2})\.(\d{4})$/.exec(str);
			if (!match) return null;
			return new Date(Number(match[3]), Number(match[2]) - 1, Number(match[1]));
		}
		case "en": {
			const match = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(str);
			if (!match) return null;
			return new Date(Number(match[3]), Number(match[1]) - 1, Number(match[2]));
		}
		case "iso": {
			const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(str);
			if (!match) return null;
			return new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
		}
	}
}

export function extractDateFromTitle(title: string, locale: DateLocale): Date | null {
	// Unsichtbare Unicode-Leerzeichen (NBSP & Co. — beim Einfügen aus PDF/Mail
	// entstanden oder von macOS ersetzt) würden das ", "-Muster sonst still
	// verfehlen; die Sektion gälte dann z. B. beim Merge als datumslos.
	const normalized = title.replace(/[\u00A0\u2007\u2009\u202F]/g, " ");
	const lastComma = normalized.lastIndexOf(", ");
	if (lastComma === -1) return null;
	const candidate = normalized.slice(lastComma + 2).trim();
	return parseDateString(candidate, locale);
}

export function isDateLocale(v: unknown): v is DateLocale {
	return v === "de" || v === "en" || v === "iso";
}

export function formatDateWithWeekday(date: Date, locale: DateLocale): string {
	const dateStr = formatDate(date, locale);
	const weekday = formatWeekday(date, locale);
	if (weekday) {
		return `${weekday}, ${dateStr}`;
	}
	return dateStr;
}

export function dateFormatHint(locale: DateLocale): string {
	switch (locale) {
		case "de": return "DD.MM.YYYY";
		case "en": return "MM/DD/YYYY";
		case "iso": return "YYYY-MM-DD";
	}
}
