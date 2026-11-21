import { App, PluginSettingTab, Setting } from "obsidian";
import type JWBibleReadingPlan from "./main";
import type { Lang, ModeId } from "./data";
import { TEXT } from "./data";

export interface PlanSettings {
	lang: Lang; // language of the plan note (book names, headings)
	jwLocale: string; // "auto" = same as plan language, or a wtlocale code, or "custom"
	customLocale: string;
	linkType: "app" | "web";
	folder: string; // where new plan notes are created ("" = vault root)
	showNotes: boolean; // short chapter notes ("Creation", "The Flood", ...)
	defaultMode: ModeId;
	defaultWeeks: number;
	hideDone: boolean; // plan view: hide days that are completely read
	openViewAfterCreate: boolean; // open the compact plan view (not the note) after creating a plan
}

export const DEFAULT_SETTINGS: PlanSettings = {
	lang: "et",
	jwLocale: "auto",
	customLocale: "",
	linkType: "app",
	folder: "",
	showNotes: true,
	defaultMode: "cover",
	defaultWeeks: 52,
	hideDone: false,
	openViewAfterCreate: true,
};

export const JW_LOCALES: { code: string; label: string }[] = [
	{ code: "ST", label: "Eesti" },
	{ code: "E", label: "English" },
	{ code: "U", label: "Русский" },
	{ code: "FI", label: "Suomi" },
	{ code: "L", label: "Lietuvių" },
	{ code: "X", label: "Deutsch" },
	{ code: "S", label: "Español" },
	{ code: "F", label: "Français" },
	{ code: "I", label: "Italiano" },
	{ code: "T", label: "Português" },
	{ code: "P", label: "Polski" },
	{ code: "O", label: "Nederlands" },
	{ code: "Z", label: "Svenska" },
	{ code: "D", label: "Dansk" },
	{ code: "N", label: "Norsk" },
	{ code: "K", label: "Українська" },
];

export const LANG_LABELS: Record<Lang, string> = { et: "Eesti", en: "English", ru: "Русский" };

export class PlanSettingTab extends PluginSettingTab {
	constructor(app: App, private plugin: JWBibleReadingPlan) {
		super(app, plugin);
	}

	display(): void {
		const { containerEl } = this;
		containerEl.empty();
		const s = this.plugin.settings;
		const save = () => {
			void this.plugin.saveSettings();
		};

		new Setting(containerEl).setName("New plans").setHeading();

		new Setting(containerEl)
			.setName("Plan language")
			.setDesc("Language of book names, headings and chapter notes in new plan notes.")
			.addDropdown((d) => {
				(Object.keys(LANG_LABELS) as Lang[]).forEach((l) => d.addOption(l, LANG_LABELS[l]));
				d.setValue(s.lang).onChange((v) => {
					s.lang = v as Lang;
					save();
				});
			});

		new Setting(containerEl)
			.setName("Default reading mode")
			.setDesc("Preselected in the create dialog.")
			.addDropdown((d) => {
				(["cover", "chrono", "theme", "jesus"] as ModeId[]).forEach((m, i) => d.addOption(m, TEXT.en.modes[i]));
				d.setValue(s.defaultMode).onChange((v) => {
					s.defaultMode = v as ModeId;
					save();
				});
			});

		new Setting(containerEl)
			.setName("Default duration (weeks)")
			.addText((t) => {
				t.inputEl.type = "number";
				t.inputEl.min = "1";
				t.inputEl.max = "200";
				t.setValue(String(s.defaultWeeks)).onChange((v) => {
					s.defaultWeeks = Math.min(200, Math.max(1, Math.round(+v) || 52));
					save();
				});
			});

		new Setting(containerEl)
			.setName("Folder for new plans")
			.setDesc("Leave empty for the vault root.")
			.addText((t) =>
				t.setPlaceholder("Bible").setValue(s.folder).onChange((v) => {
					s.folder = v.trim();
					save();
				})
			);

		new Setting(containerEl)
			.setName("Show chapter notes")
			.setDesc("Add a short note to important chapters, for example “Creation” or “The Flood”.")
			.addToggle((t) =>
				t.setValue(s.showNotes).onChange((v) => {
					s.showNotes = v;
					save();
				})
			);

		new Setting(containerEl).setName("Plan view").setHeading();

		new Setting(containerEl)
			.setName("Open the plan view after creating a plan")
			.setDesc("The compact view has one tick per day. Turn off to open the plan as an ordinary note.")
			.addToggle((t) =>
				t.setValue(s.openViewAfterCreate).onChange((v) => {
					s.openViewAfterCreate = v;
					save();
				})
			);

		new Setting(containerEl)
			.setName("Hide completed days")
			.addToggle((t) =>
				t.setValue(s.hideDone).onChange((v) => {
					s.hideDone = v;
					save();
				})
			);

		new Setting(containerEl).setName("JW Library links").setHeading();

		new Setting(containerEl)
			.setName("Open verses in JW Library in this language")
			.setDesc("Independent of the plan language. Automatic uses the plan language.")
			.addDropdown((d) => {
				d.addOption("auto", "Same as plan language");
				JW_LOCALES.forEach((l) => d.addOption(l.code, `${l.label} (${l.code})`));
				d.addOption("custom", "Custom code…");
				d.setValue(s.jwLocale).onChange((v) => {
					s.jwLocale = v;
					save();
					this.display();
				});
			});

		if (s.jwLocale === "custom") {
			new Setting(containerEl)
				.setName("Custom language code")
				.setDesc("The wtlocale value from a jw.org link in your language.")
				.addText((t) =>
					t.setValue(s.customLocale).onChange((v) => {
						s.customLocale = v;
						save();
					})
				);
		}

		new Setting(containerEl)
			.setName("Link type")
			.setDesc("App link opens JW Library directly. Web link opens jw.org, which offers to open the app.")
			.addDropdown((d) =>
				d
					.addOption("app", "jwlibrary:// (app)")
					.addOption("web", "https://www.jw.org (web)")
					.setValue(s.linkType)
					.onChange((v) => {
						s.linkType = v as PlanSettings["linkType"];
						save();
					})
			);
	}
}
