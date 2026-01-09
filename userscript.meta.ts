import { MonkeyUserScript } from "vite-plugin-monkey";

export const USERSCRIPT = {
    name: "Canvas SpeedGrader -> PrairieLearn Code Fetcher",
    namespace: "acha666.Canvas_PrairieLearn_Fetcher",
    description:
        "In Canvas SpeedGrader, fetch PrairieLearn submissions for the current student and write decoded text to a chosen output file.",
    include: [/^https:\/\/canvas\.[a-z0-9]*?\.[a-z]*?\/courses\/[0-9]*?\/gradebook\/speed_grader.*$/],
    connect: ["us.prairielearn.com"],
    grant: [
        "GM_xmlhttpRequest",
        "GM_addStyle",
    ],
    updateURL: "https://github.com/acha666/Canvas_PrairieLearn_Fetcher/releases/latest/download/canvas-prairielearn-fetcher.user.js",
    downloadURL: "https://github.com/acha666/Canvas_PrairieLearn_Fetcher/releases/latest/download/canvas-prairielearn-fetcher.user.js",
} satisfies MonkeyUserScript;
