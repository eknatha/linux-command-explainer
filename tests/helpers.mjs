import { loadData, LCE, stripPrivate } from '../scripts/lib/load-data.mjs';
export const data = loadData();
export const engine = LCE.create(stripPrivate({ categories: data.categories, commands: data.commands, rules: data.rules, intents: data.intents }));
export { LCE };
