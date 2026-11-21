import { MarkdownView, Notice, Plugin, TFile, normalizePath } from "obsidian";
import { TEXT } from "./data";
import type { Lang, ModeId } from "./data";
import {
	LinkOpts, PlanParams, buildNote, buildPlan, dayHeading, hasProgressLine, parseChecks, parsePlan, progressPercent, rangeLabel,
	setChecks, range, todayISO, withProgressLine,
} from "./planner";
import { PlanModal } from "./modal";
import { DEFAULT_SETTINGS, PlanSettingTab, PlanSettings } from "./settings";
import { PlanView, VIEW_TYPE } from "./view";

const AUTO_LOCALE: Record<Lang, string> = { et: "ST", en: "E", ru: "U" };
const MODE_IDS: ModeId[] = ["cover", "chrono", "theme", "jesus"];

export default class JWBibleReadingPlan extends Plugin {
	settings: PlanSettings = { ...DEFAULT_SETTINGS };
	private statusEl: HTMLElement | null = null;
	private timer: number | null = null;

	async onload() {
		await this.loadSettings();
		this.addSettingTab(new PlanSettingTab(this.app, this));
		this.registerView(VIEW_TYPE, (leaf) => new PlanView(leaf, this));
		this.addRibbonIcon("book-open", "Bible reading plan", () => void this.openPlanView());

		this.addCommand({ id: "open-view", name: "Open plan view", callback: () => void this.openPlanView() });
		this.addCommand({ id: "create-plan", name: "Create Bible reading plan…", callback: () => this.openCreateDialog() });
		this.addCommand({ id: "mark-today", name: "Mark today's reading as read", callback: () => void this.markToday() });
		this.addCommand({ id: "go-today", name: "Go to today's reading in the note", callback: () => void this.goToToday() });
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
		this.statusEl.addEventListener("click", () => void this.openPlanView());
		const refresh = () => this.scheduleStatus();
		this.registerEvent(this.app.workspace.on("active-leaf-change", refresh));
		this.registerEvent(this.app.workspace.on("file-open", refresh));
		this.registerEvent(this.app.workspace.on("editor-change", refresh));
		this.registerEvent(this.app.vault.on("modify", refresh));
		this.app.workspace.onLayoutReady(refresh);
	}

	onunload() {
		if (this.timer !== null) window.clearTimeout(this.timer);
	}

	// ---------- helpers ----------
	linkOpts(lang: Lang): LinkOpts {
		const s = this.settings;
		const locale = s.jwLocale === "auto" ? AUTO_LOCALE[lang] : s.jwLocale === "custom" ? s.customLocale : s.jwLocale;
		return { linkType: s.linkType, locale };
	}

	openCreateDialog() {
		new PlanModal(this.app, this).open();
	}

	private scheduleStatus() {
		if (this.timer !== null) window.clearTimeout(this.timer);
		this.timer = window.setTimeout(() => void this.refreshStatus(), 400);
	}

	/** Status bar: progress of the plan note that is open, otherwise of the first plan in the vault. */
	private async refreshStatus() {
		const el = this.statusEl;
		if (!el) return;
		const view = this.app.workspace.getActiveViewOfType(MarkdownView);
		let content = view?.editor ? view.editor.getValue() : "";
		let plan = content ? parsePlan(content) : null;
		if (!plan) {
			const found = await this.findPlan();
			if (found) {
				content = found.content;
				plan = found.plan;
			}
		}
		if (!plan) {
			el.setText("");
			return;
		}
		const { parts, days } = buildPlan(plan);
		const pct = progressPercent(parseChecks(content), parts);
		const today = days.find((d) => d.date === todayISO());
		el.setText(`📖 ${pct} %${today ? " · " + rangeLabel(today.ps, plan.lang) : ""}`);
		el.setAttr("aria-label", "Bible reading plan: click to open the plan view");
	}

	/** All plan notes in the vault. */
	async listPlans(): Promise<TFile[]> {
		return this.app.vault.getMarkdownFiles().filter((f) => !!this.app.metadataCache.getFileCache(f)?.frontmatter?.["bible-plan"]);
	}

	/** The plan note: the active note if it is a plan, otherwise the first plan note in the vault. */
	async findPlan(): Promise<{ file: TFile; content: string; plan: PlanParams } | null> {
		const active = this.app.workspace.getActiveFile();
		const candidates: TFile[] = [];
		if (active) candidates.push(active);
		for (const f of await this.listPlans()) if (f !== active) candidates.push(f);
		for (const f of candidates) {
			const content = await this.app.vault.cachedRead(f);
			const plan = parsePlan(content);
			if (plan) return { file: f, content, plan };
		}
		return null;
	}

	async openPlanView(file?: TFile) {
		const found = file ? { file } : await this.findPlan();
		if (!found) {
			new Notice("No Bible reading plan note found. Use “Create Bible reading plan…” first.");
			this.openCreateDialog();
			return;
		}
		const existing = this.app.workspace.getLeavesOfType(VIEW_TYPE)[0];
		const leaf = existing ?? this.app.workspace.getLeaf("tab");
		await leaf.setViewState({ type: VIEW_TYPE, active: true, state: { file: found.file.path } });
		void this.app.workspace.revealLeaf(leaf);
	}

	private async markToday() {
		const found = await this.findPlan();
		if (!found) {
			new Notice("No Bible reading plan note found.");
			return;
		}
		const day = buildPlan(found.plan).days.find((d) => d.date === todayISO());
		if (!day) {
			new Notice("Nothing planned for today.");
			return;
		}
		const idx = range(day.first, day.first + day.ps.length);
		await this.app.vault.process(found.file, (data) => withProgressLine(setChecks(data, idx, true)));
		new Notice(`✓ ${rangeLabel(day.ps, found.plan.lang)}`);
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
			if (!parsePlan(data) || !hasProgressLine(data)) return data;
			done = true;
			return withProgressLine(data);
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
		if (this.settings.openViewAfterCreate) await this.openPlanView(file);
		else await this.app.workspace.getLeaf(false).openFile(file);
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
