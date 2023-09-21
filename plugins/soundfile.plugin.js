import { MonksSoundEnhancements, log, i18n, setting } from "../monks-sound-enhancements.js"

let SoundFilePlugin = {
    init: function (editor, url) {

        /* Add a button that opens a window */
        editor.ui.registry.addButton('soundeffect', {
            tooltip: i18n("MonksSoundEnhancements.AddSoundEffect"),
            icon: "embed",
            onAction: function () {
                /* Open window */
                SoundFilePlugin.openDialog(editor);
            }
        });
        /* Adds a menu item, which can then be included in any menu via the menu/menubar configuration */
        editor.ui.registry.addMenuItem('soundeffect', {
            text: i18n("MonksSoundEnhancements.AddSoundEffect"),
            onAction: function () {
                /* Open window */
                SoundFilePlugin.openDialog(editor);
            }
        });
        /* Return the metadata for the help plugin */
        return {
            getMetadata: function () {
                return {
                    name: 'Sound File plugin',
                    url: ''
                };
            }
        };
    },

    openDialog: function (editor) {
        return editor.windowManager.open({
            title: i18n("MonksSoundEnhancements.AddSoundEffect"),
            body: {
                type: 'panel',
                items: [
                    {
                        type: 'input',
                        name: 'name',
                        label: "Text"
                    },
                    {
                        type: 'input',
                        name: 'target',
                        label: "File Path"
                    },
                    {
                        type: 'checkbox',
                        name: 'allowpause',
                        label: "Allow Pause"
                    }
                ]
            },
            buttons: [
                {
                    type: 'cancel',
                    text: "Close"
                },
                {
                    type: 'submit',
                    text: "Save",
                    primary: true
                }
            ],
            onSubmit: function (api) {
                var data = api.getData();
                editor.insertContent(`@Sound[${data.target}${data.allowpause ? " allowpause" : ""}]${data.name ? "{" + data.name + "}" : ""}`);

                api.close();
            }
        });
    }
}

export let soundfileinit = SoundFilePlugin.init;