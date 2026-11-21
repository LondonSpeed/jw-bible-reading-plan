import { App, MarkdownView, Modal, Notice, Plugin, Setting, TFile, normalizePath } from "obsidian";
import { NAMES, TEXT } from "./data";
import type { Lang, ModeId } from "./data";
import {
	LinkOpts, PROGRESS_MARK, PlanParams, addDays, buildPlan, buildNote, dayHeading, daysBetween, excludeBeforeBook,
	fmtISO, parseChecks, parseExclusions, parsePlan, parseISO, progressLine, progressPercent, rangeLabel, todayISO,
} from "./planner";
import { DEFAULT_SETTINGS, LANG_LABELS, PlanSettingTab, PlanSettings } from "./settings";

const AUTO_LOCALE: Record<Lang, string> = { et: "ST", en: "E", ru: "U" };
const MODE_IDS: ModeId[] = ["cover", "chrono", "theme", "jesus"];

export default class JWBibleReadingPlan extends Plugin {
	settings: PlanSettings = { ...DEFAULT_SETTINGS };
	private statusEl: HTMLElement | null = null;
	private timer: number | null = null;

	async onload() {
		await this.loadSettings();
		this.addSettingTab(new PlanSettingTab(this.app, this));

		this.addCommand({ id: "create-plan", name: "Create Bible reading plan…", callback: () => new PlanModal(this.app, this).open() });
		this.addCommand({ id: "go-today", name: "Go to today's reading", callback: () => void this.goToToday() });
		this.addCommand({
			id: "insert-today",
			name: "Insert today's reading here",
			editorCallback: (editor) => {
				void this.todayEmbed().then((text) => {
					if (text) editor.replaceSelection(text);
				});
			},
		});
		this.addCommand({ id: "update-progress", name: "Update progress line in this plan", callback: () => void this.updateProgressLine() });

		this.statusEl = this.addStatusBarItem();
		this.statusEl.addClass("mod-clickable");
		this.statusEl.addEventListener("click", () => void this.goToToday());
		const refresh = () => this.scheduleStatus();
		this.registerEvent(this.app.workspace.on("active-leaf-change", refresh));
		this.registerEvent(this.app.workspace.on("file-open", refresh));
		this.registerEvent(this.app.workspace.on("editor-change", refresh));
		this.app.workspace.onLayoutReady(refresh);
	}

	// ---------- helpers ----------
	linkOpts(lang: Lang): LinkOpts {
		const s = this.settings;
		const locale = s.jwLocale === "auto" ? AUTO_LOCALE[lang] : s.jwLocale === "custom" ? s.customLocale : s.jwLocale;
		return { linkType: s.linkType, locale };
	}

	private scheduleStatus() {
		if (this.timer !== null) window.clearTimeout(this.timer);
		this.timer = window.setTimeout(() => this.refreshStatus(), 400);
	}

	private refreshStatus() {
		const el = this.statusEl;
		if (!el) return;
		const view = this.app.workspace.getActiveViewOfType(MarkdownView);
		const content = view?.editor ? view.editor.getValue() : "";
		const plan = content ? parsePlan(content) : null;
		if (!plan) {
			el.setText("");
			return;
		}
		const { parts, days } = buildPlan(plan);
		const pct = progressPercent(parseChecks(content), parts);
		const today = days.find((d) => d.date === todayISO());
		el.setText(`📖 ${pct} %${today ? " · " + rangeLabel(today.ps, plan.lang) : ""}`);
		el.setAttr("aria-label", "Bible reading plan: click to go to today's reading");
	}

	/** The plan note: the active note if it is a plan, otherwise the first plan note in the vault. */
	private async findPlan(): Promise<{ file: TFile; content: string; plan: PlanParams } | null> {
		const active = this.app.workspace.getActiveFile();
		const candidates: TFile[] = [];
		if (active) candidates.push(active);
		for (const f of this.app.vault.getMarkdownFiles()) {
			if (f !== active && this.app.metadataCache.getFileCache(f)?.frontmatter?.["bible-plan"]) candidates.push(f);
		}
		for (const f of candidates) {
			const content = await this.app.vault.cachedRead(f);
			const plan = parsePlan(content);
			if (plan) return { file: f, content, plan };
		}
		return null;
	}

