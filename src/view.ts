import { ItemView, Menu, TFile, TAbstractFile, WorkspaceLeaf, ViewStateResult, setIcon } from "obsidian";
import type JWBibleReadingPlan from "./main";
import { TEXT } from "./data";
import {
	DayGroup, PlanParams, buildPlan, dayState, parseChecks, parsePlan, partLabel, partUrl, progressPercent, range, rangeLabel,
	noteFor, setChecks, todayISO, withProgressLine, parseISO,
} from "./planner";
import { DATE_LOCALE, UI, UIStrings, fmt } from "./ui";

export const VIEW_TYPE = "jw-bible-plan-view";

/**
 * Compact plan view: one row per day with a single checkbox (whole day),
 * and an expandable list with one checkbox per chapter. All ticks are written back into the plan note.
 */
export class PlanView extends ItemView {
	private path: string | null = null;
	private dayOpen = new Map<number, boolean>();
	private weekOpen = new Map<number, boolean>();
	private skipUntil = 0;
	private renderId = 0;
	private modifyTimer: number | null = null;
	private scrollToToday = true;

	constructor(leaf: WorkspaceLeaf, private plugin: JWBibleReadingPlan) {
		super(leaf);
	}

	getViewType() {
		return VIEW_TYPE;
	}
	getDisplayText() {
		return UI[this.plugin.settings.lang].viewTitle;
	}
	getIcon() {
		return "book-open";
	}

	getState(): Record<string, unknown> {
		return { file: this.path };
	}

	async setState(state: { file?: string | null } | null, result: ViewStateResult): Promise<void> {
		this.path = state?.file ?? null;
		this.scrollToToday = true;
		await this.render();
		await super.setState(state, result);
	}

	async onOpen() {
		this.registerEvent(
			this.app.vault.on("modify", (f: TAbstractFile) => {
				if (!this.path || f.path !== this.path || Date.now() < this.skipUntil) return;
				if (this.modifyTimer !== null) window.clearTimeout(this.modifyTimer);
				this.modifyTimer = window.setTimeout(() => void this.render(), 250);
			})
		);
		this.registerEvent(
			this.app.vault.on("rename", (f: TAbstractFile, old: string) => {
				if (old === this.path) this.path = f.path;
			})
		);
		await this.render();
	}

	async onClose() {
		if (this.modifyTimer !== null) window.clearTimeout(this.modifyTimer);
	}

	// ---------- writing ----------
	private async mutate(fn: (content: string) => string): Promise<void> {
		const file = this.path ? this.app.vault.getAbstractFileByPath(this.path) : null;
		if (!(file instanceof TFile)) return;
		this.skipUntil = Date.now() + 600;
		await this.app.vault.process(file, (data) => withProgressLine(fn(data)));
		await this.render();
	}

	private setParts(idx: number[], value: boolean) {
		return this.mutate((c) => setChecks(c, idx, value));
	}

	// ---------- drawing ----------
	async render(): Promise<void> {
		const id = ++this.renderId;
		const el = this.contentEl;

		let file = this.path ? this.app.vault.getAbstractFileByPath(this.path) : null;
		if (!(file instanceof TFile)) {
			const found = await this.plugin.findPlan();
			file = found ? found.file : null;
			this.path = found ? found.file.path : null;
		}
		const content = file instanceof TFile ? await this.app.vault.read(file) : "";
		if (id !== this.renderId) return;
		const plan = parsePlan(content);

		const scroll = el.scrollTop;
		el.empty();
		el.addClass("jwp-view");

		if (!(file instanceof TFile) || !plan) {
			const s = UI[this.plugin.settings.lang];
			const empty = el.createDiv({ cls: "jwp-empty" });
			empty.createDiv({ text: s.noPlan });
			empty.createEl("button", { text: s.createPlan, cls: "mod-cta" }).addEventListener("click", () => this.plugin.openCreateDialog());
			return;
		}
		await this.draw(el, file, plan, content);
		if (id !== this.renderId) return;
		if (this.scrollToToday) {
			this.scrollToToday = false;
			const t = el.querySelector(".jwp-day.is-current");
			if (t) t.scrollIntoView({ block: "center" });
		} else el.scrollTop = scroll;
	}

