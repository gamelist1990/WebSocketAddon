import {
    Player,
    ItemStack,
    ItemLockMode
} from '@minecraft/server';

export interface CustomItemOptions {
    name: string;
    lore: string[];
    item: string;
    amount?: number;
    keepOnClose?: boolean;
    rollback?: boolean;
    placeableOn?: string[];  
    notPlaceableOn?: string[]; 
    itemLock?: ItemLockMode;
    remove?: boolean; 
}
export type ItemUseCallback = (player: Player, itemStack: ItemStack) => void;