export let debug = (...args) => {
    if (debugEnabled > 1) console.log("DEBUG: monks-sound-enhancements | ", ...args);
};
export let log = (...args) => console.log("monks-sound-enhancements | ", ...args);
export let warn = (...args) => {
    if (debugEnabled > 0) console.warn("monks-sound-enhancements | ", ...args);
};
export let error = (...args) => console.error("monks-sound-enhancements | ", ...args);
export let i18n = key => {
    return game.i18n.localize(key);
};

export class MonksSoundEnhancements {
    static tracker = false;
    static tokenbar = null;

    static init() {
	    log("initializing");
    }

    static ready() {
    }

    static injectPlaylistTabs(app, html, options) {
        let soundlist = {};
        let soundsHtml = await renderTemplate("modules/monks-sound-enhancements/templates/sound-config.html", soundlist);

        if ($('.sheet-tabs', html).length) {
            $('.sheet-tabs', html).append($('<a>').addClass("item").attr("data-tab", "sound-list").html('<i class="fas fa-list-music"></i> Sounds'));
            $('<div>').addClass("tab action-sheet").attr('data-tab', 'sound-list').html(soundsHtml).insertAfter($('.tab:last', html));
        } else {
            let basictab = $('<div>').addClass("tab").attr('data-tab', 'basic');
            $('form > *:not(button)', html).each(function () {
                basictab.append(this);
            });

            $('form', html).prepend($('<div>').addClass("tab action-sheet").attr('data-tab', 'sound-list').html(soundsHtml)).prepend(basictab).prepend(
                $('<nav>')
                    .addClass("sheet-tabs tabs")
                    .append($('<a>').addClass("item active").attr("data-tab", "basic").html('<i class="fas fa-music"></i> Playlist'))
                    .append($('<a>').addClass("item").attr("data-tab", "sound-list").html('<i class="fas fa-list-music"></i> Sounds'))
            );
        }

        app.options.tabs = [{ navSelector: ".tabs", contentSelector: "form", initial: "basic" }];
        app.options.height = "auto";
        app._tabs = app._createTabHandlers();
        const el = html[0];
        app._tabs.forEach(t => t.bind(el));

        app.setPosition();
    }
}

Hooks.on('renderPlaylistConfig', MonksSoundEnhancements.injectPlaylistTabs);
