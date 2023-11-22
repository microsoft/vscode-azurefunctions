import { AgentBenchmark } from "./benchmarking";

export const functionsBenchmarks: AgentBenchmark[] = [
    {
        name: "Create Function Project - Blob Trigger Template 1",
        prompt: "I want to create a function project with the blob trigger template.",
        acceptableHandlerChains: [
            ["functions", "createFunctionProject"],
        ],
        followUps: {
            required: [
                { type: "command", commandId: "azureFunctions.createNewProject" }
            ],
            acceptable: [
                { type: "reply", message: "@azure-extensions create a project" }
            ],
        },
    },
    {
        name: "Create Function Project - Blob Trigger Template 2",
        prompt: "I want to create a function project that will help me run code whenever a blob is changed.",
        acceptableHandlerChains: [
            ["functions", "createFunctionProject"],
        ],
    },
    {
        name: "Brainstorm - Learn/Brainstorm About Blob Triggers",
        prompt: "How can I use azure functions to run code whenever a blob is changed?",
        acceptableHandlerChains: [
            ["functions", "learn"],
            ["functions", "brainstorm"],
        ],
    },
    {
        name: "Learn - Functions vs WebApps",
        prompt: "What is the difference between azure functions and azure web apps?",
        acceptableHandlerChains: [
            ["functions", "learn"],
            ["functions", "brainstorm"],
        ],
    }
];
