import { buildParts, buildUnits, buildPlan, buildNote, parsePlan, parseChecks, progressPercent, parseExclusions, excludeBeforeBook, partUrl, rangeLabel } from "../src/planner";
import type { PlanParams } from "../src/planner";
import { readFileSync } from "node:fs";
import vm from "node:vm";

let fail = 0;
const ok = (name: string, cond: boolean, extra = "") => {
	if (!cond) { fail++; console.log("FAIL", name, extra); } else console.log("ok  ", name);
};

// ---- 1. identical to the original app code (only when the app's plan.html is available) ----
import { existsSync } from "node:fs";
const planHtml = process.env.PLAN_HTML ?? "";
const haveApp = !!planHtml && existsSync(planHtml);
const html = haveApp ? readFileSync(planHtml, "utf8") : "";
const head = !haveApp ? "" : html.slice(html.indexOf("const CODES="), html.indexOf("const $="));
const fnUnits = !haveApp ? "" : html.slice(html.indexOf("function units(m)"), html.indexOf("const PC={}"));
const fnParts = !haveApp ? "" : html.slice(html.indexOf("function parts(m)"), html.indexOf("const dmy="));
const ctx: Record<string, unknown> = {};
vm.createContext(ctx);
if (haveApp) vm.runInContext(head + ";const OFF=[];CH.reduce((a,c,i)=>(OFF[i]=a,a+c),0);let cache={},PC={},S={pre:{}},DD=1;const calc=()=>({D:DD});" + fnUnits + fnParts +
	";globalThis.run=(m,D,pre)=>{cache={};PC={};S.pre=pre;DD=D;return parts(m)}", ctx);
const orig = ctx.run as (m: string, D: number, pre: Record<number, number>) => { b: number; c: number; n: number; vs: number; ve: number; day: number }[];

for (const mode of haveApp ? (["cover", "chrono", "theme", "jesus"] as const) : []) {
	for (const D of [7, 30, 100, 365, 730]) {
		const mine = buildParts(buildUnits(mode, new Set()), D);
		const o = orig(mode, D, {});
		const same = mine.length === o.length && mine.every((p, i) => p.b === o[i].b && p.c === o[i].c && p.n === o[i].n && p.vs === o[i].vs && p.ve === o[i].ve && p.day === o[i].day);
		ok(`same as app: ${mode} ${D} days (${mine.length} parts)`, same);
	}
}
if (haveApp) {
	const pre: Record<number, number> = {}; const ex = new Set<number>();
	for (let g = 0; g < 400; g++) { pre[g] = 1; ex.add(g); }
	const mine = buildParts(buildUnits("cover", ex), 180);
	const o = orig("cover", 180, pre);
	ok("same as app: cover with first 400 chapters read", mine.length === o.length && mine.every((p, i) => p.day === o[i].day && p.b === o[i].b && p.c === o[i].c));
}

// ---- 2. properties -------------------------------------------------------------------------
const base: PlanParams = { mode: "cover", lang: "et", start: "2026-11-23", days: 365, excluded: new Set() };
const plan = buildPlan(base);
ok("1189 chapters in cover mode", buildUnits("cover", new Set()).length === 1189);
ok("last day index <= 364", Math.max(...plan.parts.map((p) => p.day)) <= 364);
ok("end date", plan.end === "2027-11-22", plan.end);
const perDay = plan.days.map((d) => d.ps.reduce((s, p) => s + p.w, 0));
const avg = perDay.reduce((a, b) => a + b, 0) / perDay.length;
ok("daily portions similar (max <= 2x average)", Math.max(...perDay) <= avg * 2, `${Math.max(...perDay)} vs ${avg}`);
ok("Psalm 119 is split in a 730-day plan (long chapter)", buildPlan({ ...base, days: 730 }).parts.filter((p) => p.b === 18 && p.c === 119).length > 1);

// ---- 3. note round trip --------------------------------------------------------------------
const note = buildNote(base, { linkType: "app", locale: "ST" }, true);
const back = parsePlan(note);
ok("note has frontmatter that parses back", !!back && back.mode === "cover" && back.days === 365 && back.start === "2026-11-23");
const checks = parseChecks(note);
ok("one checkbox per part", checks.length === plan.parts.length, `${checks.length} vs ${plan.parts.length}`);
ok("0% at start", progressPercent(checks, plan.parts) === 0);
const half = checks.map((_, i) => i < checks.length / 2);
const pct = progressPercent(half, plan.parts);
ok("about half of the text read at half of the parts", pct > 40 && pct < 60, String(pct));
ok("first link", note.includes("[1. Moosese 1](jwlibrary:///finder?bible=01001001-01001031&wtlocale=ST)"));
ok("chapter note shown", note.includes("— Loomine"));
ok("range line", /\*\*1\. Moosese 1–\d+\*\*/.test(note));

// ---- 4. already read, exclusions ------------------------------------------------------------
const ex = parseExclusions("Gen 1-10; Psa; Mat 5; Pealik");
ok("exclusions parsed", ex.set.size === 10 + 150 + 1 && ex.bad.length === 1, JSON.stringify([ex.set.size, ex.bad]));
ok("before book", excludeBeforeBook(39).size === 929);
const ex2 = buildPlan({ ...base, excluded: excludeBeforeBook(39) });
ok("plan after exclusion starts at Matthew", ex2.parts[0].b === 39 && ex2.parts[0].c === 1);
const n2 = parsePlan(buildNote({ ...base, excluded: excludeBeforeBook(39) }, { linkType: "web", locale: "E" }, false));
ok("excluded survives round trip", n2?.excluded.size === 929);
ok("web link", partUrl(plan.parts[0], { linkType: "web", locale: "E" }).startsWith("https://www.jw.org/finder?srcid=jwlshare&wtlocale=E&prefer=lang&bible=01001001"));

// ---- 5. other languages ---------------------------------------------------------------------
for (const lang of ["en", "ru"] as const) {
	const t = buildNote({ ...base, lang, mode: "jesus", days: 60 }, { linkType: "app", locale: "E" }, true);
	ok(`note in ${lang}`, t.includes("plan-lang: " + lang) && parseChecks(t).length > 50);
}
ok("range label single-chapter book", rangeLabel(buildPlan({ ...base, excluded: excludeBeforeBook(62) }).days[0].ps, "en").length > 0);
// ---- 6. wording check: no terms that do not fit jw.org wording ----------------------------------
import { NOTES, THEMES, TEXT } from "../src/data";
const allText = [...Object.values(NOTES), ...Object.values(THEMES), ...Object.values(TEXT).flatMap((x) => [x.title, ...x.modes, ...x.mi])].join("\n");
const banned = /cross|crucif|ristilöö|ristil|на кресте|креста|крестом|(?:^|\s)крест(?:\s|$)|распят|easter|christmas|jõul|рождеств|last supper|wise men|targad|волхв|the fall|inimese langemine|грехопадение|trinity|hell\b/i;
const hit = banned.exec(allText);
ok("no banned wording in notes/headings", !hit, hit ? hit[0] : "");
console.log(fail ? `${fail} FAILED` : "ALL PASSED");
process.exit(fail ? 1 : 0);