	private async goToToday() {
		const found = await this.findPlan();
		if (!found) {
			new Notice("No Bible reading plan note found. Use “Create Bible reading plan…” first.");
			return;
		}
		const { days } = buildPlan(found.plan);
		const today = todayISO();
		const target = days.find((d) => d.date >= today) ?? days[days.length - 1];
		if (!target) return;
		const heading = `### ${dayHeading(found.plan.lang, target)}`;
		const line = found.content.split("\n").indexOf(heading);
		await this.app.workspace.getLeaf(false).openFile(found.file);
		const view = this.app.workspace.getActiveViewOfType(MarkdownView);
		if (view && line >= 0) {
			view.editor.setCursor({ line, ch: 0 });
			view.editor.scrollIntoView({ from: { line, ch: 0 }, to: { line: line + 3, ch: 0 } }, true);
		}
		if (target.date !== today) new Notice(`Nothing planned for today. Next reading: ${target.date}`);
	}

	/** An embed of today's section: ticking the boxes in the embed updates the plan note. */
	private async todayEmbed(): Promise<string | null> {
		const found = await this.findPlan();
		if (!found) {
			new Notice("No Bible reading plan note found.");
			return null;
		}
		const day = buildPlan(found.plan).days.find((d) => d.date === todayISO());
		if (!day) {
			new Notice("Nothing planned for today.");
			return null;
		}
		return `![[${found.file.basename}#${dayHeading(found.plan.lang, day)}]]\n`;
	}

	private async updateProgressLine() {
		const file = this.app.workspace.getActiveFile();
		if (!file) return;
		let done = false;
		await this.app.vault.process(file, (data) => {
			const plan = parsePlan(data);
			if (!plan) return data;
			const { parts, end } = buildPlan(plan);
			const pct = progressPercent(parseChecks(data), parts);
			const re = new RegExp(`^> .*${PROGRESS_MARK.replace(/[-/\\^$*+?.()|[\]{}]/g, "\\$&")}$`, "m");
			if (!re.test(data)) return data;
			done = true;
			return data.replace(re, progressLine(plan, pct, end));
		});
		new Notice(done ? "Progress updated." : "This note is not a Bible reading plan.");
	}

