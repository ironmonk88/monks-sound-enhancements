import { ActorSounds } from "./actor-sounds.js";
import { registerSettings } from "./settings.js";
import { MonksSoundEnhancementsAPI } from "./monks-sound-enhancements-api.js";

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

export let patchFunc = (prop, func, type = "WRAPPER") => {
    if (game.modules.get("lib-wrapper")?.active) {
        libWrapper.register("monks-sound-enhancements", prop, func, type);
    } else {
        const oldFunc = eval(prop);
        eval(`${prop} = function (event) {
            return func.call(this, ${type != "OVERRIDE" ? "oldFunc.bind(this)," : ""} ...arguments);
        }`);
    }
}

export class MonksSoundEnhancements {
    static tracker = false;
    static tokenbar = null;
    static sounds = {};

    static emit(action, args = {}) {
        args.action = action;
        args.senderId = game.user.id
        game.socket.emit(MonksSoundEnhancements.SOCKET, args, (resp) => { });
    }

    static async onMessage(data) {
        switch (data.action) {
            case 'stop': {
                try {
                    let token = fromUuidSync(data.uuid)
                    if (token) {
                        if (token.soundeffect?.playing) {
                            token.soundeffect.fade(0, { duration: 250 }).then(() => {
                                token.soundeffect.stop();
                                delete token.soundeffect;
                            });
                        } else
                            delete token.soundeffect;
                    }
                } catch { }
            }
            case 'play': {
                if (game.user.id != data.senderId) {
                    try {
                        let token = fromUuidSync(data.uuid);
                        if (!token.soundeffect) {
                            ActorSounds.playSoundEffect(data.audiofile, data.volume).then((sound) => {
                                if (sound) {
                                    token.soundeffect = sound;
                                    token.soundeffect.effectiveVolume = data.volume;
                                    MonksSoundEnhancements.addSoundEffect(sound);
                                    return sound;
                                }
                            });
                        }
                    } catch { }
                }
            }
            case 'render': {
                game.playlists.render();
            }
        }
    }

    static init() {
        registerSettings();

        game.MonksSoundEnhancements = MonksSoundEnhancementsAPI;

        MonksSoundEnhancements.SOCKET = "module.monks-sound-enhancements";

        try {
            Object.defineProperty(User.prototype, "isTheGM", {
                get: function isTheGM() {
                    return this == (game.users.find(u => u.hasRole("GAMEMASTER") && u.active) || game.users.find(u => u.hasRole("ASSISTANT") && u.active));
                }
            });
        } catch { }

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

        let PlaylistGetData = async function (wrapped, ...args) {
            let result = await wrapped(...args);

            if (game.user.isGM && Object.keys(MonksSoundEnhancements.sounds).length) {
                result.showPlaying = true;
                // Add the sound effects
                for (let [k, v] of Object.entries(MonksSoundEnhancements.sounds)) {
                    let s = v.sound;
                    let sound = {
                        css: s.playing ? "playing" : "",
                        playlistId: "monks-sound-enhancements",
                        _id: k,
                        name: v.sound.name,
                        repeat: false,
                        controlCSS: game.user.isGM ? "" : "disabled",
                        playing: true,
                        playIcon: this._getPlayIcon(v.sound),
                        playTitle: s.pausedTime ? "PLAYLIST.SoundResume" : "PLAYLIST.SoundPlay",
                        currentTime: this._formatTimestamp(s.playing ? s.currentTime : s.pausedTime),
                        durationTime: this._formatTimestamp(s.duration),
                        lvolume: AudioHelper.volumeToInput(s.effectiveVolume),
                        isPaused: !s.playing && s.pausedTime,
                        pauseIcon: this._getPauseIcon(v.sound)
                    }
                    result.playingSounds.push(sound);
                }
            }

            return result;
        }

        patchFunc("PlaylistDirectory.prototype.getData", PlaylistGetData);

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

        if (setting("actor-sounds"))
            ActorSounds.init();
    }

