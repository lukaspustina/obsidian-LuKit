import { normalizePath, type DataAdapter } from "obsidian";
import { readMarker, type PreviewMarker } from "./office-previews-engine";

export type MirrorState = { kind: "absent" } | { kind: "marked"; marker: PreviewMarker } | { kind: "foreign" };

// Vault adapter access below the preview folder. Every path goes through
// normalizePath before it reaches the adapter.
export class PreviewStore {
	constructor(private readonly adapter: DataAdapter) {}

	/** What occupies `mirror`: nothing, a LuKit preview, or a file without a valid marker. */
	async inspect(mirror: string): Promise<MirrorState> {
		const p = normalizePath(mirror);
		if (!(await this.adapter.exists(p))) return { kind: "absent" };
		const marker = readMarker(new Uint8Array(await this.adapter.readBinary(p)));
		return marker === null ? { kind: "foreign" } : { kind: "marked", marker };
	}

	/** Writes the image, creating missing parent folders first. Throws on failure. */
	async write(mirror: string, bytes: Uint8Array): Promise<void> {
		const p = normalizePath(mirror);
		const parent = p.slice(0, Math.max(0, p.lastIndexOf("/")));
		if (parent !== "" && !(await this.adapter.exists(parent))) await this.adapter.mkdir(parent);
		await this.adapter.writeBinary(p, bytes.slice().buffer);
	}
}