	async createPlan(p: PlanParams): Promise<void> {
		const text = buildNote(p, this.linkOpts(p.lang), this.settings.showNotes);
		const folder = normalizePath(this.settings.folder || "/");
		if (this.settings.folder && !this.app.vault.getFolderByPath(folder)) await this.app.vault.createFolder(folder);
		const modeName = TEXT[p.lang].modes[MODE_IDS.indexOf(p.mode)].replace(/[\\/:*?"<>|#^[\]]/g, "");
		const base = `${TEXT[p.lang].title} – ${modeName} ${p.start}`;
		let path = normalizePath(`${this.settings.folder}/${base}.md`);
		for (let i = 2; this.app.vault.getAbstractFileByPath(path); i++) path = normalizePath(`${this.settings.folder}/${base} (${i}).md`);
		const file = await this.app.vault.create(path, text);
		await this.app.workspace.getLeaf(false).openFile(file);
		new Notice(`Plan created: ${file.basename}`);
	}

	async loadSettings() {
		const data = (await this.loadData()) as Partial<PlanSettings> | null;
		this.settings = Object.assign({}, DEFAULT_SETTINGS, data ?? {});
	}

	async saveSettings() {
		await this.saveData(this.settings);
	}
}

class PlanModal extends Modal {
	private mode: ModeId;
	private lang: Lang;
	private byWeeks = true;
	private weeks: number;
	private start = todayISO();
	private end = fmtISO(addDays(new Date(), 364));
	private beforeBook = -1;
	private excl = "";

	constructor(app: App, private plugin: JWBibleReadingPlan) {
		super(app);
		this.mode = plugin.settings.defaultMode;
		this.lang = plugin.settings.lang;
		this.weeks = plugin.settings.defaultWeeks;
	}

	onOpen() {
		this.titleEl.setText("Create Bible reading plan");
		this.render();
	}

	private render() {
		const el = this.contentEl;
		el.empty();
		const t = TEXT[this.lang];

		new Setting(el).setName("Language").addDropdown((d) => {
			(Object.keys(LANG_LABELS) as Lang[]).forEach((l) => d.addOption(l, LANG_LABELS[l]));
			d.setValue(this.lang).onChange((v) => {
				this.lang = v as Lang;
				this.render();
			});
		});

		new Setting(el).setName("Reading mode").setDesc(t.mi[MODE_IDS.indexOf(this.mode)]).addDropdown((d) => {
			MODE_IDS.forEach((m, i) => d.addOption(m, `${i + 1}. ${t.modes[i]}`));
			d.setValue(this.mode).onChange((v) => {
				this.mode = v as ModeId;
				this.render();
			});
		});

		new Setting(el).setName("Duration").addDropdown((d) =>
			d
				.addOption("weeks", "Number of weeks")
				.addOption("date", "End date")
				.setValue(this.byWeeks ? "weeks" : "date")
				.onChange((v) => {
					this.byWeeks = v === "weeks";
					this.render();
				})
		);

		if (this.byWeeks) {
			new Setting(el).setName("Weeks").addText((x) => {
				x.inputEl.type = "number";
				x.inputEl.min = "1";
				x.inputEl.max = "200";
				x.setValue(String(this.weeks)).onChange((v) => (this.weeks = Math.min(200, Math.max(1, Math.round(+v) || 1))));
			});
		} else {
			new Setting(el).setName("End date").addText((x) => {
				x.inputEl.type = "date";
				x.setValue(this.end).onChange((v) => v && (this.end = v));
			});
		}

		new Setting(el).setName("Start date").addText((x) => {
			x.inputEl.type = "date";
			x.setValue(this.start).onChange((v) => v && (this.start = v));
		});

		new Setting(el)
			.setName("Already read")
			.setDesc("Skip everything before this book. The plan is spread over the remaining chapters.")
			.addDropdown((d) => {
				d.addOption("-1", "Nothing, start from the beginning");
				NAMES[this.lang].forEach((n, i) => i > 0 && d.addOption(String(i), n));
				d.setValue(String(this.beforeBook)).onChange((v) => (this.beforeBook = +v));
			});

		new Setting(el)
			.setName("Other chapters already read")
			.setDesc("Optional. For example: Gen 1-10; Psa; Mat 5")
			.addTextArea((x) => x.setValue(this.excl).onChange((v) => (this.excl = v)));

		new Setting(el).addButton((b) => b.setButtonText("Create plan").setCta().onClick(() => void this.submit()));
	}

	private async submit() {
		if (!/^\d{4}-\d{2}-\d{2}$/.test(this.start)) return void new Notice("Please choose a start date.");
		let days = this.weeks * 7;
		if (!this.byWeeks) {
			if (!/^\d{4}-\d{2}-\d{2}$/.test(this.end)) return void new Notice("Please choose an end date.");
			days = Math.max(1, daysBetween(parseISO(this.start), parseISO(this.end)) + 1);
		}
		const { set, bad } = parseExclusions(this.excl);
		if (bad.length) return void new Notice(`Could not read: ${bad.join("; ")}`);
		if (this.beforeBook > 0) excludeBeforeBook(this.beforeBook).forEach((g) => set.add(g));
		const p: PlanParams = { mode: this.mode, lang: this.lang, start: this.start, days, excluded: set };
		if (!buildPlan(p).parts.length) return void new Notice("Nothing left to read with these settings.");
		this.close();
		await this.plugin.createPlan(p);
	}

	onClose() {
		this.contentEl.empty();
	}
}
