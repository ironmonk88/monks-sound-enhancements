import { MonksSoundEnhancements, i18n } from "./monks-sound-enhancements.js"

export const registerSettings = function () {
    // Register any custom module settings here
    let modulename = "monks-sound-enhancements";

	game.settings.register(modulename, "change-style", {
		name: i18n("MonksEnhancedJournal.change-style.name"),
		hint: i18n("MonksEnhancedJournal.change-style.hint"),
		scope: "world",
		config: true,
		default: true,
		type: Boolean,
		onChange: (value) => {
			$('#playlists').toggleClass('sound-enhancement', value);
        }
	});
};