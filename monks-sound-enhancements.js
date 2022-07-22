import { registerSettings } from "./settings.js";

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

export let setting = key => {
    return game.settings.get("monks-sound-enhancements", key);
};

export class MonksSoundEnhancements {
    static tracker = false;
    static tokenbar = null;

    static init() {
        registerSettings();

        let onPlaylistDrop = async function (wrapped, ...args) {
            let event = args[0];
            let data;
            try {
                data = JSON.parse(event.dataTransfer.getData('text/plain'));

                if (data.type == "PlaylistSound" && data.packId) {
                    const target = event.target.closest(".sound, .playlist");
                    let playlistTarget;
                    if (!target) {
                        if (data.packId) {
                            let pack = game.packs.get(data.packId);
                            if (!pack)
                                return null;
                            let playlist = await pack.getDocument(data.playlistId)
                            playlistTarget = await Playlist.create({ name: playlist.name });
                        } else {
                            return null;
                        }
                    } else {
                        const targetId = target.dataset.documentId || target.dataset.playlistId;
                        playlistTarget = game.playlists.get(targetId);
                    }

                    let pack = game.packs.get(data.packId);
                    const document = await pack.getDocument(data.playlistId);
                    const sound = document.sounds.get(data.soundId);

                    return PlaylistSound.implementation.create(sound.toObject(), { parent: playlistTarget });
                }
            }
            catch (err) {
                log(err);
            }

            return wrapped(...args);
        }

        if (game.modules.get("lib-wrapper")?.active) {
            libWrapper.register("monks-sound-enhancements", "PlaylistDirectory.prototype._onDrop", onPlaylistDrop, "MIXED");
        } else {
            const oldOnDrop = PlaylistDirectory.prototype._onDrop;
            PlaylistDirectory.prototype._onDrop = function (event) {
                return onPlaylistDrop.call(this, oldOnDrop.bind(this), event);
            }
        }

        /*
        let onPlaylistSoundCreate = async function (wrapped, ...args) {
            if (args[1]?.parent?._playbackOrder)
                args[1].parent._playbackOrder = undefined;
            return wrapped(...args).then(() => {
                ui.playlists.render(true);
            });
        }

        if (game.modules.get("lib-wrapper")?.active) {
            libWrapper.register("monks-sound-enhancements", "PlaylistSound.prototype.constructor.create", onPlaylistSoundCreate, "WRAPPER");
        } else {
            const oldCreate = PlaylistSound.prototype.constructor.create;
            PlaylistSound.prototype.constructor.create = function (event) {
                return onPlaylistSoundCreate.call(this, oldCreate.bind(this));
            }
        }*/

        let onHeaderButtons = function (wrapped, ...args) {
            let buttons = wrapped(...args);

            let importBtn = buttons.find(b => b.class == "import");
            if (importBtn) {
                importBtn.onclick = async () => {
                    let updateData = {};
                    let checkedSounds = $('.select-sound:checked', this.element);
                    if (checkedSounds.length) {
                        updateData.sounds = [];
                        for (let chk of checkedSounds) {
                            let id = chk.closest(".item").dataset.soundId;
                            let sound = (isNewerVersion(game.version, "9.9999") ? this.document.sounds.get(id) : this.document.data.sounds.get(id));
                            if (sound) {
                                updateData.sounds.push(sound.toObject());
                            }
                        }
                    }

                    await this.close();
                    return this.document.collection.importFromCompendium(this.document.compendium, this.document.id, updateData);
                }
            }

            return buttons;
        }

        if (game.modules.get("lib-wrapper")?.active) {
            libWrapper.register("monks-sound-enhancements", "PlaylistConfig.prototype._getHeaderButtons", onHeaderButtons, "WRAPPER");
        } else {
            const oldHeaderButtons = PlaylistConfig.prototype._getHeaderButtons;
            PlaylistConfig.prototype._getHeaderButtons = function (event) {
                return onHeaderButtons.call(this, oldHeaderButtons.bind(this));
            }
        }
    }

    static ready() {
    }

