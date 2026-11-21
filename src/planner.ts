import { CH, CODES, MODES, NAMES, NOTES, THEMES, TEXT, VS, WT } from "./data";
import type { Lang, ModeId } from "./data";

/** First global chapter index (0..1188) of every book. */
export const OFF: number[] = [];
CH.reduce((a, c, i) => {
	OFF[i] = a;
	return a + c;
}, 0);

export interface Unit {
	b: number; // book 0-65
	c: number; // chapter
	gi: number; // global chapter index
}

export interface Part {
	k: number; // index of the chapter (unit) this part belongs to
	b: number;
	c: number;
	gi: number;
	n: number; // into how many parts the chapter is split (1 = whole chapter)
	w: number; // text weight of this part
	vs: number; // first verse
	ve: number; // last verse
	day: number; // 0-based day index
}

export interface DayGroup {
	i: number; // 0-based day index
	date: string; // YYYY-MM-DD
	ps: Part[];
	first: number; // index of the first part in the parts array
}

export interface PlanParams {
	mode: ModeId;
	lang: Lang;
	start: string; // YYYY-MM-DD
	days: number;
	excluded: Set<number>; // global chapter indexes that are already read
}

// ---------- dates (local time, no time zones surprises) ----------
const pad = (n: number) => String(n).padStart(2, "0");
export const fmtISO = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
export const parseISO = (s: string) => {
	const [a, b, c] = s.split("-").map(Number);
	return new Date(a, b - 1, c);
};
export const addDays = (d: Date, n: number) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);
export const daysBetween = (a: Date, b: Date) => Math.round((b.getTime() - a.getTime()) / 864e5);
export const todayISO = () => fmtISO(new Date());

// ---------- the planner (port of the Beroia app) ----------
export function buildUnits(mode: ModeId, excluded: Set<number>): Unit[] {
	const out: Unit[] = [];
	for (const tok of MODES[mode].split(" ")) {
		const m = /^([123][A-Za-z]{2}|[A-Za-z]{3})(\d+)?(?:-(\d+))?$/.exec(tok);
		if (!m) continue;
		const b = CODES.indexOf(m[1]);
		if (b < 0) continue;
		const a = m[2] ? +m[2] : 1;
		const z = m[3] ? +m[3] : m[2] ? a : CH[b];
		for (let c = a; c <= z; c++) {
			const gi = OFF[b] + c - 1;
			if (!excluded.has(gi)) out.push({ b, c, gi });
		}
	}
	return out;
}

/** Splits the text into D days of (almost) equal size; very long chapters are cut into verse ranges. */
export function buildParts(U: Unit[], D: number): Part[] {
	let tot = 0;
	U.forEach((u) => (tot += WT[u.gi]));
	const T = tot / D || 1;
	const R: Part[] = [];
	let s = 0;
	U.forEach((u, k) => {
		const w = WT[u.gi];
		const Vn = VS[u.gi];
		let n = 1;
		if (w > 1.5 * T) n = Math.min(Vn, Math.max(2, Math.round(w / T)));
		for (let j = 0; j < n; j++) {
			const pw = w / n;
			R.push({
				k,
				b: u.b,
				c: u.c,
				gi: u.gi,
				n,
				w: pw,
				vs: n === 1 ? 1 : Math.round((Vn * j) / n) + 1,
				ve: n === 1 ? Vn : Math.round((Vn * (j + 1)) / n),
				day: Math.min(D - 1, Math.floor((s + pw / 2) / T)),
			});
			s += pw;
		}
	});
	return R;
}

export function buildPlan(p: PlanParams): { parts: Part[]; days: DayGroup[]; end: string } {
	const parts = buildParts(buildUnits(p.mode, p.excluded), p.days);
	const start = parseISO(p.start);
	const days: DayGroup[] = [];
	for (let k = 0; k < parts.length; ) {
		const i = parts[k].day;
		const a = k;
		while (k < parts.length && parts[k].day === i) k++;
		days.push({ i, date: fmtISO(addDays(start, i)), ps: parts.slice(a, k), first: a });
	}
	return { parts, days, end: fmtISO(addDays(start, p.days - 1)) };
}

// ---------- labels ----------
function chapterRange(b: number, a: number, z: number, lang: Lang): string {
	const n = NAMES[lang][b];
	if (CH[b] === 1) return n;
	return a === z ? `${n} ${a}` : `${n} ${a}–${z}`;
}

export function partLabel(p: Part, lang: Lang): string {
	if (p.n === 1) return chapterRange(p.b, p.c, p.c, lang);
	const n = NAMES[lang][p.b];
	return CH[p.b] === 1 ? `${n} ${p.vs}–${p.ve}` : `${n} ${p.c}:${p.vs}–${p.ve}`;
}

