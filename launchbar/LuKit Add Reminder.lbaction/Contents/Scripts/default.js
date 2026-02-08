// LuKit Add Reminder — LaunchBar Action
// Reads ~/.lukit.json for config, calls: lukit add-reminder <diaryPath> <text>

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
		"add-reminder",
		config.diaryPath,
		text.trim()
	);

	if (result === undefined) {
		LaunchBar.alert("Error", "Command failed. Check ~/.lukit.json paths.");
		return;
	}

	LaunchBar.displayNotification({
		title: "Reminder added",
		string: text.trim(),
	});
}