    static async updatePlaylistCompendium(compendium, html, data) {
        /*
        if (compendium.collection.documentName == 'Playlist') {
            $('li.directory-item h4', html).each(function () {
                let id = $(this).closest('.directory-item').attr("data-document-id");
                let playlist = data.index.get(id);
                $(this).append($("<div>").html(playlist.sounds.length));
            });
        }*/
    }

    static async injectPlaylistTabs(app, html, data) {
        let configData = {
            pack: data.document.pack,
            playlist: data.document.id,
            compendium: !data.document.isEmbedded && data.document.compendium && data.document.constructor.canUserCreate(game.user)
        };

        configData.sounds = (isNewerVersion(game.version, "9.9999") ? app.object.sounds : app.object.data.sounds)
            .filter(s => !!s)
            .map(s => {
                return {
                    id: s.id, name: s.name, sort: s.sort, data: { name: s.name, sort: s.sort } }
            })
            .sort(app.object._sortSounds.bind(app.object));

        let soundsHtml = await renderTemplate("modules/monks-sound-enhancements/templates/sound-config.html", configData);

        if ($('.sheet-tabs', html).length) {
            $('.sheet-tabs', html).append($('<a>').addClass("item").attr("data-tab", "sound-list").html('<i class="fas fa-file-audio"></i> Sounds'));
            $('<div>').addClass("tab sound-sheet").attr('data-tab', 'sound-list').html(soundsHtml).insertAfter($('.tab:last', html));
        } else {
            let root = $('form', html);
            if (root.length == 0)
                root = html;
            let basictab = $('<div>').addClass("tab").attr('data-tab', 'basic');
            $('> *:not(button)', root).each(function () {
                basictab.append(this);
            });

            $(root).prepend($('<div>').addClass("tab sound-sheet").attr('data-tab', 'sound-list').html(soundsHtml)).prepend(basictab).prepend(
                $('<nav>')
                    .addClass("sheet-tabs tabs")
                    .append($('<a>').addClass("item").attr("data-tab", "basic").html('<i class="fas fa-music"></i> Playlist'))
                    .append($('<a>').addClass("item").attr("data-tab", "sound-list").html('<i class="fas fa-file-audio"></i> Sounds'))
            );
        }

        $('.action-create', html).on("click", MonksSoundEnhancements.soundCreate.bind(app, app.object));
        $('.action-play', html).on("click", MonksSoundEnhancements.playsound.bind(this, app));

        app.options.tabs = [{ navSelector: ".tabs", contentSelector: "form", initial: "basic" }];
        app.options.height = "auto";
        app.options.dragDrop = [{ dragSelector: ".sound-list .item", dropSelector: ".item-list .item" }];
        app.options.scrollY = [".sound-list .item-list"];

        const el = html[0];
        if (!app._tabs.length) {
            app._tabs = app._createTabHandlers();
        }
        app._tabs.forEach(t => t.bind(el));

        app._onDragStart = MonksSoundEnhancements._onDragStart;
        app._onDrop = MonksSoundEnhancements._onDrop;
        if (!app._dragDrop.length) {
            app._dragDrop = app._createDragDropHandlers();
        }
        app._dragDrop.forEach(d => d.bind(el));


        if (data.editable)
            ContextMenu.create(app, html, ".sound-list .item", MonksSoundEnhancements._getSoundContextOptions(), "SoundContext");

        app.setPosition();
        app._sounds = {};

        app._restoreScrollPositions(html);
    }

    static async addSoundDrop(app, html, data) {
        let el = html[0];

        app.options.dragDrop = [{ dropSelector: "form" }];
        app._onDrop = MonksSoundEnhancements._onDropSound;
        if (!app._dragDrop.length) {
            app._dragDrop = app._createDragDropHandlers();
        } else
            el = el.parentElement;
        app._dragDrop.forEach(d => d.bind(el));
    }

