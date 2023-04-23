import { MonksSoundEnhancements } from "./monks-sound-enhancements.js";

export class MonksSoundEnhancementsAPI {
    static addSoundEffect(sound, name, volume) {
        sound.name = sound.name ?? name;
        sound.effectiveVolume = sound.effectiveVolume ?? volume;
        MonksSoundEnhancements.addSoundEffect(sound);
    }
}