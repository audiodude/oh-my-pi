import { afterEach, beforeEach, expect, it } from "bun:test";
import * as fs from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";
import { Settings } from "@oh-my-pi/pi-coding-agent/config/settings";
import { cfgTuiFileLinkEditor } from "@oh-my-pi/pi-coding-agent/modes/settings";
import { TERMINAL } from "@oh-my-pi/pi-tui";
import { fileHyperlink, fileUriForTerminal } from "@oh-my-pi/pi-tui/render/hyperlink";
import { beginSettingsTest, restoreSettingsTestState, type SettingsTestState } from "./helpers/settings-test-state";

let state: SettingsTestState | undefined;
let root: string;

beforeEach(async () => {
	state = beginSettingsTest();
	root = await fs.mkdtemp(path.join(os.tmpdir(), "omp-file-link-editor-"));
});

afterEach(async () => {
	restoreSettingsTestState(state);
	await fs.rm(root, { recursive: true, force: true });
});

it("keeps persisted VS Code targets live across setting edits and project reloads", async () => {
	const agentDir = path.join(root, "agent");
	const project = path.join(root, "project");
	await fs.mkdir(agentDir);
	await fs.mkdir(path.join(project, ".omp"), { recursive: true });
	await Bun.write(path.join(agentDir, "config.yml"), "tui:\n  hyperlinks: always\n  fileLinkEditor: vscode\n");
	await Bun.write(path.join(project, ".omp", "config.yml"), "tui:\n  fileLinkEditor: system\n");
	const settings = await Settings.init({ cwd: root, agentDir });
	const target = path.join(root, "file with spaces.ts");
	const position = { line: 42, col: 7 };
	const renderedUri = () => fileHyperlink(target, "source", position).match(/\x1b\]8;[^;]*;([^\x1b]+)\x1b\\/)?.[1];
	const vscodeUri = fileUriForTerminal(target, position, "vscode");
	const systemUri = fileUriForTerminal(target, position, TERMINAL.id);

	expect(renderedUri()).toBe(vscodeUri);
	cfgTuiFileLinkEditor.set(settings, "system");
	expect(renderedUri()).toBe(systemUri);
	cfgTuiFileLinkEditor.set(settings, "vscode");
	expect(renderedUri()).toBe(vscodeUri);
	await settings.flush();
	await settings.reloadForCwd(project);
	expect(renderedUri()).toBe(systemUri);
	await settings.reloadForCwd(root);
	expect(renderedUri()).toBe(vscodeUri);
});
