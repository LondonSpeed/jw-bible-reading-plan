import { App, Modal, Notice, setIcon } from "obsidian";
import type JWBibleReadingPlan from "./main";
import { CH, NAMES, TEXT } from "./data";
import type { Lang, ModeId } from "./data";
import {
	HEBREW_BOOKS, OFF, PlanParams, addDays, buildPlan, buildUnits, chaptersBeforeBook, daysBetween, fmtISO, modeBooks, modeChapters,
	parseExclusions, parseISO, range, todayISO,
} from "./planner";
import { UI, UIStrings, fmt } from "./ui";

const MODE_IDS: ModeId[] = ["cover", "chrono", "theme", "jesus"];
const LANGS: { id: Lang; label: string }[] = [
	{ id: "et", label: "Eesti" },
	{ id: "en", label: "English" },
	{ id: "ru", label: "Русский" },
];
const WEEK_PRESETS = [4, 13, 26, 52, 104];

function segmented<T extends string>(parent: HTMLElement, options: { id: T; label: string }[], current: T, onPick: (v: T) => void) {
	const wrap = parent.createDiv({ cls: "jwp-seg" });
	for (const o of options) {
		const b = wrap.createEl("button", { text: o.label, cls: "jwp-seg-btn" + (o.id === current ? " is-active" : "") });
		b.addEventListener("click", () => onPick(o.id));
	}
	return wrap;
}

/** The "Create Bible reading plan" dialog: compact cards instead of a long list of settings. */
export class PlanModal extends Modal {
	private mode: ModeId;
	private lang: Lang;
	private byWeeks = true;
	private weeks: number;
	private start = todayISO();
	private end = fmtISO(addDays(new Date(), 364));
	private excluded = new Set<number>();
	private summaryEl: HTMLElement | null = null;
	private readEl: HTMLElement | null = null;

	constructor(app: App, private plugin: JWBibleReadingPlan) {
		super(app);
		this.mode = plugin.settings.defaultMode;
		this.lang = plugin.settings.lang;
		this.weeks = plugin.settings.defaultWeeks;
	}

	onOpen() {
		this.modalEl.addClass("jwp-modal");
		this.render();
	}

	private daysCount(): number | null {
		if (this.byWeeks) return this.weeks * 7;
		if (!/^\d{4}-\d{2}-\d{2}$/.test(this.start) || !/^\d{4}-\d{2}-\d{2}$/.test(this.end)) return null;
		return Math.max(1, daysBetween(parseISO(this.start), parseISO(this.end)) + 1);
	}

	private render() {
		const el = this.contentEl;
		el.empty();
		const s = UI[this.lang];
		const t = TEXT[this.lang];
		this.titleEl.setText(s.wizTitle);

		const section = (label: string) => {
			const sec = el.createDiv({ cls: "jwp-section" });
			sec.createDiv({ cls: "jwp-label", text: label });
			return sec;
		};

		// language
		segmented(section(s.language), LANGS.map((l) => ({ id: l.id, label: l.label })), this.lang, (v) => {
			this.lang = v;
			this.render();
		});

		// mode cards
		const modes = section(s.mode).createDiv({ cls: "jwp-cards" });
		MODE_IDS.forEach((m, i) => {
			const c = modes.createDiv({ cls: "jwp-card" + (m === this.mode ? " is-active" : "") });
			c.createDiv({ cls: "jwp-card-title", text: t.modes[i] });
			c.createDiv({ cls: "jwp-card-desc", text: t.mi[i] });
			c.addEventListener("click", () => {
				this.mode = m;
				this.render();
			});
		});

		// duration
		const dur = section(s.duration);
		segmented(dur, [{ id: "weeks", label: s.byWeeks }, { id: "date", label: s.byDate }], this.byWeeks ? "weeks" : "date", (v) => {
			this.byWeeks = v === "weeks";
			this.render();
		});
		const row = dur.createDiv({ cls: "jwp-row" });
		if (this.byWeeks) {
			const input = row.createEl("input", { type: "number", cls: "jwp-num" });
			input.min = "1";
			input.max = "200";
			input.value = String(this.weeks);
			input.addEventListener("input", () => {
				this.weeks = Math.min(200, Math.max(1, Math.round(+input.value) || 1));
				this.updateSummary();
			});
			row.createSpan({ text: s.weeksUnit });
			const chips = dur.createDiv({ cls: "jwp-chips" });
			WEEK_PRESETS.forEach((w) => {
				const chip = chips.createEl("button", { text: String(w), cls: "jwp-chip" + (w === this.weeks ? " is-active" : "") });
				chip.addEventListener("click", () => {
					this.weeks = w;
					this.render();
				});
			});
		} else {
			const lab = row.createDiv({ cls: "jwp-field" });
			lab.createDiv({ cls: "jwp-sublabel", text: s.endDate });
			const input = lab.createEl("input", { type: "date" });
			input.value = this.end;
			input.addEventListener("change", () => {
				if (input.value) this.end = input.value;
				this.updateSummary();
			});
		}
		const startField = dur.createDiv({ cls: "jwp-field" });
		startField.createDiv({ cls: "jwp-sublabel", text: s.startDate });
		const startInput = startField.createEl("input", { type: "date" });
		startInput.value = this.start;
		startInput.addEventListener("change", () => {
			if (startInput.value) this.start = startInput.value;
			this.updateSummary();
		});

		// already read
		const read = section(s.alreadyRead);
		this.readEl = read.createDiv({ cls: "jwp-read" });
		this.drawRead(s);
		read.createEl("button", { text: s.choose, cls: "jwp-wide-btn" }).addEventListener("click", () => {
			new ReadPickerModal(this.app, this.lang, this.mode, this.excluded, () => {
				this.drawRead(UI[this.lang]);
				this.updateSummary();
			}).open();
		});

		// summary + create
		this.summaryEl = el.createDiv({ cls: "jwp-summary" });
		this.updateSummary();
		const foot = el.createDiv({ cls: "jwp-foot" });
		foot.createEl("button", { text: s.create, cls: "mod-cta" }).addEventListener("click", () => void this.submit());
	}