/** "1. Moosese 1–3, Psalmid 119:1–44" - consecutive whole chapters are merged. */
export function rangeLabel(ps: Part[], lang: Lang): string {
	const r: string[] = [];
	type Run = { b: number; a: number; z: number };
	let g = null as Run | null;
	const flush = () => {
		if (g) r.push(chapterRange(g.b, g.a, g.z, lang));
		g = null;
	};
	for (const u of ps) {
		if (u.n === 1) {
			if (g && g.b === u.b && u.c === g.z + 1) g.z = u.c;
			else {
				flush();
				g = { b: u.b, a: u.c, z: u.c };
			}
		} else {
			flush();
			r.push(partLabel(u, lang));
		}
	}
	flush();
	return r.join(", ");
}

export function noteFor(p: Part, lang: Lang, table: Record<string, string> = NOTES): string {
	if (p.vs !== 1) return "";
	const v = table[CODES[p.b] + p.c];
	return v ? v.split("|")[{ et: 0, en: 1, ru: 2 }[lang]] : "";
}

export const themeFor = (p: Part, lang: Lang) => noteFor(p, lang, THEMES);

// ---------- JW Library links ----------
export interface LinkOpts {
	linkType: "app" | "web";
	locale: string; // wtlocale code
}

const pad3 = (n: number, w: number) => String(n).padStart(w, "0");
const code = (b: number, c: number, v: number) => pad3(b + 1, 2) + pad3(c, 3) + pad3(v, 3);

export function partUrl(p: Part, o: LinkOpts): string {
	let q = code(p.b, p.c, p.vs);
	if (p.ve > p.vs) q += "-" + code(p.b, p.c, p.ve);
	const loc = encodeURIComponent(o.locale.trim() || "E");
	return o.linkType === "app"
		? `jwlibrary:///finder?bible=${q}&wtlocale=${loc}`
		: `https://www.jw.org/finder?srcid=jwlshare&wtlocale=${loc}&prefer=lang&bible=${q}`;
}

// ---------- the Markdown note ----------
const STR = {
	et: { week: "Nädal", progress: "Edenemine", end: "Lõpp", days: "päeva" },
	en: { week: "Week", progress: "Progress", end: "End", days: "days" },
	ru: { week: "Неделя", progress: "Прогресс", end: "Конец", days: "дн." },
};

export const PROGRESS_MARK = "<!--bible-plan-progress-->";

export const dayHeading = (lang: Lang, d: DayGroup) => `${TEXT[lang].day} ${d.i + 1} · ${d.date}`;

export function progressLine(p: PlanParams, pct: number, end: string): string {
	const s = STR[p.lang];
	return `> 📖 ${s.progress}: ${pct} % · ${s.end}: ${end} · ${p.days} ${s.days} ${PROGRESS_MARK}`;
}

export function serializeRanges(set: Set<number>): string {
	const a = [...set].sort((x, y) => x - y);
	const out: string[] = [];
	for (let i = 0; i < a.length; ) {
		let j = i;
		while (j + 1 < a.length && a[j + 1] === a[j] + 1) j++;
		out.push(j > i ? `${a[i]}-${a[j]}` : `${a[i]}`);
		i = j + 1;
	}
	return out.join(",");
}

export function parseRanges(s: string): Set<number> {
	const set = new Set<number>();
	for (const part of s.split(",")) {
		const m = /^\s*(\d+)(?:-(\d+))?\s*$/.exec(part);
		if (!m) continue;
		const a = +m[1];
		const z = m[2] ? +m[2] : a;
		for (let i = a; i <= z && i < 1189; i++) set.add(i);
	}
	return set;
}

export function buildNote(p: PlanParams, link: LinkOpts, showNotes: boolean): string {
	const { parts, days, end } = buildPlan(p);
	const t = TEXT[p.lang];
	const mi = t.mi[["cover", "chrono", "theme", "jesus"].indexOf(p.mode)];
	const modeName = t.modes[["cover", "chrono", "theme", "jesus"].indexOf(p.mode)];
	const L: string[] = [];
	L.push("---", "bible-plan: true", `plan-mode: ${p.mode}`, `plan-lang: ${p.lang}`, `plan-start: ${p.start}`, `plan-days: ${p.days}`, `plan-excluded: "${serializeRanges(p.excluded)}"`, "---", "");
	L.push(`# ${t.title} – ${modeName}`, "", progressLine(p, 0, end), "", mi, "");
	let week = -1;
	for (const d of days) {
		const w = Math.floor(d.i / 7);
		if (w !== week) {
			week = w;
			L.push(`## ${STR[p.lang].week} ${w + 1}`, "");
		}
		L.push(`### ${dayHeading(p.lang, d)}`, "");
		if (d.ps.length > 1) L.push(`**${rangeLabel(d.ps, p.lang)}**`, "");
		if (p.mode === "theme") {
			const th = d.ps.map((x) => themeFor(x, p.lang)).filter(Boolean).join(" · ");
			if (th) L.push(`*${th}*`, "");
		}
		for (const x of d.ps) {
			const note = showNotes ? noteFor(x, p.lang) : "";
			L.push(`- [ ] [${partLabel(x, p.lang)}](${partUrl(x, link)})${note ? ` — ${note}` : ""}`);
		}
		L.push("");
	}
	void parts;
	return L.join("\n");
}

