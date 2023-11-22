/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from "vscode";
import { agentName } from "../agentConsts";
import { FallbackSlashCommandHandlers, SlashCommand, SlashCommandConfig, SlashCommandHandlerResult, SlashCommandOwner } from "../slashCommands";
import { functionsBenchmarks } from "./functionsBenchmarks";

export type AgentBenchmark = {
    /**
     * The name of the benchmark.
     */
    name: string,
    /**
     * The simulated user input.
     */
    prompt: string,
    /**
     * Acceptable handler chains for the `prompt`.
     */
    acceptableHandlerChains: string[][],
    followUps?: {
        /**
         * Follow ups that must be returned for the `prompt`.
         * - For command follow ups, it will be verified that the `commandId` matches EXACTLY.
         * - For reply follow ups, it will be verified that the `message` contains the expected message.
         */
        required: ({ type: "command", commandId: string } | { type: "reply", message: string })[],
        /**
         * Follow ups that must be returned for the `prompt`.
         * - For command follow ups, it will be verified that the `commandId` matches EXACTLY.
         * - For reply follow ups, it will be verified that the `message` contains the expected message.
         */
        acceptable: ({ type: "command", commandId: string } | { type: "reply", message: string })[],
    },
};

const benchmarks: AgentBenchmark[] = [
    ...functionsBenchmarks
];

type AgentBenchmarkRunStats = {
    startTime: number,
    endTime: number,
    handlerChainValid: boolean;
    followUps: {
        allRequiredFollowUpsFound: boolean,
        allFollowUpsRequiredOrAcceptable: boolean,
    },
};

const benchmarksRunsStats: AgentBenchmarkRunStats[][] = benchmarks.map(() => []);

const benchmarkCommandName = "benchmark";
const benchmarkStatsCommandName = "benchmarkStats";

export class AgentBenchmarker {
    private _agentSlashCommandOwner: SlashCommandOwner;
    private _benchmarkerSlashCommandOwner: SlashCommandOwner;
    private _continuationIndex: number;

    constructor(agentSlashCommandOwner: SlashCommandOwner) {
        this._agentSlashCommandOwner = agentSlashCommandOwner;

        const slashCommands = new Map([this._getBenchmarkSlashCommand(), this._getBenchmarkStatsSlashCommand()]);
        const fallbackSlashCommandHandlers: FallbackSlashCommandHandlers = { noInput: undefined, default: undefined };
        this._benchmarkerSlashCommandOwner = new SlashCommandOwner(slashCommands, fallbackSlashCommandHandlers);

        this._continuationIndex = 0;
    }

    public handleRequestOrPrompt(request: vscode.ChatAgentRequest | string, context: vscode.ChatAgentContext, progress: vscode.Progress<vscode.ChatAgentExtendedProgress>, token: vscode.CancellationToken): Promise<SlashCommandHandlerResult> {
        return this._benchmarkerSlashCommandOwner.handleRequestOrPrompt(request, context, progress, token, true);
    }


    public getFollowUpForLastHandledSlashCommand(result: vscode.ChatAgentResult2, token: vscode.CancellationToken): vscode.ChatAgentFollowup[] | undefined {
        return this._benchmarkerSlashCommandOwner.getFollowUpForLastHandledSlashCommand(result, token);
    }

    private async _benchmarkAgent(userContent: string, ctx: vscode.ChatAgentContext, progress: vscode.Progress<vscode.ChatAgentExtendedProgress>, token: vscode.CancellationToken): Promise<SlashCommandHandlerResult> {
        const followUps: vscode.ChatAgentFollowup[] = [];

        const requestedBenchmarkIndex = parseInt(userContent);

        if (isNaN(requestedBenchmarkIndex) || requestedBenchmarkIndex >= benchmarks.length) {
            await this._runBenchmark(this._continuationIndex, ctx, progress, token);
            this._continuationIndex++;

            if (this._continuationIndex === benchmarks.length) {
                this._debugBenchmarking(progress, `🎉 Done benchmarking!`);
                followUps.push({ message: `@${agentName} /${benchmarkStatsCommandName}` });
                this._continuationIndex = 0;
            }
            followUps.push({ message: `@${agentName} /${benchmarkCommandName}` });
        } else {
            await this._runBenchmark(requestedBenchmarkIndex, ctx, progress, token);

            followUps.push({ message: `@${agentName} /${benchmarkCommandName}` });
            followUps.push({ message: `@${agentName} /${benchmarkCommandName} ${requestedBenchmarkIndex}` });
            followUps.push({ message: `@${agentName} /${benchmarkCommandName} ${requestedBenchmarkIndex === benchmarks.length - 1 ? 0 : requestedBenchmarkIndex + 1}` });
            followUps.push({ message: `@${agentName} /${benchmarkStatsCommandName}` });
        }

        return {
            chatAgentResult: {},
            followUp: followUps,
        };
    }