    static ready() {
        game.socket.on(MonksSoundEnhancements.SOCKET, MonksSoundEnhancements.onMessage);

        ui.playlists._currentExpanded = true;

        ui.sidebar.tabs.playlists.options.renderUpdateKeys.push("flags");

        if (!(setting("actor-sounds") === "none" || setting("actor-sounds") === 'false'))
            ActorSounds.injectSoundCtrls();
    }

    static addSoundEffect(sound) {
        if (sound) {
            let id = foundry.utils.randomID(16);
            let _soundStop = () => {
                delete MonksSoundEnhancements.sounds[id];
                ui.playlists.render(true);
                if (Object.keys(MonksSoundEnhancements.sounds).length == 0) {
                    window.clearInterval(MonksSoundEnhancements.updateId);
                    MonksSoundEnhancements.updateId = null;
                }
            }
            sound.on("stop", _soundStop);
            sound.on("end", _soundStop);
            MonksSoundEnhancements.sounds[id] = { id, sound };
            ui.playlists.render(true);
            if (!MonksSoundEnhancements.updateId) {
                MonksSoundEnhancements.updateId = window.setInterval(MonksSoundEnhancements._updateTimestamps, 1000);
            }
        }
    }

    static _updateTimestamps() {
        if (Object.keys(MonksSoundEnhancements.sounds).length == 0) return;
        const playing = ui.playlists.element.find("#currently-playing")[0];
        if (!playing) return;
        for (let [k, v] of Object.entries(MonksSoundEnhancements.sounds)) {
            const li = playing.querySelector(`.sound[data-sound-id="${k}"]`);
            if (!li) continue;

            // Update current and max playback time
            const current = li.querySelector("span.current");
            const ct = v.sound.playing ? v.sound.currentTime : v.sound.pausedTime;
            if (current) current.textContent = ui.playlists._formatTimestamp(ct);
            const max = li.querySelector("span.duration");
            if (max) max.textContent = ui.playlists._formatTimestamp(v.sound.duration);

            // Remove the loading spinner
            const play = li.querySelector("a.pause i.fas");
            if (play.classList.contains("fa-spinner")) {
                play.classList.remove("fa-spin");
                play.classList.replace("fa-spinner", "fa-pause");
            }
        }
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

    static async renderPlaylist(app, html, data) {
        if (getProperty(app.object, "flags.syrinscape") != undefined && game.modules.get("fvtt-syrin-control")?.active) {
            return;
        }
        // Inject playlist tabs
        let configData = {
            pack: data.document.pack,
            playlist: data.document.id,
            cantAdd: data.document.isEmbedded || data.document.compendium?.locked || !data.document.constructor.canUserCreate(game.user),
            cantDelete: data.document.isEmbedded || data.document.compendium?.locked || !game.user.isGM
            //compendiumDelete: !data.document.isEmbedded && data.document.compendium && !data.document.compendium.locked && data.document.constructor.canUserModify(game.user, "delete")
        };

        configData.sounds = (isNewerVersion(game.version, "9.9999") ? app.object.sounds : app.object.data.sounds)
            .filter(s => !!s)
            .map(s => {
                return {
                    id: s.id,
                    name: s.name,
                    sort: s.sort,
                    data: { name: s.name, sort: s.sort },
                    duration: MonksSoundEnhancements.getDuration(s, html)
                }
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
        $('.action-delete', html).on("click", MonksSoundEnhancements.soundDelete.bind(app, app.object));
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

        // Add the check box for hiding the sound names from the players
        $('input[name="fade"]', html).parent().after(
            $("<div>").addClass("form-group")
                .append($("<label>").html(i18n("MonksSoundEnhancements.HidePlaylistHint")))
                .append($("<input>").attr("type", "checkbox").attr("name", "flags.monks-sound-enhancements.hide-playlist").prop("checked", getProperty(data.document, "flags.monks-sound-enhancements.hide-playlist")))
        );

        app.setPosition({ height: 'auto' });
        app._sounds = {};

        app._restoreScrollPositions(html);
    }

    static async renderPlaylistSound(app, html, data) {
        // Add drop
        let el = html[0];

        app.options.dragDrop = [{ dropSelector: "form" }];
        app._onDrop = MonksSoundEnhancements._onDropSound;
        if (!app._dragDrop.length) {
            app._dragDrop = app._createDragDropHandlers();
        } else
            el = el.parentElement;
        app._dragDrop.forEach(d => d.bind(el));

        // Add the check box for hiding the sound names from the players
        $('input[name="fade"]', html).parent().after(
            $("<div>").addClass("form-group")
                .append($("<label>").html("Hide name"))
                .append($("<input>").attr("type", "checkbox").attr("name", "flags.monks-sound-enhancements.hide-name").prop("checked", getProperty(data.document, "flags.monks-sound-enhancements.hide-name")))
        );

        app.setPosition({ height: 'auto' });
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

    static renderPlaylistDirectory(app, html, data, options) {
        $('#playlists').toggleClass('sound-enhancement', setting("change-style"));
        $('#playlists-popout').toggleClass('sound-enhancement', setting("change-style"));

        if (app._currentExpanded == undefined)
            app._currentExpanded = true;

        $('#currently-playing .playlist-header a.pin i').removeClass('fa-caret-down,fa-caret-up').addClass('fa-thumb-tack');
        $('#currently-playing .playlist-header h4').click(MonksSoundEnhancements._onCurrentCollapse.bind(app)).append(`<i class="collapse fa fa-angle-${app._currentExpanded ? 'down' : 'up'}"></i>`);
        $('#currently-playing').toggleClass('collapsed', !app._currentExpanded);

        $('#global-volume .playlist-sounds').append(
            $('<li>')
                .addClass('sound flexrow')
                .append($('<h4>').addClass('sound-name').attr('draggable', 'true').html("Sound Effects"))
                .append($('<i>').addClass('volume-icon fas fa-volume-down'))
                .append($('<input>')
                    .addClass('global-volume-slider')
                    .attr({ name: 'globalSoundEffectVolume', type: 'range', min: '0', max: '1', step: '0.05', value: AudioHelper.volumeToInput(game.settings.get("core", "globalSoundEffectVolume")) })
                    .change(app._onGlobalVolume.bind(app))                )
        );

        $('.playlist-sounds li.sound', html).each(function () {
            let playlistId = $(this).attr("data-playlist-id");
            let soundId = $(this).attr("data-sound-id");

            if (playlistId && soundId) {
                let playlist = app.documents.find(p => p._id == playlistId);
                if (playlist) {
                    let sound = playlist.sounds.get(soundId);

                    if (sound) {
                        if (!game.user.isGM && ((getProperty(playlist, "flags.monks-sound-enhancements.hide-playlist") && setting("playlist-hide-names")) || getProperty(sound, "flags.monks-sound-enhancements.hide-name")))
                            $('.sound-name', this).html("-");
                        if (game.user.isGM && getProperty(sound, "flags.monks-sound-enhancements.hide-name") && this.closest('#currently-playing') == undefined)
                            $('.sound-name', this).html('<i class="fas fa-eye"></i> ' + $('.sound-name', this).html());
                    }
                }
            }
        });
        $('.playlist.document', html).each(function () {
            let playlistId = this.dataset.documentId;
            if (playlistId) {
                let playlist = app.documents.find(p => p._id == playlistId);
                if (getProperty(playlist, "flags.monks-sound-enhancements.hide-playlist")) {
                    if (!game.user.isGM)
                        $(this).addClass("player-hidden").hide();
                    else
                        $('h4.playlist-name', this).html('<i class="fas fa-eye"></i> ' + $('h4.playlist-name', this).html());
                }
            }
        });
        if (game.user.isGM) {
            $('.playlist-sounds li.sound h4', html).on("click", MonksSoundEnhancements.selectPlaylistSound.bind(this));
        }

        $('#currently-playing .playlist-sounds li.sound[data-playlist-id="monks-sound-enhancements"]').each(function() {
            $(this).addClass('sound-effect');
            $('.sound-control[data-action="sound-repeat"]', this).hide();
            $('.sound-control[data-action="sound-play"]', this).hide(); //.attr('data-mse-action', $('.sound-control[data-action="sound-play"]').attr('data-action')).attr('data-action', '').on('click', MonksSoundEnhancements.playSoundEffect.bind(this));
            $('.sound-control[data-action="sound-stop"]', this).attr('data-mse-action', $('.sound-control[data-action="sound-stop"]').attr('data-action')).attr('data-action', '').on('click', MonksSoundEnhancements.playSoundEffect.bind(this));
            $('.sound-control[data-action="sound-pause"]', this).hide(); //.attr('data-mse-action', $('.sound-control[data-action="sound-pause"]').attr('data-action')).attr('data-action', '').on('click', MonksSoundEnhancements.playSoundEffect.bind(this));
            $('.sound-volume', this).off('change').on('change', MonksSoundEnhancements.soundEffectVolume.bind(this));
        })

        if (!game.user.isGM) {
            $('.sound .sound-controls', html).css({flex: "0 0 0px", "overflow": "hidden"});
            $('.sound .sound-playback .sound-control, .playlist .playlist-header .sound-controls', html).hide();
        }
    }

    static playSoundEffect(evt) {
        let btn = evt.currentTarget;
        let soundId = btn.closest('li.sound').dataset.soundId;
        let mseSound = MonksSoundEnhancements.sounds[soundId];
        if (mseSound) {
            let action = btn.dataset.mseAction;
            if (!action || btn.classList.contains("disabled")) return;

            switch (action) {
                case "sound-stop":
                    if (mseSound.sound?.playing) {
                        mseSound.sound.fade(0, { duration: 250 }).then(() => {
                            mseSound.sound?.stop();
                        });
                    }
                    return;
            }
        }
    }

    static soundEffectVolume(evt) {
        log("Change Volume", evt.currentTarget.closest('li.sound').dataset.soundId);
        const slider = event.currentTarget;
        let soundId = slider.closest('li.sound').dataset.soundId;
        let mseSound = MonksSoundEnhancements.sounds[soundId];
        if (mseSound && mseSound) {
            const volume = AudioHelper.inputToVolume(slider.value);
            if (volume === mseSound.sound.effectiveVolume) return;

            mseSound.sound.effectiveVolume = volume;
            //+++figure out how to send a volume change to the players
            mseSound.sound.volume = volume * game.settings.get("core", "globalSoundEffectVolume");
        }
    }

    static _onCurrentCollapse(event) {
        event.preventDefault();
        const div = event.currentTarget.parentElement.parentElement;
        this._currentExpanded = !this._currentExpanded;
        this._collapse(div, !this._currentExpanded);
    }

    static selectPlaylistSound(evt) {
        const playlistId = evt.currentTarget.closest("li.sound").dataset.playlistId;
        const soundId = evt.currentTarget.closest("li.sound").dataset.soundId;

        const playlist = game.playlists.get(playlistId);
        const sound = playlist?.sounds?.get(soundId);
        if (sound) {
            const allowed = Hooks.call("clickPlaylistSound", sound, game.user.id);
            if (!allowed) return;

            if (!sound.playing)
                playlist.playSound(sound);
            else
                sound.update({ playing: false, pausedTime: sound.sound.currentTime });
        }
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

    static soundDelete(playlist) {
        let sounds = [];
        let checkedSounds = $('.select-sound:checked', this.element);
        if (checkedSounds.length) {
            for (let chk of checkedSounds) {
                sounds.push(chk.closest(".item").dataset.soundId);
            }

            const type = game.i18n.localize(PlaylistSound.metadata.label);

            return Dialog.confirm({
                title: `${game.i18n.format("DOCUMENT.Delete", { type })}`,
                content: `<h4>${game.i18n.localize("AreYouSure")}</h4><p>You're removing ${sounds.length} sounds.  These sounds will be permanently deleted and cannote be recovered.</p>`,
                yes: () => {
                    PlaylistSound.deleteDocuments(sounds, { parent: playlist });
                }
            });
        }
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
            if (app._sounds[target.dataset.soundId] == 'loading') {
                app._sounds[target.dataset.soundId] = "stop";
            } else {
                if (app._sounds[target.dataset.soundId].playing) {
                    try {
                        app._sounds[target.dataset.soundId].stop();
                    } catch { }
                    $(`.item[data-sound-id="${target.dataset.soundId}"] .action-play i`, app.element).attr("title", "Play Sound").addClass("fa-play").removeClass("fa-stop active");
                }
                else {
                    await app._sounds[target.dataset.soundId].load();
                    app._sounds[target.dataset.soundId].play({ volume: 1 });
                    $(`.item[data-sound-id="${target.dataset.soundId}"] .action-play i`, app.element).attr("title", "Stop Sound").removeClass("fa-play").addClass("fa-stop active");
                }
            }
        } else {
            $(`.item[data-sound-id="${target.dataset.soundId}"] .action-play i`, app.element).attr("title", "Loading Sound").removeClass("fa-play").addClass("fa-sync");
            app._sounds[target.dataset.soundId] = 'loading';
            AudioHelper.play({ src: sound.sound.src, volume: 1, loop: false }, false).then((sound) => {
                sound.on("stop", () => {
                    $(`.item[data-sound-id="${target.dataset.soundId}"] .action-play i`, app.element).attr("title", "Play Sound").addClass("fa-play").removeClass("fa-sync fa-stop active");
                });
                sound.on("end", () => {
                    $(`.item[data-sound-id="${target.dataset.soundId}"] .action-play i`, app.element).attr("title", "Play Sound").addClass("fa-play").removeClass("fa-sync fa-stop active");
                });
                if (app._sounds[target.dataset.soundId] == "stop") {
                    app._sounds[target.dataset.soundId] = sound;
                    try {
                        sound.stop();
                    } catch { }
                } else {
                    app._sounds[target.dataset.soundId] = sound;
                    $(`.item[data-sound-id="${target.dataset.soundId}"] .action-play i`, app.element).attr("title", "Stop Sound").removeClass("fa-sync").addClass("fa-stop active");
                }
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

    static hotbarDrop(app, data, slot) {
        if (data.type === "PlaylistSound" || data.type === "Playlist") {
            const doc = fromUuidSync(data.uuid)
            if (!doc) return;

            const name = doc.name || `${game.i18n.localize(doc.constructor.metadata.label)} ${doc.id}`;
            const command = `
try {
    const sound = await fromUuid("${data.uuid}");
    if (sound) {
        if (sound instanceof Playlist) {
            sound.playAll();
        } else {
            if (!sound.playing)
                sound.parent.playSound(sound);
            else
                sound.update({ playing: false, pausedTime: sound.sound.currentTime });
        }
    }
} catch {}
`;
            Macro.implementation.create({
                name: `${game.i18n.localize("Play")} ${name}`,
                type: CONST.MACRO_TYPES.SCRIPT,
                img: "modules/monks-sound-enhancements/icons/music-macro.png",
                command: command
            }).then((macro) => {
                if (macro) game.user.assignHotbarMacro(macro, slot, { fromSlot: data.slot });
            });

            return false;
        }
    }

    /*
    static getVolumeAverage(url) {
        var ctx = c.getContext("2d"), ref, audio;
        var actx = new (AudioContext || webkitAudioContext)();
        ctx.font = "20px sans-serif";
        ctx.fillText("Loading and processing...", 10, 50);
        ctx.fillStyle = "#001730";

        // Load audio
        fetch(url, { mode: "cors" })
            .then(function (resp) { return resp.arrayBuffer() })
            .then(actx.decodeAudioData.bind(actx))
            .then(function (buffer) {

                // Get data from channel 0 (you will want to measure all/avg.)
                var channel = buffer.getChannelData(0);

                // dB per window + Plot
                var points = [0];
                for (var x = 1, i, v; x < c.width; x++) {
                    i = ((x / c.width) * channel.length) | 0;   // get index in buffer based on x
                    v = Math.abs(dB(channel, i, 8820)) / 40;  // 200ms window, normalize
                    ctx.lineTo(x, c.height * v);
                    points.push(v);
                }
                ctx.fill();

                // smooth using bins
                var bins = 40;  // segments
                var range = (c.width / bins) | 0;
                var sum;
                ctx.beginPath();
                ctx.moveTo(0, c.height);
                for (x = 0, v; x < points.length; x++) {
                    for (v = 0, i = 0; i < range; i++) {
                        v += points[x++];
                    }
                    sum = v / range;
                    ctx.lineTo(x - (range >> 1), sum * c.height); //-r/2 to compensate visually
                }
                ctx.lineWidth = 2;
                ctx.strokeStyle = "#c00";
                ctx.stroke();

                // for audio / progressbar only
                c.style.backgroundImage = "url(" + c.toDataURL() + ")";
                c.width = c.width;
                ctx.fillStyle = "#c00";
                audio = document.querySelector("audio");
                audio.onplay = start;
                audio.onended = stop;
                audio.style.display = "block";
            });

        // calculates RMS per window and returns dB
        function dB(buffer, pos, winSize) {
            for (var rms, sum = 0, v, i = pos - winSize; i <= pos; i++) {
                v = i < 0 ? 0 : buffer[i];
                sum += v * v;
            }
            rms = Math.sqrt(sum / winSize);  // corrected!
            return 20 * Math.log10(rms);
        }
    }
    */

    static getDuration(sound, html) {
        if (sound.sound.duration || sound._duration)
            return MonksSoundEnhancements._formatTimestamp(sound.sound.duration || sound._duration);

        // Create a non-dom allocated Audio element
        var au = document.createElement('audio');

        // Define the URL of the MP3 audio file
        au.src = sound.path;

        // Once the metadata has been loaded, display the duration in the console
        au.addEventListener('loadedmetadata', function () {
            // Obtain the duration in seconds of the audio file (with milliseconds as well, a float value)
            var duration = au.duration;

            // example 12.3234 seconds
            sound._duration = duration;
            $(`li[data-sound-id="${sound.id}"] .item-duration`).html(MonksSoundEnhancements._formatTimestamp(duration));
            console.log("The duration of " + sound.path + " is of: " + duration + " seconds");
            // Alternatively, just display the integer value with
            // parseInt(duration)
            // 12 seconds
        }, false);
    }

    static _formatTimestamp(seconds) {
        if (seconds === Infinity) return "∞";
        seconds = seconds ?? 0;
        let minutes = Math.floor(seconds / 60);
        seconds = Math.round(seconds % 60);
        return `${minutes}:${seconds.paddedString(2)}`;
    }
}

Hooks.on("init", MonksSoundEnhancements.init);
Hooks.on("ready", MonksSoundEnhancements.ready);
Hooks.on("renderCompendium", MonksSoundEnhancements.updatePlaylistCompendium);
Hooks.on("closePlaylistConfig", MonksSoundEnhancements.closeConfig)
Hooks.on('renderPlaylistConfig', MonksSoundEnhancements.renderPlaylist);
Hooks.on('renderPlaylistSoundConfig', MonksSoundEnhancements.renderPlaylistSound);
Hooks.on('renderPlaylistDirectory', MonksSoundEnhancements.renderPlaylistDirectory);
Hooks.on('hotbarDrop', MonksSoundEnhancements.hotbarDrop);

Hooks.on("getPlaylistDirectoryEntryContext", (html, options, app) => {
    options.unshift(
        {
            name: i18n("MonksSoundEnhancements.RevealPlaylist"),
            icon: '<i class="fas fa-eye"></i>',
            condition: li => {
                let id = li[0].closest(".playlist").dataset.documentId;
                let playlist = game.playlists.get(id);
                if (playlist)
                    return game.user.isGM && getProperty(playlist, "flags.monks-sound-enhancements.hide-playlist");
                else
                    return false;
            },
            callback: async (li) => {
                let id = li[0].closest(".playlist").dataset.documentId;
                let playlist = game.playlists.get(id);
                if (playlist) {
                    let result = await playlist.update({ "flags.monks-sound-enhancements.hide-playlist": false });
                    playlist.collection.render();
                    return result;
                }
            }
        },
        {
            name: i18n("MonksSoundEnhancements.HidePlaylist"),
            icon: '<i class="fas fa-eye-slash"></i>',
            condition: li => {
                let id = li[0].closest(".playlist").dataset.documentId;
                let playlist = game.playlists.get(id);
                if (playlist)
                    return game.user.isGM && !getProperty(playlist, "flags.monks-sound-enhancements.hide-playlist");
                else
                    return false;
            },
            callback: async (li) => {
                let id = li[0].closest(".playlist").dataset.documentId;
                let playlist = game.playlists.get(id);
                if (playlist) {
                    let result = await playlist.update({ "flags.monks-sound-enhancements.hide-playlist": true });
                    playlist.collection.render();
                    return result;
                }
            }
        }
    );
});

Hooks.on("getPlaylistDirectorySoundContext", (html, options, app) => {
    options.unshift(
        {
            name: i18n("MonksSoundEnhancements.RevealSoundName"),
            icon: '<i class="fas fa-eye"></i>',
            condition: li => {
                let playlist = game.playlists.get(li.data("playlistId"));
                let sound = playlist.sounds.get(li.data("soundId"));
                return game.user.isGM && getProperty(sound, "flags.monks-sound-enhancements.hide-name");
            },
            callback: li => {
                let playlist = game.playlists.get(li.data("playlistId"));
                let sound = playlist.sounds.get(li.data("soundId"));
                return sound.update({ "flags.monks-sound-enhancements.hide-name": false });
            }
        },
        {
            name: i18n("MonksSoundEnhancements.HideSoundName"),
            icon: '<i class="fas fa-eye-slash"></i>',
            condition: li => {
                let playlist = game.playlists.get(li.data("playlistId"));
                let sound = playlist.sounds.get(li.data("soundId"));
                return game.user.isGM && !getProperty(sound, "flags.monks-sound-enhancements.hide-name");
            },
            callback: li => {
                let playlist = game.playlists.get(li.data("playlistId"));
                let sound = playlist.sounds.get(li.data("soundId"));
                return sound.update({ "flags.monks-sound-enhancements.hide-name": true });
            }
        }
    );
});

Hooks.on("updateCombat", (combat, delta) => {
    if (setting("playsound-combat") && game.user.isTheGM && combat && combat.started === true) {
        if (combat.previous?.combatantId) {
            let previous = combat.combatants.get(combat.previous.combatantId);
            if (previous) {
                previous.token.playSound({ action: "stop" });
            }
        }
        combat.combatant.token.playSound();
    }
});

Hooks.on("globalSoundEffectVolumeChanged", (volume) => {
    for (let sound of Object.values(MonksSoundEnhancements.sounds)) {
        if (sound.sound?.playing) {
            sound.sound.volume = (sound.sound.effectiveVolume ?? 1) * volume;
        }
    }
});
