import type { FiledRecord } from "../besprechung/besprechung-suggest-engine";

/** Cached cross-session routing corpus mined from Vorgänge (plugin data, not vault). */
export interface RoutingCache {
	/** ISO 8601 timestamp of when this cache was built. */
	builtAt: string;
	records: FiledRecord[];
}

export interface EmailFilingSettings {
	order: "oldest" | "newest";
	/** Archive mailbox name used when an account has no entry in archiveMailboxes. */
	defaultArchiveMailbox: string;
	/** Maps Mail account name → archive mailbox name. */
	archiveMailboxes: Record<string, string>;
	/**
	 * Maps Mail account name → whether its inbox is walked. An account absent
	 * from the map (or set to true) is included; only an explicit `false`
	 * excludes it. Lets the walk skip accounts the user doesn't triage here.
	 */
	walkAccounts: Record<string, boolean>;
	/** Maps Mail account name → its Sent mailbox name (for thread assembly). */
	sentMailboxes: Record<string, string>;
	/** Default Sent mailbox name for accounts not in sentMailboxes. */
	defaultSentMailbox: string;
	/** Internal cross-session routing cache; not user-editable. */
	routingCache?: RoutingCache;
}

export const DEFAULT_EMAIL_FILING_SETTINGS: EmailFilingSettings = {
	order: "oldest",
	defaultArchiveMailbox: "Archive",
	archiveMailboxes: {},
	walkAccounts: {},
	sentMailboxes: {},
	defaultSentMailbox: "Sent",
};

// An account is included in the walk unless it is explicitly disabled
// (false). Unknown accounts default to included, preserving prior behavior.
export function isAccountIncluded(
	walkAccounts: Record<string, boolean>,
	account: string,
): boolean {
	return walkAccounts[account] !== false;
}

// Adds any detected account not already present in `existing`, defaulting its
// mailbox to `def`. Existing entries are left untouched. Returns a new object.
export function mergeDetectedAccounts(
	existing: Record<string, string>,
	accounts: string[],
	def: string,
): Record<string, string> {
	const merged = { ...existing };
	for (const account of accounts) {
		if (!(account in merged)) {
			merged[account] = def;
		}
	}
	return merged;
}