// ---------- reading a plan note back ----------
export function parsePlan(content: string): PlanParams | null {
	const m = /^---\n([\s\S]*?)\n---/.exec(content);
	if (!m) return null;
	const kv: Record<string, string> = {};
	for (const line of m[1].split("\n")) {
		const x = /^([\w-]+):\s*(.*)$/.exec(line);
		if (x) kv[x[1]] = x[2].replace(/^"(.*)"$/, "$1").trim();
	}
	if (kv["bible-plan"] !== "true") return null;
	const mode = kv["plan-mode"] as ModeId;
	const lang = kv["plan-lang"] as Lang;
	const days = +kv["plan-days"];
	if (!(mode in MODES) || !(lang in NAMES) || !days || !/^\d{4}-\d{2}-\d{2}$/.test(kv["plan-start"] ?? "")) return null;
	return { mode, lang, start: kv["plan-start"], days, excluded: parseRanges(kv["plan-excluded"] ?? "") };
}

export function parseChecks(content: string): boolean[] {
	const out: boolean[] = [];
	for (const line of content.split("\n")) {
		const m = /^\s*- \[([ xX])\] /.exec(line);
		if (m) out.push(m[1] !== " ");
	}
	return out;
}

/** Percent read, weighted by text size (like the app). */
export function progressPercent(checks: boolean[], parts: Part[]): number {
	if (!parts.length) return 100;
	if (checks.length === parts.length) {
		let tot = 0;
		let done = 0;
		parts.forEach((x, i) => {
			tot += x.w;
			if (checks[i]) done += x.w;
		});
		return Math.round((done * 100) / tot);
	}
	const n = Math.min(checks.length, parts.length);
	return Math.round((checks.slice(0, n).filter(Boolean).length * 100) / parts.length);
}

// ---------- "already read" input ----------
const fold = (s: string) => s.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^\p{L}\p{N}]/gu, "");

let bookMap: Map<string, number> | null = null;
function books(): Map<string, number> {
	if (bookMap) return bookMap;
	const m = new Map<string, number>();
	for (const lang of Object.keys(NAMES) as Lang[]) NAMES[lang].forEach((n, i) => m.set(fold(n), i));
	CODES.forEach((c, i) => m.set(fold(c), i));
	bookMap = m;
	return m;
}

export function findBook(name: string): number {
	const k = fold(name);
	if (!k) return -1;
	const m = books();
	const e = m.get(k);
	if (e !== undefined) return e;
	if (k.length < 3) return -1;
	const hit = new Set<number>();
	for (const [key, v] of m) if (key.startsWith(k)) hit.add(v);
	return hit.size === 1 ? [...hit][0] : -1;
}

/** "Gen 1-10; Psa; Mat 5" -> set of global chapter indexes. Unknown parts are returned in `bad`. */
export function parseExclusions(text: string): { set: Set<number>; bad: string[] } {
	const set = new Set<number>();
	const bad: string[] = [];
	for (const raw of text.split(/[;\n]/)) {
		const part = raw.trim();
		if (!part) continue;
		const m = /^(.+?)\s*(?:(\d+)(?:\s*[-–]\s*(\d+))?)?$/.exec(part);
		const b = m ? findBook(m[1]) : -1;
		if (!m || b < 0) {
			bad.push(part);
			continue;
		}
		const a = m[2] ? +m[2] : 1;
		const z = m[3] ? +m[3] : m[2] ? a : CH[b];
		for (let c = Math.max(1, a); c <= Math.min(z, CH[b]); c++) set.add(OFF[b] + c - 1);
	}
	return { set, bad };
}

export const excludeBeforeBook = (b: number): Set<number> => {
	const s = new Set<number>();
	for (let i = 0; i < OFF[b]; i++) s.add(i);
	return s;
};