    private async _runBenchmark(benchmarkIdx: number, ctx: vscode.ChatAgentContext, progress: vscode.Progress<vscode.ChatAgentExtendedProgress>, token: vscode.CancellationToken): Promise<void> {

        const benchmark = benchmarks[benchmarkIdx];

        this._debugBenchmarking(progress, `📋 Benchmark (${this._continuationIndex}/${benchmarks.length}): ${benchmark.name}\n💭 Prompt: '${benchmark.prompt}'...`);

        const startTime = Date.now();
        const handleResult = await this._agentSlashCommandOwner.handleRequestOrPrompt({ prompt: benchmark.prompt, variables: {}, }, ctx, progress, token);
        const endTime = Date.now();

        if (handleResult) {
            let validationString = "🔍 Automated Validation:\n";
            const handlerChainIsAcceptable = this._validateHandlerChain(handleResult.handlerChain || [], benchmark.acceptableHandlerChains);
            validationString += handlerChainIsAcceptable ? `✅ Handler chain is acceptable (${JSON.stringify(handleResult.handlerChain)}).\n` : `❌ Handler chain is unacceptable. Expected one of: ${JSON.stringify(benchmark.acceptableHandlerChains)}, Actual: ${JSON.stringify(handleResult.handlerChain)}\n`;

            const followUps = handleResult.followUp || [];
            if (followUps.length > 0) {
                this._debugBenchmarking(progress, `⏭️ Follow Ups:\n${followUps.map((followUp) => JSON.stringify(followUp)).join("\n")}`);
            }

            const followUpValidation = benchmark.followUps;
            const { allFollowUpsRequiredOrAcceptable, allRequiredFollowUpsFound } = !followUpValidation ? { allFollowUpsRequiredOrAcceptable: true, allRequiredFollowUpsFound: true } : this._validateFollowUps(followUps, followUpValidation);
            validationString += allRequiredFollowUpsFound ? `✅ All required follow ups found.\n` : `❌ Not all required follow ups found.\n`;
            validationString += allFollowUpsRequiredOrAcceptable ? `✅ All follow ups required or acceptable.\n` : `❌ Not all follow ups required or acceptable.\n`;

            this._debugBenchmarking(progress, validationString);

            const stats: AgentBenchmarkRunStats = {
                startTime: startTime,
                endTime: endTime,
                handlerChainValid: handlerChainIsAcceptable,
                followUps: {
                    allRequiredFollowUpsFound: allRequiredFollowUpsFound,
                    allFollowUpsRequiredOrAcceptable: allFollowUpsRequiredOrAcceptable,
                }
            };
            benchmarksRunsStats[benchmarkIdx].push(stats);
        }
    }

    private async _benchmarkStats(_userContent: string, _ctx: vscode.ChatAgentContext, progress: vscode.Progress<vscode.ChatAgentExtendedProgress>, _token: vscode.CancellationToken): Promise<SlashCommandHandlerResult> {
        benchmarks.forEach((benchmark, benchmarkIdx) => {
            const benchmarkRunStats = benchmarksRunsStats[benchmarkIdx];

            const numRuns = benchmarkRunStats.length;
            const avgTime = benchmarkRunStats.reduce((acc, curr) => acc + curr.endTime - curr.startTime, 0) / numRuns;
            const handlerChainValidCount = benchmarkRunStats.filter((runStat) => runStat.handlerChainValid).length;
            const allRequiredFollowUpsFoundCount = benchmarkRunStats.filter((runStat) => runStat.followUps.allRequiredFollowUpsFound).length;
            const allFollowUpsRequiredOrAcceptableCount = benchmarkRunStats.filter((runStat) => runStat.followUps.allFollowUpsRequiredOrAcceptable).length;

            const handlerChainValidPercentage = handlerChainValidCount / numRuns;
            const allRequiredFollowUpsFoundPercentage = allRequiredFollowUpsFoundCount / numRuns;
            const allFollowUpsRequiredOrAcceptablePercentage = allFollowUpsRequiredOrAcceptableCount / numRuns;
            const statsString = `📋 Benchmark (${benchmarkIdx}/${benchmarks.length}): ${benchmark.name}\n` +
                `🔁 Number of runs: ${numRuns}\n` +
                `⏱️ Average time to complete benchmark: ${avgTime}ms\n` +
                `🔍 Handler chain valid: ${handlerChainValidCount} (${getColorEmojiForPercentage(handlerChainValidPercentage)} ${handlerChainValidPercentage * 100}%)\n` +
                `🔍 All required follow ups found: ${allRequiredFollowUpsFoundCount} (${getColorEmojiForPercentage(allRequiredFollowUpsFoundPercentage)} ${allRequiredFollowUpsFoundPercentage * 100}%)\n` +
                `🔍 All follow ups required or acceptable: ${allFollowUpsRequiredOrAcceptableCount} (${getColorEmojiForPercentage(allFollowUpsRequiredOrAcceptablePercentage)} ${allFollowUpsRequiredOrAcceptablePercentage * 100}%)\n`;

            this._debugBenchmarking(progress, statsString);
        });
        return {
            chatAgentResult: {},
            followUp: [],
        };
    }

