/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Naystie
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import definePlugin from "@utils/types";
import { waitFor } from "@webpack";

import { PlayTime } from "./components";
import managedStyle from "./styles.css?managed";

let LayoutTypes = {
    CATEGORY: 5,
    CUSTOM: 19
};
waitFor(["SIDEBAR_ITEM", "CATEGORY", "CUSTOM"], m => LayoutTypes = m);

export default definePlugin({
    name: "PlayTime",
    description: "Shows how long you've played each game",
    authors: [{ name: "Nays", id: 344871509677965313n }],
    managedStyle,

    patches: [
        {
            find: "REGISTERED_GAMES_PANEL,{",
            replacement: {
                match: /REGISTERED_GAMES_PANEL,\{useTitle:.{0,60}?,buildLayout:\(\)=>\[\i/,
                replace: "$&,$self.buildCategory()"
            }
        }
    ],

    buildCategory: () => ({
        key: "vc_play_time_category",
        type: LayoutTypes.CATEGORY,
        useTitle: () => "Play Time",
        buildLayout: () => [{
            key: "vc_play_time",
            type: LayoutTypes.CUSTOM,
            Component: PlayTime,
            useSearchTerms: () => ["Play Time", "Hours Played"]
        }]
    })
});
