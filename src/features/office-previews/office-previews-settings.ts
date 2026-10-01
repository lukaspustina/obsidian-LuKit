export interface OfficePreviewSettings {
	/** Render previews on this device (synced, read by every Mac). */
	enabled: boolean;
	/** Vault folder mirroring the source tree, normalized by `normalizePreviewFolder`. */
	folder: string;
}

export const DEFAULT_OFFICE_PREVIEW_SETTINGS: OfficePreviewSettings = {
	enabled: false,
	folder: "_previews",
};