	private drawRead(s: UIStrings) {
		const box = this.readEl;
		if (!box) return;
		box.empty();
		const all = modeChapters(this.mode);
		let n = 0;
		all.forEach((g) => this.excluded.has(g) && n++);
		box.createDiv({ text: n ? fmt(s.readSummary, n, all.size) : s.nothingRead });
		if (n) {
			const bar = box.createDiv({ cls: "jwp-bar" });
			bar.createDiv({ cls: "jwp-bar-fill" }).style.width = `${Math.round((n * 100) / all.size)}%`;
		}
	}

	private updateSummary() {
		const el = this.summaryEl;
		if (!el) return;
		const s = UI[this.lang];
		const left = buildUnits(this.mode, this.excluded).length;
		const days = this.daysCount();
		el.setText(days ? fmt(s.summary, left, (left / days).toFixed(1).replace(/\.0$/, "")) : "");
	}

	private async submit() {
		const s = UI[this.lang];
		if (!/^\d{4}-\d{2}-\d{2}$/.test(this.start)) return void new Notice(s.noStart);
		if (!this.byWeeks && !/^\d{4}-\d{2}-\d{2}$/.test(this.end)) return void new Notice(s.noEnd);
		const days = this.daysCount() ?? 1;
		const p: PlanParams = { mode: this.mode, lang: this.lang, start: this.start, days, excluded: new Set(this.excluded) };
		if (!buildPlan(p).parts.length) return void new Notice(s.nothingLeft);
		this.close();
		await this.plugin.createPlan(p);
	}

	onClose() {
		this.contentEl.empty();
	}
}

/**
 * Book and chapter picker for "already read". Edits the given set directly.
 * Only the books/chapters that the chosen reading mode contains are shown.
 */
export class ReadPickerModal extends Modal {
	private allowed: Set<number>;
	private expanded = new Set<number>();
	private lastClick = new Map<number, number>();
	private search = "";
	private listEl!: HTMLElement;
	private countEl!: HTMLElement;

	constructor(app: App, private lang: Lang, private mode: ModeId, private read: Set<number>, private onChange: () => void) {
		super(app);
		this.allowed = modeChapters(mode);
	}

	onOpen() {
		this.modalEl.addClass("jwp-modal", "jwp-picker-modal");
		const s = UI[this.lang];
		const el = this.contentEl;
		el.empty();
		this.titleEl.setText(s.pickTitle);
		el.createDiv({ cls: "jwp-hint", text: s.pickHint });

		// toolbar
		const tb = el.createDiv({ cls: "jwp-toolbar" });
		tb.createEl("button", { text: s.selectAll }).addEventListener("click", () => {
			this.allowed.forEach((g) => this.read.add(g));
			this.refresh();
		});
		tb.createEl("button", { text: s.clear }).addEventListener("click", () => {
			this.allowed.forEach((g) => this.read.delete(g));
			this.refresh();
		});
		const before = tb.createEl("select", { cls: "dropdown" });
		before.createEl("option", { text: s.before, value: "" });
		modeBooks(this.mode).forEach((b, i) => i > 0 && before.createEl("option", { text: NAMES[this.lang][b], value: String(b) }));
		before.addEventListener("change", () => {
			if (before.value) chaptersBeforeBook(this.mode, +before.value).forEach((g) => this.read.add(g));
			before.value = "";
			this.refresh();
		});

		const q = el.createDiv({ cls: "jwp-quick" });
		const search = q.createEl("input", { type: "search", placeholder: s.search });
		search.addEventListener("input", () => {
			this.search = search.value.trim().toLowerCase();
			this.drawList();
		});
		const quick = q.createEl("input", { type: "text", placeholder: s.quickPh });
		const addBtn = q.createEl("button", { text: s.add });
		const doAdd = () => {
			const { set, bad } = parseExclusions(quick.value);
			set.forEach((g) => this.allowed.has(g) && this.read.add(g));
			if (bad.length) new Notice(fmt(s.couldNot, bad.join("; ")));
			else quick.value = "";
			this.refresh();
		};
		addBtn.addEventListener("click", doAdd);
		quick.addEventListener("keydown", (e) => e.key === "Enter" && doAdd());

		this.listEl = el.createDiv({ cls: "jwp-list" });
		const foot = el.createDiv({ cls: "jwp-foot jwp-foot-split" });
		this.countEl = foot.createDiv({ cls: "jwp-count" });
		foot.createEl("button", { text: s.done, cls: "mod-cta" }).addEventListener("click", () => this.close());
		this.drawList();
	}