	private async draw(el: HTMLElement, file: TFile, plan: PlanParams, content: string) {
		const s = UI[plan.lang];
		const { parts, days } = buildPlan(plan);
		const checks = parseChecks(content);
		const pct = progressPercent(checks, parts);
		const link = this.plugin.linkOpts(plan.lang);
		const showNotes = this.plugin.settings.showNotes;
		const hideDone = this.plugin.settings.hideDone;
		const today = todayISO();
		const current = days.find((d) => d.date >= today && dayState(checks, d) !== 2) ?? days.find((d) => d.date >= today) ?? days[days.length - 1];
		const states = days.map((d) => dayState(checks, d));
		const doneDays = states.filter((x) => x === 2).length;

		// ----- header -----
		const head = el.createDiv({ cls: "jwp-head" });
		const top = head.createDiv({ cls: "jwp-head-top" });
		top.createDiv({ cls: "jwp-title", text: `${TEXT[plan.lang].title} – ${TEXT[plan.lang].modes[["cover", "chrono", "theme", "jesus"].indexOf(plan.mode)]}` });
		const tools = top.createDiv({ cls: "jwp-tools" });
		const iconBtn = (icon: string, label: string, cb: () => void) => {
			const b = tools.createEl("button", { cls: "jwp-icon-btn clickable-icon", attr: { "aria-label": label } });
			setIcon(b, icon);
			b.addEventListener("click", cb);
		};
		iconBtn("calendar-check", s.today, () => {
			const t = el.querySelector(".jwp-day.is-current");
			if (t) t.scrollIntoView({ block: "center", behavior: "smooth" });
		});
		iconBtn("file-text", s.openNote, () => void this.app.workspace.getLeaf("tab").openFile(file));
		iconBtn("plus", s.createPlan, () => this.plugin.openCreateDialog());

		const plans = await this.plugin.listPlans();
		if (plans.length > 1) {
			const sel = head.createEl("select", { cls: "dropdown jwp-plan-select" });
			plans.forEach((f) => sel.createEl("option", { text: f.basename, value: f.path }));
			sel.value = file.path;
			sel.addEventListener("change", () => {
				this.path = sel.value;
				this.scrollToToday = true;
				void this.render();
			});
		}

		const bar = head.createDiv({ cls: "jwp-bar" });
		bar.createDiv({ cls: "jwp-bar-fill" }).style.width = `${pct}%`;
		const stats = head.createDiv({ cls: "jwp-stats" });
		stats.createSpan({ text: `${s.progress}: ${pct} %` });
		stats.createSpan({ text: fmt(s.daysDone, doneDays, days.length) });

		const hide = head.createEl("label", { cls: "jwp-hide" });
		const hideBox = hide.createEl("input", { type: "checkbox" });
		hideBox.checked = hideDone;
		hide.createSpan({ text: s.hideDone });
		hideBox.addEventListener("change", () => {
			this.plugin.settings.hideDone = hideBox.checked;
			void this.plugin.saveSettings();
			void this.render();
		});

		if (pct >= 100) el.createDiv({ cls: "jwp-alldone", text: s.allDone });

		// ----- weeks and days -----
		const currentWeek = current ? Math.floor(current.i / 7) : 0;
		const weeks = new Map<number, DayGroup[]>();
		days.forEach((d) => {
			const w = Math.floor(d.i / 7);
			if (!weeks.has(w)) weeks.set(w, []);
			weeks.get(w)!.push(d);
		});

		weeks.forEach((ds, w) => {
			const visible = ds.filter((d) => !hideDone || states[days.indexOf(d)] !== 2 || d === current);
			if (!visible.length) return;
			const wDone = ds.every((d) => states[days.indexOf(d)] === 2);
			const open = this.weekOpen.get(w) ?? w === currentWeek;
			const wk = el.createDiv({ cls: "jwp-week" + (open ? " is-open" : "") + (wDone ? " is-done" : "") });
			const wh = wk.createDiv({ cls: "jwp-week-head" });
			setIcon(wh.createSpan({ cls: "jwp-chev" }), open ? "chevron-down" : "chevron-right");
			wh.createSpan({ cls: "jwp-week-title", text: `${s.week} ${w + 1}` });
			wh.createSpan({ cls: "jwp-week-count", text: `${ds.filter((d) => states[days.indexOf(d)] === 2).length}/${ds.length}` });
			wh.addEventListener("click", () => {
				this.weekOpen.set(w, !open);
				void this.render();
			});
			if (!open) return;

			for (const d of visible) this.drawDay(wk, d, states[days.indexOf(d)], d === current, plan, checks, link, showNotes, s);
		});
	}

