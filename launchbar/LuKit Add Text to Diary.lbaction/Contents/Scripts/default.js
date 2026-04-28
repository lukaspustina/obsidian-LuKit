// LuKit Add Text to Diary — LaunchBar Action
// Reads ~/.lukit.json for config, calls: lukit add-text-to-diary <diaryPath> <text>

function run(text) {
	if (!text || text.trim().length === 0) {
		LaunchBar.alert("Error", "No text provided.");
		return;
	}

	var configPath = LaunchBar.homeDirectory + "/.lukit.json";
	if (!File.exists(configPath)) {
		LaunchBar.alert(
			"Config missing",
			"Run 'node cli.js init-config' first to create ~/.lukit.json"
		);
		return;
	}

	var config = File.readJSON(configPath);
	if (!config.diaryPath || !config.cliPath) {
		LaunchBar.alert(
			"Invalid config",
			"~/.lukit.json must contain diaryPath and cliPath."
		);
		return;
	}

	var nodePath = config.nodePath || "/usr/local/bin/node";
	var result = LaunchBar.execute(
		nodePath,
		config.cliPath,
		"add-text-to-diary",
		config.diaryPath,
		text.trim()
	);

	if (result === undefined) {
		LaunchBar.alert("Error", "Command failed. Check ~/.lukit.json paths.");
		return;
	}

	// LaunchBar.execute returns the combined stdout+stderr as a string.
	// CLI prints "Error: ..." to stderr on failure; treat that as failure.
	if (result.indexOf("Error:") === 0 || result.indexOf("\nError:") !== -1) {
		LaunchBar.alert("LuKit failed", result.slice(0, 200));
		return;
	}

	LaunchBar.displayNotification({
		title: "Diary entry added",
		string: text.trim(),
	});
}
