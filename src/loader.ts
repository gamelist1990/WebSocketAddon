import { system, world, } from '@minecraft/server';
import { ver } from './plugins/ScoreModule/main';


const startTime = Date.now();

if (!system || !world) {
    console.error("Script Error: @minecraft/server module failed to load.  Ensure you have experimental gameplay enabled and are using a compatible Minecraft version");
}


async function loadAllImports() {
    try {
        await import('./module/import');
        await import('./plugins/import');
    } catch (error) {
        console.warn(`Error importing modules: ${(error as Error).message}`);
    }
}


if (system) {
    system.run(() => {
        main();
    });
}


async function main() {
    if (system && world) {
        system.runTimeout(async () => {
            try {
                await loadAllImports();
            } catch (error) {
                console.warn(`Error loading data: ${(error as Error).message}`);
            }

            const endTime = Date.now();
            const loadTime = endTime - startTime;

            world.sendMessage(`§f[§bServer§f]§l§aWebSocketAddon§6v${ver}§aのデータの更新が ${loadTime} msで完了しました`)


        }, 1);
    }
}