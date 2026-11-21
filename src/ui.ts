import type { Lang } from "./data";

/** Interface texts (plan view, create dialog, book picker) in the three plan languages. */
export interface UIStrings {
	viewTitle: string;
	progress: string;
	daysDone: string; // {a} {b}
	today: string;
	next: string;
	markDay: string;
	unmarkDay: string;
	markUpTo: string;
	openNote: string;
	hideDone: string;
	week: string;
	noPlan: string;
	createPlan: string;
	allDone: string;
	plan: string;
	// create dialog
	wizTitle: string;
	language: string;
	mode: string;
	duration: string;
	byWeeks: string;
	byDate: string;
	weeksUnit: string;
	endDate: string;
	startDate: string;
	alreadyRead: string;
	nothingRead: string;
	readSummary: string; // {a} {b}
	choose: string;
	create: string;
	noStart: string;
	noEnd: string;
	nothingLeft: string;
	summary: string; // {a} {b}
	// picker
	pickTitle: string;
	pickHint: string;
	selectAll: string;
	clear: string;
	hebrew: string;
	greek: string;
	before: string;
	search: string;
	quick: string;
	quickPh: string;
	add: string;
	done: string;
	couldNot: string; // {a}
	chapters: string;
}

export const UI: Record<Lang, UIStrings> = {
	et: {
		viewTitle: "Piibli lugemisplaan",
		progress: "Edenemine",
		daysDone: "{a} / {b} päeva loetud",
		today: "Täna",
		next: "Järgmine",
		markDay: "Märgi päev loetuks",
		unmarkDay: "Eemalda päeva märge",
		markUpTo: "Märgi kõik kuni siiani loetuks",
		openNote: "Ava märkmena",
		hideDone: "Peida loetud päevad",
		week: "Nädal",
		noPlan: "Lugemisplaani ei leitud.",
		createPlan: "Loo uus plaan",
		allDone: "Kõik loetud! 🎉",
		plan: "Plaan",
		wizTitle: "Loo Piibli lugemisplaan",
		language: "Keel",
		mode: "Lugemise tüüp",
		duration: "Kestus",
		byWeeks: "Nädalad",
		byDate: "Lõppkuupäev",
		weeksUnit: "nädalat",
		endDate: "Lõppkuupäev",
		startDate: "Alguskuupäev",
		alreadyRead: "Juba loetud",
		nothingRead: "Midagi pole veel loetud, alustan algusest",
		readSummary: "{a} / {b} peatükki loetud",
		choose: "Vali raamatud ja peatükid…",
		create: "Loo plaan",
		noStart: "Vali alguskuupäev.",
		noEnd: "Vali lõppkuupäev.",
		nothingLeft: "Nende seadetega pole midagi lugeda.",
		summary: "Loetavat: {a} peatükki · ≈ {b} peatükki päevas",
		pickTitle: "Mis on juba loetud?",
		pickHint: "Linnuke märgib kogu raamatu. Puuduta raamatut, et avada peatükid. Shift + klõps märgib vahemiku.",
		selectAll: "Kõik",
		clear: "Tühjenda",
		hebrew: "Heebrea Pühakiri",
		greek: "Kreeka Pühakiri",
		before: "Kõik enne raamatut…",
		search: "Otsi raamatut",
		quick: "Kiirsisestus",
		quickPh: "nt Gen 1-10; Psa; Mat 5",
		add: "Lisa",
		done: "Valmis",
		couldNot: "Ei saanud aru: {a}",
		chapters: "peatükki",
	},
	en: {
		viewTitle: "Bible reading plan",
		progress: "Progress",
		daysDone: "{a} / {b} days read",
		today: "Today",
		next: "Next",
		markDay: "Mark day as read",
		unmarkDay: "Unmark day",
		markUpTo: "Mark everything up to here as read",
		openNote: "Open as note",
		hideDone: "Hide completed days",
		week: "Week",
		noPlan: "No reading plan found.",
		createPlan: "Create new plan",
		allDone: "All read! 🎉",
		plan: "Plan",
		wizTitle: "Create Bible reading plan",
		language: "Language",
		mode: "Reading mode",
		duration: "Duration",
		byWeeks: "Weeks",
		byDate: "End date",
		weeksUnit: "weeks",
		endDate: "End date",
		startDate: "Start date",
		alreadyRead: "Already read",
		nothingRead: "Nothing read yet, start from the beginning",
		readSummary: "{a} / {b} chapters read",
		choose: "Choose books and chapters…",
		create: "Create plan",
		noStart: "Please choose a start date.",
		noEnd: "Please choose an end date.",
		nothingLeft: "Nothing left to read with these settings.",
		summary: "To read: {a} chapters · ≈ {b} chapters per day",
		pickTitle: "What have you already read?",
		pickHint: "The checkbox marks a whole book. Tap a book to open its chapters. Shift + click selects a range.",
		selectAll: "All",
		clear: "Clear",
		hebrew: "Hebrew Scriptures",
		greek: "Greek Scriptures",
		before: "Everything before book…",
		search: "Find a book",
		quick: "Quick entry",
		quickPh: "e.g. Gen 1-10; Psa; Mat 5",
		add: "Add",
		done: "Done",
		couldNot: "Could not read: {a}",
		chapters: "chapters",
	},
	ru: {
		viewTitle: "План чтения Библии",
		progress: "Прогресс",
		daysDone: "Прочитано дней: {a} / {b}",
		today: "Сегодня",
		next: "Следующее",
		markDay: "Отметить день прочитанным",
		unmarkDay: "Снять отметку дня",
		markUpTo: "Отметить всё до этого дня прочитанным",
		openNote: "Открыть как заметку",
		hideDone: "Скрыть прочитанные дни",
		week: "Неделя",
		noPlan: "План чтения не найден.",
		createPlan: "Создать новый план",
		allDone: "Всё прочитано! 🎉",
		plan: "План",
		wizTitle: "Создать план чтения Библии",
		language: "Язык",
		mode: "Тип чтения",
		duration: "Срок",
		byWeeks: "Недели",
		byDate: "Дата окончания",
		weeksUnit: "нед.",
		endDate: "Дата окончания",
		startDate: "Дата начала",
		alreadyRead: "Уже прочитано",
		nothingRead: "Пока ничего не прочитано, начинаю с начала",
		readSummary: "Прочитано глав: {a} / {b}",
		choose: "Выбрать книги и главы…",
		create: "Создать план",
		noStart: "Выберите дату начала.",
		noEnd: "Выберите дату окончания.",
		nothingLeft: "При этих настройках читать нечего.",
		summary: "Читать: {a} глав · ≈ {b} глав в день",
		pickTitle: "Что уже прочитано?",
		pickHint: "Флажок отмечает всю книгу. Нажмите на книгу, чтобы открыть главы. Shift + клик выделяет диапазон.",
		selectAll: "Все",
		clear: "Очистить",
		hebrew: "Еврейские Писания",
		greek: "Греческие Писания",
		before: "Всё до книги…",
		search: "Найти книгу",
		quick: "Быстрый ввод",
		quickPh: "напр. Gen 1-10; Psa; Mat 5",
		add: "Добавить",
		done: "Готово",
		couldNot: "Не удалось распознать: {a}",
		chapters: "глав",
	},
};

export const fmt = (s: string, a: string | number, b: string | number = ""): string => s.replace("{a}", String(a)).replace("{b}", String(b));

export const DATE_LOCALE: Record<Lang, string> = { et: "et-EE", en: "en-GB", ru: "ru-RU" };
