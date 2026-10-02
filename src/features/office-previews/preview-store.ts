import { normalizePath, type DataAdapter } from "obsidian";
import { readMarker, type PreviewMarker } from "./office-previews-engine";

export type MirrorState = { kind: "absent" } | { kind: "marked"; marker: PreviewMarker } | { kind: "foreign" };

// Vault adapter access below the preview folder. Every path goes through
// normalizePath before it reaches the adapter.
export class PreviewStore {
	/**
	 * `removeEmptyDir` must refuse a non-empty folder itself (fs.rmdir
	 * semantics): Obsidian's `adapter.rmdir(p, false)` fails with EISDIR on
	 * every folder, and `rmdir(p, true)` would delete whatever sync just put there.
	 */
	constructor(
		private readonly adapter: DataAdapter,
		private readonly removeEmptyDir: (path: string) => Promise<void>,
	) {}

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
		await this.ensureParent(p);
		await this.adapter.writeBinary(p, bytes.slice().buffer);
	}

	async ensureParent(path: string): Promise<void> {
		const parent = parentOf(normalizePath(path));
		if (parent !== "" && !(await this.adapter.exists(parent))) await this.adapter.mkdir(parent);
	}

	async exists(path: string): Promise<boolean> {
		return this.adapter.exists(normalizePath(path));
	}

	async remove(path: string): Promise<void> {
		await this.adapter.remove(normalizePath(path));
	}

	/** Removes emptied folders from `path`'s parent up to, never including, `root`. Errors are ignored. */
	async removeEmptyParents(path: string, root: string): Promise<void> {
		try {
			for (let dir = parentOf(normalizePath(path)); dir.startsWith(root + "/"); dir = parentOf(dir)) {
				const listing = await this.adapter.list(dir);
				if (listing.files.length > 0 || listing.folders.length > 0) return;
				await this.removeEmptyDir(dir);
			}
		} catch {
			// A sync race or a vanished folder: leaving an empty folder is harmless.
		}
	}
}

function parentOf(path: string): string {
	return path.slice(0, Math.max(0, path.lastIndexOf("/")));
}