    static _getSoundContextOptions() {
        return [
            {
                name: "PLAYLIST.SoundEdit",
                icon: '<i class="fas fa-edit"></i>',
                callback: async (li) => {
                    let playlist;
                    if (li.data("packId")) {
                        let pack = game.packs.get(li.data("packId"));
                        playlist = await pack.getDocument(li.data("playlistId"));
                    } else {
                        const playlistId = li.data("playlistId");
                        playlist = game.playlists.get(playlistId);
                    }
                    const sound = playlist.sounds.get(li.data("soundId"));
                    if (sound) {
                        const sheet = sound.sheet;
                        sheet.render(true, this.popOut ? {} : {
                            top: li[0].offsetTop - 24,
                            left: window.innerWidth - ui.sidebar.position.width - sheet.options.width - 10
                        });
                    }
                }
            },
            {
                name: "PLAYLIST.SoundDelete",
                icon: '<i class="fas fa-trash"></i>',
                callback: async (li) => {
                    //++++ Delete from a compendium
                    const packId = li.data("packId");
                    let playlist;
                    if (packId) {
                        let pack = game.packs.get(packId);
                        playlist = await pack.getDocument(li.data("playlistId"));
                    } else {
                        playlist = game.playlists.get(li.data("playlistId"));
                    }
                    const sound = playlist.sounds.get(li.data("soundId"));
                    return sound.deleteDialog({
                        top: Math.min(li[0].offsetTop, window.innerHeight - 350),
                        left: window.innerWidth - 720
                    })
                }
            },
            {
                name: "Clear Selected Sounds",
                icon: '<i class="fas fa-dumpster"></i>',
                conditional: (li) => {
                    const packId = li.data("packId");
                    return !packId;
                },
                callback: async (li) => {
                    const packId = li.data("packId");
                    let playlist;
                    if (packId) {
                        let pack = game.packs.get(packId);
                        playlist = await pack.getDocument(li.data("playlistId"));
                    } else {
                        playlist = game.playlists.get(li.data("playlistId"));
                    }
                    const sound = playlist.sounds.get(li.data("soundId"));

                    let sounds = [];
                    let checkedSounds = $('.select-sound:checked', this.element);
                    if (checkedSounds.length) {
                        for (let chk of checkedSounds) {
                            sounds.push(chk.closest(".item").dataset.soundId);
                        }

                        const type = game.i18n.localize(sound.constructor.metadata.label);

                        return Dialog.confirm({
                            title: `${game.i18n.format("DOCUMENT.Delete", { type })}`,
                            content: `<h4>${game.i18n.localize("AreYouSure")}</h4><p>You're removing ${sounds.length} sounds.  These sounds will be permanently deleted and cannote be recovered.</p>`,
                            yes: () => {
                                PlaylistSound.deleteDocuments(sounds, { parent: sound.parent });
                            }
                        });
                    }
                }
            },
        ];
    }

    static addStyling() {
        $('#playlists').toggleClass('sound-enhancement', setting("change-style"));
    }

    static closeConfig(app, html) {
        if (app._sounds) {
            for (let sound of Object.values(app._sounds)) {
                if (sound.playing)
                    sound.stop();
            }
        }
    }

    static soundCreate(playlist) {
        const sound = new PlaylistSound({ name: game.i18n.localize("SOUND.New") }, { parent: playlist });
        sound.sheet.render(true);
    }

    static async playsound(app, event) {
        let target = $(event.currentTarget).closest('.item')[0];
        let sound = app._sounds[target.dataset.soundId];
        if (!sound) {
            let playlist;
            if (target.dataset.packId) {
                let pack = game.packs.get(target.dataset.packId);
                playlist = await pack.getDocument(target.dataset.playlistId);
            } else
                playlist = game.playlists.get(target.dataset.playlistId);
            sound = playlist.sounds.get(target.dataset.soundId);
        }

        if (app._sounds[target.dataset.soundId]) {
            if (app._sounds[target.dataset.soundId].playing) {
                try {
                    app._sounds[target.dataset.soundId].stop();
                } catch { }
                $(`.item[data-sound-id="${target.dataset.soundId}"] .action-play i`, app.element).attr("title", "Play Sound").addClass("fa-play").removeClass("fa-stop active");
            }
            else {
                app._sounds[target.dataset.soundId].play({ volume: 1 });
                $(`.item[data-sound-id="${target.dataset.soundId}"] .action-play i`, app.element).attr("title", "Stop Sound").removeClass("fa-play").addClass("fa-stop active");
            }
        } else {
            $(`.item[data-sound-id="${target.dataset.soundId}"] .action-play i`, app.element).attr("title", "Loading Sound").removeClass("fa-play").addClass("fa-sync");
            AudioHelper.play({ src: sound.sound.src, volume: 1, loop: false }, false).then((sound) => {
                app._sounds[target.dataset.soundId] = sound;
                $(`.item[data-sound-id="${target.dataset.soundId}"] .action-play i`, app.element).attr("title", "Stop Sound").removeClass("fa-sync").addClass("fa-stop active");
            });
        }
    }