	private refresh() {
		this.drawList();
		this.onChange();
	}

	private state(chapters: number[]): 0 | 1 | 2 {
		const n = chapters.filter((g) => this.read.has(g)).length;
		return n === 0 ? 0 : n === chapters.length ? 2 : 1;
	}

	private bookChapters(b: number): number[] {
		return range(OFF[b], OFF[b] + CH[b]).filter((g) => this.allowed.has(g));
	}

	private setAll(chapters: number[], on: boolean) {
		chapters.forEach((g) => (on ? this.read.add(g) : this.read.delete(g)));
		this.refresh();
	}

	private drawList() {
		const s = UI[this.lang];
		const list = this.listEl;
		const scroll = list.scrollTop;
		list.empty();

		const groups: { label: string; from: number; to: number }[] = [
			{ label: s.hebrew, from: 0, to: HEBREW_BOOKS },
			{ label: s.greek, from: HEBREW_BOOKS, to: CH.length },
		];
		for (const g of groups) {
			const books = range(g.from, g.to).filter((b) => this.bookChapters(b).length > 0 && (!this.search || NAMES[this.lang][b].toLowerCase().includes(this.search)));
			if (!books.length) continue;
			const all = books.flatMap((b) => this.bookChapters(b));
			const gh = list.createDiv({ cls: "jwp-group" });
			const gbox = gh.createEl("input", { type: "checkbox", cls: "jwp-check" });
			const gs = this.state(all);
			gbox.checked = gs === 2;
			gbox.indeterminate = gs === 1;
			gbox.addEventListener("change", () => this.setAll(all, gs !== 2));
			gh.createSpan({ text: g.label });

			for (const b of books) this.drawBook(list, b);
		}

		let n = 0;
		this.allowed.forEach((g) => this.read.has(g) && n++);
		this.countEl.setText(fmt(s.readSummary, n, this.allowed.size));
		list.scrollTop = scroll;
	}

	private drawBook(list: HTMLElement, b: number) {
		const chapters = this.bookChapters(b);
		const st = this.state(chapters);
		const multi = CH[b] > 1;
		const open = this.expanded.has(b);
		const row = list.createDiv({ cls: "jwp-book" + (open ? " is-open" : "") });
		const head = row.createDiv({ cls: "jwp-book-head" });
		const box = head.createEl("input", { type: "checkbox", cls: "jwp-check" });
		box.checked = st === 2;
		box.indeterminate = st === 1;
		box.addEventListener("click", (e) => e.stopPropagation());
		box.addEventListener("change", () => this.setAll(chapters, st !== 2));
		head.createSpan({ cls: "jwp-book-name", text: NAMES[this.lang][b] });
		if (multi) {
			const n = chapters.filter((g) => this.read.has(g)).length;
			head.createSpan({ cls: "jwp-book-count", text: `${n}/${chapters.length}` });
			setIcon(head.createSpan({ cls: "jwp-chev" }), open ? "chevron-down" : "chevron-right");
		}
		head.addEventListener("click", () => {
			if (!multi) return this.setAll(chapters, st !== 2);
			if (open) this.expanded.delete(b);
			else this.expanded.add(b);
			this.drawList();
		});

		if (!open || !multi) return;
		const grid = row.createDiv({ cls: "jwp-grid" });
		for (let c = 1; c <= CH[b]; c++) {
			const gi = OFF[b] + c - 1;
			const allowed = this.allowed.has(gi);
			const on = this.read.has(gi);
			const btn = grid.createEl("button", { text: String(c), cls: "jwp-ch" + (on ? " is-read" : "") + (allowed ? "" : " is-off") });
			btn.disabled = !allowed;
			btn.addEventListener("click", (e) => {
				const target = !on;
				const prev = this.lastClick.get(b);
				if (e.shiftKey && prev !== undefined) {
					const [lo, hi] = prev < c ? [prev, c] : [c, prev];
					for (let k = lo; k <= hi; k++) {
						const g = OFF[b] + k - 1;
						if (!this.allowed.has(g)) continue;
						if (target) this.read.add(g);
						else this.read.delete(g);
					}
				} else if (target) this.read.add(gi);
				else this.read.delete(gi);
				this.lastClick.set(b, c);
				this.refresh();
			});
		}
	}

	onClose() {
		this.contentEl.empty();
		this.onChange();
	}
}
