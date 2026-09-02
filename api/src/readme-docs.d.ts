import type { Entry } from "./i18n/strings.ts";
export interface ReadmeSection {
    id: string;
    title: Entry;
    body: Entry;
}
export declare const README_SECTIONS: ReadmeSection[];
