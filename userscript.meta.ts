import { MonkeyUserScript } from "vite-plugin-monkey";

export const USERSCRIPT = {
    name: "Canvas SpeedGrader -> PrairieLearn Code Fetcher",
    namespace: "acha666.Canvas_PrairieLearn_Fetcher",
    description:
        "In Canvas SpeedGrader, fetch PrairieLearn submissions for the current student and write decoded text to a chosen output file.",
    match: ["https://canvas.ubc.ca/courses/*/gradebook/speed_grader*"],
    connect: ["*"],
    grant: [
        "GM_xmlhttpRequest",
        "GM_addStyle",
    ],
} satisfies MonkeyUserScript;