    static _onDragStart(event) {
        const target = event.currentTarget;

        const dragData = {
            soundId: target.dataset.soundId,
            type: "PlaylistSound",
            packId: target.dataset.packId,
            playlistId: target.dataset.playlistId
        };

        event.dataTransfer.setData("text/plain", JSON.stringify(dragData));
    }

    static async _onDrop(event) {
        let data;

        try {
            data = JSON.parse(event.dataTransfer.getData('text/plain'));
        }
        catch (err) {
            return;
        }

        if (data.type == "PlaylistSound") {
            // Reference the target playlist and sound elements
            const target = event.target.closest(".item-list");
            if (!target)
                return;

            let source;
            if (data.packId) {
                let pack = game.packs.get(data.packId);
                source = await pack.getDocument(data.playlistId);
            } else {
                source = game.playlists.get(data.playlistId);
            }
            const sound = source.sounds.get(data.soundId);

            let destId = target.dataset.playlistId;
            if (destId != source.id) {
                let destination;
                if (target.dataset.packId) {
                    let pack = game.packs.get(target.dataset.packId);
                    destination = await pack.getDocument(target.dataset.playlistId);
                } else {
                    destination = game.playlists.get(target.dataset.playlistId);
                }
                return PlaylistSound.constructor.create(sound.toObject(), { parent: destination });
            } else {
                // If there's nothing to sort relative to, or the sound was dropped on itself, do nothing.
                const targetId = target.dataset.soundId;
                if (!targetId || (targetId === data.soundId)) return false;
                sound.sortRelative({
                    target: playlist.sounds.get(targetId),
                    siblings: playlist.sounds.filter(s => s.id !== data.soundId)
                });
            }
        }
    }

    static async _onDropSound(event) {
        let data;

        try {
            data = JSON.parse(event.dataTransfer.getData('text/plain'));
        }
        catch (err) {
            return;
        }

        if (data.type == "PlaylistSound") {
            // Reference the target playlist and sound elements
            let source;
            if (data.packId) {
                let pack = game.packs.get(data.packId);
                source = await pack.getDocument(data.playlistId);
            } else {
                source = game.playlists.get(data.playlistId);
            }
            const sound = source.sounds.get(data.soundId);

            //fill in the information on the form with the sound information
            let soundObj = sound.toObject();
            let dataObj = (isNewrVersion(game.version, "9.9999") ? this.object : this.object.data);
            dataObj.description = soundObj.description;
            dataObj.fade = soundObj.fade;
            dataObj.flags = soundObj.flags;
            dataObj.name = soundObj.name;
            dataObj.path = soundObj.path;
            dataObj.repeat = soundObj.repeat;
            dataObj.volume = soundObj.volume;
            this.render();
            window.setTimeout(() => { $('[name="name"]', this.element).val(dataObj.name); }, 200);
        }
    }
}

Hooks.on("init", MonksSoundEnhancements.init);
Hooks.on("ready", MonksSoundEnhancements.ready);
Hooks.on("renderCompendium", MonksSoundEnhancements.updatePlaylistCompendium);
Hooks.on("closePlaylistConfig", MonksSoundEnhancements.closeConfig)
Hooks.on('renderPlaylistConfig', MonksSoundEnhancements.injectPlaylistTabs);
Hooks.on('renderPlaylistSoundConfig', MonksSoundEnhancements.addSoundDrop);
Hooks.on('renderPlaylistDirectory', MonksSoundEnhancements.addStyling);