	private drawDay(
		parent: HTMLElement,
		d: DayGroup,
		state: 0 | 1 | 2,
		isCurrent: boolean,
		plan: PlanParams,
		checks: boolean[],
		link: { linkType: "app" | "web"; locale: string },
		showNotes: boolean,
		s: UIStrings
	) {
		const open = this.dayOpen.get(d.i) ?? isCurrent;
		const isToday = d.date === todayISO();
		const cls = ["jwp-day"];
		if (state === 2) cls.push("is-done");
		if (state === 1) cls.push("is-partial");
		if (isCurrent) cls.push("is-current");
		if (open) cls.push("is-open");
		const row = parent.createDiv({ cls: cls.join(" ") });
		const h = row.createDiv({ cls: "jwp-day-head" });

		const box = h.createEl("input", { type: "checkbox", cls: "jwp-check jwp-check-day" });
		box.checked = state === 2;
		box.indeterminate = state === 1;
		box.addEventListener("click", (e) => e.stopPropagation());
		box.addEventListener("change", () => void this.setParts(range(d.first, d.first + d.ps.length), state !== 2));

		const main = h.createDiv({ cls: "jwp-day-main" });
		const date = parseISO(d.date).toLocaleDateString(DATE_LOCALE[plan.lang], { weekday: "short", day: "numeric", month: "short" });
		const title = main.createDiv({ cls: "jwp-day-title" });
		title.createSpan({ text: `${TEXT[plan.lang].day} ${d.i + 1}` });
		title.createSpan({ cls: "jwp-day-date", text: date });
		if (isToday) title.createSpan({ cls: "jwp-badge", text: s.today });
		else if (isCurrent) title.createSpan({ cls: "jwp-badge is-next", text: s.next });
		main.createDiv({ cls: "jwp-day-range", text: rangeLabel(d.ps, plan.lang) });

		const more = h.createEl("button", { cls: "jwp-icon-btn clickable-icon", attr: { "aria-label": "…" } });
		setIcon(more, "more-vertical");
		more.addEventListener("click", (e) => {
			e.stopPropagation();
			const m = new Menu();
			const idx = range(d.first, d.first + d.ps.length);
			m.addItem((i) => i.setTitle(state === 2 ? s.unmarkDay : s.markDay).setIcon(state === 2 ? "square" : "check-square").onClick(() => void this.setParts(idx, state !== 2)));
			m.addItem((i) => i.setTitle(s.markUpTo).setIcon("check-check").onClick(() => void this.setParts(range(0, d.first + d.ps.length), true)));
			m.showAtMouseEvent(e);
		});
		setIcon(h.createSpan({ cls: "jwp-chev" }), open ? "chevron-down" : "chevron-right");
		h.addEventListener("click", () => {
			this.dayOpen.set(d.i, !open);
			void this.render();
		});

		if (!open) return;
		const list = row.createDiv({ cls: "jwp-parts" });
		d.ps.forEach((p, k) => {
			const idx = d.first + k;
			const item = list.createEl("label", { cls: "jwp-part" + (checks[idx] ? " is-done" : "") });
			const cb = item.createEl("input", { type: "checkbox", cls: "jwp-check" });
			cb.checked = !!checks[idx];
			cb.addEventListener("change", () => void this.setParts([idx], cb.checked));
			const a = item.createEl("a", { text: partLabel(p, plan.lang), href: partUrl(p, link), cls: "jwp-part-link" });
			a.addEventListener("click", (e) => e.stopPropagation());
			const note = showNotes ? noteFor(p, plan.lang) : "";
			if (note) item.createSpan({ cls: "jwp-part-note", text: note });
		});
	}
}
