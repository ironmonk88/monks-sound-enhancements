import { MonksSoundEnhancements, i18n } from "./monks-sound-enhancements.js"

export const registerSettings = function () {
    // Register any custom module settings here
	let modulename = "monks-sound-enhancements";

	let actorsoundsoptions = {
		'none': i18n("MonksSoundEnhancements.actorsoundsoptions.none"),
		'npc': i18n("MonksSoundEnhancements.actorsoundsoptions.npc"),
		'everyone': i18n("MonksSoundEnhancements.actorsoundsoptions.everyone")
	};

	game.settings.register(modulename, "change-style", {
		name: i18n("MonksSoundEnhancements.change-style.name"),
		hint: i18n("MonksSoundEnhancements.change-style.hint"),
		scope: "world",
		config: true,
		default: true,
		type: Boolean,
		onChange: (value) => {
			$('#playlists').toggleClass('sound-enhancement', value);
        }
	});

	game.settings.register(modulename, "actor-sounds", {
		name: i18n("MonksSoundEnhancements.actor-sounds.name"),
		hint: i18n("MonksSoundEnhancements.actor-sounds.hint"),
		scope: "world",
		config: true,
		default: "npc",
		choices: actorsoundsoptions,
		type: String,
		onChange: debouncedReload
	});
};