    private _getBenchmarkSlashCommand(): SlashCommand {
        const config: SlashCommandConfig = {
            shortDescription: "",
            longDescription: "",
            determineCommandDescription: "",
            handler: (userContent: string, ctx: vscode.ChatAgentContext, progress: vscode.Progress<vscode.ChatAgentExtendedProgress>, token: vscode.CancellationToken) => this._benchmarkAgent(userContent, ctx, progress, token),
        };
        return [benchmarkCommandName, config];
    }

    private _getBenchmarkStatsSlashCommand(): SlashCommand {
        const config: SlashCommandConfig = {
            shortDescription: "",
            longDescription: "",
            determineCommandDescription: "",
            handler: (userContent: string, ctx: vscode.ChatAgentContext, progress: vscode.Progress<vscode.ChatAgentExtendedProgress>, token: vscode.CancellationToken) => this._benchmarkStats(userContent, ctx, progress, token),
        };
        return [benchmarkStatsCommandName, config];
    }

    private _debugBenchmarking(progress: vscode.Progress<vscode.ChatAgentExtendedProgress>, msg: string) {
        const lines = msg.trim().split("\n");
        progress.report({ content: "\n```" });
        for (const line of lines) {
            progress.report({ content: `\n${line}` });
        }
        progress.report({ content: "\n```\n\n" });
    }

    private _validateHandlerChain(handlerChain: string[], acceptableHandlerChains: string[][]): boolean {
        return acceptableHandlerChains.some((acceptableHandlerChain) => acceptableHandlerChain.every((acceptableHandler, index) => acceptableHandler === handlerChain[index]));
    }

    private _validateFollowUps(followUps: vscode.ChatAgentFollowup[], followUpValidation: NonNullable<AgentBenchmark["followUps"]>): { allFollowUpsRequiredOrAcceptable: boolean, allRequiredFollowUpsFound: boolean } {
        let allFollowUpsRequiredOrAcceptable = true;
        const foundRequiredFollowUps: boolean[] = new Array<boolean>(followUpValidation.required.length).fill(false);
        for (const followUp of followUps) {
            if (followUpIsCommandFollowUp(followUp)) {
                const requiredFollowUpIndex = followUpValidation.required.findIndex((requiredFollowUp) => requiredFollowUp.type === "command" && requiredFollowUp.commandId === followUp.commandId);
                if (requiredFollowUpIndex !== -1) {
                    foundRequiredFollowUps[requiredFollowUpIndex] = true;
                } else {
                    const acceptableFollowUpIndex = followUpValidation.acceptable.findIndex((acceptableFollowUp) => acceptableFollowUp.type === "command" && acceptableFollowUp.commandId === followUp.commandId);
                    if (acceptableFollowUpIndex === -1) {
                        allFollowUpsRequiredOrAcceptable = false;
                    }
                }
            } else {
                const requiredFollowUpIndex = followUpValidation.required.findIndex((requiredFollowUp) => requiredFollowUp.type === "reply" && followUp.message.includes(requiredFollowUp.message));
                if (requiredFollowUpIndex !== -1) {
                    foundRequiredFollowUps[requiredFollowUpIndex] = true;
                } else {
                    const acceptableFollowUpIndex = followUpValidation.acceptable.findIndex((acceptableFollowUp) => acceptableFollowUp.type === "reply" && followUp.message.includes(acceptableFollowUp.message));
                    if (acceptableFollowUpIndex === -1) {
                        allFollowUpsRequiredOrAcceptable = false;
                    }
                }
            }
        }
        const allRequiredFollowUpsFound = foundRequiredFollowUps.every((foundRequiredFollowUp) => foundRequiredFollowUp);

        return {
            allFollowUpsRequiredOrAcceptable: allFollowUpsRequiredOrAcceptable,
            allRequiredFollowUpsFound: allRequiredFollowUpsFound
        };
    }
}

function followUpIsCommandFollowUp(followUp: vscode.ChatAgentFollowup): followUp is vscode.ChatAgentCommandFollowup {
    return !!(followUp as vscode.ChatAgentCommandFollowup).commandId;
}

function getColorEmojiForPercentage(percentage: number): string {
    if (percentage >= 0.9) {
        return "🟢";
    } else if (percentage >= 0.8) {
        return "🟡";
    } else {
        return "🔴";
    }
}
