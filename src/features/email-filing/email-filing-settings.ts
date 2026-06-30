export interface EmailFilingSettings {
	order: "oldest" | "newest";
	/** Archive mailbox name used when an account has no entry in archiveMailboxes. */
	defaultArchiveMailbox: string;
	/** Maps Mail account name → archive mailbox name. */
	archiveMailboxes: Record<string, string>;
}

export const DEFAULT_EMAIL_FILING_SETTINGS: EmailFilingSettings = {
	order: "oldest",
	defaultArchiveMailbox: "Archive",
	archiveMailboxes: {},
};

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
